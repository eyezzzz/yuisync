-- =============================================================================
-- YuiSync - Governanca Operacional (Alertas + Rentabilidade)
-- =============================================================================
-- Objetivo:
-- 1) Gerar alertas operacionais por tenant/modulo (quota IA, cobranca, onboarding)
-- 2) Criar visao mensal de margem estimada por contrato
-- 3) Expor funcao para rodar auditoria manual no painel comercial
-- =============================================================================

begin;

create extension if not exists "uuid-ossp";

create table if not exists public.tenant_governance_alerts (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null,
  alert_type text not null,
  severity text not null default 'warning'
    check (severity in ('info', 'warning', 'high', 'critical')),
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved')),
  title text not null,
  description text,
  payload jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fingerprint)
);

create index if not exists idx_tenant_governance_alerts_scope
  on public.tenant_governance_alerts(tenant_id, module_id, status, severity, updated_at desc);

create index if not exists idx_tenant_governance_alerts_module
  on public.tenant_governance_alerts(module_id, status, updated_at desc);

create or replace function public.yui_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_tenant_governance_alerts_touch on public.tenant_governance_alerts;
create trigger trg_tenant_governance_alerts_touch
before update on public.tenant_governance_alerts
for each row execute function public.yui_touch_updated_at();

alter table public.tenant_governance_alerts enable row level security;

drop policy if exists "Tenant governance alerts select" on public.tenant_governance_alerts;
create policy "Tenant governance alerts select"
on public.tenant_governance_alerts
for select
using (
  public.is_global_admin()
  or public.has_tenant_access(tenant_id)
  or auth.role() = 'service_role'
);

drop policy if exists "Tenant governance alerts insert" on public.tenant_governance_alerts;
create policy "Tenant governance alerts insert"
on public.tenant_governance_alerts
for insert
with check (
  public.is_global_admin()
  or auth.role() = 'service_role'
);

drop policy if exists "Tenant governance alerts update" on public.tenant_governance_alerts;
create policy "Tenant governance alerts update"
on public.tenant_governance_alerts
for update
using (
  public.is_global_admin()
  or auth.role() = 'service_role'
)
with check (
  public.is_global_admin()
  or auth.role() = 'service_role'
);

drop policy if exists "Tenant governance alerts delete" on public.tenant_governance_alerts;
create policy "Tenant governance alerts delete"
on public.tenant_governance_alerts
for delete
using (
  public.is_global_admin()
  or auth.role() = 'service_role'
);

create or replace view public.vw_tenant_profitability_monthly as
with month_ref as (
  select (date_trunc('month', timezone('America/Sao_Paulo', now())))::date as period_month
),
subscription_base as (
  select
    s.tenant_id,
    s.module_id,
    s.plan_id,
    s.status,
    s.billing_cycle,
    coalesce(s.contracted_price, 0)::numeric(10,2) as contracted_price,
    case
      when s.billing_cycle = 'yearly' then (coalesce(s.contracted_price, 0) / 12.0)::numeric(10,2)
      else coalesce(s.contracted_price, 0)::numeric(10,2)
    end as mrr_equivalent
  from public.tenant_subscriptions s
  where s.status in ('active', 'trialing')
),
plan_limits as (
  select
    p.id as plan_id,
    p.name as plan_name,
    coalesce((p.limits->>'support_cost_brl')::numeric, 0)::numeric(10,2) as support_cost_brl,
    coalesce((p.limits->>'infra_cost_brl')::numeric, 0)::numeric(10,2) as infra_cost_brl,
    coalesce((p.limits->>'ai_unit_cost_brl')::numeric, 0)::numeric(10,4) as ai_unit_cost_brl
  from public.platform_plan_catalog p
),
usage_ref as (
  select
    u.tenant_id,
    u.module_id,
    u.period_month,
    coalesce(u.messages_used, 0) as messages_used,
    coalesce(u.messages_limit, 0) as messages_limit
  from public.tenant_ai_usage_monthly u
)
select
  b.tenant_id,
  b.module_id,
  b.plan_id,
  p.plan_name,
  b.status,
  b.billing_cycle,
  m.period_month,
  b.contracted_price,
  b.mrr_equivalent,
  coalesce(u.messages_used, 0) as messages_used,
  coalesce(u.messages_limit, 0) as messages_limit,
  p.support_cost_brl,
  p.infra_cost_brl,
  (coalesce(u.messages_used, 0) * p.ai_unit_cost_brl)::numeric(10,2) as ai_cost_brl,
  (p.support_cost_brl + p.infra_cost_brl + (coalesce(u.messages_used, 0) * p.ai_unit_cost_brl))::numeric(10,2) as estimated_total_cost_brl,
  (b.mrr_equivalent - (p.support_cost_brl + p.infra_cost_brl + (coalesce(u.messages_used, 0) * p.ai_unit_cost_brl)))::numeric(10,2) as estimated_margin_brl
