"use client";
import { DateTime } from 'luxon';
import { reminderAt, reminderOptions } from '../lib/reminders';
export default function ReminderChips({dueAt,timed,minutes=0,onChange}:{dueAt:string|null;timed:boolean;minutes?:number;onChange?:(minutes:number)=>void}){
  const alert=reminderAt(dueAt,timed,minutes);
  return <div className="ist-picker"><span className="field-help">Remind me</span>{onChange&&<div className="ist-time-options" role="group" aria-label="Reminder offset">{reminderOptions.map((value,i)=><button type="button" key={value} disabled={!alert} aria-pressed={minutes===value} className={minutes===value?'selected':''} onClick={()=>onChange(value)}>{['At time','10 min','30 min','1 hour','1 day before'][i]}</button>)}</div>}<p className="field-help">{alert?`You'll be reminded at ${DateTime.fromISO(alert).setZone('Asia/Kolkata').toFormat('h:mm a · d LLL')} IST`:'Set a date and time to enable reminders.'}</p>{alert&&Date.parse(alert)<Date.now()&&<p className="ist-picker-warning" role="alert">That reminder time has passed. Choose another time or offset.</p>}</div>;
}
