import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { budgetRule, configuredLimits, readJsonLimited, SecurityError, validateChallenge } from '../src/lib/securityCore.ts';
import { reserveSqlite } from '../src/lib/securityStore.ts';
let checks=0;
const check=async(name,fn)=>{await fn();checks++;console.log(`PASS ${name}`);};
const secret='test-only-hmac-secret-not-a-real-key',now=Date.UTC(2026,10,9,7,30);
await check('hashed subjects are separated by scope and account',()=>{
 const a=budgetRule('ask','person@example.com',2,60,secret,now);
 assert(!a.key.includes('person@example.com'));assert.equal(a.key,budgetRule('ask','person@example.com',2,60,secret,now).key);
 assert.notEqual(a.key,budgetRule('ask','other@example.com',2,60,secret,now).key);
 assert.notEqual(a.key,budgetRule('extract','person@example.com',2,60,secret,now).key);
});
await check('invalid quota configuration is rejected',()=>{
 assert.equal(configuredLimits({ABUSE_ASK_DAY:'7'}).askDay,7);
 for(const value of ['0','-1','oops','1.2','100001'])assert.throws(()=>configuredLimits({ABUSE_ASK_DAY:value}),SecurityError);
});
await check('small JSON accepted; arrays and malformed bodies rejected',async()=>{
 const make=body=>new Request('http://localhost/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body});
 assert.deepEqual(await readJsonLimited(make('{"name":"Arjun"}')), {name:'Arjun'});
 for(const body of ['[1]','null','{'])await assert.rejects(readJsonLimited(make(body)),e=>e.status===400);
 await assert.rejects(readJsonLimited(new Request('http://localhost',{method:'POST',body:'x'})),e=>e.status===415);
});
await check('actual streamed bytes enforced even without a truthful content-length',async()=>{
 const bytes=new TextEncoder().encode('{"a":"'+'x'.repeat(200)+'"}');
 const req=new Request('http://localhost',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':'1'},duplex:'half',body:new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}})});
 await assert.rejects(readJsonLimited(req,100),e=>e.status===413);
});
await check('missing and oversized challenge tokens never call the provider',async()=>{
 let calls=0;const options={secret:'fake',hostnames:['recall.touchmarkdes.com'],fetcher:async()=>{calls++;throw new Error();}};
 for(const token of [undefined,'','x'.repeat(16385)])await assert.rejects(validateChallenge(token,options),e=>e.status===400);
 assert.equal(calls,0);
});
await check('valid challenge requires provider success, expected action and hostname',async()=>{
 const verify=answer=>validateChallenge('opaque',{secret:'fake',hostnames:['recall.touchmarkdes.com'],fetcher:async(url,options)=>{
  assert.equal(url,'https://www.google.com/recaptcha/api/siteverify');assert.deepEqual(Object.fromEntries(options.body),{secret:'fake',response:'opaque'});
  return Response.json(answer);
 }});
 await verify({success:true,score:0.9,action:'signup',hostname:'recall.touchmarkdes.com'});
 for(const answer of [{success:false},{success:true,score:0.1,action:'signup',hostname:'recall.touchmarkdes.com'},{success:true,action:'signup',hostname:'recall.touchmarkdes.com'},{success:true,score:0.9,action:'signup',hostname:'recall.touchmarkdes.com','error-codes':['Over free quota.']},{success:true,score:0.9,action:'login',hostname:'recall.touchmarkdes.com'},{success:true,score:0.9,action:'signup',hostname:'attacker.example'}])await assert.rejects(verify(answer),e=>e.status===400);
});
await check('expired/replayed tokens are revalidated; provider failure fails closed',async()=>{
 let calls=0;const options={secret:'fake',hostnames:['recall.touchmarkdes.com'],fetcher:async()=>Response.json(++calls===1?{success:true,score:0.9,action:'signup',hostname:'recall.touchmarkdes.com'}:{success:false,'error-codes':['timeout-or-duplicate']})};
 await validateChallenge('same-token',options);await assert.rejects(validateChallenge('same-token',options),e=>e.status===400);assert.equal(calls,2);
 await assert.rejects(validateChallenge('opaque',{...options,fetcher:async()=>{throw new Error('network');}}),e=>e.status===503);
});
await check('database reservations enforce limits and do not partially charge a rejected request',()=>{
 const db=new DatabaseSync(':memory:');const account=budgetRule('ask','user',2,60,secret,now),site=budgetRule('global','site',1,60,secret,now);
 assert.equal(reserveSqlite(db,[site],now).allowed,true);
 assert.equal(reserveSqlite(db,[account,site],now).allowed,false);
 assert.equal(db.prepare('select count from abuse_buckets where key=?').get(account.key),undefined);
 assert.equal(reserveSqlite(db,[account],now).allowed,true);assert.equal(reserveSqlite(db,[account],now).allowed,true);
 const denied=reserveSqlite(db,[account],now);assert.equal(denied.allowed,false);assert(denied.retryAfter>0);
 assert.equal(reserveSqlite(db,[budgetRule('ask','other',2,60,secret,now)],now).allowed,true);
 assert.equal(reserveSqlite(db,[budgetRule('ask','user',2,60,secret,now+60000)],now+60000).allowed,true);db.close();
});
await check('independent processes share the same durable budget',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'recall-security-')),file=join(dir,'budget.sqlite');
 try{
  const db=new DatabaseSync(file);reserveSqlite(db,[],now);db.close();
  const rule=budgetRule('quota','user',5,60,secret,now);
  const program=`import {DatabaseSync} from 'node:sqlite';import {reserveSqlite} from './src/lib/securityStore.ts';const db=new DatabaseSync(${JSON.stringify(file)});let allowed=0;for(let i=0;i<20;i++)if(reserveSqlite(db,[${JSON.stringify(rule)}],${now}).allowed)allowed++;db.close();process.stdout.write(String(allowed));`;
  const worker=()=>new Promise((resolve,reject)=>{let out='',err='';const child=spawn(process.execPath,['--experimental-strip-types','--input-type=module','-e',program]);child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('exit',code=>code===0?resolve(Number(out)):reject(new Error(err)));child.on('error',reject);});
  const counts=await Promise.all([worker(),worker()]);assert.equal(counts.reduce((a,b)=>a+b,0),5);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
console.log(`${checks} security checks passed. PostgreSQL migration and real CAPTCHA remain separate integration checks.`);
