-- PetBot agent v3: one operational source of truth, configurable scheduling
-- and idempotent transactional commits. The model may decide what to ask and
-- which tool to use, but this function alone decides prices, stock, fees and
-- whether a booking can be committed.
begin;

alter table public.settings
  add column if not exists petbot_timezone text not null default 'America/Sao_Paulo',
  add column if not exists petbot_business_hours jsonb not null default '{
    "1":[{"open":"08:00","close":"18:00"}],
    "2":[{"open":"08:00","close":"18:00"}],
    "3":[{"open":"08:00","close":"18:00"}],
    "4":[{"open":"08:00","close":"18:00"}],
    "5":[{"open":"08:00","close":"18:00"}],
    "6":[{"open":"08:00","close":"18:00"}],
    "7":[{"open":"08:00","close":"18:00"}]
  }'::jsonb,
  add column if not exists petbot_slot_interval_min integer not null default 30,
  add column if not exists petbot_booking_lead_time_min integer not null default 15,
  add column if not exists petbot_booking_capacity integer not null default 1;

alter table public.settings drop constraint if exists settings_petbot_slot_interval_min_check;
alter table public.settings add constraint settings_petbot_slot_interval_min_check
  check (petbot_slot_interval_min between 5 and 240);
alter table public.settings drop constraint if exists settings_petbot_booking_lead_time_min_check;
alter table public.settings add constraint settings_petbot_booking_lead_time_min_check
  check (petbot_booking_lead_time_min between 0 and 10080);
alter table public.settings drop constraint if exists settings_petbot_booking_capacity_check;
alter table public.settings add constraint settings_petbot_booking_capacity_check
  check (petbot_booking_capacity between 1 and 100);

create table if not exists public.petbot_order_commits (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  idempotency_key text not null,
  session_id uuid references public.chat_sessions(id) on delete set null,
  status text not null default 'processing',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, idempotency_key),
  constraint petbot_order_commits_status_check
    check (status in ('processing', 'completed'))
);

create index if not exists idx_petbot_order_commits_session
  on public.petbot_order_commits (tenant_id, session_id, created_at desc);

alter table public.petbot_order_commits enable row level security;
revoke all on table public.petbot_order_commits from public, anon, authenticated;
grant select, insert, update on table public.petbot_order_commits to service_role;

-- Keep the database overlap guard aligned with the availability tool. Assigned
-- professionals remain exclusive; unassigned bookings use the tenant's global
-- simultaneous capacity.
create or replace function public.prevent_appointment_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  active_statuses constant text[] := array[
    'agendado', 'confirmado', 'em_andamento', 'booked', 'ocupado',
    'blocked', 'bloqueado', 'scheduled', 'pendente'
  ];
  v_capacity integer := 1;
  v_overlap_count integer := 0;
begin
  if lower(coalesce(new.status, '')) <> all(active_statuses) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    new.tenant_id::text || ':' || new.module_id || ':' || new.scheduled_at::date::text,
    0
  ));

  if new.employee_id is not null or new.groomer_id is not null then
    if exists (
      select 1 from public.appointments current
      where current.tenant_id = new.tenant_id
        and current.module_id = new.module_id
        and current.id is distinct from new.id
        and lower(coalesce(current.status, '')) = any(active_statuses)
        and current.scheduled_at < new.scheduled_at + make_interval(mins => greatest(15, coalesce(new.duration_min, 60)))
        and current.scheduled_at + make_interval(mins => greatest(15, coalesce(current.duration_min, 60))) > new.scheduled_at
        and (current.employee_id = new.employee_id or current.groomer_id = new.groomer_id)
    ) then
      raise exception 'Horario nao esta mais disponivel para o profissional.';
    end if;
    return new;
  end if;

  select greatest(1, coalesce(settings.petbot_booking_capacity, 1))
  into v_capacity
  from public.settings settings
  where settings.tenant_id = new.tenant_id
    and settings.module_id = new.module_id
  limit 1;

  select count(*)::integer into v_overlap_count
  from public.appointments current
  where current.tenant_id = new.tenant_id
    and current.module_id = new.module_id
    and current.id is distinct from new.id
    and lower(coalesce(current.status, '')) = any(active_statuses)
    and current.scheduled_at < new.scheduled_at + make_interval(mins => greatest(15, coalesce(new.duration_min, 60)))
    and current.scheduled_at + make_interval(mins => greatest(15, coalesce(current.duration_min, 60))) > new.scheduled_at;

  if v_overlap_count >= coalesce(v_capacity, 1) then
    raise exception 'Horario nao esta mais disponivel.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_appointment_overlap on public.appointments;
