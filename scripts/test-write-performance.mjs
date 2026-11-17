import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { WriteGuard, upsertRows } from '../src/lib/writeState.ts';

const db=new PGlite();
let checks=0;
const check=async(name,fn)=>{await fn();checks++;console.log(`PASS ${name}`)};
const scalar=async(sql,params=[])=>Object.values((await db.query(sql,params)).rows[0])[0];
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const due=new Date(Date.now()+86400000).toISOString();
const save=async(contactId=null,contactName='',title='Prepare fixture report')=>scalar('select public.recall_save_note_fast($1,$2,$3,$4,$5,now(),$6::jsonb)',[owner,contactId,contactName,'Fixture transcript','Fixture summary',JSON.stringify([{kind:'follow_up',title,dueAt:due,timeSpecified:true,reminderMinutes:30}])]);
const update=(id,patch,user=owner)=>scalar('select public.recall_update_action_fast($1,$2,$3::jsonb)',[user,id,JSON.stringify(patch)]);
try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 // PostgreSQL's gen_random_uuid is built in; PGlite does not need pgcrypto.
 await db.exec(readFileSync('supabase/schema.sql','utf8').replace('create extension if not exists pgcrypto;',''));
 const migration=readFileSync('supabase/write-performance-migration.sql','utf8');
 await db.exec(migration);await db.exec(migration);
 await db.query("insert into recall_users(id,email,name,password_hash) values($1,'fixture@example.invalid','Fixture','not-a-password'),($2,'other@example.invalid','Other','not-a-password')",[owner,other]);
 let saved;
 await check('save returns committed Guest rows and durable export events',async()=>{
  saved=await save();assert.equal(saved.contact,null);assert.equal(saved.contactId,null);
  assert.equal(saved.interaction.transcript,'Fixture transcript');assert.equal(saved.actions.length,1);
  assert.equal(saved.actions[0].reminder_minutes,30);assert.equal(saved.sheetSyncPending,2);
  assert.equal(Date.parse(saved.actions[0].due_at),Date.parse(due));
 });
 await check('new/existing contacts stay owned; foreign contacts cannot be saved',async()=>{
  const named=await save(null,'Fixture person');assert.equal(named.contact.name,'Fixture person');
  const same=await save(named.contactId);assert.equal(same.contactId,named.contactId);
  await assert.rejects(scalar('select public.recall_save_note_fast($1,$2,$3,$4,$5,now(),$6::jsonb)',[other,named.contactId,'','Other transcript','Other summary','[]']),/Contact not found/);
 });
 const id=saved.actions[0].id;
 await check('completion preserves reminder time; title-only edit preserves notification state',async()=>{
  await db.query('update recall_actions set notified_at=now() where id=$1',[id]);
  const before=await scalar('select notified_at from recall_actions where id=$1',[id]);
  const edited=await update(id,{status:'pending',title:'Edited fixture'});
  assert.equal(new Date(edited.action.notified_at).toISOString(),new Date(before).toISOString());
  const done=await update(id,{status:'done'});assert.equal(done.action.status,'done');
  assert.equal(done.action.reminder_minutes,30);assert.equal(Date.parse(done.action.due_at),Date.parse(due));assert.equal(done.action.notified_at,null);
  assert.equal(done.action.title,'Edited fixture');
 });
 await check('partial edits preserve concurrent fields; rescheduling resets notification state',async()=>{
  const nextDue=new Date(Date.now()+172800000).toISOString();
  await update(id,{status:'pending',title:'Preserve this title'});
  await db.query('update recall_actions set notified_at=now() where id=$1',[id]);
  const result=await update(id,{status:'pending',dueAt:nextDue,reminderMinutes:60});
  assert.equal(result.action.title,'Preserve this title');assert.equal(result.action.reminder_minutes,60);
  assert.equal(Date.parse(result.action.due_at),Date.parse(nextDue));assert.equal(result.action.notified_at,null);
 });
 await check('invalid values and cross-account mutations fail without changing the action',async()=>{
  const before=await scalar('select to_jsonb(a) from recall_actions a where id=$1',[id]);
  for(const patch of [{status:'invalid'},{status:'done',title:''},{status:'done',reminderMinutes:15},{status:'done',reminderMinutes:'30'},{status:'done',dueAt:'not a date'},{status:'done',dueAt:'infinity'},{status:'done',dueAt:'2000-01-01T12:00:00Z'}])await assert.rejects(update(id,patch));
  await assert.rejects(update(id,{status:'done'},other),/Action not found/);
  assert.deepEqual(await scalar('select to_jsonb(a) from recall_actions a where id=$1',[id]),before);
 });
 await check('export queue failure rolls back both the action update and new note',async()=>{
  await db.exec(`create function fixture_outbox_failure() returns trigger language plpgsql as $$ begin if new.payload_json->>'title'='Reject fixture outbox' then raise exception 'Fixture queue unavailable'; end if; return new; end $$;
    create trigger fixture_reject before insert on recall_sheet_outbox for each row execute function fixture_outbox_failure();`);
  const before=await scalar('select to_jsonb(a) from recall_actions a where id=$1',[id]);
  const count=await scalar('select count(*) from recall_interactions');
  await assert.rejects(update(id,{status:'done',title:'Reject fixture outbox'}),/Fixture queue unavailable/);
  assert.deepEqual(await scalar('select to_jsonb(a) from recall_actions a where id=$1',[id]),before);
  await assert.rejects(save(null,'','Reject fixture outbox'),/Fixture queue unavailable/);
  assert.equal(await scalar('select count(*) from recall_interactions'),count);
 });
 await check('fast functions are restricted to the server role',async()=>{
  for(const name of ['recall_update_action_fast(uuid,uuid,jsonb)','recall_save_note_fast(uuid,uuid,text,text,text,timestamp with time zone,jsonb)']){
   for(const role of ['anon','authenticated'])assert.equal(await scalar('select has_function_privilege($1,$2,\'EXECUTE\')',[role,name]),false);
   assert.equal(await scalar('select has_function_privilege(\'service_role\',$1,\'EXECUTE\')',[name]),true);
  }
 });
 await check('in-flight and stale refreshes cannot undo optimistic completion',()=>{
  const guard=new WriteGuard(),before=guard.read(),token=guard.begin('action-a');
  assert(token);assert.equal(guard.canApply(before),false);
  const during=guard.read();assert.equal(guard.canApply(during),false);
  assert.equal(guard.begin('action-a'),null);guard.finish(token);
  assert.equal(guard.canApply(before),false);assert.equal(guard.canApply(during),false);
  assert.equal(guard.canApply(guard.read()),true);assert.equal(guard.finish(token),false);
 });
 await check('parallel writes and account changes cannot cross-contaminate results',()=>{
  const guard=new WriteGuard(),a=guard.begin('a'),b=guard.begin('b');
  assert.equal(guard.pending,2);guard.finish(a);assert.equal(guard.pending,1);
  assert.equal(guard.canApply(guard.read()),false);guard.reset();
  assert.equal(guard.current(b),false);assert.equal(guard.finish(b),false);assert.equal(guard.pending,0);
 });
 await check('confirmed record merges retain unrelated actions and never duplicate saves',()=>{
  const rows=[{id:'a',status:'pending',title:'A'},{id:'b',status:'pending',title:'B'}];
  let next=upsertRows(rows,[{id:'a',status:'done',title:'A'}]);
  assert.equal(next.find(r=>r.id==='b').status,'pending');
  next=upsertRows(next,[{id:'c',status:'pending',title:'C'}]);
  next=upsertRows(next,[{id:'c',status:'done',title:'C'}]);
  assert.equal(next.length,3);assert.equal(next.find(r=>r.id==='c').status,'done');
 });
 await check('the production SQL verification rolls back its disposable records',async()=>{
  const count=await scalar('select count(*) from recall_users');
  await db.exec(readFileSync('supabase/write-performance-check.sql','utf8'));
  assert.equal(await scalar('select count(*) from recall_users'),count);
 });
 console.log(`${checks} write consistency checks passed using in-memory PostgreSQL; no production data accessed.`);
}finally{await db.close()}
