-- =============================================================================
-- YuiSync - Comercial + Onboarding Foundation
-- =============================================================================
-- Objetivo:
-- 1) Catalogo global de planos SaaS (Start / Pro / Prime IA / Elite)
-- 2) Assinatura por tenant + modulo (pronto para gateway automatico)
-- 3) Trilha de onboarding persistida por tenant
-- 4) Bootstrap automatico para novos negocios criados no hub
--
-- Execute no SQL Editor do Supabase.
-- =============================================================================

begin;

create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1) Catalogo de planos da plataforma
-- -----------------------------------------------------------------------------
create table if not exists public.platform_plan_catalog (
  id text primary key,
  name text not null,
  subtitle text,
  monthly_price numeric(10,2) not null check (monthly_price >= 0),
  yearly_price numeric(10,2) check (yearly_price is null or yearly_price >= 0),
  currency text not null default 'BRL',
  features jsonb not null default '[]'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  badge text,
  highlighted boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_platform_plan_catalog_active_sort
  on public.platform_plan_catalog(active, sort_order, monthly_price);

-- -----------------------------------------------------------------------------
-- 2) Assinatura por tenant/modulo (petshop inicial)
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null default 'petshop',
  plan_id text not null references public.platform_plan_catalog(id),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'paused', 'past_due', 'canceled')),
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'yearly')),
  contracted_price numeric(10,2),
  currency text not null default 'BRL',
  trial_ends_at date,
  current_period_start date,
  next_billing_at date,
  auto_charge_enabled boolean not null default false,
  payment_provider text,
  provider_customer_id text,
  provider_subscription_id text,
  notes text,
  managed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, module_id)
);

create index if not exists idx_tenant_subscriptions_module_status
  on public.tenant_subscriptions(module_id, status, next_billing_at);

create index if not exists idx_tenant_subscriptions_provider
  on public.tenant_subscriptions(payment_provider, provider_subscription_id);

-- -----------------------------------------------------------------------------
-- 3) Onboarding por tenant/modulo
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_onboarding (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null default 'petshop',
  status text not null default 'in_progress'
    check (status in ('pending', 'in_progress', 'blocked', 'completed')),
  stage text not null default 'empresa'
    check (stage in ('empresa', 'plano', 'modulos', 'admin', 'operacao', 'fiscal', 'integracoes', 'concluido')),
  progress smallint not null default 0 check (progress >= 0 and progress <= 100),
  checklist jsonb not null default '{
    "empresa": false,
    "plano": false,
    "modulos": false,
    "admin": false,
    "operacao": false,
    "fiscal": false,
    "integracoes": false
  }'::jsonb,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, module_id)
);

create index if not exists idx_tenant_onboarding_module_status
  on public.tenant_onboarding(module_id, status, progress);

-- -----------------------------------------------------------------------------
-- 4) Trigger de updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_platform_plan_catalog_updated_at on public.platform_plan_catalog;
create trigger trg_platform_plan_catalog_updated_at
before update on public.platform_plan_catalog
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_tenant_subscriptions_updated_at on public.tenant_subscriptions;
create trigger trg_tenant_subscriptions_updated_at
before update on public.tenant_subscriptions
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_tenant_onboarding_updated_at on public.tenant_onboarding;
create trigger trg_tenant_onboarding_updated_at
before update on public.tenant_onboarding
for each row execute function public.set_updated_at_column();

-- -----------------------------------------------------------------------------
-- 5) RLS
-- -----------------------------------------------------------------------------
alter table public.platform_plan_catalog enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.tenant_onboarding enable row level security;

drop policy if exists "Platform plans select" on public.platform_plan_catalog;
create policy "Platform plans select"
on public.platform_plan_catalog
for select
using (public.is_any_module_admin());

drop policy if exists "Platform plans insert" on public.platform_plan_catalog;
create policy "Platform plans insert"
on public.platform_plan_catalog
for insert
with check (public.is_global_admin());

drop policy if exists "Platform plans update" on public.platform_plan_catalog;
create policy "Platform plans update"
on public.platform_plan_catalog
for update
using (public.is_global_admin())
with check (public.is_global_admin());

drop policy if exists "Platform plans delete" on public.platform_plan_catalog;
create policy "Platform plans delete"
on public.platform_plan_catalog
for delete
using (public.is_global_admin());

