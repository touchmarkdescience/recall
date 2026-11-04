import * as chrono from 'chrono-node';
import { DateTime } from 'luxon';

export type DraftAction = { kind: 'follow_up'|'reminder'|'meeting'; title: string; dueAt: string | null; timeSpecified?: boolean; durationMinutes?: number; timeChoices?: string[] };
export type Extraction = { contactName: string; topic: string; summary: string; actions: DraftAction[]; mode: 'AI'|'Local rules' };
const zone='Asia/Kolkata';
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
export function parseIST(phrase: string, now=new Date()): string | null {
  const lower=phrase.toLowerCase().replace(/\b([ap])\.m\./g,'$1m');
  const base=DateTime.fromJSDate(now,{zone});
  const hours=lower.match(/\bin\s+(\d+)\s*(hours?|hrs?|minutes?|mins?)\b/);
  if(hours){const count=Number(hours[1]);const unit=hours[2].startsWith('h')?'hours':'minutes';return base.plus({[unit]:count}).toUTC().toISO()}
  const days=lower.match(/\bin\s+(\d+)\s+days?\b/);
  let d: DateTime | null=null;
  if(days) d=base.plus({days:Number(days[1])});
  else if(/\bday after tomorrow\b/.test(lower)) d=base.plus({days:2});
  else if(/\btomorrow\b/.test(lower)) d=base.plus({days:1});
  else if(/\btoday\b/.test(lower)) d=base;
  const dayFirst=lower.match(/\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?\b/);
  const monthFirst=lower.match(/\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/);
  const named=dayFirst&&months.findIndex(month=>month.startsWith(dayFirst[2]))>=0?{day:Number(dayFirst[1]),month:months.findIndex(month=>month.startsWith(dayFirst[2]))+1,year:Number(dayFirst[3]||base.year)}:monthFirst&&months.findIndex(month=>month.startsWith(monthFirst[1]))>=0?{day:Number(monthFirst[2]),month:months.findIndex(month=>month.startsWith(monthFirst[1]))+1,year:Number(monthFirst[3]||base.year)}:null;
  if(named){const time=lower.match(/\b(?:at|around|by)\s+(\d{1,2})(?::(\d\d))?\s*(am|pm)?\b/);const hour=time?Number(time[1])%12+(time[3]==='pm'?12:time[3]==='am'?0:(Number(time[1])<8?12:0)):9;const date=DateTime.fromObject({...named,hour,minute:Number(time?.[2]||0),second:0,millisecond:0},{zone});return date.isValid?date.toUTC().toISO():null}
  if(d) {
    const time=lower.match(/\b(?:at|around|by)\s+(\d{1,2})(?::(\d\d))?\s*(am|pm)?\b/);
    let hour=9, minute=0;
    if(/afternoon/.test(lower)) hour=15;
    if(/evening/.test(lower)) hour=18;
    if(/morning/.test(lower)) hour=9;
    if(time) { hour=Number(time[1])%12+(time[3]==='pm'?12:time[3]==='am'?0:(Number(time[1])<8?12:0)); minute=Number(time[2]||0); }
    return d.set({hour,minute,second:0,millisecond:0}).toUTC().toISO();
  }
  const reference=new Date(base.year,base.month-1,base.day,base.hour,base.minute);
  const result=chrono.parse(phrase,reference,{forwardDate:true})[0];
  if(!result) return null;
  const c=result.start;
  return DateTime.fromObject({year:c.get('year')||base.year,month:c.get('month')||base.month,day:c.get('day')||base.day,hour:c.isCertain('hour')?(c.get('hour')??9):9,minute:c.isCertain('minute')?(c.get('minute')??0):0},{zone}).toUTC().toISO();
}
export function localExtract(transcript: string): Extraction {
  const clean=transcript.trim();
  const normalized=clean.replace(/\b(Dr|Mr|Mrs|Ms|Prof)\.(?=\s)/gi,'$1');
  const match=normalized.match(/\b(?:spoke (?:to|with)|talked (?:to|with)|met(?: with)?|called|call|meeting(?: with)?|meet with|follow up with)\s+((?:(?:Dr|Mr|Mrs|Ms|Prof)\s+)?[\p{L}'-]+(?:\s+[\p{L}'-]+){0,2}?)(?=\s+(?:on|at|about|for|to|tomorrow|today|next|in|and|or)\b|[.,;!?]|$)/iu);
  const candidate=match?.[1]?.trim()||'';
  const contactName=candidate&&candidate[0]===candidate[0].toLocaleUpperCase()&&!/^(today|tomorrow|client|customer|prospect|team|someone|anyone)$/i.test(candidate)?candidate:'';
  const topic=clean.match(/\babout\s+(.+?)(?=\s*(?:[;,.]|\bremind\b|\bor\b|$))/i)?.[1]?.trim()||'';
  const spokenTimes=[...clean.matchAll(/\b(?:at|by|around|is)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=\s|$|[.;!?—-])/gi)].map(m=>`${m[1]}:${m[2]||'00'} ${m[3].replace(/\./g,'').toUpperCase()}`);
  const conflicting=/\b(?:or|versus|vs\.?|instead)\b/i.test(clean)&&new Set(spokenTimes).size>1;
  const protectedText=clean.replace(/\b(Dr|Mr|Mrs|Ms|Prof)\.(?=\s)/gi,'$1\uE000');
  const segments=conflicting?[clean]:protectedText.split(/(?:[.;]|\s+and\s+(?=(?:call|follow|remind|meet|schedule|reschedule|send|check)\b))/i).map(s=>s.replace(/\uE000/g,'.').trim()).filter(Boolean);
  const actions: DraftAction[]=[];
  for(const segment of segments) {
    const kind=/\b(meet|meeting|schedule|reschedule)\b/i.test(segment)?'meeting':/\b(remind|reminder)\b/i.test(segment)?'reminder':/\b(follow up|call|send|share|submit|deliver|prepare|update|finish|check back|reach out|get back)\b/i.test(segment)?'follow_up':null;
    if(!kind) continue;
    if(/\b(?:spoke|talked|called|met)\b/i.test(segment) && !/\b(?:need to|should|will|please|next|again|tomorrow|today|in \d+ days?|at \d|on \w+day)\b/i.test(segment)) continue;
    const dayContext=segment.match(/\b(?:day after tomorrow|tomorrow|today|in \d+ days?|on \w+day)\b/i)?.[0]||'';
    const choices=conflicting?spokenTimes.map(time=>parseIST(`${dayContext} at ${time}`)).filter((value):value is string=>!!value):[];
    actions.push({kind,title:segment.charAt(0).toUpperCase()+segment.slice(1),dueAt:conflicting?null:parseIST(segment),timeSpecified:spokenTimes.length>0,timeChoices:choices.length>1?choices:undefined});
  }
  return {contactName,topic,summary:clean,actions,mode:'Local rules'};
}
export async function extract(transcript: string): Promise<Extraction> {
  if(!process.env.OPENAI_API_KEY) return localExtract(transcript);
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',max_completion_tokens:700,response_format:{type:'json_object'},messages:[{role:'system',content:`Return only JSON: {"contactName":"","topic":"","summary":"","actions":[]}. Each explicit next step has kind (follow_up, reminder, meeting), short title, dueAt (UTC ISO or null), and timeChoices (UTC ISO array only for conflicting spoken times). A person's name is optional. Extract it only from a person cue such as "meeting Sujay"; a topic after "about" is not a person. Use only stated facts. Do not invent a person, action, date, time, or duration. A discussion without an explicit next step has actions:[]. Keep the summary to one sentence. Interpret relative dates in Asia/Kolkata; now is ${DateTime.now().setZone(zone).toISO()}. For alternatives such as "1 pm or 4 pm", use dueAt:null and timeChoices with both times. Limit actions to 10.`},{role:'user',content:transcript}]})});
  if(!response.ok) throw new Error(`AI request failed (${response.status})`);
  const data=await response.json();
  const parsed=JSON.parse(data.choices?.[0]?.message?.content||'{}');
  const result={contactName:String(parsed.contactName||'').slice(0,120),topic:String(parsed.topic||'').slice(0,200),summary:String(parsed.summary||transcript).slice(0,1000),actions:Array.isArray(parsed.actions)?parsed.actions.slice(0,10).filter((a:DraftAction)=>a&&['follow_up','reminder','meeting'].includes(a.kind)&&typeof a.title==='string'&&a.title.trim()).map((a:DraftAction)=>({kind:a.kind,title:a.title.trim().slice(0,500),dueAt:a.dueAt&&DateTime.fromISO(a.dueAt).isValid?a.dueAt:null,timeSpecified:a.timeSpecified,timeChoices:Array.isArray(a.timeChoices)?a.timeChoices.filter(x=>typeof x==='string'&&DateTime.fromISO(x).isValid).slice(0,4):undefined})):[],mode:'AI' as const};
  const guard=localExtract(transcript);
  if(guard.contactName)result.contactName=guard.contactName;
  if(guard.topic)result.topic=guard.topic;
  if(result.contactName&&result.topic&&result.contactName.toLocaleLowerCase()===result.topic.toLocaleLowerCase())result.contactName='';
  if(guard.actions[0]?.timeChoices?.length){result.actions=result.actions.map((a:DraftAction)=>({...a,dueAt:null,timeChoices:guard.actions[0].timeChoices}));}
  return result;
}
