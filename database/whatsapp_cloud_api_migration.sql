-- YuiSync - WhatsApp Cloud API channel migration
-- Execute in Supabase SQL Editor after choosing the tenant that owns the WhatsApp number.

begin;

alter table public.tenant_bot_channels
  add column if not exists whatsapp_phone_number_id text,
  add column if not exists whatsapp_access_token text,
  add column if not exists whatsapp_verify_token text,
  add column if not exists whatsapp_app_secret text;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.tenant_bot_channels'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%channel%'
      and pg_get_constraintdef(oid) ilike '%telegram%'
  loop
    execute format('alter table public.tenant_bot_channels drop constraint %I', v_constraint.conname);
  end loop;
end $$;

alter table public.tenant_bot_channels
  add constraint tenant_bot_channels_channel_check
  check (channel in ('telegram', 'whatsapp'));

create index if not exists idx_tenant_bot_channels_whatsapp_phone
  on public.tenant_bot_channels (whatsapp_phone_number_id)
  where channel = 'whatsapp' and active = true and whatsapp_phone_number_id is not null;

create or replace function public.bootstrap_tenant_bot_channels()
returns trigger
language plpgsql
as $$
begin
  insert into public.tenant_bot_channels (
    tenant_id,
    module_id,
    channel,
    bot_label,
    active
  )
  values (
    new.id,
    'petshop',
    'whatsapp',
    coalesce(new.name, 'Petshop') || ' WhatsApp',
    false
  )
  on conflict (tenant_id, module_id, channel) do nothing;

  return new;
end;
$$;

insert into public.tenant_bot_channels (tenant_id, module_id, channel, bot_label, active)
select
  t.id,
  'petshop',
  'whatsapp',
  coalesce(t.name, 'Petshop') || ' WhatsApp',
  false
from public.tenants t
on conflict (tenant_id, module_id, channel) do nothing;

create or replace function public.upsert_tenant_whatsapp_bot_channel(
  p_tenant_id uuid,
  p_module_id text,
  p_bot_label text,
  p_whatsapp_phone_number_id text,
  p_whatsapp_access_token text,
  p_whatsapp_verify_token text,
  p_whatsapp_app_secret text default null,
  p_active boolean default true
)
returns public.tenant_bot_channels
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tenant_bot_channels;
begin
  insert into public.tenant_bot_channels (
    tenant_id,
    module_id,
    channel,
    bot_label,
    whatsapp_phone_number_id,
    whatsapp_access_token,
    whatsapp_verify_token,
    whatsapp_app_secret,
    active
  )
  values (
    p_tenant_id,
    p_module_id,
    'whatsapp',
    coalesce(nullif(trim(p_bot_label), ''), 'WhatsApp'),
    nullif(trim(p_whatsapp_phone_number_id), ''),
    nullif(trim(p_whatsapp_access_token), ''),
    nullif(trim(p_whatsapp_verify_token), ''),
    nullif(trim(p_whatsapp_app_secret), ''),
    p_active
  )
  on conflict (tenant_id, module_id, channel)
  do update set
    bot_label = excluded.bot_label,
    whatsapp_phone_number_id = excluded.whatsapp_phone_number_id,
    whatsapp_access_token = excluded.whatsapp_access_token,
    whatsapp_verify_token = excluded.whatsapp_verify_token,
    whatsapp_app_secret = excluded.whatsapp_app_secret,
    active = excluded.active,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.upsert_single_active_whatsapp_bot_channel(
  p_module_id text,
  p_bot_label text,
  p_whatsapp_phone_number_id text,
  p_whatsapp_access_token text,
  p_whatsapp_verify_token text,
  p_whatsapp_app_secret text default null,
  p_active boolean default true
)
returns public.tenant_bot_channels
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select t.id
  into v_tenant_id
  from public.tenants t
  where coalesce(t.active, true) = true
  order by t.created_at asc
  limit 2;

  if v_tenant_id is null then
    raise exception 'No active tenant found to configure WhatsApp.';
  end if;

  if (
    select count(*)
    from public.tenants t
    where coalesce(t.active, true) = true
  ) <> 1 then
    raise exception 'More than one active tenant found. Use public.upsert_tenant_whatsapp_bot_channel with an explicit tenant id.';
  end if;

  return public.upsert_tenant_whatsapp_bot_channel(
    v_tenant_id,
    p_module_id,
    p_bot_label,
    p_whatsapp_phone_number_id,
    p_whatsapp_access_token,
    p_whatsapp_verify_token,
    p_whatsapp_app_secret,
    p_active
  );
end;
$$;

grant execute on function public.upsert_tenant_whatsapp_bot_channel(
  uuid, text, text, text, text, text, text, boolean
) to authenticated;

grant execute on function public.upsert_single_active_whatsapp_bot_channel(
  text, text, text, text, text, text, boolean
) to authenticated;

do $$
begin
  if to_regclass('public.system_update_logs') is not null then
    insert into public.system_update_logs (
      module_id,
      category,
      status,
      source,
      title,
      description,
      metadata,
      fingerprint,
      created_at
    )
    values (
      'petshop',
      'automacao',
      'success',
      'migration',
      'WhatsApp Cloud API conectado ao Chat IA',
      'Canal WhatsApp oficial preparado para webhooks da Meta, resposta automatica pelo agente IA e envio humano pela Cloud API.',
      jsonb_build_object('migration', 'whatsapp_cloud_api_migration.sql'),
      'migration-whatsapp-cloud-api-20260508',
      now()
    )
    on conflict (fingerprint) do nothing;
  end if;
end $$;

commit;

-- After commit, configure the tenant with placeholders like:
-- select public.upsert_tenant_whatsapp_bot_channel(
--   'TENANT_UUID',
--   'petshop',
--   'Petshop WhatsApp',
--   'PHONE_NUMBER_ID',
--   'PERMANENT_ACCESS_TOKEN',
--   'VERIFY_TOKEN_USED_IN_META',
--   null,
--   true
-- );
--
-- If only one tenant is active, you can use:
-- select public.upsert_single_active_whatsapp_bot_channel(
--   'petshop',
--   'Petshop WhatsApp',
--   'PHONE_NUMBER_ID',
--   'PERMANENT_ACCESS_TOKEN',
--   'VERIFY_TOKEN_USED_IN_META',
--   null,
--   true
-- );
