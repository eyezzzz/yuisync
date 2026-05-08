-- YuiSync - Dynamic bot channels per tenant (auto-bootstrap)
-- Execute once in Supabase SQL Editor.

begin;

create table if not exists public.tenant_bot_channels (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null check (module_id in ('petshop', 'marmitaria', 'contabilidade')),
  channel text not null default 'telegram' check (channel in ('telegram')),
  bot_label text not null default 'Bot',
  telegram_bot_token text,
  ai_provider text not null default 'openai' check (ai_provider in ('openai', 'groq')),
  ai_model text,
  openai_api_key_override text,
  groq_api_key_override text,
  active boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, module_id, channel)
);

create index if not exists idx_tenant_bot_channels_tenant_module
  on public.tenant_bot_channels (tenant_id, module_id, channel);

create index if not exists idx_tenant_bot_channels_active
  on public.tenant_bot_channels (active, module_id);

create or replace function public.touch_tenant_bot_channels_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_tenant_bot_channels_updated_at on public.tenant_bot_channels;
create trigger trg_tenant_bot_channels_updated_at
before update on public.tenant_bot_channels
for each row execute function public.touch_tenant_bot_channels_updated_at();

-- Auto-bootstrap channel record when a new tenant is created.
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
    'telegram',
    coalesce(new.name, 'Petshop') || ' Bot',
    false
  )
  on conflict (tenant_id, module_id, channel) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_bootstrap_tenant_bot_channels on public.tenants;
create trigger trg_bootstrap_tenant_bot_channels
after insert on public.tenants
for each row execute function public.bootstrap_tenant_bot_channels();

-- Backfill for existing tenants.
insert into public.tenant_bot_channels (tenant_id, module_id, channel, bot_label, active)
select
  t.id,
  'petshop',
  'telegram',
  coalesce(t.name, 'Petshop') || ' Bot',
  false
from public.tenants t
on conflict (tenant_id, module_id, channel) do nothing;

-- Optional helper to enable channel quickly.
create or replace function public.upsert_tenant_telegram_bot_channel(
  p_tenant_id uuid,
  p_module_id text,
  p_bot_label text,
  p_telegram_bot_token text,
  p_ai_provider text default 'openai',
  p_ai_model text default null,
  p_openai_api_key_override text default null,
  p_groq_api_key_override text default null,
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
    telegram_bot_token,
    ai_provider,
    ai_model,
    openai_api_key_override,
    groq_api_key_override,
    active
  )
  values (
    p_tenant_id,
    p_module_id,
    'telegram',
    coalesce(nullif(trim(p_bot_label), ''), 'Bot'),
    nullif(trim(p_telegram_bot_token), ''),
    coalesce(nullif(trim(p_ai_provider), ''), 'openai'),
    nullif(trim(p_ai_model), ''),
    nullif(trim(p_openai_api_key_override), ''),
    nullif(trim(p_groq_api_key_override), ''),
    p_active
  )
  on conflict (tenant_id, module_id, channel)
  do update set
    bot_label = excluded.bot_label,
    telegram_bot_token = excluded.telegram_bot_token,
    ai_provider = excluded.ai_provider,
    ai_model = excluded.ai_model,
    openai_api_key_override = excluded.openai_api_key_override,
    groq_api_key_override = excluded.groq_api_key_override,
    active = excluded.active,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.upsert_tenant_telegram_bot_channel(
  uuid, text, text, text, text, text, text, text, boolean
) to authenticated;

alter table public.tenant_bot_channels enable row level security;

drop policy if exists "tenant_bot_channels_select" on public.tenant_bot_channels;
create policy "tenant_bot_channels_select"
on public.tenant_bot_channels
for select
using (
  public.is_global_admin()
  or public.has_tenant_access(tenant_id)
);

drop policy if exists "tenant_bot_channels_insert" on public.tenant_bot_channels;
create policy "tenant_bot_channels_insert"
on public.tenant_bot_channels
for insert
with check (
  public.is_global_admin()
  or public.is_module_tenant_admin(module_id, tenant_id)
);

drop policy if exists "tenant_bot_channels_update" on public.tenant_bot_channels;
create policy "tenant_bot_channels_update"
on public.tenant_bot_channels
for update
using (
  public.is_global_admin()
  or public.is_module_tenant_admin(module_id, tenant_id)
)
with check (
  public.is_global_admin()
  or public.is_module_tenant_admin(module_id, tenant_id)
);

drop policy if exists "tenant_bot_channels_delete" on public.tenant_bot_channels;
create policy "tenant_bot_channels_delete"
on public.tenant_bot_channels
for delete
using (public.is_global_admin());

-- Log marker if logs table exists.
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
      'system',
      'infra',
      'success',
      'migration',
      'Canais dinamicos de bot por tenant',
      'Tabela tenant_bot_channels e trigger de bootstrap por tenant criados para eliminacao de env manual por cliente.',
      jsonb_build_object('migration', 'bot_channels_dynamic.sql'),
      'migration-bot-channels-dynamic-20260404',
      now()
    )
    on conflict (fingerprint) do nothing;
  end if;
end $$;

commit;
