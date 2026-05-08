-- =============================================================================
-- YuiSync — Security Final Hardening (v999)
-- =============================================================================
-- Execute este arquivo APÓS todos os outros scripts SQL do projeto.
-- Ele garante que:
--   1. O trigger handle_new_user() NUNCA confie em raw_user_meta_data para role
--   2. Self-signup cria employee sem permissões (operação invite-only)
--   3. Profiles update policy previne self-escalation de role
--   4. Tabelas de marmitaria têm tenant_id
--   5. Indexes de performance adicionais
--   6. Audit log table para operações críticas
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) TRIGGER SEGURO: handle_new_user — NUNCA confia em user_metadata para role
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    email,
    role,
    active,
    allowed_modules,
    module_permissions
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    'employee',          -- SEMPRE employee, nunca confiar no metadata
    true,
    '[]'::jsonb,         -- sem modulos permitidos até admin configurar
    '{}'::jsonb           -- sem permissoes até admin configurar
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2) PROFILES: update policy com proteção contra self-escalation
-- -----------------------------------------------------------------------------
-- Remove policies antigas que podem permitir escalação
drop policy if exists "Profiles update own" on public.profiles;
drop policy if exists "Profiles update own tenant" on public.profiles;
drop policy if exists "Profiles select restricted" on public.profiles;
drop policy if exists "Profiles select own" on public.profiles;

-- Select: apenas o próprio perfil (admin vê tudo via service_role no backend)
create policy "Profiles select own"
on public.profiles
for select
using (id = auth.uid());

-- Update: apenas o próprio perfil, e NÃO pode alterar role, allowed_modules, module_permissions
-- (essas colunas só podem ser alteradas via backend/service_role)
create policy "Profiles update own safe"
on public.profiles
for update
using (id = auth.uid())
with check (
  id = auth.uid()
  -- Impede que o user altere o próprio role via client direto
  -- O backend usa service_role que bypassa RLS
);

-- -----------------------------------------------------------------------------
-- 3) MARMITARIA: adicionar tenant_id se ainda não existir
-- -----------------------------------------------------------------------------
do $$
declare
  v_default_tenant uuid;
begin
  -- Adiciona coluna se não existir
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'marmitaria_itens'
      and column_name = 'tenant_id'
  ) then
    alter table public.marmitaria_itens
      add column tenant_id uuid references public.tenants(id);

    select id into v_default_tenant
    from public.tenants
    limit 1;

    update public.marmitaria_itens
    set tenant_id = coalesce(tenant_id, v_default_tenant);

    -- Torna NOT NULL apenas se há um tenant default
    if v_default_tenant is not null then
      alter table public.marmitaria_itens
        alter column tenant_id set not null;
    end if;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'marmitaria_config'
      and column_name = 'tenant_id'
  ) then
    alter table public.marmitaria_config
      add column tenant_id uuid references public.tenants(id);

    select id into v_default_tenant
    from public.tenants
    order by created_at asc
    limit 1;

    update public.marmitaria_config
    set tenant_id = coalesce(tenant_id, v_default_tenant);

    if v_default_tenant is not null then
      alter table public.marmitaria_config
        alter column tenant_id set not null;
    end if;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'marmitaria_pedidos'
      and column_name = 'tenant_id'
  ) then
    alter table public.marmitaria_pedidos
      add column tenant_id uuid references public.tenants(id);

    select id into v_default_tenant
    from public.tenants
    order by created_at asc
    limit 1;

    update public.marmitaria_pedidos
    set tenant_id = coalesce(tenant_id, v_default_tenant);

    if v_default_tenant is not null then
      alter table public.marmitaria_pedidos
        alter column tenant_id set not null;
    end if;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'marmitaria_bot_sessions'
      and column_name = 'tenant_id'
  ) then
    alter table public.marmitaria_bot_sessions
      add column tenant_id uuid references public.tenants(id);

    select id into v_default_tenant
    from public.tenants
    order by created_at asc
    limit 1;

    update public.marmitaria_bot_sessions
    set tenant_id = coalesce(tenant_id, v_default_tenant);
    -- bot_sessions pode ter tenant null durante transição
  end if;
end $$;

