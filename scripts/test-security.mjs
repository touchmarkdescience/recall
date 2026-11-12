import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { budgetRule, configuredLimits, readJsonLimited, SecurityError, validateChallenge } from '../src/lib/securityCore.ts';
import { reserveSqlite } from '../src/lib/securityStore.ts';
import { mobileSignupConfiguration, validateNativeChallenge, validateSignupProof } from '../src/lib/nativeCaptcha.ts';
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

const nativeEnv={NODE_ENV:'production',RECAPTCHA_ENTERPRISE_PROJECT_ID:'test-project',RECAPTCHA_ENTERPRISE_API_KEY:'test-only-server-credential',RECAPTCHA_ANDROID_SITE_KEY:'android-public-test-key',RECAPTCHA_IOS_SITE_KEY:'ios-public-test-key',RECAPTCHA_IOS_BUNDLE_ID:'com.example.test',NEXT_PUBLIC_RECAPTCHA_SITE_KEY:'web-public-test-key',RECAPTCHA_SECRET_KEY:'test-only-web-secret'};
function nativeAnswer(platform='android'){
 return {tokenProperties:{valid:true,action:'signup',...(platform==='android'?{androidPackageName:'com.touchmarkdes.recall'}:{iosBundleId:'com.example.test'})},riskAnalysis:{score:0.9},event:{siteKey:platform==='android'?nativeEnv.RECAPTCHA_ANDROID_SITE_KEY:nativeEnv.RECAPTCHA_IOS_SITE_KEY}};
}
await check('mobile bootstrap exposes only ready public platform keys, never server credentials',()=>{
 assert.deepEqual(mobileSignupConfiguration({}),{androidSiteKey:null,iosSiteKey:null});
 assert.deepEqual(mobileSignupConfiguration(nativeEnv),{androidSiteKey:'android-public-test-key',iosSiteKey:'ios-public-test-key'});
 const incomplete={...nativeEnv,RECAPTCHA_ENTERPRISE_API_KEY:''};assert.equal(mobileSignupConfiguration(incomplete).androidSiteKey,null);
 assert(!JSON.stringify(mobileSignupConfiguration(nativeEnv)).includes(nativeEnv.RECAPTCHA_ENTERPRISE_API_KEY));
});
await check('native signup sends Google the fixed action/key and validates Android and iOS identities',async()=>{
 for(const platform of ['android','ios'])await validateNativeChallenge('fresh-token',platform,nativeEnv,async(url,options)=>{
  assert.equal(url.origin,'https://recaptchaenterprise.googleapis.com');assert.equal(url.pathname,'/v1/projects/test-project/assessments');assert.equal(url.searchParams.has('key'),false);assert.equal(new Headers(options.headers).get('x-goog-api-key'),nativeEnv.RECAPTCHA_ENTERPRISE_API_KEY);
  assert.deepEqual(JSON.parse(options.body),{event:{token:'fresh-token',siteKey:platform==='android'?nativeEnv.RECAPTCHA_ANDROID_SITE_KEY:nativeEnv.RECAPTCHA_IOS_SITE_KEY,expectedAction:'signup'}});
  return Response.json(nativeAnswer(platform));
 });
});
await check('native failures reject wrong app, action, key, score and invalid tokens',async()=>{
 const baseline=nativeAnswer();
 const answers=[{...baseline,tokenProperties:{...baseline.tokenProperties,valid:false}}, {...baseline,tokenProperties:{...baseline.tokenProperties,androidPackageName:'other.app'}}, {...baseline,tokenProperties:{...baseline.tokenProperties,action:'login'}}, {...baseline,event:{siteKey:'other-key'}}, {...baseline,riskAnalysis:{score:0.1}}, {...baseline,riskAnalysis:{}}, {...baseline,riskAnalysis:{score:2}},null,{}];
 for(const answer of answers)await assert.rejects(validateNativeChallenge('token','android',nativeEnv,async()=>Response.json(answer)),e=>e.status===400);
});
await check('native missing keys, invalid inputs and provider outages fail closed with safe messages',async()=>{
 let calls=0;const never=async()=>{calls++;throw new Error();};
 await assert.rejects(validateNativeChallenge('token','web',nativeEnv,never),e=>e.status===400);
 await assert.rejects(validateNativeChallenge('token','android',{},never),e=>e.status===503);
 await assert.rejects(validateNativeChallenge('token','android',{...nativeEnv,RECAPTCHA_MIN_SCORE:'NaN'},never),e=>e.status===503);
 for(const token of ['',undefined,'x'.repeat(16385)])await assert.rejects(validateNativeChallenge(token,'android',nativeEnv,never),e=>e.status===400);
 assert.equal(calls,0);
 for(const fetcher of [async()=>new Response('{}',{status:429}),async()=>{throw new Error(nativeEnv.RECAPTCHA_ENTERPRISE_API_KEY);},async()=>new Response('not json')]){
  await assert.rejects(validateNativeChallenge('token','android',nativeEnv,fetcher),e=>e.status===503&&!e.message.includes(nativeEnv.RECAPTCHA_ENTERPRISE_API_KEY));
 }
});
await check('signup dispatch preserves web verification and never trusts native claims alone',async()=>{
 let calls=0;const fetcher=async(url)=>{calls++;return Response.json(String(url).includes('recaptchaenterprise.googleapis.com')?nativeAnswer():{success:true,score:0.9,action:'signup',hostname:'recall.touchmarkdes.com'});};
 await validateSignupProof({captchaToken:'web-token'},nativeEnv,fetcher);
 await validateSignupProof({captchaProvider:'recaptcha_enterprise',captchaPlatform:'android',captchaToken:'native-token'},nativeEnv,fetcher);
 assert.equal(calls,2);
 for(const body of [{'X-Recall-Client':'native',score:1,verified:true},{captchaProvider:'native',captchaToken:'anything'},{captchaProvider:'recaptcha_enterprise',captchaPlatform:'android',score:1}])await assert.rejects(validateSignupProof(body,nativeEnv,fetcher),e=>e.status===400);
 assert.equal(calls,2);
});
await check('native tokens are reassessed on retry and expired/reused tokens are rejected',async()=>{
 let calls=0;const fetcher=async()=>Response.json(++calls===1?nativeAnswer():{tokenProperties:{valid:false,invalidReason:'DUPE'}});
 await validateNativeChallenge('same','android',nativeEnv,fetcher);
 await assert.rejects(validateNativeChallenge('same','android',nativeEnv,fetcher),e=>e.status===400);
 assert.equal(calls,2);
});

