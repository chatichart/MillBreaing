// @vitest-environment node
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import request from 'supertest';
import {Store,User} from '../server/store';
import {Config} from '../server/config';
import {createApp} from '../server/app';
import {demoApp,initializeDemo} from '../server/demo';
import {IdentityProvider} from '../server/oidc';

describe('PostgreSQL + HTTP authorization and concurrency',()=>{
  let pg:EmbeddedPostgres,pool:Pool,store:Store,admin:User,editor:User,viewer:User,pending:User;
  let config:Config;
  const tid=randomUUID();
  beforeAll(async()=>{
    const dir=await mkdtemp(path.join(tmpdir(),'mill-bearing-test-'));
    const password=randomUUID();
    pg=new EmbeddedPostgres({databaseDir:path.join(dir,'pg'),user:'postgres',password,port:55439,persistent:true,
      initdbFlags:['--encoding=UTF8','--locale=C'],onLog:()=>{},onError:()=>{}});
    await pg.initialise();await pg.start();
    pool=new Pool({connectionString:`postgresql://postgres:${password}@127.0.0.1:55439/postgres`,max:6});
    store=new Store(pool);
    await pool.query(await readFile('server/migrations/001_initial.sql','utf8'));await store.seed();
    admin=await store.identity(tid,randomUUID(),'Approver','admin@example.test');
    editor=await store.identity(tid,randomUUID(),'Editor','editor@example.test');
    viewer=await store.identity(tid,randomUUID(),'Viewer','viewer@example.test');
    pending=await store.identity(tid,randomUUID(),'Pending','pending@example.test');
    await store.decide(admin,editor.id,'editor');await store.decide(admin,viewer.id,'viewer');
    editor=(await store.user(editor.id))!;viewer=(await store.user(viewer.id))!;
    config={production:false,demoMode:'off',port:3000,origin:'http://127.0.0.1:3000',databaseUrl:'',sessionSecret:randomUUID(),
      tenantId:tid,clientId:randomUUID(),clientSecret:'test-only',adminObjectIds:[admin.object_id],uploadDir:path.join(dir,'uploads'),dbSsl:false};
  },60000);
  afterAll(async()=>{await pool?.end();await pg?.stop();},30000);
  const login=async(user:User)=>{
    const provider:IdentityProvider={async begin(){return{url:'/auth/callback?code=test',flow:{state:'s',nonce:'n',verifier:'v',createdAt:Date.now()}};},
      async callback(){return{tid,oid:user.object_id,name:user.display_name,email:user.email};}};
    const app=createApp(config,store,provider),agent=request.agent(app);
    await agent.get('/auth/login').expect(302);await agent.get('/auth/callback?code=test').expect(302);
    const session=(await agent.get('/api/session').expect(200)).body;
    return {agent,csrf:session.csrf,app};
  };
  it('requires approval, rejects Viewer writes, and rejects CSRF',async()=>{
    const p=await login(pending),v=await login(viewer),e=await login(editor);
    await request(e.app).get('/api/data').expect(401);
    await p.agent.get('/api/data').expect(403);
    await p.agent.get(`/api/documents/${randomUUID()}`).expect(403);
    const base=(await v.agent.get('/api/data').expect(200)).body;
    await v.agent.put('/api/data').set('Origin',config.origin).set('X-CSRF-Token',v.csrf).send(base).expect(403);
    await v.agent.post('/api/documents').set('Origin',config.origin).set('X-CSRF-Token',v.csrf).expect(403);
    await e.agent.put('/api/data').send(base).expect(403);
  });
  it('allows requests and only configured approvers can approve; revocation applies immediately',async()=>{
    const p=await login(pending),a=await login(admin),v=await login(viewer);
    await p.agent.post('/api/access-request').set('Origin',config.origin).set('X-CSRF-Token',p.csrf).send({role:'editor'}).expect(201);
    await p.agent.get('/api/data').expect(403);
    await v.agent.put(`/api/admin/users/${pending.id}`).set('Origin',config.origin).set('X-CSRF-Token',v.csrf).send({role:'editor'}).expect(403);
    await a.agent.put(`/api/admin/users/${pending.id}`).set('Origin',config.origin).set('X-CSRF-Token',a.csrf).send({role:'viewer'}).expect(200);
    await p.agent.get('/api/data').expect(200);
    await a.agent.put(`/api/admin/users/${pending.id}`).set('Origin',config.origin).set('X-CSRF-Token',a.csrf).send({role:null}).expect(200);
    await p.agent.get('/api/data').expect(403);
  });
  it('gives configured admins immediate editor access and removes the override when unlisted',async()=>{
    const a=await login(admin);
    const session=(await a.agent.get('/api/session').expect(200)).body;
    expect(session.user.status).toBe('approved');expect(session.user.role).toBe('editor');
    const base=(await a.agent.get('/api/data').expect(200)).body;
    await a.agent.put('/api/data').send(base).expect(403);
    await a.agent.put('/api/data').set('Origin',config.origin).set('X-CSRF-Token',a.csrf).send(base).expect(200);
    const uploaded=await a.agent.post('/api/documents').set('Origin',config.origin).set('X-CSRF-Token',a.csrf)
      .field('itemId','L-001').field('kind','OTHER').field('revision','admin').attach('file',Buffer.from('%PDF-1.7\ntest pdf\n%%EOF'),'admin.pdf').expect(201);
    await a.agent.get(uploaded.body.url).expect(200);
    expect((await store.user(admin.id))!.status).toBe('new');
    const ids=config.adminObjectIds;config.adminObjectIds=[];
    try {
      expect((await a.agent.get('/api/session').expect(200)).body.user.role).toBeNull();
      await a.agent.get('/api/data').expect(403);
      await a.agent.get(uploaded.body.url).expect(403);
      await a.agent.put('/api/data').set('Origin',config.origin).set('X-CSRF-Token',a.csrf).send(base).expect(403);
      await a.agent.get('/api/admin/users').expect(403);
    } finally {config.adminObjectIds=ids;}
  });
  it('commits exactly one simultaneous edit and rejects the stale writer',async()=>{
    const base=await store.snapshot(),a=structuredClone(base.data),b=structuredClone(base.data);
    a.items[0].baseline.castingDate='2026-11-16';b.items[1].baseline.castingDate='2026-11-17';
    const results=await Promise.all([store.save(editor,base.token,a),store.save(editor,base.token,b)]);
    expect(results.filter(r=>r.snapshot)).toHaveLength(1);expect(results.filter(r=>r.conflict)).toHaveLength(1);
    const latest=await store.snapshot();expect(Number(latest.token)).toBe(Number(base.token)+1);
    expect(latest.data.items.filter(i=>i.baseline.castingDate)).toHaveLength(1);
    expect(latest.data.auditEvents.slice(base.data.auditEvents.length).every(e=>e.by==='Editor')).toBe(true);
    await store.seed();expect((await store.snapshot()).token).toBe(latest.token);
  });
  it('validates PDFs, binds metadata, and protects download after revocation',async()=>{
    const e=await login(editor),v=await login(viewer);
    await e.agent.post('/api/documents').set('Origin',config.origin).set('X-CSRF-Token',e.csrf)
      .field('itemId','L-001').field('kind','OTHER').field('revision','1').attach('file',Buffer.from('not a pdf'),'bad.pdf').expect(400);
    const uploaded=await e.agent.post('/api/documents').set('Origin',config.origin).set('X-CSRF-Token',e.csrf)
      .field('itemId','L-001').field('kind','OTHER').field('revision','1').attach('file',Buffer.from('%PDF-1.7\ntest pdf\n%%EOF'),'test.pdf').expect(201);
    await v.agent.get(uploaded.body.url).expect(404);
    const base=await store.snapshot(),next=structuredClone(base.data);
    next.documentMetadata.push({id:randomUUID(),itemId:'L-001',kind:'OTHER',revision:'1',name:'test.pdf',url:uploaded.body.url,uploadedAt:'forged',uploadedBy:'forged'});
    await e.agent.put('/api/data').set('Origin',config.origin).set('X-CSRF-Token',e.csrf).send({token:base.token,data:next}).expect(200);
    const persisted=await store.snapshot();expect(persisted.data.documentMetadata[0].uploadedBy).toBe('Editor');
    await v.agent.get(uploaded.body.url).expect(200);
    await store.decide(admin,viewer.id,null);await v.agent.get(uploaded.body.url).expect(403);
    await store.decide(admin,viewer.id,'viewer');
  });
  it('preserves Thai PDF filenames through upload and metadata attachment',async()=>{
    const e=await login(editor),name='รายชื่อผู้รับเหมางานก่อสร้างภายในโรงงาน.pdf';
    const uploaded=await e.agent.post('/api/documents').set('Origin',config.origin).set('X-CSRF-Token',e.csrf)
      .field('itemId','L-001').field('kind','MATERIAL_CERT').field('revision','1')
      .attach('file',Buffer.from('%PDF-1.7\nThai filename test\n%%EOF'),name).expect(201);
    const id=uploaded.body.url.split('/').pop();
    expect((await pool.query('SELECT original_name FROM mb_documents WHERE id=$1',[id])).rows[0].original_name).toBe(name);
    const base=await store.snapshot(),next=structuredClone(base.data);
    next.documentMetadata.push({id:randomUUID(),itemId:'L-001',kind:'MATERIAL_CERT',revision:'1',name,url:uploaded.body.url,uploadedAt:'',uploadedBy:''});
    await e.agent.put('/api/data').set('Origin',config.origin).set('X-CSRF-Token',e.csrf).send({token:base.token,data:next}).expect(200);
    await e.agent.get(uploaded.body.url).expect(200);
  });
  it('deletes attachments only for editors with CSRF and the current project revision',async()=>{
    const e=await login(editor),v=await login(viewer);
    const uploaded=await e.agent.post('/api/documents').set('Origin',config.origin).set('X-CSRF-Token',e.csrf)
      .field('itemId','L-001').field('kind','OTHER').field('revision','delete-test')
      .attach('file',Buffer.from('%PDF-1.7\ndelete test\n%%EOF'),'delete-test.pdf').expect(201);
    const base=await store.snapshot(),next=structuredClone(base.data);
    const meta={id:randomUUID(),itemId:'L-001',kind:'OTHER' as const,revision:'delete-test',name:'delete-test.pdf',url:uploaded.body.url,uploadedAt:'',uploadedBy:''};
    next.documentMetadata.push(meta);
    const attached=(await e.agent.put('/api/data').set('Origin',config.origin).set('X-CSRF-Token',e.csrf).send({token:base.token,data:next}).expect(200)).body;
    await v.agent.delete(uploaded.body.url).set('Origin',config.origin).set('X-CSRF-Token',v.csrf).send({token:attached.token}).expect(403);
    await e.agent.delete(uploaded.body.url).send({token:attached.token}).expect(403);
    await e.agent.delete(uploaded.body.url).set('Origin',config.origin).set('X-CSRF-Token',e.csrf).send({token:base.token}).expect(409);
    await e.agent.get(uploaded.body.url).expect(200);
    const removed=(await e.agent.delete(uploaded.body.url).set('Origin',config.origin).set('X-CSRF-Token',e.csrf).send({token:attached.token}).expect(200)).body;
    expect(removed.data.documentMetadata.some((m:any)=>m.url===uploaded.body.url)).toBe(false);
    expect(removed.data.auditEvents.some((a:any)=>a.action==='Document removed'&&a.by==='Editor')).toBe(true);
    await e.agent.get(uploaded.body.url).expect(404);
    const forged=structuredClone(removed.data);forged.documentMetadata.push(meta);
    await e.agent.put('/api/data').set('Origin',config.origin).set('X-CSRF-Token',e.csrf).send({token:removed.token,data:forged}).expect(400);
  });
  it('persists delivery actual without manufacturing prerequisites through the API',async()=>{
    const e=await login(editor),base=await store.snapshot(),next=structuredClone(base.data);
    const item=next.items.find(i=>i.id==='U-001')!;
    item.actual.deliveryDate='2026-11-17';
    expect(item.actual.finishingDate).toBeNull();expect(item.actual.qcDate).toBeNull();
    const saved=(await e.agent.put('/api/data').set('Origin',config.origin).set('X-CSRF-Token',e.csrf).send({token:base.token,data:next}).expect(200)).body;
    expect(saved.data.items.find((i:any)=>i.id===item.id).actual.deliveryDate).toBe('2026-11-17');
    expect((await store.snapshot()).data.items.find(i=>i.id===item.id)!.actual.qcDate).toBeNull();
  });
  it('isolates public trial edits, blocks cross-origin writes, and has conflict protection',async()=>{
    await initializeDemo(store);const demo=demoApp({...config,demoMode:'editor'},store);
    const before=await store.snapshot();const base=(await request(demo).get('/api/data').expect(200)).body;
    expect(base.data.items).toHaveLength(100);expect(base.data.items.every((i:any)=>!i.actual.deliveryDate)).toBe(true);
    base.data.items[0].baseline.castingDate='2026-11-16';
    await request(demo).put('/api/data').send(base).expect(403);
    await request(demo).put('/api/data').set('Origin',config.origin).set('X-CSRF-Token','demo-origin-protected').send(base).expect(200);
    const saved=(await request(demo).get('/api/data').expect(200)).body;
    expect(saved.data.auditEvents.some((e:any)=>e.entityId==='L-001'&&e.before.includes('null')&&e.after.includes('2026-11-16'))).toBe(true);
    await request(demo).put('/api/data').set('Origin',config.origin).set('X-CSRF-Token','demo-origin-protected').send(base).expect(409);
    await request(demo).post('/api/documents').expect(403);await request(demo).get('/api/admin/users').expect(403);
    expect(await store.snapshot()).toEqual(before);
  });
});
