-- =============================================================================
-- YuiSync Multi-Instance (Tenant) Migration
-- =============================================================================
-- Objetivo:
-- 1) Permitir varias instancias de cliente (Cliente 1, Cliente 2...)
-- 2) Garantir isolamento de dados por tenant + modulo
-- 3) Manter compatibilidade com usuarios/admin ja existentes
--
-- Execute no SQL Editor do Supabase.
-- =============================================================================

begin;

create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1) Estruturas base de tenant
-- -----------------------------------------------------------------------------
create table if not exists public.tenants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists active_tenant_id uuid references public.tenants(id);

create table if not exists public.profile_tenants (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role text not null default 'member',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (profile_id, tenant_id)
);

create index if not exists idx_profile_tenants_profile on public.profile_tenants(profile_id);
create index if not exists idx_profile_tenants_tenant on public.profile_tenants(tenant_id);

-- Tenant default bootstrap
insert into public.tenants (name, slug)
values ('Cliente 1', 'cliente-1')
on conflict (slug) do nothing;

do $$
declare
  v_default_tenant uuid;
begin
  select id into v_default_tenant
  from public.tenants
  order by created_at asc
  limit 1;

  update public.profiles
  set active_tenant_id = coalesce(active_tenant_id, v_default_tenant)
  where active_tenant_id is null;

  insert into public.profile_tenants (profile_id, tenant_id, role, active)
  select
    p.id,
    p.active_tenant_id,
    case when p.role = 'admin' then 'owner' else 'member' end,
    true
  from public.profiles p
  where p.active_tenant_id is not null
  on conflict (profile_id, tenant_id)
  do update set active = true;
end $$;

-- -----------------------------------------------------------------------------
-- 2) tenant_id nas tabelas de negocio
-- -----------------------------------------------------------------------------
alter table public.settings add column if not exists tenant_id uuid references public.tenants(id);
alter table public.clients add column if not exists tenant_id uuid references public.tenants(id);
alter table public.appointments add column if not exists tenant_id uuid references public.tenants(id);
alter table public.products add column if not exists tenant_id uuid references public.tenants(id);
alter table public.sales add column if not exists tenant_id uuid references public.tenants(id);
alter table public.sale_items add column if not exists tenant_id uuid references public.tenants(id);
alter table public.invoices add column if not exists tenant_id uuid references public.tenants(id);
alter table public.billing_settings add column if not exists tenant_id uuid references public.tenants(id);
alter table public.chat_sessions add column if not exists tenant_id uuid references public.tenants(id);
alter table public.accounting_services add column if not exists tenant_id uuid references public.tenants(id);

do $$
declare
  v_default_tenant uuid;
begin
  select id into v_default_tenant
  from public.tenants
  order by created_at asc
  limit 1;

  update public.settings set tenant_id = coalesce(tenant_id, v_default_tenant);
  update public.clients set tenant_id = coalesce(tenant_id, v_default_tenant);
  update public.appointments set tenant_id = coalesce(tenant_id, v_default_tenant);
  update public.products set tenant_id = coalesce(tenant_id, v_default_tenant);
  update public.sales set tenant_id = coalesce(tenant_id, v_default_tenant);
  update public.invoices set tenant_id = coalesce(tenant_id, v_default_tenant);
  update public.billing_settings set tenant_id = coalesce(tenant_id, v_default_tenant);
  update public.chat_sessions set tenant_id = coalesce(tenant_id, v_default_tenant);
  update public.accounting_services set tenant_id = coalesce(tenant_id, v_default_tenant);

  -- sale_items herda tenant de sales
  update public.sale_items si
  set tenant_id = coalesce(si.tenant_id, s.tenant_id, v_default_tenant)
  from public.sales s
  where s.id = si.sale_id;
end $$;

alter table public.settings alter column tenant_id set not null;
alter table public.clients alter column tenant_id set not null;
alter table public.appointments alter column tenant_id set not null;
alter table public.products alter column tenant_id set not null;
alter table public.sales alter column tenant_id set not null;
alter table public.sale_items alter column tenant_id set not null;
alter table public.invoices alter column tenant_id set not null;
alter table public.billing_settings alter column tenant_id set not null;
alter table public.chat_sessions alter column tenant_id set not null;
alter table public.accounting_services alter column tenant_id set not null;