await check('native rejection diagnostics identify iOS failures without logging credentials or assessment content',async()=>{
 const original=console.warn, logs=[];
 console.warn=(...args)=>logs.push(args);
 try {
  const baseline=nativeAnswer('ios');
  await validateNativeChallenge('private-token','ios',nativeEnv,async()=>Response.json(baseline));
  assert.equal(logs.length,0);
  await assert.rejects(validateNativeChallenge('private-token','ios',nativeEnv,async()=>Response.json({...baseline,riskAnalysis:{score:0.3},private:'private-account@example.test'})),e=>e.status===400);
  assert.deepEqual(logs.pop(),['recall_native_signup_rejected',{platform:'ios',reasons:['score_below_threshold'],invalidReason:null,score:0.3}]);
  await assert.rejects(validateNativeChallenge('private-token','ios',nativeEnv,async()=>Response.json({...baseline,tokenProperties:{...baseline.tokenProperties,valid:false,invalidReason:'EXPIRED'}})),e=>e.status===400);
  assert.deepEqual(logs.pop()[1],{platform:'ios',reasons:['invalid_token'],invalidReason:'EXPIRED',score:0.9});
  await assert.rejects(validateNativeChallenge('private-token','ios',nativeEnv,async()=>Response.json({...baseline,event:{siteKey:'private-key'},tokenProperties:{...baseline.tokenProperties,iosBundleId:'private-bundle',invalidReason:'private-token'}})),e=>e.status===400);
  assert.deepEqual(logs.pop()[1],{platform:'ios',reasons:['app_identity_mismatch','site_key_mismatch'],invalidReason:null,score:0.9});
 } finally {console.warn=original;}
});

console.log(`${checks} security checks passed. PostgreSQL migration and real CAPTCHA remain separate integration checks.`);
