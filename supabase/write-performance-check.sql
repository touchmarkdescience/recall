-- Run after write-performance-migration.sql, before deploying the new backend.
-- Uses disposable synthetic rows and rolls back everything, including failures.
begin;
do $$
declare
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_saved jsonb;
  v_updated jsonb;
  v_action uuid;
  v_due timestamptz := now()+interval '2 days';
  v_function text;
begin
  foreach v_function in array array[
    'public.recall_save_note_fast(uuid,uuid,text,text,text,timestamp with time zone,jsonb)',
    'public.recall_update_action_fast(uuid,uuid,jsonb)'
  ] loop
    if has_function_privilege('anon',v_function,'EXECUTE')
      or has_function_privilege('authenticated',v_function,'EXECUTE')
      or not has_function_privilege('service_role',v_function,'EXECUTE') then
      raise exception 'Unexpected fast-write function access';
    end if;
  end loop;
  insert into public.recall_users(id,email,name,password_hash) values
    (v_user,v_user::text||'@example.invalid','Disposable performance check','not-a-login-credential'),
    (v_other,v_other::text||'@example.invalid','Other disposable check','not-a-login-credential');
  v_saved := public.recall_save_note_fast(v_user,null,'','Disposable performance check',
    'Disposable summary',now(),jsonb_build_array(jsonb_build_object('kind','follow_up',
      'title','Disposable task','dueAt',v_due,'timeSpecified',true,'reminderMinutes',30)));
  v_action := (v_saved->'actions'->0->>'id')::uuid;
  if v_action is null or (v_saved->>'sheetSyncPending')::integer<>2 then
    raise exception 'Save did not return the committed action and queued events';
  end if;
  v_updated := public.recall_update_action_fast(v_user,v_action,'{"status":"done"}'::jsonb);
  if v_updated->'action'->>'status'<>'done'
    or (v_updated->'action'->>'due_at')::timestamptz<>v_due
    or (v_updated->'action'->>'reminder_minutes')::integer<>30
    or (v_updated->>'sheetSyncPending')::integer<>3 then
    raise exception 'Completion changed timing or did not queue its event';
  end if;
  begin
    perform public.recall_update_action_fast(v_other,v_action,'{"status":"pending"}'::jsonb);
    raise exception 'Cross-account update unexpectedly succeeded';
  exception when no_data_found then null;
  end;
  begin
    perform public.recall_update_action_fast(v_user,v_action,'{"status":"pending","reminderMinutes":15}'::jsonb);
    raise exception 'Invalid reminder unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
  if (select status from public.recall_actions where id=v_action)<>'done' then
    raise exception 'Rejected update modified the action';
  end if;
end;
$$;
rollback;
