// Execute real route/component logic against isolated service/database mocks.
// No production data, transcription calls or external network access.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { reconcileTranscript, TRANSCRIPTION_PROMPT, transcribeWithFallback, transcriptionPayload } from '../src/lib/transcription.ts';
const require=createRequire(import.meta.url);
function load(file,mocks,globals={}){
 const exports={};
 const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(source,{exports,require:name=>name in mocks?mocks[name]:require(name),console,process,performance,Date,Map,Set,JSON,Error,Response,...globals},{filename:file});
 return exports;
}
let activeUser={id:'a'},failWrite=false;
const records=new Map([
 ['a',{user_id:'a',push_enabled:true,reminder_minutes:60,sheet_webhook_url:'https://script.google.com/macros/s/example/exec',sheet_secret:'existing-secret-for-fixture',transcription_provider:'groq'}],
 ['b',{user_id:'b',push_enabled:false,reminder_minutes:15,sheet_webhook_url:null,sheet_secret:null,transcription_provider:'groq'}]
]);
function cloud(){return {from(table){
 let id,patch,insert,head=false;
 const q={
 select(_columns,options){head=Boolean(options?.head);return q},eq(_column,value){id=value;return q},is(){return q},
 update(value){patch=value;return q},upsert(value){insert=value;id=value.user_id;return q},
 single(){return Promise.resolve(result(true))},maybeSingle(){return Promise.resolve(result(true))},
 then(resolve,reject){return Promise.resolve(result(false)).then(resolve,reject)}
 };
 function result(single){
  if(table==='recall_sheet_outbox')return {data:[],count:0,error:null};
  assert.equal(table,'recall_user_settings');
  if(failWrite&&(insert||patch))return {data:null,error:{message:'Fixture database failure'}};
  if(insert&&!records.has(id))records.set(id,{user_id:id,push_enabled:true,reminder_minutes:30,sheet_webhook_url:null,sheet_secret:null,transcription_provider:null});
  const row=records.get(id);if(patch&&row)Object.assign(row,patch);
  return {data:head?null:single?row??null:row?[row]:[],count:0,error:null};
 }
 return q;
}}}
const cloudModule={cloud,dataOrThrow:result=>{if(result.error)throw new Error(result.error.message);return result.data}};
const stt={sttProvider:value=>value==='gemini'?'gemini':'groq',sttLabel:value=>value==='gemini'?'Google Gemini':'Groq Whisper',sttConfigured:()=>true,defaultSttProvider:()=> 'groq'};
const cloudSettings=load('src/lib/cloudSettings.ts',{'server-only':{},'./cloud':cloudModule,'./stt':stt});
const routes=load('src/lib/cloudRoutes.ts',{
 './dailySummary':{validSummaryTime:value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value)},'./dailySummaryDispatch':{},'server-only':{},'./abuse':{protectRequest:async()=>{},protectAuth:async()=>{},readJsonLimited:req=>req.json(),securityResponse:()=>null},
 './auth':{currentUser:async()=>activeUser},'./cloud':cloudModule,'./cloudSettings':cloudSettings,'./stt':stt,'./extract':{},
 './serverErrors':{safeFailure:()=>Response.json({error:'Save failed'},{status:500})},'./reminders':{},
 'next/server':{NextResponse:Response},'web-push':{}
},{URL});
async function post(path,body){return routes.cloudPOST({headers:new Headers(),nextUrl:{pathname:'/api/'+path},json:async()=>body},{params:Promise.resolve({path:path.split('/')})})}
const originalA=structuredClone(records.get('a')),originalB=structuredClone(records.get('b'));
let response=await post('settings/transcription',{transcriptionProvider:'gemini'});
assert.equal(response.status,200);assert.equal((await response.json()).transcriptionProvider,'gemini');
assert.equal(await cloudSettings.getCloudTranscriptionProvider('a'),'gemini');
assert.deepEqual(records.get('b'),originalB);
for(const key of ['push_enabled','reminder_minutes','sheet_webhook_url','sheet_secret'])assert.equal(records.get('a')[key],originalA[key]);
console.log('PASS service selection persists on reread and preserves reminders, Sheets and other accounts');
failWrite=true;response=await post('settings/transcription',{transcriptionProvider:'groq'});assert.equal(response.status,500);assert.equal(records.get('a').transcription_provider,'gemini');failWrite=false;
response=await post('settings/transcription',{transcriptionProvider:'invalid'});assert.equal(response.status,400);
activeUser=null;response=await post('settings/transcription',{transcriptionProvider:'groq'});assert.equal(response.status,401);activeUser={id:'a'};
console.log('PASS failed, invalid and unauthenticated saves do not change the service');
response=await post('settings/sheet',{sheetWebhookUrl:'',sheetSecret:''});assert.equal(response.status,200);assert.equal(records.get('a').sheet_webhook_url,null);assert.equal(records.get('a').transcription_provider,'gemini');assert.equal(records.get('a').reminder_minutes,60);
response=await post('settings/reminders',{pushEnabled:false,reminderMinutes:15});assert.equal(response.status,200);assert.equal(records.get('a').push_enabled,false);assert.equal(records.get('a').transcription_provider,'gemini');assert.equal(records.get('a').sheet_webhook_url,null);
assert.deepEqual(records.get('b'),originalB);
console.log('PASS independent section saves preserve other sections and accounts');
assert.notEqual(reconcileTranscript('','மரம்','','மாரம்').alternative,null);
const tamil='நாளை ஆறுமுகத்திடம் பேச வேண்டும்';
let result=reconcileTranscript('',tamil,'','Tomorrow speak to Aaron');
assert.equal(result.text,tamil);assert.equal(result.alternative,'Tomorrow speak to Aaron');
result=reconcileTranscript('Earlier note.','Call Arumugam tomorrow','','Call Aaron tomorrow');assert.equal(result.text,'Earlier note. Call Arumugam tomorrow');assert.equal(result.alternative,'Earlier note. Call Aaron tomorrow');
result=reconcileTranscript('Earlier note. '+tamil,'',tamil,'Tomorrow speak to Aaron');assert.equal(result.text,'Earlier note. '+tamil);assert.equal(result.alternative,'Earlier note. Tomorrow speak to Aaron');
result=reconcileTranscript('Earlier note.','','','Call Arumugam tomorrow');assert.equal(result.text,'Earlier note. Call Arumugam tomorrow');assert.equal(result.alternative,null);
result=reconcileTranscript('','call Arumugam tomorrow','','Call Arumugam tomorrow.');assert.equal(result.alternative,null);
console.log('PASS differing names/Tamil text require a choice, retries do not duplicate text, and browsers without live text use service output');
// Inspect the actual multipart request: no external provider call is made.
const uploads=[];
const actualStt=load('src/lib/stt.ts',{'server-only':{},'./transcription':{TRANSCRIPTION_PROMPT,transcribeWithFallback},'@google/genai':{GoogleGenAI:class{models={generateContent:async args=>{assert(args.contents[0].parts[1].text.includes('Arumugam'));assert(args.contents[0].parts[1].text.includes('Do not translate'));return {text:JSON.stringify({transcript:tamil})}}}}},zod:require('zod')},{FormData,Blob,Buffer,Uint8Array,AbortSignal,fetch:async(_url,options)=>{uploads.push(options.body);return {ok:true,text:async()=>tamil}}});
const oldLanguage=process.env.STT_LANGUAGE,oldKey=process.env.GROQ_API_KEY;
try{
 process.env.GROQ_API_KEY='fixture-only';delete process.env.STT_LANGUAGE;
 await actualStt.transcribeAudio({bytes:Buffer.from('fixture'),mime:'audio/wav'},'groq');assert.equal(uploads.at(-1).has('language'),false);assert.equal(uploads.at(-1).get('model'),'whisper-large-v3');
 process.env.STT_LANGUAGE='auto';await actualStt.transcribeAudio({bytes:Buffer.from('fixture'),mime:'audio/wav'},'groq');assert.equal(uploads.at(-1).has('language'),false);
 process.env.STT_LANGUAGE='en';await actualStt.transcribeAudio({bytes:Buffer.from('fixture'),mime:'audio/wav'},'groq',{language:'auto',vocabulary:['Arumugam','ஆறுமுகம்']});assert.equal(uploads.at(-1).has('language'),false);assert(uploads.at(-1).get('prompt').includes('Arumugam'));assert.equal(transcriptionPayload('YQ==','audio/webm;codecs=opus').language,'auto');
 const oldGemini=process.env.GEMINI_API_KEY;try{process.env.GEMINI_API_KEY='fixture-only';assert.equal(await actualStt.transcribeAudio({bytes:Buffer.from('fixture'),mime:'audio/wav'},'gemini',{language:'auto',vocabulary:['Arumugam']}),tamil)}finally{if(oldGemini===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldGemini}
 process.env.STT_LANGUAGE='ta';await actualStt.transcribeAudio({bytes:Buffer.from('fixture'),mime:'audio/wav'},'groq');assert.equal(uploads.at(-1).get('language'),'ta');
}finally{if(oldLanguage===undefined)delete process.env.STT_LANGUAGE;else process.env.STT_LANGUAGE=oldLanguage;if(oldKey===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=oldKey}
console.log('PASS Groq detects language automatically by default and respects explicit language overrides');
// Exercise the actual Settings card buttons, preserving unsaved sibling drafts.
records.set('a',structuredClone(originalA));
const hookState=[],effects=[],calls=[];let hookIndex=0,firstRender=true,notified;
const props={onBack(){},onSheetGuide(){},onEnablePush:async()=>{},onLogout:async()=>{},onProviderSaved:value=>{notified=value},pushConfigured:false,notificationStatus:''};
const jsx=(type,props)=>({type,props});
const Settings=load('src/components/ReminderSettings.tsx',{
 react:{useState(initial){const i=hookIndex++;if(!(i in hookState))hookState[i]=initial;return [hookState[i],value=>{hookState[i]=typeof value==='function'?value(hookState[i]):value}]},useEffect(fn){if(firstRender)effects.push(fn)}},
 'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':new Proxy({},{get:()=>function Icon(){}})
},{fetch:async(url,options)=>{calls.push({url,body:options.body?JSON.parse(options.body):null});return options.method==='POST'?post(url.slice(5),JSON.parse(options.body)):Response.json(await cloudSettings.getCloudSettings('a'))}}).default;
function render(){hookIndex=0;const tree=Settings(props);firstRender=false;return tree}
function flatten(node){if(!node)return [];if(Array.isArray(node))return node.flatMap(flatten);if(typeof node==='object')return [node,...flatten(node.props?.children)];return []}
function text(node){return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):''}
function button(tree,label){const found=flatten(tree).find(node=>node.type==='button'&&text(node).includes(label));assert(found,'button '+label);return found}
render();await effects[0]();await new Promise(resolve=>setImmediate(resolve));
let tree=render();const select=flatten(tree).find(node=>node.type==='select');select.props.onChange({target:{value:'gemini'}});
tree=render();flatten(tree).find(node=>node.type==='input'&&node.props.type==='url').props.onChange({target:{value:'invalid-unsaved-sheet-url'}});
tree=render();await button(tree,'Save transcription service').props.onClick();
assert.equal(notified.transcriptionProvider,'gemini');assert.deepEqual(calls.at(-1),{url:'/api/settings/transcription',body:{transcriptionProvider:'gemini'}});
tree=render();assert.equal(flatten(tree).find(node=>node.type==='input'&&node.props.type==='url').props.value,'invalid-unsaved-sheet-url');
flatten(tree).find(node=>node.type==='input'&&node.props.type==='url').props.onChange({target:{value:''}});
tree=render();await button(tree,'Save Google Sheet backup').props.onClick();
assert.deepEqual(calls.at(-1),{url:'/api/settings/sheet',body:{sheetWebhookUrl:'',sheetSecret:''}});
assert.equal(records.get('a').transcription_provider,'gemini');assert.equal(records.get('a').reminder_minutes,60);
console.log('PASS actual card buttons save only their section and retain unsaved sibling drafts');
// The real App Review handler must not call an extraction API or alter speech.
const {createReviewDraft}=await import('../src/lib/localExtract.ts');
const {WriteGuard,upsertRows}=await import('../src/lib/writeState.ts');
const appSource=readFileSync('src/components/App.tsx','utf8');
const stateNames=[...appSource.matchAll(/\[(\w+),\w+\]=useState/g)].map(match=>match[1]);
for(const words of ['Set a reminder for 5:00 a.m. to prepare presentation with Arumugam',tamil]){
 let index=0;const writes=[];let networkCalls=0;
 const appHooks={useState(initial){const name=stateNames[index++];assert(name,'state mapping');const value=name==='user'?{id:'a',name:'Fixture'}:name==='transcript'?words:typeof initial==='function'?initial():initial;return [value,next=>writes.push({name,value:typeof next==='function'?next(value):next})]},useRef:current=>({current}),useEffect(){},useMemo:fn=>fn(),useCallback:fn=>fn};
 const appMocks=new Proxy({react:appHooks,'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/localExtract':{createReviewDraft},'@/lib/writeState':{WriteGuard,upsertRows},'@/lib/transcription':{appendTranscript:(await import('../src/lib/transcription.ts')).appendTranscript}}, {has:()=>true,get:(target,key)=>key in target?target[key]:new Proxy({__esModule:true,default:function Stub(){}},{get:(t,k)=>k in t?t[k]:function Stub(){}})});
 const App=load('src/components/App.tsx',appMocks,{window:{location:{hash:'#capture',pathname:'/app',search:''}},navigator:{userAgent:'fixture'},fetch:async()=>{networkCalls++;throw new Error('Review must not depend on network')}}).default;
 const tree=App({});const start=performance.now();await button(tree,'Review details').props.onClick();
 const draft=writes.find(write=>write.name==='draft')?.value;assert(draft);assert.equal(networkCalls,0);assert.equal(draft.summary,words);assert(writes.some(write=>write.name==='view'&&write.value==='review'));
 if(words===tamil){assert.equal(draft.actions[0].kind,'follow_up');assert.equal(draft.actions[0].timeSpecified,false);assert(draft.actions[0].dueAt)}else assert.equal(draft.contactName,'Arumugam');
 assert(performance.now()-start<3000);
}
console.log('PASS actual Review handler preserves English/Tamil words and opens a draft without network or mandatory timing');

const meetingDraft=createReviewDraft('நாளைக்கு 3 மணிக்கு ஆரியப்பன் கூட ஒரு மீட்டிங் இருக்கு ஸ்கெடியூல் பண்ண',new Date('2026-11-18T15:30:00Z'));
let chosen;
const Due=load('src/components/ReviewDue.tsx',{react:{useState:()=>[false,()=>{}]},'react/jsx-runtime':{jsx,jsxs:jsx},'./ReminderChips':{__esModule:true,default:function Stub(){}},'./IstDateTimePicker':{__esModule:true,default:function Stub(){}}}).default;
const dueTree=Due({value:meetingDraft.actions[0],onChange:value=>{chosen=value}});
assert(text(dueTree).includes('AM or PM was not specified'));
button(dueTree,'3:00 PM').props.onClick();
assert.equal(chosen.kind,'meeting');assert.equal(chosen.dueAt,'2026-11-19T09:30:00.000Z');assert.equal(chosen.timeSpecified,true);assert.equal(chosen.timeChoices,undefined);
console.log('PASS actual review choice selects tomorrow 3 p.m. for the reported Tamil meeting');
