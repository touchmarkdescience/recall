import { validReminder } from '@/lib/reminders';
import { safeFailure } from '@/lib/serverErrors';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import webpush from 'web-push';
import { clearSession, currentUser, passwordHash, passwordValid, setSession } from '@/lib/auth';
import { db, row, rows, run } from '@/lib/db';
import { extract, type DraftAction } from '@/lib/extract';
import { enqueueSheetEvent, flushSheetOutbox, getSettings } from '@/lib/settings';
import { cloudConfigured } from '@/lib/cloud';
import { cloudGET, cloudPOST, cloudDELETE, cloudDispatch } from '@/lib/cloudRoutes';
import { defaultSttProvider, sttConfigured, sttLabel, type SttProvider } from '@/lib/stt';

export const runtime='nodejs';
type Context={params:Promise<{path:string[]}>};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status});
const error=(message:string,status=400)=>json({error:message},status);
const now=()=>new Date().toISOString();
const clean=(x:unknown)=>String(x??'').trim();
const onlyMine=async()=>{const user=await currentUser(); if(!user) throw new Error('Unauthorized'); return user;};
const asError=(e:unknown)=>e instanceof Error&&e.message==='Unauthorized'?error('Unauthorized',401):safeFailure(e,'/api/[...path]');
function sameOrigin(req:NextRequest) { const origin=req.headers.get('origin'); if(!origin)return true;try{return new URL(origin).host===req.headers.get('host')}catch{return false} }

export async function GET(req:NextRequest,{params}:Context) {
  if(cloudConfigured())return cloudGET(req,{params});
  if(process.env.NODE_ENV==='production')return error('Production database is not configured.',503);
  try {
    const path=(await params).path.join('/');
    if(path==='me') {const user=await currentUser(),provider=user?getSettings(user.id).transcriptionProvider:defaultSttProvider();return json({user,accountDeletionAvailable:true,aiMode:process.env.OPENAI_API_KEY?'AI':'Local rules',transcriptionConfigured:sttConfigured(provider),transcriptionProvider:sttLabel(provider),pushConfigured:!!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY),vapidPublicKey:process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY||''})}
    const user=await onlyMine();
    if(path==='settings') return json(getSettings(user.id));
    if(path==='dashboard') {
      getSettings(user.id);
      const contacts=rows('SELECT id,name,phone,created_at AS createdAt FROM contacts WHERE user_id=? ORDER BY name COLLATE NOCASE',user.id);
      const actions=rows('SELECT a.id,COALESCE(a.contact_id,\'\') AS contactId,COALESCE(c.name,\'\') AS contactName,a.kind,a.title,a.due_at AS dueAt,a.time_specified AS timeSpecified,a.duration_minutes AS durationMinutes,a.reminder_minutes AS reminderMinutes,a.status,a.created_at AS createdAt,i.transcript AS originalNote FROM actions a LEFT JOIN contacts c ON c.id=a.contact_id LEFT JOIN interactions i ON i.id=a.interaction_id AND i.user_id=a.user_id WHERE a.user_id=? ORDER BY CASE WHEN a.status=? THEN 0 ELSE 1 END,a.due_at IS NULL,a.due_at,a.created_at DESC LIMIT 1000',user.id,'pending');
      const interactions=rows('SELECT i.id,COALESCE(i.contact_id,\'\') AS contactId,COALESCE(c.name,\'\') AS contactName,i.summary,i.transcript,i.occurred_at AS occurredAt FROM interactions i LEFT JOIN contacts c ON c.id=i.contact_id WHERE i.user_id=? ORDER BY i.occurred_at DESC LIMIT 30',user.id);
      return json({contacts,actions,interactions});
    }
    if(path==='contact') {
      const id=req.nextUrl.searchParams.get('id')||'';
      const contact=row('SELECT id,name,phone,created_at AS createdAt FROM contacts WHERE id=? AND user_id=?',id,user.id);
      if(!contact) return error('Contact not found',404);
      return json({contact,interactions:rows('SELECT id,transcript,summary,occurred_at AS occurredAt FROM interactions WHERE contact_id=? AND user_id=? ORDER BY occurred_at DESC',id,user.id),actions:rows('SELECT a.id,a.kind,a.title,a.due_at AS dueAt,a.time_specified AS timeSpecified,a.duration_minutes AS durationMinutes,a.reminder_minutes AS reminderMinutes,a.status,a.created_at AS createdAt,i.summary AS conversationSummary FROM actions a LEFT JOIN interactions i ON i.id=a.interaction_id AND i.user_id=a.user_id WHERE a.contact_id=? AND a.user_id=? ORDER BY a.created_at DESC',id,user.id)});
    }
    return error('Not found',404);
  } catch(e) {return asError(e);}
}

