'use client';
import { useRef, useState } from 'react';
import { DateTime } from 'luxon';
import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Mic, Plus, Search, Settings2 } from 'lucide-react';
import IstDateTimePicker, { istDate } from './IstDateTimePicker';

export type SalesAction={id:string;contactId:string;contactName:string;kind:'follow_up'|'reminder'|'meeting';title:string;dueAt:string|null;timeSpecified?:number;durationMinutes?:number;status:string;createdAt:string};
export type SalesContact={id:string;name:string};
export type QuickEntry={contactId:string;contactName:string;title:string;dueAt:string|null;timeSpecified:boolean};
const zone='Asia/Kolkata';
const today=()=>DateTime.now().setZone(zone).startOf('day');
const dayKey=(iso:string)=>DateTime.fromISO(iso).setZone(zone).toISODate()||'';
const time=(iso:string)=>DateTime.fromISO(iso).setZone(zone).toFormat('h:mm a');
const label=(kind:string)=>kind==='meeting'?'Meeting':kind==='reminder'?'Reminder':'Follow-up';

export function SalesActionCard({action,onContact,onComplete,featured=false}:{action:SalesAction;onContact:(id:string)=>void;onComplete:(id:string)=>void;featured?:boolean}){
  return <article className={`sales-task-card ${featured?'featured':''} ${action.kind}`}>
    <div className="sales-task-top"><span className="sales-task-kind">{label(action.kind)}</span><span className="sales-task-time">{action.dueAt?(action.timeSpecified===0?'Any time':`${time(action.dueAt)} IST`):'No date'}</span></div>
    <h3>{action.title}</h3>{action.contactName&&<p>With {action.contactName}</p>}
    <div className="sales-task-bottom">{action.contactId&&<button onClick={()=>onContact(action.contactId)}>View conversation <ArrowRight size={15}/></button>}<button className="sales-task-done" onClick={()=>onComplete(action.id)} aria-label={`Complete ${action.title}`}><Check size={18}/></button></div>
  </article>;
}

export function MonthlyCalendar({actions,onContact,onComplete,compact=false}:{actions:SalesAction[];onContact:(id:string)=>void;onComplete:(id:string)=>void;compact?:boolean}){
  const [month,setMonth]=useState(today().startOf('month'));
  const [selected,setSelected]=useState(today().toISODate()||'');
  const first=month.startOf('month');const blanks=first.weekday-1;
  const dates=Array.from({length:blanks+month.daysInMonth!},(_,i)=>i<blanks?null:first.plus({days:i-blanks}));
  const counts=new Map<string,number>();
  for(const action of actions)if(action.status==='pending'&&action.dueAt){const key=dayKey(action.dueAt);counts.set(key,(counts.get(key)||0)+1)}
  const selectedActions=actions.filter(a=>a.status==='pending'&&a.dueAt&&dayKey(a.dueAt)===selected);
  return <section className={`sales-calendar ${compact?'compact':''}`}><div className="sales-section-head"><div><span className="sales-overline">PLAN AHEAD</span><h2>{compact?'Your calendar':'Monthly calendar'}</h2></div><div className="sales-month-controls"><button onClick={()=>setMonth(month.minus({months:1}))} aria-label="Previous month"><ChevronLeft size={19}/></button><strong>{month.toFormat('LLLL yyyy')}</strong><button onClick={()=>setMonth(month.plus({months:1}))} aria-label="Next month"><ChevronRight size={19}/></button></div></div><div className="sales-weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=><span key={x}>{x}</span>)}</div><div className="sales-days">{dates.map((d,i)=>d?<button key={d.toISODate()} className={`${d.toISODate()===selected?'selected':''} ${d.toISODate()===today().toISODate()?'today':''}`} onClick={()=>setSelected(d.toISODate()||'')}><span>{d.day}</span>{counts.get(d.toISODate()||'')?<i/>:null}</button>:<span key={`blank-${i}`}/>)}</div><div className="sales-calendar-agenda"><strong>{DateTime.fromISO(selected,{zone}).toFormat('cccc, d LLLL')}</strong><span>{selectedActions.length} {selectedActions.length===1?'action':'actions'}</span></div>{selectedActions.length?<div className="sales-calendar-tasks">{selectedActions.map(a=><SalesActionCard key={a.id} action={a} onContact={onContact} onComplete={onComplete}/>)}</div>:<p className="sales-calendar-empty">No actions planned for this day.</p>}</section>;
}

