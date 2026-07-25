begin;

-- Dashboard/customer simulation messages must be ingested by the serverless
-- API. These columns coordinate stateless Vercel invocations through the
-- database, so browser timers or process memory are never authoritative.
alter table public.chat_sessions
  add column if not exists dashboard_message_version bigint not null default 0,
  add column if not exists dashboard_processed_version bigint not null default 0,
  add column if not exists dashboard_processing_token uuid,
  add column if not exists dashboard_processing_until timestamptz;

alter table public.chat_messages
  add column if not exists dashboard_turn_version bigint;

create index if not exists idx_chat_messages_dashboard_turn
  on public.chat_messages(session_id, dashboard_turn_version)
  where dashboard_turn_version is not null;

comment on column public.chat_sessions.dashboard_message_version is
  'Monotonic version incremented by serverless dashboard chat ingestion.';
comment on column public.chat_sessions.dashboard_processed_version is
  'Highest dashboard message version incorporated into a completed bot turn.';
comment on column public.chat_sessions.dashboard_processing_token is
  'Database-backed lease token used to serialize stateless serverless bot turns.';
comment on column public.chat_sessions.dashboard_processing_until is
  'Expiry for the database-backed dashboard bot processing lease.';
comment on column public.chat_messages.dashboard_turn_version is
  'Server-assigned dashboard ingestion order. Browser timestamps are never authoritative.';

create or replace function public.ingest_dashboard_chat_message(
  p_session_id uuid,
  p_message_id uuid,
  p_content text,
  p_source text default 'dashboard_simulation'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_session public.chat_sessions%rowtype;
  v_message public.chat_messages%rowtype;
  v_next_version bigint;
  v_inserted boolean := false;
  v_now timestamptz := clock_timestamp();
  v_content text := btrim(coalesce(p_content, ''));
  v_source text := left(coalesce(nullif(btrim(p_source), ''), 'dashboard_simulation'), 80);
begin
  if p_session_id is null or p_message_id is null then
    raise exception 'session_id and message_id are required' using errcode = '22023';
  end if;

  if v_content = '' then
    raise exception 'message cannot be empty' using errcode = '22023';
  end if;

  if length(v_content) > 4000 then
    raise exception 'message is too long' using errcode = '22023';
  end if;

  select *
  into v_session
  from public.chat_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'chat session not found' using errcode = 'P0002';
  end if;

  select *
  into v_message
  from public.chat_messages
  where id = p_message_id
  for update;

  if found then
    if v_message.session_id <> p_session_id
      or v_message.role <> 'user'
      or btrim(coalesce(v_message.content, '')) <> v_content then
      raise exception 'client_message_id already belongs to another message'
        using errcode = '23505';
    end if;

    if v_message.dashboard_turn_version is null then
      v_next_version := greatest(v_session.dashboard_message_version, 0) + 1;

      update public.chat_messages
      set
        sent_at = v_now,
        dashboard_turn_version = v_next_version,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'source', v_source,
          'client_message_id', p_message_id,
          'server_ingested', true,
          'dashboard_turn_version', v_next_version
        )
      where id = p_message_id
      returning * into v_message;

      update public.chat_sessions
      set
        dashboard_message_version = v_next_version,
        last_message_at = v_now
      where id = p_session_id;
    else
      v_next_version := v_message.dashboard_turn_version;

      update public.chat_sessions
      set dashboard_message_version = greatest(dashboard_message_version, v_next_version)
      where id = p_session_id;
    end if;
  else
    v_next_version := greatest(v_session.dashboard_message_version, 0) + 1;

    insert into public.chat_messages (
      id,
      session_id,
      role,
      content,
      metadata,
      sent_at,
      dashboard_turn_version
    ) values (
      p_message_id,
      p_session_id,
      'user',
      v_content,
      jsonb_build_object(
        'source', v_source,
        'client_message_id', p_message_id,
        'server_ingested', true,
        'dashboard_turn_version', v_next_version
      ),
      v_now,
      v_next_version
    )
    returning * into v_message;

    update public.chat_sessions
    set
      dashboard_message_version = v_next_version,
      last_message_at = v_now
    where id = p_session_id;

    v_inserted := true;
  end if;

  return jsonb_build_object(
    'inserted', v_inserted,
    'turn_version', v_next_version,
    'message', jsonb_build_object(
      'id', v_message.id,
      'session_id', v_message.session_id,
      'role', v_message.role,
      'content', v_message.content,
      'metadata', v_message.metadata,
      'tokens_used', v_message.tokens_used,
      'sent_at', v_message.sent_at,
      'dashboard_turn_version', v_message.dashboard_turn_version
    )
  );
