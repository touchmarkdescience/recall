import * as chrono from 'chrono-node';
import { DateTime } from 'luxon';
import { spokenDate, schedulingText } from './spokenDate.ts';

export type DraftAction = { kind: 'follow_up'|'reminder'|'meeting'; title: string; dueAt: string | null; timeSpecified?: boolean; durationMinutes?: number; reminderMinutes?: number; timeChoices?: string[];timeAmbiguity?:'period';scheduleWarning?:string };
export type Extraction = { contactName: string; topic: string; summary: string; actions: DraftAction[]; mode: 'AI'|'Local rules';needsManualReview?:boolean };
const zone='Asia/Kolkata';
const clockWords=['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
function normalizeTime(text:string){
 const clockNumber=(word:string)=>String(clockWords.indexOf(word.toLowerCase())+1);
 return text.replace(/\b(at|by|around)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi,(_match,prefix:string,word:string)=>`${prefix} ${clockNumber(word)}`)
  .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?=\s*(?:[ap]\.?m\.?\b|o['’]clock\b))/gi,clockNumber)
  .replace(/\b(today|tomorrow|tonight|morning|afternoon|evening)\s+(?=\d{1,2}\b)/gi,'$1 at ')
  .replace(/\b(at|by|around)\s+noon\b/gi,'$1 12 pm').replace(/\b(at|by|around)\s+midnight\b/gi,'$1 12 am')
  .replace(/\b([ap])\.?m\.?/gi,'$1m').replace(/(\d{1,2})\.(\d{2})\b/g,'$1:$2');
}
const explicitTime=/\b(?:(?:at|by|around|is)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(?:at|by|around)\s+(\d{1,2})(?::(\d{2}))?\b|\b(\d{1,2}):(\d{2})\b/gi;
function timeOf(text:string){const m=[...normalizeTime(text).matchAll(explicitTime)][0];if(!m)return null;const hour=Number(m[1]??m[4]??m[6]),minute=Number(m[2]??m[5]??m[7]??0),period=m[3]?.toLowerCase();return {hour:period?hour%12+(period==='pm'?12:0):hour,minute,period,valid:minute<60&&hour<(period?13:24)&&hour>=(period?1:0)};}
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
export const hasTimedIntent=(text:string)=>!!timeOf(text)||!!relativeDelay(text);
export function parseIST(phrase: string, now=new Date()): string | null {
  const lower=normalizeTime(schedulingText(phrase)).toLowerCase();
  if(/\b(?:or|versus|instead)\b/.test(lower)&&[...lower.matchAll(/\b(?:in\s+(?:another\s+)?|after\s+|another\s+)\d+\s*(?:hours?|hrs?|minutes?|mins?)\b/g)].length>1)return null;
  const spoken=timeOf(lower);
  if(spoken&&!spoken.valid)return null;
  if(spoken&&!spoken.period&&/\b(?:afternoon|evening|night|tonight)\b/.test(lower)&&spoken.hour<12)spoken.hour+=12;
  if(spoken&&!spoken.period&&/\bmorning\b/.test(lower)&&spoken.hour===12)spoken.hour=0;
  const base=DateTime.fromJSDate(now,{zone});
  const delay=relativeDelay(lower);
  if(delay)return base.plus({[delay.unit]:delay.count}).toUTC().toISO();
  const calendar=spokenDate(lower,now);
  if(calendar.mentioned&&!calendar.date)return null;
  if(calendar.date) {
    const date=calendar.date;
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
  if(spoken&&!result?.start.isCertain('day')&&!result?.start.isCertain('weekday')){let next=base.set({hour:spoken.hour,minute:spoken.minute,second:0,millisecond:0});if(next<=base)next=next.plus({days:1});return next.toUTC().toISO();}
  if(!result) return null;
  const c=result.start;
  return DateTime.fromObject({year:c.get('year')||base.year,month:c.get('month')||base.month,day:c.get('day')||base.day,hour:spoken?.hour??(c.isCertain('hour')?(c.get('hour')??9):9),minute:spoken?.minute??(c.isCertain('minute')?(c.get('minute')??0):0)},{zone}).toUTC().toISO();
}
// Parse a small, explicit Tamil/Tanglish scheduling grammar without rewriting speech.
// Unknown phrasing still becomes an editable draft instead of an invented schedule.
export function tamilExtract(transcript:string,now=new Date()):Extraction|null{
 const clean=transcript.trim();if(!/[\u0B80-\u0BFF]/.test(clean))return null;
 const meeting=/(?:மீட்டிங்|மீட்டிங்க்|மீட்|சந்திப்பு|சந்திக்க|\bmeet(?:ing)?\b)/iu.test(clean);
 const reminder=/(?:ரிமைண்டர்|நினைவூட்டு|\bremind(?:er)?\b)/iu.test(clean);
 const task=/(?:ஃபாலோ|பேசணும்|பேச\s*வேண்டும்|பாக்கணும்|கால்|அழைக்க|\bfollow[ -]?up\b|\bcall\b)/iu.test(clean);
 if(!meeting&&!reminder&&!task)return null;
 const kind:DraftAction['kind']=meeting?'meeting':reminder?'reminder':'follow_up';
 const dateParts:string[]=[];
 if(/நாளை\s*மறுநாள்|நாளைக்கு\s*மறுநாள்|day after tomorrow/iu.test(clean))dateParts.push('day after tomorrow');
 else if(/நாளை(?:க்கு)?|\btomorrow\b/iu.test(clean))dateParts.push('tomorrow');
 if(/இன்று|இன்னைக்கு|\btoday\b/iu.test(clean))dateParts.push('today');
 const weekdays=[['திங்கள்','monday'],['செவ்வாய்','tuesday'],['புதன்','wednesday'],['வியாழன்','thursday'],['வெள்ளி','friday'],['சனி','saturday'],['ஞாயிறு','sunday'],['ஃபிரைடே','friday'],['சாட்டர்டே','saturday']] as const;
 for(const [ta,en]of weekdays)if(clean.includes(ta))dateParts.push(`${/அடுத்த|நெக்ஸ்ட்|\bnext\b/iu.test(clean)?'next ':''}${en}`);
 const days=[...new Set(dateParts)];if(days.length>1)return null;
 const day=days[0]||'';
 const numbers:Record<string,string>={'ஒன்று':'1','ஒரு':'1','ஒன்னு':'1','இரண்டு':'2','ரெண்டு':'2','மூன்று':'3','மூணு':'3','நான்கு':'4','நாலு':'4','ஐந்து':'5','அஞ்சு':'5','ஆறு':'6','ஏழு':'7','எட்டு':'8','ஒன்பது':'9','பத்து':'10','பதினொன்று':'11','பன்னிரண்டு':'12'};
 let scheduling=clean.replace(/[௦-௯]/g,digit=>String('௦௧௨௩௪௫௬௭௮௯'.indexOf(digit)));
 for(const [word,digit]of Object.entries(numbers).sort((a,b)=>b[0].length-a[0].length))scheduling=scheduling.replace(new RegExp(`(^|[\\s,])${word}\\s*(?=மணி)`,'gu'),`$1${digit} `);
 const tamilClocks=[...scheduling.matchAll(/(\d{1,2})(?::(\d{2}))?\s*மணி(?:க்கு|யளவில்|க்குள்)?/gu)];
 if(tamilClocks.length>1)return null;
 const englishClocks=[...normalizeTime(scheduling).matchAll(explicitTime)];
 const tamilClock=tamilClocks[0];
 if(tamilClock&&englishClocks.some(match=>match.index!<tamilClock.index!||match.index!>=tamilClock.index!+tamilClock[0].length))return null;
 const englishClock=timeOf(scheduling);
 if(!tamilClock&&englishClocks.length>1)return null;
 const hour=tamilClock?Number(tamilClock[1]):englishClock?.hour;
 const minute=tamilClock?Number(tamilClock[2]||0):englishClock?.minute??0;
 const pm=/(?:மதியம்|பிற்பகல்|மாலை|இரவு|\bafternoon\b|\bevening\b|\bnight\b|\bp\.?m\.?)/iu.test(clean);
 const am=/(?:காலை|அதிகாலை|\bmorning\b|\ba\.?m\.?)/iu.test(clean);
 if(am&&pm)return null;
 let dueAt:string|null=day?parseIST(day,now):null;
 let timeChoices:string[]|undefined;
 let timeAmbiguity:'period'|undefined;
 const timed=hour!==undefined;
 if(timed){
  if(hour!<0||hour!>23||minute>59)return null;
  if(englishClock?.period&&!tamilClock)dueAt=parseIST(`${day} at ${hour}:${String(minute).padStart(2,'0')}`,now);
  else if(am||pm){if(hour!>12)return null;dueAt=parseIST(`${day} at ${hour===0?12:hour}:${String(minute).padStart(2,'0')} ${pm?'pm':'am'}`,now)}
  else if(hour!>=1&&hour!<=12){
   const candidates=['am','pm'].map(period=>parseIST(`${day} at ${hour}:${String(minute).padStart(2,'0')} ${period}`,now)).filter((value):value is string=>!!value);
   const future=candidates.filter(value=>Date.parse(value)>now.getTime());
   timeChoices=future.length?future:candidates;
   if(timeChoices.length===1){dueAt=timeChoices[0];timeChoices=undefined}else{dueAt=null;timeAmbiguity='period'}
  }else dueAt=parseIST(`${day} at ${hour}:${String(minute).padStart(2,'0')}`,now);
 }
 const before=clean.match(/([\p{L}\p{M}'-]+)\s+(?:கூட|உடன்|கிட்ட(?:ே)?)(?:\s|[.,]|$)/u)?.[1]||clean.match(/([\p{L}\p{M}'-]+?)(?:கிட்டே|கிட்ட)(?=\s|[.,]|$)/u)?.[1]||'';
 const withEnglish=clean.match(/\bwith\s+([\p{L}\p{M}'-]+)(?=\s+(?:sir|at|on|tomorrow|today)\b|[.,]|$)/iu)?.[1]||'';
 const contactName=/^(?:நான்|எனக்கு|நாளைக்கு|நாளை)$/.test(before)?'':before||withEnglish;
 return {contactName,topic:'',summary:clean,actions:[{kind,title:clean.slice(0,500),dueAt,timeSpecified:timed,reminderMinutes:0,timeChoices,timeAmbiguity}],mode:'Local rules'};
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
  const contactName=clean.match(/\b(?:met(?: with)?|discussion with|spoke (?:to|with))\s+((?:(?:Mr|Mrs|Ms|Dr)\.?\s+)?[\p{L}\p{M}'-]+)(?=\s+(?:sir|from|regarding|about|he|she)\b|[.,])/iu)?.[1]||'';
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
  const named=clean.match(/^(?:hey,?\s*)?name\s*:?(?:\s+is)?\s+([\p{L}\p{M}'-]+(?:\s+[\p{L}\p{M}'-]+){0,2})\s*[.;,]/iu)?.[1]||'';
  const caller=clean.match(/^([\p{L}\p{M}'-]+(?:\s+[\p{L}\p{M}'-]+){0,2})\s+(?:called|contacted|pinged|messaged)\s+(?:me|us)\b/iu)?.[1]||'';
  const person=clean.match(/\b(?:spoke (?:to|with)|met(?: with)?|discussion with|called|call(?: with)?|meeting(?: with)?|meet with)\s+((?:(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+)?(?:[\p{L}]\.\s+)?[\p{L}\p{M}'-]+(?:\s+(?!(?:on|at|by|about|for|to|tomorrow|today|next|in|after|another|and|or|we|from|he|she|they|who|sir|regarding)\b)[\p{L}\p{M}'-]+){0,2})/iu)?.[1]?.trim()||'';
  const collaborator=clean.match(/\b(?:prepare|discuss|presentation|document|proposal|PPT)\b.*?\bwith\s+([\p{L}\p{M}'-]+(?:\s+(?!(?:on|at|by|about|for|to|tomorrow|today|next|in|and|or)\b)[\p{L}\p{M}'-]+){0,2})(?=[.,;!?]|$|\s+(?:on|at|by|tomorrow|today|next)\b)/iu)?.[1]||'';
  const raw=(named||caller||person||collaborator).replace(/\s+sir$/i,'').replace(/\s+/g,' ').trim();
  const contactName=/^(me|him|her|them|us|it|someone|anyone|today|tomorrow|client|customer|prospect|team)$/i.test(raw)?'':raw;
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
        return {contactName,topic,summary:clean,actions:[...(hasFutureEvent?[{kind,title:event.slice(0,500),dueAt:parseIST(event.match(/\b(?:day after tomorrow|tomorrow)\b/i)?.[0]||event,now),timeSpecified:false,reminderMinutes:0} as DraftAction]:[]),alert],mode:'Local rules'};
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
  const caller=normalized.match(/^([\p{L}\p{M}'-]+(?:\s+[\p{L}\p{M}'-]+){0,2})\s+(?:called|contacted|pinged|messaged)\s+(?:me|us)\b/iu)?.[1]||'';
  const match=normalized.match(/\b(?:spoke (?:to|with)|talked (?:to|with)|met(?: with)?|discussion with|called|call(?: with)?|meeting(?: with)?|appointment(?: with)?|meet(?: with)?|follow[ -]up with)\s+((?:(?:Dr|Mr|Mrs|Ms|Prof)\s+)?[\p{L}\p{M}'-]+(?:\s+[\p{L}\p{M}'-]+){0,2}?)(?=\s+(?:on|at|by|about|for|to|tomorrow|today|next|in|after|another|and|or|sir)\b|[.,;!?]|$)/iu);
  const candidate=(caller||match?.[1]?.trim()||'').replace(/\s+sir$/i,'').trim();
  const contactName=candidate&&!/^(me|him|her|them|us|today|tomorrow|client|customer|prospect|team|someone|anyone)$/i.test(candidate)?candidate:'';
  const topic=clean.match(/\babout\s+(.+?)(?=\s*(?:[;,.]|\bremind\b|\bor\b|$))/i)?.[1]?.trim()||'';
  const spokenTimes=[...normalizeTime(clean).matchAll(explicitTime)].map(m=>m[0]);
  const conflicting=/\b(?:or|versus|vs\.?|instead)\b/i.test(clean)&&new Set(spokenTimes).size>1;
  const protectedText=clean.replace(/\b([ap])\.m\./gi,'$1\uE000m\uE000').replace(/(\d{1,2})\.(\d{2})\b/g,'$1\uE000$2').replace(/\b(Dr|Mr|Mrs|Ms|Prof)\.(?=\s)/gi,'$1\uE000').replace(/\b([A-Z])\.(?=\s+[A-Z])/g,'$1\uE000');
  const segments=conflicting?[clean]:protectedText.split(/(?:[.;]|\s+and\s+(?=(?:call|follow|remind|meet|schedule|reschedule|send|check)\b))/i).map(s=>s.replace(/\uE000/g,'.').trim()).filter(Boolean);
  const actions: DraftAction[]=[];
  for(const segment of segments) {
    const futureDiscussion=/\b(?:discuss|discussion|discussing)\b/i.test(segment)&&/\b(?:tomorrow|next|will|planned|plan to|at \d|by \d|on \w+day)\b/i.test(segment);
    const kind=/\b(meet|meeting|appointment|schedule|reschedule)\b/i.test(segment)||futureDiscussion?'meeting':/\b(remind|reminder)\b/i.test(segment)?'reminder':/\b(follow up|call|send|share|submit|deliver|prepare|update|finish|check back|reach out|get back)\b/i.test(segment)?'follow_up':null;
    if(!kind) continue;
    if(/\b(?:spoke|talked|called|met)\b/i.test(segment) && !/\b(?:need to|should|will|please|next|again|tomorrow|today|in \d+ days?|at \d|on \w+day)\b/i.test(segment)) continue;
    const dayContext=segment.match(/\b(?:day after tomorrow|tomorrow|today|in \d+ days?|on \w+day)\b/i)?.[0]||'';
    const choices=conflicting?spokenTimes.map(time=>parseIST(`${dayContext} ${time}`,now)).filter((value):value is string=>!!value):[];
    actions.push({kind,title:segment.charAt(0).toUpperCase()+segment.slice(1),dueAt:conflicting?null:parseIST(segment,now),timeSpecified:hasTimedIntent(segment),timeChoices:choices.length>1?choices:undefined});
  }
  return {contactName,topic,summary:clean,actions,mode:'Local rules'};
}
// Extract a literal name only after a person cue. Initials are name tokens,
// while scheduling words and pronouns cannot become a new contact.
function englishContact(text:string){
 const caller=text.match(/^([\p{L}\p{M}][\p{L}\p{M}'’ .-]*?)\s+(?:called|contacted|pinged|messaged)\s+(?:me|us)\b/iu)?.[1];
 if(caller)return englishContact(`Call ${caller} tomorrow`);
 const cue=/\b(?:spoke (?:to|with)|talked (?:to|with)|met(?: with)?|discussion with|called|call(?: with)?|meeting(?: with)?|appointment(?: with)?|meet(?: with)?|follow[ -]?up with|presentation with|prepare.*?\bwith)\s+/gi;
 const stop=/^(?:on|at|by|about|for|to|tomorrow|today|tonight|day|morning|afternoon|evening|next|this|in|after|another|and|or|we|from|he|she|they|who|regarding|is|has|will|have|with|please|so|of)\b/i;
 for(const match of text.matchAll(cue)){
  const rest=text.slice(match.index!+match[0].length);
  const tokens=[...rest.matchAll(/[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*\.?/gu)];
  let end=0,count=0;
  for(const token of tokens){
   if(/[^\s]/.test(rest.slice(end,token.index)))break;
   if(stop.test(token[0])||/^(?:sir|madam|ji)$/i.test(token[0]))break;
   const isInitial=/^[\p{L}]\.$/u.test(token[0]),isTitle=/^(?:Dr|Mr|Mrs|Ms|Prof)\.$/i.test(token[0]);
   end=token.index!+token[0].length;count++;
   if(token[0].endsWith('.')&&!isInitial&&!isTitle){end--;break}
   if(count===6)break;
  }
  const name=rest.slice(0,end).trim();
  if(name&&!/^(?:me|him|her|them|us|it|someone|anyone|client|customer|prospect|team|my|our|a|an|the)(?:\s|$)/i.test(name))return name;
 }
 return '';
}
// Keep unsupported offsets as a separate timed reminder; existing notification
// offsets and dispatch semantics remain unchanged.
function advanceReminder(transcript:string,now:Date):Extraction|null{
 const lead=/[.,;]?\s*(?:remind me|set (?:a |me a )?reminder)\s+(\d+|one|two|five|ten|fifteen|thirty|sixty)\s*(minutes?|mins?|hours?|days?)\s+before[.!]?\s*$/i.exec(transcript);
 if(!lead||lead.index===0)return null;
 const event=transcript.slice(0,lead.index).trim();
 const result=fastExtract(event,now);
 if(!result||result.actions.length!==1)return null;
 const words:Record<string,number>={one:1,two:2,five:5,ten:10,fifteen:15,thirty:30,sixty:60};
 const count=Number(lead[1])||words[lead[1].toLowerCase()];
 const minutes=count*(/^hour/i.test(lead[2])?60:/^day/i.test(lead[2])?1440:1);
 const action=result.actions[0];
 if(!minutes||minutes>525600||!action.dueAt||!action.timeSpecified||action.timeChoices?.length)return null;
 const alertAt=new Date(Date.parse(action.dueAt)-minutes*60000).toISOString();
 return {...result,summary:transcript,actions:[0,10,30,60,1440].includes(minutes)?[{...action,reminderMinutes:minutes}]:[action,{kind:'reminder',title:`Prepare: ${event}`.slice(0,500),dueAt:alertAt,timeSpecified:true,reminderMinutes:0}]};
}
// Client-safe fast path: only clear rule-based results bypass server AI.
function fastRules(transcript:string,now=new Date()):Extraction|null{
 const tamil=tamilExtract(transcript,now);if(tamil)return tamil;
 const template=templateExtract(transcript,now);if(template)return template;
 const advance=advanceReminder(transcript,now);if(advance)return advance;
 const natural=naturalExtract(transcript,now);if(natural)return natural;
 if(/[\u0B80-\u0BFF]/.test(transcript))return null;
 if(!/\b(?:follow[ -]?up|call|meet(?:ing)?|appointment|send|prepare|discuss)\b/i.test(transcript))return null;
 if(/\b(?:and|also|then)\b|[;\n]/i.test(transcript))return null;
 if(new Set([...normalizeTime(transcript).matchAll(explicitTime)].map(match=>match[0].toLowerCase())).size>1)return null;
 const result=localExtract(transcript,now);
 if(result.actions.length!==1)return null;

 return result;
}

export function fastExtract(transcript:string,now=new Date()):Extraction|null{
 const result=fastRules(transcript,now);if(!result)return null;
 if(/[\u0B80-\u0BFF]/.test(transcript))return result;
 if(!templateExtract(transcript,now))result.contactName=englishContact(transcript);
 // Check each action separately so tomorrow's meeting and tonight's preparation
 // keep their independent dates rather than becoming a false conflict.
 result.actions=result.actions.map(action=>{
  const calendar=spokenDate(action.title,now);
  const clock=timeOf(action.title);
  if(result.actions.length===1&&!calendar.warning&&clock&&clock.valid&&!clock.period&&clock.hour>=1&&clock.hour<=12&&!action.timeChoices?.length&&!/\b(?:morning|afternoon|evening|night|tonight)\b/i.test(action.title)){
   const text=normalizeTime(action.title),match=[...text.matchAll(explicitTime)][0];
   const context=text.slice(0,match.index!)+text.slice(match.index!+match[0].length);
   const choices=['am','pm'].map(period=>parseIST(`${context} at ${clock.hour}:${String(clock.minute).padStart(2,'0')} ${period}`,now)).filter((value):value is string=>!!value);
   const future=choices.filter(value=>Date.parse(value)>now.getTime());
   const usable=[...new Set(future.length?future:choices)];
   if(usable.length>1)return {...action,dueAt:null,timeChoices:usable,timeAmbiguity:'period'};
   if(usable.length===1)return {...action,dueAt:usable[0]};
  }
  return calendar.warning&&!action.dueAt&&!action.timeChoices?.length?{...action,dueAt:null,scheduleWarning:calendar.warning}:action;
 });
 return result;
}

// Always let the user review their own words; uncertain speech does not trigger AI.
export function createReviewDraft(transcript:string,now=new Date()):Extraction{
 const quick=fastExtract(transcript,now);if(quick)return quick;
 const text=transcript.trim();
 return {contactName:'',topic:'',summary:text,actions:[{kind:'follow_up',title:text.slice(0,500),dueAt:null,timeSpecified:false,reminderMinutes:0}],mode:'Local rules',needsManualReview:true};
}
