-- Run after daily-summary-migration.sql in Supabase SQL Editor.
-- Creates only disposable fixtures; every change is rolled back.
BEGIN;
DO $$
DECLARE
 v_user uuid:=gen_random_uuid();
 v_now timestamptz:=((current_timestamp AT TIME ZONE 'Asia/Kolkata')::date+time '07:00') AT TIME ZONE 'Asia/Kolkata';
 v_day date:=(current_timestamp AT TIME ZONE 'Asia/Kolkata')::date;
 v_run record;
 v_count integer;
BEGIN
 INSERT INTO public.recall_users(id,email,name,password_hash) VALUES(v_user,v_user::text||'@example.invalid','Disposable summary check','not-a-real-password');
 INSERT INTO public.recall_user_settings(user_id,daily_summary_time) VALUES(v_user,'07:00');
 INSERT INTO public.recall_push_subscriptions(user_id,endpoint,subscription_json) VALUES(v_user,'https://example.invalid/'||v_user::text,'{}'::jsonb);
 INSERT INTO public.recall_actions(user_id,kind,title,due_at,time_specified) VALUES
  (v_user,'follow_up','Disposable date-only task',v_now+interval '2 hours',0),
  (v_user,'follow_up','Disposable timed task',v_now+interval '4 hours',1),
  (v_user,'meeting','Disposable meeting',v_now+interval '4 hours',1);
 -- Temporarily isolate fixture eligibility; this entire transaction rolls back.
 UPDATE public.recall_user_settings SET daily_summary_enabled=false WHERE user_id<>v_user;
 -- Prevent claims for any existing account that has no settings row.
 INSERT INTO public.recall_user_settings(user_id,daily_summary_enabled)
 SELECT id,false FROM public.recall_users WHERE id<>v_user ON CONFLICT(user_id) DO NOTHING;
 SELECT count(*) INTO v_count FROM public.recall_claim_daily_summaries(v_now-interval '1 minute',100);
 IF v_count<>0 THEN RAISE EXCEPTION 'Summary ran before its IST schedule'; END IF;
 SELECT * INTO v_run FROM public.recall_claim_daily_summaries(v_now,100) WHERE user_id=v_user;
 IF v_run.user_id IS NULL OR v_run.today_count<>1 OR v_run.overdue_count<>0 OR v_run.undated_count<>0 THEN RAISE EXCEPTION 'Summary task counts failed'; END IF;
 SELECT count(*) INTO v_count FROM public.recall_claim_daily_summaries(v_now+interval '1 minute',100);
 IF v_count<>0 THEN RAISE EXCEPTION 'Concurrent claim protection failed'; END IF;
 IF NOT public.recall_finish_daily_summary(v_user,v_day,v_run.claim_token,true) THEN RAISE EXCEPTION 'Claim completion failed'; END IF;
 SELECT count(*) INTO v_count FROM public.recall_claim_daily_summaries(v_now+interval '1 hour',100);
 IF v_count<>0 THEN RAISE EXCEPTION 'Summary repeated on the same day'; END IF;
 IF has_function_privilege('anon','public.recall_claim_daily_summaries(timestamptz,integer)','execute')
 OR has_function_privilege('authenticated','public.recall_finish_daily_summary(uuid,date,uuid,boolean)','execute') THEN RAISE EXCEPTION 'Summary functions are not restricted'; END IF;
END $$;
ROLLBACK;
