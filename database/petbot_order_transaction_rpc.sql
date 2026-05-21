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
  add column if not exists service_date date,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists source text default 'agenda',
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists description text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.settings
  add column if not exists pet_transport_fee numeric(10,2) not null default 20.00;

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
  v_pet_id uuid;
  v_pet_name text := coalesce(nullif(trim(p_payload->>'pet_name'), ''), 'Pet');
  v_pet_species text := coalesce(nullif(trim(p_payload->>'species'), ''), 'dog');
  v_pet_breed text := nullif(trim(p_payload->>'breed'), '');
  v_pet_size text := nullif(trim(p_payload->>'size'), '');
  v_order_type text := coalesce(nullif(trim(p_payload->>'order_type'), ''), 'produto');
  v_payment_method text := nullif(trim(p_payload->>'payment_method'), '');
  v_fulfillment_type text := nullif(trim(p_payload->>'fulfillment_type'), '');
  v_delivery_address text := nullif(trim(p_payload->>'delivery_address'), '');
  v_delivery_neighborhood text := nullif(trim(p_payload->>'delivery_neighborhood'), '');
  v_delivery_city text := nullif(trim(p_payload->>'delivery_city'), '');
  v_delivery_reference text := nullif(trim(p_payload->>'delivery_reference'), '');
  v_delivery_fee numeric := coalesce(nullif(p_payload->>'delivery_fee', '')::numeric, 10);
  v_service_transport_fee numeric := coalesce(nullif(p_payload->>'service_transport_fee', '')::numeric, 0);
  v_service_transport_address text := nullif(trim(p_payload->>'service_transport_address'), '');
  v_service_transport_neighborhood text := nullif(trim(p_payload->>'service_transport_neighborhood'), '');
  v_service_transport_city text := nullif(trim(p_payload->>'service_transport_city'), '');
  v_service_transport_reference text := nullif(trim(p_payload->>'service_transport_reference'), '');
  v_service_grooming_detail text := nullif(trim(p_payload->>'service_grooming_detail'), '');
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
  v_service_duration integer := 60;
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

  select coalesce(nullif(context::text, ''), '{}')::jsonb
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

  if v_order_type = 'produto' and v_payment_method not in ('pix', 'dinheiro', 'cartao') then
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
    if v_pet_species not in ('dog', 'cat', 'bird', 'rabbit', 'fish', 'other') then
      v_pet_species := case
        when lower(v_pet_species) in ('cachorro', 'cao', 'cão') then 'dog'
        when lower(v_pet_species) in ('gato', 'gata') then 'cat'
        else 'other'
      end;
    end if;

    select id
      into v_pet_id
    from public.pets
    where module_id = v_module_id
      and phone = coalesce(v_customer_phone, '')
      and lower(pet_name) = lower(v_pet_name)
    order by updated_at desc nulls last, created_at desc nulls last
    limit 1;

    if v_pet_id is null then
      insert into public.pets (
        owner_name, phone, pet_name, species, breed, notes, module_id, updated_at
      )
      values (
        v_customer_name,
        coalesce(v_customer_phone, 'sem telefone'),
        v_pet_name,
        v_pet_species,
        v_pet_breed,
        array_to_string(array_remove(array[
          case when v_pet_size is not null then 'Porte/tamanho: ' || v_pet_size end,
          case when nullif(trim(p_payload->>'symptom'), '') is not null then 'Sintoma: ' || nullif(trim(p_payload->>'symptom'), '') end,
          'Cadastro automatico PetBot'
        ], null), ' | '),
        v_module_id,
        now()
      )
      returning id into v_pet_id;
    end if;

    v_appointment_id := nullif(p_payload->>'appointment_id', '')::uuid;
    v_service_duration := greatest(15, coalesce(nullif(p_payload->>'duration_min', '')::integer, nullif(v_items->0->>'duration_min', '')::integer, 60));

    select id, service_type, scheduled_at, status, price, duration_min
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
      v_appointment_id := null;
      v_scheduled_for := nullif(p_payload->>'scheduled_at', '')::timestamptz;
      if v_scheduled_for is null then
        raise exception 'Horario real da agenda ausente.';
      end if;

      if exists (
        select 1
        from public.appointments
        where tenant_id = v_tenant_id
          and module_id = v_module_id
          and lower(coalesce(status, '')) in ('agendado', 'confirmado', 'em_andamento', 'booked', 'ocupado', 'blocked', 'bloqueado')
          and scheduled_at < v_scheduled_for + make_interval(mins => v_service_duration)
          and scheduled_at + make_interval(mins => greatest(15, coalesce(duration_min, 60))) > v_scheduled_for
      ) then
        raise exception 'Horario nao esta mais disponivel.';
      end if;

      v_service_type := coalesce(nullif(v_service_type, ''), v_order_type);
      v_subtotal := coalesce(nullif((v_items->0->>'unit_price'), '')::numeric, 0);
      if v_subtotal <= 0 then
        raise exception 'Servico sem preco valido.';
      end if;
    else
      if translate(lower(coalesce(v_appointment.status, '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc') not in ('available', 'disponivel', 'livre', 'aberto', 'open') then
        raise exception 'Horario nao esta mais disponivel.';
      end if;
      if coalesce(v_appointment.price, 0) <= 0 then
        raise exception 'Servico sem preco valido.';
      end if;

      v_appointment_id := v_appointment.id;
      v_scheduled_for := v_appointment.scheduled_at;
      v_service_duration := greatest(15, coalesce(v_appointment.duration_min, v_service_duration, 60));
      if exists (
        select 1
        from public.appointments
        where tenant_id = v_tenant_id
          and module_id = v_module_id
          and id <> v_appointment_id
          and lower(coalesce(status, '')) in ('agendado', 'confirmado', 'em_andamento', 'booked', 'ocupado', 'blocked', 'bloqueado')
          and scheduled_at < v_scheduled_for + make_interval(mins => v_service_duration)
          and scheduled_at + make_interval(mins => greatest(15, coalesce(duration_min, 60))) > v_scheduled_for
      ) then
        raise exception 'Horario nao esta mais disponivel.';
      end if;
      v_service_type := coalesce(nullif(v_appointment.service_type, ''), v_service_type, v_order_type);
      v_subtotal := v_appointment.price;
    end if;

    v_service_type := case
      when lower(coalesce(v_service_type, '')) like '%vacina%' then 'vacina'
      when v_order_type = 'veterinaria'
        or lower(coalesce(v_service_type, '')) like '%consulta%'
        or lower(coalesce(v_service_type, '')) like '%vet%' then 'consulta'
      when lower(coalesce(v_service_type, '')) like '%banho%' and lower(coalesce(v_service_type, '')) like '%tosa%' then 'banho_e_tosa'
      when lower(coalesce(v_service_type, '')) like '%tosa%' then 'tosa'
      when lower(coalesce(v_service_type, '')) like '%banho%' then 'banho'
      else 'outro'
    end;

    if v_service_transport_fee > 0
      and (v_service_transport_address is null or v_service_transport_address !~ '[0-9]' or v_service_transport_neighborhood is null or v_service_transport_reference is null)
    then
      raise exception 'Endereco do transporte do pet incompleto.';
    end if;

    v_resolved_items := jsonb_build_array(jsonb_build_object(
      'product_id', null,
      'name', v_service_type,
      'quantity', 1,
      'unit_price', v_subtotal,
      'subtotal', v_subtotal,
      'upsell', false
    ));
  end if;

  v_total := v_subtotal
    + case when v_order_type = 'produto' and v_fulfillment_type = 'entrega' then v_delivery_fee else 0 end
    + case when v_order_type <> 'produto' then v_service_transport_fee else 0 end;

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
    case when v_service_grooming_detail is not null then 'Acabamento: ' || v_service_grooming_detail end,
    case when v_service_transport_fee > 0 then 'Transporte pet: R$ ' || to_char(v_service_transport_fee, 'FM999999990.00') end,
    case when v_service_transport_fee > 0 then 'Buscar pet em: ' || concat_ws(' - ', v_service_transport_address, v_service_transport_neighborhood, v_service_transport_city) end,
    v_notes_input,
    case when v_fulfillment_type = 'retirada' then 'Retirada na loja' end,
    case when v_fulfillment_type = 'entrega' then 'Taxa de entrega: R$ ' || to_char(v_delivery_fee, 'FM999999990.00') end,
    case when v_delivery_reference is not null then 'Referencia: ' || v_delivery_reference end,
    case when v_service_transport_reference is not null then 'Referencia transporte: ' || v_service_transport_reference end,
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

  if v_order_type = 'produto' then
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
    end loop;
  end if;

  if v_order_type <> 'produto' then
    if v_appointment_id is not null then
      update public.appointments
      set client_id = v_client_id,
          pet_id = v_pet_id,
          service_type = v_service_type,
          duration_min = coalesce(duration_min, v_service_duration, 60),
          price = v_subtotal,
          status = 'agendado',
          source = 'whatsapp',
          customer_name = v_customer_name,
          customer_phone = v_customer_phone,
          description = v_notes,
          notes = v_notes,
          updated_at = now()
      where id = v_appointment_id;
    else
      insert into public.appointments (
        tenant_id, module_id, client_id, pet_id, service_type, scheduled_at, service_date, start_time, end_time, duration_min,
        price, status, source, customer_name, customer_phone, description, notes
      )
      values (
        v_tenant_id, v_module_id, v_client_id, v_pet_id, v_service_type, v_scheduled_for,
        (v_scheduled_for at time zone 'America/Sao_Paulo')::date,
        (v_scheduled_for at time zone 'America/Sao_Paulo')::time,
        ((v_scheduled_for + make_interval(mins => v_service_duration)) at time zone 'America/Sao_Paulo')::time,
        v_service_duration,
        v_subtotal, 'agendado', 'whatsapp', v_customer_name, v_customer_phone, v_notes, v_notes
      )
      returning id into v_appointment_id;
    end if;
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
      delivery_address = case when v_fulfillment_type = 'entrega' then v_delivery_address when v_service_transport_fee > 0 then v_service_transport_address else null end,
      delivery_neighborhood = case when v_fulfillment_type = 'entrega' then v_delivery_neighborhood when v_service_transport_fee > 0 then v_service_transport_neighborhood else null end,
      delivery_city = case when v_fulfillment_type = 'entrega' then v_delivery_city when v_service_transport_fee > 0 then v_service_transport_city else null end,
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
      case when v_fulfillment_type = 'entrega' then v_delivery_address when v_service_transport_fee > 0 then v_service_transport_address else null end,
      case when v_fulfillment_type = 'entrega' then v_delivery_neighborhood when v_service_transport_fee > 0 then v_service_transport_neighborhood else null end,
      case when v_fulfillment_type = 'entrega' then v_delivery_city when v_service_transport_fee > 0 then v_service_transport_city else null end,
      v_customer_phone, v_notes, now()
    )
    returning id into v_order_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_sessions'
      and column_name = 'context'
      and udt_name = 'jsonb'
  ) then
    update public.chat_sessions
    set intent = 'pedido_confirmado',
        context = coalesce(context::jsonb, '{}'::jsonb) || jsonb_build_object(
          'last_sale_id', v_sale_id,
          'last_order_id', v_order_id,
          'last_appointment_id', v_appointment_id,
          'last_total', v_total
        ),
        last_message_at = now()
    where id = v_session_id;
  else
    update public.chat_sessions
    set intent = 'pedido_confirmado',
        context = (
          coalesce(nullif(context::text, ''), '{}')::jsonb || jsonb_build_object(
            'last_sale_id', v_sale_id,
            'last_order_id', v_order_id,
            'last_appointment_id', v_appointment_id,
            'last_total', v_total
          )
        )::text,
        last_message_at = now()
    where id = v_session_id;
  end if;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'order_id', v_order_id,
    'appointment_id', v_appointment_id,
    'total', v_total
  );
end;
$$;

commit;
