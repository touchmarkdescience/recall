import 'server-only';
import { randomUUID } from 'node:crypto';
import { cloud, dataOrThrow } from './cloud';
import type { Settings } from './settings';
import { sttProvider } from './stt';

type Stored={push_enabled:boolean;reminder_minutes:number;sheet_webhook_url:string|null;sheet_secret:string|null;transcription_provider:string|null};

export async function ensureCloudSettings(userId:string) {
  dataOrThrow(await cloud().from('recall_user_settings').upsert({user_id:userId},{onConflict:'user_id',ignoreDuplicates:true}).select('user_id'));
}

async function storedSettings(userId:string):Promise<Stored> {
  const result=await cloud().from('recall_user_settings').select('push_enabled,reminder_minutes,sheet_webhook_url,sheet_secret,transcription_provider').eq('user_id',userId).maybeSingle();
  if(result.error)throw new Error(result.error.message);
  if(result.data)return result.data as Stored;
  // Initialize only genuinely missing rows; ordinary reads must not write.
  await ensureCloudSettings(userId);
  return dataOrThrow(await cloud().from('recall_user_settings').select('push_enabled,reminder_minutes,sheet_webhook_url,sheet_secret,transcription_provider').eq('user_id',userId).single()) as Stored;
}

async function pendingSheetCount(userId:string) {
  const result=await cloud().from('recall_sheet_outbox').select('id',{count:'exact',head:true}).eq('user_id',userId).is('synced_at',null);
  if(result.error)throw new Error(result.error.message);
  return result.count||0;
}

export async function getCloudTranscriptionProvider(userId:string) {
  const result=await cloud().from('recall_user_settings').select('transcription_provider').eq('user_id',userId).maybeSingle();
  if(result.error)throw new Error(result.error.message);
  return sttProvider(result.data?.transcription_provider);
}

export async function getCloudSettings(userId:string):Promise<Settings> {
  const [s,pending]=await Promise.all([storedSettings(userId),pendingSheetCount(userId)]);
  return {pushEnabled:s.push_enabled,reminderMinutes:s.reminder_minutes,sheetWebhookUrl:s.sheet_webhook_url||'',sheetConnected:Boolean(s.sheet_webhook_url&&s.sheet_secret),syncPending:pending,transcriptionProvider:sttProvider(s.transcription_provider)};
}

export async function enqueueCloudSheetEvent(userId:string,payload:Record<string,unknown>) {
  dataOrThrow(await cloud().from('recall_sheet_outbox').insert({id:randomUUID(),user_id:userId,payload_json:payload}).select('id').single());
}

export async function flushCloudSheetOutbox(userId:string) {
  const [result,pending]=await Promise.all([
    cloud().from('recall_user_settings').select('sheet_webhook_url,sheet_secret').eq('user_id',userId).maybeSingle(),
    pendingSheetCount(userId),
  ]);
  if(result.error)throw new Error(result.error.message);
  const config=result.data as Pick<Stored,'sheet_webhook_url'|'sheet_secret'>|null;
  if(!config?.sheet_webhook_url||!config.sheet_secret)return {sent:0,pending};
  const jobs=dataOrThrow(await cloud().from('recall_sheet_outbox').select('id,payload_json').eq('user_id',userId).is('synced_at',null).order('created_at').limit(100));
  let sent=0;
  for(const job of jobs) {
    try {
      const payload=job.payload_json as Record<string,unknown>;
      const sheetPayload={...payload,...((payload.type==='action'||payload.type==='interaction')&&!payload.contactName?{contactName:'Guest'}:{})};
      const response=await fetch(config.sheet_webhook_url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({secret:config.sheet_secret,eventId:job.id,...sheetPayload}),signal:AbortSignal.timeout(10000)});
      const result=await response.json();
      if(!response.ok||result?.ok!==true)throw new Error(String(result?.error||`Sheet response ${response.status}`));
      dataOrThrow(await cloud().from('recall_sheet_outbox').update({synced_at:new Date().toISOString(),error:null}).eq('id',job.id).eq('user_id',userId).select('id'));
      sent++;
    } catch(error) {
      dataOrThrow(await cloud().from('recall_sheet_outbox').update({error:String(error instanceof Error?error.message:error).slice(0,300)}).eq('id',job.id).eq('user_id',userId).select('id'));
      break;
    }
  }
  return {sent,pending:await pendingSheetCount(userId)};
}
