-- Teste controlado da transacao final do PetBot.
--
-- Execute este arquivo inteiro no SQL Editor do Supabase. Ele usa registros
-- reais apenas como referencias, cria venda/agendamento dentro da transacao e
-- termina obrigatoriamente com ROLLBACK. Nenhuma venda, baixa de estoque,
-- agendamento, pet ou alteracao de conversa permanece no banco.

begin;

do $petbot_smoke$
declare
  v_tenant_id uuid;
  v_module_id text;
  v_session_id uuid;
  v_client_id uuid;
  v_customer_name text;
  v_customer_phone text;
  v_product_id uuid;
  v_product_price numeric;
  v_product_stock numeric;
  v_service_id uuid;
  v_service_price numeric;
  v_service_species text;
  v_duration integer;
  v_timezone text;
  v_hours jsonb;
  v_lead integer;
  v_interval integer;
  v_capacity integer;
  v_scheduled_at timestamptz;
  v_product_key text := 'smoke-product-' || gen_random_uuid()::text;
  v_vet_key text := 'smoke-vet-' || gen_random_uuid()::text;
  v_conflict_key text := 'smoke-vet-conflict-' || gen_random_uuid()::text;
  v_stock_failure_key text := 'smoke-stock-failure-' || gen_random_uuid()::text;
  v_product_result jsonb;
  v_duplicate_result jsonb;
  v_vet_result jsonb;
  v_product_payload jsonb;
  v_vet_payload jsonb;
  v_sale_id uuid;
  v_order_id uuid;
  v_appointment_id uuid;
  v_count_before integer;
  v_movement_count_before integer;
  v_expected_failure boolean := false;