from subscription_base b
join month_ref m on true
left join plan_limits p on p.plan_id = b.plan_id
left join usage_ref u
  on u.tenant_id = b.tenant_id
 and u.module_id = b.module_id
 and u.period_month = m.period_month;

create or replace function public.yui_refresh_governance_alerts(
  p_module_id text default 'petshop'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module text := coalesce(nullif(trim(p_module_id), ''), 'petshop');
  v_today date := (timezone('America/Sao_Paulo', now()))::date;
  v_month_start date := (date_trunc('month', timezone('America/Sao_Paulo', now())))::date;
  v_open integer := 0;
begin
  -- 1) Quota de IA proxima do limite
  insert into public.tenant_governance_alerts (
    tenant_id,
    module_id,
    alert_type,
    severity,
    status,
    title,
    description,
    payload,
    fingerprint
  )
  select
    s.tenant_id,
    s.module_id,
    'ai_quota',
    case
      when coalesce(u.messages_used, 0) >= v.ai_limit then 'critical'
      when coalesce(u.messages_used, 0) >= greatest((v.ai_limit * 0.9)::int, 1) then 'high'
      else 'warning'
    end as severity,
    'open',
    'Consumo de IA acima do limite seguro',
    format(
      'Tenant %s esta com uso de IA em %s/%s no mes %s.',
      s.tenant_id::text,
      coalesce(u.messages_used, 0),
      v.ai_limit,
      v_month_start::text
    ),
    jsonb_build_object(
      'messages_used', coalesce(u.messages_used, 0),
      'messages_limit', v.ai_limit,
      'period_month', v_month_start
    ),
    format('ai_quota:%s:%s:%s', s.tenant_id::text, v_module, v_month_start::text)
  from public.tenant_subscriptions s
  join lateral (
    select
      coalesce((p.limits->>'ai_enabled')::boolean, false) as ai_enabled,
      greatest(coalesce((p.limits->>'ai_messages')::int, 0), 0) as ai_limit
    from public.platform_plan_catalog p
    where p.id = s.plan_id
  ) v on true
  left join public.tenant_ai_usage_monthly u
    on u.tenant_id = s.tenant_id
   and u.module_id = s.module_id
   and u.period_month = v_month_start
  where s.module_id = v_module
    and s.status in ('active', 'trialing')
    and v.ai_enabled = true
    and v.ai_limit > 0
    and coalesce(u.messages_used, 0) >= greatest((v.ai_limit * 0.8)::int, 1)
  on conflict (fingerprint) do update
  set
    severity = excluded.severity,
    status = 'open',
    title = excluded.title,
    description = excluded.description,
    payload = excluded.payload,
    resolved_at = null,
    updated_at = now();

  -- 2) Cobranca vencendo ou vencida
  insert into public.tenant_governance_alerts (
    tenant_id,
    module_id,
    alert_type,
    severity,
    status,
    title,
    description,
    payload,
    fingerprint
  )
  select
    s.tenant_id,
    s.module_id,
    'billing_due',
    case when s.next_billing_at < v_today then 'critical' else 'warning' end,
    'open',
    case when s.next_billing_at < v_today then 'Cobranca em atraso' else 'Cobranca proxima' end,
    format(
      'Assinatura %s com proxima cobranca em %s.',
      s.plan_id,
      s.next_billing_at::text
    ),
    jsonb_build_object(
      'next_billing_at', s.next_billing_at,
      'status', s.status,
      'plan_id', s.plan_id
    ),
    format('billing_due:%s:%s:%s', s.tenant_id::text, v_module, s.next_billing_at::text)
  from public.tenant_subscriptions s
  where s.module_id = v_module
    and s.status in ('active', 'trialing', 'past_due')
    and s.next_billing_at is not null
    and s.next_billing_at <= (v_today + 7)
  on conflict (fingerprint) do update
  set
    severity = excluded.severity,
    status = 'open',
    title = excluded.title,
    description = excluded.description,
    payload = excluded.payload,
    resolved_at = null,
    updated_at = now();

  -- 3) Onboarding bloqueado
  insert into public.tenant_governance_alerts (
    tenant_id,
    module_id,
    alert_type,
    severity,
    status,
    title,
    description,
    payload,
    fingerprint
  )
  select
    o.tenant_id,
    o.module_id,
    'onboarding_blocked',
    'high',
    'open',
    'Onboarding bloqueado',
    format(
      'Tenant %s esta com onboarding bloqueado na etapa %s.',
      o.tenant_id::text,
      o.stage
    ),
    jsonb_build_object(
      'stage', o.stage,
      'progress', o.progress
    ),
    format('onboarding_blocked:%s:%s', o.tenant_id::text, v_module)
  from public.tenant_onboarding o
  where o.module_id = v_module
    and o.status = 'blocked'
  on conflict (fingerprint) do update
  set
    severity = excluded.severity,
    status = 'open',
    title = excluded.title,
    description = excluded.description,
    payload = excluded.payload,
    resolved_at = null,
    updated_at = now();

  -- Resolve alertas antigos que nao se aplicam mais
  update public.tenant_governance_alerts a
  set
    status = 'resolved',
    resolved_at = now(),
    updated_at = now()
  where a.module_id = v_module
    and a.status = 'open'
    and (
      (a.alert_type = 'ai_quota' and not exists (
        select 1
        from public.tenant_subscriptions s
        join lateral (
          select
            coalesce((p.limits->>'ai_enabled')::boolean, false) as ai_enabled,
            greatest(coalesce((p.limits->>'ai_messages')::int, 0), 0) as ai_limit
          from public.platform_plan_catalog p
          where p.id = s.plan_id
        ) v on true
        left join public.tenant_ai_usage_monthly u
          on u.tenant_id = s.tenant_id
         and u.module_id = s.module_id
         and u.period_month = v_month_start
        where s.module_id = v_module
          and s.status in ('active', 'trialing')
          and v.ai_enabled = true
          and v.ai_limit > 0
          and coalesce(u.messages_used, 0) >= greatest((v.ai_limit * 0.8)::int, 1)
          and a.fingerprint = format('ai_quota:%s:%s:%s', s.tenant_id::text, v_module, v_month_start::text)
      ))
      or (a.alert_type = 'billing_due' and not exists (
        select 1
        from public.tenant_subscriptions s
        where s.module_id = v_module
          and s.status in ('active', 'trialing', 'past_due')
          and s.next_billing_at is not null
          and s.next_billing_at <= (v_today + 7)
          and a.fingerprint = format('billing_due:%s:%s:%s', s.tenant_id::text, v_module, s.next_billing_at::text)
      ))
      or (a.alert_type = 'onboarding_blocked' and not exists (
        select 1
        from public.tenant_onboarding o
        where o.module_id = v_module
          and o.status = 'blocked'
          and a.fingerprint = format('onboarding_blocked:%s:%s', o.tenant_id::text, v_module)
      ))
    );

  select count(*)
    into v_open
  from public.tenant_governance_alerts a
  where a.module_id = v_module
    and a.status = 'open';

  return jsonb_build_object(
    'module_id', v_module,
    'period_month', v_month_start,
    'open_alerts', v_open
  );
end;
$$;

grant execute on function public.yui_refresh_governance_alerts(text) to authenticated, service_role;

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
      'Governanca operacional com alertas automaticos',
      'Quota de IA, cobranca e bloqueios de onboarding agora geram alertas centralizados para acao rapida no Comercial.',
      'milestone-governance-alerts-20260404',
      now()
    )
    on conflict (fingerprint) do nothing;
  end if;
end $$;

commit;
