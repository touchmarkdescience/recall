-- Run before deploying daily summaries. Rerunnable; does not change action times.
BEGIN;
ALTER TABLE public.recall_user_settings ADD COLUMN IF NOT EXISTS daily_summary_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.recall_user_settings ADD COLUMN IF NOT EXISTS daily_summary_time text NOT NULL DEFAULT '07:00';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='recall_daily_summary_clock' AND conrelid='public.recall_user_settings'::regclass) THEN
  ALTER TABLE public.recall_user_settings ADD CONSTRAINT recall_daily_summary_clock CHECK (daily_summary_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.recall_daily_summary_runs (
 user_id uuid NOT NULL REFERENCES public.recall_users(id) ON DELETE CASCADE,
 summary_date date NOT NULL,
 status text NOT NULL CHECK (status IN ('processing','sent','retry')),
 claim_token uuid NOT NULL,
 lease_until timestamptz NOT NULL,
 sent_at timestamptz,
 PRIMARY KEY(user_id,summary_date)
);
ALTER TABLE public.recall_daily_summary_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recall_daily_summary_runs FROM public,anon,authenticated;
GRANT ALL ON public.recall_daily_summary_runs TO service_role;
CREATE OR REPLACE FUNCTION public.recall_claim_daily_summaries(p_now timestamptz DEFAULT now(),p_limit integer DEFAULT 50)
RETURNS TABLE(user_id uuid,summary_date date,claim_token uuid,today_count integer,overdue_count integer,undated_count integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
 v_day date := (p_now AT TIME ZONE 'Asia/Kolkata')::date;
 v_clock text := to_char(p_now AT TIME ZONE 'Asia/Kolkata','HH24:MI');
 v record;
 v_token uuid;
BEGIN
 IF p_limit<1 OR p_limit>100 OR NOT isfinite(p_now) THEN RAISE EXCEPTION 'Invalid summary batch'; END IF;
 FOR v IN
  SELECT u.id AS account_id,
    count(a.id) FILTER (WHERE (a.due_at AT TIME ZONE 'Asia/Kolkata')::date=v_day)::integer AS today_n,
    count(a.id) FILTER (WHERE (a.due_at AT TIME ZONE 'Asia/Kolkata')::date<v_day)::integer AS overdue_n,
    count(a.id) FILTER (WHERE a.id IS NOT NULL AND a.due_at IS NULL)::integer AS undated_n
  FROM public.recall_users u
  LEFT JOIN public.recall_user_settings s ON s.user_id=u.id
  LEFT JOIN public.recall_actions a ON a.user_id=u.id AND a.status='pending' AND a.kind='follow_up'
    AND (a.time_specified=0 OR a.due_at IS NULL)
    AND (a.due_at IS NULL OR (a.due_at AT TIME ZONE 'Asia/Kolkata')::date<=v_day)
  WHERE coalesce(s.push_enabled,true) AND coalesce(s.daily_summary_enabled,true)
    AND coalesce(s.daily_summary_time,'07:00')<=v_clock
    AND EXISTS (SELECT 1 FROM public.recall_push_subscriptions ps WHERE ps.user_id=u.id)
    AND NOT EXISTS (SELECT 1 FROM public.recall_daily_summary_runs r WHERE r.user_id=u.id AND r.summary_date=v_day AND (r.status='sent' OR r.lease_until>p_now))
  GROUP BY u.id ORDER BY u.id LIMIT p_limit
 LOOP
  v_token:=NULL;
  INSERT INTO public.recall_daily_summary_runs AS r(user_id,summary_date,status,claim_token,lease_until,sent_at)
  VALUES(v.account_id,v_day,CASE WHEN v.today_n+v.overdue_n+v.undated_n=0 THEN 'sent' ELSE 'processing' END,gen_random_uuid(),p_now+interval '5 minutes',CASE WHEN v.today_n+v.overdue_n+v.undated_n=0 THEN p_now END)
  ON CONFLICT ON CONSTRAINT recall_daily_summary_runs_pkey DO UPDATE
   SET status=excluded.status,claim_token=excluded.claim_token,lease_until=excluded.lease_until,sent_at=excluded.sent_at
   WHERE r.status<>'sent' AND r.lease_until<=p_now
  RETURNING r.claim_token INTO v_token;
  IF v_token IS NOT NULL AND v.today_n+v.overdue_n+v.undated_n>0 THEN
   user_id:=v.account_id;summary_date:=v_day;claim_token:=v_token;
   today_count:=v.today_n;overdue_count:=v.overdue_n;undated_count:=v.undated_n;
   RETURN NEXT;
  END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.recall_finish_daily_summary(p_user_id uuid,p_summary_date date,p_claim_token uuid,p_delivered boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_changed integer;
BEGIN
 UPDATE public.recall_daily_summary_runs SET status=CASE WHEN p_delivered THEN 'sent' ELSE 'retry' END,
   sent_at=CASE WHEN p_delivered THEN now() END,lease_until=now()+interval '5 minutes'
 WHERE user_id=p_user_id AND summary_date=p_summary_date AND claim_token=p_claim_token AND status='processing';
 GET DIAGNOSTICS v_changed=ROW_COUNT;
 RETURN v_changed=1;
END $$;
REVOKE ALL ON FUNCTION public.recall_claim_daily_summaries(timestamptz,integer) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.recall_finish_daily_summary(uuid,date,uuid,boolean) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recall_claim_daily_summaries(timestamptz,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.recall_finish_daily_summary(uuid,date,uuid,boolean) TO service_role;
CREATE INDEX IF NOT EXISTS recall_actions_daily_summary ON public.recall_actions(user_id,due_at) WHERE status='pending' AND kind='follow_up' AND time_specified=0;
COMMIT;
