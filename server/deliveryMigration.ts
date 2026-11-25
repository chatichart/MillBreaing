import {randomUUID} from 'node:crypto';
import {AppData} from '../src/models/schema';
import {today} from '../src/domain/rules';
import {Store} from './store';
export const DELIVERY_MIGRATION='future-actual-to-update-delivery-plan-v1';
export function migrateFutureDeliveries(base:AppData,asOf:string):AppData {
  const next=structuredClone(base);
  const moved=new Map<string,string>();
  for(const item of next.items){
    if(!item.actual.deliveryDate || item.actual.deliveryDate<=asOf) continue;
    const before=JSON.stringify(item),date=item.actual.deliveryDate;
    moved.set(item.id,date);item.revisedDeliveryDate=date;item.actual.deliveryDate=null;
    item.updatedAt=new Date().toISOString();item.updatedBy='Delivery plan migration';
    next.auditEvents.push({id:randomUUID(),at:item.updatedAt,by:item.updatedBy,entityId:item.id,action:DELIVERY_MIGRATION,
      before,after:JSON.stringify(item)});
  }
  if(moved.size){
    next.deliveryRecords=next.deliveryRecords.filter(r=>moved.get(r.itemId)!==r.date);
    next.revision=base.revision+1;
  }
  return next;
}
export async function runDeliveryMigration(store:Store,table:'mb_projects'|'mb_demo_projects'):Promise<void>{
  await store.transaction(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(710251101)');
    const {rows:[exists]}=await c.query('SELECT to_regclass($1) AS name',[table]);
    if(!exists.name) return;
    await c.query(`CREATE TABLE IF NOT EXISTS mb_delivery_migration_backups (
      project_table text NOT NULL,project_id text NOT NULL,migration text NOT NULL,revision integer NOT NULL,
      data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(project_table,project_id,migration,revision))`);
    const {rows}=await c.query(`SELECT id,data,revision FROM ${table} FOR UPDATE`);
    for(const row of rows){
      const next=migrateFutureDeliveries(row.data,today());
      if(next.revision===row.revision) continue;
      await c.query(`INSERT INTO mb_delivery_migration_backups(project_table,project_id,migration,revision,data)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[table,row.id,DELIVERY_MIGRATION,row.revision,row.data]);
      await c.query(`UPDATE ${table} SET data=$2,revision=$3 WHERE id=$1`,[row.id,next,next.revision]);
      console.log(`Delivery migration: ${table}/${row.id}: ${next.auditEvents.length-row.data.auditEvents.length} future Actual dates moved; backup retained`);
    }
  });
}
