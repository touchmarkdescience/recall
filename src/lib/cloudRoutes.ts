import { protectRequest, protectAuth, protectUserBudget, readJsonLimited, securityResponse } from './abuse';
import { validReminder, reminderAt } from './reminders';
import { safeFailure } from './serverErrors';
import 'server-only';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { clearSession, currentUser, passwordHash, passwordValid, setSession } from './auth';
import { cloud, dataOrThrow } from './cloud';
import { enqueueCloudSheetEvent, flushCloudSheetOutbox, getCloudSettings } from './cloudSettings';
import { extract, type DraftAction } from './extract';
import { defaultSttProvider, sttConfigured, sttLabel, type SttProvider } from './stt';

type Context={params:Promise<{path:string[]}>};
type Contact={id:string;name:string;phone:string|null;created_at:string};
type Action={id:string;user_id:string;contact_id:string|null;interaction_id:string|null;kind:string;title:string;due_at:string|null;time_specified:number;duration_minutes:number;reminder_minutes:number;status:string;created_at:string;notified_at:string|null};
type Interaction={id:string;contact_id:string|null;summary:string;transcript:string;occurred_at:string;created_at:string};
const response=(data:unknown,status=200)=>NextResponse.json(data,{status});
const error=(message:string,status=400)=>response({error:message},status);
const now=()=>new Date().toISOString();
const clean=(value:unknown)=>String(value??'').trim();
const fail=(value:unknown)=>securityResponse(value)||(value instanceof Error&&value.message==='Unauthorized'?error('Unauthorized',401):safeFailure(value,'/api/[...path]'));
const originOkay=(req:NextRequest)=>{const origin=req.headers.get('origin');if(!origin)return true;try{return new URL(origin).host===req.headers.get('host')}catch{return false}};
async function onlyMine(){const user=await currentUser();if(!user)throw new Error('Unauthorized');return user}
const contactView=(c:Contact)=>({id:c.id,name:c.name,phone:c.phone,createdAt:c.created_at});
const interactionView=(i:Interaction,c:Contact|undefined)=>({id:i.id,contactId:i.contact_id||'',contactName:c?.name||'',summary:i.summary,transcript:i.transcript,occurredAt:i.occurred_at});
const actionView=(a:Action,c:Contact|undefined,summary?:string,originalNote?:string)=>({id:a.id,contactId:a.contact_id||'',contactName:c?.name||'',kind:a.kind,title:a.title,dueAt:a.due_at,timeSpecified:a.time_specified,durationMinutes:a.duration_minutes,reminderMinutes:a.reminder_minutes,status:a.status,createdAt:a.created_at,...(summary===undefined?{}:{conversationSummary:summary}),...(originalNote===undefined?{}:{originalNote})});
async function contactsFor(userId:string){return dataOrThrow(await cloud().from('recall_contacts').select('id,name,phone,created_at').eq('user_id',userId).order('name')) as Contact[]}

