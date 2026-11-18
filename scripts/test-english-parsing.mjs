import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {DateTime} from 'luxon';
import {createReviewDraft,parseIST} from '../src/lib/localExtract.ts';

const now=new Date('2026-11-18T08:30:00Z'); // 2 PM IST, Wednesday
const at=(day,time='09:00')=>DateTime.fromISO(`${day}T${time}`,{zone:'Asia/Kolkata'}).toUTC().toISO();
const cases=[];
const example=(text,name,date,time,extra={})=>cases.push({text,name,date,time,...extra});
example('Call Arumugam on 20','Arumugam','2026-11-20');
example('Follow up with Richard on 25','Richard','2026-11-25');
example('Call Priya on the 20th','Priya','2026-11-20');
example('Call Priya on the twentieth','Priya','2026-11-20');
example('Call Priya on the twenty fifth','Priya','2026-11-25');
example('Follow up with Richard today','Richard','2026-11-18');
example('Follow up with Richard tomorrow','Richard','2026-11-19');
example('Meet Richard day after tomorrow','Richard','2026-11-20');
example('Follow up with Richard in 2 weeks','Richard','2026-12-02');
example('Meet Mohan on December 10 at 3 PM','Mohan','2026-12-10','15:00');
example('Meet Mohan on December tenth at 3 PM','Mohan','2026-12-10','15:00');
example('Call Priya on 25 December at 11 AM','Priya','2026-12-25','11:00');
example('Call Priya on 10/12/2026 at 5 PM','Priya','2026-12-10','17:00');
example('Call Priya on 2026-12-10 at 5 PM','Priya','2026-12-10','17:00');
example('Follow up with Richard next week on Friday','Richard','2026-11-27');
example('Follow up with Richard this week Friday','Richard','2026-11-20');
example('Meet Mohan next Monday at 3 PM','Mohan','2026-11-23','15:00');
example('Meeting with Dr. R. Arumugam tomorrow at 3 PM','Dr. R. Arumugam','2026-11-19','15:00');
example('Call R. K. Narayanan tomorrow at five PM','R. K. Narayanan','2026-11-19','17:00');
example("Meet Anne-Marie O’Connor tomorrow at 3 PM","Anne-Marie O’Connor",'2026-11-19','15:00');
example('Meet Arumugam sir tomorrow at 3 PM','Arumugam','2026-11-19','15:00');
example('Remind me to prepare for call with CMS Placement Officer at 2:45 today','CMS Placement Officer','2026-11-18','14:45');
example('Set a reminder for 5 AM to prepare presentation with Arumugam','Arumugam','2026-11-19','05:00');
example('Set a reminder for 5 AM to prepare presentation with Aarmugam','Aarmugam','2026-11-19','05:00');
example('Remind me tomorrow at 8 AM to prepare a PPT for the team meeting','', '2026-11-19','08:00');
example('Call Arjun tomorrow at 6 PM. Remind me 15 minutes before.','Arjun','2026-11-19','18:00',{alert:at('2026-11-19','17:45'),count:2});
example('Meet Arjun tomorrow at 6 PM. Remind me one hour before.','Arjun','2026-11-19','18:00',{offset:60});
example('Meet Arjun tomorrow at 6 PM. Remind me two hours before.','Arjun','2026-11-19','18:00',{alert:at('2026-11-19','16:00'),count:2});
example('Meet Arjun tomorrow at 3 PM. Remind me tonight at 6 PM.','Arjun','2026-11-19','15:00',{alert:at('2026-11-18','18:00'),count:2});
example('Hi, tomorrow I have a call with Arvind, so remind me by 6 p.m today.','Arvind','2026-11-19',undefined,{alert:at('2026-11-18','18:00'),count:2});
example('Follow up with Richard next week','Richard',null,undefined,{warning:/week.*day/});
example('Call Priya on 31 February at 3 PM','Priya',null,'15:00',{warning:/invalid/});
example('Call Priya on December 10 or December 12 at 3 PM','Priya',null,'15:00',{warning:/More than one date/});
example('Call Priya tomorrow at 3','Priya',null,'03:00',{choices:[at('2026-11-19','03:00'),at('2026-11-19','15:00')]});
example('Remind me to call Priya tomorrow at 3','Priya',null,'03:00',{choices:[at('2026-11-19','03:00'),at('2026-11-19','15:00')]});
example('Call Priya today at 3','Priya','2026-11-18','15:00');
example('Call Priya tomorrow at 3 in the afternoon','Priya','2026-11-19','15:00');

