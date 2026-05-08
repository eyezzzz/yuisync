-- =============================================================================
-- YuiSync - Governanca de Planos (IA + custo + margem)
-- =============================================================================
-- Objetivo:
-- 1) Tornar limite de IA explicito por plano (Start/Pro sem IA)
-- 2) Criar controle mensal atomico de consumo de IA por tenant/modulo
-- 3) Preparar base para leitura de custo operacional e margem no painel Comercial
-- =============================================================================

begin;

create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1) Regras oficiais dos planos no catalogo SaaS
-- -----------------------------------------------------------------------------
insert into public.platform_plan_catalog (
  id, name, subtitle, monthly_price, yearly_price, currency, features, limits, badge, highlighted, active, sort_order, metadata
)
values
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

update public.platform_plan_catalog
set
  limits = coalesce(limits, '{}'::jsonb) || '{
    "users": 1,
    "bots": 1,
    "ai_enabled": false,
    "ai_messages": 0,
    "support_cost_brl": 39,
    "infra_cost_brl": 24,
    "ai_unit_cost_brl": 0
  }'::jsonb,
  updated_at = now()
where id = 'yui_start';

update public.platform_plan_catalog
set
  limits = coalesce(limits, '{}'::jsonb) || '{
    "users": 3,
    "bots": 1,
    "ai_enabled": false,
    "ai_messages": 0,
    "support_cost_brl": 69,
    "infra_cost_brl": 31,
    "ai_unit_cost_brl": 0
  }'::jsonb,
  updated_at = now()
where id = 'yui_pro';

update public.platform_plan_catalog
set
  limits = coalesce(limits, '{}'::jsonb) || '{
    "users": 5,
    "bots": 2,
    "ai_enabled": true,
    "ai_messages": 12000,
    "support_cost_brl": 119,
    "infra_cost_brl": 41,
    "ai_unit_cost_brl": 0.02
  }'::jsonb,
  updated_at = now()
where id = 'yui_prime_ia';

update public.platform_plan_catalog
set
  limits = coalesce(limits, '{}'::jsonb) || '{
    "users": 10,
    "bots": 4,
    "ai_enabled": true,
    "ai_messages": 25000,
    "support_cost_brl": 260,
    "infra_cost_brl": 90,
    "ai_unit_cost_brl": 0.018
  }'::jsonb,
  updated_at = now()
where id = 'yui_elite';

-- -----------------------------------------------------------------------------
-- 2) Consumo mensal de IA por tenant/modulo
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_ai_usage_monthly (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null,
  period_month date not null,
  plan_id text not null references public.platform_plan_catalog(id) on delete restrict,
  messages_used integer not null default 0 check (messages_used >= 0),
  messages_limit integer not null default 0 check (messages_limit >= 0),
  last_company_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, module_id, period_month)
);

create index if not exists idx_tenant_ai_usage_plan_period
  on public.tenant_ai_usage_monthly(plan_id, period_month desc);

create index if not exists idx_tenant_ai_usage_scope
  on public.tenant_ai_usage_monthly(tenant_id, module_id, updated_at desc);

create or replace function public.yui_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_tenant_ai_usage_touch_updated_at on public.tenant_ai_usage_monthly;
create trigger trg_tenant_ai_usage_touch_updated_at
before update on public.tenant_ai_usage_monthly
for each row execute function public.yui_touch_updated_at();

alter table public.tenant_ai_usage_monthly enable row level security;

drop policy if exists "Tenant AI usage select" on public.tenant_ai_usage_monthly;
create policy "Tenant AI usage select"
on public.tenant_ai_usage_monthly
for select
using (
  public.is_global_admin()
  or auth.role() = 'service_role'
);

drop policy if exists "Tenant AI usage insert" on public.tenant_ai_usage_monthly;
create policy "Tenant AI usage insert"
on public.tenant_ai_usage_monthly
for insert
with check (
  public.is_global_admin()
  or auth.role() = 'service_role'
);