begin
  if to_regprocedure('public.create_petbot_order_transaction(jsonb)') is null then
    raise exception 'FALHA: RPC create_petbot_order_transaction(jsonb) nao existe.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_sessions'
      and column_name = 'context'
      and udt_name = 'jsonb'
  ) then
    raise exception 'FALHA: chat_sessions.context precisa ser JSONB.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
      and column_name = 'stock_quantity' and data_type = 'numeric'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sale_items'
      and column_name = 'quantity' and data_type = 'numeric'
  ) then
    raise exception 'FALHA: quantidades fracionadas ainda usam integer. Aplique primeiro 20260722005000_fractional_inventory_quantities.sql.';
  end if;

  if coalesce(position(
    'app.yuisync_stock_writer'
    in pg_get_functiondef('public.create_petbot_order_transaction(jsonb)'::regprocedure)
  ), 0) = 0 then
    raise exception 'FALHA: a RPC e o trigger ainda duplicam a auditoria de estoque. Aplique primeiro 20260722006000_petbot_stock_movement_single_writer.sql.';
  end if;

  select
    settings.tenant_id,
    settings.module_id,
    coalesce(nullif(settings.petbot_timezone, ''), 'America/Sao_Paulo'),
    coalesce(settings.petbot_business_hours, '{}'::jsonb),
    greatest(0, coalesce(settings.petbot_booking_lead_time_min, 15)),
    greatest(5, coalesce(settings.petbot_slot_interval_min, 30)),
    greatest(1, coalesce(settings.petbot_booking_capacity, 1))
  into
    v_tenant_id, v_module_id, v_timezone, v_hours, v_lead, v_interval, v_capacity
  from public.settings settings
  where exists (
      select 1 from public.chat_sessions session
      where session.tenant_id = settings.tenant_id
        and session.module_id = settings.module_id
        and session.client_id is not null
    )
    and exists (
      select 1 from public.products product
      where product.tenant_id = settings.tenant_id
        and product.module_id = settings.module_id
        and product.active = true
        and coalesce(product.price, 0) > 0
        and coalesce(product.stock_quantity, 0) >= 2
        and lower(coalesce(product.bot_metadata->>'product_type', 'produto')) <> 'servico'
        and lower(coalesce(product.category, '')) not in ('servico', 'serviço', 'banho', 'tosa', 'veterinaria', 'veterinária')
    )
    and exists (
      select 1 from public.products service
      where service.tenant_id = settings.tenant_id
        and service.module_id = settings.module_id
        and service.active = true
        and coalesce(service.price, 0) > 0
        and (
          lower(coalesce(service.bot_metadata->>'service_group', service.bot_metadata->>'group_type', '')) in ('veterinaria', 'veterinary', 'vet')
          or lower(coalesce(service.category, '')) in ('veterinaria', 'veterinária')
          or lower(coalesce(service.name, '')) ~ '(consulta|vacina|veterin)'
        )
    )
  order by settings.updated_at desc nulls last
  limit 1;

  if v_tenant_id is null then
    raise exception 'FALHA: nao ha tenant com sessao, produto em estoque e servico veterinario para o teste.';
  end if;

  select session.id, session.client_id, client.name, client.phone
  into v_session_id, v_client_id, v_customer_name, v_customer_phone
  from public.chat_sessions session
  join public.clients client
    on client.id = session.client_id
   and client.tenant_id = session.tenant_id
   and client.module_id = session.module_id
  where session.tenant_id = v_tenant_id
    and session.module_id = v_module_id
  order by session.last_message_at desc nulls last
  limit 1;

  select product.id, product.price, product.stock_quantity
  into v_product_id, v_product_price, v_product_stock
  from public.products product
  where product.tenant_id = v_tenant_id
    and product.module_id = v_module_id
    and product.active = true
    and coalesce(product.price, 0) > 0
    and coalesce(product.stock_quantity, 0) >= 2
    and lower(coalesce(product.bot_metadata->>'product_type', 'produto')) <> 'servico'
    and lower(coalesce(product.category, '')) not in ('servico', 'serviço', 'banho', 'tosa', 'veterinaria', 'veterinária')
  order by product.stock_quantity desc, product.id
  limit 1;

  select
    service.id,
    service.price,
    coalesce(public.infer_petbot_service_species(
      service.bot_metadata->>'species',
      service.species_target,
      service.name,
      service.category
    ), 'dog'),
    greatest(15, case
      when coalesce(service.bot_metadata->>'duration_min', '') ~ '^\d+$'
        then (service.bot_metadata->>'duration_min')::integer
      when coalesce(service.bot_metadata->>'service_duration_min', '') ~ '^\d+$'
        then (service.bot_metadata->>'service_duration_min')::integer
      else 60
    end)
  into v_service_id, v_service_price, v_service_species, v_duration
  from public.products service
  where service.tenant_id = v_tenant_id
    and service.module_id = v_module_id
    and service.active = true
    and coalesce(service.price, 0) > 0
    -- A RPC considera primeiro bot_metadata.species e depois species_target.
    -- O smoke precisa usar exatamente a mesma precedencia para nao montar um
    -- payload de cachorro com um servico efetivamente felino (ou vice-versa).
    and (
      nullif(trim(coalesce(service.bot_metadata->>'species', service.species_target)), '') is null
      or public.normalize_petshop_catalog_text(
        coalesce(service.bot_metadata->>'species', service.species_target)
      ) in (
        'dog', 'cao', 'caes', 'cachorro', 'cachorra', 'canino', 'canina',
        'cat', 'gato', 'gata', 'felino', 'felina',
        'other', 'outro', 'outra'
      )
    )
    and (
      lower(coalesce(service.bot_metadata->>'product_type', '')) = 'servico'
      or lower(coalesce(service.category, '')) in ('servico', 'serviço', 'banho', 'tosa', 'veterinaria', 'veterinária')
      or lower(coalesce(service.name, '')) ~ '(banho|tosa|consulta|vacina|exame|cirurg|hidrat|escovac|desembolo)'
    )
    and (
      lower(coalesce(service.bot_metadata->>'service_group', service.bot_metadata->>'group_type', '')) in ('veterinaria', 'veterinary', 'vet')
      or lower(coalesce(service.category, '')) in ('veterinaria', 'veterinária')
      or lower(coalesce(service.name, '')) ~ '(consulta|vacina|veterin)'
    )
  order by service.price, service.id
  limit 1;

  if v_session_id is null or v_client_id is null or v_product_id is null or v_service_id is null then
    raise exception 'FALHA: referencias operacionais incompletas para executar o teste.';
  end if;

  v_product_payload := jsonb_build_object(
    'session_id', v_session_id,
    'tenant_id', v_tenant_id,
    'module_id', v_module_id,
    'idempotency_key', v_product_key,
    'client_id', v_client_id,
    'order_type', 'produto',
    'customer_name', coalesce(v_customer_name, 'Cliente teste'),
    'customer_phone', coalesce(v_customer_phone, 'sem telefone'),
    'items', jsonb_build_array(jsonb_build_object('product_id', v_product_id, 'quantity', 0.5)),
    'fulfillment_type', 'retirada',
    'payment_method', 'a_combinar',
    'expected_total', v_product_price * 0.5,
    'notes', 'Teste transacional descartavel do PetBot'
  );

  select public.create_petbot_order_transaction(v_product_payload) into v_product_result;
  v_sale_id := (v_product_result->>'sale_id')::uuid;
  v_order_id := (v_product_result->>'order_id')::uuid;

  if coalesce((v_product_result->>'duplicated')::boolean, true)
    or v_sale_id is null or v_order_id is null then
    raise exception 'FALHA: primeira venda nao foi concluida: %', v_product_result;
  end if;

  if not exists (
    select 1 from public.sale_items item
    where item.sale_id = v_sale_id
      and item.product_id = v_product_id
      and item.quantity = 0.5
  ) then
    raise exception 'FALHA: item fracionado nao foi gravado na venda.';
  end if;

  if not exists (
    select 1
    from public.sales sale
    where sale.id = v_sale_id
      and sale.payment_method = 'a_combinar'
      and sale.payment_status = 'a_receber'
      and sale.status = 'pendente'
      and sale.fulfillment_type = 'balcao'
  ) then
    raise exception 'FALHA: retirada nao foi registrada como pagamento a combinar.';
  end if;

  if not exists (
    select 1
    from public.service_delivery_orders delivery_order
    where delivery_order.id = v_order_id
      and delivery_order.status = 'pendente'
      and delivery_order.payment_status = 'a_receber'
  ) then
    raise exception 'FALHA: retirada nao apareceu na aba Pendente.';
  end if;

  if not exists (
    select 1 from public.stock_movements movement
    where movement.sale_id = v_sale_id
      and movement.product_id = v_product_id
      and movement.quantity = -0.5
  ) then
    raise exception 'FALHA: baixa de estoque da venda nao foi auditada.';
  end if;

  select count(*) into v_movement_count_before
  from public.stock_movements
  where sale_id = v_sale_id;

  if v_movement_count_before <> 1 then
    raise exception 'FALHA: primeira venda gerou % movimentos de estoque; esperado: 1.', v_movement_count_before;
  end if;

  if not exists (
    select 1 from public.products product
    where product.id = v_product_id
      and abs(product.stock_quantity - (v_product_stock - 0.5)) < 0.0001
  ) then
    raise exception 'FALHA: estoque nao foi descontado exatamente uma vez.';
  end if;

  select public.create_petbot_order_transaction(v_product_payload) into v_duplicate_result;
  if not coalesce((v_duplicate_result->>'duplicated')::boolean, false)
    or v_duplicate_result->>'sale_id' <> v_product_result->>'sale_id' then
    raise exception 'FALHA: repeticao da confirmacao criou resultado diferente: %', v_duplicate_result;
  end if;

  if (select count(*) from public.stock_movements where sale_id = v_sale_id) <> v_movement_count_before then
    raise exception 'FALHA: confirmacao duplicada movimentou o estoque novamente.';
  end if;

  select count(*) into v_count_before
  from public.sales
  where tenant_id = v_tenant_id and module_id = v_module_id;

  v_expected_failure := false;
  begin
    perform public.create_petbot_order_transaction(
      v_product_payload
      || jsonb_build_object(
        'idempotency_key', v_stock_failure_key,
        'items', jsonb_build_array(jsonb_build_object(
          'product_id', v_product_id,
          'quantity', v_product_stock + 1
        )),
        'expected_total', v_product_price * (v_product_stock + 1)
      )
    );
  exception when others then
    if position('Estoque insuficiente' in sqlerrm) > 0 then
      v_expected_failure := true;
    else
      raise;
    end if;
  end;

  if not v_expected_failure then
    raise exception 'FALHA: venda acima do estoque foi aceita.';
  end if;
  if (select count(*) from public.sales where tenant_id = v_tenant_id and module_id = v_module_id) <> v_count_before then
    raise exception 'FALHA: a tentativa sem estoque deixou uma venda parcial.';
  end if;

  with days as (
    select generate_series(
      (now() at time zone v_timezone)::date,
      (now() at time zone v_timezone)::date + 30,
      interval '1 day'
    )::date as service_day
  ), periods as (
    select days.service_day, period
    from days
    cross join lateral jsonb_array_elements(
      coalesce(v_hours->(extract(isodow from days.service_day)::integer::text), '[]'::jsonb)
    ) period
    where coalesce(period->>'open', '') ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'
      and coalesce(period->>'close', '') ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'
      and extract(epoch from ((period->>'close')::time - (period->>'open')::time)) / 60 >= v_duration
  ), candidates as (
    select
      ((periods.service_day + (periods.period->>'open')::time) at time zone v_timezone)
        + make_interval(mins => slot_number * v_interval) as scheduled_at
    from periods
    cross join lateral generate_series(
      0,
      greatest(0, floor(
        (extract(epoch from ((periods.period->>'close')::time - (periods.period->>'open')::time)) / 60 - v_duration)
        / v_interval
      )::integer)
    ) slot_number
  )
  select candidate.scheduled_at
  into v_scheduled_at
  from candidates candidate
  where candidate.scheduled_at >= now() + make_interval(mins => v_lead)
    and (
      select count(*)
      from public.appointments appointment
      where appointment.tenant_id = v_tenant_id
        and appointment.module_id = v_module_id
        and lower(coalesce(appointment.status, '')) in (
          'agendado', 'confirmado', 'em_andamento', 'booked', 'ocupado',
          'blocked', 'bloqueado', 'scheduled', 'pendente'
        )
        and appointment.scheduled_at < candidate.scheduled_at + make_interval(mins => v_duration)
        and appointment.scheduled_at + make_interval(mins => greatest(15, coalesce(appointment.duration_min, 60))) > candidate.scheduled_at
    ) < v_capacity
  order by candidate.scheduled_at
  limit 1;

  if v_scheduled_at is null then
    raise exception 'FALHA: nao foi encontrado horario veterinario livre nos proximos 30 dias.';
  end if;

  v_vet_payload := jsonb_build_object(
    'session_id', v_session_id,
    'tenant_id', v_tenant_id,
    'module_id', v_module_id,
    'idempotency_key', v_vet_key,
    'client_id', v_client_id,
    'order_type', 'veterinaria',
    'customer_name', coalesce(v_customer_name, 'Cliente teste'),
    'customer_phone', coalesce(v_customer_phone, 'sem telefone'),
    'pet_name', '__PETBOT_SMOKE_TEST__',
    'species', v_service_species,
    'breed', 'SRD',
    'service_product_id', v_service_id,
    'scheduled_at', v_scheduled_at,
    'expected_total', v_service_price,
    'notes', 'Sintoma teste; operacao descartavel'
  );

  select public.create_petbot_order_transaction(v_vet_payload) into v_vet_result;
  v_appointment_id := (v_vet_result->>'appointment_id')::uuid;

  if coalesce((v_vet_result->>'duplicated')::boolean, true)
    or v_appointment_id is null then
    raise exception 'FALHA: agendamento veterinario nao foi concluido: %', v_vet_result;
  end if;

  if not exists (
    select 1
    from public.appointments appointment
    where appointment.id = v_appointment_id
      and appointment.source = 'whatsapp'
      and appointment.status = 'agendado'
      and appointment.scheduled_at = v_scheduled_at
  ) then
    raise exception 'FALHA: agendamento veterinario nao apareceu corretamente na agenda.';
  end if;

  if not exists (
    select 1
    from public.sales sale
    where sale.id = (v_vet_result->>'sale_id')::uuid
      and sale.payment_status = 'a_receber'
      and sale.fulfillment_type = 'servico'
  ) then
    raise exception 'FALHA: servico veterinario nao ficou a receber.';
  end if;

  select public.create_petbot_order_transaction(v_vet_payload) into v_duplicate_result;
  if not coalesce((v_duplicate_result->>'duplicated')::boolean, false)
    or v_duplicate_result->>'appointment_id' <> v_vet_result->>'appointment_id' then
    raise exception 'FALHA: confirmacao veterinaria duplicada nao foi idempotente.';
  end if;

  select count(*) into v_count_before
  from public.sales
  where tenant_id = v_tenant_id and module_id = v_module_id;

  v_expected_failure := false;
  begin
    perform public.create_petbot_order_transaction(
      (v_vet_payload - 'scheduled_at')
      || jsonb_build_object(
        'idempotency_key', v_conflict_key,
        'appointment_id', v_appointment_id,
        'pet_name', '__PETBOT_SMOKE_CONFLICT__'
      )
    );
  exception when others then
    if position('Horario nao esta mais disponivel' in sqlerrm) > 0 then
      v_expected_failure := true;
    else
      raise;
    end if;
  end;

  if not v_expected_failure then
    raise exception 'FALHA: o mesmo horario veterinario foi confirmado duas vezes.';
  end if;
  if (select count(*) from public.sales where tenant_id = v_tenant_id and module_id = v_module_id) <> v_count_before then
    raise exception 'FALHA: conflito de agenda deixou venda parcial.';
  end if;

  if not exists (
    select 1
    from public.chat_sessions session
    where session.id = v_session_id
      and session.context->>'last_appointment_id' = v_appointment_id::text
      and session.context->>'last_petbot_idempotency_key' = v_vet_key
  ) then
    raise exception 'FALHA: resultado final nao foi persistido no contexto da conversa.';
  end if;

  raise notice 'SUCESSO: venda, estoque, idempotencia, veterinaria, conflito e contexto foram validados. O ROLLBACK removera todos os dados de teste.';
end
$petbot_smoke$;

rollback;