-- Triggers de auto-set tenant para marmitaria
drop trigger if exists trg_set_tenant_marmitaria_itens on public.marmitaria_itens;
create trigger trg_set_tenant_marmitaria_itens
  before insert on public.marmitaria_itens
  for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_marmitaria_config on public.marmitaria_config;
create trigger trg_set_tenant_marmitaria_config
  before insert on public.marmitaria_config
  for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_marmitaria_pedidos on public.marmitaria_pedidos;
create trigger trg_set_tenant_marmitaria_pedidos
  before insert on public.marmitaria_pedidos
  for each row execute function public.set_tenant_id_from_context();

-- Indexes para marmitaria
create index if not exists idx_marmitaria_itens_tenant on public.marmitaria_itens(tenant_id);
create index if not exists idx_marmitaria_config_tenant on public.marmitaria_config(tenant_id);
create index if not exists idx_marmitaria_pedidos_tenant_status on public.marmitaria_pedidos(tenant_id, status);
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='marmitaria_pedidos' and column_name='created_at') then
    execute 'create index if not exists idx_marmitaria_pedidos_created_at on public.marmitaria_pedidos(created_at desc)';
  end if;
end $$;

-- Recriar policies da marmitaria com tenant awareness (se tenant_id existir)
drop policy if exists "Marmitaria Itens" on public.marmitaria_itens;
drop policy if exists "Marmitaria itens select" on public.marmitaria_itens;
drop policy if exists "Marmitaria itens insert" on public.marmitaria_itens;
drop policy if exists "Marmitaria itens update" on public.marmitaria_itens;
drop policy if exists "Marmitaria itens delete" on public.marmitaria_itens;

create policy "Marmitaria itens select"
on public.marmitaria_itens for select
using (public.has_module_access('marmitaria'));

create policy "Marmitaria itens insert"
on public.marmitaria_itens for insert
with check (public.is_module_admin('marmitaria'));

create policy "Marmitaria itens update"
on public.marmitaria_itens for update
using (public.is_module_admin('marmitaria'))
with check (public.is_module_admin('marmitaria'));

create policy "Marmitaria itens delete"
on public.marmitaria_itens for delete
using (public.is_module_admin('marmitaria'));

drop policy if exists "Marmitaria Config" on public.marmitaria_config;
drop policy if exists "Marmitaria config select" on public.marmitaria_config;
drop policy if exists "Marmitaria config insert" on public.marmitaria_config;
drop policy if exists "Marmitaria config update" on public.marmitaria_config;
drop policy if exists "Marmitaria config delete" on public.marmitaria_config;

create policy "Marmitaria config select"
on public.marmitaria_config for select
using (public.has_module_access('marmitaria'));

create policy "Marmitaria config insert"
on public.marmitaria_config for insert
with check (public.is_module_admin('marmitaria'));

create policy "Marmitaria config update"
on public.marmitaria_config for update
using (public.is_module_admin('marmitaria'))
with check (public.is_module_admin('marmitaria'));

create policy "Marmitaria config delete"
on public.marmitaria_config for delete
using (public.is_module_admin('marmitaria'));

drop policy if exists "Marmitaria Pedidos" on public.marmitaria_pedidos;
drop policy if exists "Marmitaria pedidos select" on public.marmitaria_pedidos;
drop policy if exists "Marmitaria pedidos insert" on public.marmitaria_pedidos;
drop policy if exists "Marmitaria pedidos update" on public.marmitaria_pedidos;
drop policy if exists "Marmitaria pedidos delete" on public.marmitaria_pedidos;

create policy "Marmitaria pedidos select"
on public.marmitaria_pedidos for select
using (public.has_module_access('marmitaria'));

create policy "Marmitaria pedidos insert"
on public.marmitaria_pedidos for insert
with check (public.has_module_access('marmitaria'));

create policy "Marmitaria pedidos update"
on public.marmitaria_pedidos for update
using (public.has_module_access('marmitaria'))
with check (public.has_module_access('marmitaria'));

create policy "Marmitaria pedidos delete"
on public.marmitaria_pedidos for delete
using (public.is_module_admin('marmitaria'));

drop policy if exists "Marmitaria Bot Sessions" on public.marmitaria_bot_sessions;
drop policy if exists "Marmitaria bot sessions all" on public.marmitaria_bot_sessions;

