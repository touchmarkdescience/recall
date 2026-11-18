import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {dailySummaryMessage,validSummaryTime} from '../src/lib/dailySummary.ts';
const db=new PGlite();
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002',c='10000000-0000-4000-8000-000000000003',empty='10000000-0000-4000-8000-000000000004';
const claim=async at=>(await db.query('select * from recall_claim_daily_summaries($1)',[at])).rows;
const finish=async(row,delivered=true)=>(await db.query('select recall_finish_daily_summary($1,$2,$3,$4) as ok',[row.user_id,row.summary_date,row.claim_token,delivered])).rows[0].ok;
try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 await db.exec(readFileSync('supabase/schema.sql','utf8').replace('create extension if not exists pgcrypto;',''));
 const migration=readFileSync('supabase/daily-summary-migration.sql','utf8');await db.exec(migration);await db.exec(migration);
 for(const [id,name] of [[a,'a'],[b,'b'],[c,'c'],[empty,'empty']]){
  await db.query('insert into recall_users(id,email,name,password_hash) values($1,$2,$2,$3)',[id,name+'@example.invalid','fixture']);
  await db.query('insert into recall_user_settings(user_id) values($1)',[id]);
  await db.query('insert into recall_push_subscriptions(user_id,endpoint,subscription_json) values($1,$2,$3)',[id,'https://example.invalid/'+name,'{}']);
 }
 await db.query("update recall_user_settings set daily_summary_time='08:15' where user_id=$1",[b]);
 await db.query('update recall_user_settings set daily_summary_enabled=false where user_id=$1',[c]);
 const insert=async(user,due,timed=0,kind='follow_up',status='pending')=>db.query('insert into recall_actions(user_id,title,due_at,time_specified,kind,status) values($1,$2,$3,$4,$5,$6)',[user,'Fixture task',due,timed,kind,status]);
 await insert(a,'2026-11-19T03:30Z');await insert(a,'2026-11-18T03:30Z');await insert(a,null);
 await insert(a,'2026-11-20T03:30Z');await insert(a,'2026-11-19T05:30Z',1);await insert(a,'2026-11-19T05:30Z',0,'meeting');await insert(a,'2026-11-19T03:30Z',0,'follow_up','done');
 await insert(b,'2026-11-19T03:30Z');await insert(c,'2026-11-19T03:30Z');
 assert.equal((await claim('2026-11-19T01:29Z')).length,0);
 let rows=await claim('2026-11-19T01:30Z');assert.equal(rows.length,1);const row=rows[0];
 assert.equal(row.user_id,a);assert.equal(row.today_count,1);assert.equal(row.overdue_count,1);assert.equal(row.undated_count,1);
 assert.equal((await claim('2026-11-19T01:31Z')).length,0);
 assert.equal(await finish({...row,claim_token:b}),false);assert.equal(await finish(row),true);
 assert.equal((await claim('2026-11-19T02:44Z')).length,0);
 rows=await claim('2026-11-19T02:45Z');assert.equal(rows.length,1);assert.equal(rows[0].user_id,b);const failed=rows[0];await finish(failed,false);
 await db.query("update recall_daily_summary_runs set lease_until='2026-11-19T02:50Z' where user_id=$1",[b]);
 assert.equal((await claim('2026-11-19T02:49Z')).length,0);
 rows=await claim('2026-11-19T02:50Z');assert.equal(rows.length,1);assert.notEqual(rows[0].claim_token,failed.claim_token);assert.equal(await finish(failed),false);await finish(rows[0]);
 await insert(empty,'2026-11-19T05:30Z');assert.equal((await claim('2026-11-19T03:00Z')).length,0);
 assert.equal((await claim('2026-11-20T01:30Z')).some(row=>row.user_id===a),true);
 await db.query('update recall_user_settings set push_enabled=false where user_id=$1',[b]);assert.equal((await claim('2026-11-20T02:45Z')).some(row=>row.user_id===b),false);
 console.log('PASS IST default/custom timing, date-only counts, account isolation, opted-out and empty lists, retry leases and once-per-day delivery');
 for(const role of ['anon','authenticated']){
  const grants=(await db.query("select has_function_privilege($1,'recall_claim_daily_summaries(timestamptz,integer)','execute') as claim,has_function_privilege($1,'recall_finish_daily_summary(uuid,date,uuid,boolean)','execute') as finish,has_table_privilege($1,'recall_daily_summary_runs','select') as read",[role])).rows[0];assert.deepEqual(grants,{claim:false,finish:false,read:false});
 }
 assert.equal((await db.query("select has_function_privilege('service_role','recall_claim_daily_summaries(timestamptz,integer)','execute') as ok")).rows[0].ok,true);
 await assert.rejects(db.query("update recall_user_settings set daily_summary_time='25:00' where user_id=$1",[a]));
 assert(validSummaryTime('07:00'));assert(validSummaryTime('23:59'));assert(!validSummaryTime('24:00'));assert(!validSummaryTime('7:00'));
 assert.equal(dailySummaryMessage({today_count:2,overdue_count:1,undated_count:0}).body,'2 today · 1 overdue. Open Recall to plan your day.');
 console.log('PASS rerunnable migration, server-only privileges, valid clock settings and consolidated message');
 // The existing write path must preserve date-only and undated follow-ups.
 await db.exec(readFileSync('supabase/write-performance-migration.sql','utf8'));
 const save=async actions=>(await db.query('select recall_save_note_fast($1,null,$2,$3,$4,now(),$5::jsonb) as saved',[a,'Richard','Fixture','Fixture',JSON.stringify(actions)])).rows[0].saved;
 const saved=await save([{kind:'follow_up',title:'Discuss property next Friday',dueAt:'2026-11-27T03:30:00Z',timeSpecified:false},{kind:'follow_up',title:'Discuss tool',dueAt:null,timeSpecified:false}]);
 assert.equal(saved.actions.find(action=>action.title==='Discuss property next Friday').time_specified,0);assert.equal(saved.actions.find(action=>action.title==='Discuss tool').due_at,null);
 assert.equal((await db.query('select notified_at from recall_actions where id=$1',[saved.actions[0].id])).rows[0].notified_at,null);
 console.log('PASS real PostgreSQL save accepts follow-ups without clock times and retains individual reminder state');
 await db.exec(readFileSync('supabase/daily-summary-check.sql','utf8'));
 console.log('PASS deploy-time SQL verification completes and rolls back disposable data');
}finally{await db.close()}
