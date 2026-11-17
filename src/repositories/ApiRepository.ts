import { AppData, dataSchema } from '../models/schema';
import { ConflictError, Repository, Snapshot } from './types';
export class ApiRepository implements Repository {
  readonly mode:'postgres'|'demo';
  constructor(private csrf:string, private editable:boolean, demo=false){this.mode=demo?'demo':'postgres';}
  async canWrite():Promise<boolean>{return this.editable;}
  async load():Promise<Snapshot>{
    const res=await fetch('/api/data',{credentials:'same-origin',cache:'no-store'});
    if(!res.ok) throw new Error((await res.json()).error||'โหลดข้อมูลไม่สำเร็จ');
    const s=await res.json(); return {data:dataSchema.parse(s.data),token:s.token};
  }
  async save(base:Snapshot,next:AppData):Promise<Snapshot>{
    const res=await fetch('/api/data',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':this.csrf},
      body:JSON.stringify({token:base.token,data:next})});
    const body=await res.json();
    if(res.status===409) throw new ConflictError({data:dataSchema.parse(body.data),token:body.token});
    if(!res.ok) throw new Error(body.error||'บันทึกไม่สำเร็จ');
    return {data:dataSchema.parse(body.data),token:body.token};
  }
  async deleteDocument(base:Snapshot,url:string):Promise<Snapshot>{
    if(!/^\/api\/documents\/[0-9a-f-]{36}$/.test(url)) throw new Error('Invalid document URL');
    const res=await fetch(url,{method:'DELETE',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':this.csrf},body:JSON.stringify({token:base.token})});
    const body=await res.json();
    if(res.status===409) throw new ConflictError({data:dataSchema.parse(body.data),token:body.token});
    if(!res.ok) throw new Error(body.error||'ลบเอกสารไม่สำเร็จ');
    return {data:dataSchema.parse(body.data),token:body.token};
  }
  async upload(itemId:string,file:File,kind:string,revision:string):Promise<string>{
    const form=new FormData(); form.append('itemId',itemId); form.append('kind',kind); form.append('revision',revision); form.append('file',file);
    const res=await fetch('/api/documents',{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':this.csrf},body:form});
    const body=await res.json(); if(!res.ok) throw new Error(body.error||'อัปโหลดไม่สำเร็จ'); return body.url;
  }
}