end;
$function$;

create or replace function public.acquire_dashboard_chat_turn(
  p_session_id uuid,
  p_expected_version bigint,
  p_processing_token uuid,
  p_lease_seconds integer default 110
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_session public.chat_sessions%rowtype;
  v_lease_seconds integer := greatest(15, least(coalesce(p_lease_seconds, 110), 110));
begin
  if p_session_id is null or p_processing_token is null or coalesce(p_expected_version, 0) <= 0 then
    raise exception 'invalid dashboard processing lease request' using errcode = '22023';
  end if;

  update public.chat_sessions
  set
    dashboard_processing_token = p_processing_token,
    dashboard_processing_until = clock_timestamp() + make_interval(secs => v_lease_seconds)
  where id = p_session_id
    and dashboard_message_version = p_expected_version
    and dashboard_processed_version < p_expected_version
    and (
      dashboard_processing_token is null
      or dashboard_processing_until is null
      or dashboard_processing_until <= clock_timestamp()
      or dashboard_processing_token = p_processing_token
    )
  returning * into v_session;

  if found then
    return jsonb_build_object(
      'acquired', true,
      'turn_version', v_session.dashboard_message_version,
      'processed_version', v_session.dashboard_processed_version,
      'processing_until', v_session.dashboard_processing_until
    );
  end if;

  select *
  into v_session
  from public.chat_sessions
  where id = p_session_id;

  if not found then
    raise exception 'chat session not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'acquired', false,
    'turn_version', v_session.dashboard_message_version,
    'processed_version', v_session.dashboard_processed_version,
    'processing_until', v_session.dashboard_processing_until
  );
end;
$function$;

create or replace function public.complete_dashboard_chat_turn(
  p_session_id uuid,
  p_processing_token uuid,
  p_processed_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_session public.chat_sessions%rowtype;
begin
  update public.chat_sessions
  set
    dashboard_processed_version = greatest(dashboard_processed_version, p_processed_version),
    dashboard_processing_token = null,
    dashboard_processing_until = null
  where id = p_session_id
    and dashboard_processing_token = p_processing_token
  returning * into v_session;

  if not found then
    select * into v_session
    from public.chat_sessions
    where id = p_session_id;
  end if;

  if not found then
    raise exception 'chat session not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'completed', v_session.dashboard_processed_version >= p_processed_version,
    'turn_version', v_session.dashboard_message_version,
    'processed_version', v_session.dashboard_processed_version
  );
end;
$function$;

create or replace function public.release_dashboard_chat_turn(
  p_session_id uuid,
  p_processing_token uuid
)
returns boolean
language sql
security definer
set search_path = public
as $function$
  with released as (
    update public.chat_sessions
    set
      dashboard_processing_token = null,
      dashboard_processing_until = null
    where id = p_session_id
      and dashboard_processing_token = p_processing_token
    returning id
  )
  select exists(select 1 from released);
$function$;

revoke all on function public.ingest_dashboard_chat_message(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.acquire_dashboard_chat_turn(uuid, bigint, uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_dashboard_chat_turn(uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.release_dashboard_chat_turn(uuid, uuid) from public, anon, authenticated;

grant execute on function public.ingest_dashboard_chat_message(uuid, uuid, text, text) to service_role;
grant execute on function public.acquire_dashboard_chat_turn(uuid, bigint, uuid, integer) to service_role;
grant execute on function public.complete_dashboard_chat_turn(uuid, uuid, bigint) to service_role;
grant execute on function public.release_dashboard_chat_turn(uuid, uuid) to service_role;

commit;
