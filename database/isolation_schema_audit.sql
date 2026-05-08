-- =============================================================================
-- YuiSync Isolation Schema Audit
-- =============================================================================
-- Objetivo: validar rapidamente se a base multi-instancia foi aplicada.
-- Rode no SQL Editor do Supabase.
-- =============================================================================

-- 1) Tabelas obrigatorias de tenant
select
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('tenants', 'profile_tenants')
order by table_name;

-- 2) Coluna tenant_id nas tabelas de negocio
with required_tables as (
  select unnest(array[
    'settings',
    'clients',
    'appointments',
    'products',
    'sales',
    'sale_items',
    'invoices',
    'billing_settings',
    'chat_sessions',
    'accounting_services',
    'subscription_plans',
    'client_subscriptions',
    'loyalty_settings',
    'loyalty_points',
    'commission_rules',
    'cash_register',
    'petshop_campaign_logs',
    'service_delivery_orders'
  ]) as table_name
)
select
  rt.table_name,
  exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = rt.table_name
      and c.column_name = 'tenant_id'
  ) as has_tenant_id
from required_tables rt
order by rt.table_name;

-- 3) Funcoes de isolamento tenant-aware
select
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'resolve_current_tenant_id',
    'set_tenant_id_from_context',
    'has_tenant_access',
    'has_module_tenant_access',
    'is_module_tenant_admin'
  )
order by p.proname;

-- 4) Policies por tenant (amostra principal)
select
  schemaname,
  tablename,
  policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('clients', 'sales', 'settings', 'chat_sessions', 'subscription_plans')
order by tablename, policyname;
