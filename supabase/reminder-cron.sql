-- Apply only after enabling pg_cron and pg_net in this Supabase project and
-- creating a Vault secret named recall_cron_secret with the same value as
-- Vercel's CRON_SECRET. This file does not contain the secret itself.

create or replace function public.recall_request_reminder_dispatch()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'recall_cron_secret';

  if v_secret is null or length(v_secret) < 16 then
    raise exception 'Recall cron secret is missing from Vault';
  end if;

  select net.http_get(
    url := 'https://recall-six-azure.vercel.app/api/cron/dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 30000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function public.recall_request_reminder_dispatch() from public, anon, authenticated;

-- A named job is replaced when this file is run again.
select cron.schedule(
  'recall-dispatch-every-five-minutes',
  '*/5 * * * *',
  'select public.recall_request_reminder_dispatch();'
);
