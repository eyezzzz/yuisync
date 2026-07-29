begin;

alter table public.sales
  add column if not exists subscription_id uuid references public.client_subscriptions(id) on delete set null;

create unique index if not exists sales_tenant_subscription_unique
  on public.sales (tenant_id, subscription_id)
  where subscription_id is not null;

create index if not exists sales_subscription_lookup
  on public.sales (subscription_id, created_at desc)
  where subscription_id is not null;

comment on column public.sales.subscription_id is
  'Assinatura de pacote que originou a venda. A assinatura so fica ativa depois da confirmacao desta venda.';

create or replace function public.checkout_petshop_subscription_transaction(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := nullif(p_payload->>'tenant_id', '')::uuid;
  v_module_id text := coalesce(nullif(trim(p_payload->>'module_id'), ''), 'petshop');
  v_subscription_id uuid := nullif(p_payload->>'subscription_id', '')::uuid;
  v_profile_id uuid := auth.uid();
  v_payment_method text := nullif(trim(p_payload->>'payment_method'), '');
  v_splits jsonb := coalesce(p_payload->'payment_splits', '[]'::jsonb);
  v_split jsonb;
  v_split_total numeric := 0;
  v_subscription record;
  v_existing record;
  v_sale_id uuid;
  v_total numeric := 0;
  v_cycle_days integer := 30;
begin
  if v_profile_id is null then
    raise exception 'Sessao autenticada obrigatoria.';
  end if;
  if v_tenant_id is null or not public.has_tenant_access(v_tenant_id) then
    raise exception 'Tenant invalido ou sem permissao.';
  end if;
  if v_module_id <> 'petshop' then
    raise exception 'Checkout de assinatura disponivel somente para petshop.';
  end if;
  if v_subscription_id is null then
    raise exception 'Assinatura nao informada.';
  end if;

  select
    subscription.*,
    plan.name as plan_name,
    plan.price as plan_price,
    plan.billing_cycle as plan_billing_cycle,
    plan.active as plan_active,
    client.name as client_name,
    client.phone as client_phone
  into v_subscription
  from public.client_subscriptions subscription
  join public.subscription_plans plan
    on plan.id = subscription.plan_id
   and plan.tenant_id = subscription.tenant_id
   and plan.module_id = subscription.module_id
  join public.clients client
    on client.id = subscription.client_id
   and client.tenant_id = subscription.tenant_id
   and client.module_id = subscription.module_id
  where subscription.id = v_subscription_id
    and subscription.tenant_id = v_tenant_id
    and subscription.module_id = v_module_id
  for update of subscription;

  if not found then
    raise exception 'Assinatura nao encontrada no tenant ativo.';
  end if;

  select id, total_price, payment_method
  into v_existing
  from public.sales
  where tenant_id = v_tenant_id
    and subscription_id = v_subscription_id
  limit 1;

  if found then
    return jsonb_build_object(
      'sale_id', v_existing.id,
      'subscription_id', v_subscription_id,
      'total', v_existing.total_price,
      'payment_method', v_existing.payment_method,
      'duplicated', true
    );
  end if;

  if v_subscription.status <> 'pending_payment' then
    raise exception 'A assinatura nao esta aguardando pagamento.';
  end if;
  if not coalesce(v_subscription.plan_active, false) then
    raise exception 'O pacote foi desativado antes do pagamento.';
  end if;

  v_total := greatest(0, round(coalesce(v_subscription.plan_price, 0), 2));
  v_cycle_days := case lower(coalesce(v_subscription.plan_billing_cycle, 'monthly'))
    when 'quarterly' then 90
    else 30
  end;

  if v_total <= 0 then
    v_payment_method := 'cortesia';
    v_splits := '[]'::jsonb;
  elsif jsonb_array_length(v_splits) > 0 then
    for v_split in select * from jsonb_array_elements(v_splits)
    loop
      if coalesce(v_split->>'method', '') not in ('dinheiro', 'debito', 'credito', 'pix') then
        raise exception 'Forma de pagamento dividida invalida.';
      end if;
      if coalesce(nullif(v_split->>'amount', '')::numeric, 0) <= 0 then
        raise exception 'Valor de pagamento dividido invalido.';
      end if;
      v_split_total := v_split_total + (v_split->>'amount')::numeric;
    end loop;

    if abs(v_split_total - v_total) > 0.01 then
      raise exception 'Pagamentos divididos nao fecham o valor do pacote.';
    end if;
    v_payment_method := 'multiplo';
  elsif v_payment_method not in ('dinheiro', 'debito', 'credito', 'pix') then
    raise exception 'Selecione uma forma de pagamento valida.';
  end if;

  insert into public.sales (
    tenant_id,
    module_id,
    client_id,
    profile_id,
    customer_name,
    customer_phone,
    payment_method,
    subtotal,
    discount,
    total_price,
    status,
    source,
    fulfillment_type,
    notes,
    idempotency_key,
    subscription_id
  ) values (
    v_tenant_id,
    v_module_id,
    v_subscription.client_id,
    v_profile_id,
    coalesce(nullif(trim(v_subscription.client_name), ''), 'Cliente'),
    nullif(trim(v_subscription.client_phone), ''),
    v_payment_method,
    v_total,
    0,
    v_total,
    'concluido',
    'assinatura',
    'servico',
    concat_ws(
      ' | ',
      'Pacote: ' || coalesce(v_subscription.plan_name, 'Plano'),
      'Assinatura: ' || v_subscription_id::text,
      case when coalesce(trim(p_payload->>'notes'), '') <> '' then trim(p_payload->>'notes') end
    ),
    'subscription:' || v_subscription_id::text,
    v_subscription_id
  )
  returning id into v_sale_id;

  for v_split in select * from jsonb_array_elements(v_splits)
  loop
    insert into public.sale_payment_splits (
      tenant_id,
      module_id,
      sale_id,
      payment_method,
      amount,
      position
    ) values (
      v_tenant_id,
      v_module_id,
      v_sale_id,
      v_split->>'method',
      (v_split->>'amount')::numeric,
      coalesce(nullif(v_split->>'position', '')::integer, 1)
    );
  end loop;

  update public.client_subscriptions
  set status = 'active',
      started_at = current_date,
      next_billing_date = current_date + v_cycle_days,
      services_used = '{}'::jsonb,
      cancelled_at = null,
      updated_at = now()
  where id = v_subscription_id
    and tenant_id = v_tenant_id
    and module_id = v_module_id;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'subscription_id', v_subscription_id,
    'total', v_total,
    'payment_method', v_payment_method,
    'status', 'active',
    'duplicated', false
  );
exception
  when unique_violation then
    select id, total_price, payment_method
    into v_existing
    from public.sales
    where tenant_id = v_tenant_id
      and subscription_id = v_subscription_id
    limit 1;

    if found then
      return jsonb_build_object(
        'sale_id', v_existing.id,
        'subscription_id', v_subscription_id,
        'total', v_existing.total_price,
        'payment_method', v_existing.payment_method,
        'duplicated', true
      );
    end if;
    raise;
end;
$$;

revoke all on function public.checkout_petshop_subscription_transaction(jsonb) from public;
grant execute on function public.checkout_petshop_subscription_transaction(jsonb) to authenticated, service_role;

commit;
