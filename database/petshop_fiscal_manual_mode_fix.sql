-- =============================================================================
-- YuiSync Petshop - Fiscal em modo manual (fix ON CONFLICT + sem auto emissao)
-- =============================================================================
-- Execute este script APOS:
-- - database/petshop_fiscal_runtime.sql
--
-- O que ele faz:
-- 1) Desliga emissao automatica por trigger ao criar venda
-- 2) Corrige queue_fiscal_document_for_sale para nao depender de ON CONFLICT(sale_id)
-- 3) Mantem emissao fiscal sob demanda (botao "Emitir Cupom Fiscal")
-- =============================================================================

begin;

-- 1) Sem emissao automatica ao inserir venda
drop trigger if exists trg_queue_fiscal_document_on_sale on public.sales;
drop function if exists public.queue_fiscal_document_on_sale_trigger();

-- 2) Ajusta configuracao default para manual
update public.tenant_fiscal_profiles
set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{auto_issue_on_sale}', 'false'::jsonb, true),
    updated_at = now()
where module_id = 'petshop';

-- 3) Reescreve fila fiscal sem ON CONFLICT(sale_id)
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
  v_document_type text := 'nfce';
  v_provider text := 'mock_local';
  v_environment text := 'homologacao';
  v_issue_number bigint;
  v_invoice_id uuid;
  v_document_id uuid;
  v_existing_doc_status text;
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
      '{"auto_issue_on_sale": false, "sale_document_type": "nfce", "provider": "mock_local"}'::jsonb
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
      'pending',
      now()
    )
    returning id
    into v_invoice_id;
  else
    update public.invoices
    set amount = coalesce(v_sale.total_price, amount),
        status = 'paid',
        due_date = coalesce(due_date, current_date),
        paid_at = coalesce(paid_at, v_sale.created_at, now()),
        customer_phone = coalesce(v_sale.customer_phone, customer_phone),
        fiscal_status = case when fiscal_status = 'authorized' then 'authorized' else 'pending' end,
        updated_at = now()
    where id = v_invoice_id;
  end if;

  select id, status
  into v_document_id, v_existing_doc_status
  from public.fiscal_documents
  where sale_id = v_sale.id
  limit 1;

  if v_document_id is null then
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
    returning id
    into v_document_id;
  else
    update public.fiscal_documents
    set invoice_id = v_invoice_id,
        document_type = v_document_type,
        provider = v_provider,
        environment = v_environment,
        amount = coalesce(v_sale.total_price, amount),
        payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
          'sale_id', v_sale.id,
          'invoice_id', v_invoice_id,
          'document_type', v_document_type,
          'provider', v_provider,
          'environment', v_environment
        ),
        status = case
          when coalesce(v_existing_doc_status, '') = 'authorized' then 'authorized'
          else 'pending'
        end,
        updated_at = now()
    where id = v_document_id;
  end if;

  update public.invoices
  set fiscal_status = case
        when coalesce(v_existing_doc_status, '') = 'authorized' then 'authorized'
        else 'pending'
      end,
      fiscal_document_id = v_document_id,
      updated_at = now()
  where id = v_invoice_id;

  if v_provider = 'mock_local' then
    perform public.authorize_mock_fiscal_document(v_document_id);
  end if;

  return v_document_id;
end;
$$;

commit;