-- settings e billing_settings deixam de ser PK por modulo apenas
alter table public.settings drop constraint if exists settings_pkey;
alter table public.settings add constraint settings_pkey primary key (tenant_id, module_id);

alter table public.billing_settings drop constraint if exists billing_settings_pkey;
alter table public.billing_settings add constraint billing_settings_pkey primary key (tenant_id, module_id);

create index if not exists idx_settings_tenant_module on public.settings(tenant_id, module_id);
create index if not exists idx_clients_tenant_module on public.clients(tenant_id, module_id);
create index if not exists idx_appointments_tenant_module_date on public.appointments(tenant_id, module_id, scheduled_at);
create index if not exists idx_products_tenant_module on public.products(tenant_id, module_id);
create index if not exists idx_sales_tenant_module_created_at on public.sales(tenant_id, module_id, created_at desc);
create index if not exists idx_sale_items_tenant_sale on public.sale_items(tenant_id, sale_id);
create index if not exists idx_invoices_tenant_module_created_at on public.invoices(tenant_id, module_id, created_at desc);
create index if not exists idx_billing_settings_tenant_module on public.billing_settings(tenant_id, module_id);
create index if not exists idx_chat_sessions_tenant_module_last on public.chat_sessions(tenant_id, module_id, last_message_at desc);
create index if not exists idx_accounting_services_tenant_module on public.accounting_services(tenant_id, module_id);

-- -----------------------------------------------------------------------------
-- 3) Trigger para auto-set de tenant_id
-- -----------------------------------------------------------------------------
create or replace function public.resolve_current_tenant_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  select p.active_tenant_id
  into v_tenant
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if v_tenant is not null then
    return v_tenant;
  end if;

  select pt.tenant_id
  into v_tenant
  from public.profile_tenants pt
  where pt.profile_id = auth.uid()
    and pt.active = true
  order by pt.created_at asc
  limit 1;

  if v_tenant is not null then
    return v_tenant;
  end if;

  select t.id
  into v_tenant
  from public.tenants t
  where t.active = true
  order by t.created_at asc
  limit 1;

  return v_tenant;
end;
$$;

create or replace function public.set_tenant_id_from_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tenant_id is null then
    new.tenant_id := public.resolve_current_tenant_id();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_tenant_settings on public.settings;
create trigger trg_set_tenant_settings before insert on public.settings
for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_clients on public.clients;
create trigger trg_set_tenant_clients before insert on public.clients
for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_appointments on public.appointments;
create trigger trg_set_tenant_appointments before insert on public.appointments
for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_products on public.products;
create trigger trg_set_tenant_products before insert on public.products
for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_sales on public.sales;
create trigger trg_set_tenant_sales before insert on public.sales
for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_sale_items on public.sale_items;
create trigger trg_set_tenant_sale_items before insert on public.sale_items
for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_invoices on public.invoices;
create trigger trg_set_tenant_invoices before insert on public.invoices
for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_billing_settings on public.billing_settings;
create trigger trg_set_tenant_billing_settings before insert on public.billing_settings
for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_chat_sessions on public.chat_sessions;
create trigger trg_set_tenant_chat_sessions before insert on public.chat_sessions
for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_accounting_services on public.accounting_services;
create trigger trg_set_tenant_accounting_services before insert on public.accounting_services
for each row execute function public.set_tenant_id_from_context();

-- -----------------------------------------------------------------------------
-- 4) Funcoes de acesso tenant-aware
-- -----------------------------------------------------------------------------
create or replace function public.has_tenant_access(check_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role = 'admin'
  )
  or exists (
    select 1
    from public.profiles p
    join public.profile_tenants pt
      on pt.profile_id = p.id
    where p.id = auth.uid()
      and p.active = true
      and p.role <> 'admin'
      and pt.active = true
      and pt.tenant_id = check_tenant_id
      and check_tenant_id = coalesce(p.active_tenant_id, public.resolve_current_tenant_id())
  );