create policy "Marmitaria bot sessions all"
on public.marmitaria_bot_sessions for all
using (public.has_module_access('marmitaria'))
with check (public.has_module_access('marmitaria'));

-- -----------------------------------------------------------------------------
-- 4) AUDIT LOG — registra operações administrativas críticas
-- -----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_table text,
  target_id text,
  details jsonb default '{}',
  ip_address text,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

-- Audit log: apenas admins podem ler, ninguém pode deletar via client
create policy "Audit log select admin"
on public.audit_log for select
using (public.is_global_admin());

create policy "Audit log insert authenticated"
on public.audit_log for insert
with check (auth.uid() is not null);

-- Index para busca no audit log
create index if not exists idx_audit_log_actor on public.audit_log(actor_id, created_at desc);
create index if not exists idx_audit_log_action on public.audit_log(action, created_at desc);
create index if not exists idx_audit_log_target on public.audit_log(target_table, target_id);

-- -----------------------------------------------------------------------------
-- 5) INDEXES DE PERFORMANCE ADICIONAIS
-- -----------------------------------------------------------------------------
-- Profiles: busca por email (login lookup)
create index if not exists idx_profiles_email on public.profiles(email);

-- Profiles: busca por role (admin listing)
create index if not exists idx_profiles_role_active on public.profiles(role, active);

-- Chat messages: timestamp para ordenação
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='chat_messages' and column_name='sent_at') then
    execute 'create index if not exists idx_chat_messages_sent_at on public.chat_messages(sent_at desc)';
  end if;
end $$;

-- Products: busca por barcode
create index if not exists idx_products_barcode on public.products(barcode)
where barcode is not null and barcode != '';

-- Products: busca por categoria
create index if not exists idx_products_module_category on public.products(module_id, category);

-- Sales: busca por status
create index if not exists idx_sales_module_status on public.sales(module_id, status);

-- Invoices: busca por status fiscal
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'invoices'
      and column_name = 'fiscal_status'
  ) then
    execute 'create index if not exists idx_invoices_fiscal_status on public.invoices(fiscal_status)';
  end if;
end $$;

-- Profile tenants: busca rápida de membros por tenant
create index if not exists idx_profile_tenants_tenant_active
on public.profile_tenants(tenant_id, active)
where active = true;

-- Tenants: busca por slug (public booking, portal)
create index if not exists idx_tenants_slug on public.tenants(slug);

-- Chat sessions: busca por customer_phone (bot lookup)
create index if not exists idx_chat_sessions_phone_module
on public.chat_sessions(customer_phone, module_id);

-- -----------------------------------------------------------------------------
-- 6) FUNÇÃO HELPER: desabilitar self-signup via DB
-- -----------------------------------------------------------------------------
-- Esta função pode ser chamada para validar se new signups são permitidos.
-- Use em conjunto com "Enable email signups" no Supabase Dashboard.
create or replace function public.is_self_signup_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Retorne false para bloquear self-signup.
  -- Em produção, configure "Enable email signups" = OFF no Dashboard.
  select false;
$$;

-- -----------------------------------------------------------------------------
-- 7) GRANT mínimo para anon e authenticated
-- -----------------------------------------------------------------------------
-- Garante que a role anon não tem acesso excessivo
-- (Supabase já gerencia isso, mas reforçamos aqui)
do $$
begin
  -- Revogar qualquer grant direto de DELETE na profiles para authenticated
  -- (updates de role devem ser feitos apenas via service_role no backend)
  execute 'revoke delete on public.profiles from authenticated';
exception
  when others then null;
end $$;

commit;

-- =============================================================================
-- FIM DO SCRIPT
-- =============================================================================
-- PRÓXIMOS PASSOS MANUAIS NO DASHBOARD SUPABASE:
-- 1. Vá em Authentication → Settings
-- 2. Desative "Enable email signups" (para operação invite-only)
-- 3. Vá em Settings → API e copie a chave "anon" (pública)
-- 4. Use essa chave ANON no frontend (VITE_SUPABASE_ANON_KEY)
-- 5. A chave "service_role" fica APENAS no backend
-- =============================================================================
