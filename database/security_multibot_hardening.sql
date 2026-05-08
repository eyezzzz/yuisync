-- YuiSync - Security + Multi-bot hardening
-- Safe to run multiple times (idempotent).

begin;

-- Ensure tenant-aware uniqueness for chat sessions.
create unique index if not exists ux_chat_sessions_tenant_module_phone
  on public.chat_sessions (tenant_id, module_id, customer_phone);

create index if not exists idx_chat_sessions_tenant_status_last_message
  on public.chat_sessions (tenant_id, status, last_message_at desc);

create index if not exists idx_chat_messages_session_sent_at
  on public.chat_messages (session_id, sent_at desc);

-- Product and settings lookups used by bot/server context.
create index if not exists idx_products_tenant_module_active
  on public.products (tenant_id, module_id, active);

create index if not exists idx_settings_tenant_module
  on public.settings (tenant_id, module_id);

create index if not exists idx_appointments_tenant_module_scheduled_at
  on public.appointments (tenant_id, module_id, scheduled_at);

-- Marmitaria tenant isolation performance.
create index if not exists idx_marmitaria_itens_tenant_disponivel
  on public.marmitaria_itens (tenant_id, disponivel);

create index if not exists idx_marmitaria_config_tenant
  on public.marmitaria_config (tenant_id);

create index if not exists idx_marmitaria_pedidos_tenant_status_created
  on public.marmitaria_pedidos (tenant_id, status, created_at desc);

create index if not exists idx_marmitaria_bot_sessions_tenant
  on public.marmitaria_bot_sessions (tenant_id);

-- Optional hardening: if a default tenant exists, backfill nulls.
do $$
declare
  v_default_tenant uuid;
begin
  select id into v_default_tenant
  from public.tenants
  order by created_at asc
  limit 1;

  if v_default_tenant is null then
    return;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_sessions'
      and column_name = 'tenant_id'
  ) then
    update public.chat_sessions
    set tenant_id = v_default_tenant
    where tenant_id is null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'marmitaria_itens'
      and column_name = 'tenant_id'
  ) then
    update public.marmitaria_itens
    set tenant_id = v_default_tenant
    where tenant_id is null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'marmitaria_config'
      and column_name = 'tenant_id'
  ) then
    update public.marmitaria_config
    set tenant_id = v_default_tenant
    where tenant_id is null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'marmitaria_pedidos'
      and column_name = 'tenant_id'
  ) then
    update public.marmitaria_pedidos
    set tenant_id = v_default_tenant
    where tenant_id is null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'marmitaria_bot_sessions'
      and column_name = 'tenant_id'
  ) then
    update public.marmitaria_bot_sessions
    set tenant_id = v_default_tenant
    where tenant_id is null;
  end if;
end $$;

-- Project log marker (runs only if logs table exists).
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
      'seguranca',
      'success',
      'migration',
      'Hardening de bots multi-instancia aplicado',
      'Indexes e garantias de isolamento tenant-aware para chat e marmitaria.',
      jsonb_build_object('migration', 'security_multibot_hardening.sql'),
      'migration-security-multibot-hardening-20260404',
      now()
    )
    on conflict (fingerprint) do nothing;
  end if;
end $$;

commit;
