'use client';
import { useState } from 'react';
import { DateTime } from 'luxon';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';

const zone='Asia/Kolkata';
const today=()=>DateTime.now().setZone(zone).startOf('day');
export function istDate(date:DateTime,time='09:00'){const [hour,minute]=time.split(':').map(Number);return date.set({hour,minute,second:0,millisecond:0}).toUTC().toISO()!;}
export function istDateKey(value:string|null){return value?DateTime.fromISO(value).setZone(zone).toISODate()||'':''}

type Props={value:string|null;timeSpecified:boolean;onChange:(value:string|null,timeSpecified:boolean)=>void;allowNone?:boolean;label?:string;mode?:'due'|'conversation'};
export default function IstDateTimePicker({value,timeSpecified,onChange,allowNone=true,label='Due date · IST',mode='due'}:Props){
  const selected=value?DateTime.fromISO(value).setZone(zone):null;
  const [month,setMonth]=useState<DateTime>((selected||today()).startOf('month'));
  const [calendarOpen,setCalendarOpen]=useState(false);
  const [customTime,setCustomTime]=useState(false);
  const [warning,setWarning]=useState('');
  const dateKey=selected?.toISODate()||'';
  const selectedTime=selected?.toFormat('HH:mm')||'09:00';
  const validate=(next:string,timed:boolean)=>{const difference=DateTime.fromISO(next).toMillis()-Date.now();if(mode==='conversation'&&difference>0){setWarning('A conversation cannot be recorded in the future. Choose the time you spoke.');return false}if(mode==='due'&&timed&&difference<0){setWarning('That time has already passed in IST. Choose a later time.');return false}setWarning('');return true};
  const chooseDate=(day:DateTime)=>{const next=istDate(day,timeSpecified?selectedTime:'09:00');if(!validate(next,timeSpecified))return;onChange(next,timeSpecified);setMonth(day.startOf('month'));setCalendarOpen(false)};
  const chooseTime=(clock:string|null,keepCustom=false)=>{const day=selected||today();const next=istDate(day,clock||'09:00');if(!validate(next,clock!==null))return;onChange(next,clock!==null);if(!keepCustom)setCustomTime(false)};
  const dates=Array.from({length:month.startOf('month').weekday-1+month.daysInMonth!},(_,i)=>i<month.weekday-1?null:month.plus({days:i-(month.weekday-1)}));
  return <div className="ist-picker"><div className="ist-picker-label"><CalendarDays size={17}/><strong>{label}</strong><span>{selected?selected.toFormat('d LLL yyyy'):'No date'}{selected&&timeSpecified?` · ${selected.toFormat('h:mm a')}`:''}</span></div>
    <div className="ist-date-shortcuts" role="group" aria-label={mode==='conversation'?'Choose conversation date':'Choose due date'}>{allowNone&&<button type="button" className={!value?'selected':''} onClick={()=>onChange(null,false)}>No date</button>}{(mode==='conversation'?[['Today',0],['Yesterday',-1],['2 days ago',-2]]:[['Today',0],['Tomorrow',1],['In 2 days',2]]).map(([text,days])=>{const day=today().plus({days:Number(days)});return <button type="button" key={text} className={dateKey===day.toISODate()?'selected':''} onClick={()=>chooseDate(day)}>{text}</button>})}<button type="button" className={calendarOpen?'selected':''} onClick={()=>setCalendarOpen(!calendarOpen)} aria-expanded={calendarOpen}>Pick date</button></div>
    {calendarOpen&&<div className="ist-calendar"><div className="ist-calendar-head"><button type="button" onClick={()=>setMonth(month.minus({months:1}))} aria-label="Previous month"><ChevronLeft size={18}/></button><strong>{month.toFormat('LLLL yyyy')}</strong><button type="button" onClick={()=>setMonth(month.plus({months:1}))} aria-label="Next month" disabled={mode==='conversation'&&month>=today().startOf('month')}><ChevronRight size={18}/></button></div><div className="ist-calendar-grid">{['M','T','W','T','F','S','S'].map((name,index)=><span key={index} className="ist-calendar-weekday">{name}</span>)}{dates.map((day,index)=>day?<button type="button" key={day.toISODate()} className={`${dateKey===day.toISODate()?'selected':''} ${day.toISODate()===today().toISODate()?'today':''}`} onClick={()=>chooseDate(day)} disabled={mode==='conversation'&&day>today()} aria-label={day.toFormat('d LLLL yyyy')}>{day.day}</button>:<span key={`gap-${index}`}/>)}</div></div>}
    {value&&<div className="ist-time"><div className="ist-time-heading"><Clock3 size={16}/><strong>Time</strong><span>{mode==='conversation'?'When you spoke':'Optional'}</span></div><div className="ist-time-options" role="group" aria-label={mode==='conversation'?'Choose conversation time':'Choose due time'}>{mode==='due'&&<button type="button" className={!timeSpecified?'selected':''} onClick={()=>chooseTime(null)}>Any time</button>}{[['9:00 AM','09:00'],['2:00 PM','14:00'],['5:00 PM','17:00']].map(([text,clock])=><button type="button" key={clock} className={timeSpecified&&selectedTime===clock?'selected':''} onClick={()=>chooseTime(clock)}>{text}</button>)}<button type="button" className={customTime?'selected':''} onClick={()=>setCustomTime(!customTime)}>Custom</button></div>{customTime&&<div className="ist-custom-time"><label>Hour<select aria-label="Hour" value={selected?.hour??9} onChange={e=>chooseTime(`${e.target.value.padStart(2,'0')}:${String(selected?.minute??0).padStart(2,'0')}`,true)}>{Array.from({length:24},(_,i)=><option key={i} value={i}>{String(i).padStart(2,'0')}</option>)}</select></label><label>Minute<select aria-label="Minute" value={selected?.minute??0} onChange={e=>chooseTime(`${String(selected?.hour??9).padStart(2,'0')}:${e.target.value.padStart(2,'0')}`,true)}>{Array.from({length:60},(_,i)=>i).map(i=><option key={i} value={i}>{String(i).padStart(2,'0')}</option>)}</select></label></div>}</div>}
    {warning&&<small className="ist-picker-warning" role="alert">{warning}</small>}
    {value&&!timeSpecified&&mode==='due'&&<small className="ist-time-note">Date only. Set a time to enable a reminder.</small>}
  </div>;
}
