// Actual VoiceCapture lifecycle with deterministic browser/database/network fakes.
// This measures removed dependencies, not physical microphone or AI performance.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import {fastExtract,createReviewDraft} from '../src/lib/localExtract.ts';
import {appendTranscript} from '../src/lib/transcription.ts';
const sample='Set a reminder for 5:00 a.m. to prepare presentation with Arumugam';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const timings={databaseMs:40,transcriptionMs:900,serverExtractionMs:350};
async function run(source,after,live=true){
 let handle,recognizer,resolveText,calls=0,state='idle',clip;
 const textReady=new Promise(resolve=>{resolveText=resolve});
 const hooks={useState:initial=>[initial,()=>{}],useRef:current=>({current}),useEffect(){},useImperativeHandle(_ref,factory){handle=factory()}};
 class Recorder{
  static isTypeSupported(){return true}state='inactive';mimeType='audio/webm';
  start(){this.state='recording'}
  stop(){this.state='inactive';this.ondataavailable({data:new Blob(['fixture audio'])});setImmediate(()=>void this.onstop())}
 }
 class Recognition{start(){recognizer=this}stop(){}}
 class AudioContext{
  createMediaStreamSource(){return {connect(){}}}createAnalyser(){return {frequencyBinCount:10,getByteFrequencyData(){}}}close(){return Promise.resolve()}
 }
 const jsx=(type,props)=>({type,props});
 const exports={};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports,require(name){
  if(name==='react')return hooks;if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};if(name==='lucide-react')return {};
  if(name==='@/lib/localAudio')return {saveLocalClip:async value=>{await delay(timings.databaseMs);clip=value},getLocalClip:async()=>clip};
  if(name==='@/lib/pcmCapture')return {isIosDevice:()=>false};
  if(name==='@/lib/transcription')return {appendTranscript,blobBase64:async()=> 'YQ==',transcriptionPayload:(audio,mime)=>({audio,mime})};
  throw new Error('Unexpected dependency '+name);
 },navigator:{userAgent:'fixture Chrome',mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}},window:{SpeechRecognition:Recognition},MediaRecorder:Recorder,AudioContext,Blob,crypto:{randomUUID:()=> 'fixture'},Uint8Array,Array,Promise,Error,Date,performance,console:{info(){}},setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame:()=>0,cancelAnimationFrame(){},fetch:async()=>{calls++;await delay(timings.transcriptionMs);return {ok:true,json:async()=>({transcript:'Set a reminder for 5:00 a.m. to prepare presentation with R mugam'})}}});
 exports.default({ownerId:'fixture',language:'en',transcriptionConfigured:true,provider:'Fixture',onTranscript:(text,source)=>resolveText({text,source}),onLiveTranscript(){},onError:message=>{throw new Error(message)},onRecordingStart(){},onRecorderState:value=>{state=value},controlRef:{}});
 await handle.start();assert.equal(state,'recording');
 if(live)recognizer.onresult({results:[[{transcript:sample}]]});
 const start=performance.now();await handle.stop();const result=await textReady;const textMs=performance.now()-start;
 let extracted;
 if(after){extracted=createReviewDraft(result.text)}else await delay(timings.serverExtractionMs);
 const reviewMs=performance.now()-start;
 return {stopToTextMs:Math.round(textMs*10)/10,stopToDraftDataMs:Math.round(reviewMs*10)/10,transcriptionRequests:calls,text:result.text,contact:extracted?.contactName,source:result.source};
}
const beforeSource=execFileSync('git',['show','651072e:src/components/VoiceCapture.tsx'],{encoding:'utf8'}),afterSource=readFileSync('src/components/VoiceCapture.tsx','utf8');
const before=[],after=[];
for(let n=0;n<3;n++){before.push(await run(beforeSource,false));after.push(await run(afterSource,true))}
assert(after.every(row=>row.stopToDraftDataMs<3000&&row.transcriptionRequests===0&&row.text===sample&&row.contact==='Arumugam'));
const fallback=await run(afterSource,true,false);assert.equal(fallback.transcriptionRequests,1);
const parserSamples=[];
for(let n=0;n<100;n++){const start=performance.now();fastExtract(sample);parserSamples.push(performance.now()-start)}
parserSamples.sort((a,b)=>a-b);
const median=rows=>rows.map(row=>row.stopToDraftDataMs).sort((a,b)=>a-b)[Math.floor(rows.length/2)];
const result={method:'Actual component lifecycle with browser mocks; simulated DB/network delay. No real audio or production requests.',targetMs:3000,fixtureDelays:timings,beforeRevision:'651072e',before,after,medianStopToDraftDataMs:{before:median(before),after:median(after)},fallback,parserMs:{p50:parserSamples[50],p95:parserSamples[95]},limits:'Excludes physical recording/browser speech finalization, deployed network, cold starts and live speech accuracy. Uncertain sentences become an editable draft with optional manual scheduling; no automatic server extraction.'};
writeFileSync('docs/voice-review-controlled-benchmark.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
