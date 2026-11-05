'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { DateTime } from 'luxon';
import { Archive, ArrowRight, Bell, CalendarDays, Check, Clock3, MoreHorizontal } from 'lucide-react';
import ActionSheet from './ActionSheet';

export type BoardAction={id:string;kind:'follow_up'|'reminder'|'meeting';title:string;dueAt:string|null;timeSpecified?:number;status:string;createdAt:string;durationMinutes?:number;conversationSummary?:string|null};
export type ActionPatch={status:string;title?:string;kind?:BoardAction['kind'];dueAt?:string|null;timeSpecified?:boolean};
type Props={actions:BoardAction[];personName:string;onUpdate:(id:string,patch:ActionPatch)=>Promise<boolean>};
type Tab='action'|'followup'|'done'|'archived';
type SheetMode='details'|'edit'|'reschedule';
const zone='Asia/Kolkata';
const tabs:[Tab,string][]=[['action','Action to take'],['followup','Follow-ups'],['done','Done']];
const dateGroups=['Overdue','Today','Tomorrow','Later','No date'] as const;
const format=(iso:string|null,timed=true)=>iso?DateTime.fromISO(iso).setZone(zone).toFormat(timed?'d LLL · h:mm a':'d LLL · Any time')+(timed?' IST':''):'No date';
function dateGroup(action:BoardAction){if(!action.dueAt)return 'No date';const date=DateTime.fromISO(action.dueAt).setZone(zone).startOf('day'),now=DateTime.now().setZone(zone).startOf('day');if(date<now)return 'Overdue';if(date.equals(now))return 'Today';if(date.equals(now.plus({days:1})))return 'Tomorrow';return 'Later'}
function belongs(action:BoardAction,tab:Tab){return tab==='archived'?action.status==='archived':tab==='done'?action.status==='done':tab==='followup'?action.status==='pending'&&action.kind==='follow_up':action.status==='pending'&&action.kind!=='follow_up'}
function reverse(action:BoardAction,patch:ActionPatch):ActionPatch{const old:ActionPatch={status:action.status};if(patch.title!==undefined)old.title=action.title;if(patch.kind!==undefined)old.kind=action.kind;if(patch.dueAt!==undefined)old.dueAt=action.dueAt;if(patch.timeSpecified!==undefined)old.timeSpecified=action.timeSpecified!==0;return old}

