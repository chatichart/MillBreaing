import * as React from 'react';
import {createRoot} from 'react-dom/client';
import App from './components/App';
import {ApiRepository} from './repositories/ApiRepository';
import './styles/app.css';
interface Session {csrf:string;isAdmin:boolean;demo?:boolean;user:{id:string;display_name:string;email?:string;status:string;role:string|null;requested_role?:string|null}}
interface AccessUser {id:string;display_name:string;email:string;status:string;role:string|null;requested_role:string|null}
function Portal(){
  const [session,setSession]=React.useState<Session|null>(null),[loading,setLoading]=React.useState(true),[error,setError]=React.useState('');
  const [role,setRole]=React.useState('viewer'),[users,setUsers]=React.useState<AccessUser[]>([]);
  const [busy,setBusy]=React.useState(false);
  const refresh=async()=>{
    try{setError('');const r=await fetch('/api/session',{cache:'no-store'});if(r.status===401){setSession(null);return;}
      if(!r.ok)throw new Error('โหลดสถานะผู้ใช้ไม่ได้');setSession(await r.json());}
    catch(e){setError(String(e));}finally{setLoading(false);}
  };
  React.useEffect(()=>{void refresh();},[]);
  const repo=React.useMemo(()=>session?new ApiRepository(session.csrf,session.user.role==='editor',!!session.demo):null,[session]);
  const command=async(url:string,method:string,body?:unknown)=>{
    const r=await fetch(url,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':session?.csrf||''},body:body===undefined?undefined:JSON.stringify(body)});
    const result=await r.json();if(!r.ok)throw new Error(result.error||'ดำเนินการไม่สำเร็จ');return result;
  };
  const getUsers=async()=>{const r=await fetch('/api/admin/users',{cache:'no-store'});if(!r.ok)throw new Error('โหลดคำขอไม่ได้');setUsers(await r.json());};
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await action();}catch(e){setError(String(e));}finally{setBusy(false);}};
  const account=session&&!session.demo?(<div className="mb-account-actions"><span className="mb-account-role">{session.user.status==='approved'?session.user.role:'รอสิทธิ์ใช้งาน'}</span><button disabled={busy} onClick={()=>void run(async()=>{await command('/auth/logout','POST');window.location.assign('/');})}>ออกจากระบบ <span aria-hidden="true">↗</span></button></div>):null;
  const accessPanel=(<section className="mb-access"><h2>คำขอและสิทธิ์ใช้งาน</h2><p>Viewer ดูข้อมูล • Editor แก้ไขและอัปโหลดเอกสาร • ปฏิเสธ/เพิกถอน มีผลกับการเรียกข้อมูลครั้งถัดไป</p>
        <table><thead><tr><th>ผู้ใช้</th><th>สถานะ</th><th>ขอสิทธิ์</th><th>อนุมัติ / เปลี่ยนสิทธิ์</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td>{u.display_name}<br/>{u.email}</td><td>{u.status} {u.role}</td><td>{u.requested_role}</td><td>{['viewer','editor',null].map(r=><button key={r||'deny'} disabled={busy} onClick={()=>void run(async()=>{await command(`/api/admin/users/${u.id}`,'PUT',{role:r});await getUsers();await refresh();})}>{r||'ปฏิเสธ / เพิกถอน'}</button>)}</td></tr>)}</tbody></table></section>);
  if(loading)return <div className="mb-login"><p>กำลังโหลด…</p></div>;
  return <>
    {error&&<div role="alert" className="mb-error">{error}<button onClick={()=>void refresh()}>ลองใหม่</button></div>}
    {!session?<div className="mb-login"><section><span className="mb-eyebrow">REALSOLUPLUS PURCHASING</span><h1>Mill Bearing</h1><p>เข้าสู่ระบบด้วยบัญชีบริษัท แล้วส่งคำขอใช้งาน</p><a className="mb-signin" href="/auth/login">เข้าสู่ระบบด้วย Microsoft Entra ID</a></section></div>:<>
      {session.user.status==='approved'&&repo?<><App repository={repo} user={session.user.display_name} accountActions={account}
        accessManagement={session.isAdmin?{onOpen:()=>void run(getUsers),content:accessPanel}:undefined}/>
        {session.demo&&<div className="mb-demo-notice">โหมดทดลองสาธารณะ • ทุกคนที่มีลิงก์แก้ไขข้อมูลทดลองได้ • ห้ามใส่ข้อมูลจริง</div>}</>:<section className="mb-access mb-pending-access"><div className="mb-pending-account"><strong>{session.user.display_name}</strong>{account}</div><h1>ขอสิทธิ์ใช้งาน Mill Bearing</h1>
        {session.user.status==='pending'?<p>ส่งคำขอแล้ว กำลังรอผู้ดูแลอนุมัติ</p>:<><p>{session.user.status==='denied'?'คำขอถูกปฏิเสธหรือเพิกถอน สามารถส่งคำขอใหม่ได้':'ยังไม่มีสิทธิ์เข้าถึงข้อมูล กรุณาเลือกสิทธิ์และส่งคำขอ'}</p><label>สิทธิ์ที่ต้องการ <select value={role} onChange={e=>setRole(e.target.value)}><option value="viewer">Viewer — ดูข้อมูล</option><option value="editor">Editor — แก้ไขข้อมูล</option></select></label><button className="primary" disabled={busy} onClick={()=>void run(async()=>{await command('/api/access-request','POST',{role});await refresh();})}>ส่งคำขอใช้งาน</button></>}
        <button disabled={busy} onClick={()=>void refresh()}>ตรวจสถานะอีกครั้ง</button></section>}
    </>}
  </>;
}
createRoot(document.getElementById('root')!).render(<Portal/>);
