import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Pool, PoolClient } from 'pg';
import { initialData } from '../src/domain/initialItems';
import { AppData } from '../src/models/schema';
import { HttpError, validateChange } from './policy';
export interface User {id:string; tenant_id:string; object_id:string; display_name:string; email:string;
  role:'viewer'|'editor'|null; status:'new'|'pending'|'approved'|'denied'; requested_role:string|null}
export class Store {
  constructor(public pool: Pool) {}
  async seed(): Promise<void> {
    await this.pool.query('INSERT INTO mb_projects(id,data) VALUES($1,$2) ON CONFLICT DO NOTHING', ['MILL-BEARING', initialData()]);
  }
  async identity(tid:string, oid:string, name:string, email:string): Promise<User> {
    const result = await this.pool.query(`INSERT INTO mb_users(id,tenant_id,object_id,display_name,email) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(tenant_id,object_id) DO UPDATE SET display_name=excluded.display_name,email=excluded.email RETURNING *`,
      [randomUUID(),tid,oid,name,email]);
    return result.rows[0];
  }
  async user(id:string): Promise<User|undefined> {
    return (await this.pool.query('SELECT * FROM mb_users WHERE id=$1',[id])).rows[0];
  }
  async transaction<T>(run:(client:PoolClient)=>Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try { await c.query('BEGIN'); const result = await run(c); await c.query('COMMIT'); return result; }
    catch(e) { await c.query('ROLLBACK'); throw e; } finally {c.release();}
  }
  async snapshot() {
    const {rows:[row]} = await this.pool.query('SELECT data,revision FROM mb_projects WHERE id=$1',['MILL-BEARING']);
    return {data:row.data as AppData, token:String(row.revision)};
  }
  async request(id:string, role:string): Promise<void> {
    await this.transaction(async c => {
      const r = await c.query(`UPDATE mb_users SET status='pending',requested_role=$2,requested_at=now()
        WHERE id=$1 AND status IN ('new','denied') RETURNING id`,[id,role]);
      if (!r.rowCount) throw new HttpError(409,'Request already pending or approved');
      await c.query('INSERT INTO mb_audit(actor_id,action,details) VALUES($1,$2,$3)',[id,'access.request',{role}]);
    });
  }
  async decide(actor:User, id:string, role:'viewer'|'editor'|null): Promise<void> {
    await this.transaction(async c => {
      const r = await c.query(`UPDATE mb_users SET status=$2,role=$3,decided_at=now(),decided_by=$4 WHERE id=$1 RETURNING id`,
        [id,role?'approved':'denied',role,actor.id]);
      if (!r.rowCount) throw new HttpError(404,'User not found');
      await c.query('INSERT INTO mb_audit(actor_id,action,details) VALUES($1,$2,$3)',[actor.id,'access.decision',{userId:id,role}]);
    });
  }
  async save(actor:User, token:string, input:unknown, resolveAccess:(user:User)=>User = user=>user) {
    return this.transaction(async c => {
      // Lock identity until commit so revocation and writes have a defined ordering.
      const {rows:[storedUser]} = await c.query('SELECT * FROM mb_users WHERE id=$1 FOR SHARE',[actor.id]);
      const currentUser = storedUser ? resolveAccess(storedUser) : undefined;
      if (currentUser?.status !== 'approved' || currentUser.role !== 'editor') throw new HttpError(403,'Editor permission required');
      const {rows:[row]} = await c.query('SELECT data,revision FROM mb_projects WHERE id=$1 FOR UPDATE',['MILL-BEARING']);
      if (String(row.revision) !== token) return {conflict:{data:row.data, token:String(row.revision)}};
      const base = row.data as AppData;
      const next = validateChange(base,input,currentUser.role);
      for (const m of next.documentMetadata.filter(m => !base.documentMetadata.some(b => b.id===m.id))) {
        const match = /^\/api\/documents\/([0-9a-f-]{36})$/.exec(m.url);
        if (!match) throw new HttpError(400,'Unknown uploaded document');
        const {rows:[doc]} = await c.query('SELECT * FROM mb_documents WHERE id=$1',[match[1]]);
        if (!doc || doc.item_id!==m.itemId || doc.kind!==m.kind || doc.revision!==m.revision || doc.original_name!==m.name)
          throw new HttpError(400,'Document does not match upload');
        if (doc.uploaded_by!==actor.id) throw new HttpError(403,'Only uploader can attach this document');
        m.uploadedBy = actor.display_name;
        m.uploadedAt = doc.uploaded_at.toISOString();
      }
      const at = new Date().toISOString();
      const changed = next.items.filter(i => !isDeepStrictEqual(i,base.items.find(b=>b.id===i.id)));
      changed.forEach(i => { i.updatedBy=actor.display_name; i.updatedAt=at; });
      next.auditEvents = [...base.auditEvents, ...changed.map(i=>({id:randomUUID(),at,by:actor.display_name,
        entityId:i.id,action:'Server-confirmed item update',before:JSON.stringify(base.items.find(b=>b.id===i.id)||null),after:JSON.stringify(i)})),
        {id:randomUUID(),at,by:actor.display_name,entityId:'MILL-BEARING',action:'Server-confirmed project update',before:String(row.revision),after:String(row.revision+1)}];
      next.revision = row.revision+1;
      await c.query('UPDATE mb_projects SET data=$2,revision=$3,updated_at=now() WHERE id=$1',['MILL-BEARING',next,next.revision]);
      await c.query('INSERT INTO mb_audit(actor_id,action,details) VALUES($1,$2,$3)',[actor.id,'project.save',{revision:next.revision,changedItems:changed.map(i=>i.id)}]);
      return {snapshot:{data:next,token:String(next.revision)}};
    });
  }
}
