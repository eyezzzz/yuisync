begin;

alter table public.sales
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null;

create unique index if not exists sales_tenant_appointment_unique
  on public.sales (tenant_id, appointment_id)
  where appointment_id is not null;

create index if not exists sales_appointment_lookup
  on public.sales (appointment_id, created_at desc)
  where appointment_id is not null;

comment on column public.sales.appointment_id is
  'Agendamento de banho/tosa que originou a venda. Impede fechamento financeiro duplicado.';

create or replace function public.checkout_petshop_appointment_transaction(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := nullif(p_payload->>'tenant_id', '')::uuid;
  v_module_id text := coalesce(nullif(trim(p_payload->>'module_id'), ''), 'petshop');
  v_appointment_id uuid := nullif(p_payload->>'appointment_id', '')::uuid;
  v_profile_id uuid := auth.uid();
  v_payment_method text := nullif(trim(p_payload->>'payment_method'), '');
  v_splits jsonb := coalesce(p_payload->'payment_splits', '[]'::jsonb);
  v_split jsonb;
  v_split_total numeric := 0;
  v_appointment record;
  v_existing record;
  v_sale_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_service_code text;
  v_service_name text;
  v_product_id uuid;
  v_net_unit numeric;
  v_catalog_unit numeric;
  v_net_service_total numeric := 0;
  v_catalog_service_total numeric := 0;
  v_transport_net numeric := greatest(0, coalesce(nullif(p_payload->>'transport_fee', '')::numeric, 0));
  v_transport_catalog numeric := greatest(0, coalesce(nullif(p_payload->>'transport_catalog_fee', '')::numeric, 0));
  v_net_total numeric := 0;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_transport_covered boolean := false;
  v_item_names text[] := array[]::text[];
begin
  if v_profile_id is null then
    raise exception 'Sessao autenticada obrigatoria.';
  end if;
  if v_tenant_id is null or not public.has_tenant_access(v_tenant_id) then
    raise exception 'Tenant invalido ou sem permissao.';
  end if;
  if v_module_id <> 'petshop' then
    raise exception 'Fechamento disponivel somente para petshop.';
  end if;
  if v_appointment_id is null then
    raise exception 'Agendamento nao informado.';
  end if;

  select
    appointment.*,
    client.name as client_name,
    client.phone as client_phone,
    client.details as client_details
  into v_appointment
  from public.appointments appointment
  left join public.clients client
    on client.id = appointment.client_id
   and client.tenant_id = appointment.tenant_id
   and client.module_id = appointment.module_id
  where appointment.id = v_appointment_id
    and appointment.tenant_id = v_tenant_id
    and appointment.module_id = v_module_id
  for update of appointment;

  if not found then
    raise exception 'Agendamento nao encontrado no tenant ativo.';
  end if;
  if lower(coalesce(v_appointment.status, '')) not in ('concluido', 'completed', 'finalizado') then
    raise exception 'O agendamento precisa estar concluido antes do fechamento no caixa.';
  end if;

  select id, total_price, payment_method
  into v_existing
  from public.sales
  where tenant_id = v_tenant_id
    and appointment_id = v_appointment_id
  limit 1;

  if found then
    return jsonb_build_object(
      'sale_id', v_existing.id,
      'total', v_existing.total_price,
      'payment_method', v_existing.payment_method,
      'duplicated', true
    );
  end if;

  v_items := case
    when jsonb_typeof(v_appointment.service_items) = 'array' then v_appointment.service_items
    else '[]'::jsonb
  end;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_service_code := coalesce(nullif(trim(v_item->>'code'), ''), nullif(trim(v_item->>'service_type'), ''));
    v_service_name := coalesce(
      nullif(trim(v_item->>'name'), ''),
      nullif(trim(v_item->>'label'), ''),
      nullif(trim(v_item->>'service_name'), ''),
      v_service_code,
      'Servico'
    );
    v_net_unit := greatest(0, coalesce(
      nullif(v_item->>'unit_price', '')::numeric,
      nullif(v_item->>'price', '')::numeric,
      0
    ));
    v_catalog_unit := greatest(v_net_unit, coalesce(
      nullif(v_item->>'catalog_price', '')::numeric,
      nullif(v_item->>'default_price', '')::numeric,
      v_net_unit
    ));
    v_net_service_total := v_net_service_total + v_net_unit;
    v_catalog_service_total := v_catalog_service_total + v_catalog_unit;
    v_transport_covered := v_transport_covered or coalesce((v_item->>'transport_benefit_used')::boolean, false);
    v_item_names := array_append(v_item_names, v_service_name);
  end loop;

  if jsonb_array_length(v_items) = 0 then
    v_net_service_total := greatest(0, coalesce(v_appointment.price, 0));
    v_catalog_service_total := v_net_service_total;
    v_item_names := array_append(v_item_names, coalesce(v_appointment.service_type, 'Servico'));
  end if;

  if coalesce(v_appointment.transport_mode, 'cliente_leva') = 'cliente_leva' then
    v_transport_net := 0;
    v_transport_catalog := 0;
  elsif v_transport_covered then
    v_transport_net := 0;
  end if;

  v_transport_catalog := greatest(v_transport_catalog, v_transport_net);
  v_net_total := greatest(
    0,
    coalesce(v_appointment.price, 0),
    v_net_service_total + v_transport_net
  );
  v_subtotal := greatest(
    v_net_total,
    v_catalog_service_total + v_transport_catalog
  );
  v_discount := greatest(0, round(v_subtotal - v_net_total, 2));
  v_subtotal := round(v_subtotal, 2);
  v_net_total := round(v_net_total, 2);

  if v_net_total <= 0 then
    v_payment_method := 'pacote';
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
    if abs(v_split_total - v_net_total) > 0.01 then
      raise exception 'Pagamentos divididos nao fecham o total do agendamento.';
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
    appointment_id
  ) values (
    v_tenant_id,
    v_module_id,
    v_appointment.client_id,
    v_profile_id,
    coalesce(nullif(trim(v_appointment.client_name), ''), 'Cliente'),
    nullif(trim(v_appointment.client_phone), ''),
    v_payment_method,
    v_subtotal,
    v_discount,
    v_net_total,
    'concluido',
    'agenda',
    'servico',
    concat_ws(
      ' | ',
      'Agendamento: ' || v_appointment_id::text,
      case when coalesce(trim(v_appointment.notes), '') <> '' then 'Instrucoes: ' || trim(v_appointment.notes) end,
      case when coalesce(trim(p_payload->>'notes'), '') <> '' then trim(p_payload->>'notes') end,
      'Servicos: ' || array_to_string(v_item_names, ', ')
    ),
    'appointment:' || v_appointment_id::text,
    v_appointment_id
  )
  returning id into v_sale_id;

  if jsonb_array_length(v_items) > 0 then
    for v_item in select * from jsonb_array_elements(v_items)
    loop
      v_service_code := coalesce(nullif(trim(v_item->>'code'), ''), nullif(trim(v_item->>'service_type'), ''));
      v_catalog_unit := greatest(0, coalesce(
        nullif(v_item->>'catalog_price', '')::numeric,
        nullif(v_item->>'default_price', '')::numeric,
        nullif(v_item->>'unit_price', '')::numeric,
        nullif(v_item->>'price', '')::numeric,
        0
      ));
      v_product_id := null;

      select service.source_product_id
      into v_product_id
      from public.petshop_services service
      where service.tenant_id = v_tenant_id
        and service.module_id = v_module_id
        and service.code = v_service_code
        and service.source_product_id is not null
      limit 1;

      if v_product_id is null and v_service_code like 'catalog_%' then
        select product.id
        into v_product_id
        from public.products product
        where product.tenant_id = v_tenant_id
          and product.module_id = v_module_id
          and replace(product.id::text, '-', '') = substring(v_service_code from 9)
        limit 1;
      end if;

      insert into public.sale_items (
        tenant_id,
        sale_id,
        product_id,
        quantity,
        unit_price,
        subtotal,
        upsell
      ) values (
        v_tenant_id,
        v_sale_id,
        v_product_id,
        1,
        v_catalog_unit,
        v_catalog_unit,
        false
      );
    end loop;
  else
    insert into public.sale_items (
      tenant_id, sale_id, product_id, quantity, unit_price, subtotal, upsell
    ) values (
      v_tenant_id, v_sale_id, null, 1, v_catalog_service_total, v_catalog_service_total, false
    );
  end if;

  if v_transport_catalog > 0 then
    insert into public.sale_items (
      tenant_id, sale_id, product_id, quantity, unit_price, subtotal, upsell
    ) values (
      v_tenant_id, v_sale_id, null, 1, v_transport_catalog, v_transport_catalog, false
    );
  end if;

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

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'appointment_id', v_appointment_id,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'total', v_net_total,
    'payment_method', v_payment_method,
    'duplicated', false
  );
exception
  when unique_violation then
    select id, total_price, payment_method
    into v_existing
    from public.sales
    where tenant_id = v_tenant_id
      and appointment_id = v_appointment_id
    limit 1;
    if found then
      return jsonb_build_object(
        'sale_id', v_existing.id,
        'total', v_existing.total_price,
        'payment_method', v_existing.payment_method,
        'duplicated', true
      );
    end if;
    raise;
end;
$$;

revoke all on function public.checkout_petshop_appointment_transaction(jsonb) from public;
grant execute on function public.checkout_petshop_appointment_transaction(jsonb) to authenticated, service_role;

commit;
