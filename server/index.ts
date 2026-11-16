import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { readConfig } from './config';
import { Store } from './store';
import { createApp } from './app';
import { entraProvider } from './oidc';
import { initializeDemo, demoApp } from './demo';
const config=readConfig();
const pool=new Pool({connectionString:config.databaseUrl,max:10,connectionTimeoutMillis:10000,
  ssl:config.dbSsl?{rejectUnauthorized:true}:undefined});
pool.on('error',()=>console.error('Unexpected database connection error'));
const store=new Store(pool);
if(config.demoMode==='off') await store.transaction(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(710161100)');
  await c.query(await readFile('server/migrations/001_initial.sql','utf8'));
  await c.query('INSERT INTO mb_projects(id,data) VALUES($1,$2) ON CONFLICT DO NOTHING', ['MILL-BEARING',(await import('../src/domain/initialItems')).initialData()]);
});
if(config.demoMode!=='off') await initializeDemo(store);
const app=config.demoMode==='off'?createApp(config,store,await entraProvider(config)):demoApp(config,store);
const server=app.listen(config.port,'0.0.0.0',()=>console.log(`Mill Bearing listening on port ${config.port}; mode=${config.demoMode==='off'?'entra':config.demoMode}`));
for(const signal of ['SIGTERM','SIGINT'] as const) process.on(signal,()=>{
  server.close(()=>{void pool.end().then(()=>process.exit(0));});
  setTimeout(()=>process.exit(1),10000).unref();
});
