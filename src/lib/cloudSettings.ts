import 'server-only';
import { randomUUID } from 'node:crypto';
import { cloud, dataOrThrow } from './cloud';
import type { Settings } from './settings';

type Stored={push_enabled:boolean;reminder_minutes:number;sheet_webhook_url:string|null;sheet_secret:string|null};

export async function ensureCloudSettings(userId:string) {
  dataOrThrow(await cloud().from('recall_user_settings').upsert({user_id:userId},{onConflict:'user_id',ignoreDuplicates:true}).select('user_id'));
}

export async function getCloudSettings(userId:string):Promise<Settings> {
  await ensureCloudSettings(userId);
  const s=dataOrThrow(await cloud().from('recall_user_settings').select('push_enabled,reminder_minutes,sheet_webhook_url,sheet_secret').eq('user_id',userId).single()) as Stored;
  const pending=await cloud().from('recall_sheet_outbox').select('id',{count:'exact',head:true}).eq('user_id',userId).is('synced_at',null);
  if(pending.error)throw new Error(pending.error.message);
  return {pushEnabled:s.push_enabled,reminderMinutes:s.reminder_minutes,sheetWebhookUrl:s.sheet_webhook_url||'',sheetConnected:Boolean(s.sheet_webhook_url&&s.sheet_secret),syncPending:pending.count||0};
}

export async function enqueueCloudSheetEvent(userId:string,payload:Record<string,unknown>) {
  dataOrThrow(await cloud().from('recall_sheet_outbox').insert({id:randomUUID(),user_id:userId,payload_json:payload}).select('id').single());
}

export async function flushCloudSheetOutbox(userId:string) {
  await ensureCloudSettings(userId);
  const config=dataOrThrow(await cloud().from('recall_user_settings').select('sheet_webhook_url,sheet_secret').eq('user_id',userId).single()) as Stored;
  if(!config.sheet_webhook_url||!config.sheet_secret)return {sent:0,pending:(await getCloudSettings(userId)).syncPending};
  const jobs=dataOrThrow(await cloud().from('recall_sheet_outbox').select('id,payload_json').eq('user_id',userId).is('synced_at',null).order('created_at').limit(100));
  let sent=0;
  for(const job of jobs) {
    try {
      const response=await fetch(config.sheet_webhook_url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({secret:config.sheet_secret,eventId:job.id,...job.payload_json}),signal:AbortSignal.timeout(10000)});
      const result=await response.json();
      if(!response.ok||result?.ok!==true)throw new Error(String(result?.error||`Sheet response ${response.status}`));
      dataOrThrow(await cloud().from('recall_sheet_outbox').update({synced_at:new Date().toISOString(),error:null}).eq('id',job.id).eq('user_id',userId).select('id'));
      sent++;
    } catch(error) {
      dataOrThrow(await cloud().from('recall_sheet_outbox').update({error:String(error instanceof Error?error.message:error).slice(0,300)}).eq('id',job.id).eq('user_id',userId).select('id'));
      break;
    }
  }
  return {sent,pending:(await getCloudSettings(userId)).syncPending};
}
