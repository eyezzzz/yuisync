-- Infrastructure fixes for manual appointments, delivery fees and multi-service bookings.
begin;

-- ---------------------------------------------------------------------------
-- Extensible appointment sources. The previous enum-like check rejected the
-- manual agenda flow when the RPC used "agenda" or the UI used "manual".
-- ---------------------------------------------------------------------------
alter table public.appointments
  alter column source set default 'manual';

update public.appointments
set source = coalesce(
  nullif(trim(both '_' from regexp_replace(lower(trim(coalesce(source, ''))), '[^a-z0-9_:-]+', '_', 'g')), ''),
  'manual'
);

alter table public.appointments
  drop constraint if exists appointments_source_check;

alter table public.appointments
  add constraint appointments_source_check
  check (source ~ '^[a-z0-9][a-z0-9_:-]{0,39}$');

-- ---------------------------------------------------------------------------
-- Service classification and historical snapshots for appointments.
-- ---------------------------------------------------------------------------
create or replace function public.classify_petshop_appointment_service_group(
  p_name text,
  p_code text default null,
  p_declared_group text default null
)
returns text
language sql
immutable
as $$
  select case
    when public.normalize_petshop_catalog_text(concat_ws(' ', p_name, p_code))
      ~ '(vet|veterin|consulta|vacina|clinica|medico|exame|cirurg|ultrassom|castr|retorno|internac|curativo|vermifug|microchip|aplicacao)'
      then 'veterinaria'
    when public.normalize_petshop_catalog_text(concat_ws(' ', p_name, p_code))
      ~ '(banho|tosa|desembolo|escovac|hidrat|higien|groom|perfume|spa|trim|unha|ouvido|orelha)'
      then 'banho_tosa'
    when p_declared_group in ('banho_tosa', 'veterinaria', 'motoboy', 'outro')
      then p_declared_group
    else 'outro'
  end;
$$;

update public.petshop_services
set group_type = public.classify_petshop_appointment_service_group(name, code, group_type),
    updated_at = now()
where group_type is distinct from public.classify_petshop_appointment_service_group(name, code, group_type);

alter table public.appointments
  add column if not exists service_group text,
  add column if not exists service_items jsonb not null default '[]'::jsonb;

alter table public.appointments
  drop constraint if exists appointments_service_group_check;
alter table public.appointments
  add constraint appointments_service_group_check
  check (service_group is null or service_group in ('banho_tosa', 'veterinaria'));

alter table public.appointments
  drop constraint if exists appointments_service_items_check;
alter table public.appointments
  add constraint appointments_service_items_check
  check (jsonb_typeof(service_items) = 'array');

with service_snapshot as (
  select
    appointment.id,
    coalesce(
      service.group_type,
      public.classify_petshop_appointment_service_group(service.name, service.code, null),
      public.classify_petshop_appointment_service_group(appointment.service_type, appointment.service_type, null)
    ) as service_group,
    jsonb_build_array(jsonb_build_object(
      'code', appointment.service_type,
      'name', coalesce(service.name, appointment.service_type, 'Servico'),
      'group_type', coalesce(
        service.group_type,
        public.classify_petshop_appointment_service_group(service.name, service.code, null),
        public.classify_petshop_appointment_service_group(appointment.service_type, appointment.service_type, null)
      ),
      'unit_price', coalesce(appointment.price, service.default_price, 0),
      'duration_min', greatest(15, coalesce(appointment.duration_min, service.default_duration_min, 60)),
      'benefit_used', coalesce(appointment.subscription_benefit_used, false)
    )) as service_items
  from public.appointments appointment
  left join public.petshop_services service
    on service.tenant_id = appointment.tenant_id
   and service.module_id = appointment.module_id
   and service.code = appointment.service_type
  where appointment.service_type is not null
)
update public.appointments appointment
set service_group = case
      when snapshot.service_group in ('banho_tosa', 'veterinaria') then snapshot.service_group
      else appointment.service_group
    end,
    service_items = case
      when jsonb_array_length(coalesce(appointment.service_items, '[]'::jsonb)) = 0 then snapshot.service_items
      else appointment.service_items
    end
