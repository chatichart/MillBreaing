import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { Config } from './config';
import { Store } from './store';
import { HttpError, validateChange } from './policy';
import { initialData } from '../src/domain/initialItems';
import { z } from 'zod';

export async function initializeDemo(store:Store):Promise<void> {
  await store.pool.query(`CREATE TABLE IF NOT EXISTS mb_demo_projects(id text PRIMARY KEY, revision integer NOT NULL DEFAULT 0, data jsonb NOT NULL)`);
  await store.pool.query('INSERT INTO mb_demo_projects(id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',['MILL-BEARING',initialData()]);
}
export function demoApp(config:Config,store:Store) {
  const app=express(); app.disable('x-powered-by'); app.set('trust proxy',1);
  app.use(helmet({contentSecurityPolicy:{directives:{scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],
    upgradeInsecureRequests:config.production?[]:null}}}));
  app.use('/api',rateLimit({windowMs:60000,limit:90,standardHeaders:'draft-7',legacyHeaders:false}));
  app.use(express.json({limit:'8mb'}));
  app.use('/api',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  app.get('/healthz',async(_req,res)=>{
    try {await store.pool.query('SELECT 1');res.json({status:'ok',mode:'demo'});}
    catch {res.status(503).json({status:'unavailable'});}
  });
  app.get('/api/session',(_req,res)=>res.json({demo:true,csrf:'demo-origin-protected',isAdmin:false,
    user:{id:'demo',display_name:'Public Demo',status:'approved',role:config.demoMode==='editor'?'editor':'viewer'}}));
  app.get('/api/data',async(_req,res,next)=>{
    try {const {rows:[row]}=await store.pool.query('SELECT data,revision FROM mb_demo_projects WHERE id=$1',['MILL-BEARING']);
      res.json({data:row.data,token:String(row.revision)});
    } catch(e){next(e);}
  });
  app.put('/api/data',async(req,res,next)=>{
    try {
      if(config.demoMode!=='editor') throw new HttpError(403,'Editor permission required');
      if(req.get('Origin')!==config.origin || req.get('X-CSRF-Token')!=='demo-origin-protected') throw new HttpError(403,'Invalid request origin');
      const input=z.object({token:z.string().regex(/^\d+$/),data:z.unknown()}).strict().parse(req.body);
      const result=await store.transaction(async c=>{
        const {rows:[row]}=await c.query('SELECT data,revision FROM mb_demo_projects WHERE id=$1 FOR UPDATE',['MILL-BEARING']);
        if(String(row.revision)!==input.token) return {conflict:true,snapshot:{data:row.data,token:String(row.revision)}};
        const data=validateChange(row.data,input.data,'editor');
        // Public trial deliberately does not accept uploaded or external documents.
        if(data.documentMetadata.length) throw new HttpError(400,'Document upload requires Entra-protected mode');
        data.revision=row.revision+1;
        const at=new Date().toISOString();
        const changed=data.items.filter(i=>!isDeepStrictEqual(i,row.data.items.find((old:{id:string})=>old.id===i.id)));
        data.auditEvents=[...row.data.auditEvents,...changed.map(i=>({id:randomUUID(),at,by:'Public Demo',entityId:i.id,
          action:'Public demo item update',before:JSON.stringify(row.data.items.find((old:{id:string})=>old.id===i.id)||null),after:JSON.stringify(i)})),
          {id:randomUUID(),at,by:'Public Demo',
          entityId:'MILL-BEARING',action:'Public demo update',before:String(row.revision),after:String(data.revision)}];
        await c.query('UPDATE mb_demo_projects SET data=$2,revision=$3 WHERE id=$1',['MILL-BEARING',data,data.revision]);
        return {conflict:false,snapshot:{data,token:String(data.revision)}};
      });
      res.status(result.conflict?409:200).json(result.snapshot);
    }catch(e){next(e);}
  });
  app.use('/api',(_req,res)=>res.status(403).json({error:'ฟังก์ชันนี้ใช้ได้หลังเปิด Entra ID เท่านั้น'}));
  app.use(express.static(path.resolve('dist-web'),{index:false}));
  app.get('/{*path}',(_req,res)=>res.sendFile(path.resolve('dist-web/index.html')));
  app.use((err:unknown,_req:Request,res:Response,_next:NextFunction)=>{
    if(err instanceof HttpError) return res.status(err.status).json({error:err.message});
    if(err instanceof z.ZodError) return res.status(400).json({error:err.issues.map(i=>i.message).join('; ')});
    if((err as {type?:string})?.type==='entity.too.large') return res.status(413).json({error:'Request too large'});
    console.error('Demo request failed',err instanceof Error?err.name:'UnknownError');
    res.status(500).json({error:'ไม่สามารถดำเนินการได้ กรุณาลองอีกครั้ง'});
  });
  return app;
}
