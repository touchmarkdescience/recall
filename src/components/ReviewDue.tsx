'use client';
import { useState } from 'react';
import { DateTime } from 'luxon';
import ReminderChips from './ReminderChips';
import IstDateTimePicker from './IstDateTimePicker';

export type ReviewDueValue={dueAt:string|null;timeSpecified?:boolean;timeChoices?:string[];reminderMinutes?:number};
const display=(value:string,timed=true)=>DateTime.fromISO(value).setZone('Asia/Kolkata').toFormat(timed?'ccc, d LLL · h:mm a':'ccc, d LLL');

export default function ReviewDue({value,onChange}:{value:ReviewDueValue;onChange:(value:ReviewDueValue)=>void}){
  const [editing,setEditing]=useState(false);
  const choices=value.timeChoices?.filter(choice=>DateTime.fromISO(choice).isValid)||[];
  const ambiguous=choices.length>1;
  const unset=value.timeSpecified===true&&!value.dueAt;
  const past=!!value.dueAt&&DateTime.fromISO(value.dueAt).setZone('Asia/Kolkata').toMillis()<(value.timeSpecified===false?DateTime.now().setZone('Asia/Kolkata').startOf('day').toMillis():Date.now());
  return <div className="review-due">
    {ambiguous?<div className="review-due-conflict" role="alert"><strong>Which time did you mean?</strong><p>Two times were spoken. Choose one before saving.</p><div className="review-due-choices">{choices.map(choice=><button type="button" key={choice} onClick={()=>{onChange({...value,dueAt:choice,timeSpecified:true,timeChoices:undefined});setEditing(false)}}>{display(choice)} IST</button>)}</div></div>:<div className="review-due-summary"><span className={unset?'ist-picker-warning':undefined}>{unset?'Not set — choose a time':value.dueAt?`${display(value.dueAt,value.timeSpecified!==false)}${value.timeSpecified===false?' · any time':' IST'}`:'No due date · no alert'}</span><button type="button" onClick={()=>setEditing(!editing)} aria-expanded={editing}>{editing?'Close':value.dueAt?'Edit':'Add date'}</button></div>}
    {editing&&<IstDateTimePicker value={value.dueAt} timeSpecified={value.timeSpecified!==false} onChange={(dueAt,timeSpecified)=>onChange({...value,dueAt,timeSpecified,timeChoices:undefined})}/>}
    <ReminderChips dueAt={value.dueAt} timed={value.timeSpecified!==false} minutes={value.reminderMinutes??0} onChange={reminderMinutes=>onChange({...value,reminderMinutes})}/>
    {past&&<small className="ist-picker-warning">This spoken date is already past. Review it before saving.</small>}
  </div>;
}