export async function cloudGET(req:NextRequest,{params}:Context){
  try{
    const path=(await params).path.join('/');
    if(path==='me'){const user=await currentUser(),provider=user?(await getCloudSettings(user.id)).transcriptionProvider:defaultSttProvider();return response({user,accountDeletionAvailable:true,aiMode:process.env.OPENAI_API_KEY?'AI':'Local rules',transcriptionConfigured:sttConfigured(provider),transcriptionProvider:sttLabel(provider),pushConfigured:Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY),vapidPublicKey:process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY||''})}
    const user=await onlyMine();
    if(path==='settings')return response(await getCloudSettings(user.id));
    if(path==='dashboard'){
      await getCloudSettings(user.id);
      const [contacts,actions,interactions]=await Promise.all([
        contactsFor(user.id),
        cloud().from('recall_actions').select('*').eq('user_id',user.id).order('due_at',{ascending:true,nullsFirst:false}).limit(1000).then(dataOrThrow) as Promise<Action[]>,
        cloud().from('recall_interactions').select('id,contact_id,summary,transcript,occurred_at,created_at').eq('user_id',user.id).order('occurred_at',{ascending:false}).limit(30).then(dataOrThrow) as Promise<Interaction[]>,
      ]);
      const notes=new Map(interactions.map(i=>[i.id,i.transcript]));
      const missing=[...new Set(actions.map(a=>a.interaction_id).filter((id):id is string=>!!id&&!notes.has(id)))];
      // Small batches keep PostgREST URLs bounded, including older action notes.
      for(let offset=0;offset<missing.length;offset+=100){
        const linked=dataOrThrow(await cloud().from('recall_interactions').select('id,transcript').eq('user_id',user.id).in('id',missing.slice(offset,offset+100))) as {id:string;transcript:string}[];
        for(const note of linked)notes.set(note.id,note.transcript);
      }
      const names=new Map(contacts.map(c=>[c.id,c]));
      return response({contacts:contacts.map(contactView),actions:actions.map(a=>actionView(a,a.contact_id?names.get(a.contact_id):undefined,undefined,notes.get(a.interaction_id||'')||'')),interactions:interactions.map(i=>interactionView(i,i.contact_id?names.get(i.contact_id):undefined))});
    }
    if(path==='contact'){
      const id=req.nextUrl.searchParams.get('id')||'';
      const contactResult=await cloud().from('recall_contacts').select('id,name,phone,created_at').eq('id',id).eq('user_id',user.id).maybeSingle();
      if(contactResult.error)throw new Error(contactResult.error.message);
      const contact=contactResult.data as Contact|null;
      if(!contact)return error('Contact not found',404);
      const [interactions,actions]=await Promise.all([
        cloud().from('recall_interactions').select('id,contact_id,summary,transcript,occurred_at,created_at').eq('user_id',user.id).eq('contact_id',id).order('occurred_at',{ascending:false}).then(dataOrThrow) as Promise<Interaction[]>,
        cloud().from('recall_actions').select('*').eq('user_id',user.id).eq('contact_id',id).order('created_at',{ascending:false}).then(dataOrThrow) as Promise<Action[]>,
      ]);
      const summaryIds=[...new Set(actions.map(a=>a.interaction_id).filter(Boolean))] as string[];
      const linked=summaryIds.length?dataOrThrow(await cloud().from('recall_interactions').select('id,summary').eq('user_id',user.id).in('id',summaryIds)):[];
      const summaries=new Map((linked as {id:string;summary:string}[]).map(i=>[i.id,i.summary]));
      return response({contact:contactView(contact),interactions:interactions.map(i=>({id:i.id,transcript:i.transcript,summary:i.summary,occurredAt:i.occurred_at})),actions:actions.map(a=>actionView(a,contact,summaries.get(a.interaction_id||'')||''))});
    }
    return error('Not found',404);
  }catch(cause){return fail(cause)}
}

