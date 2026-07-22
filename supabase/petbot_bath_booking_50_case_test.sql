-- PetBot: 50 testes mistos do fluxo de agendamento de banho.
--
-- Este arquivo foi feito para ser executado dentro de uma transacao externa
-- que termina em ROLLBACK (scripts/supabase-management.mjs check). Ele usa o
-- catalogo, a agenda e uma sessao reais apenas como referencias. Todos os pets,
-- vendas, ordens, commits e agendamentos criados durante o teste sao descartados.

create temporary table petbot_bath_test_results (
  test_no integer primary key,
  scenario text not null,
  passed boolean not null,
  detail text
) on commit drop;

create or replace function pg_temp.petbot_record_result(
  p_test_no integer,
  p_scenario text,
  p_passed boolean,
  p_detail text default null
)
returns void
language plpgsql
as $$
begin
  insert into petbot_bath_test_results(test_no, scenario, passed, detail)
  values (p_test_no, p_scenario, coalesce(p_passed, false), nullif(p_detail, ''));
end;
$$;

create or replace function pg_temp.petbot_expect_error(
  p_payload jsonb,
  p_expected_fragment text,
  p_test_no integer,
  p_scenario text
)
returns void
language plpgsql
as $$
declare
  v_succeeded boolean := false;
  v_error text := null;
begin
  -- A excecao sentinela tambem desfaz uma operacao que tenha sido aceita por
  -- engano, permitindo que os outros cenarios continuem sem contaminacao.
  begin
    perform public.create_petbot_order_transaction(p_payload);
    v_succeeded := true;
    raise exception '__PETBOT_TEST_ROLLBACK__';
  exception when others then
    if sqlerrm <> '__PETBOT_TEST_ROLLBACK__' then
      v_error := sqlerrm;
    end if;
  end;

  perform pg_temp.petbot_record_result(
    p_test_no,
    p_scenario,
    not v_succeeded
      and position(lower(p_expected_fragment) in lower(coalesce(v_error, ''))) > 0,
    case
      when v_succeeded then 'A operacao foi aceita, mas deveria ter sido recusada.'
      else coalesce(v_error, 'Nenhuma mensagem de erro foi retornada.')
    end
  );
end;
$$;

do $petbot_bath_50$
declare
  v_tenant_id uuid;
  v_module_id text;
  v_session_id uuid;
  v_client_id uuid;
  v_customer_name text;
  v_customer_phone text;
  v_service_id uuid;
  v_service_name text;
  v_service_price numeric;
  v_service_species text;
  v_service_coat text;
  v_service_weight_min numeric;
  v_service_weight_max numeric;
  v_duration integer;
  v_product_id uuid;
  v_timezone text;
  v_hours jsonb;
  v_lead integer;
  v_interval integer;
  v_capacity integer;
  v_scheduled_at timestamptz;
  v_alt_scheduled_at timestamptz;
  v_future_date date;
  v_future_weekday text;
  v_outside_at timestamptz;
  v_off_grid_at timestamptz;
  v_pet_name text := '__PETBOT_BATH_50_' || replace(gen_random_uuid()::text, '-', '') || '__';
  v_key_prefix text := 'bath-50-' || gen_random_uuid()::text;
  v_base jsonb;
  v_result jsonb;
  v_duplicate jsonb;
  v_sale_id uuid;
  v_order_id uuid;
  v_appointment_id uuid;
  v_counts_before jsonb;
  v_counts_after jsonb;
  v_case_succeeded boolean;
  v_case_error text;
  v_active_canonical integer;
