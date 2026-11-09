-- New independent counters only. No existing user/contact/action table changes.
-- Apply in Recall's Supabase SQL editor before ABUSE_PROTECTION_ENABLED=true.
begin;
create table if not exists public.recall_abuse_buckets (
  key text primary key,
  count integer not null check (count >= 0),
  expires_at timestamptz not null
);
create index if not exists recall_abuse_expiry on public.recall_abuse_buckets(expires_at);
alter table public.recall_abuse_buckets enable row level security;
revoke all on public.recall_abuse_buckets from public, anon, authenticated;
grant select, insert, update, delete on public.recall_abuse_buckets to service_role;

create or replace function public.recall_reserve_budget(p_rules jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb;
  n integer;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if pg_catalog.jsonb_typeof(p_rules) <> 'array' or pg_catalog.jsonb_array_length(p_rules) < 1 or pg_catalog.jsonb_array_length(p_rules) > 8 then
    raise exception 'Invalid budget rules';
  end if;
  if (select count(*) <> count(distinct value->>'key') from pg_catalog.jsonb_array_elements(p_rules)) then
    raise exception 'Duplicate budget rules';
  end if;
  -- Consistent lock ordering: check every bucket, then reserve all or none.
  for r in select value from pg_catalog.jsonb_array_elements(p_rules) order by value->>'key' loop
    if not (r->>'key' ~ '^[a-z0-9:_-]{1,180}$') or (r->>'limit')::integer not between 1 and 100000
      or (r->>'resetAt')::timestamptz < v_now - interval '1 minute'
      or (r->>'resetAt')::timestamptz > v_now + interval '2 days' then
      raise exception 'Invalid budget rule';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(r->>'key', 0));
  end loop;
  for r in select value from pg_catalog.jsonb_array_elements(p_rules) loop
    select b.count into n from public.recall_abuse_buckets b where b.key = r->>'key';
    if coalesce(n, 0) >= (r->>'limit')::integer then
      return pg_catalog.jsonb_build_object('allowed', false, 'retryAfter', greatest(1, ceil(extract(epoch from ((r->>'resetAt')::timestamptz - v_now)))::integer));
    end if;
  end loop;
  for r in select value from pg_catalog.jsonb_array_elements(p_rules) loop
    insert into public.recall_abuse_buckets as buckets(key,count,expires_at) values(r->>'key',1,(r->>'resetAt')::timestamptz)
    on conflict (key) do update set count = buckets.count + 1;
  end loop;
  delete from public.recall_abuse_buckets where key in
    (select key from public.recall_abuse_buckets where expires_at < v_now - interval '1 day' limit 1000 for update skip locked);
  return pg_catalog.jsonb_build_object('allowed', true, 'retryAfter', 0);
end;
$$;
revoke all on function public.recall_reserve_budget(jsonb) from public, anon, authenticated;
grant execute on function public.recall_reserve_budget(jsonb) to service_role;
commit;
