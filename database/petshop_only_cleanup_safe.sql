-- ============================================================================
-- YuiSync - PetShop Only Cleanup (SAFE MODE)
-- ----------------------------------------------------------------------------
-- Objetivo:
--   1) Limpar dados de modulos que nao sejam petshop/system nas tabelas com module_id
--   2) Sanitizar perfis para permissao apenas no petshop
--   3) Desativar canais de bot nao-petshop
--   4) Preservar estruturas multi-tenant (tenants/profile_tenants/active_tenant_id)
--
-- Observacao:
--   Nao realiza DROP de tabelas, colunas, constraints ou policies.
-- ============================================================================

begin;

do $$
declare
  target_table text;
  target_tables text[] := array[
    'settings',
    'clients',
    'appointments',
    'products',
    'sales',
    'invoices',
    'billing_settings',
    'chat_sessions',
    'accounting_services',
    'system_update_logs',
    'support_tickets',
    'support_messages',
    'companies',
    'tenant_fiscal_profiles',
    'subscription_plans',
    'client_subscriptions',
    'loyalty_settings',
    'loyalty_points',
    'commission_rules',
    'cash_register',
    'petshop_campaign_logs',
    'service_delivery_orders'
  ];
begin
  foreach target_table in array target_tables loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = target_table
        and column_name = 'module_id'
    ) then
      execute format(
        'delete from public.%I where module_id not in (''petshop'', ''system'')',
        target_table
      );
    end if;
  end loop;
end $$;

-- Remove mensagens orfas cuja session pertence a modulo removido (quando existir relacao).
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'chat_messages'
  ) then
    delete from public.chat_messages cm
    where not exists (
      select 1
      from public.chat_sessions cs
      where cs.id = cm.session_id
        and cs.module_id in ('petshop', 'system')
    );
  end if;
end $$;

-- Perfis: manter somente petshop como modulo de negocio.
update public.profiles
set
  allowed_modules = jsonb_build_array('petshop'),
  module_permissions = case
    when role = 'admin' then jsonb_build_object('petshop', 'admin_pet')
    when coalesce(module_permissions->>'petshop', '') like 'admin_%' then jsonb_build_object('petshop', 'admin_pet')
    else jsonb_build_object('petshop', 'funcionario_pet')
  end
where true;

-- Desativar canais de bots nao-petshop (sem apagar historico estrutural).
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'tenant_bot_channels'
  ) then
    update public.tenant_bot_channels
    set
      active = false,
      telegram_bot_token = null,
      openai_api_key_override = null
    where module_id <> 'petshop';
  end if;
end $$;

commit;

-- ============================================================================
-- Validacao sugerida (execute manualmente apos o commit):
-- ----------------------------------------------------------------------------
-- select module_id, count(*) from public.settings group by module_id;
-- select module_id, count(*) from public.chat_sessions group by module_id;
-- select allowed_modules, module_permissions, count(*) from public.profiles
-- group by allowed_modules, module_permissions;
-- select module_id, active, count(*) from public.tenant_bot_channels
-- group by module_id, active;
-- ============================================================================
