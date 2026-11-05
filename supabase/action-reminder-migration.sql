-- Run before deploying per-action reminder chips. Existing actions default to At time.
begin;
alter table public.recall_actions add column if not exists reminder_minutes integer not null default 0 check (reminder_minutes in (0,10,30,60,1440));
create or replace function public.recall_save_note(
  p_user_id uuid, p_contact_id uuid, p_contact_name text,
  p_transcript text, p_summary text, p_occurred_at timestamptz, p_actions jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_contact_id uuid := p_contact_id;
  v_contact_name text;
  v_interaction_id uuid := gen_random_uuid();
  v_action jsonb;
  v_action_id uuid;
  v_time_specified integer;
  v_duration integer;
  v_due_at timestamptz;
  v_created_at timestamptz := now();
begin
  if v_contact_id is not null then
    select name into v_contact_name from public.recall_contacts where id=v_contact_id and user_id=p_user_id;
    if v_contact_name is null then raise exception 'Contact not found'; end if;
  else
    if length(trim(coalesce(p_contact_name,''))) > 120 then raise exception 'Person name is too long'; end if;
    if length(trim(coalesce(p_contact_name,''))) > 0 then
      v_contact_id := gen_random_uuid();
      v_contact_name := trim(p_contact_name);
      insert into public.recall_contacts(id,user_id,name,created_at)
        values(v_contact_id,p_user_id,v_contact_name,v_created_at);
    else
      v_contact_name := '';
    end if;
  end if;
  insert into public.recall_interactions(id,user_id,contact_id,transcript,summary,occurred_at,created_at)
    values(v_interaction_id,p_user_id,v_contact_id,p_transcript,p_summary,p_occurred_at,v_created_at);
  insert into public.recall_sheet_outbox(id,user_id,payload_json,created_at)
    values(gen_random_uuid(),p_user_id,jsonb_build_object('type','interaction','interactionId',v_interaction_id,'contactId',v_contact_id,'contactName',v_contact_name,'transcript',p_transcript,'summary',p_summary,'recordedAt',v_created_at),v_created_at);
  for v_action in select value from jsonb_array_elements(coalesce(p_actions,'[]'::jsonb)) loop
    v_action_id := gen_random_uuid();
    v_time_specified := case when v_action->>'timeSpecified'='false' then 0 else 1 end;
    v_duration := coalesce((v_action->>'durationMinutes')::integer,30);
    v_due_at := nullif(v_action->>'dueAt','')::timestamptz;
    insert into public.recall_actions(id,user_id,contact_id,interaction_id,kind,title,due_at,time_specified,duration_minutes,reminder_minutes,status,created_at)
      values(v_action_id,p_user_id,v_contact_id,v_interaction_id,v_action->>'kind',trim(v_action->>'title'),v_due_at,v_time_specified,v_duration,coalesce((v_action->>'reminderMinutes')::integer,0),'pending',v_created_at);
    insert into public.recall_sheet_outbox(id,user_id,payload_json,created_at)
      values(gen_random_uuid(),p_user_id,jsonb_build_object('type','action','actionId',v_action_id,'interactionId',v_interaction_id,'contactId',v_contact_id,'contactName',v_contact_name,'kind',v_action->>'kind','title',trim(v_action->>'title'),'dueAt',v_due_at,'timeSpecified',v_time_specified,'durationMinutes',v_duration,'status','pending','createdAt',v_created_at),v_created_at);
  end loop;
  return jsonb_build_object('contactId',v_contact_id,'interactionId',v_interaction_id);
end;
$$;
revoke all on function public.recall_save_note(uuid,uuid,text,text,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.recall_save_note(uuid,uuid,text,text,text,timestamptz,jsonb) to service_role;
commit;
