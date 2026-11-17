import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { Config } from './config';
import { Store, User } from './store';
import { HttpError } from './policy';
import { AuthFlow, IdentityProvider } from './oidc';
import { documentKinds } from '../src/models/schema';
declare module 'express-session' { interface SessionData {userId?:string; csrf?:string; flow?:AuthFlow} }
declare global { namespace Express { interface Request { mbUser?:User } } }
const asyncMiddleware = (fn:(req:Request,res:Response,next:NextFunction)=>Promise<unknown>) =>
  (req:Request,res:Response,next:NextFunction) => { void fn(req,res,next).catch(next); };
const regenerate = (req:Request) => new Promise<void>((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
const saveSession = (req:Request) => new Promise<void>((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));

export function createApp(config:Config, store:Store, provider:IdentityProvider) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy',1);
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],
    imgSrc:["'self'",'data:'],connectSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:config.production?[]:null}}}));
  app.get('/healthz',asyncMiddleware(async(_req,res)=>{
    try { await store.pool.query('SELECT 1'); res.json({status:'ok'}); }
    catch {res.status(503).json({status:'unavailable'});}
  }));
  const SessionStore = pgSession(session);
  app.use(session({name:'mb.sid',secret:config.sessionSecret,resave:false,saveUninitialized:false,
    store:new SessionStore({pool:store.pool,tableName:'mb_sessions',createTableIfMissing:false}),
    cookie:{httpOnly:true,secure:config.production,sameSite:'lax',maxAge:8*60*60*1000}}));
  app.use(['/api','/auth'],(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  app.use(express.json({limit:'8mb'}));
  app.use(['/auth/login','/auth/callback'],rateLimit({windowMs:10*60*1000,limit:60,standardHeaders:'draft-7',legacyHeaders:false}));
  app.use('/api',rateLimit({windowMs:60*1000,limit:180,standardHeaders:'draft-7',legacyHeaders:false}));
  app.get('/auth/login',asyncMiddleware(async(req,res)=>{
    const start = await provider.begin();
    await regenerate(req); req.session.flow=start.flow; await saveSession(req); res.redirect(start.url);
  }));
  app.get('/auth/callback',asyncMiddleware(async(req,res)=>{
    const flow=req.session.flow; delete req.session.flow;
    // Consume state before exchanging the code, including on failed callbacks.
    await saveSession(req);
    if (!flow) throw new HttpError(401,'Missing login session; sign in again');
    const identity=await provider.callback(new URL(req.originalUrl,config.origin),flow);
    if(identity.tid.toLowerCase()!==config.tenantId) throw new HttpError(401,'Tenant mismatch');
    const user=await store.identity(identity.tid,identity.oid,identity.name,identity.email);
    await regenerate(req); req.session.userId=user.id; req.session.csrf=randomBytes(32).toString('hex');
    await saveSession(req); res.redirect('/');
  }));
  const isAdmin=(user:User)=>config.adminObjectIds.includes(user.object_id.toLowerCase())&&user.tenant_id===config.tenantId;
  const effectiveUser=(user:User):User=>isAdmin(user)?{...user,status:'approved',role:'editor'}:user;
  const authenticated=asyncMiddleware(async(req,_res,next)=>{
    const user=req.session.userId?await store.user(req.session.userId):undefined;
    if(!user) throw new HttpError(401,'Sign in required');
    req.mbUser=effectiveUser(user); next();
  });
  const csrf=(req:Request,_res:Response,next:NextFunction) => {
    const token=req.get('X-CSRF-Token')||''; const expected=req.session.csrf||'';
    if(req.get('Origin')!==config.origin || !token || !expected || token.length!==expected.length ||
      !timingSafeEqual(Buffer.from(token),Buffer.from(expected))) return next(new HttpError(403,'Invalid request origin or CSRF token'));
    next();
  };
  const approved=(req:Request,_res:Response,next:NextFunction)=>{
    if(req.mbUser?.status!=='approved') return next(new HttpError(403,'Access approval required')); next();
  };
  const editor=(req:Request,_res:Response,next:NextFunction)=>{
    if(req.mbUser?.role!=='editor') return next(new HttpError(403,'Editor permission required')); next();
  };
  const admin=(req:Request,_res:Response,next:NextFunction)=>{
    if(!req.mbUser||!isAdmin(req.mbUser)) return next(new HttpError(403,'Approver permission required')); next();
  };
  app.get('/api/session',authenticated,(req,res)=>res.json({user:req.mbUser,csrf:req.session.csrf,isAdmin:isAdmin(req.mbUser!)}));
  app.post('/auth/logout',authenticated,csrf,asyncMiddleware(async(req,res)=>{
    await new Promise<void>((resolve,reject)=>req.session.destroy(e=>e?reject(e):resolve()));
    res.clearCookie('mb.sid',{httpOnly:true,secure:config.production,sameSite:'lax'}); res.json({ok:true});
  }));
  app.post('/api/access-request',authenticated,csrf,asyncMiddleware(async(req,res)=>{
    const {role}=z.object({role:z.enum(['viewer','editor'])}).strict().parse(req.body);
    await store.request(req.mbUser!.id,role); res.status(201).json({ok:true});
  }));
  app.get('/api/admin/users',authenticated,admin,asyncMiddleware(async(_req,res)=>{
    res.json((await store.pool.query(`SELECT id,display_name,email,status,role,requested_role,requested_at,decided_at FROM mb_users ORDER BY requested_at DESC NULLS LAST,created_at DESC`)).rows);
  }));
  app.put('/api/admin/users/:id',authenticated,csrf,admin,asyncMiddleware(async(req,res)=>{
    const id=z.uuid().parse(req.params.id);
    const {role}=z.object({role:z.enum(['viewer','editor']).nullable()}).strict().parse(req.body);
    await store.decide(req.mbUser!,id,role); res.json({ok:true});
  }));
  app.get('/api/data',authenticated,approved,asyncMiddleware(async(_req,res)=>res.json(await store.snapshot())));
  app.put('/api/data',authenticated,csrf,approved,editor,asyncMiddleware(async(req,res)=>{
    const input=z.object({token:z.string().regex(/^\d+$/),data:z.unknown()}).strict().parse(req.body);
    const result=await store.save(req.mbUser!,input.token,input.data,effectiveUser);
    if(result.conflict) return res.status(409).json(result.conflict);
    res.json(result.snapshot);
  }));
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:1,fields:3,fieldSize:500}});
  app.post('/api/documents',authenticated,csrf,approved,editor,upload.single('file'),asyncMiddleware(async(req,res)=>{
    const {itemId,kind,revision}=z.object({itemId:z.string().regex(/^[LBAU]-\d{3,}$/),kind:z.enum(documentKinds),revision:z.string().trim().min(1).max(100)}).strict().parse(req.body);
    const file=req.file;
    if(!file || file.size<8 || file.buffer.subarray(0,5).toString()!=='%PDF-' ||
      !/^[^\\/]{1,180}\.pdf$/i.test(file.originalname) || file.originalname.includes('..') || /[\x00-\x1f]/.test(file.originalname))
      throw new HttpError(400,'A valid PDF up to 20 MB is required');
    const snapshot=await store.snapshot();
    if(!snapshot.data.items.some(i=>i.id===itemId)) throw new HttpError(404,'Item not found');
    const id=randomUUID(), storageName=`${id}.pdf`;
    await mkdir(config.uploadDir,{recursive:true});
    const target=path.resolve(config.uploadDir,storageName);
    await writeFile(target,file.buffer,{flag:'wx'});
    try {
      await store.transaction(async c=>{
        const {rows:[current]}=await c.query('SELECT * FROM mb_users WHERE id=$1 FOR SHARE',[req.mbUser!.id]);
        if(!current || effectiveUser(current).status!=='approved'||effectiveUser(current).role!=='editor') throw new HttpError(403,'Editor permission required');
        await c.query(`INSERT INTO mb_documents(id,item_id,kind,revision,original_name,storage_name,size_bytes,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id,itemId,kind,revision,file.originalname,storageName,file.size,req.mbUser!.id]);
        await c.query('INSERT INTO mb_audit(actor_id,action,details) VALUES($1,$2,$3)',[req.mbUser!.id,'document.upload',{id,itemId,kind,revision}]);
      });
    } catch(e) {await unlink(target); throw e;}
    res.status(201).json({url:`/api/documents/${id}`});
  }));
  app.get('/api/documents/:id',authenticated,approved,asyncMiddleware(async(req,res)=>{
    const id=z.uuid().parse(req.params.id);
    const {rows:[doc]}=await store.pool.query('SELECT * FROM mb_documents WHERE id=$1',[id]);
    if(!doc) throw new HttpError(404,'Document not found');
    const snapshot=await store.snapshot();
    if(!snapshot.data.documentMetadata.some(m=>m.url===`/api/documents/${id}`) && doc.uploaded_by!==req.mbUser!.id && !isAdmin(req.mbUser!))
      throw new HttpError(404,'Document is not attached');
    res.setHeader('Content-Type','application/pdf'); res.attachment(doc.original_name);
    res.sendFile(path.resolve(config.uploadDir,doc.storage_name));
  }));
  app.use('/api',(_req,_res,next)=>next(new HttpError(404,'API route not found')));
  app.use(express.static(path.resolve('dist-web'),{index:false}));
  app.get('/{*path}',(_req,res)=>res.sendFile(path.resolve('dist-web/index.html')));
  app.use((err:unknown,_req:Request,res:Response,_next:NextFunction)=>{
    if(err instanceof HttpError) return res.status(err.status).json({error:err.message});
    if(err instanceof z.ZodError) return res.status(400).json({error:err.issues.map(i=>i.message).join('; ')});
    if(err instanceof multer.MulterError) return res.status(400).json({error:'Upload rejected: PDF limit is 20 MB'});
    if((err as {type?:string})?.type==='entity.too.large') return res.status(413).json({error:'Request too large'});
    // Do not serialize provider/database errors: they may contain credentials or tokens.
    console.error('Request failed',err instanceof Error?err.name:'UnknownError');
    res.status(500).json({error:'ไม่สามารถดำเนินการได้ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแล'});
  });
  return app;
}
