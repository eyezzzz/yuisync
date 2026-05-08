-- =============================================================================
-- YuiSync - Automacao Fiscal Global (PetShop)
-- =============================================================================
-- Objetivo:
-- 1) Centralizar versoes de politica fiscal para petshop
-- 2) Propagar automaticamente para TODOS os clientes (atuais e futuros)
-- 3) Permitir tenant fixar versao (pinned) ou herdar automaticamente (inherit)
--
-- Execute depois de:
-- - database/multi_tenant_instances.sql
-- - database/petshop_advanced_features.sql
-- =============================================================================

begin;

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1) Catalogo global de versoes fiscais
-- ---------------------------------------------------------------------------
create table if not exists public.fiscal_policy_versions (
  id uuid primary key default uuid_generate_v4(),
  module_id text not null default 'petshop',
  version_label text not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'retired')),
  effective_from timestamptz not null default now(),
  rules jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, version_label)
);

create index if not exists idx_fiscal_policy_versions_module_status_effective
  on public.fiscal_policy_versions(module_id, status, effective_from desc);

-- ---------------------------------------------------------------------------
-- 2) Perfil fiscal por tenant (instancia)
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_fiscal_profiles (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null default 'petshop',
  policy_version_id uuid references public.fiscal_policy_versions(id) on delete set null,
  mode text not null default 'inherit'
    check (mode in ('inherit', 'pinned')),
  auto_update boolean not null default true,
  nfe_environment text not null default 'homologacao'
    check (nfe_environment in ('homologacao', 'producao')),
  fiscal_regime text not null default 'simples_nacional',
  issue_series text not null default '1',
  next_invoice_number bigint not null default 1,
  emit_nfce boolean not null default false,
  emit_nfe boolean not null default false,
  emit_nfse boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, module_id)
);

create index if not exists idx_tenant_fiscal_profiles_module_policy
  on public.tenant_fiscal_profiles(module_id, policy_version_id);

-- ---------------------------------------------------------------------------
-- 3) Logs de auditoria fiscal
-- ---------------------------------------------------------------------------
create table if not exists public.fiscal_audit_logs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null default 'petshop',
  invoice_id uuid references public.invoices(id) on delete set null,
  severity text not null default 'info'
    check (severity in ('info', 'warning', 'error')),
  code text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_fiscal_audit_logs_tenant_module_created
  on public.fiscal_audit_logs(tenant_id, module_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4) Funcoes de propagacao global
-- ---------------------------------------------------------------------------
create or replace function public.current_active_fiscal_policy_id(p_module_id text default 'petshop')
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select fpv.id
  from public.fiscal_policy_versions fpv
  where fpv.module_id = p_module_id
    and fpv.status = 'active'
    and fpv.effective_from <= now()
  order by fpv.effective_from desc, fpv.created_at desc
  limit 1;
$$;

create or replace function public.sync_tenant_fiscal_profile(p_tenant_id uuid, p_module_id text default 'petshop')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy_id uuid;
begin
  select public.current_active_fiscal_policy_id(p_module_id)
  into v_policy_id;

  insert into public.tenant_fiscal_profiles (
    tenant_id,
    module_id,
    policy_version_id,
    mode,
    auto_update
  )
  values (
    p_tenant_id,
    p_module_id,
    v_policy_id,
    'inherit',
    true
  )
  on conflict (tenant_id, module_id)
  do update set
    policy_version_id = case
      when public.tenant_fiscal_profiles.mode = 'inherit'
           and public.tenant_fiscal_profiles.auto_update = true
      then excluded.policy_version_id
      else public.tenant_fiscal_profiles.policy_version_id
    end,
    updated_at = now();
end;
$$;