begin
  if to_regprocedure('public.create_petbot_order_transaction(jsonb)') is null then
    raise exception 'PRECONDICAO: RPC create_petbot_order_transaction(jsonb) ausente.';
  end if;
  if to_regprocedure('public.infer_petbot_service_species(text,text,text,text)') is null then
    raise exception 'PRECONDICAO: infer_petbot_service_species(...) ausente.';
  end if;
  if to_regprocedure('public.is_petbot_service_catalog_product(text,text,jsonb)') is null then
    raise exception 'PRECONDICAO: classificador unico do catalogo ausente.';
  end if;

  select
    service.tenant_id,
    service.module_id,
    service.id,
    service.name,
    service.price,
    public.infer_petbot_service_species(
      service.bot_metadata->>'species',
      service.species_target,
      service.name,
      service.category
    ),
    nullif(lower(trim(service.bot_metadata->>'coat_type')), ''),
    case
      when coalesce(service.bot_metadata->>'weight_min_kg', '') ~ '^\d+(\.\d+)?$'
        then (service.bot_metadata->>'weight_min_kg')::numeric
    end,
    case
      when coalesce(service.bot_metadata->>'weight_max_kg', '') ~ '^\d+(\.\d+)?$'
        then (service.bot_metadata->>'weight_max_kg')::numeric
    end,
    greatest(15, case
      when coalesce(service.bot_metadata->>'duration_min', '') ~ '^\d+$'
        then (service.bot_metadata->>'duration_min')::integer
      when coalesce(service.bot_metadata->>'service_duration_min', '') ~ '^\d+$'
        then (service.bot_metadata->>'service_duration_min')::integer
      else 60
    end),
    coalesce(nullif(settings.petbot_timezone, ''), 'America/Sao_Paulo'),
    coalesce(settings.petbot_business_hours, '{}'::jsonb),
    greatest(0, coalesce(settings.petbot_booking_lead_time_min, 15)),
    greatest(5, coalesce(settings.petbot_slot_interval_min, 30)),
    greatest(1, coalesce(settings.petbot_booking_capacity, 1))
  into
    v_tenant_id,
    v_module_id,
    v_service_id,
    v_service_name,
    v_service_price,
    v_service_species,
    v_service_coat,
    v_service_weight_min,
    v_service_weight_max,
    v_duration,
    v_timezone,
    v_hours,
    v_lead,
    v_interval,
    v_capacity
  from public.products service
  join public.settings settings
    on settings.tenant_id = service.tenant_id
   and settings.module_id = service.module_id
  where service.active = true
    and coalesce(service.price, 0) > 0
    and public.normalize_petshop_catalog_text(service.name)
      like 'banho pet porte pequeno 0 kg a 10 kg%'
    and public.infer_petbot_service_species(
      service.bot_metadata->>'species', service.species_target, service.name, service.category
    ) = 'dog'
    and exists (
      select 1
      from public.chat_sessions session
      join public.clients client
        on client.id = session.client_id
       and client.tenant_id = session.tenant_id
       and client.module_id = session.module_id
      where session.tenant_id = service.tenant_id
        and session.module_id = service.module_id
        and not exists (
          select 1
          from public.client_subscriptions subscription
          where subscription.tenant_id = session.tenant_id
            and subscription.module_id = session.module_id
            and subscription.client_id = session.client_id
            and subscription.status = 'active'
        )
    )
  order by service.updated_at desc nulls last, service.id
  limit 1;

  if v_service_id is null then
    raise exception 'PRECONDICAO: servico canonico de banho pequeno nao encontrado.';
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
    and not exists (
      select 1
      from public.client_subscriptions subscription
      where subscription.tenant_id = session.tenant_id
        and subscription.module_id = session.module_id
        and subscription.client_id = session.client_id
        and subscription.status = 'active'
    )
  order by session.last_message_at desc nulls last
  limit 1;

  select product.id into v_product_id
  from public.products product
  where product.tenant_id = v_tenant_id
    and product.module_id = v_module_id
    and product.active = true
    and public.normalize_petshop_catalog_text(product.name) ~ 'banho (a )?seco'
  order by product.updated_at desc nulls last, product.id
  limit 1;

  if v_session_id is null or v_client_id is null or v_product_id is null then
    raise exception 'PRECONDICAO: sessao, cliente ou produto banho a seco indisponivel para os testes.';
  end if;

  with days as (
    select generate_series(
      (now() at time zone v_timezone)::date,
      (now() at time zone v_timezone)::date + 60,
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
  ), available as (
    select candidate.scheduled_at
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
          and appointment.scheduled_at
            + make_interval(mins => greatest(15, coalesce(appointment.duration_min, 60)))
            > candidate.scheduled_at
      ) < v_capacity
  ), first_slot as (
    select min(scheduled_at) as scheduled_at from available
  )
  select
    first_slot.scheduled_at,
    min(available.scheduled_at) filter (
      where available.scheduled_at >= first_slot.scheduled_at + make_interval(mins => v_duration)
    )
  into v_scheduled_at, v_alt_scheduled_at
  from first_slot
  cross join available
  group by first_slot.scheduled_at;

  if v_scheduled_at is null or v_alt_scheduled_at is null then
    raise exception 'PRECONDICAO: dois horarios livres nao foram encontrados nos proximos 60 dias.';
  end if;

  select count(*) into v_active_canonical
  from public.products service
  where service.tenant_id = v_tenant_id
    and service.module_id = v_module_id
    and service.active = true
    and public.normalize_petshop_catalog_text(service.name)
      like 'banho pet porte pequeno 0 kg a 10 kg%';

  perform pg_temp.petbot_record_result(
    1, '[01/50] catalogo possui um unico banho pequeno canonico ativo',
    v_active_canonical = 1, 'Quantidade encontrada: ' || v_active_canonical
  );
  perform pg_temp.petbot_record_result(
    2, '[02/50] banho canonico esta ativo, classificado como servico e com preco',
    v_service_price > 0 and exists (
      select 1 from public.products service
      where service.id = v_service_id
        and service.active = true
        and public.is_petbot_service_catalog_product(
          service.name, service.category, service.bot_metadata
        )
    ),
    v_service_name
  );
  perform pg_temp.petbot_record_result(
    3, '[03/50] banho pequeno canonico pertence a cachorro',
    v_service_species = 'dog', 'Especie efetiva: ' || coalesce(v_service_species, 'nula')
  );
  perform pg_temp.petbot_record_result(
    4, '[04/50] faixa real do banho pequeno esta gravada como 0 a 10 kg',
    v_service_weight_min = 0 and v_service_weight_max = 10,
    format('weight_min=%s; weight_max=%s', coalesce(v_service_weight_min::text, 'nulo'), coalesce(v_service_weight_max::text, 'nulo'))
  );
  perform pg_temp.petbot_record_result(
    5, '[05/50] servicos com gato no nome possuem especie felina',
    not exists (
      select 1
      from public.products service
      where service.tenant_id = v_tenant_id
        and service.module_id = v_module_id
        and service.active = true
        and public.normalize_petshop_catalog_text(service.name) ~ '(^| )(gato|gata|felino|felina)( |$)'
        and public.is_petbot_service_catalog_product(
          service.name, service.category, service.bot_metadata
        )
        and public.infer_petbot_service_species(
          service.bot_metadata->>'species', service.species_target, service.name, service.category
        ) is distinct from 'cat'
    ),
    'Nenhum servico felino pode ser oferecido como canino.'
  );
  perform pg_temp.petbot_record_result(
    6, '[06/50] banho a seco e pacote de banho nao aparecem como servico de agenda',
    not exists (
      select 1
      from public.products product
      where product.tenant_id = v_tenant_id
        and product.module_id = v_module_id
        and product.active = true
        and (
          public.normalize_petshop_catalog_text(product.name) ~ 'banho (a )?seco'
          or public.normalize_petshop_catalog_text(product.name) ~ '(pacote.*banho|banho.*pacote)'
        )
        and public.is_petbot_service_catalog_product(
          product.name, product.category, product.bot_metadata
        )
    ) and not exists (
      select 1
      from public.petshop_services service
      join public.products product on product.id = service.source_product_id
      where service.tenant_id = v_tenant_id
        and service.module_id = v_module_id
        and service.active = true
        and (
          public.normalize_petshop_catalog_text(product.name) ~ 'banho (a )?seco'
          or public.normalize_petshop_catalog_text(product.name) ~ '(pacote.*banho|banho.*pacote)'
        )
    ),
    'Banho a seco e pacote de banho devem permanecer fora da agenda.'
  );

  v_base := jsonb_strip_nulls(jsonb_build_object(
    'session_id', v_session_id,
    'tenant_id', v_tenant_id,
    'module_id', v_module_id,
    'idempotency_key', v_key_prefix || '-valid',
    'client_id', v_client_id,
    'order_type', 'banho_tosa',
    'customer_name', coalesce(v_customer_name, 'Cliente teste'),
    'customer_phone', coalesce(v_customer_phone, 'sem telefone'),
    'pet_name', v_pet_name,
    'species', 'dog',
    'breed', 'Shih Tzu',
    'weight_kg', 5,
    'weight_label', '5 kg',
    'coat_type', case when v_service_coat in ('todas', 'todos', 'qualquer') then null else v_service_coat end,
    'service_product_id', v_service_id,
    'scheduled_at', v_scheduled_at,
    'expected_total', v_service_price,
    'notes', 'sem perfume; teste transacional descartavel'
  ));

  select public.create_petbot_order_transaction(v_base) into v_result;
  v_sale_id := nullif(v_result->>'sale_id', '')::uuid;
  v_order_id := nullif(v_result->>'order_id', '')::uuid;
  v_appointment_id := nullif(v_result->>'appointment_id', '')::uuid;

  perform pg_temp.petbot_record_result(
    7, '[07/50] confirmacao valida retorna os tres identificadores e nao e duplicada',
    v_sale_id is not null and v_order_id is not null and v_appointment_id is not null
      and not coalesce((v_result->>'duplicated')::boolean, true),
    v_result::text
  );
  perform pg_temp.petbot_record_result(
    8, '[08/50] resultado usa exatamente o servico comercial selecionado',
    v_result->>'service_label' = v_service_name,
    coalesce(v_result->>'service_label', 'sem servico')
  );
  perform pg_temp.petbot_record_result(
    9, '[09/50] total e calculado pelo banco com o preco real',
    abs(coalesce((v_result->>'total')::numeric, -1) - v_service_price) <= 0.01
      and exists (
        select 1 from public.sales sale
        where sale.id = v_sale_id
          and abs(sale.total_price - v_service_price) <= 0.01
      ),
    format('esperado=%s; retornado=%s', v_service_price, v_result->>'total')
  );
  perform pg_temp.petbot_record_result(
    10, '[10/50] venda do banho fica pendente e com origem WhatsApp',
    exists (
      select 1 from public.sales sale
      where sale.id = v_sale_id and sale.status = 'pendente' and sale.source = 'whatsapp'
    ), null
  );
  perform pg_temp.petbot_record_result(
    11, '[11/50] servico fica a receber sem exigir forma de pagamento',
    v_result->>'payment_status' = 'a_receber' and exists (
      select 1 from public.sales sale
      where sale.id = v_sale_id
        and sale.payment_status = 'a_receber'
        and sale.payment_method is null
        and sale.fulfillment_type = 'servico'
    ), null
  );
  perform pg_temp.petbot_record_result(
    12, '[12/50] compromisso fica agendado e com origem WhatsApp',
    exists (
      select 1 from public.appointments appointment
      where appointment.id = v_appointment_id
        and appointment.status = 'agendado'
        and appointment.source = 'whatsapp'
    ), null
  );
  perform pg_temp.petbot_record_result(
    13, '[13/50] data e horario persistidos correspondem ao horario confirmado',
    exists (
      select 1 from public.appointments appointment
      where appointment.id = v_appointment_id
        and appointment.scheduled_at = v_scheduled_at
        and appointment.service_date = (v_scheduled_at at time zone v_timezone)::date
        and appointment.start_time = (v_scheduled_at at time zone v_timezone)::time
    ), v_scheduled_at::text
  );
  perform pg_temp.petbot_record_result(
    14, '[14/50] duracao e preco do compromisso vem do catalogo',
    exists (
      select 1 from public.appointments appointment
      where appointment.id = v_appointment_id
        and appointment.duration_min = v_duration
        and abs(appointment.price - v_service_price) <= 0.01
    ), format('duracao=%s; preco=%s', v_duration, v_service_price)
  );
  perform pg_temp.petbot_record_result(
    15, '[15/50] observacao sem perfume chega ao compromisso',
    exists (
      select 1 from public.appointments appointment
      where appointment.id = v_appointment_id
        and lower(coalesce(appointment.notes, '')) like '%sem perfume%'
    ), null
  );
  perform pg_temp.petbot_record_result(
    16, '[16/50] pet fica vinculado com especie, raca e peso informados',
    exists (
      select 1
      from public.appointments appointment
      join public.pets pet on pet.id = appointment.pet_id
      where appointment.id = v_appointment_id
        and pet.pet_name = v_pet_name
        and lower(pet.species) = 'dog'
        and lower(pet.breed) = 'shih tzu'
        and lower(coalesce(pet.notes, '')) like '%peso%5 kg%'
    ), null
  );
  perform pg_temp.petbot_record_result(
    17, '[17/50] ordem operacional liga venda, sessao e horario',
    exists (
      select 1 from public.service_delivery_orders service_order
      where service_order.id = v_order_id
        and service_order.sale_id = v_sale_id
        and service_order.session_id = v_session_id
        and service_order.scheduled_for = v_scheduled_at
        and service_order.status = 'agendado'
    ), null
  );
  perform pg_temp.petbot_record_result(
    18, '[18/50] cliente que leva o pet nao recebe transporte nem endereco',
    exists (
      select 1 from public.service_delivery_orders service_order
      where service_order.id = v_order_id
        and service_order.transport_mode is null
        and service_order.delivery_address is null
    ), null
  );
  perform pg_temp.petbot_record_result(
    19, '[19/50] contexto e commit terminal guardam o resultado final',
    exists (
      select 1 from public.chat_sessions session
      where session.id = v_session_id
        and session.context->>'last_sale_id' = v_sale_id::text
        and session.context->>'last_order_id' = v_order_id::text
        and session.context->>'last_appointment_id' = v_appointment_id::text
        and session.context->>'last_payment_status' = 'a_receber'
        and session.context->>'last_petbot_idempotency_key' = v_key_prefix || '-valid'
    ) and exists (
      select 1 from public.petbot_order_commits commit_row
      where commit_row.tenant_id = v_tenant_id
        and commit_row.idempotency_key = v_key_prefix || '-valid'
        and commit_row.status = 'completed'
    ), null
  );

  select jsonb_build_object(
    'sales', (select count(*) from public.sales where tenant_id = v_tenant_id and module_id = v_module_id),
    'appointments', (select count(*) from public.appointments where tenant_id = v_tenant_id and module_id = v_module_id),
    'orders', (select count(*) from public.service_delivery_orders where tenant_id = v_tenant_id and module_id = v_module_id)
  ) into v_counts_before;
  select public.create_petbot_order_transaction(v_base) into v_duplicate;
  select jsonb_build_object(
    'sales', (select count(*) from public.sales where tenant_id = v_tenant_id and module_id = v_module_id),
    'appointments', (select count(*) from public.appointments where tenant_id = v_tenant_id and module_id = v_module_id),
    'orders', (select count(*) from public.service_delivery_orders where tenant_id = v_tenant_id and module_id = v_module_id)
  ) into v_counts_after;
  perform pg_temp.petbot_record_result(
    20, '[20/50] confirmacao repetida devolve os mesmos IDs sem duplicar dados',
    coalesce((v_duplicate->>'duplicated')::boolean, false)
      and v_duplicate->>'sale_id' = v_sale_id::text
      and v_duplicate->>'order_id' = v_order_id::text
      and v_duplicate->>'appointment_id' = v_appointment_id::text
      and v_duplicate->>'payment_status' = 'a_receber'
      and v_counts_after = v_counts_before,
    v_duplicate::text
  );

  perform pg_temp.petbot_expect_error(
    v_base - 'session_id', 'Payload sem sessao ou tenant',
    21, '[21/50] payload sem sessao e recusado'
  );
  perform pg_temp.petbot_expect_error(
    v_base - 'tenant_id', 'Payload sem sessao ou tenant',
    22, '[22/50] payload sem tenant e recusado'
  );
  perform pg_temp.petbot_expect_error(
    v_base - 'idempotency_key', 'Chave idempotente ausente ou invalida',
    23, '[23/50] confirmacao sem chave idempotente e recusada'
  );
  perform pg_temp.petbot_expect_error(
    v_base || jsonb_build_object('idempotency_key', repeat('x', 241)),
    'Chave idempotente ausente ou invalida',
    24, '[24/50] chave idempotente excessiva e recusada'
  );
  perform pg_temp.petbot_expect_error(
    v_base || jsonb_build_object('idempotency_key', v_key_prefix || '-25', 'order_type', 'banho'),
    'Tipo de pedido invalido',
    25, '[25/50] tipo operacional desconhecido e recusado'
  );
  perform pg_temp.petbot_expect_error(
    v_base || jsonb_build_object('idempotency_key', v_key_prefix || '-26', 'session_id', gen_random_uuid()),
    'Sessao do PetBot nao encontrada',
    26, '[26/50] sessao inexistente e recusada'
  );
  perform pg_temp.petbot_expect_error(
    v_base || jsonb_build_object('idempotency_key', v_key_prefix || '-27', 'client_id', gen_random_uuid()),
    'Cliente ausente ou fora do tenant',
    27, '[27/50] cliente inexistente ou de outro tenant e recusado'
  );
  perform pg_temp.petbot_expect_error(
    (v_base - 'pet_name') || jsonb_build_object('idempotency_key', v_key_prefix || '-28'),
    'Nome e especie do pet sao obrigatorios',
    28, '[28/50] banho sem nome do pet e recusado'
  );
  perform pg_temp.petbot_expect_error(
    (v_base - 'species') || jsonb_build_object('idempotency_key', v_key_prefix || '-29'),
    'Nome e especie do pet sao obrigatorios',
    29, '[29/50] banho sem especie e recusado'
  );
  perform pg_temp.petbot_expect_error(
    (v_base - 'breed') || jsonb_build_object('idempotency_key', v_key_prefix || '-30'),
    'Raca e peso aproximado sao obrigatorios',
    30, '[30/50] banho sem raca e recusado'
  );
  perform pg_temp.petbot_expect_error(
    (v_base - 'weight_kg') || jsonb_build_object('idempotency_key', v_key_prefix || '-31'),
    'Raca e peso aproximado sao obrigatorios',
    31, '[31/50] banho sem peso e recusado'
  );
  perform pg_temp.petbot_expect_error(
    v_base || jsonb_build_object('idempotency_key', v_key_prefix || '-32', 'weight_kg', 0),
    'Raca e peso aproximado sao obrigatorios',
    32, '[32/50] peso zero e recusado'
  );
  perform pg_temp.petbot_expect_error(
    v_base || jsonb_build_object('idempotency_key', v_key_prefix || '-33', 'weight_kg', -1),
    'Raca e peso aproximado sao obrigatorios',
    33, '[33/50] peso negativo e recusado'
  );
  perform pg_temp.petbot_expect_error(
    (v_base - 'scheduled_at') || jsonb_build_object('idempotency_key', v_key_prefix || '-34'),
    'Horario real da agenda ausente',
    34, '[34/50] confirmacao sem horario real e recusada'
  );
  perform pg_temp.petbot_expect_error(
    v_base || jsonb_build_object('idempotency_key', v_key_prefix || '-35', 'service_product_id', gen_random_uuid()),
    'Servico nao encontrado ou inativo',
    35, '[35/50] servico inexistente e recusado'
  );
  perform pg_temp.petbot_expect_error(
    v_base || jsonb_build_object('idempotency_key', v_key_prefix || '-36', 'service_product_id', v_product_id),
    'Servico nao encontrado ou inativo',
    36, '[36/50] produto banho a seco nao pode ser agendado como servico'
  );

  v_case_succeeded := false;
  v_case_error := null;
  begin
    update public.products set active = false where id = v_service_id;
    perform public.create_petbot_order_transaction(
      v_base || jsonb_build_object('idempotency_key', v_key_prefix || '-37')
    );
    v_case_succeeded := true;
    raise exception '__PETBOT_TEST_ROLLBACK__';
  exception when others then
    if sqlerrm <> '__PETBOT_TEST_ROLLBACK__' then v_case_error := sqlerrm; end if;
  end;
  perform pg_temp.petbot_record_result(
    37, '[37/50] servico desativado e recusado',
    not v_case_succeeded and position('servico nao encontrado ou inativo' in lower(coalesce(v_case_error, ''))) > 0,
    coalesce(v_case_error, 'Operacao aceita indevidamente.')
  );

  v_case_succeeded := false;
  v_case_error := null;
  begin
    update public.products set price = 0 where id = v_service_id;
    perform public.create_petbot_order_transaction(
      v_base || jsonb_build_object('idempotency_key', v_key_prefix || '-38')
    );
    v_case_succeeded := true;
    raise exception '__PETBOT_TEST_ROLLBACK__';
  exception when others then
    if sqlerrm <> '__PETBOT_TEST_ROLLBACK__' then v_case_error := sqlerrm; end if;
  end;
  perform pg_temp.petbot_record_result(
    38, '[38/50] servico sem preco e recusado',
    not v_case_succeeded and position('servico cadastrado sem preco valido' in lower(coalesce(v_case_error, ''))) > 0,
    coalesce(v_case_error, 'Operacao aceita indevidamente.')
  );

  perform pg_temp.petbot_expect_error(
    v_base || jsonb_build_object('idempotency_key', v_key_prefix || '-39', 'species', 'cat'),
    'Servico nao corresponde a especie informada',
    39, '[39/50] servico canino e recusado para gato'
  );

  v_case_succeeded := false;
  v_case_error := null;
  begin
    update public.products
    set bot_metadata = jsonb_set(
      jsonb_set(coalesce(bot_metadata, '{}'::jsonb), '{weight_min_kg}', '6'::jsonb, true),
      '{weight_max_kg}', '10'::jsonb, true
    )
    where id = v_service_id;
    perform public.create_petbot_order_transaction(
      v_base || jsonb_build_object('idempotency_key', v_key_prefix || '-40', 'weight_kg', 5)
    );
    v_case_succeeded := true;
    raise exception '__PETBOT_TEST_ROLLBACK__';
  exception when others then
    if sqlerrm <> '__PETBOT_TEST_ROLLBACK__' then v_case_error := sqlerrm; end if;
  end;
  perform pg_temp.petbot_record_result(
    40, '[40/50] peso abaixo da faixa cadastrada e recusado',
    not v_case_succeeded and position('servico nao corresponde ao peso informado' in lower(coalesce(v_case_error, ''))) > 0,
    coalesce(v_case_error, 'Operacao aceita indevidamente.')
  );

  perform pg_temp.petbot_expect_error(
    v_base || jsonb_build_object(
      'idempotency_key', v_key_prefix || '-41',
      'scheduled_at', v_alt_scheduled_at,
      'weight_kg', 11,
      'weight_label', '11 kg',
      'expected_total', v_service_price
    ),
    'Servico nao corresponde ao peso informado',
    41, '[41/50] banho de 0 a 10 kg recusa pet de 11 kg usando o cadastro real'
  );

  v_case_succeeded := false;
  v_case_error := null;
  begin
    update public.products
    set bot_metadata = jsonb_set(
      coalesce(bot_metadata, '{}'::jsonb), '{coat_type}', to_jsonb('curto'::text), true
    )
    where id = v_service_id;
    perform public.create_petbot_order_transaction(
      v_base || jsonb_build_object('idempotency_key', v_key_prefix || '-42', 'coat_type', 'longo')
    );
    v_case_succeeded := true;
    raise exception '__PETBOT_TEST_ROLLBACK__';
  exception when others then
    if sqlerrm <> '__PETBOT_TEST_ROLLBACK__' then v_case_error := sqlerrm; end if;
  end;
  perform pg_temp.petbot_record_result(
    42, '[42/50] pelagem incompatível com servico especializado e recusada',
    not v_case_succeeded and position('servico nao corresponde a pelagem classificada' in lower(coalesce(v_case_error, ''))) > 0,
    coalesce(v_case_error, 'Operacao aceita indevidamente.')
  );

  perform pg_temp.petbot_expect_error(
    v_base || jsonb_build_object(
      'idempotency_key', v_key_prefix || '-43',
      'scheduled_at', v_alt_scheduled_at,
      'expected_total', v_service_price + 999
    ),
    'Total divergente',
    43, '[43/50] total inventado pelo agente e recusado'
  );
  perform pg_temp.petbot_expect_error(
    v_base || jsonb_build_object(
      'idempotency_key', v_key_prefix || '-44',
      'scheduled_at', now() - interval '1 minute'
    ),
    'Horario nao respeita a antecedencia minima configurada',
    44, '[44/50] horario passado ou sem antecedencia e recusado'
  );

  v_future_date := (now() at time zone v_timezone)::date + 7;
  v_future_weekday := extract(isodow from v_future_date)::integer::text;
  v_outside_at := (v_future_date + time '03:00') at time zone v_timezone;
  v_off_grid_at := (v_future_date + time '10:01') at time zone v_timezone;

  v_case_succeeded := false;
  v_case_error := null;
  begin
    update public.settings
    set petbot_business_hours = jsonb_build_object(
          v_future_weekday,
          jsonb_build_array(jsonb_build_object('open', '09:00', 'close', '18:00'))
        ),
        petbot_booking_lead_time_min = 0,
        petbot_slot_interval_min = 30
    where tenant_id = v_tenant_id and module_id = v_module_id;
    perform public.create_petbot_order_transaction(
      v_base || jsonb_build_object(
        'idempotency_key', v_key_prefix || '-45',
        'scheduled_at', v_outside_at
      )
    );
    v_case_succeeded := true;
    raise exception '__PETBOT_TEST_ROLLBACK__';
  exception when others then
    if sqlerrm <> '__PETBOT_TEST_ROLLBACK__' then v_case_error := sqlerrm; end if;
  end;
  perform pg_temp.petbot_record_result(
    45, '[45/50] horario fora do expediente e recusado',
    not v_case_succeeded and position('horario fora do expediente ou da grade configurada' in lower(coalesce(v_case_error, ''))) > 0,
    coalesce(v_case_error, 'Operacao aceita indevidamente.')
  );

  v_case_succeeded := false;
  v_case_error := null;
  begin
    update public.settings
    set petbot_business_hours = jsonb_build_object(
          v_future_weekday,
          jsonb_build_array(jsonb_build_object('open', '09:00', 'close', '18:00'))
        ),
        petbot_booking_lead_time_min = 0,
        petbot_slot_interval_min = 30
    where tenant_id = v_tenant_id and module_id = v_module_id;
    update public.products
    set bot_metadata = jsonb_set(coalesce(bot_metadata, '{}'::jsonb), '{duration_min}', '60'::jsonb, true)
    where id = v_service_id;
    perform public.create_petbot_order_transaction(
      v_base || jsonb_build_object(
        'idempotency_key', v_key_prefix || '-46',
        'scheduled_at', v_off_grid_at
      )
    );
    v_case_succeeded := true;
    raise exception '__PETBOT_TEST_ROLLBACK__';
  exception when others then
    if sqlerrm <> '__PETBOT_TEST_ROLLBACK__' then v_case_error := sqlerrm; end if;
  end;
  perform pg_temp.petbot_record_result(
    46, '[46/50] minuto fora da grade de horarios e recusado',
    not v_case_succeeded and position('horario fora do expediente ou da grade configurada' in lower(coalesce(v_case_error, ''))) > 0,
    coalesce(v_case_error, 'Operacao aceita indevidamente.')
  );

  v_case_succeeded := false;
  v_case_error := null;
  begin
    update public.settings
    set petbot_booking_capacity = 1
    where tenant_id = v_tenant_id and module_id = v_module_id;
    perform public.create_petbot_order_transaction(
      v_base || jsonb_build_object('idempotency_key', v_key_prefix || '-47')
    );
    v_case_succeeded := true;
    raise exception '__PETBOT_TEST_ROLLBACK__';
  exception when others then
    if sqlerrm <> '__PETBOT_TEST_ROLLBACK__' then v_case_error := sqlerrm; end if;
  end;
  perform pg_temp.petbot_record_result(
    47, '[47/50] segunda pessoa nao ocupa o mesmo horario lotado',
    not v_case_succeeded and position('horario nao esta mais disponivel' in lower(coalesce(v_case_error, ''))) > 0,
    coalesce(v_case_error, 'Operacao aceita indevidamente.')
  );

  perform pg_temp.petbot_expect_error(
    v_base || jsonb_build_object(
      'idempotency_key', v_key_prefix || '-48',
      'scheduled_at', v_alt_scheduled_at,
      'service_transport_mode', '__transporte_inexistente__'
    ),
    'Opcao de transporte invalida ou desatualizada',
    48, '[48/50] opcao de transporte inexistente e recusada'
  );

  v_case_succeeded := false;
  v_case_error := null;
  begin
    update public.settings
    set pet_transport_options = jsonb_build_array(jsonb_build_object(
      'id', '__motodog_teste__', 'label', 'MotoDog teste', 'fee', 10, 'active', true
    ))
    where tenant_id = v_tenant_id and module_id = v_module_id;
    perform public.create_petbot_order_transaction(
      v_base || jsonb_build_object(
        'idempotency_key', v_key_prefix || '-49',
        'scheduled_at', v_alt_scheduled_at,
        'expected_total', v_service_price + 10,
        'service_transport_mode', '__motodog_teste__'
      )
    );
    v_case_succeeded := true;
    raise exception '__PETBOT_TEST_ROLLBACK__';
  exception when others then
    if sqlerrm <> '__PETBOT_TEST_ROLLBACK__' then v_case_error := sqlerrm; end if;
  end;
  perform pg_temp.petbot_record_result(
    49, '[49/50] MotoDog sem endereco completo e recusado',
    not v_case_succeeded and position('endereco para transporte do pet esta incompleto' in lower(coalesce(v_case_error, ''))) > 0,
    coalesce(v_case_error, 'Operacao aceita indevidamente.')
  );

  perform pg_temp.petbot_expect_error(
    (v_base - 'scheduled_at') || jsonb_build_object(
      'idempotency_key', v_key_prefix || '-50',
      'appointment_id', gen_random_uuid()
    ),
    'Horario nao esta mais disponivel',
    50, '[50/50] identificador de horario inexistente ou obsoleto e recusado'
  );
end
$petbot_bath_50$;

select jsonb_build_object(
  'suite', 'petbot_bath_booking_50',
  'total', count(*),
  'passed', count(*) filter (where passed),
  'failed', count(*) filter (where not passed),
  'results', jsonb_agg(
    jsonb_build_object(
      'test', test_no,
      'scenario', scenario,
      'passed', passed,
      'detail', detail
    ) order by test_no
  )
) as report
from petbot_bath_test_results;