create trigger prevent_appointment_overlap
before insert or update of scheduled_at, duration_min, employee_id, groomer_id, status
on public.appointments
for each row execute function public.prevent_appointment_overlap();

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
  v_idempotency_key text := nullif(trim(p_payload->>'idempotency_key'), '');
  v_client_id uuid := nullif(p_payload->>'client_id', '')::uuid;
  v_order_type text := coalesce(nullif(trim(p_payload->>'order_type'), ''), 'produto');
  v_items jsonb := coalesce(p_payload->'items', '[]'::jsonb);
  v_item jsonb;
  v_product record;
  v_slot record;
  v_service record;
  v_setting_delivery_fee numeric := null;
  v_setting_transport_fee numeric := null;
  v_setting_transport_options jsonb := '[]'::jsonb;
  v_setting_timezone text := null;
  v_setting_business_hours jsonb := '{}'::jsonb;
  v_setting_slot_interval integer := null;
  v_setting_lead_time integer := null;
  v_setting_capacity integer := null;
  v_transport_option record;
  v_quantity numeric;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_delivery_fee numeric := 0;
  v_transport_fee numeric := 0;
  v_sale_id uuid;
  v_order_id uuid;
  v_appointment_id uuid := nullif(p_payload->>'appointment_id', '')::uuid;
  v_pet_id uuid;
  v_scheduled_at timestamptz := nullif(p_payload->>'scheduled_at', '')::timestamptz;
  v_duration integer := greatest(15, coalesce(nullif(p_payload->>'duration_min', '')::integer, 60));
  v_service_product_id uuid := nullif(p_payload->>'service_product_id', '')::uuid;
  v_service_type text := nullif(trim(p_payload->>'service_type'), '');
  v_service_label text;
  v_customer_name text := coalesce(nullif(trim(p_payload->>'customer_name'), ''), 'Cliente');
  v_customer_phone text := nullif(trim(p_payload->>'customer_phone'), '');
  v_pet_name text := nullif(trim(p_payload->>'pet_name'), '');
  v_species text := nullif(trim(p_payload->>'species'), '');
  v_breed text := nullif(trim(p_payload->>'breed'), '');
  v_payment_method text := nullif(trim(p_payload->>'payment_method'), '');
  v_payment_status text := 'nao_aplicavel';
  v_notes text := nullif(trim(p_payload->>'notes'), '');
  v_weight_kg numeric := nullif(p_payload->>'weight_kg', '')::numeric;
  v_weight_label text := nullif(trim(p_payload->>'weight_label'), '');
  v_coat_type text := nullif(trim(p_payload->>'coat_type'), '');
  v_expected_total numeric := nullif(p_payload->>'expected_total', '')::numeric;
  v_timezone text := coalesce(nullif(trim(p_payload->>'timezone'), ''), 'America/Sao_Paulo');
  v_booking_capacity integer := greatest(1, coalesce(nullif(p_payload->>'booking_capacity', '')::integer, 1));
  v_overlap_count integer := 0;
  v_local_date date;
  v_local_time time;
  v_weekday text;
  v_within_business_hours boolean := false;
  v_service_weight_min numeric := null;
  v_service_weight_max numeric := null;
  v_service_coat_type text := null;
  v_service_species text := null;
  v_service_kind text := null;
  v_subscription record;
  v_plan_service jsonb;
  v_subscription_usage jsonb := '{}'::jsonb;
  v_subscription_used integer := 0;
  v_subscription_limit integer := 0;
  v_subscription_id uuid := null;
  v_subscription_plan_name text := null;
  v_subscription_benefit_used boolean := false;
  v_existing_result jsonb;
  v_result jsonb;