export async function POST(req:NextRequest,context:Context){
  const saving=req.nextUrl.pathname==='/api/save';
  try{
    const result=await handlePOST(req,context);
    if(!saving||result.ok)return result;
    const failure=await result.json();
    if(result.status===400&&failure.error==='Choose a reminder offset from the list.')return NextResponse.json({error:'Choose an advance preset, or add a separate reminder at any date and time. Your text is kept.'},{status:400});
    if(failure.reference)return NextResponse.json({...failure,error:"Couldn't save. Your text is kept, please retry."},{status:result.status});
    return safeFailure(failure.error,'/api/save',result.status,true,req.headers.get('x-recall-reference'));
  }catch(cause){return safeFailure(cause,saving?'/api/save':'/api/[...path]',500,saving,req.headers.get('x-recall-reference'))}
}

async function handlePOST(req:NextRequest,{params}:Context) {
  if(cloudConfigured())return cloudPOST(req,{params});
  if(process.env.NODE_ENV==='production')return error('Production database is not configured.',503);
  try {
    if(!sameOrigin(req)) return error('Invalid origin',403);
    const path=(await params).path.join('/');
    const body=await req.json();
    if(path==='register') {
      const email=clean(body.email).toLowerCase(), name=clean(body.name), password=String(body.password||'');
      if(!/^\S+@\S+\.\S+$/.test(email)||!name||password.length<8) return error('Enter a name, valid email, and password of at least 8 characters.');
      if(row('SELECT id FROM users WHERE email=?',email)) return error('An account with this email already exists.');
      const id=randomUUID();run('INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,?,?)',id,email,name,passwordHash(password),now());const token=await setSession(id);return json({ok:true,...(req.headers.get('x-recall-client')==='native'?{token}:{})});
    }
    if(path==='login') {
      const email=clean(body.email).toLowerCase(), password=String(body.password||'');
      const user=row<{id:string;password_hash:string}>('SELECT id,password_hash FROM users WHERE email=?',email);
      if(!user||!passwordValid(password,user.password_hash)) return error('Email or password is incorrect.',401);
      const token=await setSession(user.id);return json({ok:true,...(req.headers.get('x-recall-client')==='native'?{token}:{})});
    }
    if(path==='logout') {await clearSession();return json({ok:true});}
    const user=await onlyMine();
    if(path==='extract') {
      const transcript=clean(body.transcript);
      if(transcript.length<3||transcript.length>10000) return error('Enter a note between 3 and 10,000 characters.');
      const result=await extract(transcript);
      const contacts=rows<{id:string;name:string}>('SELECT id,name FROM contacts WHERE user_id=?',user.id);
      const normalized=(s:string)=>s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
      const matched=contacts.find(c=>normalized(c.name)===normalized(result.contactName))||contacts.find(c=>normalized(c.name).includes(normalized(result.contactName))&&result.contactName.length>=3);
      return json({...result,matchedContactId:matched?.id||null});
    }
    if(path==='save') {
      const transcript=clean(body.transcript), summary=clean(body.summary);
      if(transcript.length<3||!summary) return error('A note and summary are required.');
      const occurredAt=body.occurredAt===undefined?now():clean(body.occurredAt);
      if(!DateTime.fromISO(occurredAt).isValid||DateTime.fromISO(occurredAt).toMillis()>Date.now()) return error('Conversation time cannot be in the future. Choose when you spoke in IST.');
      let contactId=clean(body.contactId), contactName=clean(body.contactName);
      const actions=Array.isArray(body.actions)?body.actions as DraftAction[]:[];
      if(actions.some(action=>!validReminder(action.reminderMinutes??0)))return error('Choose a reminder offset from the list.');
      if(actions.length>20) return error('Too many actions in one note.');
      if(actions.some(action=>action.timeSpecified===true&&!action.dueAt))return error('Set the spoken time before saving.');
      if(actions.some(action=>(action.timeChoices?.length||0)>1))return error('Choose one of the spoken times before saving.');
      for(const action of actions) if(!['follow_up','reminder','meeting'].includes(action.kind)||!clean(action.title)||action.title.length>500||(action.dueAt&&!DateTime.fromISO(action.dueAt).isValid)||!Number.isInteger(action.durationMinutes??30)||(action.durationMinutes??30)<15||(action.durationMinutes??30)>480) return error('Review the action titles, dates, and durations.');
      if(actions.some(action=>action.dueAt&&action.timeSpecified!==false&&DateTime.fromISO(action.dueAt).toMillis()<Date.now())) return error('A timed action cannot be scheduled in the past. Choose a later time in IST.');
      const transaction=db();transaction.exec('BEGIN');
      try {
        if(contactId) {const contact=row('SELECT id FROM contacts WHERE id=? AND user_id=?',contactId,user.id);if(!contact) throw new Error('Contact not found');}
        else if(contactName) {if(contactName.length>120) throw new Error('Person name is too long');contactId=randomUUID();run('INSERT INTO contacts(id,user_id,name,created_at) VALUES(?,?,?,?)',contactId,user.id,contactName,now());}
        const interactionId=randomUUID();
        run('INSERT INTO interactions(id,user_id,contact_id,transcript,summary,occurred_at,created_at) VALUES(?,?,?,?,?,?,?)',interactionId,user.id,contactId||null,transcript,summary,occurredAt,now());
        for(const action of actions) run('INSERT INTO actions(id,user_id,contact_id,interaction_id,kind,title,due_at,time_specified,duration_minutes,reminder_minutes,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',randomUUID(),user.id,contactId||null,interactionId,action.kind,clean(action.title),action.dueAt||null,action.timeSpecified===false?0:1,action.durationMinutes??30,action.reminderMinutes??0,'pending',now());
        const contact=contactId?row<{name:string}>('SELECT name FROM contacts WHERE id=? AND user_id=?',contactId,user.id):null;
        enqueueSheetEvent(user.id,{type:'interaction',interactionId,contactId:contactId||null,contactName:contact?.name||'',transcript,summary,recordedAt:now()});
        const savedActions=rows<{id:string;kind:string;title:string;dueAt:string|null;timeSpecified:number;durationMinutes:number;status:string;createdAt:string}>('SELECT id,kind,title,due_at AS dueAt,time_specified AS timeSpecified,duration_minutes AS durationMinutes,status,created_at AS createdAt FROM actions WHERE interaction_id=? AND user_id=?',interactionId,user.id);
        for(const action of savedActions)enqueueSheetEvent(user.id,{type:'action',actionId:action.id,interactionId,contactId:contactId||null,contactName:contact?.name||'',...action});
        transaction.exec('COMMIT');
        const sync=await flushSheetOutbox(user.id);
        return json({ok:true,contactId,interactionId,sheetSyncPending:sync.pending});
      } catch(e) {transaction.exec('ROLLBACK');throw e;}
    }
    if(path==='contact') {
      const id=clean(body.id),name=clean(body.name),phone=clean(body.phone);
      if(!id||!name||name.length>120) return error('Enter a contact name.');
      const result=run('UPDATE contacts SET name=?,phone=? WHERE id=? AND user_id=?',name,phone||null,id,user.id);
      return result.changes?json({ok:true}):error('Contact not found',404);
    }
    if(path==='action') {
      const id=clean(body.id),status=clean(body.status);
      if(!['pending','done','archived','removed'].includes(status)) return error('Invalid status');
      const current=row<{title:string;kind:string;dueAt:string|null;timeSpecified:number;reminderMinutes:number}>('SELECT title,kind,due_at AS dueAt,time_specified AS timeSpecified,reminder_minutes AS reminderMinutes FROM actions WHERE id=? AND user_id=?',id,user.id);
      if(!current)return error('Action not found',404);
      const reminderMinutes=body.reminderMinutes===undefined?current.reminderMinutes:body.reminderMinutes;
      if(!validReminder(reminderMinutes))return error('Choose a reminder offset from the list.');
      const title=body.title===undefined?current.title:clean(body.title);
      const kind=body.kind===undefined?current.kind:clean(body.kind);
      const dueAt=body.dueAt===undefined?current.dueAt:(body.dueAt||null);
      const timeSpecified=body.timeSpecified===undefined?current.timeSpecified:body.timeSpecified===false?0:1;
      if(!title||title.length>500||!['follow_up','reminder','meeting'].includes(kind)||(dueAt&&!DateTime.fromISO(dueAt).isValid))return error('Enter a valid title, type and date.');
      if(body.dueAt!==undefined&&dueAt&&timeSpecified!==0&&DateTime.fromISO(dueAt).toMillis()<Date.now())return error('A timed action cannot be scheduled in the past. Choose a later time in IST.');
      const result=run('UPDATE actions SET status=?,title=?,kind=?,due_at=?,time_specified=?,reminder_minutes=?,notified_at=CASE WHEN due_at IS NOT ? OR time_specified IS NOT ? OR reminder_minutes IS NOT ? OR status IS NOT ? THEN NULL ELSE notified_at END WHERE id=? AND user_id=?',status,title,kind,dueAt,timeSpecified,reminderMinutes,dueAt,timeSpecified,reminderMinutes,status,id,user.id);
      if(!result.changes)return error('Action not found',404);
      const action=row<{interactionId:string|null;contactId:string|null;contactName:string|null;kind:string;createdAt:string}>('SELECT a.interaction_id AS interactionId,a.contact_id AS contactId,c.name AS contactName,a.kind,a.created_at AS createdAt FROM actions a LEFT JOIN contacts c ON c.id=a.contact_id WHERE a.id=? AND a.user_id=?',id,user.id)!;
      enqueueSheetEvent(user.id,{type:'action',actionId:id,...action,kind,title,dueAt,timeSpecified,status,reminderMinutes});
      const sync=await flushSheetOutbox(user.id);
      return json({ok:true,sheetSyncPending:sync.pending});
    }
    if(path==='settings') {
      const pushEnabled=body.pushEnabled===true;
      const reminderMinutes=Number(body.reminderMinutes);
      if(![0,15,30,60,1440].includes(reminderMinutes))return error('Choose a reminder time from the list.');
      const transcriptionProvider=(body.transcriptionProvider??getSettings(user.id).transcriptionProvider) as SttProvider;
      if(!['groq','gemini'].includes(transcriptionProvider))return error('Choose a transcription provider from the list.');
      const sheetWebhookUrl=clean(body.sheetWebhookUrl);
      const sheetSecret=clean(body.sheetSecret);
      if(sheetWebhookUrl){try{const u=new URL(sheetWebhookUrl);const local=['127.0.0.1','localhost'].includes(u.hostname);if(!(u.protocol==='https:'&&['script.google.com','script.googleusercontent.com'].includes(u.hostname))&&!local)return error('Use an Apps Script web app URL.');}catch{return error('Enter a valid Apps Script URL.')}}
      if(sheetWebhookUrl&&sheetSecret.length<16&&!getSettings(user.id).sheetConnected)return error('Use a sheet secret of at least 16 characters.');
      const existing=row<{secret:string|null}>('SELECT sheet_secret AS secret FROM user_settings WHERE user_id=?',user.id);
      run('INSERT INTO user_settings(user_id,push_enabled,reminder_minutes,sheet_webhook_url,sheet_secret,transcription_provider,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET push_enabled=excluded.push_enabled,reminder_minutes=excluded.reminder_minutes,sheet_webhook_url=excluded.sheet_webhook_url,sheet_secret=excluded.sheet_secret,transcription_provider=excluded.transcription_provider,updated_at=excluded.updated_at',user.id,pushEnabled?'1':'0',String(reminderMinutes),sheetWebhookUrl||null,sheetWebhookUrl?(sheetSecret||existing?.secret||null):null,transcriptionProvider,now());
      if(sheetWebhookUrl)enqueueSheetEvent(user.id,{type:'ping'});
      const sync=sheetWebhookUrl?await flushSheetOutbox(user.id):{sent:0,pending:getSettings(user.id).syncPending};
      return json({...getSettings(user.id),synced:sync.sent});
    }
    if(path==='sheet/sync')return json(await flushSheetOutbox(user.id));
    if(path==='ask') {
      const question=clean(body.question),contactId=clean(body.contactId);
      if(!question) return error('Ask a question.');
      const contact=contactId?row<{id:string;name:string}>('SELECT id,name FROM contacts WHERE id=? AND user_id=?',contactId,user.id):null;
      if(contactId&&!contact) return error('Contact not found',404);
      const interactions=contact?rows<{summary:string;occurredAt:string}>('SELECT summary,occurred_at AS occurredAt FROM interactions WHERE user_id=? AND contact_id=? ORDER BY occurred_at DESC LIMIT 15',user.id,contact.id):rows<{summary:string;occurredAt:string}>('SELECT summary,occurred_at AS occurredAt FROM interactions WHERE user_id=? ORDER BY occurred_at DESC LIMIT 15',user.id);
      const actions=contact?rows<{title:string;dueAt:string|null;status:string}>('SELECT title,due_at AS dueAt,status FROM actions WHERE user_id=? AND contact_id=? ORDER BY created_at DESC LIMIT 30',user.id,contact.id):rows<{title:string;dueAt:string|null;status:string}>('SELECT title,due_at AS dueAt,status FROM actions WHERE user_id=? ORDER BY created_at DESC LIMIT 30',user.id);
      if(process.env.OPENAI_API_KEY) {
        const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',messages:[{role:'system',content:'Answer only using the supplied account records. Mention when information is absent. Dates are in Asia/Kolkata. Be concise.'},{role:'user',content:JSON.stringify({question,contact:contact?.name||null,interactions,actions})}]})});
        if(!response.ok) throw new Error(`AI request failed (${response.status})`);
        const data=await response.json();return json({answer:data.choices?.[0]?.message?.content||'No answer returned.',mode:'AI'});
      }
      const latest=interactions[0];const pending=actions.filter(a=>a.status==='pending');
      const date=(s:string)=>DateTime.fromISO(s).setZone('Asia/Kolkata').toFormat('d LLL yyyy, h:mm a');
      const answer=!latest?`I have no conversations recorded${contact?` with ${contact.name}`:''} yet.`:`${contact?`${contact.name}: `:''}Last conversation (${date(latest.occurredAt)} IST): ${latest.summary}\n\n${pending.length?`Pending: ${pending.slice(0,5).map(a=>`${a.title}${a.dueAt?` — ${date(a.dueAt)} IST`:''}`).join('; ')}`:'No pending actions recorded.'}`;
      return json({answer,mode:'Local summary'});
    }
    if(path==='push/subscribe') {
      if(!process.env.VAPID_PRIVATE_KEY||!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return error('Web Push is not configured on this server.');
      const subscription=body.subscription;
      if(!subscription?.endpoint||!subscription?.keys?.p256dh||!subscription?.keys?.auth) return error('Invalid subscription.');
      run('INSERT INTO push_subscriptions(id,user_id,endpoint,subscription_json,created_at) VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,subscription_json=excluded.subscription_json',randomUUID(),user.id,subscription.endpoint,JSON.stringify(subscription),now());return json({ok:true});
    }
    return error('Not found',404);
  } catch(e) {if(req.nextUrl.pathname==='/api/save')throw e;return asError(e);}
}

export async function DELETE(req:NextRequest,{params}:Context) {
  if(cloudConfigured())return cloudDELETE(req,{params});
  if(process.env.NODE_ENV==='production')return error('Production database is not configured.',503);
  try {if(!sameOrigin(req)) return error('Invalid origin',403);const path=(await params).path.join('/');const user=await onlyMine();if(path==='account') {
      const body=await req.json();
      if(body.confirmation!=='DELETE'||typeof body.password!=='string'||body.password.length>1024)return error('Enter your password and confirm account deletion.');
      const account=row<{password_hash:string}>('SELECT password_hash FROM users WHERE id=?',user.id);
      if(!account||!passwordValid(body.password,account.password_hash))return error('Password is incorrect.',403);
      run('DELETE FROM users WHERE id=?',user.id);
      await clearSession();
      return json({ok:true});
    }if(path==='push/subscribe'){const endpoint=req.nextUrl.searchParams.get('endpoint')||'';run('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?',user.id,endpoint);return json({ok:true});}return error('Not found',404);}catch(e){return asError(e);}
}

export async function PUT(req:NextRequest,{params}:Context) {
  if(cloudConfigured())return cloudDispatch(req);
  if(process.env.NODE_ENV==='production')return error('Production database is not configured.',503);
  try {
    const path=(await params).path.join('/');if(path!=='dispatch') return error('Not found',404);
    if(!process.env.CRON_SECRET||req.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`) return error('Unauthorized',401);
    if(!process.env.VAPID_PRIVATE_KEY||!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return error('Web Push is not configured.');
    webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:admin@example.com',process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
    const due=rows<{id:string;userId:string;contactName:string|null;title:string}>(`SELECT a.id,a.user_id AS userId,c.name AS contactName,a.title FROM actions a LEFT JOIN contacts c ON c.id=a.contact_id JOIN user_settings s ON s.user_id=a.user_id WHERE a.status=? AND s.push_enabled=1 AND a.due_at IS NOT NULL AND a.time_specified=1 AND datetime(a.due_at, printf('-%d minutes',a.reminder_minutes))<=datetime(?) AND a.notified_at IS NULL LIMIT 100`,'pending',now());
    let sent=0;
    for(const action of due) {
      const subscriptions=rows<{id:string;subscriptionJson:string}>('SELECT id,subscription_json AS subscriptionJson FROM push_subscriptions WHERE user_id=?',action.userId);
      let delivered=false;
      for(const sub of subscriptions) {try{await webpush.sendNotification(JSON.parse(sub.subscriptionJson),JSON.stringify({title:action.contactName?`Follow up with ${action.contactName}`:'Follow-up reminder',body:action.title,url:'/',tag:action.id}));sent++;delivered=true;}catch(e){const status=(e as {statusCode?:number}).statusCode;if(status===404||status===410) run('DELETE FROM push_subscriptions WHERE id=?',sub.id);}}
      if(delivered) run('UPDATE actions SET notified_at=? WHERE id=?',now(),action.id);
    }
    return json({checked:due.length,sent});
  }catch(e){return asError(e);}
}