create or replace function public.sync_all_tenant_fiscal_profiles(p_module_id text default 'petshop')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_tenant uuid;
begin
  for v_tenant in
    select t.id
    from public.tenants t
    where t.active = true
  loop
    perform public.sync_tenant_fiscal_profile(v_tenant, p_module_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.apply_active_fiscal_policy_to_tenants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' then
    update public.tenant_fiscal_profiles tfp
    set policy_version_id = new.id,
        updated_at = now()
    where tfp.module_id = new.module_id
      and tfp.mode = 'inherit'
      and tfp.auto_update = true;

    insert into public.tenant_fiscal_profiles (
      tenant_id,
      module_id,
      policy_version_id,
      mode,
      auto_update
    )
    select
      t.id,
      new.module_id,
      new.id,
      'inherit',
      true
    from public.tenants t
    where t.active = true
      and not exists (
        select 1
        from public.tenant_fiscal_profiles tfp
        where tfp.tenant_id = t.id
          and tfp.module_id = new.module_id
      );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_active_fiscal_policy_to_tenants on public.fiscal_policy_versions;
create trigger trg_apply_active_fiscal_policy_to_tenants
  after insert or update of status, effective_from
  on public.fiscal_policy_versions
  for each row
  execute function public.apply_active_fiscal_policy_to_tenants();

create or replace function public.bootstrap_fiscal_profile_for_new_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active = true then
    perform public.sync_tenant_fiscal_profile(new.id, 'petshop');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bootstrap_fiscal_profile_for_new_tenant on public.tenants;
create trigger trg_bootstrap_fiscal_profile_for_new_tenant
  after insert on public.tenants
  for each row
  execute function public.bootstrap_fiscal_profile_for_new_tenant();

-- ---------------------------------------------------------------------------
-- 5) Seed de versao base + backfill para tenants atuais
-- ---------------------------------------------------------------------------
insert into public.fiscal_policy_versions (
  module_id,
  version_label,
  status,
  effective_from,
  rules,
  notes
)
values (
  'petshop',
  '2026.04-base',
  'active',
  now(),
  jsonb_build_object(
    'country', 'BR',
    'invoices', jsonb_build_object(
      'require_due_date', true,
      'allow_zero_value', false,
      'require_customer_reference', true
    ),
    'nfe', jsonb_build_object(
      'required_for_b2b', true,
      'environments', jsonb_build_array('homologacao', 'producao')
    ),
    'compliance', jsonb_build_object(
      'default_audit_level', 'warning'
    )
  ),
  'Politica fiscal base para petshops multi-instancia.'
)
on conflict (module_id, version_label) do nothing;

select public.sync_all_tenant_fiscal_profiles('petshop');

-- ---------------------------------------------------------------------------
-- 6) RLS
-- ---------------------------------------------------------------------------
alter table public.fiscal_policy_versions enable row level security;
alter table public.tenant_fiscal_profiles enable row level security;
alter table public.fiscal_audit_logs enable row level security;

drop policy if exists "Fiscal policy versions select" on public.fiscal_policy_versions;
create policy "Fiscal policy versions select"
on public.fiscal_policy_versions
for select
using (public.has_module_access(module_id));

drop policy if exists "Fiscal policy versions manage global" on public.fiscal_policy_versions;
create policy "Fiscal policy versions manage global"
on public.fiscal_policy_versions
for all
using (public.is_global_admin())
with check (public.is_global_admin());

drop policy if exists "Tenant fiscal profiles select" on public.tenant_fiscal_profiles;
create policy "Tenant fiscal profiles select"
on public.tenant_fiscal_profiles
for select
using (public.has_module_tenant_access(module_id, tenant_id));

drop policy if exists "Tenant fiscal profiles manage admins" on public.tenant_fiscal_profiles;
create policy "Tenant fiscal profiles manage admins"
on public.tenant_fiscal_profiles
for all
using (public.is_module_tenant_admin(module_id, tenant_id))
with check (public.is_module_tenant_admin(module_id, tenant_id));

drop policy if exists "Fiscal audit logs select" on public.fiscal_audit_logs;
create policy "Fiscal audit logs select"
on public.fiscal_audit_logs
for select
using (public.has_module_tenant_access(module_id, tenant_id));

drop policy if exists "Fiscal audit logs insert" on public.fiscal_audit_logs;
create policy "Fiscal audit logs insert"
on public.fiscal_audit_logs
for insert
with check (public.has_module_tenant_access(module_id, tenant_id));

drop policy if exists "Fiscal audit logs delete admin" on public.fiscal_audit_logs;
create policy "Fiscal audit logs delete admin"
on public.fiscal_audit_logs
for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

commit;
