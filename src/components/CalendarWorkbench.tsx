'use client';
import { useState } from 'react';
import { DateTime } from 'luxon';
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { MonthlyCalendar, type SalesAction } from './SalesDashboard';

const zone='Asia/Kolkata';
const key=(iso:string)=>DateTime.fromISO(iso).setZone(zone).toISODate()||'';
const hourHeight=58;
const startHour=7;
const endHour=21;
type Props={actions:SalesAction[];onBack:()=>void;onContact:(id:string)=>void;onComplete:(id:string)=>void};

export default function CalendarWorkbench({actions,onBack,onContact,onComplete}:Props){
  const [mode,setMode]=useState<'day'|'week'|'month'>('week');
  const [anchor,setAnchor]=useState(DateTime.now().setZone(zone).startOf('day'));
  const start=mode==='month'?anchor.startOf('month'):mode==='week'?anchor.startOf('week'):anchor;
  const days=mode==='day'?[anchor]:Array.from({length:7},(_,i)=>start.plus({days:i}));
  const monthStart=anchor.startOf('month').startOf('week');
  const monthEnd=anchor.endOf('month').endOf('week');
  const monthDays=Array.from({length:Math.round(monthEnd.diff(monthStart,'days').days)+1},(_,i)=>monthStart.plus({days:i}));
  const shift=(direction:number)=>setAnchor(value=>mode==='month'?value.plus({months:direction}):value.plus({days:direction*(mode==='week'?7:1)}));
  const dateLabel=mode==='month'?anchor.toFormat('LLLL yyyy'):mode==='day'?anchor.toFormat('cccc, d LLLL yyyy'):`${start.toFormat('d LLL')} – ${start.plus({days:6}).toFormat('d LLL yyyy')}`;
  const dated=actions.filter(a=>a.status==='pending'&&a.dueAt);
  const anytime=dated.filter(a=>a.timeSpecified===0&&days.some(day=>key(a.dueAt!)===day.toISODate()));
  return <div className="calendar-workbench"><button className="sales-back" onClick={onBack}><ArrowLeft size={17}/> Back to dashboard</button>
    <div className="calendar-mobile"><MonthlyCalendar actions={actions} onContact={onContact} onComplete={onComplete}/></div>
    <div className="calendar-desktop"><div className="calendar-workbench-head"><div><span className="sales-overline">PLAN YOUR WEEK</span><h1>Calendar</h1><p>Meetings show their planned duration. All times are IST.</p></div><div className="calendar-workbench-controls"><div className="calendar-modes">{(['day','week','month'] as const).map(value=><button key={value} className={mode===value?'active':''} onClick={()=>setMode(value)}>{value}</button>)}</div><div className="calendar-nav"><button onClick={()=>setAnchor(DateTime.now().setZone(zone).startOf('day'))}>Today</button><button onClick={()=>shift(-1)} aria-label={`Previous ${mode}`}><ChevronLeft size={18}/></button><button onClick={()=>shift(1)} aria-label={`Next ${mode}`}><ChevronRight size={18}/></button></div></div></div><div className="calendar-period">{dateLabel}</div>
    {mode==='month'?<div className="calendar-month-grid">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=><div className="calendar-month-weekday" key={day}>{day}</div>)}{monthDays.map(day=>{const dayActions=dated.filter(a=>key(a.dueAt!)===day.toISODate());return <div className={`calendar-month-cell ${day.month!==anchor.month?'outside':''} ${day.hasSame(DateTime.now().setZone(zone),'day')?'today':''}`} key={day.toISODate()}><div className="calendar-month-date">{day.day}</div>{dayActions.slice(0,4).map(a=><button key={a.id} className={`calendar-chip ${a.kind}`} onClick={()=>a.contactId&&onContact(a.contactId)} title={a.title}>{a.kind==='meeting'&&<CalendarDays size={12}/>}<span>{a.timeSpecified===0?'Any time':DateTime.fromISO(a.dueAt!).setZone(zone).toFormat('h:mm')} {a.title}</span></button>)}{dayActions.length>4&&<small>+{dayActions.length-4} more</small>}</div>})}</div>:<>{anytime.length>0&&<div className="calendar-anytime"><strong>Any time</strong>{anytime.map(a=><button key={a.id} onClick={()=>a.contactId&&onContact(a.contactId)}>{DateTime.fromISO(a.dueAt!).setZone(zone).toFormat('ccc d LLL')} · {a.title}</button>)}</div>}<div className={`calendar-time-grid ${mode==='day'?'day':''}`} style={{gridTemplateColumns:`56px repeat(${days.length}, minmax(0,1fr))`}}><div className="calendar-corner"/>{days.map(day=><div className={`calendar-day-head ${day.hasSame(DateTime.now().setZone(zone),'day')?'today':''}`} key={day.toISODate()}><span>{day.toFormat('ccc')}</span><strong>{day.day}</strong></div>)}<div className="calendar-hour-rail" style={{height:(endHour-startHour)*hourHeight}}>{Array.from({length:endHour-startHour},(_,i)=><div key={i} style={{height:hourHeight}}>{DateTime.now().setZone(zone).set({hour:startHour+i,minute:0}).toFormat('h a')}</div>)}</div>{days.map(day=><div className="calendar-day-lane" style={{height:(endHour-startHour)*hourHeight}} key={day.toISODate()}>{Array.from({length:endHour-startHour},(_,i)=><div className="calendar-hour-line" style={{top:i*hourHeight}} key={i}/>)}{dated.filter(a=>a.timeSpecified!==0&&key(a.dueAt!)===day.toISODate()).map(a=>{const when=DateTime.fromISO(a.dueAt!).setZone(zone);const top=Math.max(0,(when.hour-startHour+when.minute/60)*hourHeight);const duration=a.kind==='meeting'?(a.durationMinutes||30):30;const height=Math.max(34,Math.min(duration/60*hourHeight,4*hourHeight));return <button key={a.id} className={`calendar-event ${a.kind}`} style={{top,height}} onClick={()=>a.contactId&&onContact(a.contactId)} title={`${a.title} · ${duration} minutes`}><strong>{when.toFormat('h:mm a')} · {a.title}</strong><span>{a.contactName}{a.kind==='meeting'?` · ${duration} min`:''}</span></button>})}</div>)}</div></>}
    </div>
  </div>;
}