drop policy if exists "Tenant subscriptions select" on public.tenant_subscriptions;
create policy "Tenant subscriptions select"
on public.tenant_subscriptions
for select
using (
  public.is_global_admin()
  or public.has_tenant_access(tenant_id)
);

drop policy if exists "Tenant subscriptions insert" on public.tenant_subscriptions;
create policy "Tenant subscriptions insert"
on public.tenant_subscriptions
for insert
with check (
  public.is_global_admin()
  or public.is_module_tenant_admin(module_id, tenant_id)
);

drop policy if exists "Tenant subscriptions update" on public.tenant_subscriptions;
create policy "Tenant subscriptions update"
on public.tenant_subscriptions
for update
using (
  public.is_global_admin()
  or public.is_module_tenant_admin(module_id, tenant_id)
)
with check (
  public.is_global_admin()
  or public.is_module_tenant_admin(module_id, tenant_id)
);

drop policy if exists "Tenant subscriptions delete" on public.tenant_subscriptions;
create policy "Tenant subscriptions delete"
on public.tenant_subscriptions
for delete
using (
  public.is_global_admin()
  or public.is_module_tenant_admin(module_id, tenant_id)
);

drop policy if exists "Tenant onboarding select" on public.tenant_onboarding;
create policy "Tenant onboarding select"
on public.tenant_onboarding
for select
using (
  public.is_global_admin()
  or public.has_tenant_access(tenant_id)
);

drop policy if exists "Tenant onboarding insert" on public.tenant_onboarding;
create policy "Tenant onboarding insert"
on public.tenant_onboarding
for insert
with check (
  public.is_global_admin()
  or public.is_module_tenant_admin(module_id, tenant_id)
);

drop policy if exists "Tenant onboarding update" on public.tenant_onboarding;
create policy "Tenant onboarding update"
on public.tenant_onboarding
for update
using (
  public.is_global_admin()
  or public.is_module_tenant_admin(module_id, tenant_id)
)
with check (
  public.is_global_admin()
  or public.is_module_tenant_admin(module_id, tenant_id)
);

drop policy if exists "Tenant onboarding delete" on public.tenant_onboarding;
create policy "Tenant onboarding delete"
on public.tenant_onboarding
for delete
using (
  public.is_global_admin()
  or public.is_module_tenant_admin(module_id, tenant_id)
);

-- -----------------------------------------------------------------------------
-- 6) Seed dos planos oficiais
-- -----------------------------------------------------------------------------
insert into public.platform_plan_catalog (
  id,
  name,
  subtitle,
  monthly_price,
  yearly_price,
  currency,
  features,
  limits,
  badge,
  highlighted,
  active,
  sort_order,
  metadata
)
values
  (
    'yui_start',
    'Yui Start',
    'Operacao essencial para petshops em crescimento',
    197.00,
    1970.00,
    'BRL',
    '[
      "Agenda e clientes/pets",
      "PDV e estoque",
      "Caixa e relatorios base",
      "Suporte padrao"
    ]'::jsonb,
    '{
      "users": 1,
      "bots": 1,
      "ai_enabled": false,
      "ai_messages": 0,
      "support_cost_brl": 39,
      "infra_cost_brl": 24,
      "ai_unit_cost_brl": 0
    }'::jsonb,
    null,
    false,
    true,
    10,
    '{"target":"small"}'::jsonb
  ),
  (
    'yui_pro',
    'Yui Pro',
    'Fiscal + atendimento integrado para operacao profissional',
    347.00,
    3470.00,
    'BRL',
    '[
      "Tudo do Start",
      "Chat integrado e ordens/entrega",
      "Configuracao fiscal por empresa",
      "Automacoes operacionais"
    ]'::jsonb,
    '{
      "users": 3,
      "bots": 1,
      "ai_enabled": false,
      "ai_messages": 0,
      "support_cost_brl": 69,
      "infra_cost_brl": 31,
      "ai_unit_cost_brl": 0
    }'::jsonb,
    'Mais vendido',
    true,
    true,
    20,
    '{"target":"growth"}'::jsonb
  ),
  (
    'yui_prime_ia',
    'Yui Prime IA',
    'Escala com IA, automacoes e inteligencia operacional',
    597.00,
    5970.00,
    'BRL',
    '[
      "Tudo do Pro",
      "IA para atendimento e sugestoes",
      "Campanhas de reengajamento",
      "Suporte prioritario"
    ]'::jsonb,
    '{
      "users": 5,
      "bots": 2,
      "ai_enabled": true,
      "ai_messages": 12000,
      "support_cost_brl": 119,
      "infra_cost_brl": 41,
      "ai_unit_cost_brl": 0.02
    }'::jsonb,
    'Premium IA',
    false,
    true,
    30,
    '{"target":"scale"}'::jsonb
  ),
  (
    'yui_elite',
    'Yui Elite',
    'Atendimento personalizado com automacoes sob medida',
    0.00,
    0.00,
    'BRL',
    '[
      "Tudo do Prime IA",
      "Especialista dedicado",
      "SLA prioritario",
      "Canal direto com a central"
    ]'::jsonb,
    '{
      "users": 10,
      "bots": 4,
      "ai_enabled": true,
      "ai_messages": 25000,
      "support_cost_brl": 260,
      "infra_cost_brl": 90,
      "ai_unit_cost_brl": 0.018
    }'::jsonb,
    'Concierge',
    false,
    true,
    40,
    '{"target":"enterprise","contract":"sob_consulta"}'::jsonb
  )
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 7) Bootstrap para tenants existentes
-- -----------------------------------------------------------------------------
insert into public.tenant_subscriptions (
  tenant_id,
  module_id,
  plan_id,
  status,
  billing_cycle,
  contracted_price,
  currency,
  trial_ends_at,
  current_period_start,
  next_billing_at,
  auto_charge_enabled,
  notes
)
select
  t.id,
  'petshop',
  p.id,
  'trialing',
  'monthly',
  p.monthly_price,
  p.currency,
  current_date + 7,
  current_date,
  current_date + 7,
  false,
  'Bootstrap automatico inicial'
