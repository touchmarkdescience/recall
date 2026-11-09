// Run only against an isolated local copy with signup CAPTCHA on and abuse
// quotas off. Uses a synthetic account; no Google/reviewer credentials needed.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes,randomUUID,scryptSync } from 'node:crypto';
const origin=process.env.REVIEW_TEST_ORIGIN||'http://127.0.0.1:3304';
const parsed=new URL(origin);assert.equal(parsed.protocol,'http:');assert(['127.0.0.1','localhost'].includes(parsed.hostname));
const file=process.env.REVIEW_TEST_DATABASE;assert(file?.startsWith('/private/tmp/recall-security-'),'Use only the isolated temporary test database.');
const email=`review-probe-${randomUUID()}@example.invalid`,password=randomBytes(24).toString('hex'),id=randomUUID();
async function request(path,method='POST',body={},token){const r=await fetch(`${origin}/api/${path}`,{method,headers:{'Content-Type':'application/json','X-Recall-Client':'native',...(token?{Authorization:`Bearer ${token}`}:{})},body:method==='GET'?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
const config=await request('security','GET');assert.equal(config.data.captchaRequired,true);
await request('login','POST',{email,password}); // Initializes only the temporary local schema.
const db=new DatabaseSync(file);const salt=randomBytes(16).toString('hex');
db.prepare('INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,?,?)').run(id,email,'Synthetic review-flow probe',`${salt}:${scryptSync(password,salt,64).toString('hex')}`,new Date().toISOString());
try{
 let token;
 for(let i=0;i<20;i++){const login=await request('login','POST',{email,password});assert.equal(login.status,200);assert(login.data.token);token=login.data.token;}
 for(let i=0;i<25;i++){const extract=await request('extract','POST',{transcript:'Remind me to send the report tomorrow at 2 PM.'},token);assert.equal(extract.status,200);}
 const signup=await request('register','POST',{name:'Another probe',email:`new-${email}`,password});assert.equal(signup.status,400);
 const deleted=await request('account','DELETE',{password,confirmation:'DELETE'},token);assert.equal(deleted.status,200);
 assert.equal(db.prepare('SELECT count(*) as n FROM users WHERE id=?').get(id).n,0);
 console.log('Review-access check passed: 20 native sign-ins without CAPTCHA, 25 extraction requests without new quotas, and new registration still rejected without CAPTCHA. Synthetic account deleted.');
}finally{db.prepare('DELETE FROM users WHERE id=?').run(id);db.close();}
