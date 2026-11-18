import { DateTime } from 'luxon';

const zone='Asia/Kolkata';
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
// Scheduling normalization is separate from the original transcript and names.
export function schedulingText(text:string){
 const ordinals:Record<string,number>={first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9,tenth:10,eleventh:11,twelfth:12,thirteenth:13,fourteenth:14,fifteenth:15,sixteenth:16,seventeenth:17,eighteenth:18,nineteenth:19,twentieth:20,'twenty first':21,'twenty second':22,'twenty third':23,'twenty fourth':24,'twenty fifth':25,'twenty sixth':26,'twenty seventh':27,'twenty eighth':28,'twenty ninth':29,thirtieth:30,'thirty first':31};
 const pattern=Object.keys(ordinals).sort((a,b)=>b.length-a.length).join('|');
 return text.replace(new RegExp(`\\b(on\\s+(?:the\\s+)?|(?:${months.join('|')})\\s+)(${pattern})\\b`,'gi'),(_m,prefix:string,word:string)=>`${prefix}${ordinals[word.toLowerCase()]}th`);
}
export type SpokenDate={mentioned:boolean;date:DateTime|null;warning?:string};
export function spokenDate(text:string,now:Date):SpokenDate{
 const lower=schedulingText(text).toLowerCase(),base=DateTime.fromJSDate(now,{zone}).startOf('day');
 const found:DateTime[]=[];
 let invalid=false;
 const add=(day:number,month:number,year:number)=>{const value=DateTime.fromObject({year,month,day},{zone});if(value.isValid)found.push(value);else invalid=true};
 const monthPattern=months.map(m=>`${m}|${m.slice(0,3)}`).join('|');
 const named=new RegExp(`\\b(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})|(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?)(?:,?\\s+(\\d{4}))?\\b`,'g');
 const spans:Array<[number,number]>=[];
 for(const m of lower.matchAll(named)){add(Number(m[1]||m[4]),months.findIndex(month=>month.startsWith(m[2]||m[3]))+1,Number(m[5]||base.year));spans.push([m.index!,m.index!+m[0].length])}
 for(const m of lower.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)){add(Number(m[3]),Number(m[2]),Number(m[1]));spans.push([m.index!,m.index!+m[0].length])}
 // Indian numeric dates are day/month; require a year to avoid clock/fraction ambiguity.
 for(const m of lower.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)){add(Number(m[1]),Number(m[2]),Number(m[3]));spans.push([m.index!,m.index!+m[0].length])}
 for(const m of lower.matchAll(/\b(?:on\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?|(\d{1,2})(?:st|nd|rd|th))\b/g)){
  if(spans.some(([a,b])=>m.index!>=a&&m.index!<b||m.index!+m[0].length>a&&m.index!<b))continue;
  const day=Number(m[1]||m[2]);
  if(day<1||day>31){invalid=true;continue}
  // Bare dates mean the next occurrence. Skip months without that day.
  const monthOffset=/\bnext month\b/.test(lower)?1:0;
  const fixedMonth=/\b(?:next|this) month\b/.test(lower);
  for(let n=monthOffset;n<13;n++){
   const month=base.startOf('month').plus({months:n});
   if(day<=month.daysInMonth!){const candidate=month.set({day});if(fixedMonth||candidate>=base){found.push(candidate);break}}
   if(fixedMonth){invalid=true;break}
  }
 }
 const relative=lower.replace(/day after tomorrow/g,'__plus_two__');
 if(/__plus_two__/.test(relative))found.push(base.plus({days:2}));
 if(/\btomorrow\b/.test(relative))found.push(base.plus({days:1}));
 if(/\b(?:today|tonight)\b/.test(relative))found.push(base);
 for(const m of lower.matchAll(/\bin\s+(\d+)\s+(days?|weeks?)\b/g))found.push(base.plus({days:Number(m[1])*(m[2].startsWith('week')?7:1)}));
 const weekdays=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
 for(const m of lower.matchAll(/\b(?:(next|this)\s+week\s+(?:on\s+)?|(next|this)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g)){
  const weekday=weekdays.indexOf(m[3])+1;
  const date=m[1]||m[2]==='this'?base.startOf('week').plus({weeks:m[1]==='next'?1:0,days:weekday-1}):base.plus({days:(weekday-base.weekday+7)%7|| (m[2]==='next'?7:0)});
  found.push(date);
 }
 const vague=/\b(?:next|this)\s+week\b/.test(lower)&&!weekdays.some(day=>new RegExp(`\\b${day}\\b`).test(lower));
 const unique=[...new Set(found.map(date=>date.toISODate()))];
 if(invalid)return {mentioned:true,date:null,warning:'The spoken date is invalid. Choose the date you meant.'};
 if(unique.length>1)return {mentioned:true,date:null,warning:'More than one date was mentioned. Choose the date for this action.'};
 if(vague)return {mentioned:true,date:null,warning:'A week was mentioned without a day. Choose the date you meant.'};
 return {mentioned:found.length>0,date:found[0]||null};
}
