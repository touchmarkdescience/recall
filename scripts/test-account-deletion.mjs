// Disposable LOCAL accounts only. Never point this check at a deployed API.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
if(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) throw new Error('Run against the local SQLite development server only.');
const base='http://127.0.0.1:3000/api';
const db=new DatabaseSync('data/recall.sqlite');
const password=`Release-test-${randomUUID()}`;
const users=[];
async function request(method,path,body,token){
 const res=await fetch(`${base}/${path}`,{method,headers:{'Content-Type':'application/json','X-Recall-Client':'native',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:res.status,data:await res.json()};
}
try {
 for(let i=0;i<2;i++){
  const email=`release-delete-${randomUUID()}@example.invalid`;
  const registered=await request('POST','register',{name:'Disposable release test',email,password});
  assert.equal(registered.status,200);assert.ok(registered.data.token);
  const me=await request('GET','me',null,registered.data.token);
  const local=db.prepare('SELECT id FROM users WHERE id=? AND email=?').get(me.data.user.id,email);
  assert.ok(local,'Refusing deletion: API must use this local SQLite database.');
  users.push({id:local.id,email,token:registered.data.token});
 }
 const [a,b]=users;
 const saved=await request('POST','save',{contactName:'Disposable person',transcript:'Send the proposal tomorrow.',summary:'Send proposal',actions:[{kind:'follow_up',title:'Send proposal',dueAt:new Date(Date.now()+86400000).toISOString(),timeSpecified:true}]},a.token);
 assert.equal(saved.status,200);
 assert.equal((await request('DELETE','account',{password:'wrong',confirmation:'DELETE'},a.token)).status,403);
 assert.equal((await request('DELETE','account',{password,confirmation:'no'},a.token)).status,400);
 assert.equal((await request('DELETE','account',{password,confirmation:'DELETE'})).status,401);
 const intact=await request('GET','dashboard',null,a.token);assert.equal(intact.data.actions.length,1);
 assert.equal((await request('DELETE','account',{password,confirmation:'DELETE',userId:b.id},a.token)).status,200);
 for(const table of ['users','sessions','contacts','interactions','actions','push_subscriptions','user_settings','sheet_outbox']){
  const column=table==='users'?'id':'user_id';
  assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column}=?`).get(a.id).n,0,`Cascade failed: ${table}`);
 }
 assert.equal((await request('GET','dashboard',null,a.token)).status,401);
 assert.equal((await request('GET','me',null,b.token)).data.user.id,b.id);
 console.log('PASS: reauthentication, explicit confirmation, unauthenticated rejection, account isolation, all local cascades and session revocation.');
} finally {
 // Only delete the exact locally verified accounts this test created.
 for(const user of users){
  if(db.prepare('SELECT id FROM users WHERE id=? AND email=?').get(user.id,user.email)){
   const result=await request('DELETE','account',{password,confirmation:'DELETE'},user.token);
   assert.equal(result.status,200,'Disposable test cleanup failed');
  }
 }
 db.close();
}
