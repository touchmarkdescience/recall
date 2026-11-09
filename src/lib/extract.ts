import * as chrono from 'chrono-node';
import { DateTime } from 'luxon';

export type DraftAction = { kind: 'follow_up'|'reminder'|'meeting'; title: string; dueAt: string | null; timeSpecified?: boolean; durationMinutes?: number; reminderMinutes?: number; timeChoices?: string[] };
export type Extraction = { contactName: string; topic: string; summary: string; actions: DraftAction[]; mode: 'AI'|'Local rules' };
const zone='Asia/Kolkata';
const normalizeTime=(text:string)=>text.replace(/\b([ap])\.?m\.?/gi,'$1m').replace(/(\d{1,2})\.(\d{2})\b/g,'$1:$2');
const explicitTime=/\b(?:(?:at|by|around|is)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(?:at|by|around)\s+(\d{1,2})(?::(\d{2}))?\b|\b(\d{1,2}):(\d{2})\b/gi;
function timeOf(text:string){const m=[...normalizeTime(text).matchAll(explicitTime)][0];if(!m)return null;const hour=Number(m[1]??m[4]??m[6]),minute=Number(m[2]??m[5]??m[7]??0),period=m[3]?.toLowerCase();return {hour:period?hour%12+(period==='pm'?12:0):hour,minute,period,valid:minute<60&&hour<(period?13:24)&&hour>=(period?1:0)};}
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
function relativeDelay(text:string){
  const matches=[...text.toLowerCase().matchAll(/\b(?:in\s+(?:another\s+)?|after\s+|another\s+)(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|sixty)\s*(hours?|hrs?|minutes?|mins?)\b/g)];
  if(matches.length!==1)return null;
  const m=matches[0];
  if(!m||/\b(?:before|ago)\b/.test(m[0]))return null;
  const words:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,fifteen:15,twenty:20,thirty:30,sixty:60};
  const count=Number(m[1])||words[m[1]];
  if(!count||count>1440)return null;
  return {count,unit:m[2].startsWith('h')?'hours':'minutes'} as const;
}
const hasTimedIntent=(text:string)=>!!timeOf(text)||!!relativeDelay(text);
export function parseIST(phrase: string, now=new Date()): string | null {
  const lower=normalizeTime(phrase).toLowerCase();
  if(/\b(?:or|versus|instead)\b/.test(lower)&&[...lower.matchAll(/\b(?:in\s+(?:another\s+)?|after\s+|another\s+)\d+\s*(?:hours?|hrs?|minutes?|mins?)\b/g)].length>1)return null;
  const spoken=timeOf(lower);
  if(spoken&&!spoken.valid)return null;
  const base=DateTime.fromJSDate(now,{zone});
  const delay=relativeDelay(lower);
  if(delay)return base.plus({[delay.unit]:delay.count}).toUTC().toISO();
  const days=lower.match(/\bin\s+(\d+)\s+days?\b/);
  let d: DateTime | null=null;
  if(days) d=base.plus({days:Number(days[1])});
  else if(/\bday after tomorrow\b/.test(lower)) d=base.plus({days:2});
  else if(/\btomorrow\b/.test(lower)) d=base.plus({days:1});
  else if(/\b(?:today|tonight)\b/.test(lower)) d=base;
  const dayFirst=[...lower.matchAll(/\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?\b/g)].find(m=>months.some(month=>month.startsWith(m[2])));
  const monthFirst=lower.match(/\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/);
  const named=dayFirst&&months.findIndex(month=>month.startsWith(dayFirst[2]))>=0?{day:Number(dayFirst[1]),month:months.findIndex(month=>month.startsWith(dayFirst[2]))+1,year:Number(dayFirst[3]||base.year)}:monthFirst&&months.findIndex(month=>month.startsWith(monthFirst[1]))>=0?{day:Number(monthFirst[2]),month:months.findIndex(month=>month.startsWith(monthFirst[1]))+1,year:Number(monthFirst[3]||base.year)}:null;
  if(named||d) {
    const date=named?DateTime.fromObject(named,{zone}):d||base;
    let hour=spoken?.hour??(/afternoon/.test(lower)?15:/evening/.test(lower)?18:9);
    if(spoken&&!spoken.period&&spoken.hour>=1&&spoken.hour<=12&&/\btoday\b/.test(lower)&&!/\b(?:tomorrow|morning|afternoon|evening|tonight|or|versus|instead)\b/.test(lower)) {
      const candidates=[spoken.hour%12,spoken.hour%12+12].map(hour=>date.set({hour,minute:spoken.minute,second:0,millisecond:0}));
      const next=candidates.find(at=>at>base);
      if(next)hour=next.hour;
      else return null;
    }
    return date.set({hour,minute:spoken?.minute??0,second:0,millisecond:0}).toUTC().toISO();
  }
  const reference=new Date(base.year,base.month-1,base.day,base.hour,base.minute);
  const result=chrono.parse(lower,reference,{forwardDate:true})[0];
  if(spoken&&!result?.start.isCertain('day')&&!result?.start.isCertain('weekday'))return base.set({hour:spoken.hour,minute:spoken.minute,second:0,millisecond:0}).toUTC().toISO();
  if(!result) return null;
  const c=result.start;
  return DateTime.fromObject({year:c.get('year')||base.year,month:c.get('month')||base.month,day:c.get('day')||base.day,hour:spoken?.hour??(c.isCertain('hour')?(c.get('hour')??9):9),minute:spoken?.minute??(c.isCertain('minute')?(c.get('minute')??0):0)},{zone}).toUTC().toISO();
}
export function templateExtract(transcript: string, now=new Date()): Extraction | null {
  const clean=transcript.trim();
  const actionLabel=/\b(?:action|instruction)\s*:?\s+/i.exec(clean);
  if(!actionLabel) return null;
  const typeSearch=clean.slice(actionLabel.index+actionLabel[0].length);
  const typeLabel=/\b(?:type|category)\s*:?\s+/i.exec(typeSearch);
  if(!typeLabel) return null;
  const typeStart=actionLabel.index+actionLabel[0].length+typeLabel.index;
  const whenSearch=clean.slice(typeStart+typeLabel[0].length);
  const whenLabel=/\b(?:when|due)\s*:?\s+/i.exec(whenSearch);
  const whenStart=whenLabel?typeStart+typeLabel[0].length+whenLabel.index:clean.length;
  const prefix=clean.slice(0,actionLabel.index).trim().replace(/[.,;]+$/,'').trim();
  const nameMatch=prefix?prefix.match(/^(?:name|person)\s*(?::|is)?\s*(.+)$/i):null;
  if(prefix&&!nameMatch) return null;
  const rawName=nameMatch?.[1]?.trim()||'';
  const contactName=/^(guest|none|no name|skip)$/i.test(rawName)?'':rawName;
  const title=clean.slice(actionLabel.index+actionLabel[0].length,typeStart).trim().replace(/[.,;]+$/,'').trim();
  const type=clean.slice(typeStart+typeLabel[0].length,whenStart).trim().replace(/[.,;]+$/,'').trim().toLowerCase();
  const kind=/^(follow[\s-]?up|callback)$/.test(type)?'follow_up':type==='reminder'?'reminder':type==='meeting'?'meeting':null;
  if(!title||!kind) return null;
  const when=whenLabel?clean.slice(whenStart+whenLabel[0].length).trim().replace(/[.;]+$/,'').trim():'';
  const dayContext=when.match(/\b(?:day after tomorrow|tomorrow|today|in \d+ days?|on \w+day)\b/i)?.[0]||'';
  const times=[...when.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=\s|$|[.;!?—-])/gi)].map(m=>`${m[1]}:${m[2]||'00'} ${m[3].replace(/\./g,'').toUpperCase()}`);
  const choices=[...new Set(times)].map(time=>parseIST(`${dayContext} at ${time}`,now)).filter((value):value is string=>!!value);
  const ambiguous=choices.length>1;
  const topic=title.match(/\babout\s+(.+)$/i)?.[1]?.trim()||'';
  return {contactName,topic,summary:clean,actions:[{kind,title,dueAt:ambiguous?null:when?parseIST(when,now):null,timeSpecified:times.length>0||!!relativeDelay(when),timeChoices:ambiguous?choices:undefined}],mode:'Local rules'};
}
// Keep an explicitly timed preparation task separate from its later meeting.
function preparationExtract(clean:string,now:Date):Extraction|null {
  const marker=/\b(?:our meeting|the meeting|meeting is scheduled|we (?:are|have) (?:a )?meeting)\b/i.exec(clean);
  if(!marker||marker.index===0||/\b(?:versus|instead)\b|\bor\s+\d/i.test(clean))return null;
  const prep=clean.slice(0,marker.index).trim(),event=clean.slice(marker.index).trim();
  if(!/\b(?:prepare|send|share|document|PPT|presentation)\b/i.test(prep))return null;
  function dated(part:string){
    const times=[...normalizeTime(part).matchAll(explicitTime)];
    const days=[...part.matchAll(/\b(day after tomorrow|tomorrow|today|tonight)\b/gi)];
    if(times.length!==1||!days.length)return null;
    const prior=days.filter(d=>d.index!<=times[0].index!);
    return parseIST(`${(prior.at(-1)||days[0])[0]} ${times[0][0]}`,now);
  }
  const prepAt=dated(prep),eventAt=dated(event);
  if(!prepAt||!eventAt)return null;
  const contactName=clean.match(/\b(?:met(?: with)?|discussion with|spoke (?:to|with))\s+((?:(?:Mr|Mrs|Ms|Dr)\.?\s+)?[\p{L}'-]+)(?=\s+(?:sir|from|regarding|about|he|she)\b|[.,])/iu)?.[1]||'';
  return {contactName,topic:'',summary:clean,mode:'Local rules',actions:[
    {kind:'reminder',title:prep.slice(0,500),dueAt:prepAt,timeSpecified:true,reminderMinutes:0},
    {kind:'meeting',title:event.slice(0,500),dueAt:eventAt,timeSpecified:true,reminderMinutes:0}
  ]};
}
export function naturalExtract(transcript: string, now=new Date()): Extraction | null {
  const clean=transcript.trim();
  const preparation=preparationExtract(clean,now);
  if(preparation)return preparation;
  const reminder=/\b(?:(?:remind|remain) me|(?:set|need|add|give)(?:\s+me)?\s+(?:a\s+)?reminder(?:\s+for)?)\b/i.exec(clean);
  if(!reminder) return null;
  const named=clean.match(/^(?:hey,?\s*)?name\s*:?(?:\s+is)?\s+([\p{L}'-]+(?:\s+[\p{L}'-]+){0,2})\s*[.;,]/iu)?.[1]||'';
  const person=clean.match(/\b(?:spoke (?:to|with)|met(?: with)?|discussion with|called|call(?: with)?|meeting(?: with)?|meet with)\s+((?:(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+)?(?:[\p{L}]\.\s+)?[\p{L}'-]+(?:\s+(?!(?:on|at|by|about|for|to|tomorrow|today|next|in|after|another|and|or|we|from|he|she|they|who|sir|regarding)\b)[\p{L}'-]+){0,2})/iu)?.[1]?.trim()||'';
  const contactName=(named||person).replace(/\s+/g,' ').trim();
  const topic=clean.match(/\babout\s+(.+?)(?=\s*(?:[;,.]|\bremind\b|\bor\b|$))/i)?.[1]?.trim()||'';
  if(reminder.index===0||/^hey,?\s*(?:remind|remain) me\b/i.test(clean)) {
    const dueAt=parseIST(clean,now);
    const lead=clean.match(/\b(\d+|fifteen)\s*(?:minutes?|mins?)\s+before\b/i);
    const minutes=lead?(lead[1].toLowerCase()==='fifteen'?15:Number(lead[1])):0;
    const actions:DraftAction[]=[{kind:'reminder',title:clean.replace(/^hey,?\s*/i,''),dueAt,timeSpecified:hasTimedIntent(clean)}];
    if(dueAt&&minutes>0&&minutes<=525600&&!/\b(?:or|versus|instead)\b/i.test(clean))actions.push({kind:'reminder',title:`Prepare: ${clean}`.slice(0,500),dueAt:new Date(Date.parse(dueAt)-minutes*60000).toISOString(),timeSpecified:true,reminderMinutes:0});
    return {contactName,topic,summary:clean,actions,mode:'Local rules'};
  }
  const event=clean.slice(0,reminder.index).replace(/(?:[.;!?]\s*)+$/,'').replace(/^(?:hey,?\s*)?name\s*:?(?:\s+is)?\s+[^.;!?]+[.;!?]\s*/i,'').replace(/^(?:hey,?\s*)?i\s+(?:just\s+)?(?:spoke (?:to|with)|called)\s+[^.;!?]+[.;!?]\s*/i,'').trim();
  if(!event) return null;
  if(/^(?:call|send|share|submit|deliver|prepare|update|follow up|check)\b/i.test(event)) return null;
  const instruction=clean.slice(reminder.index+reminder[0].length).trim();
  const lead=instruction.match(/^(?:(?:one|1)\s+hour|60\s+minutes|(?:one|1)\s+day|24\s+hours|30\s+minutes|10\s+minutes)\s+before\b/i)?.[0].toLowerCase();
  const reminderMinutes=lead?/(?:day|24\s+hours)/.test(lead)?1440:/(?:hour|60)/.test(lead)?60:/30/.test(lead)?30:10:0;
  const eventTimes=[...normalizeTime(event).matchAll(explicitTime)].map(match=>match[0]);
  const reminderTimes=lead?[]:[...normalizeTime(instruction).matchAll(explicitTime)].map(match=>match[0]);
  const dayContext=event.match(/\b(?:day after tomorrow|tomorrow|today|in \d+ days?|on \w+day|next \w+day|this \w+day)\b/i)?.[0]||'';
  // A time after "remind me" is an alert instruction, not a clock time for
  // the earlier event. Keep its own day (tonight/today vs tomorrow).
  if(!lead&&reminderTimes.length===1&&eventTimes.length<=1&&!/\b(?:or|versus|instead)\b/i.test(instruction)) {
    const ownDay=/\b(?:today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+/i.test(instruction);
    const alertAt=parseIST(`${ownDay?'':dayContext} ${instruction}`,now);
    if(alertAt) {
      const alert:DraftAction={kind:'reminder',title:clean.slice(0,500),dueAt:alertAt,timeSpecified:true,reminderMinutes:0};
      // If no event clock was spoken, do not invent a 9 AM appointment.
      // The full instruction remains in the reminder title and original note.
      if(eventTimes.length===0){
        const hasFutureEvent=/\b(?:tomorrow|day after tomorrow)\b/i.test(event)&&/\b(?:call|meeting|meet|discuss)\b/i.test(event);
        const kind=/\b(?:meeting|meet|discuss)\b/i.test(event)?'meeting':'follow_up';
        return {contactName,topic,summary:clean,actions:[...(hasFutureEvent?[{kind,title:event.slice(0,500),dueAt:null,timeSpecified:false,reminderMinutes:0} as DraftAction]:[]),alert],mode:'Local rules'};
      }
      const eventAt=parseIST(event,now);
      if(eventAt) {
        const offset=(Date.parse(eventAt)-Date.parse(alertAt))/60000;
        const kind=/\b(meet|meeting|discuss|discussion|scheduled|schedule)\b/i.test(event)?'meeting':'follow_up';
        const action:DraftAction={kind,title:event.charAt(0).toUpperCase()+event.slice(1),dueAt:eventAt,timeSpecified:true,reminderMinutes:0};
        if([0,10,30,60,1440].includes(offset))return {contactName,topic,summary:clean,actions:[{...action,reminderMinutes:offset}],mode:'Local rules'};
        return {contactName,topic,summary:clean,actions:[action,alert],mode:'Local rules'};
      }
    }
  }
  const choices=[...new Set([...eventTimes,...reminderTimes].map(time=>parseIST(`${dayContext} ${time}`,now)).filter((value):value is string=>!!value))];
  const ambiguous=choices.length>1;
  const kind=/\b(meet|meeting|discuss|discussion|scheduled|schedule)\b/i.test(event)?'meeting':'follow_up';
  return {contactName,topic,summary:clean,actions:[{kind,title:event.charAt(0).toUpperCase()+event.slice(1),dueAt:ambiguous?null:parseIST(event,now),timeSpecified:eventTimes.length>0||reminderTimes.length>0||!!relativeDelay(event),reminderMinutes,timeChoices:ambiguous?choices:undefined}],mode:'Local rules'};
}
export function localExtract(transcript: string, now=new Date()): Extraction {
  const clean=transcript.trim();
  const templated=templateExtract(clean,now);
  if(templated) return templated;
  const natural=naturalExtract(clean,now);
  if(natural) return natural;
  const normalized=clean.replace(/\b(Dr|Mr|Mrs|Ms|Prof)\.(?=\s)/gi,'$1');
  const match=normalized.match(/\b(?:spoke (?:to|with)|talked (?:to|with)|met(?: with)?|called|call(?: with)?|meeting(?: with)?|meet with|follow up with)\s+((?:(?:Dr|Mr|Mrs|Ms|Prof)\s+)?[\p{L}'-]+(?:\s+[\p{L}'-]+){0,2}?)(?=\s+(?:on|at|by|about|for|to|tomorrow|today|next|in|after|another|and|or)\b|[.,;!?]|$)/iu);
  const candidate=match?.[1]?.trim()||'';
  const contactName=candidate&&candidate[0]===candidate[0].toLocaleUpperCase()&&!/^(today|tomorrow|client|customer|prospect|team|someone|anyone)$/i.test(candidate)?candidate:'';
  const topic=clean.match(/\babout\s+(.+?)(?=\s*(?:[;,.]|\bremind\b|\bor\b|$))/i)?.[1]?.trim()||'';
  const spokenTimes=[...normalizeTime(clean).matchAll(explicitTime)].map(m=>m[0]);
  const conflicting=/\b(?:or|versus|vs\.?|instead)\b/i.test(clean)&&new Set(spokenTimes).size>1;
  const protectedText=clean.replace(/\b([ap])\.m\./gi,'$1\uE000m\uE000').replace(/(\d{1,2})\.(\d{2})\b/g,'$1\uE000$2').replace(/\b(Dr|Mr|Mrs|Ms|Prof)\.(?=\s)/gi,'$1\uE000');
  const segments=conflicting?[clean]:protectedText.split(/(?:[.;]|\s+and\s+(?=(?:call|follow|remind|meet|schedule|reschedule|send|check)\b))/i).map(s=>s.replace(/\uE000/g,'.').trim()).filter(Boolean);
  const actions: DraftAction[]=[];
  for(const segment of segments) {
    const futureDiscussion=/\b(?:discuss|discussion|discussing)\b/i.test(segment)&&/\b(?:tomorrow|next|will|planned|plan to|at \d|by \d|on \w+day)\b/i.test(segment);
    const kind=/\b(meet|meeting|schedule|reschedule)\b/i.test(segment)||futureDiscussion?'meeting':/\b(remind|reminder)\b/i.test(segment)?'reminder':/\b(follow up|call|send|share|submit|deliver|prepare|update|finish|check back|reach out|get back)\b/i.test(segment)?'follow_up':null;
    if(!kind) continue;
    if(/\b(?:spoke|talked|called|met)\b/i.test(segment) && !/\b(?:need to|should|will|please|next|again|tomorrow|today|in \d+ days?|at \d|on \w+day)\b/i.test(segment)) continue;
    const dayContext=segment.match(/\b(?:day after tomorrow|tomorrow|today|in \d+ days?|on \w+day)\b/i)?.[0]||'';
    const choices=conflicting?spokenTimes.map(time=>parseIST(`${dayContext} ${time}`,now)).filter((value):value is string=>!!value):[];
    actions.push({kind,title:segment.charAt(0).toUpperCase()+segment.slice(1),dueAt:conflicting?null:parseIST(segment,now),timeSpecified:hasTimedIntent(segment),timeChoices:choices.length>1?choices:undefined});
  }
  return {contactName,topic,summary:clean,actions,mode:'Local rules'};
}
export async function extract(transcript: string): Promise<Extraction> {
  const templated=templateExtract(transcript);
  if(templated) return templated;
  const natural=naturalExtract(transcript);
  if(natural) return natural;
  if(!process.env.OPENAI_API_KEY) return localExtract(transcript);
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',max_completion_tokens:700,response_format:{type:'json_object'},messages:[{role:'system',content:`Return only JSON: {"contactName":"","topic":"","summary":"","actions":[]}. Each explicit next step has kind (follow_up, reminder, meeting), short title, dueAt (UTC ISO or null), and timeChoices (UTC ISO array only for conflicting spoken times). A person's name is optional. Extract it only from a person cue such as "meeting Sujay"; a topic after "about" is not a person. Use only stated facts. Do not invent a person, action, date, time, or duration. A discussion without an explicit next step has actions:[]. Keep the summary to one sentence. Interpret relative dates in Asia/Kolkata; now is ${DateTime.now().setZone(zone).toISO()}. For alternatives such as "1 pm or 4 pm", use dueAt:null and timeChoices with both times. Limit actions to 10.`},{role:'user',content:transcript}]})});
  if(!response.ok) throw new Error(`AI request failed (${response.status})`);
  const data=await response.json();
  const parsed=JSON.parse(data.choices?.[0]?.message?.content||'{}');
  const result={contactName:String(parsed.contactName||'').slice(0,120),topic:String(parsed.topic||'').slice(0,200),summary:String(parsed.summary||transcript).slice(0,1000),actions:Array.isArray(parsed.actions)?parsed.actions.slice(0,10).filter((a:DraftAction)=>a&&['follow_up','reminder','meeting'].includes(a.kind)&&typeof a.title==='string'&&a.title.trim()).map((a:DraftAction)=>({kind:a.kind,title:a.title.trim().slice(0,500),dueAt:a.dueAt&&DateTime.fromISO(a.dueAt).isValid?a.dueAt:null,timeSpecified:a.timeSpecified,timeChoices:Array.isArray(a.timeChoices)?a.timeChoices.filter(x=>typeof x==='string'&&DateTime.fromISO(x).isValid).slice(0,4):undefined})):[],mode:'AI' as const};
  const guard=localExtract(transcript);
  if(guard.contactName)result.contactName=guard.contactName;
  if(guard.topic)result.topic=guard.topic;
  if(guard.actions.length===result.actions.length)result.actions=result.actions.map((action:DraftAction,i:number)=>hasTimedIntent(guard.actions[i].title)?{...action,dueAt:guard.actions[i].dueAt,timeSpecified:true}:action);
  if(result.contactName&&result.topic&&result.contactName.toLocaleLowerCase()===result.topic.toLocaleLowerCase())result.contactName='';
  if(guard.actions[0]?.timeChoices?.length){result.actions=result.actions.map((a:DraftAction)=>({...a,dueAt:null,timeChoices:guard.actions[0].timeChoices}));}
  return result;
}