export default function ContactKanban({actions,personName,onUpdate}:Props){
  const [tab,setTab]=useState<Tab>('action'),[opened,setOpened]=useState<{action:BoardAction;mode:SheetMode}|null>(null),[menu,setMenu]=useState(''),[revealed,setRevealed]=useState('');
  const [drag,setDrag]=useState<{id:string;x:number}|null>(null),[expandedDone,setExpandedDone]=useState(''),[showAllDone,setShowAllDone]=useState(false);
  const [optimistic,setOptimistic]=useState<Record<string,Partial<BoardAction>>>({}),[toast,setToast]=useState<{message:string;undo:()=>void}|null>(null);
  const gesture=useRef<{id:string;x:number;y:number;horizontal:boolean}|null>(null),suppressClick=useRef(false),opener=useRef<HTMLElement|null>(null);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(null),5000);return()=>clearTimeout(timer)},[toast]);
  const visible=actions.map(action=>({...action,...optimistic[action.id]}));
  const selected=visible.filter(action=>belongs(action,tab)).sort((a,b)=>a.dueAt&&b.dueAt?DateTime.fromISO(a.dueAt).toMillis()-DateTime.fromISO(b.dueAt).toMillis():a.dueAt?-1:b.dueAt?1:b.createdAt.localeCompare(a.createdAt));
  const donePreview=new Set(tab==='done'&&!showAllDone?selected.slice(0,5).map(action=>action.id):selected.map(action=>action.id));
  const grouped=dateGroups.map(name=>({name,items:selected.filter(action=>dateGroup(action)===name&&(tab!=='done'||donePreview.has(action.id)))})).filter(group=>group.items.length);
  const counts={action:visible.filter(a=>belongs(a,'action')).length,followup:visible.filter(a=>belongs(a,'followup')).length,done:visible.filter(a=>belongs(a,'done')).length,archived:visible.filter(a=>belongs(a,'archived')).length};
  function open(action:BoardAction,mode:SheetMode='details',trigger?:HTMLElement){opener.current=trigger||document.activeElement as HTMLElement;setMenu('');setRevealed('');setOpened({action,mode})}
  function close(){setOpened(null);requestAnimationFrame(()=>opener.current?.focus())}
  async function update(action:BoardAction,patch:ActionPatch,message:string,undoable=true){
    setMenu('');setRevealed('');
    setOptimistic(previous=>({...previous,[action.id]:{...previous[action.id],...patch,timeSpecified:patch.timeSpecified===undefined?action.timeSpecified:patch.timeSpecified?1:0}}));
    const ok=await onUpdate(action.id,patch);
    setOptimistic(previous=>{const next={...previous};delete next[action.id];return next});
    if(!ok)return false;
    if(undoable)setToast({message,undo:()=>{setToast(null);void update({...action,...patch,timeSpecified:patch.timeSpecified===undefined?action.timeSpecified:patch.timeSpecified?1:0},reverse(action,patch),'',false)}});
    return true;
  }
  function pointerDown(event:PointerEvent<HTMLElement>,action:BoardAction){if((event.target as Element).closest('button'))return;const x=event.clientX;if(x<24||x>window.innerWidth-24)return;gesture.current={id:action.id,x,y:event.clientY,horizontal:false}}
  function pointerMove(event:PointerEvent<HTMLElement>){const start=gesture.current;if(!start)return;const x=event.clientX-start.x,y=event.clientY-start.y;if(!start.horizontal&&Math.abs(x)>12&&Math.abs(x)>Math.abs(y)*1.3){start.horizontal=true;event.currentTarget.setPointerCapture(event.pointerId)}if(start.horizontal)setDrag({id:start.id,x:Math.max(-112,Math.min(100,x))})}
  function pointerUp(action:BoardAction){const offset=drag?.id===action.id?drag.x:0;if(Math.abs(offset)>15)suppressClick.current=true;if(offset>85&&action.status==='pending')void update(action,{status:'done'},'Completed');else if(offset< -75)setRevealed(action.id);else setRevealed('');gesture.current=null;setDrag(null);setTimeout(()=>{suppressClick.current=false},0)}
  function card(action:BoardAction){const isDone=tab==='done',expanded=expandedDone===action.id,offset=drag?.id===action.id?drag.x:revealed===action.id?-112:0;
    return <div className={`action-swipe-row ${isDone?'done-stack-row':''} ${expanded?'expanded':''} ${menu===action.id?'menu-open':''}`} key={action.id}>
      {action.status==='pending'&&<div className="action-swipe-back"><button className="swipe-complete" onClick={()=>void update(action,{status:'done'},'Completed')}><Check size={18}/> Complete</button><div className="swipe-left"><button onClick={event=>open(action,'reschedule',event.currentTarget)}>Reschedule</button><button onClick={()=>void update(action,{status:'archived'},'Archived')}>Archive</button></div></div>}
      <article className={`action-list-card ${action.kind} ${isDone?'is-done':''}`} tabIndex={0} aria-label={`${action.title}. ${isDone?'Expand completed action':'View action details'}`} style={{transform:`translateX(${offset}px)`}} onPointerDown={event=>pointerDown(event,action)} onPointerMove={pointerMove} onPointerUp={()=>pointerUp(action)} onPointerCancel={()=>{gesture.current=null;setDrag(null)}} onKeyDown={event=>{if(event.target!==event.currentTarget||!['Enter',' '].includes(event.key))return;event.preventDefault();if(isDone)setExpandedDone(expanded?'':action.id);else open(action,'details',event.currentTarget)}} onClick={event=>{if(suppressClick.current)return;if(isDone){setExpandedDone(expanded?'':action.id);return}open(action,'details',event.currentTarget)}}>
        <span className="action-list-icon">{action.kind==='meeting'?<CalendarDays size={20}/>:action.kind==='reminder'?<Bell size={20}/>:<ArrowRight size={20}/>}</span>
        <span className="action-list-copy"><span className="action-list-kind">{action.kind==='follow_up'?'Follow-up':action.kind==='meeting'?'Meeting':'Reminder'}</span><strong>{action.title}</strong><small><Clock3 size={13}/>{format(action.dueAt,action.timeSpecified!==0)}{action.kind==='meeting'&&action.durationMinutes?` · ${action.durationMinutes} min`:''}</small>{isDone&&expanded&&<button className="done-view" onClick={event=>{event.stopPropagation();open(action,'details',event.currentTarget)}}>View details</button>}</span>
        <button className="action-more" aria-label={`More options for ${action.title}`} aria-expanded={menu===action.id} onClick={event=>{event.stopPropagation();setMenu(menu===action.id?'':action.id);setRevealed('')}}><MoreHorizontal size={22}/></button>
        {menu===action.id&&<div className="action-menu" onClick={event=>event.stopPropagation()}><button onClick={event=>open(action,'details',event.currentTarget)}>View details</button><button onClick={event=>open(action,'edit',event.currentTarget)}>Edit</button>{action.status==='pending'?<><button onClick={()=>void update(action,{status:'done'},'Completed')}>Complete</button><button onClick={event=>open(action,'reschedule',event.currentTarget)}>Reschedule</button><button onClick={()=>void update(action,{status:'archived'},'Archived')}>Archive</button></>:<button onClick={()=>void update(action,{status:'pending'},'Reopened')}>Reopen</button>}{action.status==='done'&&<button onClick={()=>void update(action,{status:'archived'},'Archived')}>Archive</button>}</div>}
      </article>
    </div>}
  return <section className="contact-board-section action-board"><div className="contact-board-heading"><div><span className="sales-overline">COMMITMENTS AT A GLANCE</span><h2>Action board</h2></div><span>{counts.done} completed · {counts.action+counts.followup} open</span></div>
    <div className="action-tabs" role="tablist" aria-label="Action board">{tabs.map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} className={tab===id?'selected':''} onClick={()=>{setTab(id);setMenu('');setRevealed('')}}>{label}<b>{counts[id]}</b></button>)}</div>
    {counts.archived>0&&<button className="action-archive-link" onClick={()=>setTab(tab==='archived'?'action':'archived')} aria-pressed={tab==='archived'}><Archive size={15}/> {tab==='archived'?'Back to actions':`Archived · ${counts.archived}`}</button>}
    {grouped.length?<div className="action-date-groups">{grouped.map(group=><section key={group.name} className="action-date-group"><h3>{group.name}<span>{group.items.length}</span></h3><div className={tab==='done'?'done-stack':'action-list'}>{group.items.map(card)}</div></section>)}{tab==='done'&&selected.length>5&&!showAllDone&&<button className="show-all-done" onClick={()=>setShowAllDone(true)}>Show all {selected.length}</button>}</div>:<div className="board-empty action-empty">Nothing here yet.</div>}
    {toast&&<div className="action-undo-toast" role="status"><span>{toast.message}</span><button onClick={toast.undo}>Undo</button></div>}
    {opened&&<ActionSheet action={{...opened.action,conversationSummary:visible.find(action=>action.id===opened.action.id)?.conversationSummary??opened.action.conversationSummary}} personName={personName} mode={opened.mode} onMode={mode=>setOpened({...opened,mode})} onClose={close} onSave={(action,patch)=>update(action,patch,'Saved')} onStatus={(action,status)=>update(action,{status},status==='done'?'Completed':status==='archived'?'Archived':'Reopened')}/>}
  </section>;
}
