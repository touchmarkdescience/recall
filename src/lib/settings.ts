import { randomUUID } from 'node:crypto';
import { row, rows, run } from './db';
import { sttProvider, type SttProvider } from './stt';

export type Settings={pushEnabled:boolean;reminderMinutes:number;sheetWebhookUrl:string;sheetConnected:boolean;syncPending:number;transcriptionProvider:SttProvider};
type Stored={push_enabled:number;reminder_minutes:number;sheet_webhook_url:string|null;sheet_secret:string|null;transcription_provider:string|null};
export function ensureSettings(userId:string){run('INSERT OR IGNORE INTO user_settings(user_id,updated_at) VALUES(?,?)',userId,new Date().toISOString());}
export function getSettings(userId:string):Settings{
  ensureSettings(userId);
  const s=row<Stored>('SELECT push_enabled,reminder_minutes,sheet_webhook_url,sheet_secret,transcription_provider FROM user_settings WHERE user_id=?',userId)!;
  const pending=row<{count:number}>('SELECT COUNT(*) AS count FROM sheet_outbox WHERE user_id=? AND synced_at IS NULL',userId)?.count||0;
  return {pushEnabled:!!s.push_enabled,reminderMinutes:s.reminder_minutes,sheetWebhookUrl:s.sheet_webhook_url||'',sheetConnected:!!(s.sheet_webhook_url&&s.sheet_secret),syncPending:pending,transcriptionProvider:sttProvider(s.transcription_provider)};
}
export function enqueueSheetEvent(userId:string,payload:Record<string,unknown>){run('INSERT INTO sheet_outbox(id,user_id,payload_json,created_at) VALUES(?,?,?,?)',randomUUID(),userId,JSON.stringify(payload),new Date().toISOString());}
export async function flushSheetOutbox(userId:string){
  ensureSettings(userId);
  const config=row<{url:string|null;secret:string|null}>('SELECT sheet_webhook_url AS url,sheet_secret AS secret FROM user_settings WHERE user_id=?',userId);
  if(!config?.url||!config.secret)return {sent:0,pending:getSettings(userId).syncPending};
  let sent=0;
  const jobs=rows<{id:string;payload:string}>('SELECT id,payload_json AS payload FROM sheet_outbox WHERE user_id=? AND synced_at IS NULL ORDER BY created_at LIMIT 100',userId);
  for(const job of jobs){
    try{
      const payload=JSON.parse(job.payload) as Record<string,unknown>;
      const sheetPayload={...payload,...((payload.type==='action'||payload.type==='interaction')&&!payload.contactName?{contactName:'Guest'}:{})};
      const response=await fetch(config.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({secret:config.secret,eventId:job.id,...sheetPayload}),signal:AbortSignal.timeout(10000)});
      const result=await response.json();
      if(!response.ok||result?.ok!==true)throw new Error(String(result?.error||`Sheet response ${response.status}`));
      run('UPDATE sheet_outbox SET synced_at=?,error=NULL WHERE id=? AND user_id=?',new Date().toISOString(),job.id,userId);sent++;
    }catch(e){run('UPDATE sheet_outbox SET error=? WHERE id=? AND user_id=?',String(e instanceof Error?e.message:e).slice(0,300),job.id,userId);break;}
  }
  return {sent,pending:getSettings(userId).syncPending};
}
