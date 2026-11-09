-- Run after the migration in Recall's Supabase SQL editor.
-- Exercises an isolated counter twice, verifies role grants, then rolls back.
-- No account, contact, conversation or action records are read or changed.
begin;
do $verification$
declare
  probe_key text := 'verification:' || pg_catalog.md5(pg_catalog.clock_timestamp()::text);
  rules jsonb;
  first_result jsonb;
  second_result jsonb;
begin
  if not pg_catalog.has_function_privilege('service_role','public.recall_reserve_budget(jsonb)','execute')
    or pg_catalog.has_function_privilege('anon','public.recall_reserve_budget(jsonb)','execute')
    or pg_catalog.has_function_privilege('authenticated','public.recall_reserve_budget(jsonb)','execute') then
    raise exception 'Counter function role grants are incorrect';
  end if;
  rules := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'key',probe_key,'limit',1,'resetAt',pg_catalog.statement_timestamp()+interval '1 minute'
  ));
  first_result := public.recall_reserve_budget(rules);
  second_result := public.recall_reserve_budget(rules);
  if (first_result->>'allowed')::boolean is distinct from true
    or (second_result->>'allowed')::boolean is distinct from false
    or (second_result->>'retryAfter')::integer < 1 then
    raise exception 'Counter reservation/rejection did not match the expected result';
  end if;
end;
$verification$;
rollback;