from service_snapshot snapshot
where snapshot.id = appointment.id;

create index if not exists appointments_tenant_service_group_scheduled_idx
  on public.appointments (tenant_id, module_id, service_group, scheduled_at);

-- Keep products -> petshop_services synchronization strict: unknown commercial
-- services remain available in the service catalog, but do not leak into either
-- appointment tab until they are classified.
create or replace function public.sync_product_service_to_petshop_services()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.products%rowtype;
  v_text text;
  v_name text;
  v_code text;
  v_group text;
  v_duration integer := 60;
  v_is_service boolean := false;
begin
  if tg_op = 'DELETE' then
    update public.petshop_services
    set active = false,
        updated_at = now()
    where tenant_id = old.tenant_id
      and module_id = old.module_id
      and (
        source_product_id = old.id
        or code = 'catalog_' || replace(old.id::text, '-', '')
      );
    return old;
  end if;

  v_row := new;
  v_name := trim(coalesce(v_row.name, ''));
  v_text := public.normalize_petshop_catalog_text(concat_ws(' ', v_row.name, v_row.category, v_row.bot_metadata->>'product_type'));
  v_code := 'catalog_' || replace(v_row.id::text, '-', '');

  v_is_service := (
    public.normalize_petshop_catalog_text(trim(coalesce(v_row.bot_metadata->>'product_type', ''))) = 'servico'
    or public.normalize_petshop_catalog_text(trim(coalesce(v_row.category, ''))) = 'servico'
    or v_text ~ '(banho|tosa|desembolo|escovac|hidrat|higien|consulta|vacina|exame|cirurg|ultrassom|castr|curativo|microchip)'
  )
  and public.normalize_petshop_catalog_text(v_name) !~ '(banheira|banho a seco|brinquedo|casinha|roupa|shampoo|varinha)'
  and public.normalize_petshop_catalog_text(v_name) !~ '(pacote.*banho|banho.*pacote)';

  if coalesce(v_row.bot_metadata->>'duration_min', '') ~ '^[0-9]+$' then
    v_duration := greatest(15, (v_row.bot_metadata->>'duration_min')::integer);
  elsif coalesce(v_row.bot_metadata->>'service_duration_min', '') ~ '^[0-9]+$' then
    v_duration := greatest(15, (v_row.bot_metadata->>'service_duration_min')::integer);
  end if;

  v_group := public.classify_petshop_appointment_service_group(
    v_name,
    v_code,
    nullif(v_row.bot_metadata->>'service_group', '')
  );

  if v_is_service and coalesce(v_row.active, false) and coalesce(v_row.price, 0) > 0 and v_name <> '' then
    insert into public.petshop_services (
      tenant_id, module_id, code, name, group_type, default_price,
      default_duration_min, commission_type, commission_rate, active,
      sort_order, icon, source_product_id, updated_at
    ) values (
      v_row.tenant_id, v_row.module_id, v_code, v_name, v_group, v_row.price,
      v_duration, 'percentage', 0, true, 500,
      case when v_group = 'veterinaria' then 'stethoscope' when v_group = 'banho_tosa' then 'droplets' else 'paw' end,
      v_row.id, now()
    )
    on conflict (tenant_id, module_id, code) do update
    set name = excluded.name,
        group_type = excluded.group_type,
        default_price = excluded.default_price,
        default_duration_min = excluded.default_duration_min,
        active = true,
        source_product_id = excluded.source_product_id,
        updated_at = now();
  else
    update public.petshop_services
    set active = false,
        updated_at = now()
    where tenant_id = v_row.tenant_id
      and module_id = v_row.module_id
      and (source_product_id = v_row.id or code = v_code);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Resolve one or more appointment services from the current service catalog.
