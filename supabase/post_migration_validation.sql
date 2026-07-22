with scoped(table_name) as (
  values
    ('settings'), ('clients'), ('appointments'), ('products'), ('sales'),
    ('sale_items'), ('sale_payment_splits'), ('invoices'), ('billing_settings'),
    ('chat_sessions'), ('chat_messages'), ('accounting_services'),
    ('subscription_plans'), ('client_subscriptions'), ('loyalty_settings'),
    ('loyalty_points'), ('commission_rules'), ('cash_register'),
    ('petshop_campaign_logs'), ('service_delivery_orders'), ('fiscal_documents'),
    ('tenant_fiscal_profiles'), ('petshop_growth_booking_requests'),
    ('petshop_growth_settings'), ('petshop_growth_report_cards'), ('pets')
), existing as (
  select scoped.table_name
  from scoped
  where to_regclass(format('public.%I', scoped.table_name)) is not null
), table_checks as (
  select
    existing.table_name,
    columns.is_nullable = 'NO' as tenant_not_null,
    classes.relrowsecurity as rls_enabled,
    (select count(*) from pg_catalog.pg_policies policies
      where policies.schemaname = 'public' and policies.tablename = existing.table_name) as policy_count,
    exists (
      select 1 from pg_catalog.pg_trigger trigger
      where trigger.tgrelid = to_regclass(format('public.%I', existing.table_name))
        and trigger.tgname = 'prevent_tenant_reassignment' and not trigger.tgisinternal
    ) as reassignment_guard
  from existing
  join information_schema.columns columns
    on columns.table_schema = 'public'
   and columns.table_name = existing.table_name
   and columns.column_name = 'tenant_id'
  join pg_catalog.pg_class classes
    on classes.oid = to_regclass(format('public.%I', existing.table_name))
)
select jsonb_build_object(
  'objects', jsonb_build_object(
    'stock_movements', to_regclass('public.stock_movements') is not null,
    'fiscal_queue_failures', to_regclass('public.fiscal_queue_failures') is not null,
    'checkout_function', to_regprocedure('public.create_pdv_checkout_transaction(jsonb)') is not null,
    'booking_function', to_regprocedure('public.book_petshop_appointment_transaction(jsonb)') is not null,
    'public_booking_function', to_regprocedure('public.create_petshop_booking_request(text,text,text,text,text,date,text,text,boolean,text,text,text,text,text)') is not null,
    'petbot_order_commits', to_regclass('public.petbot_order_commits') is not null,
    'petbot_transaction_function', to_regprocedure('public.create_petbot_order_transaction(jsonb)') is not null,
    'chat_context_jsonb', exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'chat_sessions'
        and column_name = 'context'
        and udt_name = 'jsonb'
    ),
    'fractional_product_stock', exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'products'
        and column_name = 'stock_quantity' and data_type = 'numeric'
    ),
    'fractional_sale_items', exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'sale_items'
        and column_name = 'quantity' and data_type = 'numeric'
    ),
    'petbot_single_stock_writer', position(
      'app.yuisync_stock_writer'
      in pg_get_functiondef('public.create_petbot_order_transaction(jsonb)'::regprocedure)
    ) > 0,
    'pdv_single_stock_writer', position(
      'app.yuisync_stock_writer'
      in pg_get_functiondef('public.create_pdv_checkout_transaction(jsonb)'::regprocedure)
    ) > 0
  ),
  'data', jsonb_build_object(
    'pets_without_tenant', (select count(*) from public.pets where tenant_id is null),
    'mock_fiscal_outside_test', (
      select count(*) from public.fiscal_documents document
      left join public.tenants tenant on tenant.id = document.tenant_id
      where document.provider = 'mock_local' and coalesce(tenant.is_test, false) = false
    ),
    'mock_profile_outside_test', (
      select count(*) from public.tenant_fiscal_profiles profile
      left join public.tenants tenant on tenant.id = profile.tenant_id
      where profile.settings->>'provider' = 'mock_local' and coalesce(tenant.is_test, false) = false
    )
  ),
  'guards', jsonb_build_object(
    'mock_document_trigger', exists (select 1 from pg_trigger where tgrelid = 'public.fiscal_documents'::regclass and tgname = 'prevent_mock_fiscal_outside_test'),
    'mock_profile_trigger', exists (select 1 from pg_trigger where tgrelid = 'public.tenant_fiscal_profiles'::regclass and tgname = 'prevent_mock_fiscal_profile_outside_test'),
    'appointment_overlap_trigger', exists (select 1 from pg_trigger where tgrelid = 'public.appointments'::regclass and tgname = 'prevent_appointment_overlap'),
    'motodog_fee_trigger', exists (select 1 from pg_trigger where tgrelid = 'public.petshop_growth_booking_requests'::regclass and tgname = 'enforce_booking_motodog_fee'),
    'petbot_service_payment_trigger', exists (select 1 from pg_trigger where tgrelid = 'public.sales'::regclass and tgname = 'normalize_petbot_service_booking_sale'),
    'petbot_service_order_trigger', exists (select 1 from pg_trigger where tgrelid = 'public.service_delivery_orders'::regclass and tgname = 'normalize_petbot_service_delivery_payment'),
    'petbot_stock_movement_trigger', exists (select 1 from pg_trigger where tgrelid = 'public.sale_items'::regclass and tgname = 'record_petbot_stock_movement')
  ),
  'table_checks', (select jsonb_agg(to_jsonb(table_checks) order by table_name) from table_checks),
  'table_failures', (
    select count(*) from table_checks
    where not tenant_not_null or not rls_enabled or policy_count < 4 or not reassignment_guard
  )
) as validation;
