import 'server-only';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { TRANSCRIPTION_PROMPT, transcribeWithFallback } from './transcription';

export type SttProvider='groq'|'gemini';
export const defaultSttProvider=():SttProvider=>process.env.STT_PROVIDER==='gemini'?'gemini':'groq';
export const sttProvider=(value:unknown):SttProvider=>value==='gemini'||value==='groq'?value:defaultSttProvider();
export const sttConfigured=(provider:SttProvider)=>Boolean(provider==='groq'?process.env.GROQ_API_KEY:process.env.GEMINI_API_KEY);
export const sttLabel=(provider:SttProvider)=>provider==='groq'?'Groq Whisper':'Google Gemini';
const output=z.object({transcript:z.string().max(8000)});
export type AudioFile={bytes:Buffer;mime:'audio/webm'|'audio/mp4'|'audio/ogg'|'audio/wav'};

async function geminiTranscribe(file:AudioFile):Promise<string>{
  const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY!});
  const result=await transcribeWithFallback((model,timeout)=>ai.models.generateContent({
    model,
    contents:[{role:'user',parts:[
      {inlineData:{data:file.bytes.toString('base64'),mimeType:file.mime==='audio/mp4'?'audio/m4a':file.mime}},
      {text:TRANSCRIPTION_PROMPT},
    ]}],
    config:{httpOptions:{timeout,retryOptions:{attempts:1}},responseMimeType:'application/json',responseJsonSchema:z.toJSONSchema(output),temperature:0,candidateCount:1,maxOutputTokens:2048},
  }),process.env.GEMINI_TRANSCRIPTION_MODEL);
  return output.parse(JSON.parse(result.text??'{}')).transcript;
}

async function groqTranscribe(file:AudioFile):Promise<string>{
  const upload=new FormData();
  const extension=file.mime==='audio/mp4'?'mp4':file.mime==='audio/ogg'?'ogg':file.mime==='audio/wav'?'wav':'webm';
  upload.set('file',new Blob([new Uint8Array(file.bytes)],{type:file.mime}),`note.${extension}`);
  upload.set('model',process.env.STT_MODEL?.trim()||'whisper-large-v3-turbo');
  upload.set('language',process.env.STT_LANGUAGE?.trim()||'en');
  upload.set('temperature','0');
  upload.set('response_format','text');
  const hint=process.env.STT_VOCAB_HINT?.trim().slice(0,200);
  if(hint)upload.set('prompt',hint);
  const response=await fetch('https://api.groq.com/openai/v1/audio/transcriptions',{
    method:'POST',headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`},body:upload,signal:AbortSignal.timeout(45000),
  });
  if(!response.ok)throw Object.assign(new Error('Groq transcription failed'),{status:response.status});
  return (await response.text()).trim();
}

export async function transcribeAudio(file:AudioFile,provider:SttProvider):Promise<string>{
  if(!sttConfigured(provider))throw new Error(`${sttLabel(provider)} is not configured.`);
  return provider==='groq'?groqTranscribe(file):geminiTranscribe(file);
}
