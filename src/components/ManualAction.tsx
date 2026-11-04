'use client';
import { useState } from 'react';
import { ArrowLeft, Check, CalendarDays, Bell, PhoneCall } from 'lucide-react';
import IstDateTimePicker from './IstDateTimePicker';

type Contact={id:string;name:string};
export type ManualEntry={contactId:string;contactName:string;kind:'follow_up'|'reminder'|'meeting';title:string;dueAt:string|null;timeSpecified:boolean;durationMinutes:number;notes:string};
type Props={contacts:Contact[];initialContactId?:string;onCancel:()=>void;onSave:(entry:ManualEntry)=>Promise<void>};

export default function ManualAction({contacts,initialContactId='',onCancel,onSave}:Props){
  const [contactId,setContactId]=useState(initialContactId);
  const [contactName,setContactName]=useState('');
  const [kind,setKind]=useState<ManualEntry['kind']>('follow_up');
  const [title,setTitle]=useState('');
  const [when,setWhen]=useState<string|null>(null);
  const [timeSpecified,setTimeSpecified]=useState(false);
  const [durationMinutes,setDurationMinutes]=useState(30);
  const [notes,setNotes]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function submit(event:React.FormEvent){
    event.preventDefault();setError('');setBusy(true);
    try{await onSave({contactId,contactName:contactName.trim(),kind,title:title.trim(),dueAt:when,timeSpecified,durationMinutes,notes:notes.trim()})}
    catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  }
  return <div className="manual-page"><button className="sales-back" onClick={onCancel}><ArrowLeft size={17}/> Back</button><div className="manual-heading"><span className="sales-overline">QUICK MANUAL ENTRY</span><h1>Add an action.</h1><p>Record a follow-up, callback, meeting, or reminder without using your microphone.</p></div><form className="manual-card" onSubmit={submit}><div className="manual-form-section"><span className="manual-step">01 · WHO</span><label>Person<select value={contactId} onChange={e=>setContactId(e.target.value)}><option value="">No person / add a name</option>{contacts.map(contact=><option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>{!contactId&&<label>Person’s name (optional)<input value={contactName} onChange={e=>setContactName(e.target.value)} placeholder="e.g. Priya Kumar" maxLength={120}/></label>}</div><div className="manual-form-section"><span className="manual-step">02 · WHAT</span><div className="manual-kind-picker"><button type="button" className={kind==='follow_up'?'active':''} onClick={()=>setKind('follow_up')}><PhoneCall size={17}/> Follow-up / callback</button><button type="button" className={kind==='reminder'?'active':''} onClick={()=>setKind('reminder')}><Bell size={17}/> Reminder</button><button type="button" className={kind==='meeting'?'active':''} onClick={()=>setKind('meeting')}><CalendarDays size={17}/> Meeting</button></div><label>Action<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Call Priya about the revised quote" maxLength={500} minLength={3} required/></label><label>Context (optional)<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="What was agreed, or what should you remember?"/></label></div><div className="manual-form-section"><span className="manual-step">03 · WHEN</span><IstDateTimePicker value={when} timeSpecified={timeSpecified} onChange={(date,timed)=>{setWhen(date);setTimeSpecified(timed)}}/>{kind==='meeting'&&<label>Meeting length<select value={durationMinutes} onChange={e=>setDurationMinutes(Number(e.target.value))}><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={90}>1.5 hours</option><option value={120}>2 hours</option><option value={180}>3 hours</option></select></label>}<small>Choose No date to keep this action on your list without a reminder.</small></div>{error&&<div className="error" role="alert">{error}</div>}<div className="manual-footer"><span>Review the details, then save.</span><button type="submit" disabled={busy||!title.trim()}>{busy?'Saving…':'Save action'}<Check size={17}/></button></div></form></div>;
}
