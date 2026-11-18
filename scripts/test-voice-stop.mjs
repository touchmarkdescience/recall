// Replays real VoiceCapture callbacks. No microphone, AI, production records or network.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import {appendTranscript,appendSpeechTail} from '../src/lib/transcription.ts';
const correct='Set a reminder for 5:00 AM to prepare presentation with Arumugam.';
const wrong=correct.replace('Arumugam','Aarmugam');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function harness(source,{revision='sync',live=true,ignoreAbort=false}={}){
 let control,recognizer,clip,calls=0,state='idle',aborted=0;
 const results=[],previews=[],effects=[];
 const hooks={useState:initial=>[initial,()=>{}],useRef:current=>({current}),useEffect:fn=>effects.push(fn),useImperativeHandle(_ref,fn){control=fn()}};
 class Recorder{
  static isTypeSupported(){return true}state='inactive';mimeType='audio/webm';
  start(){this.state='recording'}
  stop(){this.state='inactive';this.ondataavailable({data:new Blob(['fixture'])});setImmediate(()=>void this.onstop())}
 }
 class Recognition{
  start(){recognizer=this}
  stop(){
   const event=()=>{if(revision==='sync'||revision==='late'||revision==='extend')this.onresult({results:[[{transcript:revision==='extend'?correct+' Please bring the slides.':wrong}]]});this.onend?.()};
   if(revision==='sync')event();else if(revision==='late'||revision==='extend')setTimeout(event,50);else this.onend?.();
  }
 }
 class AudioContext{createMediaStreamSource(){return {connect(){}}}createAnalyser(){return {frequencyBinCount:10,getByteFrequencyData(){}}}close(){return Promise.resolve()}}
 const exports={};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports,require(name){
  if(name==='react')return hooks;if(name==='react/jsx-runtime')return {jsx:()=>null,jsxs:()=>null};if(name==='lucide-react')return {};
  if(name==='@/lib/localAudio')return {saveLocalClip:async value=>{await wait(20);clip=value},getLocalClip:async()=>clip};
  if(name==='@/lib/pcmCapture')return {isIosDevice:()=>false};
  if(name==='@/lib/transcription')return {appendTranscript,appendSpeechTail,blobBase64:async()=> 'YQ==',transcriptionPayload:(audio,mime)=>({audio,mime})};
  throw new Error('Unexpected dependency '+name);
 },navigator:{userAgent:'fixture Chrome',mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}},window:{SpeechRecognition:Recognition,addEventListener(){},removeEventListener(){}},MediaRecorder:Recorder,AudioContext,AbortController,Blob,crypto:{randomUUID:()=>String(Math.random())},Uint8Array,Array,Promise,Error,Date,performance,console:{info(){}},setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame:()=>0,cancelAnimationFrame(){},fetch:async(_url,options)=>{
  calls++;await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,600);if(!ignoreAbort)options?.signal?.addEventListener('abort',()=>{aborted++;clearTimeout(timer);reject(Object.assign(new Error('Aborted'),{name:'AbortError'}))},{once:true})});return {ok:true,json:async()=>({transcript:wrong})};
 }});
 exports.default({ownerId:'fixture',language:'en',transcriptionConfigured:true,provider:'Fixture',onTranscript:(text,source)=>results.push({text,source}),onLiveTranscript:text=>previews.push(text),onError:message=>{throw new Error(message)},onRecordingStart(){},onRecorderState:value=>{state=value},controlRef:{}});
 return {start:async()=>{await control.start();if(live)recognizer.onresult({results:[[{transcript:correct}]]})},stop:()=>control.stop(),clear:()=>control.clear(),send:text=>recognizer.onresult({results:[[{transcript:text}]]}),recognizer:()=>recognizer,results,previews,get calls(){return calls},get aborted(){return aborted},get state(){return state},cleanup:()=>{for(const effect of effects){const dispose=effect();dispose?.()}}};
}
const after=readFileSync('src/components/VoiceCapture.tsx','utf8');
let before;try{before=execFileSync('git',['show','2da1c07:src/components/VoiceCapture.tsx'],{encoding:'utf8',stdio:['ignore','pipe','ignore']})}catch{}
if(before){const old=harness(before);await old.start();await old.stop();await wait(300);assert.equal(old.results[0]?.text,wrong);old.cleanup();console.log('REPRODUCED: previous component rewrites a correct name on Stop')}
assert.equal(appendSpeechTail('with Arumugam','with Arumugamm tomorrow'),'with Arumugam');
assert.equal(appendSpeechTail('With Arumugam.','with Arumugam tomorrow'),'With Arumugam. tomorrow');
for(const revision of ['sync','late']){
 const h=harness(after,{revision});await h.start();await h.stop();await wait(300);
 assert.deepEqual(h.results,[{text:correct,source:'live'}]);assert.equal(h.calls,0);assert(!h.previews.includes(wrong));h.cleanup();
}
console.log('PASS correct Stop snapshot survives synchronous and delayed speech finalization with zero API calls');
const extension=harness(after,{revision:'extend'});await extension.start();await extension.stop();await wait(300);assert.deepEqual(extension.results,[{text:correct+' Please bring the slides.',source:'live'}]);assert.equal(extension.calls,0);extension.cleanup();console.log('PASS final words can append without rewriting the already-visible name');
const late=harness(after,{revision:'none',live:false});await late.start();await late.stop();await wait(300);assert.equal(late.calls,1);late.send(correct);await wait(100);assert.deepEqual(late.results,[{text:correct,source:'live'}]);assert.equal(late.aborted,1);late.cleanup();console.log('PASS live text arriving during fallback aborts the API and is committed exactly once');
const ignored=harness(after,{revision:'none',live:false,ignoreAbort:true});await ignored.start();await ignored.stop();await wait(100);ignored.send(correct);await wait(700);assert.deepEqual(ignored.results,[{text:correct,source:'live'}]);ignored.cleanup();console.log('PASS even an uncooperative late service response cannot replace accepted live text');
const noLive=harness(after,{revision:'none',live:false});await noLive.start();await noLive.stop();await wait(750);assert.deepEqual(noLive.results,[{text:wrong,source:'service'}]);noLive.cleanup();console.log('PASS audio API remains a single fallback when there is no live text');
const stale=harness(after,{revision:'none'});await stale.start();const previous=stale.recognizer();await stale.stop();await wait(300);stale.clear();await stale.start();previous.onresult({results:[[{transcript:wrong}]]});await stale.stop();await wait(300);assert.deepEqual(stale.results,[{text:correct,source:'live'},{text:correct,source:'live'}]);stale.cleanup();console.log('PASS late callbacks from an older recording cannot overwrite a new recording');
