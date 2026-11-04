'use client';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Mic, Square } from 'lucide-react';
import { getLocalClip, saveLocalClip } from '@/lib/localAudio';
import { PcmCapture, isIosDevice } from '@/lib/pcmCapture';
import { blobBase64, transcriptionPayload } from '@/lib/transcription';

const BAR_COUNT=23;
type SpeechPreview={continuous:boolean;interimResults:boolean;lang:string;onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;onerror:((event:{error:string})=>void)|null;start:()=>void;stop:()=>void};
type SpeechWindow=Window & {SpeechRecognition?:new()=>SpeechPreview;webkitSpeechRecognition?:new()=>SpeechPreview};
export type VoiceState='idle'|'recording'|'processing';
export type VoiceControl={start:()=>Promise<void>;stop:()=>Promise<void>;toggle:()=>Promise<void>;leave:()=>void;clear:()=>void;state:()=>VoiceState};
type Props={ownerId:string;language:'en'|'ta';transcriptionConfigured:boolean;provider:string;onTranscript:(text:string)=>void;onLiveTranscript:(text:string)=>void;onError:(message:string)=>void;onRecordingStart:()=>void;onRecorderState:(state:VoiceState)=>void;controlRef:Ref<VoiceControl>};

export default function VoiceCapture({ownerId,language,transcriptionConfigured,provider,onTranscript,onLiveTranscript,onError,onRecordingStart,onRecorderState,controlRef}:Props){
  const [recording,setRecording]=useState(false);
  const [working,setWorking]=useState(false);
  const [status,setStatus]=useState(transcriptionConfigured?'Tap the mic. Audio saves on this device before transcription.':'Tap the mic to save audio on this device. You can type the note below.');
  const [seconds,setSeconds]=useState(0);
  const bars=useRef<(HTMLSpanElement|null)[]>([]);
  const recorder=useRef<MediaRecorder|null>(null);
  const speech=useRef<SpeechPreview|null>(null);
  const retryClip=useRef('');
  const pcm=useRef<PcmCapture|null>(null);
  const stream=useRef<MediaStream|null>(null);
  const context=useRef<AudioContext|null>(null);
  const frame=useRef<number>(0);
  const tick=useRef<ReturnType<typeof setInterval>|null>(null);
  const languageRef=useRef(language);
  const mounted=useRef(true);
  const starting=useRef(false);
  const cancelStart=useRef(false);
  const processing=useRef(false);
  function actualState():VoiceState{return pcm.current?.isRecording||recorder.current?.state==='recording'?'recording':starting.current||processing.current?'processing':'idle'}
  function emitState(){const state=actualState();setRecording(state==='recording');onRecorderState(state)}
  function setProcessing(value:boolean){processing.current=value;setWorking(value);emitState()}
  useImperativeHandle(controlRef,()=>({start,stop,toggle:async()=>{if(actualState()==='recording')await stop();else if(actualState()==='idle')await start()},leave:()=>{if(starting.current){cancelStart.current=true;pcm.current?.cancel()}else if(actualState()==='recording')void stop()},clear:()=>{if(actualState()!=='idle')return;retryClip.current='';setSeconds(0);setStatus(transcriptionConfigured?'Tap the mic. Audio saves on this device before transcription.':'Tap the mic to save audio on this device. You can type the note below.')},state:actualState}));
  useEffect(()=>{languageRef.current=language},[language]);
  useEffect(()=>{
    mounted.current=true;
    const retryOnline=()=>{if(retryClip.current&&actualState()==='idle')void transcribe(retryClip.current)};
    window.addEventListener('online',retryOnline);
    return()=>{mounted.current=false;window.removeEventListener('online',retryOnline);speech.current?.stop();stopMeter();pcm.current?.cancel();if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(track=>track.stop())};
  },[ownerId]);
  function startSpeechPreview(){
    const browser=window as SpeechWindow;
    const Recognition=browser.SpeechRecognition||browser.webkitSpeechRecognition;
    if(!Recognition){setStatus('Recording. Live text is unavailable here; Gemini transcribes automatically when you stop.');return}
    try{
      const preview=new Recognition();preview.continuous=true;preview.interimResults=true;preview.lang=languageRef.current==='ta'?'ta-IN':'en-IN';
      preview.onresult=event=>{if(actualState()!=='recording')return;const text=Array.from(event.results).map(result=>result[0]?.transcript||'').join(' ').trim();if(text)onLiveTranscript(text)};
      preview.onerror=()=>{speech.current=null;if(actualState()==='recording')setStatus('Recording. Gemini will transcribe the saved audio when you stop.')};
      speech.current=preview;preview.start();
    }catch{speech.current=null;setStatus('Recording. Gemini will transcribe the saved audio when you stop.')}
  }

  function stopMeter(){
    if(frame.current)cancelAnimationFrame(frame.current);
    if(tick.current)clearInterval(tick.current);
    tick.current=null;
    context.current?.close().catch(()=>{});context.current=null;
    bars.current.forEach(bar=>{if(bar)bar.style.height='5px'});
  }
  function startClock(){
    const started=Date.now();setSeconds(0);
    tick.current=setInterval(()=>{const elapsed=Math.floor((Date.now()-started)/1000);setSeconds(elapsed);if(elapsed>=59)void stop()},1000);
  }
  function paintPcmLevel(level:number){
    const amplitude=Math.min(1,level*12);
    for(let i=0;i<BAR_COUNT;i++){
      const motion=.45+.55*Math.abs(Math.sin(i*.71+Date.now()/170));
      if(bars.current[i])bars.current[i]!.style.height=`${Math.round(5+43*amplitude*motion)}px`;
    }
  }
  async function transcribe(id:string){
    if(!transcriptionConfigured){setStatus('Audio saved on this device. Type the note below, or configure transcription.');setProcessing(false);return}
    setProcessing(true);setStatus('Transcribing your saved recording…');
    try{
      const clip=await getLocalClip(id);
      if(!clip||clip.ownerId!==ownerId)throw new Error('The local recording could not be found.');
      if(clip.blob.size>2_000_000)throw new Error('The recording is too large for transcription. Please record a shorter note.');
      const body=transcriptionPayload(await blobBase64(clip.blob),clip.blob.type);
      let final='';
      for(let attempt=0;attempt<2;attempt++){
        try{
          const response=await fetch('/api/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
          const result=await response.json();
          if(!response.ok){const failure=new Error(result.error||'Transcription failed') as Error & {retryable?:boolean};failure.retryable=response.status===429||response.status>=500;throw failure}
          final=String(result.transcript||'').trim();
          if(!final)throw new Error('No speech was heard. Please try again or type the note.');
          break;
        }catch(error){if(attempt===1||(error instanceof Error&&(error as Error & {retryable?:boolean}).retryable===false)||error instanceof SyntaxError||error instanceof Error&&/No speech was heard/.test(error.message))throw error;setStatus('Transcription interrupted. Retrying saved audio…')}
      }
      retryClip.current='';
      if(mounted.current)onTranscript(final);
      setStatus(`Transcript ready via ${provider}. Review and correct the text before saving.`);
    }catch(error){retryClip.current=id;onError(error instanceof Error?error.message:String(error));setStatus('Audio is saved on this device. Recall will retry when you reconnect; you can also edit the text below.');}
    finally{setProcessing(false)}
  }
  async function saveAndTranscribe(blob:Blob){
    setProcessing(true);setStatus('Saving the recording on this device…');
    try{
      if(!blob.size)throw new Error('No audio was captured. Please try again.');
      const id=crypto.randomUUID();
      await saveLocalClip({id,ownerId,blob,recordedAt:new Date().toISOString(),language:languageRef.current});
      if(!mounted.current)return;
      setStatus('Saved on this device.');
      await transcribe(id);
    }catch(error){if(mounted.current){onError(error instanceof Error?error.message:String(error));setStatus('Recording could not be saved. Please try again.');setProcessing(false)}}
  }
  async function start(){
    if(actualState()!=='idle')return;
    starting.current=true;cancelStart.current=false;setWorking(true);emitState();onLiveTranscript('');
    const ios=isIosDevice(navigator.userAgent,navigator.platform,navigator.maxTouchPoints);
    if(!navigator.mediaDevices?.getUserMedia||(!ios&&typeof MediaRecorder==='undefined')){starting.current=false;setWorking(false);emitState();onError('Audio recording is unavailable in this browser.');return}
    try{
      if(ios){
        const capture=new PcmCapture({onError:message=>{onError(message);starting.current=false;setProcessing(false);stopMeter()},onLevel:paintPcmLevel,onLimit:()=>{void stop()}});
        pcm.current=capture;
        if(!await capture.start()){starting.current=false;pcm.current=null;setWorking(false);emitState();return}
        starting.current=false;setWorking(false);emitState();onRecordingStart();setStatus('Recording now. Tap the stop square when finished.');startClock();startSpeechPreview();return;
      }
      const media=await navigator.mediaDevices.getUserMedia({audio:{channelCount:{ideal:1},echoCancellation:true,noiseSuppression:true}});
      if(cancelStart.current){media.getTracks().forEach(track=>track.stop());starting.current=false;setWorking(false);emitState();return}
      stream.current=media;
      const chunks:Blob[]=[];
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type))||'';
      const nextRecorder=new MediaRecorder(media,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:64000});
      recorder.current=nextRecorder;
      nextRecorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);if(chunks.reduce((total,part)=>total+part.size,0)>1_850_000&&nextRecorder.state==='recording')void stop()};
      nextRecorder.onstop=async()=>{stopMeter();media.getTracks().forEach(track=>track.stop());recorder.current=null;emitState();const blob=new Blob(chunks,{type:nextRecorder.mimeType||'audio/webm'});await saveAndTranscribe(blob)};
      nextRecorder.onerror=()=>{stopMeter();media.getTracks().forEach(track=>track.stop());recorder.current=null;onError('Could not record audio. Please retry or type the note.');starting.current=false;setProcessing(false)};
      const audioContext=new AudioContext();context.current=audioContext;
      const source=audioContext.createMediaStreamSource(media);
      const analyser=audioContext.createAnalyser();analyser.fftSize=512;analyser.smoothingTimeConstant=.66;source.connect(analyser);
      const values=new Uint8Array(analyser.frequencyBinCount);
      const animate=()=>{analyser.getByteFrequencyData(values);for(let i=0;i<BAR_COUNT;i++){const low=Math.floor(i*values.length/BAR_COUNT);const high=Math.max(low+1,Math.floor((i+1)*values.length/BAR_COUNT));let sum=0;for(let n=low;n<high;n++)sum+=values[n];const level=sum/(high-low)/255;const height=Math.max(5,Math.min(48,5+Math.pow(level,1.15)*95));if(bars.current[i])bars.current[i]!.style.height=`${height}px`}frame.current=requestAnimationFrame(animate)};
      nextRecorder.start(1000);starting.current=false;setWorking(false);emitState();onRecordingStart();setStatus('Recording now. Tap the stop square when finished.');startClock();startSpeechPreview();animate();
    }catch(error){pcm.current?.cancel();pcm.current=null;stream.current?.getTracks().forEach(track=>track.stop());stopMeter();starting.current=false;setProcessing(false);onError(error instanceof Error&&error.name==='NotAllowedError'?'Microphone permission was denied. Allow microphone access in your browser settings and try again.':error instanceof Error?error.message:String(error));setStatus('Microphone access was not available.')}
  }
  async function stop(){
    if(actualState()!=='recording')return;
    speech.current?.stop();speech.current=null;
    if(pcm.current){const capture=pcm.current;pcm.current=null;setProcessing(true);setStatus('Finishing recording…');stopMeter();const blob=await capture.stop();if(blob)await saveAndTranscribe(blob);else{onError('No speech was heard. Please try again or type the note.');setProcessing(false)}return}
    if(recorder.current?.state==='recording'){recorder.current.stop();setStatus('Finishing recording…');stopMeter();setProcessing(true)}
  }
  return <div className={`capture-card voice-capture ${recording?'is-recording':''}`}>
    <button className={`mic-button ${recording?'recording':''}`} onClick={recording?stop:start} disabled={working} aria-label={recording?'Stop recording':'Start recording'}>{recording?<Square size={27} fill="currentColor"/>:<Mic size={31}/>}</button>
    <strong>{recording?`Recording · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:working?'Processing your recording…':'Record a voice note'}</strong>
    <span role="status">{status}</span>
    <div className="live-wave" aria-label={recording?'Live microphone level':'Microphone is idle'}>{Array.from({length:BAR_COUNT},(_,i)=><span key={i} ref={element=>{bars.current[i]=element}}/>)}</div>
    {transcriptionConfigured&&<small className="voice-provider">Saved on device first · Final transcript by {provider}</small>}
  </div>;
}