example('Call my client tomorrow','', '2026-11-19');
example('Call him tomorrow','', '2026-11-19');
example('Arjun called me. We will discuss the PPT tomorrow at 6 PM. Remind me one hour before.','Arjun','2026-11-19','18:00',{offset:60});
example('Call Priya on 20 next month','Priya','2026-12-20');
example('Call Priya tomorrow at 25:99','Priya',null,'25:99');
example('Call Priya today at 3 AM','Priya','2026-11-18','03:00');
example('Call Priya at 3 in the afternoon','Priya','2026-11-18','15:00');

example('Call Priya tomorrow 3 PM','Priya','2026-11-19','15:00');
example('Meet Priya tomorrow at three in the afternoon','Priya','2026-11-19','15:00');
example('Call Priya tomorrow at noon','Priya','2026-11-19','12:00');
example('Call Priya tomorrow at midnight','Priya','2026-11-19','00:00');

function check(parser,row){
 const result=parser(row.text,now),action=result.actions[0];
 assert.equal(result.summary,row.text);assert.equal(result.contactName,row.name);
 assert.equal(result.needsManualReview,undefined);
 assert.equal(result.actions.length,row.count||1);
 assert.equal(action.dueAt,row.date?at(row.date,row.time):null);
 assert.equal(action.timeSpecified,!!row.time);
 if(row.warning)assert.match(action.scheduleWarning,row.warning);
 if(row.choices)assert.deepEqual(Array.from(action.timeChoices||[]),row.choices);
 if(row.offset)assert.equal(action.reminderMinutes,row.offset);
 if(row.alert)assert.equal(result.actions.at(-1).dueAt,row.alert);
}
for(const row of cases){try{check(createReviewDraft,row)}catch(error){error.message=`${row.text}: ${error.message}`;throw error}}
// Bare dates roll to the next valid month; named past dates remain explicit.
for(const [text,reference,date]of [
 ['on 20','2026-11-26T08:30:00Z','2026-12-20'],
 ['on 31','2026-04-29T08:30:00Z','2026-05-31'],
 ['on 1','2026-12-31T08:30:00Z','2027-01-01'],
 ['December 10 2027','2026-11-18T08:30:00Z','2027-12-10'],
 ['October 3','2026-11-18T08:30:00Z','2026-10-03'],
 ['February 29 2028','2026-11-18T08:30:00Z','2028-02-29'],
 ['on 20 next month','2026-11-18T08:30:00Z','2026-12-20'],
 ['this Monday','2026-11-18T08:30:00Z','2026-11-16'],
 ['next Wednesday','2026-11-18T08:30:00Z','2026-11-25'],
 ])assert.equal(parseIST(text,new Date(reference)),at(date),text);
assert.equal(parseIST('February 29 2027',now),null);
assert.equal(parseIST('on 31 next month',new Date('2026-01-18T08:30:00Z')),null);

// Compare the identical corpus and warm parser latency against the shipped source.
const revision='a0435a9';
let source='';
try{source=execFileSync('git',['show',`${revision}:src/lib/localExtract.ts`],{encoding:'utf8',stdio:['ignore','pipe','pipe']})}catch{console.log('Historical benchmark skipped: baseline revision is absent from this checkout. Current regression assertions still ran.')}
const exports={};
const require=createRequire(import.meta.url);
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require,Date});
let previousPassed=source?0:null;for(const row of source?cases:[]){try{check(exports.createReviewDraft,row);previousPassed++}catch{}}
function measure(parser){
 for(let n=0;n<3;n++)for(const row of cases)parser(row.text,now);
 const samples=[];
 for(let n=0;n<20;n++)for(const row of cases){const start=performance.now();parser(row.text,now);samples.push(performance.now()-start)}
 samples.sort((a,b)=>a-b);
 return {p50Ms:+samples[Math.floor(samples.length*.5)].toFixed(3),p95Ms:+samples[Math.floor(samples.length*.95)].toFixed(3),samples:samples.length};
}
const report={method:'Same fixed English regression corpus, in-process warm local parsing; no audio, network or production latency.',previousRevision:revision,examples:cases.length,previousPassed,currentPassed:cases.length,previous:source?measure(exports.createReviewDraft):null,current:measure(createReviewDraft)};
writeFileSync('docs/english-parser-benchmark.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
