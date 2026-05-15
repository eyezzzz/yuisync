-- =============================================================================
-- YuiSync - PetBot transactional order save
-- =============================================================================
-- Salva venda, itens, baixa de estoque, agendamento/ordem e sessao em uma unica
-- transacao do Postgres. Deve ser aplicada antes de liberar o PetBot no WhatsApp.
-- =============================================================================

begin;

create extension if not exists "uuid-ossp";

alter table public.sales
  add column if not exists tenant_id uuid references public.tenants(id),
  add column if not exists fulfillment_type text default 'balcao';

alter table public.sale_items
  add column if not exists tenant_id uuid references public.tenants(id);

alter table public.appointments
  add column if not exists tenant_id uuid references public.tenants(id),
  add column if not exists duration_min integer default 60,
  add column if not exists pet_id uuid,
  add column if not exists source text default 'agenda',
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists description text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.service_delivery_orders (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references public.tenants(id),
  module_id text not null,
  sale_id uuid references public.sales(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  session_id uuid references public.chat_sessions(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  source text default 'whatsapp',
  order_type text not null default 'entrega',
  status text default 'pendente',
  scheduled_for timestamptz,
  delivery_address text,
  delivery_neighborhood text,
  delivery_city text,
  contact_phone text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_service_delivery_orders_sale_id_unique
  on public.service_delivery_orders (sale_id)
  where sale_id is not null;

create index if not exists idx_products_petbot_lookup
  on public.products (tenant_id, module_id, active, stock_quantity);

create index if not exists idx_petbot_sales_tenant_created
  on public.sales (tenant_id, module_id, created_at desc);

create or replace function public.create_petbot_order_transaction(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid := nullif(p_payload->>'session_id', '')::uuid;
  v_tenant_id uuid := nullif(p_payload->>'tenant_id', '')::uuid;
  v_module_id text := coalesce(nullif(trim(p_payload->>'module_id'), ''), 'petshop');
  v_client_id uuid := nullif(p_payload->>'client_id', '')::uuid;
  v_customer_name text := coalesce(nullif(trim(p_payload->>'customer_name'), ''), 'Cliente');
  v_customer_phone text := nullif(trim(p_payload->>'customer_phone'), '');
  v_order_type text := coalesce(nullif(trim(p_payload->>'order_type'), ''), 'produto');
  v_payment_method text := nullif(trim(p_payload->>'payment_method'), '');
  v_fulfillment_type text := nullif(trim(p_payload->>'fulfillment_type'), '');
  v_delivery_address text := nullif(trim(p_payload->>'delivery_address'), '');
  v_delivery_neighborhood text := nullif(trim(p_payload->>'delivery_neighborhood'), '');
  v_delivery_city text := nullif(trim(p_payload->>'delivery_city'), '');
  v_delivery_reference text := nullif(trim(p_payload->>'delivery_reference'), '');
  v_delivery_fee numeric := coalesce(nullif(p_payload->>'delivery_fee', '')::numeric, 10);
  v_expected_total numeric := nullif(p_payload->>'expected_total', '')::numeric;
  v_items jsonb := coalesce(p_payload->'items', '[]'::jsonb);
  v_resolved_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_product record;
  v_quantity numeric;
  v_unit_price numeric;
  v_line_subtotal numeric;
  v_product_id uuid;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_sale_id uuid;
  v_order_id uuid;
  v_appointment_id uuid;
  v_appointment record;
  v_scheduled_for timestamptz;
  v_service_type text := nullif(trim(p_payload->>'service_type'), '');
  v_notes_input text := nullif(trim(p_payload->>'notes'), '');
  v_notes text;
  v_item_summary text;
  v_sale_fulfillment text;
  v_operational_order_type text;
  v_operational_status text;
  v_session_context jsonb;
begin
  if v_session_id is null or v_tenant_id is null or v_module_id = '' then
    raise exception 'Payload sem sessao, tenant ou modulo.';
  end if;

  select context
    into v_session_context
  from public.chat_sessions
  where id = v_session_id
    and tenant_id = v_tenant_id
    and module_id = v_module_id
  for update;

  if not found then
    raise exception 'Sessao do PetBot nao encontrada.';
  end if;

  if coalesce(v_session_context->>'last_sale_id', '') <> '' then
    return jsonb_build_object(
      'sale_id', v_session_context->>'last_sale_id',
      'order_id', v_session_context->>'last_order_id',
      'appointment_id', v_session_context->>'last_appointment_id',
      'total', coalesce((v_session_context->>'last_total')::numeric, 0),
      'duplicated', true
    );
  end if;

  if v_client_id is null then
    raise exception 'Cliente ausente para registrar pedido.';
  end if;

  if v_payment_method not in ('pix', 'dinheiro', 'cartao') then
    raise exception 'Forma de pagamento ausente ou invalida.';
  end if;

  if v_order_type = 'produto' then
    if v_fulfillment_type not in ('entrega', 'retirada') then
      raise exception 'Entrega ou retirada precisa estar definida.';
    end if;

    if v_fulfillment_type = 'entrega'
      and (v_delivery_address is null or v_delivery_address !~ '[0-9]' or v_delivery_neighborhood is null or v_delivery_reference is null)
    then
      raise exception 'Endereco de entrega incompleto.';
    end if;

    if jsonb_array_length(v_items) = 0 then
      raise exception 'Pedido sem itens para registrar.';
    end if;

    for v_item in select * from jsonb_array_elements(v_items)
    loop
      v_product_id := nullif(v_item->>'product_id', '')::uuid;
      if v_product_id is null then
        raise exception 'Produto sem ID do estoque nao pode ser registrado.';
      end if;

      v_quantity := greatest(1, coalesce((v_item->>'quantity')::numeric, 1));

      select id, name, price, stock_quantity, active
        into v_product
      from public.products
      where id = v_product_id
        and tenant_id = v_tenant_id
        and module_id = v_module_id
      for update;

      if not found or coalesce(v_product.active, false) = false then
        raise exception 'Produto indisponivel no estoque.';
      end if;
      if coalesce(v_product.price, 0) <= 0 then
        raise exception 'Produto sem preco valido: %.', v_product.name;
      end if;
      if coalesce(v_product.stock_quantity, 0) < v_quantity then
        raise exception 'Estoque insuficiente para %.', v_product.name;
      end if;

      v_unit_price := v_product.price;
      v_line_subtotal := v_quantity * v_unit_price;
      v_subtotal := v_subtotal + v_line_subtotal;
      v_resolved_items := v_resolved_items || jsonb_build_array(jsonb_build_object(
        'product_id', v_product.id,
        'name', v_product.name,
        'quantity', v_quantity,
        'unit_price', v_unit_price,
        'subtotal', v_line_subtotal,
        'upsell', coalesce((v_item->>'upsell')::boolean, false)
      ));
    end loop;
  else
    v_appointment_id := nullif(p_payload->>'appointment_id', '')::uuid;

    select id, service_type, scheduled_at, status, price
      into v_appointment
    from public.appointments
    where tenant_id = v_tenant_id
      and module_id = v_module_id
      and (
        (v_appointment_id is not null and id = v_appointment_id)
        or (v_appointment_id is null and scheduled_at = nullif(p_payload->>'scheduled_at', '')::timestamptz)
      )
    for update;

    if not found then
      raise exception 'Horario nao encontrado na agenda.';
    end if;
    if lower(coalesce(v_appointment.status, '')) not in ('available', 'disponivel', 'disponível', 'livre') then
      raise exception 'Horario nao esta mais disponivel.';
    end if;
    if coalesce(v_appointment.price, 0) <= 0 then
      raise exception 'Servico sem preco valido.';
    end if;

    v_appointment_id := v_appointment.id;
    v_scheduled_for := v_appointment.scheduled_at;
    v_service_type := coalesce(nullif(v_appointment.service_type, ''), v_service_type, v_order_type);
    v_subtotal := v_appointment.price;
    v_resolved_items := jsonb_build_array(jsonb_build_object(
      'product_id', null,
      'name', v_service_type,
      'quantity', 1,
      'unit_price', v_appointment.price,
      'subtotal', v_appointment.price,
      'upsell', false
    ));
  end if;

  v_total := v_subtotal + case when v_order_type = 'produto' and v_fulfillment_type = 'entrega' then v_delivery_fee else 0 end;

  if v_expected_total is not null and abs(v_total - v_expected_total) > 0.01 then
    raise exception 'Total divergente. Esperado %, recalculado %.', v_expected_total, v_total;
  end if;

  select string_agg(
    format('%sx %s - R$ %s',
      elem->>'quantity',
      elem->>'name',
      to_char((elem->>'subtotal')::numeric, 'FM999999990.00')
    ),
    '; '
  )
    into v_item_summary
  from jsonb_array_elements(v_resolved_items) elem;

  v_notes := array_to_string(array_remove(array[
    'Origem: PetBot WhatsApp',
    'Sessao: ' || v_session_id::text,
    case when v_item_summary is not null then 'Itens: ' || v_item_summary end,
    case when v_fulfillment_type = 'entrega' then 'Endereco: ' || concat_ws(' - ', v_delivery_address, v_delivery_neighborhood, v_delivery_city) end,
    v_notes_input,
    case when v_fulfillment_type = 'retirada' then 'Retirada na loja' end,
    case when v_fulfillment_type = 'entrega' then 'Taxa de entrega: R$ ' || to_char(v_delivery_fee, 'FM999999990.00') end,
    case when v_delivery_reference is not null then 'Referencia: ' || v_delivery_reference end,
    case when coalesce(nullif(p_payload->>'change_for', '')::numeric, 0) > 0 then 'Troco para R$ ' || to_char(nullif(p_payload->>'change_for', '')::numeric, 'FM999999990.00') end
  ], null), ' | ');

  v_sale_fulfillment := case
    when v_order_type = 'produto' and v_fulfillment_type = 'retirada' then 'balcao'
    when v_order_type = 'produto' then 'entrega'
    else 'servico'
  end;

  insert into public.sales (
    tenant_id, module_id, client_id, customer_name, customer_phone, payment_method,
    subtotal, discount, total_price, status, source, fulfillment_type, notes
  )
  values (
    v_tenant_id, v_module_id, v_client_id, v_customer_name, v_customer_phone, v_payment_method,
    v_subtotal, 0, v_total, 'concluido', 'whatsapp', v_sale_fulfillment, v_notes
  )
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(v_resolved_items)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_price := (v_item->>'unit_price')::numeric;
    v_line_subtotal := (v_item->>'subtotal')::numeric;

    insert into public.sale_items (
      tenant_id, sale_id, product_id, quantity, unit_price, subtotal, upsell
    )
    values (
      v_tenant_id, v_sale_id, v_product_id, v_quantity, v_unit_price, v_line_subtotal,
      coalesce((v_item->>'upsell')::boolean, false)
    );

    if v_product_id is not null then
      update public.products
      set stock_quantity = stock_quantity - v_quantity,
          updated_at = now()
      where id = v_product_id
        and tenant_id = v_tenant_id
        and module_id = v_module_id
        and stock_quantity >= v_quantity;

      if not found then
        raise exception 'Estoque insuficiente ao baixar produto.';
      end if;
    end if;
  end loop;

  if v_order_type <> 'produto' and v_appointment_id is not null then
    update public.appointments
    set client_id = v_client_id,
        service_type = v_service_type,
        duration_min = coalesce(duration_min, 60),
        price = v_total,
        status = 'agendado',
        source = 'whatsapp',
        customer_name = v_customer_name,
        customer_phone = v_customer_phone,
        description = v_notes,
        notes = v_notes,
        updated_at = now()
    where id = v_appointment_id;
  end if;

  v_operational_order_type := case when v_order_type = 'produto' then 'entrega' else 'servico' end;
  v_operational_status := case when v_order_type = 'produto' then 'separacao' else 'agendado' end;

  update public.service_delivery_orders
  set tenant_id = v_tenant_id,
      module_id = v_module_id,
      client_id = v_client_id,
      session_id = v_session_id,
      source = 'whatsapp',
      order_type = v_operational_order_type,
      status = v_operational_status,
      scheduled_for = v_scheduled_for,
      delivery_address = case when v_fulfillment_type = 'entrega' then v_delivery_address else null end,
      delivery_neighborhood = case when v_fulfillment_type = 'entrega' then v_delivery_neighborhood else null end,
      delivery_city = case when v_fulfillment_type = 'entrega' then v_delivery_city else null end,
      contact_phone = v_customer_phone,
      notes = v_notes,
      updated_at = now()
  where sale_id = v_sale_id
  returning id into v_order_id;

  if v_order_id is null then
    insert into public.service_delivery_orders (
      tenant_id, module_id, sale_id, client_id, session_id, source, order_type, status,
      scheduled_for, delivery_address, delivery_neighborhood, delivery_city, contact_phone, notes, updated_at
    )
    values (
      v_tenant_id, v_module_id, v_sale_id, v_client_id, v_session_id, 'whatsapp', v_operational_order_type, v_operational_status,
      v_scheduled_for,
      case when v_fulfillment_type = 'entrega' then v_delivery_address else null end,
      case when v_fulfillment_type = 'entrega' then v_delivery_neighborhood else null end,
      case when v_fulfillment_type = 'entrega' then v_delivery_city else null end,
      v_customer_phone, v_notes, now()
    )
    returning id into v_order_id;
  end if;

  update public.chat_sessions
  set intent = 'pedido_confirmado',
      context = coalesce(context, '{}'::jsonb) || jsonb_build_object(
        'last_sale_id', v_sale_id,
        'last_order_id', v_order_id,
        'last_appointment_id', v_appointment_id,
        'last_total', v_total
      ),
      last_message_at = now()
  where id = v_session_id;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'order_id', v_order_id,
    'appointment_id', v_appointment_id,
    'total', v_total
  );
end;
$$;

commit;