from public.tenants t
join public.platform_plan_catalog p
  on p.id = 'yui_start'
left join public.tenant_subscriptions s
  on s.tenant_id = t.id
 and s.module_id = 'petshop'
where t.active = true
  and s.tenant_id is null;

insert into public.tenant_onboarding (
  tenant_id,
  module_id,
  status,
  stage,
  progress,
  checklist
)
select
  t.id,
  'petshop',
  'pending',
  'empresa',
  5,
  '{
    "empresa": false,
    "plano": false,
    "modulos": false,
    "admin": false,
    "operacao": false,
    "fiscal": false,
    "integracoes": false
  }'::jsonb
from public.tenants t
left join public.tenant_onboarding o
  on o.tenant_id = t.id
 and o.module_id = 'petshop'
where t.active = true
  and o.tenant_id is null;

-- -----------------------------------------------------------------------------
-- 8) Bootstrap automatico para novos tenants
-- -----------------------------------------------------------------------------
create or replace function public.bootstrap_commercial_for_new_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_default_plan_id text;
  v_default_plan_price numeric(10,2);
  v_default_currency text;
begin
  select id, monthly_price, currency
  into v_default_plan_id, v_default_plan_price, v_default_currency
  from public.platform_plan_catalog
  where active = true
  order by sort_order asc, monthly_price asc
  limit 1;

  if v_default_plan_id is null then
    return new;
  end if;

  insert into public.tenant_subscriptions (
    tenant_id,
    module_id,
    plan_id,
    status,
    billing_cycle,
    contracted_price,
    currency,
    trial_ends_at,
    current_period_start,
    next_billing_at,
    auto_charge_enabled,
    notes
  )
  values (
    new.id,
    'petshop',
    v_default_plan_id,
    'trialing',
    'monthly',
    v_default_plan_price,
    coalesce(v_default_currency, 'BRL'),
    current_date + 7,
    current_date,
    current_date + 7,
    false,
    'Bootstrap automatico ao criar tenant'
  )
  on conflict (tenant_id, module_id) do nothing;

  insert into public.tenant_onboarding (
    tenant_id,
    module_id,
    status,
    stage,
    progress,
    checklist
  )
  values (
    new.id,
    'petshop',
    'pending',
    'empresa',
    5,
    '{
      "empresa": false,
      "plano": false,
      "modulos": false,
      "admin": false,
      "operacao": false,
      "fiscal": false,
      "integracoes": false
    }'::jsonb
  )
  on conflict (tenant_id, module_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_bootstrap_commercial_tenant on public.tenants;
create trigger trg_bootstrap_commercial_tenant
after insert on public.tenants
for each row execute function public.bootstrap_commercial_for_new_tenant();

commit;