-- Prices and durations are always sourced from petshop_services.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_petshop_appointment_services(
  p_tenant_id uuid,
  p_module_id text,
  p_client_id uuid,
  p_services jsonb,
  p_fallback_service_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested jsonb := coalesce(p_services, '[]'::jsonb);
  v_item jsonb;
  v_service record;
  v_code text;
  v_group text := null;
  v_service_group text;
  v_items jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_duration integer := 0;
  v_subscription record;
  v_plan_services jsonb := '[]'::jsonb;
  v_usage jsonb := '{}'::jsonb;
  v_plan_service jsonb;
  v_used integer;
  v_limit integer;
  v_benefit boolean;
  v_any_benefit boolean := false;
begin
  if jsonb_typeof(v_requested) <> 'array' then
    raise exception 'Lista de servicos invalida.';
  end if;
  if jsonb_array_length(v_requested) = 0 and nullif(trim(p_fallback_service_type), '') is not null then
    v_requested := jsonb_build_array(jsonb_build_object('code', trim(p_fallback_service_type)));
  end if;
  if jsonb_array_length(v_requested) = 0 then raise exception 'Selecione pelo menos um servico.'; end if;
  if jsonb_array_length(v_requested) > 10 then raise exception 'Limite de 10 servicos por agendamento.'; end if;

  select subscription.id, subscription.services_used, plan.services
  into v_subscription
  from public.client_subscriptions subscription
  join public.subscription_plans plan
    on plan.id = subscription.plan_id
   and plan.tenant_id = subscription.tenant_id
  where subscription.tenant_id = p_tenant_id
    and subscription.module_id = p_module_id
    and subscription.client_id = p_client_id
    and subscription.status = 'active'
  order by subscription.started_at desc
  limit 1
  for update of subscription;

  if found then
    v_plan_services := coalesce(v_subscription.services, '[]'::jsonb);
    v_usage := coalesce(v_subscription.services_used, '{}'::jsonb);
  end if;

  for v_item in select * from jsonb_array_elements(v_requested)
  loop
    v_code := nullif(trim(coalesce(v_item->>'code', v_item->>'service_type')), '');
    if v_code is null then raise exception 'Codigo de servico invalido.'; end if;
    if exists (select 1 from jsonb_array_elements(v_items) existing where existing->>'code' = v_code) then
      continue;
    end if;

    select id, code, name, group_type, default_price, default_duration_min
    into v_service
    from public.petshop_services
    where tenant_id = p_tenant_id
      and module_id = p_module_id
      and code = v_code
      and active = true
    for share;

    if not found then raise exception 'Servico nao encontrado ou inativo: %.', v_code; end if;

    v_service_group := public.classify_petshop_appointment_service_group(v_service.name, v_service.code, v_service.group_type);
    if v_service_group not in ('banho_tosa', 'veterinaria') then
      raise exception 'Servico % nao esta classificado para a agenda.', v_service.name;
    end if;
    if v_group is null then v_group := v_service_group; end if;
    if v_group <> v_service_group then
      raise exception 'Servicos de banho/tosa e veterinaria devem ser agendados separadamente.';
    end if;

    v_benefit := false;
    if v_subscription.id is not null then
      select value into v_plan_service
      from jsonb_array_elements(v_plan_services)
      where value->>'service_type' = v_service.code
      limit 1;

      if v_plan_service is not null then
        v_used := coalesce((v_usage->>v_service.code)::integer, 0);
        v_limit := coalesce((v_plan_service->>'qty_per_cycle')::integer, 0);
        if v_limit > v_used then
          v_benefit := true;
          v_any_benefit := true;
          v_usage := jsonb_set(v_usage, array[v_service.code], to_jsonb(v_used + 1), true);
        end if;
      end if;
    end if;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', v_service.code,
      'name', v_service.name,
      'group_type', v_service_group,
      'unit_price', case when v_benefit then 0 else greatest(0, coalesce(v_service.default_price, 0)) end,
      'catalog_price', greatest(0, coalesce(v_service.default_price, 0)),
      'duration_min', greatest(15, coalesce(v_service.default_duration_min, 60)),
      'benefit_used', v_benefit
    ));
    v_total := v_total + case when v_benefit then 0 else greatest(0, coalesce(v_service.default_price, 0)) end;
    v_duration := v_duration + greatest(15, coalesce(v_service.default_duration_min, 60));
  end loop;

  if jsonb_array_length(v_items) = 0 then raise exception 'Nenhum servico valido selecionado.'; end if;

  if v_any_benefit then
    update public.client_subscriptions
    set services_used = v_usage,
        updated_at = now()
    where id = v_subscription.id and tenant_id = p_tenant_id;
  end if;

  return jsonb_build_object(
    'items', v_items,
    'service_type', v_items->0->>'code',
    'service_group', v_group,
    'price', round(v_total, 2),
    'duration_min', greatest(15, v_duration),
    'subscription_id', case when v_any_benefit then v_subscription.id else null end,
    'benefit_used', v_any_benefit
  );