export async function cloudPOST(req:NextRequest,{params}:Context){
  try{
    if(!originOkay(req))return error('Invalid origin',403);
    const path=(await params).path.join('/');
    await protectRequest(req);
    const body=await readJsonLimited(req);
    await protectAuth(req,path,body);
    if(path==='register'){
      const email=clean(body.email).toLowerCase(),name=clean(body.name),password=String(body.password||'');
      if(!/^\S+@\S+\.\S+$/.test(email)||!name||name.length>120||email.length>254||password.length>1024||password.length<8)return error('Enter a name, valid email, and password of at least 8 characters.');
      const existing=await cloud().from('recall_users').select('id').eq('email',email).maybeSingle();if(existing.error)throw new Error(existing.error.message);
      if(existing.data)return error('An account with this email already exists.');
      const id=randomUUID();
      dataOrThrow(await cloud().from('recall_users').insert({id,email,name,password_hash:passwordHash(password)}).select('id').single());
      const token=await setSession(id);return response({ok:true,...(req.headers.get('x-recall-client')==='native'?{token}:{})});
    }
    if(path==='login'){
      if(String(body.email||'').length>254||String(body.password||'').length>1024)return error('Email or password is incorrect.',401);
      const email=clean(body.email).toLowerCase(),password=String(body.password||'');
      const found=await cloud().from('recall_users').select('id,password_hash').eq('email',email).maybeSingle();if(found.error)throw new Error(found.error.message);
      if(!found.data||!passwordValid(password,found.data.password_hash))return error('Email or password is incorrect.',401);
      const token=await setSession(found.data.id);return response({ok:true,...(req.headers.get('x-recall-client')==='native'?{token}:{})});
    }
    if(path==='logout'){await clearSession();return response({ok:true})}
    const user=await onlyMine();
    if(path==='extract'){
      const transcript=clean(body.transcript);if(transcript.length<3||transcript.length>10000)return error('Enter a note between 3 and 10,000 characters.');
      await protectUserBudget(user.id,'extract');
      const result=await extract(transcript);const contacts=await contactsFor(user.id);
      const normalized=(value:string)=>value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
      const matched=contacts.find(c=>normalized(c.name)===normalized(result.contactName))||contacts.find(c=>normalized(c.name).includes(normalized(result.contactName))&&result.contactName.length>=3);
      return response({...result,matchedContactId:matched?.id||null});
    }
    if(path==='save'){
      const transcript=clean(body.transcript),summary=clean(body.summary);
      if(transcript.length<3||!summary)return error('A note and summary are required.');
      const occurredAt=body.occurredAt===undefined?now():clean(body.occurredAt);
      if(!DateTime.fromISO(occurredAt).isValid||DateTime.fromISO(occurredAt).toMillis()>Date.now())return error('Conversation time cannot be in the future. Choose when you spoke in IST.');
      const actions=Array.isArray(body.actions)?body.actions as DraftAction[]:[];
      if(actions.some(action=>!validReminder(action.reminderMinutes??0)))return error('Choose a reminder offset from the list.');
      if(actions.length>20)return error('Too many actions in one note.');
      if(actions.some(action=>action.timeSpecified===true&&!action.dueAt))return error('Set the spoken time before saving.');
      if(actions.some(action=>(action.timeChoices?.length||0)>1))return error('Choose one of the spoken times before saving.');
      for(const action of actions)if(!['follow_up','reminder','meeting'].includes(action.kind)||!clean(action.title)||action.title.length>500||(action.dueAt&&!DateTime.fromISO(action.dueAt).isValid)||!Number.isInteger(action.durationMinutes??30)||(action.durationMinutes??30)<15||(action.durationMinutes??30)>480)return error('Review the action titles, dates, and durations.');
      if(actions.some(action=>action.dueAt&&action.timeSpecified!==false&&DateTime.fromISO(action.dueAt).toMillis()<Date.now()))return error('A timed action cannot be scheduled in the past. Choose a later time in IST.');
      const contactId=clean(body.contactId)||null,contactName=clean(body.contactName);
      if(contactName.length>120)return error('Person name is too long.');
      const saved=dataOrThrow(await cloud().rpc('recall_save_note',{p_user_id:user.id,p_contact_id:contactId,p_contact_name:contactName,p_transcript:transcript,p_summary:summary,p_occurred_at:occurredAt,p_actions:actions})) as {contactId:string;interactionId:string};
      const sync=await flushCloudSheetOutbox(user.id);
      return response({ok:true,...saved,sheetSyncPending:sync.pending});
    }
    if(path==='contact'){
      const id=clean(body.id),name=clean(body.name),phone=clean(body.phone);
      if(!id||!name||name.length>120)return error('Enter a contact name.');
      const changed=dataOrThrow(await cloud().from('recall_contacts').update({name,phone:phone||null}).eq('id',id).eq('user_id',user.id).select('id'));
      return changed.length?response({ok:true}):error('Contact not found',404);
    }
    if(path==='action'){
      const id=clean(body.id),status=clean(body.status);
      if(!['pending','done','archived','removed'].includes(status))return error('Invalid status');
      const current=await cloud().from('recall_actions').select('*').eq('id',id).eq('user_id',user.id).maybeSingle();if(current.error)throw new Error(current.error.message);
      if(!current.data)return error('Action not found',404);
      const old=current.data as Action;
      if(body.dueAt!==undefined&&body.dueAt!==null&&typeof body.dueAt!=='string')return error('Choose a valid date and time.');
      const title=body.title===undefined?old.title:clean(body.title),kind=body.kind===undefined?old.kind:clean(body.kind),dueAt=body.dueAt===undefined?old.due_at:body.dueAt||null;
      const reminderMinutes=body.reminderMinutes===undefined?old.reminder_minutes:body.reminderMinutes;
      if(!validReminder(reminderMinutes))return error('Choose a reminder offset from the list.');
      const timeSpecified=body.timeSpecified===undefined?old.time_specified:body.timeSpecified===false?0:1;
      if(!title||title.length>500||!['follow_up','reminder','meeting'].includes(kind)||(dueAt&&!DateTime.fromISO(dueAt).isValid))return error('Enter a valid title, type and date.');
      if(body.dueAt!==undefined&&dueAt&&timeSpecified!==0&&DateTime.fromISO(dueAt).toMillis()<Date.now())return error('A timed action cannot be scheduled in the past. Choose a later time in IST.');
      const changed=dataOrThrow(await cloud().from('recall_actions').update({status,title,kind,due_at:dueAt,time_specified:timeSpecified,reminder_minutes:reminderMinutes,notified_at:dueAt!==old.due_at||timeSpecified!==old.time_specified||status!==old.status||reminderMinutes!==old.reminder_minutes?null:old.notified_at}).eq('id',id).eq('user_id',user.id).select('id'));
      if(!changed.length)return error('Action not found',404);
      const contact=old.contact_id?await cloud().from('recall_contacts').select('name').eq('id',old.contact_id).eq('user_id',user.id).single():null;if(contact?.error)throw new Error(contact.error.message);
      await enqueueCloudSheetEvent(user.id,{type:'action',actionId:id,interactionId:old.interaction_id,contactId:old.contact_id,contactName:contact?.data?.name||'',kind,title,dueAt,timeSpecified,status,createdAt:old.created_at});
      const sync=await flushCloudSheetOutbox(user.id);return response({ok:true,sheetSyncPending:sync.pending});
    }
    if(path==='settings'){
      const pushEnabled=body.pushEnabled===true,reminderMinutes=Number(body.reminderMinutes),sheetWebhookUrl=clean(body.sheetWebhookUrl),sheetSecret=clean(body.sheetSecret);
      if(![0,15,30,60,1440].includes(reminderMinutes))return error('Choose a reminder time from the list.');
      const transcriptionProvider=(body.transcriptionProvider??(await getCloudSettings(user.id)).transcriptionProvider) as SttProvider;
      if(!['groq','gemini'].includes(transcriptionProvider))return error('Choose a transcription provider from the list.');
      if(sheetWebhookUrl){try{const url=new URL(sheetWebhookUrl);if(url.protocol!=='https:'||!['script.google.com','script.googleusercontent.com'].includes(url.hostname))return error('Use an Apps Script web app URL.')}catch{return error('Enter a valid Apps Script URL.')}}
      const settings=await getCloudSettings(user.id);
      if(sheetWebhookUrl&&sheetSecret.length<16&&!settings.sheetConnected)return error('Use a sheet secret of at least 16 characters.');
      const oldResult=await cloud().from('recall_user_settings').select('sheet_secret').eq('user_id',user.id).single();
      if(oldResult.error)throw new Error(oldResult.error.message);
      dataOrThrow(await cloud().from('recall_user_settings').update({push_enabled:pushEnabled,reminder_minutes:reminderMinutes,sheet_webhook_url:sheetWebhookUrl||null,sheet_secret:sheetWebhookUrl?sheetSecret||oldResult.data?.sheet_secret:null,transcription_provider:transcriptionProvider,updated_at:now()}).eq('user_id',user.id).select('user_id'));
      if(sheetWebhookUrl)await enqueueCloudSheetEvent(user.id,{type:'ping'});
      const sync=sheetWebhookUrl?await flushCloudSheetOutbox(user.id):{sent:0};
      return response({...await getCloudSettings(user.id),synced:sync.sent});
    }
    if(path==='sheet/sync')return response(await flushCloudSheetOutbox(user.id));
    if(path==='ask'){
      const question=clean(body.question),contactId=clean(body.contactId);if(question.length>2000)return error('Keep questions under 2,000 characters.');if(!question)return error('Ask a question.');await protectUserBudget(user.id,'ask');
      const contact=contactId?await cloud().from('recall_contacts').select('id,name').eq('id',contactId).eq('user_id',user.id).maybeSingle():null;
      if(contact?.error)throw new Error(contact.error.message);if(contactId&&!contact?.data)return error('Contact not found',404);
      const interactionsQuery=cloud().from('recall_interactions').select('summary,occurred_at').eq('user_id',user.id);
      const actionsQuery=cloud().from('recall_actions').select('title,due_at,status').eq('user_id',user.id);
      const interactions=dataOrThrow(await (contactId?interactionsQuery.eq('contact_id',contactId):interactionsQuery).order('occurred_at',{ascending:false}).limit(15));
      const actions=dataOrThrow(await (contactId?actionsQuery.eq('contact_id',contactId):actionsQuery).order('created_at',{ascending:false}).limit(30));
      if(process.env.OPENAI_API_KEY){
        const ai=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',max_completion_tokens:500,messages:[{role:'system',content:'Answer only from the supplied account records. Mention when information is absent. Dates are in Asia/Kolkata. Be concise.'},{role:'user',content:JSON.stringify({question,contact:contact?.data?.name||null,interactions,actions})}]})});
        if(!ai.ok)throw new Error(`AI request failed (${ai.status})`);
        const result=await ai.json();return response({answer:result.choices?.[0]?.message?.content||'No answer returned.',mode:'AI'});
      }
      const latest=interactions[0],pending=actions.filter((a:{status:string})=>a.status==='pending');
      const date=(value:string)=>DateTime.fromISO(value).setZone('Asia/Kolkata').toFormat('d LLL yyyy, h:mm a');
      const answer=!latest?`I have no conversations recorded${contact?.data?` with ${contact.data.name}`:''} yet.`:`${contact?.data?`${contact.data.name}: `:''}Last conversation (${date(latest.occurred_at)} IST): ${latest.summary}\n\n${pending.length?`Pending: ${pending.slice(0,5).map((a:{title:string;due_at:string|null})=>`${a.title}${a.due_at?` — ${date(a.due_at)} IST`:''}`).join('; ')}`:'No pending actions recorded.'}`;
      return response({answer,mode:'Local summary'});
    }
    if(path==='push/subscribe'){
      if(!process.env.VAPID_PRIVATE_KEY||!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)return error('Web Push is not configured on this server.');
      const subscription=body.subscription as {endpoint?:string;keys?:{p256dh?:string;auth?:string}}|undefined;if(typeof subscription?.endpoint!=='string'||!subscription.endpoint.startsWith('https://')||typeof subscription?.keys?.p256dh!=='string'||typeof subscription?.keys?.auth!=='string')return error('Invalid subscription.');
      dataOrThrow(await cloud().from('recall_push_subscriptions').upsert({id:randomUUID(),user_id:user.id,endpoint:subscription.endpoint,subscription_json:subscription},{onConflict:'endpoint'}).select('id'));
      return response({ok:true});
    }
    return error('Not found',404);
  }catch(cause){if(req.nextUrl.pathname==='/api/save')throw cause;return fail(cause)}
}

