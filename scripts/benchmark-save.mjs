// Production Next.js routes against a loopback-only PostgREST fixture.
// No real accounts, credentials, Google APIs or production writes are used.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const label=process.argv[2];
assert(['before','after'].includes(label),'Specify before or after');
const dbPort=3376, appPort=3375, delayMs=50, samples=7;
const base=`http://127.0.0.1:${appPort}`;
const user={id:'10000000-0000-4000-8000-000000000001',email:'fixture@example.invalid',name:'Fixture'};
const settings={push_enabled:true,reminder_minutes:30,sheet_webhook_url:null,sheet_secret:null,transcription_provider:null};
const dueAt=new Date(Date.now()+86400000).toISOString();
let requests=[],action,interaction,outbox=0,settingsPresent=true,failWrite=null;
const reset=()=>{requests=[];action=null;interaction=null;outbox=0;settingsPresent=true;failWrite=null;};
const database=createServer(async(req,res)=>{
 const url=new URL(req.url,`http://127.0.0.1:${dbPort}`);
 assert(url.pathname.startsWith('/rest/v1/'),'Fixture accepts only PostgREST paths');
 requests.push(`${req.method} ${url.pathname}`);
 let raw='';for await(const chunk of req)raw+=chunk;
 const body=raw?JSON.parse(raw):{};
 await new Promise(resolve=>setTimeout(resolve,delayMs));
 const name=url.pathname.slice('/rest/v1/'.length);
 let rows;
 if(name==='recall_sessions') rows=[{user_id:user.id}];
 else if(name==='recall_users') rows=[user];
 else if(name==='recall_user_settings') {
  if(req.method==='POST')settingsPresent=true;
  rows=settingsPresent?[req.method==='POST'?{user_id:user.id}:settings]:[];
 }
 else if(name==='rpc/recall_save_note'){
  if(failWrite==='save'){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Synthetic write failure'}));return;}
  assert.equal(body.p_user_id,user.id);
  const draft=body.p_actions[0];
  action={id:'20000000-0000-4000-8000-000000000001',user_id:user.id,contact_id:null,interaction_id:'30000000-0000-4000-8000-000000000001',kind:draft.kind,title:draft.title,due_at:draft.dueAt,time_specified:1,reminder_minutes:draft.reminderMinutes,duration_minutes:30,status:'pending',created_at:new Date().toISOString(),notified_at:null};
  interaction={id:action.interaction_id,contact_id:null,transcript:body.p_transcript,summary:body.p_summary,occurred_at:body.p_occurred_at,created_at:action.created_at};
  outbox+=2;rows={contactId:null,interactionId:interaction.id};
 } else if(name==='recall_actions'){
  if(req.method==='PATCH'&&failWrite==='action'){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Synthetic write failure'}));return;}
  if(req.method==='PATCH')Object.assign(action,body);
  rows=action&&!url.searchParams.has('contact_id')?[action]:[];
 } else if(name==='recall_contacts')rows=url.searchParams.has('id')?[{id:'50000000-0000-4000-8000-000000000001',name:'Fixture contact',phone:null,created_at:new Date().toISOString()}]:[];
 else if(name==='recall_interactions')rows=interaction&&!url.searchParams.has('contact_id')?[interaction]:[];
 else if(name==='recall_sheet_outbox'){
  if(req.method==='POST'){outbox++;rows=[{id:'40000000-0000-4000-8000-000000000001'}];}
  else rows=[];
 } else {res.writeHead(500);res.end(JSON.stringify({message:`Unexpected fixture endpoint: ${name}`}));return;}
 res.setHeader('Content-Type','application/json');
 if(req.method==='HEAD'){res.setHeader('Content-Range',`*/${outbox}`);res.end();return;}
 if(Array.isArray(rows)&&(req.headers.accept||'').includes('application/vnd.pgrst.object+json'))rows=rows[0]??null;
 res.end(JSON.stringify(rows));
});
await new Promise(resolve=>database.listen(dbPort,'127.0.0.1',resolve));
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(appPort)],{
 env:{...process.env,SUPABASE_URL:`http://127.0.0.1:${dbPort}`,SUPABASE_SECRET_KEY:'fixture-not-a-production-key',ABUSE_PROTECTION_ENABLED:'false',RECAPTCHA_SIGNUP_ENABLED:'false',OPENAI_API_KEY:'',NODE_ENV:'production'},stdio:['ignore','pipe','pipe'],
});
let serverOutput='';child.stdout.on('data',d=>serverOutput+=d);child.stderr.on('data',d=>serverOutput+=d);
const api=async(path,body,expectedStatus=200)=>{
 const response=await fetch(`${base}/api/${path}`,{method:body?'POST':'GET',headers:{Authorization:'Bearer fixture-token','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();assert.equal(response.status,expectedStatus,JSON.stringify(data));
 if(label==='after'&&expectedStatus===200&&['save','action'].includes(path))assert(response.headers.get('server-timing')?.includes('write;dur='));
 return data;
};
const timed=async(operation)=>{const start=performance.now();const result=await operation();return {ms:performance.now()-start,result};};
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
try {
 for(let n=0;;n++){
  try{const identity=await api('me');assert.equal(identity.user?.id,user.id,'Refuse to benchmark a non-fixture server');break;}catch(e){if(n>=60||child.exitCode!==null)throw new Error(`Benchmark server failed: ${serverOutput.slice(-1500)}`);await new Promise(resolve=>setTimeout(resolve,250));}
 }
 const runs=[];
 const refreshDashboard=async()=>{
  let dash;
  if(label==='after') [,dash]=await Promise.all([api('me'),api('dashboard')]);
  else {await api('me');dash=await api('dashboard');}
  return dash;
 };
 // One warm-up, followed by measured runs. Reproduce the app's sequential
 // save -> me -> dashboard path; notification scheduling is tested separately.
 for(let sample=-1;sample<samples;sample++){
  reset();
  const save=await timed(()=>api('save',{transcript:'Send the fixture proposal tomorrow',summary:'Send the fixture proposal',contactId:'',contactName:'',actions:[{kind:'follow_up',title:'Send the fixture proposal',dueAt,timeSpecified:true,reminderMinutes:30,durationMinutes:30}]}));
  const saveQueries=requests.length;
  assert.equal(save.result.ok,true);assert.equal(action.due_at,dueAt);assert.equal(action.reminder_minutes,30);
  const refresh=await timed(async()=>{const dash=await refreshDashboard();assert.equal(dash.actions[0].status,'pending');});
  const start=requests.length;
  const update=await timed(()=>api('action',{id:action.id,status:'done'}));
  assert.equal(update.result.ok,true);assert.equal(action.status,'done');assert.equal(action.due_at,dueAt);assert.equal(action.reminder_minutes,30);assert.equal(action.notified_at,null);
  const updateQueries=requests.length-start;
  const updateRefresh=label==='before'?await timed(async()=>{const dash=await refreshDashboard();assert.equal(dash.actions[0].status,'done');}):{ms:0};
  if(sample>=0)runs.push({saveMs:save.ms,refreshMs:refresh.ms,updateMs:update.ms,saveQueries,updateQueries,saveAndRefreshMs:save.ms+refresh.ms,updateAndRefreshMs:update.ms+updateRefresh.ms});
 }
 let regressionChecks=[],screenApiTimingsMs;
 if(label==='after'){
  const probes={identity:()=>api('me'),dashboard:()=>api('dashboard'),personHistory:()=>api('contact?id=50000000-0000-4000-8000-000000000001'),reviewExtraction:()=>api('extract',{transcript:'Tomorrow I have a call with Arvind. Remind me today at 6 PM.'}),settings:()=>api('settings')};
  screenApiTimingsMs={};
  for(const [name,probe] of Object.entries(probes)){
   await probe();const durations=[];
   for(let n=0;n<samples;n++)durations.push((await timed(probe)).ms);
   screenApiTimingsMs[name]=Math.round(median(durations)*10)/10;
  }
  settingsPresent=false;requests=[];
  const config=await api('settings');
  assert.equal(config.pushEnabled,true);assert.equal(config.reminderMinutes,30);
  assert.equal(requests.filter(r=>r==='POST /rest/v1/recall_user_settings').length,1);
  requests=[];await api('settings');
  assert(!requests.some(r=>r.startsWith('POST')));
  failWrite='action';
  const oldStatus=action.status;
  const rejected=await api('action',{id:action.id,status:'pending'},500);
  assert.notEqual(rejected.ok,true);assert.equal(action.status,oldStatus);
  reset();failWrite='save';
  const rejectedSave=await api('save',{transcript:'Fixture save failure',summary:'Fixture save failure',actions:[]},500);
  assert.notEqual(rejectedSave.ok,true);assert.equal(action,null);assert.equal(interaction,null);
  regressionChecks=['Missing settings initialized once; reminder defaults retained','Existing settings reads issue no writes','Failed update never reports success or changes state','Failed save never reports success or creates a record','Successful saves/updates preserve dueAt and reminderMinutes','Server-Timing contains stage durations without input data'];
 }
 const report={label,environment:'localhost production Next.js + in-memory PostgREST fixture; no production writes',fixtureDatabaseDelayMs:delayMs,samples,median:Object.fromEntries(Object.keys(runs[0]).map(k=>[k,Math.round(median(runs.map(r=>r[k]))*10)/10])),screenApiTimingsMs,runs,regressionChecks,limits:'Excludes real mobile network, Supabase execution, cold starts, phone notification scheduling and optional connected Sheets. Screen probes measure API portions, not complete UI time; signup/login/recognition and physical-device times are unmeasured.'};
 writeFileSync(`mobile/release/save-performance-${label}.json`,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,runs:undefined},null,2));
} finally {
 child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(resolve=>setTimeout(resolve,3000))]);
 database.closeAllConnections();await new Promise(resolve=>database.close(resolve));
}