end;
$$;

create or replace function public.restore_petshop_appointment_benefits(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment record;
  v_subscription record;
  v_items jsonb;
  v_item jsonb;
  v_code text;
  v_used integer;
begin
  select id, tenant_id, subscription_id, subscription_benefit_used, service_type, service_items
  into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found or v_appointment.subscription_id is null or not coalesce(v_appointment.subscription_benefit_used, false) then
    return;
  end if;

  select id, services_used
  into v_subscription
  from public.client_subscriptions
  where id = v_appointment.subscription_id and tenant_id = v_appointment.tenant_id
  for update;

  if not found then return; end if;
  v_items := coalesce(v_appointment.service_items, '[]'::jsonb);
  if jsonb_array_length(v_items) = 0 and v_appointment.service_type is not null then
    v_items := jsonb_build_array(jsonb_build_object('code', v_appointment.service_type, 'benefit_used', true));
  end if;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    if coalesce((v_item->>'benefit_used')::boolean, false) then
      v_code := nullif(v_item->>'code', '');
      if v_code is not null then
        v_used := greatest(0, coalesce((v_subscription.services_used->>v_code)::integer, 0) - 1);
        v_subscription.services_used := jsonb_set(coalesce(v_subscription.services_used, '{}'::jsonb), array[v_code], to_jsonb(v_used), true);
      end if;
    end if;
  end loop;

  update public.client_subscriptions
  set services_used = v_subscription.services_used,
      updated_at = now()
  where id = v_subscription.id;
end;
$$;

create or replace function public.book_petshop_appointment_transaction(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := nullif(p_payload->>'tenant_id', '')::uuid;
  v_module_id text := coalesce(nullif(trim(p_payload->>'module_id'), ''), 'petshop');
  v_client_id uuid := coalesce(nullif(p_payload->>'client_id', '')::uuid, nullif(p_payload->>'pet_id', '')::uuid);
  v_idempotency_key text := nullif(trim(p_payload->>'idempotency_key'), '');
  v_resolved jsonb;
  v_appointment_id uuid;
  v_source text := coalesce(nullif(trim(p_payload->>'source'), ''), 'manual');
begin
  if v_tenant_id is null or not public.has_tenant_access(v_tenant_id) then raise exception 'Tenant invalido ou sem permissao.'; end if;
  if v_client_id is null then raise exception 'Cliente obrigatorio.'; end if;
  if v_idempotency_key is null then raise exception 'Chave de idempotencia obrigatoria.'; end if;
  if nullif(p_payload->>'scheduled_at', '') is null then raise exception 'Data e horario obrigatorios.'; end if;

  select id into v_appointment_id
  from public.appointments
  where tenant_id = v_tenant_id and idempotency_key = v_idempotency_key
  limit 1;
  if found then return jsonb_build_object('appointment_id', v_appointment_id, 'duplicated', true); end if;

  if not exists (
    select 1 from public.clients
    where id = v_client_id and tenant_id = v_tenant_id and module_id = v_module_id and active = true
  ) then raise exception 'Cliente nao pertence ao tenant ativo.'; end if;

  v_resolved := public.resolve_petshop_appointment_services(
    v_tenant_id,
    v_module_id,
    v_client_id,
    coalesce(p_payload->'services', '[]'::jsonb),
    p_payload->>'service_type'
  );

  insert into public.appointments (
    tenant_id, module_id, client_id, pet_id, service_type, service_group, service_items,
    scheduled_at, duration_min, price, status, notes, source, employee_id, groomer_id,
    subscription_id, subscription_benefit_used, idempotency_key
  ) values (
    v_tenant_id, v_module_id, v_client_id, coalesce(nullif(p_payload->>'pet_id', '')::uuid, v_client_id),
    v_resolved->>'service_type', v_resolved->>'service_group', v_resolved->'items',
    (p_payload->>'scheduled_at')::timestamptz,
    (v_resolved->>'duration_min')::integer,
    (v_resolved->>'price')::numeric,
    coalesce(nullif(trim(p_payload->>'status'), ''), 'agendado'),
    concat_ws(' | ', nullif(trim(p_payload->>'notes'), ''), case when (v_resolved->>'benefit_used')::boolean then 'Beneficio de plano aplicado' end),
    v_source,
    nullif(p_payload->>'employee_id', '')::uuid,
    nullif(p_payload->>'groomer_id', '')::uuid,
    nullif(v_resolved->>'subscription_id', '')::uuid,
    coalesce((v_resolved->>'benefit_used')::boolean, false),
    v_idempotency_key
  ) returning id into v_appointment_id;

  return jsonb_build_object(
    'appointment_id', v_appointment_id,
    'price', (v_resolved->>'price')::numeric,
    'duration_min', (v_resolved->>'duration_min')::integer,
    'service_items', v_resolved->'items',
    'duplicated', false
  );
end;
$$;

create or replace function public.update_petshop_appointment_transaction(
  p_appointment_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.appointments%rowtype;
  v_tenant_id uuid := nullif(p_payload->>'tenant_id', '')::uuid;
  v_module_id text := coalesce(nullif(trim(p_payload->>'module_id'), ''), 'petshop');
  v_client_id uuid;
  v_resolved jsonb;
  v_recalculate boolean;
begin
  select * into v_current
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then raise exception 'Agendamento nao encontrado.'; end if;
  if v_tenant_id is null then v_tenant_id := v_current.tenant_id; end if;
  if v_current.tenant_id <> v_tenant_id or v_current.module_id <> v_module_id or not public.has_tenant_access(v_tenant_id) then
    raise exception 'Agendamento nao pertence ao tenant ativo.';
  end if;

  v_client_id := coalesce(nullif(p_payload->>'client_id', '')::uuid, nullif(p_payload->>'pet_id', '')::uuid, v_current.client_id);
  if not exists (
    select 1 from public.clients
    where id = v_client_id and tenant_id = v_tenant_id and module_id = v_module_id and active = true
  ) then raise exception 'Cliente nao pertence ao tenant ativo.'; end if;

  v_recalculate := p_payload ? 'services'
    or nullif(p_payload->>'service_type', '') is not null
    or v_client_id is distinct from v_current.client_id;

  if v_recalculate then
    perform public.restore_petshop_appointment_benefits(p_appointment_id);
    v_resolved := public.resolve_petshop_appointment_services(
      v_tenant_id,
      v_module_id,
      v_client_id,
      case when p_payload ? 'services' then coalesce(p_payload->'services', '[]'::jsonb) else coalesce(v_current.service_items, '[]'::jsonb) end,
      coalesce(nullif(p_payload->>'service_type', ''), v_current.service_type)
    );
  else
    v_resolved := jsonb_build_object(
      'service_type', v_current.service_type,
      'service_group', v_current.service_group,
      'items', coalesce(v_current.service_items, '[]'::jsonb),
      'price', v_current.price,
      'duration_min', v_current.duration_min,
      'subscription_id', v_current.subscription_id,
      'benefit_used', v_current.subscription_benefit_used
    );
  end if;

  update public.appointments
  set client_id = v_client_id,
      pet_id = coalesce(nullif(p_payload->>'pet_id', '')::uuid, v_current.pet_id, v_client_id),
      service_type = v_resolved->>'service_type',
      service_group = v_resolved->>'service_group',
      service_items = v_resolved->'items',
      scheduled_at = coalesce(nullif(p_payload->>'scheduled_at', '')::timestamptz, v_current.scheduled_at),
      duration_min = (v_resolved->>'duration_min')::integer,
      price = (v_resolved->>'price')::numeric,
      status = coalesce(nullif(trim(p_payload->>'status'), ''), v_current.status),
      notes = case when p_payload ? 'notes' then nullif(trim(p_payload->>'notes'), '') else v_current.notes end,
      source = coalesce(nullif(trim(p_payload->>'source'), ''), v_current.source, 'manual'),
      employee_id = case when p_payload ? 'employee_id' then nullif(p_payload->>'employee_id', '')::uuid else v_current.employee_id end,
      groomer_id = case when p_payload ? 'groomer_id' then nullif(p_payload->>'groomer_id', '')::uuid else v_current.groomer_id end,
      subscription_id = nullif(v_resolved->>'subscription_id', '')::uuid,
      subscription_benefit_used = coalesce((v_resolved->>'benefit_used')::boolean, false),
      updated_at = now()
  where id = p_appointment_id and tenant_id = v_tenant_id;

  return jsonb_build_object(
    'appointment_id', p_appointment_id,
    'price', (v_resolved->>'price')::numeric,
    'duration_min', (v_resolved->>'duration_min')::integer,
    'service_items', v_resolved->'items'
  );
end;
$$;

revoke all on function public.resolve_petshop_appointment_services(uuid, text, uuid, jsonb, text) from public;
revoke all on function public.restore_petshop_appointment_benefits(uuid) from public;
revoke all on function public.book_petshop_appointment_transaction(jsonb) from public;
revoke all on function public.update_petshop_appointment_transaction(uuid, jsonb) from public;
grant execute on function public.book_petshop_appointment_transaction(jsonb) to authenticated, service_role;
grant execute on function public.update_petshop_appointment_transaction(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Delivery fee: source it from settings and persist the exact amount charged.
-- ---------------------------------------------------------------------------
alter table public.settings
  alter column delivery_fee set default 8.00;
update public.settings set delivery_fee = 8.00 where delivery_fee is null;

alter table public.sales
  add column if not exists delivery_fee numeric(10,2) not null default 0;
alter table public.sales
  drop constraint if exists sales_delivery_fee_check;
alter table public.sales
  add constraint sales_delivery_fee_check check (delivery_fee >= 0);

create or replace function public.create_pdv_checkout_transaction(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := nullif(p_payload->>'tenant_id', '')::uuid;
  v_module_id text := coalesce(nullif(trim(p_payload->>'module_id'), ''), 'petshop');
  v_client_id uuid := nullif(p_payload->>'client_id', '')::uuid;
  v_profile_id uuid := auth.uid();
  v_idempotency_key text := nullif(trim(p_payload->>'idempotency_key'), '');
  v_requested_discount numeric := greatest(0, coalesce(nullif(p_payload->>'discount', '')::numeric, 0));
  v_max_discount_percent numeric := 0;
  v_items jsonb := coalesce(p_payload->'items', '[]'::jsonb);
  v_splits jsonb := coalesce(p_payload->'payment_splits', '[]'::jsonb);
  v_item jsonb;
  v_split jsonb;
  v_product record;
  v_quantity numeric;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_split_total numeric := 0;
  v_sale_id uuid;
  v_existing record;
  v_payment_method text := nullif(trim(p_payload->>'payment_method'), '');
  v_fulfillment_type text := coalesce(nullif(trim(p_payload->>'fulfillment_type'), ''), 'balcao');
  v_delivery_fee numeric := 0;
begin
  if v_profile_id is null then raise exception 'Sessao autenticada obrigatoria.'; end if;
  if v_tenant_id is null or not public.has_tenant_access(v_tenant_id) then raise exception 'Tenant invalido ou sem permissao.'; end if;
  if v_module_id <> 'petshop' then raise exception 'Checkout disponivel somente para petshop.'; end if;
  if v_idempotency_key is null or length(v_idempotency_key) > 128 then raise exception 'Chave de idempotencia invalida.'; end if;
  if jsonb_array_length(v_items) = 0 then raise exception 'Carrinho vazio.'; end if;
  if v_fulfillment_type not in ('balcao', 'entrega', 'servico') then raise exception 'Tipo de atendimento invalido.'; end if;

  select id, total_price, delivery_fee into v_existing
  from public.sales
  where tenant_id = v_tenant_id and idempotency_key = v_idempotency_key
  limit 1;
  if found then
    return jsonb_build_object('sale_id', v_existing.id, 'total', v_existing.total_price, 'delivery_fee', v_existing.delivery_fee, 'duplicated', true);
  end if;

  if v_client_id is not null and not exists (
    select 1 from public.clients where id = v_client_id and tenant_id = v_tenant_id and module_id = v_module_id
  ) then raise exception 'Cliente nao pertence ao tenant ativo.'; end if;

  select coalesce(max_pdv_discount_percent, 0), coalesce(delivery_fee, 8)
  into v_max_discount_percent, v_delivery_fee
  from public.settings
  where tenant_id = v_tenant_id and module_id = v_module_id
  limit 1;
  v_max_discount_percent := coalesce(v_max_discount_percent, 0);
  v_delivery_fee := case when v_fulfillment_type = 'entrega' then greatest(0, coalesce(v_delivery_fee, 8)) else 0 end;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_quantity := coalesce(nullif(v_item->>'quantity', '')::numeric, 0);
    if v_quantity <= 0 then raise exception 'Quantidade de produto invalida.'; end if;

    select id, name, price, cost_price, stock_quantity, active
    into v_product
    from public.products
    where id = nullif(v_item->>'product_id', '')::uuid
      and tenant_id = v_tenant_id
      and module_id = v_module_id
    for update;

    if not found or not coalesce(v_product.active, false) then raise exception 'Produto indisponivel.'; end if;
    if coalesce(v_product.price, 0) <= 0 then raise exception 'Produto sem preco valido: %.', v_product.name; end if;
    if coalesce(v_product.stock_quantity, 0) < v_quantity then raise exception 'Estoque insuficiente para %.', v_product.name; end if;
    v_subtotal := v_subtotal + (v_product.price * v_quantity);
  end loop;

  if v_requested_discount > round(v_subtotal * v_max_discount_percent / 100, 2) then
    raise exception 'Desconto excede o limite permitido de % por cento.', v_max_discount_percent;
  end if;
  v_total := greatest(0, round(v_subtotal - v_requested_discount, 2)) + v_delivery_fee;

  if jsonb_array_length(v_splits) > 0 then
    for v_split in select * from jsonb_array_elements(v_splits)
    loop
      if coalesce(v_split->>'method', '') not in ('dinheiro', 'debito', 'credito', 'pix') then raise exception 'Forma de pagamento dividida invalida.'; end if;
      if coalesce(nullif(v_split->>'amount', '')::numeric, 0) <= 0 then raise exception 'Valor de pagamento dividido invalido.'; end if;
      v_split_total := v_split_total + (v_split->>'amount')::numeric;
    end loop;
    if abs(v_split_total - v_total) > 0.01 then raise exception 'Pagamentos divididos nao fecham o total da venda.'; end if;
    v_payment_method := 'multiplo';
  elsif v_payment_method not in ('dinheiro', 'debito', 'credito', 'pix') then
    raise exception 'Forma de pagamento invalida.';
  end if;

  insert into public.sales (
    tenant_id, module_id, client_id, profile_id, customer_name, customer_phone,
    payment_method, subtotal, discount, delivery_fee, total_price, status, source,
    fulfillment_type, notes, idempotency_key
  ) values (
    v_tenant_id, v_module_id, v_client_id, v_profile_id,
    coalesce(nullif(trim(p_payload->>'customer_name'), ''), 'Balcao'),
    nullif(trim(p_payload->>'customer_phone'), ''), v_payment_method,
    v_subtotal, v_requested_discount, v_delivery_fee, v_total, 'concluido',
    coalesce(nullif(trim(p_payload->>'source'), ''), 'pdv'),
    v_fulfillment_type,
    concat_ws(' | ', nullif(trim(p_payload->>'notes'), ''), case when v_delivery_fee > 0 then 'Taxa de entrega: R$ ' || to_char(v_delivery_fee, 'FM999999990.00') end),
    v_idempotency_key
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_quantity := (v_item->>'quantity')::numeric;
    select id, price, cost_price, stock_quantity into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid
      and tenant_id = v_tenant_id
      and module_id = v_module_id
    for update;

    insert into public.sale_items (tenant_id, sale_id, product_id, quantity, unit_price, subtotal, upsell)
    values (
      v_tenant_id, v_sale_id, v_product.id, v_quantity, v_product.price,
      v_quantity * v_product.price, coalesce((v_item->>'upsell')::boolean, false)
    );

    update public.products
    set stock_quantity = v_product.stock_quantity - v_quantity, updated_at = now()
    where id = v_product.id and tenant_id = v_tenant_id;

    insert into public.stock_movements (
      tenant_id, module_id, product_id, sale_id, movement_type, quantity,
      stock_before, stock_after, unit_cost, reason, created_by
    ) values (
      v_tenant_id, v_module_id, v_product.id, v_sale_id, 'sale', -v_quantity,
      v_product.stock_quantity, v_product.stock_quantity - v_quantity,
      v_product.cost_price, 'Venda PDV', v_profile_id
    );
  end loop;

  for v_split in select * from jsonb_array_elements(v_splits)
  loop
    insert into public.sale_payment_splits (tenant_id, module_id, sale_id, payment_method, amount, position)
    values (
      v_tenant_id, v_module_id, v_sale_id, v_split->>'method',
      (v_split->>'amount')::numeric, coalesce(nullif(v_split->>'position', '')::integer, 1)
    );
  end loop;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'subtotal', v_subtotal,
    'discount', v_requested_discount,
    'delivery_fee', v_delivery_fee,
    'total', v_total,
    'duplicated', false
  );
exception
  when unique_violation then
    select id, total_price, delivery_fee into v_existing
    from public.sales
    where tenant_id = v_tenant_id and idempotency_key = v_idempotency_key
    limit 1;
    if found then
      return jsonb_build_object('sale_id', v_existing.id, 'total', v_existing.total_price, 'delivery_fee', v_existing.delivery_fee, 'duplicated', true);
    end if;
    raise;
end;
$$;

revoke all on function public.create_pdv_checkout_transaction(jsonb) from public;
grant execute on function public.create_pdv_checkout_transaction(jsonb) to authenticated, service_role;

commit;
