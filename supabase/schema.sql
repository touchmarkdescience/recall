-- Recall production schema. Run once in the SQL Editor of the intended Supabase project.
create extension if not exists pgcrypto;

create table if not exists public.recall_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.recall_sessions (
  token_hash text primary key,
  user_id uuid not null references public.recall_users(id) on delete cascade,
  expires_at timestamptz not null
);
create table if not exists public.recall_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.recall_users(id) on delete cascade,
  name text not null,
  phone text,
  created_at timestamptz not null default now()
);
create index if not exists recall_contacts_user on public.recall_contacts(user_id);
create table if not exists public.recall_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.recall_users(id) on delete cascade,
  contact_id uuid references public.recall_contacts(id) on delete cascade,
  transcript text not null,
  summary text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists recall_interactions_contact on public.recall_interactions(user_id,contact_id,occurred_at desc);
create table if not exists public.recall_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.recall_users(id) on delete cascade,
  contact_id uuid references public.recall_contacts(id) on delete cascade,
  interaction_id uuid references public.recall_interactions(id) on delete set null,
  kind text not null check (kind in ('follow_up','reminder','meeting')),
  title text not null,
  due_at timestamptz,
  time_specified integer not null default 1,
  duration_minutes integer not null default 30,
  status text not null default 'pending' check (status in ('pending','done','archived','removed')),
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
create index if not exists recall_actions_due on public.recall_actions(user_id,status,due_at);
create table if not exists public.recall_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.recall_users(id) on delete cascade,
  endpoint text not null unique,
  subscription_json jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.recall_user_settings (
  user_id uuid primary key references public.recall_users(id) on delete cascade,
  push_enabled boolean not null default true,
  reminder_minutes integer not null default 30,
  sheet_webhook_url text,
  sheet_secret text,
  updated_at timestamptz not null default now()
);
create table if not exists public.recall_sheet_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.recall_users(id) on delete cascade,
  payload_json jsonb not null,
  created_at timestamptz not null default now(),
  synced_at timestamptz,
  error text
);
create index if not exists recall_sheet_outbox_pending on public.recall_sheet_outbox(user_id,synced_at);

-- The app accesses these tables only from server routes with a Supabase secret key.
-- A browser publishable key has no table access because there are no policies.
alter table public.recall_users enable row level security;
alter table public.recall_sessions enable row level security;
alter table public.recall_contacts enable row level security;
alter table public.recall_interactions enable row level security;
alter table public.recall_actions enable row level security;
alter table public.recall_push_subscriptions enable row level security;
alter table public.recall_user_settings enable row level security;
alter table public.recall_sheet_outbox enable row level security;

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
    insert into public.recall_actions(id,user_id,contact_id,interaction_id,kind,title,due_at,time_specified,duration_minutes,status,created_at)
      values(v_action_id,p_user_id,v_contact_id,v_interaction_id,v_action->>'kind',trim(v_action->>'title'),v_due_at,v_time_specified,v_duration,'pending',v_created_at);
    insert into public.recall_sheet_outbox(id,user_id,payload_json,created_at)
      values(gen_random_uuid(),p_user_id,jsonb_build_object('type','action','actionId',v_action_id,'interactionId',v_interaction_id,'contactId',v_contact_id,'contactName',v_contact_name,'kind',v_action->>'kind','title',trim(v_action->>'title'),'dueAt',v_due_at,'timeSpecified',v_time_specified,'durationMinutes',v_duration,'status','pending','createdAt',v_created_at),v_created_at);
  end loop;
  return jsonb_build_object('contactId',v_contact_id,'interactionId',v_interaction_id);
end;
$$;
revoke all on function public.recall_save_note(uuid,uuid,text,text,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.recall_save_note(uuid,uuid,text,text,text,timestamptz,jsonb) to service_role;