export async function cloudDELETE(req:NextRequest,{params}:Context){
  try{if(!originOkay(req))return error('Invalid origin',403);await protectRequest(req);const path=(await params).path.join('/');const user=await onlyMine();if(path==='account') {
      const body=await readJsonLimited(req);
      if(body.confirmation!=='DELETE'||typeof body.password!=='string'||body.password.length>1024)return error('Enter your password and confirm account deletion.');
      const account=dataOrThrow(await cloud().from('recall_users').select('password_hash').eq('id',user.id).single()) as {password_hash:string}|null;
      if(!account||!passwordValid(body.password,account.password_hash))return error('Password is incorrect.',403);
      dataOrThrow(await cloud().from('recall_users').delete().eq('id',user.id).select('id').single());
      await clearSession();
      return response({ok:true});
    }if(path==='push/subscribe'){const endpoint=req.nextUrl.searchParams.get('endpoint')||'';dataOrThrow(await cloud().from('recall_push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',endpoint).select('id'));return response({ok:true})}return error('Not found',404)}catch(cause){return fail(cause)}
}

export async function cloudDispatch(req:NextRequest){
  try{
    if(!process.env.CRON_SECRET||req.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return error('Unauthorized',401);
    if(!process.env.VAPID_PRIVATE_KEY||!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)return error('Web Push is not configured.');
    webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:admin@example.com',process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
    const due=dataOrThrow(await cloud().from('recall_actions').select('*').eq('status','pending').is('notified_at',null).not('due_at','is',null).lte('due_at',new Date(Date.now()+86400000).toISOString()).order('due_at').limit(500)) as Action[];
    const userIds=[...new Set(due.map(a=>a.user_id))];
    const settings=userIds.length?dataOrThrow(await cloud().from('recall_user_settings').select('user_id,push_enabled,reminder_minutes').in('user_id',userIds)):[];
    const settingMap=new Map((settings as {user_id:string;push_enabled:boolean;reminder_minutes:number}[]).map(s=>[s.user_id,s]));
    const ready=due.filter(a=>{const setting=settingMap.get(a.user_id);return setting?.push_enabled&&reminderAt(a.due_at,a.time_specified!==0,a.reminder_minutes)!==null&&Date.parse(reminderAt(a.due_at,a.time_specified!==0,a.reminder_minutes)!)<=Date.now()}).slice(0,100);
    const contactIds=[...new Set(ready.map(a=>a.contact_id).filter((id):id is string=>!!id))];
    const contacts=contactIds.length?dataOrThrow(await cloud().from('recall_contacts').select('id,name').in('id',contactIds)):[];
    const names=new Map((contacts as {id:string;name:string}[]).map(c=>[c.id,c.name]));
    let sent=0;
    for(const action of ready){
      const subscriptions=dataOrThrow(await cloud().from('recall_push_subscriptions').select('id,subscription_json').eq('user_id',action.user_id));
      let delivered=false;
      for(const sub of subscriptions){try{await webpush.sendNotification(sub.subscription_json,JSON.stringify({title:action.contact_id&&names.get(action.contact_id)?`Follow up with ${names.get(action.contact_id)}`:'Follow-up reminder',body:action.title,url:'/',tag:action.id}));sent++;delivered=true}catch(cause){const status=(cause as {statusCode?:number}).statusCode;if(status===404||status===410)dataOrThrow(await cloud().from('recall_push_subscriptions').delete().eq('id',sub.id).select('id'))}}
      if(delivered)dataOrThrow(await cloud().from('recall_actions').update({notified_at:now()}).eq('id',action.id).eq('status','pending').is('notified_at',null).select('id'));
    }
    return response({checked:ready.length,sent});
  }catch(cause){return fail(cause)}
}