type Filter='all'|'today'|'overdue'|'upcoming'|'done';
export default function SalesDashboard({name,actions,contacts,onCapture,onContact,onComplete,onSettings,onQuickAdd,onReopen,loading,loadError,onRetry}:{name:string;actions:SalesAction[];contacts:SalesContact[];loading:boolean;loadError:string;onRetry:()=>void;onCapture:()=>void;onContact:(id:string)=>void;onComplete:(id:string)=>void;onSettings:()=>void;onQuickAdd:(entry:QuickEntry)=>Promise<void>;onReopen:(id:string)=>void}){
  const [filter,setFilter]=useState<Filter>('today');
  const [query,setQuery]=useState('');
  const [title,setTitle]=useState('');
  const [contactId,setContactId]=useState('');
  const [contactName,setContactName]=useState('');
  const [dueAt,setDueAt]=useState<string|null>(()=>istDate(today()));
  const [timeSpecified,setTimeSpecified]=useState(false);
  const [busy,setBusy]=useState(false);
  const [quickError,setQuickError]=useState('');
  const [quickDateOpen,setQuickDateOpen]=useState(false);
  const listRef=useRef<HTMLElement|null>(null);
  const key=today().toISODate();
  const visible=actions.filter(a=>a.status==='pending'||a.status==='done');
  const due=visible.filter(a=>a.status==='pending'&&a.dueAt&&dayKey(a.dueAt)===key);
  const overdue=visible.filter(a=>a.status==='pending'&&a.dueAt&&dayKey(a.dueAt)<key!);
  const upcoming=visible.filter(a=>a.status==='pending'&&a.dueAt&&dayKey(a.dueAt)>key!);
  const done=visible.filter(a=>a.status==='done');
  const filters:{id:Filter;title:string;count:number;description:string}[]=[
    {id:'all',title:'All',count:visible.length,description:'Every follow-up'},
    {id:'today',title:'Today',count:due.length,description:'Due today'},
    {id:'overdue',title:'Overdue',count:overdue.length,description:'Needs attention'},
    {id:'upcoming',title:'Upcoming',count:upcoming.length,description:'Plan ahead'},
    {id:'done',title:'Completed',count:done.length,description:'Finished'},
  ];
  const filtered=(filter==='all'?visible:filter==='today'?due:filter==='overdue'?overdue:filter==='upcoming'?upcoming:done)
    .filter(a=>`${a.title} ${a.contactName}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>filter==='done'?b.createdAt.localeCompare(a.createdAt):(a.dueAt||'9999').localeCompare(b.dueAt||'9999'));
  function chooseFilter(next:Filter){setFilter(next)}
  async function addQuick(event:React.FormEvent){event.preventDefault();setQuickError('');if(!title.trim()){setQuickError('Add a follow-up title.');return}setBusy(true);try{await onQuickAdd({title:title.trim(),contactId,contactName:contactName.trim(),dueAt,timeSpecified});const nextFilter:Filter=!dueAt?'all':dayKey(dueAt)===key?'today':dayKey(dueAt)<key!?'overdue':'upcoming';setTitle('');setContactName('');setDueAt(istDate(today()));setTimeSpecified(false);setQuickDateOpen(false);setFilter(nextFilter);requestAnimationFrame(()=>listRef.current?.scrollIntoView({behavior:'smooth',block:'start'}))}catch(e){setQuickError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  return <div className="followup-home">
    <header className="followup-home-head"><div><span className="sales-overline">YOUR DAY, AT A GLANCE</span><h1>Follow-ups<span className="heading-period">.</span></h1><p>Everything you promised, ready when you need it.</p></div><button className="sales-settings-shortcut" onClick={onSettings} aria-label="Reminder settings"><Settings2 size={20}/></button></header>
    <div className="followup-summary" role="group" aria-label="Follow-up summaries">{filters.map(item=><button type="button" key={item.id} className={`followup-summary-box ${item.id} ${filter===item.id?'active':''}`} onClick={()=>chooseFilter(item.id)} aria-pressed={filter===item.id}><span>{item.title}</span><strong>{item.count}</strong><small>{item.description}</small></button>)}</div>
    <form id="quick-followup" className="quick-followup" onSubmit={addQuick}><div className="quick-followup-head"><div><span className="sales-overline">QUICK ENTRY</span><h2>Add a follow-up</h2></div><button type="button" onClick={onCapture}><Mic size={17}/> Speak instead</button></div><label className="quick-followup-title">What do you need to follow up on?<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Call Priya about the quote" maxLength={500} required/></label><div className="quick-followup-person"><label>Person<select value={contactId} onChange={e=>setContactId(e.target.value)}><option value="">No person / add a name</option>{contacts.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>{!contactId&&<label>Person’s name (optional)<input value={contactName} onChange={e=>setContactName(e.target.value)} placeholder="Who is this for?" maxLength={120}/></label>}</div><button className="quick-date-trigger" type="button" onClick={()=>setQuickDateOpen(!quickDateOpen)} aria-expanded={quickDateOpen}><CalendarDays size={17}/><span>{dueAt?DateTime.fromISO(dueAt).setZone(zone).toFormat('ccc, d LLL'):'No date'} · {dueAt&&timeSpecified?time(dueAt):'Any time'}</span><ChevronRight size={17}/></button>{quickDateOpen&&<IstDateTimePicker value={dueAt} timeSpecified={timeSpecified} onChange={(date,timed)=>{setDueAt(date);setTimeSpecified(timed)}}/>}<button className="quick-followup-submit" type="submit" disabled={busy||!title.trim()}><Plus size={18}/>{busy?'Saving…':'Add follow-up'}</button>{quickError&&<div className="error" role="alert">{quickError}</div>}</form>
    <section className="followup-list" ref={listRef}><div className="followup-list-head"><div><span className="sales-overline">YOUR FOLLOW-UPS</span><h2>{filters.find(item=>item.id===filter)?.title} <span>{filtered.length}</span></h2></div><button className="followup-list-add" onClick={()=>document.getElementById('quick-followup')?.scrollIntoView({behavior:'smooth',block:'start'})}><Plus size={16}/> Add</button><label className="followup-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search" aria-label="Search follow-ups"/></label></div>{loading?<div className="followup-list-cards" aria-label="Loading follow-ups">{Array.from({length:3},(_,i)=><div className="followup-list-card followup-skeleton" key={i}><span/><strong/><span/><span/></div>)}</div>:loadError?<div className="followup-empty" role="alert"><strong>Could not load follow-ups.</strong><p>{loadError}</p><button type="button" onClick={onRetry}>Try again</button></div>:filtered.length?<div className="followup-list-cards">{filtered.map(a=><article className={`followup-list-card ${a.status==='pending'&&a.dueAt&&dayKey(a.dueAt)===key?'is-today':''} ${a.status==='done'?'is-done':''}`} key={a.id}><div className="followup-list-card-head"><span className="followup-kind">{label(a.kind)}</span><span className="followup-date">{a.dueAt?DateTime.fromISO(a.dueAt).setZone(zone).toFormat('d LLL'):'No date'}{a.dueAt&&a.timeSpecified!==0?` · ${time(a.dueAt)}`:''}</span></div><h3>{a.title}</h3>{a.contactId&&<button className="followup-person-link" onClick={()=>onContact(a.contactId)}>{a.contactName} <ArrowRight size={14}/></button>}<div className="followup-card-actions">{a.contactId?<button onClick={()=>onContact(a.contactId)}>View details</button>:<span className="followup-unlinked">No person linked</span>}<button className="followup-complete" onClick={()=>a.status==='done'?onReopen(a.id):onComplete(a.id)}>{a.status==='done'?'Reopen':'Complete'} <Check size={15}/></button></div></article>)}</div>:<div className="followup-empty"><strong>{filter==='today'?'Nothing due today.':'No follow-ups here yet.'}</strong><p>{filter==='today'?'You have time to meet your next prospect.':'Try another summary or add a follow-up above.'}</p></div>}</section>
  </div>;
}