$$;

create or replace function public.has_module_tenant_access(check_module_id text, check_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_tenant_access(check_tenant_id)
     and public.has_module_access(check_module_id);
$$;

create or replace function public.is_module_tenant_admin(check_module_id text, check_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_tenant_access(check_tenant_id)
     and public.is_module_admin(check_module_id);
$$;

create or replace function public.is_any_module_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and (
        p.role = 'admin'
        or exists (
          select 1
          from jsonb_each_text(coalesce(p.module_permissions, '{}'::jsonb)) as perms(module_id, role_id)
          where perms.role_id like 'admin_%'
        )
      )
  );
$$;

create or replace function public.sale_tenant_id(target_sale_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.sales
  where id = target_sale_id
  limit 1;
$$;

create or replace function public.chat_session_tenant_id(target_session_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.chat_sessions
  where id = target_session_id
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- 5) Policies tenant-aware (tabelas principais)
-- -----------------------------------------------------------------------------
drop policy if exists "Profiles select own" on public.profiles;
drop policy if exists "Profiles update own tenant" on public.profiles;
create policy "Profiles select own"
on public.profiles
for select
using (id = auth.uid());

create policy "Profiles update own tenant"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Profile tenants select own" on public.profile_tenants;
create policy "Profile tenants select own"
on public.profile_tenants
for select
using (
  profile_id = auth.uid()
  or public.has_tenant_access(tenant_id)
);

drop policy if exists "Profile tenants manage admins" on public.profile_tenants;
create policy "Profile tenants manage admins"
on public.profile_tenants
for all
using (public.is_any_module_admin())
with check (public.is_any_module_admin());

drop policy if exists "Tenants select member" on public.tenants;
create policy "Tenants select member"
on public.tenants
for select
using (public.has_tenant_access(id));

drop policy if exists "Tenants manage admins" on public.tenants;
create policy "Tenants manage admins"
on public.tenants
for all
using (public.is_any_module_admin())
with check (public.is_any_module_admin());

-- settings
drop policy if exists "Settings select" on public.settings;
drop policy if exists "Settings insert" on public.settings;
drop policy if exists "Settings update" on public.settings;
drop policy if exists "Settings delete" on public.settings;
create policy "Settings select"
on public.settings for select
using (public.has_module_tenant_access(module_id, tenant_id));
create policy "Settings insert"
on public.settings for insert
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Settings update"
on public.settings for update
using (public.is_module_tenant_admin(module_id, tenant_id))
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Settings delete"
on public.settings for delete
using (public.is_global_admin());

-- clients
drop policy if exists "Clients select" on public.clients;
drop policy if exists "Clients insert" on public.clients;
drop policy if exists "Clients update" on public.clients;
drop policy if exists "Clients delete" on public.clients;
create policy "Clients select"
on public.clients for select
using (public.has_module_tenant_access(module_id, tenant_id));
create policy "Clients insert"
on public.clients for insert
with check (public.has_module_tenant_access(module_id, tenant_id));
create policy "Clients update"
on public.clients for update
using (public.has_module_tenant_access(module_id, tenant_id))
with check (public.has_module_tenant_access(module_id, tenant_id));
create policy "Clients delete"
on public.clients for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

-- appointments
drop policy if exists "Appointments select" on public.appointments;
drop policy if exists "Appointments insert" on public.appointments;
drop policy if exists "Appointments update" on public.appointments;
drop policy if exists "Appointments delete" on public.appointments;
create policy "Appointments select"
on public.appointments for select
using (public.has_module_tenant_access(module_id, tenant_id));
create policy "Appointments insert"
on public.appointments for insert
with check (public.has_module_tenant_access(module_id, tenant_id));
create policy "Appointments update"
on public.appointments for update
using (public.has_module_tenant_access(module_id, tenant_id))
with check (public.has_module_tenant_access(module_id, tenant_id));
create policy "Appointments delete"
on public.appointments for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

-- products
drop policy if exists "Products select" on public.products;
drop policy if exists "Products insert" on public.products;
drop policy if exists "Products update" on public.products;
drop policy if exists "Products delete" on public.products;
create policy "Products select"
on public.products for select
using (public.has_module_tenant_access(module_id, tenant_id));
create policy "Products insert"
on public.products for insert
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Products update"
on public.products for update
using (public.is_module_tenant_admin(module_id, tenant_id))
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Products delete"
on public.products for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

-- sales
drop policy if exists "Sales select" on public.sales;
drop policy if exists "Sales insert" on public.sales;
drop policy if exists "Sales update" on public.sales;
drop policy if exists "Sales delete" on public.sales;
create policy "Sales select"
on public.sales for select
using (public.has_module_tenant_access(module_id, tenant_id));
create policy "Sales insert"
on public.sales for insert
with check (public.has_module_tenant_access(module_id, tenant_id));
create policy "Sales update"
on public.sales for update
using (public.has_module_tenant_access(module_id, tenant_id))
with check (public.has_module_tenant_access(module_id, tenant_id));
create policy "Sales delete"
on public.sales for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

-- sale_items
drop policy if exists "Sale items select" on public.sale_items;
drop policy if exists "Sale items insert" on public.sale_items;
drop policy if exists "Sale items update" on public.sale_items;
drop policy if exists "Sale items delete" on public.sale_items;
create policy "Sale items select"
on public.sale_items for select
using (
  public.has_module_tenant_access(public.sale_module_id(sale_id), public.sale_tenant_id(sale_id))
);
create policy "Sale items insert"
on public.sale_items for insert
with check (
  public.has_module_tenant_access(public.sale_module_id(sale_id), public.sale_tenant_id(sale_id))
);
create policy "Sale items update"
on public.sale_items for update
using (
  public.has_module_tenant_access(public.sale_module_id(sale_id), public.sale_tenant_id(sale_id))
)
with check (
  public.has_module_tenant_access(public.sale_module_id(sale_id), public.sale_tenant_id(sale_id))
);
create policy "Sale items delete"
on public.sale_items for delete
using (
  public.is_module_tenant_admin(public.sale_module_id(sale_id), public.sale_tenant_id(sale_id))
);

-- invoices
drop policy if exists "Invoices select" on public.invoices;
drop policy if exists "Invoices insert" on public.invoices;
drop policy if exists "Invoices update" on public.invoices;
drop policy if exists "Invoices delete" on public.invoices;
create policy "Invoices select"
on public.invoices for select
using (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Invoices insert"
on public.invoices for insert
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Invoices update"
on public.invoices for update
using (public.is_module_tenant_admin(module_id, tenant_id))
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Invoices delete"
on public.invoices for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

-- billing_settings
drop policy if exists "Billing settings select" on public.billing_settings;
drop policy if exists "Billing settings insert" on public.billing_settings;
drop policy if exists "Billing settings update" on public.billing_settings;
drop policy if exists "Billing settings delete" on public.billing_settings;
create policy "Billing settings select"
on public.billing_settings for select
using (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Billing settings insert"
on public.billing_settings for insert
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Billing settings update"
on public.billing_settings for update
using (public.is_module_tenant_admin(module_id, tenant_id))
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Billing settings delete"
on public.billing_settings for delete
using (public.is_global_admin());

-- chat_sessions
drop policy if exists "Chat sessions select" on public.chat_sessions;
drop policy if exists "Chat sessions insert" on public.chat_sessions;
drop policy if exists "Chat sessions update" on public.chat_sessions;
drop policy if exists "Chat sessions delete" on public.chat_sessions;
create policy "Chat sessions select"
on public.chat_sessions for select
using (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Chat sessions insert"
on public.chat_sessions for insert
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Chat sessions update"
on public.chat_sessions for update
using (public.is_module_tenant_admin(module_id, tenant_id))
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Chat sessions delete"
on public.chat_sessions for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

-- chat_messages
drop policy if exists "Chat messages select" on public.chat_messages;
drop policy if exists "Chat messages insert" on public.chat_messages;
drop policy if exists "Chat messages update" on public.chat_messages;
drop policy if exists "Chat messages delete" on public.chat_messages;
create policy "Chat messages select"
on public.chat_messages for select
using (
  public.is_module_tenant_admin(
    public.chat_session_module_id(session_id),
    public.chat_session_tenant_id(session_id)
  )
);
create policy "Chat messages insert"
on public.chat_messages for insert
with check (
  public.is_module_tenant_admin(
    public.chat_session_module_id(session_id),
    public.chat_session_tenant_id(session_id)
  )
);
create policy "Chat messages update"
on public.chat_messages for update
using (
  public.is_module_tenant_admin(
    public.chat_session_module_id(session_id),
    public.chat_session_tenant_id(session_id)
  )
)
with check (
  public.is_module_tenant_admin(
    public.chat_session_module_id(session_id),
    public.chat_session_tenant_id(session_id)
  )
);
create policy "Chat messages delete"
on public.chat_messages for delete
using (
  public.is_module_tenant_admin(
    public.chat_session_module_id(session_id),
    public.chat_session_tenant_id(session_id)
  )
);

-- accounting_services
drop policy if exists "Accounting services select" on public.accounting_services;
drop policy if exists "Accounting services insert" on public.accounting_services;
drop policy if exists "Accounting services update" on public.accounting_services;
drop policy if exists "Accounting services delete" on public.accounting_services;
create policy "Accounting services select"
on public.accounting_services for select
using (public.has_module_tenant_access(module_id, tenant_id));
create policy "Accounting services insert"
on public.accounting_services for insert
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Accounting services update"
on public.accounting_services for update
using (public.is_module_tenant_admin(module_id, tenant_id))
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Accounting services delete"
on public.accounting_services for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

-- -----------------------------------------------------------------------------
-- 6) Tabelas avancadas do petshop com tenant_id
-- -----------------------------------------------------------------------------
alter table public.subscription_plans add column if not exists tenant_id uuid references public.tenants(id);
alter table public.client_subscriptions add column if not exists tenant_id uuid references public.tenants(id);
alter table public.loyalty_settings add column if not exists tenant_id uuid references public.tenants(id);
alter table public.loyalty_points add column if not exists tenant_id uuid references public.tenants(id);
alter table public.commission_rules add column if not exists tenant_id uuid references public.tenants(id);
alter table public.cash_register add column if not exists tenant_id uuid references public.tenants(id);
alter table public.petshop_campaign_logs add column if not exists tenant_id uuid references public.tenants(id);
alter table public.service_delivery_orders add column if not exists tenant_id uuid references public.tenants(id);

do $$
declare
  v_default_tenant uuid;
begin
  select id into v_default_tenant
  from public.tenants
  order by created_at asc
  limit 1;

  update public.subscription_plans set tenant_id = coalesce(tenant_id, v_default_tenant);
  update public.client_subscriptions set tenant_id = coalesce(tenant_id, v_default_tenant);
  update public.loyalty_settings set tenant_id = coalesce(tenant_id, v_default_tenant);
  update public.loyalty_points set tenant_id = coalesce(tenant_id, v_default_tenant);
  update public.commission_rules set tenant_id = coalesce(tenant_id, v_default_tenant);
  update public.cash_register set tenant_id = coalesce(tenant_id, v_default_tenant);
  update public.petshop_campaign_logs set tenant_id = coalesce(tenant_id, v_default_tenant);
  update public.service_delivery_orders set tenant_id = coalesce(tenant_id, v_default_tenant);
end $$;

alter table public.subscription_plans alter column tenant_id set not null;
alter table public.client_subscriptions alter column tenant_id set not null;
alter table public.loyalty_settings alter column tenant_id set not null;
alter table public.loyalty_points alter column tenant_id set not null;
alter table public.commission_rules alter column tenant_id set not null;
alter table public.cash_register alter column tenant_id set not null;
alter table public.petshop_campaign_logs alter column tenant_id set not null;
alter table public.service_delivery_orders alter column tenant_id set not null;

-- loyalty_settings tambem deixa de ser PK so por modulo
alter table public.loyalty_settings drop constraint if exists loyalty_settings_pkey;
alter table public.loyalty_settings add constraint loyalty_settings_pkey primary key (tenant_id, module_id);

create index if not exists idx_subscription_plans_tenant_module on public.subscription_plans(tenant_id, module_id);
create index if not exists idx_client_subscriptions_tenant_module on public.client_subscriptions(tenant_id, module_id);
create index if not exists idx_loyalty_points_tenant_module_client on public.loyalty_points(tenant_id, module_id, client_id);
create index if not exists idx_commission_rules_tenant_module_profile on public.commission_rules(tenant_id, module_id, profile_id);
create index if not exists idx_cash_register_tenant_module_opened_at on public.cash_register(tenant_id, module_id, opened_at desc);
create index if not exists idx_petshop_campaign_logs_tenant_module_created_at on public.petshop_campaign_logs(tenant_id, module_id, created_at desc);
create index if not exists idx_service_delivery_orders_tenant_module_status on public.service_delivery_orders(tenant_id, module_id, status, created_at desc);

drop trigger if exists trg_set_tenant_subscription_plans on public.subscription_plans;
create trigger trg_set_tenant_subscription_plans before insert on public.subscription_plans
for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_client_subscriptions on public.client_subscriptions;
create trigger trg_set_tenant_client_subscriptions before insert on public.client_subscriptions
for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_loyalty_settings on public.loyalty_settings;
create trigger trg_set_tenant_loyalty_settings before insert on public.loyalty_settings
for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_loyalty_points on public.loyalty_points;
create trigger trg_set_tenant_loyalty_points before insert on public.loyalty_points
for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_commission_rules on public.commission_rules;
create trigger trg_set_tenant_commission_rules before insert on public.commission_rules
for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_cash_register on public.cash_register;
create trigger trg_set_tenant_cash_register before insert on public.cash_register
for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_petshop_campaign_logs on public.petshop_campaign_logs;
create trigger trg_set_tenant_petshop_campaign_logs before insert on public.petshop_campaign_logs
for each row execute function public.set_tenant_id_from_context();

drop trigger if exists trg_set_tenant_service_delivery_orders on public.service_delivery_orders;
create trigger trg_set_tenant_service_delivery_orders before insert on public.service_delivery_orders
for each row execute function public.set_tenant_id_from_context();

drop policy if exists "Subscription plans select" on public.subscription_plans;
drop policy if exists "Subscription plans insert" on public.subscription_plans;
drop policy if exists "Subscription plans update" on public.subscription_plans;
drop policy if exists "Subscription plans delete" on public.subscription_plans;
create policy "Subscription plans select"
on public.subscription_plans for select
using (public.has_module_tenant_access(module_id, tenant_id));
create policy "Subscription plans insert"
on public.subscription_plans for insert
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Subscription plans update"
on public.subscription_plans for update
using (public.is_module_tenant_admin(module_id, tenant_id))
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Subscription plans delete"
on public.subscription_plans for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

drop policy if exists "Client subscriptions select" on public.client_subscriptions;
drop policy if exists "Client subscriptions insert" on public.client_subscriptions;
drop policy if exists "Client subscriptions update" on public.client_subscriptions;
drop policy if exists "Client subscriptions delete" on public.client_subscriptions;
create policy "Client subscriptions select"
on public.client_subscriptions for select
using (public.has_module_tenant_access(module_id, tenant_id));
create policy "Client subscriptions insert"
on public.client_subscriptions for insert
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Client subscriptions update"
on public.client_subscriptions for update
using (public.is_module_tenant_admin(module_id, tenant_id))
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Client subscriptions delete"
on public.client_subscriptions for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

drop policy if exists "Loyalty settings select" on public.loyalty_settings;
drop policy if exists "Loyalty settings insert" on public.loyalty_settings;
drop policy if exists "Loyalty settings update" on public.loyalty_settings;
drop policy if exists "Loyalty settings delete" on public.loyalty_settings;
create policy "Loyalty settings select"
on public.loyalty_settings for select
using (public.has_module_tenant_access(module_id, tenant_id));
create policy "Loyalty settings insert"
on public.loyalty_settings for insert
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Loyalty settings update"
on public.loyalty_settings for update
using (public.is_module_tenant_admin(module_id, tenant_id))
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Loyalty settings delete"
on public.loyalty_settings for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

drop policy if exists "Loyalty points select" on public.loyalty_points;
drop policy if exists "Loyalty points insert" on public.loyalty_points;
drop policy if exists "Loyalty points update" on public.loyalty_points;
drop policy if exists "Loyalty points delete" on public.loyalty_points;
create policy "Loyalty points select"
on public.loyalty_points for select
using (public.has_module_tenant_access(module_id, tenant_id));
create policy "Loyalty points insert"
on public.loyalty_points for insert
with check (public.has_module_tenant_access(module_id, tenant_id));
create policy "Loyalty points update"
on public.loyalty_points for update
using (public.is_module_tenant_admin(module_id, tenant_id))
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Loyalty points delete"
on public.loyalty_points for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

drop policy if exists "Commission rules select" on public.commission_rules;
drop policy if exists "Commission rules insert" on public.commission_rules;
drop policy if exists "Commission rules update" on public.commission_rules;
drop policy if exists "Commission rules delete" on public.commission_rules;
create policy "Commission rules select"
on public.commission_rules for select
using (public.has_module_tenant_access(module_id, tenant_id));
create policy "Commission rules insert"
on public.commission_rules for insert
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Commission rules update"
on public.commission_rules for update
using (public.is_module_tenant_admin(module_id, tenant_id))
with check (public.is_module_tenant_admin(module_id, tenant_id));
create policy "Commission rules delete"
on public.commission_rules for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

drop policy if exists "Cash register select" on public.cash_register;
drop policy if exists "Cash register insert" on public.cash_register;
drop policy if exists "Cash register update" on public.cash_register;
drop policy if exists "Cash register delete" on public.cash_register;
create policy "Cash register select"
on public.cash_register for select
using (public.has_module_tenant_access(module_id, tenant_id));
create policy "Cash register insert"
on public.cash_register for insert
with check (public.has_module_tenant_access(module_id, tenant_id));
create policy "Cash register update"
on public.cash_register for update
using (public.has_module_tenant_access(module_id, tenant_id))
with check (public.has_module_tenant_access(module_id, tenant_id));
create policy "Cash register delete"
on public.cash_register for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

drop policy if exists "Petshop campaign logs select" on public.petshop_campaign_logs;
drop policy if exists "Petshop campaign logs insert" on public.petshop_campaign_logs;
drop policy if exists "Petshop campaign logs update" on public.petshop_campaign_logs;
drop policy if exists "Petshop campaign logs delete" on public.petshop_campaign_logs;
create policy "Petshop campaign logs select"
on public.petshop_campaign_logs for select
using (public.has_module_tenant_access(module_id, tenant_id));
create policy "Petshop campaign logs insert"
on public.petshop_campaign_logs for insert
with check (public.has_module_tenant_access(module_id, tenant_id));
create policy "Petshop campaign logs update"
on public.petshop_campaign_logs for update
using (public.has_module_tenant_access(module_id, tenant_id))
with check (public.has_module_tenant_access(module_id, tenant_id));
create policy "Petshop campaign logs delete"
on public.petshop_campaign_logs for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

drop policy if exists "Service delivery orders select" on public.service_delivery_orders;
drop policy if exists "Service delivery orders insert" on public.service_delivery_orders;
drop policy if exists "Service delivery orders update" on public.service_delivery_orders;
drop policy if exists "Service delivery orders delete" on public.service_delivery_orders;
create policy "Service delivery orders select"
on public.service_delivery_orders for select
using (public.has_module_tenant_access(module_id, tenant_id));
create policy "Service delivery orders insert"
on public.service_delivery_orders for insert
with check (public.has_module_tenant_access(module_id, tenant_id));
create policy "Service delivery orders update"
on public.service_delivery_orders for update
using (public.has_module_tenant_access(module_id, tenant_id))
with check (public.has_module_tenant_access(module_id, tenant_id));
create policy "Service delivery orders delete"
on public.service_delivery_orders for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

-- -----------------------------------------------------------------------------
-- 7) Ajuste de triggers/funcoes de features avancadas para tenant_id
-- -----------------------------------------------------------------------------
create or replace function public.award_loyalty_for_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points integer := 0;
  v_expiry_days integer := 365;
  v_points_per_real numeric := 1;
  v_points_per_service integer := 10;
begin
  if new.client_id is null or coalesce(new.status, '') <> 'concluido' then
    return new;
  end if;

  if exists (
    select 1
    from public.loyalty_points
    where module_id = new.module_id
      and tenant_id = new.tenant_id
      and reference_id = new.id
      and reason = 'compra'
  ) then
    return new;
  end if;

  select
    coalesce(points_per_real, 1),
    coalesce(points_per_service, 10),
    coalesce(expiry_days, 365)
  into
    v_points_per_real,
    v_points_per_service,
    v_expiry_days
  from public.loyalty_settings
  where module_id = new.module_id
    and tenant_id = new.tenant_id;

  v_points := floor(coalesce(new.total_price, 0) * v_points_per_real);
  if coalesce(new.source, '') = 'agenda' then
    v_points := v_points + v_points_per_service;
  end if;

  if v_points <> 0 then
    insert into public.loyalty_points (
      tenant_id,
      client_id,
      module_id,
      points,
      reason,
      reference_id,
      expires_at
    )
    values (
      new.tenant_id,
      new.client_id,
      new.module_id,
      v_points,
      'compra',
      new.id,
      current_date + v_expiry_days
    );
  end if;

  return new;
end;
$$;

create or replace function public.sync_invoice_for_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.status, '') <> 'concluido' then
    return new;
  end if;

  if exists (
    select 1
    from public.invoices
    where sale_id = new.id
  ) then
    return new;
  end if;

  insert into public.invoices (
    tenant_id,
    module_id,
    sale_id,
    status,
    amount,
    due_date,
    paid_at,
    notes,
    customer_phone,
    updated_at
  )
  values (
    new.tenant_id,
    new.module_id,
    new.id,
    'paid',
    coalesce(new.total_price, 0),
    current_date,
    coalesce(new.created_at, now()),
    concat('Venda PDV #', left(new.id::text, 8), coalesce(' - ' || new.customer_name, '')),
    new.customer_phone,
    now()
  );

  return new;
end;
$$;

create or replace function public.sync_service_order_for_whatsapp_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.clients%rowtype;
  v_session_id uuid;
  v_order_type text;
  v_status text;
begin
  if coalesce(new.source, '') <> 'whatsapp' then
    return new;
  end if;

  v_order_type := case
    when coalesce(new.fulfillment_type, 'balcao') = 'servico' then 'servico'
    when coalesce(new.fulfillment_type, 'balcao') = 'entrega' then 'entrega'
    else null
  end;

  if v_order_type is null then
    return new;
  end if;

  if exists (
    select 1
    from public.service_delivery_orders
    where sale_id = new.id
  ) then
    return new;
  end if;

  if new.client_id is not null then
    select *
    into v_client
    from public.clients
    where id = new.client_id;
  end if;

  select id
  into v_session_id
  from public.chat_sessions
  where tenant_id = new.tenant_id
    and module_id = new.module_id
    and (
      (new.client_id is not null and client_id = new.client_id)
      or (new.customer_phone is not null and customer_phone = new.customer_phone)
    )
  order by last_message_at desc
  limit 1;

  v_status := case
    when v_order_type = 'servico' then 'agendado'
    else 'pendente'
  end;

  insert into public.service_delivery_orders (
    tenant_id,
    module_id,
    sale_id,
    client_id,
    session_id,
    source,
    order_type,
    status,
    delivery_address,
    delivery_neighborhood,
    delivery_city,
    contact_phone,
    notes,
    updated_at
  )
  values (
    new.tenant_id,
    new.module_id,
    new.id,
    new.client_id,
    v_session_id,
    'whatsapp',
    v_order_type,
    v_status,
    coalesce(v_client.address, null),
    coalesce(v_client.neighborhood, null),
    coalesce(v_client.city, null),
    coalesce(new.customer_phone, v_client.phone),
    new.notes,
    now()
  );

  return new;
end;
$$;

commit;
