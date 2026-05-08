-- =============================================================================
-- YuiSync Petshop - Runtime de Emissao Fiscal Automatizada
-- =============================================================================
-- Objetivo:
-- 1) Criar fila de documentos fiscais por tenant
-- 2) Vincular venda PDV -> invoice -> documento fiscal
-- 3) Permitir emissao automatica local (mock) para operacao imediata
--
-- Dependencias recomendadas:
-- - database/multi_tenant_instances.sql
-- - database/petshop_advanced_features.sql
-- - database/petshop_fiscal_automation.sql
-- =============================================================================

begin;

create extension if not exists "uuid-ossp";

alter table public.invoices
  add column if not exists sale_id uuid references public.sales(id) on delete set null,
  add column if not exists fiscal_status text default 'not_requested',
  add column if not exists fiscal_document_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_fiscal_status_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_fiscal_status_check
      check (fiscal_status in ('not_requested', 'pending', 'authorized', 'failed', 'rejected', 'cancelled'));
  end if;
end;
$$;

create table if not exists public.fiscal_documents (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null default 'petshop',
  sale_id uuid references public.sales(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  document_type text not null default 'nfce'
    check (document_type in ('nfce', 'nfe', 'nfse')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'authorized', 'rejected', 'failed', 'cancelled')),
  provider text not null default 'mock_local',
  environment text not null default 'homologacao'
    check (environment in ('homologacao', 'producao')),
  issue_series text not null default '1',
  issue_number bigint,
  nfe_key text,
  protocol_number text,
  xml_url text,
  pdf_url text,
  customer_name text,
  customer_document text,
  amount numeric(10, 2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  response jsonb not null default '{}'::jsonb,
  error_message text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_fiscal_document_id_fkey'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_fiscal_document_id_fkey
      foreign key (fiscal_document_id) references public.fiscal_documents(id) on delete set null;
  end if;
end;
$$;

create unique index if not exists idx_invoices_sale_id_unique
  on public.invoices (sale_id)
  where sale_id is not null;

create unique index if not exists idx_fiscal_documents_sale_id_unique
  on public.fiscal_documents (sale_id)
  where sale_id is not null;

create unique index if not exists idx_fiscal_documents_invoice_id_unique
  on public.fiscal_documents (invoice_id)
  where invoice_id is not null;

create index if not exists idx_fiscal_documents_tenant_module_created
  on public.fiscal_documents (tenant_id, module_id, created_at desc);

create or replace function public.next_fiscal_invoice_number(
  p_tenant_id uuid,
  p_module_id text default 'petshop'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  update public.tenant_fiscal_profiles
  set next_invoice_number = greatest(2, coalesce(next_invoice_number, 1) + 1),
      updated_at = now()
  where tenant_id = p_tenant_id
    and module_id = p_module_id
  returning next_invoice_number - 1
  into v_current;

  if v_current is not null then
    return v_current;
  end if;

  insert into public.tenant_fiscal_profiles (
    tenant_id,
    module_id,
    policy_version_id,
    mode,
    auto_update,
    nfe_environment,
    fiscal_regime,
    issue_series,
    next_invoice_number,
    emit_nfce,
    emit_nfe,
    emit_nfse,
    settings
  )
  values (
    p_tenant_id,
    p_module_id,
    public.current_active_fiscal_policy_id(p_module_id),
    'inherit',
    true,
    'homologacao',
    'simples_nacional',
    '1',
    2,
    true,
    false,
    false,
    '{}'::jsonb
  )
  on conflict (tenant_id, module_id) do nothing;

  return 1;
end;
$$;

create or replace function public.authorize_mock_fiscal_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.fiscal_documents%rowtype;
  v_key text;
  v_protocol text;
begin
  select *
  into v_doc
  from public.fiscal_documents
  where id = p_document_id
  limit 1;

  if v_doc.id is null then
    return;
  end if;

  if v_doc.status = 'authorized' then
    return;
  end if;

  v_key := lpad(regexp_replace(uuid_generate_v4()::text, '-', '', 'g'), 44, '0');
  v_protocol := 'MOCK-' || to_char(now(), 'YYYYMMDDHH24MISS');

  update public.fiscal_documents
  set status = 'authorized',
      nfe_key = v_key,
      protocol_number = v_protocol,
      response = jsonb_build_object(
        'provider', 'mock_local',
        'status', 'authorized',
        'authorized_at', now()
      ),
      issued_at = now(),
      error_message = null,
      updated_at = now()
  where id = v_doc.id;

  if v_doc.invoice_id is not null then
    update public.invoices
    set invoice_nfe_url = v_key,
        fiscal_status = 'authorized',
        updated_at = now()
    where id = v_doc.invoice_id;
  end if;
end;
$$;

create or replace function public.queue_fiscal_document_for_sale(p_sale_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales%rowtype;
  v_profile public.tenant_fiscal_profiles%rowtype;
  v_settings jsonb := '{}'::jsonb;
  v_auto_issue boolean := true;
  v_document_type text := 'nfce';
  v_provider text := 'mock_local';
  v_environment text := 'homologacao';
  v_issue_number bigint;
  v_invoice_id uuid;
  v_document_id uuid;
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  limit 1;

  if v_sale.id is null then
    return null;
  end if;

  if v_sale.module_id <> 'petshop' or coalesce(v_sale.status, '') <> 'concluido' then
    return null;
  end if;

  select *
  into v_profile
  from public.tenant_fiscal_profiles
  where tenant_id = v_sale.tenant_id
    and module_id = v_sale.module_id
  limit 1;

  if v_profile.tenant_id is null then
    insert into public.tenant_fiscal_profiles (
      tenant_id,
      module_id,
      policy_version_id,
      mode,
      auto_update,
      nfe_environment,
      fiscal_regime,
      issue_series,
      next_invoice_number,
      emit_nfce,
      emit_nfe,
      emit_nfse,
      settings
    )
    values (
      v_sale.tenant_id,
      v_sale.module_id,
      public.current_active_fiscal_policy_id(v_sale.module_id),
      'inherit',
      true,
      'homologacao',
      'simples_nacional',
      '1',
      1,
      true,
      false,
      false,
      '{"auto_issue_on_sale": true, "sale_document_type": "nfce", "provider": "mock_local"}'::jsonb
    )
    on conflict (tenant_id, module_id) do nothing;

    select *
    into v_profile
    from public.tenant_fiscal_profiles
    where tenant_id = v_sale.tenant_id
      and module_id = v_sale.module_id
    limit 1;
  end if;

  v_settings := coalesce(v_profile.settings, '{}'::jsonb);
  v_auto_issue := coalesce((v_settings->>'auto_issue_on_sale')::boolean, true);
  v_document_type := coalesce(
    nullif(v_settings->>'sale_document_type', ''),
    case
      when coalesce(v_profile.emit_nfce, false) then 'nfce'
      when coalesce(v_profile.emit_nfe, false) then 'nfe'
      when coalesce(v_profile.emit_nfse, false) then 'nfse'
      else 'nfce'
    end
  );
  v_provider := coalesce(nullif(v_settings->>'provider', ''), 'mock_local');
  v_environment := coalesce(v_profile.nfe_environment, 'homologacao');

  select id
  into v_invoice_id
  from public.invoices
  where sale_id = v_sale.id
  limit 1;

  if v_invoice_id is null then
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
      fiscal_status,
      updated_at
    )
    values (
      v_sale.tenant_id,
      v_sale.module_id,
      v_sale.id,
      'paid',
      coalesce(v_sale.total_price, 0),
      current_date,
      coalesce(v_sale.created_at, now()),
      concat('Venda PDV #', left(v_sale.id::text, 8), coalesce(' - ' || v_sale.customer_name, '')),
      v_sale.customer_phone,
      case when v_auto_issue then 'pending' else 'not_requested' end,
      now()
    )
    on conflict (sale_id) do update
    set amount = excluded.amount,
        status = excluded.status,
        due_date = excluded.due_date,
        paid_at = excluded.paid_at,
        customer_phone = excluded.customer_phone,
        updated_at = now()
    returning id
    into v_invoice_id;
  end if;

  if not v_auto_issue then
    update public.invoices
    set fiscal_status = 'not_requested',
        updated_at = now()
    where id = v_invoice_id;
    return null;
  end if;

  select id
  into v_document_id
  from public.fiscal_documents
  where sale_id = v_sale.id
  limit 1;

  if v_document_id is not null then
    update public.invoices
    set fiscal_document_id = v_document_id,
        fiscal_status = coalesce(
          (select case
            when fd.status = 'authorized' then 'authorized'
            when fd.status in ('failed', 'rejected', 'cancelled') then fd.status
            else 'pending'
          end
          from public.fiscal_documents fd
          where fd.id = v_document_id),
          'pending'
        ),
        updated_at = now()
    where id = v_invoice_id;

    if v_provider = 'mock_local' then
      perform public.authorize_mock_fiscal_document(v_document_id);
    end if;

    return v_document_id;
  end if;

  v_issue_number := public.next_fiscal_invoice_number(v_sale.tenant_id, v_sale.module_id);

  insert into public.fiscal_documents (
    tenant_id,
    module_id,
    sale_id,
    invoice_id,
    document_type,
    status,
    provider,
    environment,
    issue_series,
    issue_number,
    customer_name,
    amount,
    payload,
    updated_at
  )
  values (
    v_sale.tenant_id,
    v_sale.module_id,
    v_sale.id,
    v_invoice_id,
    v_document_type,
    'pending',
    v_provider,
    v_environment,
    coalesce(v_profile.issue_series, '1'),
    v_issue_number,
    coalesce(v_sale.customer_name, 'Consumidor final'),
    coalesce(v_sale.total_price, 0),
    jsonb_build_object(
      'sale_id', v_sale.id,
      'invoice_id', v_invoice_id,
      'document_type', v_document_type,
      'provider', v_provider,
      'environment', v_environment
    ),
    now()
  )
  on conflict (sale_id)
  where sale_id is not null
  do update set
    invoice_id = excluded.invoice_id,
    document_type = excluded.document_type,
    provider = excluded.provider,
    environment = excluded.environment,
    amount = excluded.amount,
    payload = excluded.payload,
    updated_at = now()
  returning id
  into v_document_id;

  update public.invoices
  set fiscal_status = 'pending',
      fiscal_document_id = v_document_id,
      updated_at = now()
  where id = v_invoice_id;

  if v_provider = 'mock_local' then
    perform public.authorize_mock_fiscal_document(v_document_id);
  end if;

  return v_document_id;
end;
$$;

create or replace function public.queue_fiscal_document_on_sale_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.queue_fiscal_document_for_sale(new.id);
  return new;
end;
$$;

drop trigger if exists trg_queue_fiscal_document_on_sale on public.sales;
create trigger trg_queue_fiscal_document_on_sale
  after insert on public.sales
  for each row
  execute function public.queue_fiscal_document_on_sale_trigger();

alter table public.fiscal_documents enable row level security;

drop policy if exists "Fiscal documents select" on public.fiscal_documents;
create policy "Fiscal documents select"
on public.fiscal_documents
for select
using (public.has_module_tenant_access(module_id, tenant_id));

drop policy if exists "Fiscal documents insert" on public.fiscal_documents;
create policy "Fiscal documents insert"
on public.fiscal_documents
for insert
with check (public.has_module_tenant_access(module_id, tenant_id));

drop policy if exists "Fiscal documents update admin" on public.fiscal_documents;
create policy "Fiscal documents update admin"
on public.fiscal_documents
for update
using (public.is_module_tenant_admin(module_id, tenant_id))
with check (public.is_module_tenant_admin(module_id, tenant_id));

drop policy if exists "Fiscal documents delete admin" on public.fiscal_documents;
create policy "Fiscal documents delete admin"
on public.fiscal_documents
for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

commit;
