-- Apply before deploying the fast write routes. Additive; old clients/routes
-- continue using recall_save_note. No tables, accounts or reminders are removed.
begin;

create or replace function public.recall_save_note_fast(
  p_user_id uuid, p_contact_id uuid, p_contact_name text,
  p_transcript text, p_summary text, p_occurred_at timestamptz, p_actions jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_saved jsonb;
  v_contact public.recall_contacts;
  v_interaction public.recall_interactions;
  v_actions jsonb;
  v_pending bigint;
begin
  -- Reuse the installed save function and its durable outbox in this same
  -- transaction, returning only the rows it committed for this account.
  v_saved := public.recall_save_note(p_user_id,p_contact_id,p_contact_name,
    p_transcript,p_summary,p_occurred_at,p_actions);
  select * into strict v_interaction from public.recall_interactions
    where id=(v_saved->>'interactionId')::uuid and user_id=p_user_id;
  select * into v_contact from public.recall_contacts
    where id=v_interaction.contact_id and user_id=p_user_id;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at,a.id),'[]'::jsonb)
    into v_actions from public.recall_actions a
    where interaction_id=v_interaction.id and user_id=p_user_id;
  select count(*) into v_pending from public.recall_sheet_outbox
    where user_id=p_user_id and synced_at is null;
  return v_saved||jsonb_build_object('contact',case when v_contact.id is null then null else to_jsonb(v_contact) end,
    'interaction',to_jsonb(v_interaction),'actions',v_actions,'sheetSyncPending',v_pending);
end;
$$;

create or replace function public.recall_update_action_fast(
  p_user_id uuid, p_action_id uuid, p_patch jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_old public.recall_actions;
  v_new public.recall_actions;
  v_contact public.recall_contacts;
  v_note public.recall_interactions;
  v_status text;
  v_title text;
  v_kind text;
  v_due timestamptz;
  v_timed integer;
  v_reminder integer;
  v_pending bigint;
begin
  -- Serialize edits of the same owned action, avoiding lost updates between
  -- separate read/update requests. Other accounts cannot select or mutate it.
  select * into v_old from public.recall_actions
    where id=p_action_id and user_id=p_user_id for update;
  if not found then raise exception using errcode='P0002',message='Action not found'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception using errcode='22023',message='Invalid action update';
  end if;
  v_status := btrim(coalesce(p_patch->>'status',''));
  v_title := case when p_patch?'title' then btrim(coalesce(p_patch->>'title','')) else v_old.title end;
  v_kind := case when p_patch?'kind' then btrim(coalesce(p_patch->>'kind','')) else v_old.kind end;
  if v_status not in ('pending','done','archived','removed') then
    raise exception using errcode='22023',message='Invalid status';
  end if;
  if length(v_title)=0 or length(v_title)>500 or v_kind not in ('follow_up','reminder','meeting') then
    raise exception using errcode='22023',message='Enter a valid title, type and date.';
  end if;
  v_reminder := v_old.reminder_minutes;
  if p_patch?'reminderMinutes' then
    if jsonb_typeof(p_patch->'reminderMinutes') is distinct from 'number'
      or p_patch->>'reminderMinutes' not in ('0','10','30','60','1440') then
      raise exception using errcode='22023',message='Choose a reminder offset from the list.';
    end if;
    v_reminder := (p_patch->>'reminderMinutes')::integer;
  end if;
  v_timed := case when not p_patch?'timeSpecified' then v_old.time_specified
    when p_patch->'timeSpecified'='false'::jsonb then 0 else 1 end;
  v_due := v_old.due_at;
  if p_patch?'dueAt' then
    if jsonb_typeof(p_patch->'dueAt') not in ('null','string') then
      raise exception using errcode='22023',message='Choose a valid date and time.';
    end if;
    begin
      v_due := nullif(p_patch->>'dueAt','')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode='22023',message='Choose a valid date and time.';
    end;
    if v_due is not null and (not isfinite(v_due) or (v_timed<>0 and v_due<clock_timestamp())) then
      raise exception using errcode='22023',message='A timed action cannot be scheduled in the past. Choose a later time in IST.';
    end if;
  end if;
  update public.recall_actions set status=v_status,title=v_title,kind=v_kind,
    due_at=v_due,time_specified=v_timed,reminder_minutes=v_reminder,
    notified_at=case when v_due is distinct from v_old.due_at
      or v_timed<>v_old.time_specified or v_status<>v_old.status
      or v_reminder<>v_old.reminder_minutes then null else v_old.notified_at end
    where id=p_action_id and user_id=p_user_id returning * into strict v_new;
  select * into v_contact from public.recall_contacts where id=v_new.contact_id and user_id=p_user_id;
  select * into v_note from public.recall_interactions where id=v_new.interaction_id and user_id=p_user_id;
  insert into public.recall_sheet_outbox(id,user_id,payload_json)
    values(gen_random_uuid(),p_user_id,jsonb_build_object('type','action','actionId',v_new.id,
      'interactionId',v_new.interaction_id,'contactId',v_new.contact_id,'contactName',coalesce(v_contact.name,''),
      'kind',v_new.kind,'title',v_new.title,'dueAt',v_new.due_at,'timeSpecified',v_new.time_specified,
      'reminderMinutes',v_new.reminder_minutes,'durationMinutes',v_new.duration_minutes,
      'status',v_new.status,'createdAt',v_new.created_at));
  select count(*) into v_pending from public.recall_sheet_outbox where user_id=p_user_id and synced_at is null;
  return jsonb_build_object('action',to_jsonb(v_new),
    'contact',case when v_contact.id is null then null else to_jsonb(v_contact) end,
    'summary',v_note.summary,'originalNote',v_note.transcript,'sheetSyncPending',v_pending);
end;
$$;

revoke all on function public.recall_save_note_fast(uuid,uuid,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
revoke all on function public.recall_update_action_fast(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.recall_save_note_fast(uuid,uuid,text,text,text,timestamptz,jsonb) to service_role;
grant execute on function public.recall_update_action_fast(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
