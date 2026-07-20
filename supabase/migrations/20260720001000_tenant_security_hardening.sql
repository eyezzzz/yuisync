begin;

alter table public.tenants
  add column if not exists is_test boolean not null default false;

alter table public.chat_messages
  add column if not exists tenant_id uuid references public.tenants(id);

update public.chat_messages message
set tenant_id = session.tenant_id
from public.chat_sessions session
where message.session_id = session.id
  and message.tenant_id is null;

create or replace function public.set_chat_message_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select session.tenant_id into new.tenant_id
  from public.chat_sessions session
  where session.id = new.session_id;
  if new.tenant_id is null then
    raise exception 'Sessao de chat sem tenant valido';
  end if;
  return new;
end;
$$;

drop trigger if exists set_chat_message_tenant on public.chat_messages;
create trigger set_chat_message_tenant
before insert or update of session_id on public.chat_messages
for each row execute function public.set_chat_message_tenant();

create or replace function public.has_tenant_access(check_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select check_tenant_id is not null and (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.active = true and p.role = 'admin'
    )
    or exists (
      select 1 from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.profile_id = auth.uid()
        and pt.tenant_id = check_tenant_id
        and pt.active = true
        and p.active = true
    )
  );
$$;

revoke all on function public.has_tenant_access(uuid) from public;
grant execute on function public.has_tenant_access(uuid) to authenticated, service_role;

create or replace function public.prevent_tenant_reassignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.tenant_id is distinct from new.tenant_id and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'tenant_id nao pode ser alterado depois da criacao';
  end if;
  return new;
end;
$$;

do $$
declare
  scoped_table_name text;
  policy_name text;
  scoped_tables text[] := array[
    'settings', 'clients', 'appointments', 'products', 'sales', 'sale_items',
    'sale_payment_splits', 'invoices', 'billing_settings', 'chat_sessions',
    'chat_messages', 'accounting_services', 'subscription_plans',
    'client_subscriptions', 'loyalty_settings', 'loyalty_points',
    'commission_rules', 'cash_register', 'petshop_campaign_logs',
    'service_delivery_orders', 'fiscal_documents', 'tenant_fiscal_profiles',
    'petshop_growth_booking_requests', 'petshop_growth_settings',
    'petshop_growth_report_cards'
  ];
  null_count bigint;
begin
  foreach scoped_table_name in array scoped_tables loop
    if to_regclass(format('public.%I', scoped_table_name)) is null then
      continue;
    end if;

    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = scoped_table_name
        and c.column_name = 'tenant_id'
    ) then
      raise exception 'Tabela operacional %.% sem tenant_id', 'public', scoped_table_name;
    end if;

    execute format('select count(*) from public.%I where tenant_id is null', scoped_table_name)
      into null_count;
    if null_count > 0 then
      raise exception 'Tabela %.% possui % registros sem tenant_id', 'public', scoped_table_name, null_count;
    end if;

    execute format('alter table public.%I alter column tenant_id set not null', scoped_table_name);
    execute format('create index if not exists %I on public.%I (tenant_id)', 'idx_' || scoped_table_name || '_tenant', scoped_table_name);
    execute format('alter table public.%I enable row level security', scoped_table_name);

    for policy_name in
      select p.policyname from pg_policies p
      where p.schemaname = 'public' and p.tablename = scoped_table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_name, scoped_table_name);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_tenant_access(tenant_id))',
      scoped_table_name || '_tenant_select', scoped_table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_tenant_access(tenant_id))',
      scoped_table_name || '_tenant_insert', scoped_table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id))',
      scoped_table_name || '_tenant_update', scoped_table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.has_tenant_access(tenant_id))',
      scoped_table_name || '_tenant_delete', scoped_table_name
    );

    execute format('drop trigger if exists prevent_tenant_reassignment on public.%I', scoped_table_name);
    execute format(
      'create trigger prevent_tenant_reassignment before update of tenant_id on public.%I for each row execute function public.prevent_tenant_reassignment()',
      scoped_table_name
    );
  end loop;
end $$;

create or replace function public.prevent_mock_fiscal_outside_test()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  provider_name text;
begin
  provider_name := case
    when tg_table_name = 'fiscal_documents' then coalesce(to_jsonb(new)->>'provider', '')
    else coalesce(to_jsonb(new)->'settings'->>'provider', '')
  end;

  if provider_name = 'mock_local' and not exists (
    select 1 from public.tenants t where t.id = new.tenant_id and t.is_test = true
  ) then
    raise exception 'mock_local permitido somente em tenant marcado como teste';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_mock_fiscal_outside_test on public.fiscal_documents;
create trigger prevent_mock_fiscal_outside_test
before insert or update of provider on public.fiscal_documents
for each row execute function public.prevent_mock_fiscal_outside_test();

drop trigger if exists prevent_mock_fiscal_profile_outside_test on public.tenant_fiscal_profiles;
create trigger prevent_mock_fiscal_profile_outside_test
before insert or update of settings on public.tenant_fiscal_profiles
for each row execute function public.prevent_mock_fiscal_outside_test();

commit;