begin
  if v_session_id is null or v_tenant_id is null then
    raise exception 'Payload sem sessao ou tenant.';
  end if;
  if v_idempotency_key is null or length(v_idempotency_key) > 240 then
    raise exception 'Chave idempotente ausente ou invalida.';
  end if;
  if v_order_type not in ('produto', 'banho_tosa', 'veterinaria') then
    raise exception 'Tipo de pedido invalido.';
  end if;

  -- Serialize retries of the same logical order before inspecting the commit
  -- table. The key is tenant-scoped and includes the chat session in the app.
  perform pg_advisory_xact_lock(hashtext(v_tenant_id::text), hashtext(v_idempotency_key));

  select result into v_existing_result
  from public.petbot_order_commits
  where tenant_id = v_tenant_id
    and idempotency_key = v_idempotency_key
    and status = 'completed';
  if found then
    return coalesce(v_existing_result, '{}'::jsonb) || jsonb_build_object('duplicated', true);
  end if;

  perform 1
  from public.chat_sessions
  where id = v_session_id
    and tenant_id = v_tenant_id
    and module_id = v_module_id
  for update;
  if not found then raise exception 'Sessao do PetBot nao encontrada.'; end if;

  insert into public.petbot_order_commits (
    tenant_id, idempotency_key, session_id, status, result, updated_at
  ) values (
    v_tenant_id, v_idempotency_key, v_session_id, 'processing', '{}'::jsonb, now()
  )
  on conflict (tenant_id, idempotency_key) do update
    set session_id = excluded.session_id,
        updated_at = now();

  select
    s.delivery_fee,
    s.pet_transport_fee,
    s.pet_transport_options,
    s.petbot_timezone,
    s.petbot_business_hours,
    s.petbot_slot_interval_min,
    s.petbot_booking_lead_time_min,
    s.petbot_booking_capacity
  into
    v_setting_delivery_fee,
    v_setting_transport_fee,
    v_setting_transport_options,
    v_setting_timezone,
    v_setting_business_hours,
    v_setting_slot_interval,
    v_setting_lead_time,
    v_setting_capacity
  from public.settings s
  where s.tenant_id = v_tenant_id
    and s.module_id = v_module_id
  limit 1;

  if not found then
    raise exception 'Configuracao da loja ausente para o tenant.';
  end if;

  v_delivery_fee := greatest(0, coalesce(v_setting_delivery_fee, 0));
  v_timezone := coalesce(nullif(trim(v_setting_timezone), ''), 'America/Sao_Paulo');
  v_booking_capacity := greatest(1, coalesce(v_setting_capacity, 1));
  v_setting_slot_interval := greatest(5, coalesce(v_setting_slot_interval, 30));
  v_setting_lead_time := greatest(0, coalesce(v_setting_lead_time, 15));
  v_setting_business_hours := coalesce(v_setting_business_hours, '{}'::jsonb);

  if not exists (select 1 from pg_timezone_names where name = v_timezone) then
    raise exception 'Fuso horario configurado e invalido.';
  end if;

  if v_client_id is null or not exists (
    select 1 from public.clients
    where id = v_client_id
      and tenant_id = v_tenant_id
      and module_id = v_module_id
  ) then
    raise exception 'Cliente ausente ou fora do tenant.';
  end if;

  if v_order_type = 'produto' then
    if v_payment_method not in ('pix', 'dinheiro', 'cartao') then
      raise exception 'Forma de pagamento invalida.';
    end if;
    if coalesce(p_payload->>'fulfillment_type', '') not in ('entrega', 'retirada') then
      raise exception 'Entrega ou retirada precisa estar definida.';
    end if;
    if p_payload->>'fulfillment_type' = 'entrega' and (
      coalesce(p_payload->>'delivery_address', '') !~ '[0-9]'
      or nullif(trim(p_payload->>'delivery_neighborhood'), '') is null
      or nullif(trim(p_payload->>'delivery_reference'), '') is null
    ) then
      raise exception 'Endereco de entrega incompleto.';
    end if;
    if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
      raise exception 'Pedido sem itens.';
    end if;

    -- Every row is locked and every monetary value is read from products.
    for v_item in select * from jsonb_array_elements(v_items) loop
      v_quantity := coalesce(nullif(v_item->>'quantity', '')::numeric, 0);
      if v_quantity <= 0 then raise exception 'Quantidade invalida.'; end if;

      select id, name, price, stock_quantity, active into v_product
      from public.products
      where id = nullif(v_item->>'product_id', '')::uuid
        and tenant_id = v_tenant_id
        and module_id = v_module_id
      for update;

      if not found or not coalesce(v_product.active, false) then
        raise exception 'Produto indisponivel.';
      end if;
      if coalesce(v_product.stock_quantity, 0) < v_quantity then
        raise exception 'Estoque insuficiente para %.', v_product.name;
      end if;
      if coalesce(v_product.price, 0) <= 0 then
        raise exception 'Produto sem preco valido.';
      end if;
      v_subtotal := v_subtotal + v_product.price * v_quantity;
    end loop;

    v_total := v_subtotal
      + case when p_payload->>'fulfillment_type' = 'entrega' then v_delivery_fee else 0 end;
    v_payment_status := case
      when v_payment_method = 'pix' then 'aguardando_comprovante'
      else 'baixado'
    end;
  else
    if v_pet_name is null or v_species is null then
      raise exception 'Nome e especie do pet sao obrigatorios para agendamento.';
    end if;
    if v_order_type = 'banho_tosa' and (v_breed is null or v_weight_kg is null or v_weight_kg <= 0) then
      raise exception 'Raca e peso aproximado sao obrigatorios para banho e tosa.';
    end if;
    if v_scheduled_at is null and v_appointment_id is null then
      raise exception 'Horario real da agenda ausente.';
    end if;

    -- products is the commercial source of truth. petshop_services remains a
    -- compatibility fallback for tenants not yet migrated to product services.
    if v_service_product_id is not null then
      select
        p.id,
        ('catalog_' || lower(replace(p.id::text, '-', '')))::text as code,
        p.name,
        p.price as default_price,
        p.bot_metadata,
        p.species_target,
        greatest(15, case
          when coalesce(p.bot_metadata->>'duration_min', '') ~ '^\d+$'
            then (p.bot_metadata->>'duration_min')::integer
          when coalesce(p.bot_metadata->>'service_duration_min', '') ~ '^\d+$'
            then (p.bot_metadata->>'service_duration_min')::integer
          else 60
        end) as default_duration_min
      into v_service
      from public.products p
      where p.id = v_service_product_id
        and p.tenant_id = v_tenant_id
        and p.module_id = v_module_id
        and p.active = true
        and (
          lower(coalesce(p.bot_metadata->>'product_type', '')) = 'servico'
          or lower(coalesce(p.category, '')) in ('servico', 'serviço', 'banho', 'tosa', 'veterinaria', 'veterinária')
          or lower(coalesce(p.name, '')) ~ '(banho|tosa|consulta|vacina|exame|cirurg|hidrat|escovac|desembolo)'
        )
      for update;
    else
      select id, code, name, default_price, default_duration_min, '{}'::jsonb as bot_metadata, null::text as species_target
      into v_service
      from public.petshop_services
      where tenant_id = v_tenant_id
        and module_id = v_module_id
        and code = v_service_type
        and active = true
      limit 1
      for update;
    end if;

    if not found then raise exception 'Servico nao encontrado ou inativo.'; end if;
    if coalesce(v_service.default_price, 0) <= 0 then
      raise exception 'Servico cadastrado sem preco valido.';
    end if;

    if v_service_product_id is not null then
      if coalesce(v_service.bot_metadata->>'weight_min_kg', '') ~ '^\d+(\.\d+)?$' then
        v_service_weight_min := (v_service.bot_metadata->>'weight_min_kg')::numeric;
      end if;
      if coalesce(v_service.bot_metadata->>'weight_max_kg', '') ~ '^\d+(\.\d+)?$' then
        v_service_weight_max := (v_service.bot_metadata->>'weight_max_kg')::numeric;
      end if;
      v_service_coat_type := lower(nullif(trim(v_service.bot_metadata->>'coat_type'), ''));
      v_service_species := lower(nullif(trim(coalesce(v_service.bot_metadata->>'species', v_service.species_target)), ''));

      if v_weight_kg is not null and (
        (v_service_weight_min is not null and v_weight_kg < v_service_weight_min)
        or (v_service_weight_max is not null and v_weight_kg > v_service_weight_max)
      ) then
        raise exception 'Servico nao corresponde ao peso informado.';
      end if;
      if v_service_coat_type is not null
        and v_service_coat_type not in ('todas', 'todos', 'qualquer')
        and v_coat_type is not null
        and lower(v_coat_type) <> v_service_coat_type then
        raise exception 'Servico nao corresponde a pelagem classificada.';
      end if;
      if v_service_species is not null
        and lower(v_species) not in (v_service_species,
          case when v_service_species in ('cao','caes','cachorro','canino') then 'dog' else v_service_species end,
          case when v_service_species in ('gato','felino') then 'cat' else v_service_species end)
      then
        raise exception 'Servico nao corresponde a especie informada.';
      end if;
    end if;

    v_service_type := v_service.code;
    v_service_label := v_service.name;
    v_subtotal := v_service.default_price;
    v_duration := greatest(15, coalesce(v_service.default_duration_min, 60));
    v_service_kind := case
      when lower(v_service_label) like '%banho%' and lower(v_service_label) like '%tosa%' then 'banho_e_tosa'
      when lower(v_service_label) like '%tosa%' then 'tosa'
      when lower(v_service_label) like '%banho%' then 'banho'
      when lower(v_service_label) like '%consulta%' then 'consulta'
      when lower(v_service_label) like '%vacina%' then 'vacina'
      else nullif(lower(trim(p_payload->>'service_kind')), '')
    end;

    -- Subscription benefits are another source of commercial truth in YuiSync.
    -- The model cannot grant a benefit: the database locks the active
    -- subscription, checks the configured cycle allowance and consumes it in
    -- the same transaction that creates the appointment.
    if v_service_kind is not null then
      for v_subscription in
        select
          subscription.id,
          subscription.services_used,
          plan.name as plan_name,
          plan.services
        from public.client_subscriptions subscription
        join public.subscription_plans plan
          on plan.id = subscription.plan_id
         and plan.tenant_id = subscription.tenant_id
         and plan.module_id = subscription.module_id
        where subscription.tenant_id = v_tenant_id
          and subscription.module_id = v_module_id
          and subscription.client_id = v_client_id
          and subscription.status = 'active'
        order by subscription.started_at desc
        for update of subscription
      loop
        v_plan_service := null;
        select value into v_plan_service
        from jsonb_array_elements(coalesce(v_subscription.services, '[]'::jsonb))
        where lower(trim(value->>'service_type')) = v_service_kind
        limit 1;

        if v_plan_service is not null then
          v_subscription_usage := coalesce(v_subscription.services_used, '{}'::jsonb);
          v_subscription_used := greatest(0, coalesce((v_subscription_usage->>v_service_kind)::integer, 0));
          v_subscription_limit := greatest(0, coalesce((v_plan_service->>'qty_per_cycle')::integer, 0));
          if v_subscription_limit > v_subscription_used then
            v_subscription_benefit_used := true;
            v_subscription_id := v_subscription.id;
            v_subscription_plan_name := v_subscription.plan_name;
            v_subtotal := 0;
            update public.client_subscriptions
            set services_used = jsonb_set(
                  v_subscription_usage,
                  array[v_service_kind],
                  to_jsonb(v_subscription_used + 1),
                  true
                ),
                updated_at = now()
            where id = v_subscription.id
              and tenant_id = v_tenant_id
              and module_id = v_module_id;
            exit;
          end if;
        end if;
      end loop;
    end if;

    if v_appointment_id is not null then
      select id, scheduled_at, duration_min, status into v_slot
      from public.appointments
      where id = v_appointment_id
        and tenant_id = v_tenant_id
        and module_id = v_module_id
      for update;
      if not found or lower(coalesce(v_slot.status, '')) not in ('available', 'disponivel', 'livre', 'aberto', 'open') then
        raise exception 'Horario nao esta mais disponivel.';
      end if;
      v_scheduled_at := v_slot.scheduled_at;
    end if;

    if v_scheduled_at < now() + make_interval(mins => v_setting_lead_time) then
      raise exception 'Horario nao respeita a antecedencia minima configurada.';
    end if;

    v_local_date := (v_scheduled_at at time zone v_timezone)::date;
    v_local_time := (v_scheduled_at at time zone v_timezone)::time;
    v_weekday := extract(isodow from v_local_date)::integer::text;

    select exists (
      select 1
      from jsonb_array_elements(coalesce(v_setting_business_hours->v_weekday, '[]'::jsonb)) period
      where coalesce(period->>'open', '') ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'
        and coalesce(period->>'close', '') ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'
        and v_local_time >= (period->>'open')::time
        and v_local_time + make_interval(mins => v_duration) <= (period->>'close')::time
        and (
          v_appointment_id is not null
          or mod(
            floor(extract(epoch from (v_local_time - (period->>'open')::time)) / 60)::integer,
            v_setting_slot_interval
          ) = 0
        )
    ) into v_within_business_hours;

    if not coalesce(v_within_business_hours, false) then
      raise exception 'Horario fora do expediente ou da grade configurada.';
    end if;

    -- Serializing a tenant/day prevents two overlapping virtual slots from
    -- passing the conflict check concurrently with different start times.
    perform pg_advisory_xact_lock(
      hashtext(v_tenant_id::text),
      hashtext(((v_scheduled_at at time zone v_timezone)::date)::text)
    );

    select count(*)::integer into v_overlap_count
    from public.appointments a
    where a.tenant_id = v_tenant_id
      and a.module_id = v_module_id
      and a.id is distinct from v_appointment_id
      and lower(coalesce(a.status, '')) in (
        'agendado','confirmado','em_andamento','booked','ocupado','blocked',
        'bloqueado','scheduled','pendente'
      )
      and a.scheduled_at < v_scheduled_at + make_interval(mins => v_duration)
      and a.scheduled_at + make_interval(mins => greatest(15, coalesce(a.duration_min, 60))) > v_scheduled_at;

    if v_overlap_count >= v_booking_capacity then
      raise exception 'Horario nao esta mais disponivel.';
    end if;

    -- Transport fee is resolved from settings. The payload may identify an
    -- option but cannot choose its monetary value.
    if v_order_type = 'banho_tosa'
      and nullif(trim(p_payload->>'service_transport_mode'), '') is not null then
      select
        option->>'id' as id,
        option->>'label' as label,
        coalesce(nullif(option->>'fee', '')::numeric, 0) as fee
      into v_transport_option
      from jsonb_array_elements(coalesce(v_setting_transport_options, '[]'::jsonb)) option
      where lower(coalesce(option->>'active', 'true')) not in ('false', '0', 'nao', 'não')
        and (
          option->>'id' = p_payload->>'service_transport_mode'
          or lower(option->>'label') = lower(coalesce(p_payload->>'service_transport_label', ''))
        )
      limit 1;

      if not found then raise exception 'Opcao de transporte invalida ou desatualizada.'; end if;
      v_transport_fee := greatest(0, coalesce(v_transport_option.fee, 0));
      if coalesce(p_payload->>'service_transport_address', '') !~ '[0-9]'
        or nullif(trim(p_payload->>'service_transport_neighborhood'), '') is null
        or nullif(trim(p_payload->>'service_transport_reference'), '') is null then
        raise exception 'Endereco para transporte do pet esta incompleto.';
      end if;
    else
      v_transport_fee := 0;
    end if;

    select id into v_pet_id
    from public.pets
    where tenant_id = v_tenant_id
      and module_id = v_module_id
      and phone = coalesce(v_customer_phone, '')
      and lower(pet_name) = lower(v_pet_name)
    limit 1;

    if v_pet_id is null then
      insert into public.pets (
        tenant_id, module_id, owner_name, phone, pet_name, species, breed, notes, updated_at
      ) values (
        v_tenant_id,
        v_module_id,
        v_customer_name,
        coalesce(v_customer_phone, 'sem telefone'),
        v_pet_name,
        v_species,
        v_breed,
        concat_ws(' | ', 'Cadastro automatico PetBot',
          case
            when v_weight_label is not null then 'Peso informado: ' || v_weight_label
            when v_weight_kg is not null and v_weight_kg > 0 then 'Peso: ' || v_weight_kg || ' kg'
          end,
          case when v_coat_type is not null then 'Pelo: ' || v_coat_type end),
        now()
      ) returning id into v_pet_id;
    end if;

    v_notes := concat_ws(' | ',
      v_notes,
      'Servico: ' || v_service_label,
      case
        when v_weight_label is not null then 'Peso informado: ' || v_weight_label
        when v_weight_kg is not null and v_weight_kg > 0 then 'Peso: ' || v_weight_kg || ' kg'
      end,
      case when v_coat_type is not null then 'Pelo: ' || v_coat_type end,
      case when v_subscription_benefit_used then 'Beneficio do plano aplicado: ' || coalesce(v_subscription_plan_name, 'plano ativo') end
    );
    v_total := v_subtotal + v_transport_fee;
  end if;

  if v_expected_total is not null and abs(v_total - v_expected_total) > 0.01 then
    raise exception 'Total divergente.';
  end if;

  insert into public.sales (
    tenant_id, module_id, client_id, customer_name, customer_phone, payment_method,
    subtotal, discount, total_price, status, payment_status, source, fulfillment_type, notes
  ) values (
    v_tenant_id, v_module_id, v_client_id, v_customer_name, v_customer_phone,
    nullif(v_payment_method, ''), v_subtotal, 0, v_total, 'concluido', v_payment_status,
    'whatsapp',
    case
      when v_order_type = 'produto' and p_payload->>'fulfillment_type' = 'retirada' then 'balcao'
      when v_order_type = 'produto' then 'entrega'
      else 'servico'
    end,
    v_notes
  ) returning id into v_sale_id;

  if v_order_type = 'produto' then
    for v_item in select * from jsonb_array_elements(v_items) loop
      v_quantity := (v_item->>'quantity')::numeric;
      select id, name, price, cost_price, stock_quantity into v_product
      from public.products
      where id = (v_item->>'product_id')::uuid
        and tenant_id = v_tenant_id
        and module_id = v_module_id
      for update;

      insert into public.sale_items (
        tenant_id, sale_id, product_id, quantity, unit_price, subtotal, upsell
      ) values (
        v_tenant_id, v_sale_id, v_product.id, v_quantity, v_product.price,
        v_quantity * v_product.price, coalesce((v_item->>'upsell')::boolean, false)
      );

      update public.products
      set stock_quantity = v_product.stock_quantity - v_quantity,
          updated_at = now()
      where id = v_product.id
        and tenant_id = v_tenant_id
        and module_id = v_module_id
        and stock_quantity >= v_quantity;
      if not found then raise exception 'Estoque insuficiente ao reservar produto.'; end if;

      insert into public.stock_movements (
        tenant_id, module_id, product_id, sale_id, movement_type, quantity,
        stock_before, stock_after, unit_cost, reason, created_by
      ) values (
        v_tenant_id, v_module_id, v_product.id, v_sale_id, 'sale', -v_quantity,
        v_product.stock_quantity, v_product.stock_quantity - v_quantity,
        v_product.cost_price, 'Venda PetBot', null
      );
    end loop;
  elsif v_appointment_id is not null then
    update public.appointments
    set client_id = v_client_id,
        pet_id = v_pet_id,
        service_type = v_service_type,
        duration_min = v_duration,
        price = v_subtotal,
        status = 'agendado',
        source = 'whatsapp',
        customer_name = v_customer_name,
        customer_phone = v_customer_phone,
        description = v_notes,
        notes = v_notes,
        subscription_id = case when v_subscription_benefit_used then v_subscription_id else null end,
        subscription_benefit_used = v_subscription_benefit_used,
        updated_at = now()
    where id = v_appointment_id;
  else
    insert into public.appointments (
      tenant_id, module_id, client_id, pet_id, service_type, scheduled_at,
      service_date, start_time, end_time, duration_min, price, status, source,
      customer_name, customer_phone, description, notes,
      subscription_id, subscription_benefit_used
    ) values (
      v_tenant_id, v_module_id, v_client_id, v_pet_id, v_service_type, v_scheduled_at,
      (v_scheduled_at at time zone v_timezone)::date,
      (v_scheduled_at at time zone v_timezone)::time,
      ((v_scheduled_at + make_interval(mins => v_duration)) at time zone v_timezone)::time,
      v_duration, v_subtotal, 'agendado', 'whatsapp', v_customer_name,
      v_customer_phone, v_notes, v_notes,
      case when v_subscription_benefit_used then v_subscription_id else null end,
      v_subscription_benefit_used
    ) returning id into v_appointment_id;
  end if;

  insert into public.service_delivery_orders (
    tenant_id, module_id, sale_id, client_id, session_id, source, order_type,
    status, scheduled_for, delivery_address, delivery_neighborhood, delivery_city,
    contact_phone, payment_status, transport_mode, transport_label, notes, updated_at
  ) values (
    v_tenant_id, v_module_id, v_sale_id, v_client_id, v_session_id, 'whatsapp',
    case when v_order_type = 'produto' then 'entrega' else 'servico' end,
    case when v_order_type = 'produto' then 'separacao' else 'agendado' end,
    case when v_order_type = 'produto' then null else v_scheduled_at end,
    case
      when v_order_type = 'produto' and p_payload->>'fulfillment_type' = 'entrega' then nullif(trim(p_payload->>'delivery_address'), '')
      when v_transport_fee > 0 then nullif(trim(p_payload->>'service_transport_address'), '')
      else null
    end,
    case
      when v_order_type = 'produto' and p_payload->>'fulfillment_type' = 'entrega' then nullif(trim(p_payload->>'delivery_neighborhood'), '')
      when v_transport_fee > 0 then nullif(trim(p_payload->>'service_transport_neighborhood'), '')
      else null
    end,
    case
      when v_order_type = 'produto' and p_payload->>'fulfillment_type' = 'entrega' then nullif(trim(p_payload->>'delivery_city'), '')
      when v_transport_fee > 0 then nullif(trim(p_payload->>'service_transport_city'), '')
      else null
    end,
    v_customer_phone,
    v_payment_status,
    case when v_transport_fee > 0 then v_transport_option.id else null end,
    case when v_transport_fee > 0 then v_transport_option.label else null end,
    v_notes,
    now()
  ) returning id into v_order_id;

  update public.chat_sessions
  set intent = 'pedido_confirmado',
      context = coalesce(context, '{}'::jsonb) || jsonb_build_object(
        'last_sale_id', v_sale_id,
        'last_order_id', v_order_id,
        'last_appointment_id', v_appointment_id,
        'last_total', v_total,
        'last_payment_status', v_payment_status,
        'last_petbot_idempotency_key', v_idempotency_key
      ),
      last_message_at = now()
  where id = v_session_id;

  v_result := jsonb_build_object(
    'sale_id', v_sale_id,
    'order_id', v_order_id,
    'appointment_id', v_appointment_id,
    'total', v_total,
    'payment_status', v_payment_status,
    'service_type', v_service_type,
    'service_label', v_service_label,
    'subscription_benefit_used', v_subscription_benefit_used,
    'subscription_id', v_subscription_id,
    'subscription_plan_name', v_subscription_plan_name,
    'duplicated', false
  );

  update public.petbot_order_commits
  set status = 'completed',
      result = v_result,
      updated_at = now()
  where tenant_id = v_tenant_id
    and idempotency_key = v_idempotency_key;

  return v_result;
end;
$$;

revoke all on function public.create_petbot_order_transaction(jsonb) from public, anon, authenticated;
grant execute on function public.create_petbot_order_transaction(jsonb) to service_role;

commit;