drop policy if exists "Tenant AI usage update" on public.tenant_ai_usage_monthly;
create policy "Tenant AI usage update"
on public.tenant_ai_usage_monthly
for update
using (
  public.is_global_admin()
  or auth.role() = 'service_role'
)
with check (
  public.is_global_admin()
  or auth.role() = 'service_role'
);

drop policy if exists "Tenant AI usage delete" on public.tenant_ai_usage_monthly;
create policy "Tenant AI usage delete"
on public.tenant_ai_usage_monthly
for delete
using (
  public.is_global_admin()
  or auth.role() = 'service_role'
);

create or replace function public.yui_consume_ai_quota(
  p_tenant_id uuid,
  p_module_id text,
  p_plan_id text,
  p_period_month date,
  p_increment integer default 1,
  p_messages_limit integer default 0,
  p_company_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module_id text := coalesce(nullif(trim(p_module_id), ''), 'petshop');
  v_period_month date := coalesce(
    p_period_month,
    (date_trunc('month', timezone('America/Sao_Paulo', now())))::date
  );
  v_increment integer := greatest(coalesce(p_increment, 1), 1);
  v_limit integer := greatest(coalesce(p_messages_limit, 0), 0);
  v_used integer := 0;
begin
  if p_tenant_id is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'missing_tenant',
      'used', 0,
      'limit', v_limit,
      'remaining', 0,
      'period_month', v_period_month
    );
  end if;

  if v_limit <= 0 then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'ai_disabled',
      'used', 0,
      'limit', v_limit,
      'remaining', 0,
      'period_month', v_period_month
    );
  end if;

  insert into public.tenant_ai_usage_monthly (
    tenant_id,
    module_id,
    period_month,
    plan_id,
    messages_used,
    messages_limit,
    last_company_id
  )
  values (
    p_tenant_id,
    v_module_id,
    v_period_month,
    p_plan_id,
    0,
    v_limit,
    p_company_id
  )
  on conflict (tenant_id, module_id, period_month) do nothing;

  select u.messages_used
    into v_used
  from public.tenant_ai_usage_monthly u
  where u.tenant_id = p_tenant_id
    and u.module_id = v_module_id
    and u.period_month = v_period_month
  for update;

  if v_used + v_increment > v_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'limit_reached',
      'used', v_used,
      'limit', v_limit,
      'remaining', greatest(v_limit - v_used, 0),
      'period_month', v_period_month
    );
  end if;

  v_used := v_used + v_increment;

  update public.tenant_ai_usage_monthly
  set
    plan_id = p_plan_id,
    messages_used = v_used,
    messages_limit = v_limit,
    last_company_id = coalesce(p_company_id, last_company_id),
    updated_at = now()
  where tenant_id = p_tenant_id
    and module_id = v_module_id
    and period_month = v_period_month;

  return jsonb_build_object(
    'allowed', true,
    'reason', 'ok',
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_used, 0),
    'period_month', v_period_month
  );
end;
$$;

grant execute on function public.yui_consume_ai_quota(uuid, text, text, date, integer, integer, uuid)
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) Log da entrega
-- -----------------------------------------------------------------------------
do $$
declare
  v_tenant uuid;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'system_update_logs'
  ) then
    select t.id
      into v_tenant
    from public.tenants t
    where t.active = true
    order by t.created_at asc
    limit 1;

    insert into public.system_update_logs (
      tenant_id,
      module_id,
      category,
      status,
      source,
      title,
      description,
      fingerprint,
      created_at
    )
    values (
      v_tenant,
      'system',
      'comercial',
      'success',
      'changelog',
      'Governanca de IA por plano ativada',
      'Start/Pro sem IA, Prime/Elite com cota mensal e controle atomico de consumo para previsao de custo e margem.',
      'milestone-plan-governance-ai-20260403',
      now()
    )
    on conflict (fingerprint) do nothing;
  end if;
end $$;

commit;
