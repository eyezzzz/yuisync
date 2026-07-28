begin;

alter table public.settings
  add column if not exists receipt_logo_data_url text;

comment on column public.settings.receipt_logo_data_url is
  'Logo monocromatica compactada para o cabecalho das impressoes termicas.';

create or replace function public.resolve_petshop_transport_fee(
  p_tenant_id uuid,
  p_module_id text,
  p_transport_mode text
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mode text := coalesce(nullif(trim(p_transport_mode), ''), 'cliente_leva');
  v_options jsonb := '[]'::jsonb;
  v_legacy_fee numeric := null;
  v_fee numeric := null;
begin
  if v_mode = 'cliente_leva' then
    return 0;
  end if;

  select
    case
      when jsonb_typeof(settings.pet_transport_options) = 'array' then settings.pet_transport_options
      else '[]'::jsonb
    end,
    greatest(0, coalesce(settings.pet_transport_fee, 0))
  into v_options, v_legacy_fee
  from public.settings settings
  where settings.tenant_id = p_tenant_id
    and settings.module_id = p_module_id
  limit 1;

  select case
    when nullif(trim(option_item->>'fee'), '') ~ '^\d+(?:[\.,]\d+)?$'
      then replace(option_item->>'fee', ',', '.')::numeric
    else null
  end
  into v_fee
  from jsonb_array_elements(coalesce(v_options, '[]'::jsonb)) option_item
  where option_item->>'id' = v_mode
    and coalesce(nullif(option_item->>'active', '')::boolean, true)
  limit 1;

  if v_fee is not null then
    return round(greatest(0, v_fee), 2);
  end if;

  return round(greatest(0, case
    when v_mode = 'buscar_e_levar' then coalesce(nullif(v_legacy_fee, 0), 20)
    when v_mode in ('somente_buscar', 'somente_levar') then 15
    else 0
  end), 2);
end;
$$;

revoke all on function public.resolve_petshop_transport_fee(uuid, text, text) from public;
grant execute on function public.resolve_petshop_transport_fee(uuid, text, text) to authenticated, service_role;

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
  v_transport_mode text;
  v_service_price numeric;
  v_transport_fee numeric;
  v_total_price numeric;
  v_duration integer;
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

  v_transport_mode := coalesce(nullif(trim(p_payload->>'transport_mode'), ''), 'cliente_leva');
  v_service_price := round(greatest(0, coalesce((v_resolved->>'price')::numeric, 0)), 2);
  v_transport_fee := public.resolve_petshop_transport_fee(v_tenant_id, v_module_id, v_transport_mode);
  v_total_price := round(v_service_price + v_transport_fee, 2);
  v_duration := greatest(10, coalesce(
    nullif(trim(p_payload->>'duration_min'), '')::integer,
    (v_resolved->>'duration_min')::integer,
    60
  ));

  insert into public.appointments (
    tenant_id, module_id, client_id, pet_id, service_type, service_group, service_items,
    scheduled_at, duration_min, price, status, notes, source, employee_id, groomer_id,
    responsible_staff_key, responsible_staff_name,
    transport_mode, transport_label, transport_address, transport_neighborhood,
    transport_city, transport_reference,
    subscription_id, subscription_benefit_used, idempotency_key
  ) values (
    v_tenant_id, v_module_id, v_client_id, coalesce(nullif(p_payload->>'pet_id', '')::uuid, v_client_id),
    v_resolved->>'service_type', v_resolved->>'service_group', v_resolved->'items',
    (p_payload->>'scheduled_at')::timestamptz,
    v_duration,
    v_total_price,
    coalesce(nullif(trim(p_payload->>'status'), ''), 'agendado'),
    concat_ws(' | ', nullif(trim(p_payload->>'notes'), ''), case when (v_resolved->>'benefit_used')::boolean then 'Beneficio de plano aplicado' end),
    v_source,
    nullif(p_payload->>'employee_id', '')::uuid,
    nullif(p_payload->>'groomer_id', '')::uuid,
    nullif(trim(p_payload->>'responsible_staff_key'), ''),
    nullif(trim(p_payload->>'responsible_staff_name'), ''),
    v_transport_mode,
    nullif(trim(p_payload->>'transport_label'), ''),
    nullif(trim(p_payload->>'transport_address'), ''),
    nullif(trim(p_payload->>'transport_neighborhood'), ''),
    nullif(trim(p_payload->>'transport_city'), ''),
    nullif(trim(p_payload->>'transport_reference'), ''),
    nullif(v_resolved->>'subscription_id', '')::uuid,
    coalesce((v_resolved->>'benefit_used')::boolean, false),
    v_idempotency_key
  ) returning id into v_appointment_id;

  return jsonb_build_object(
    'appointment_id', v_appointment_id,
    'service_price', v_service_price,
    'transport_fee', v_transport_fee,
    'price', v_total_price,
    'duration_min', v_duration,
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
  v_transport_mode text;
  v_old_transport_fee numeric := 0;
  v_transport_fee numeric := 0;
  v_service_price numeric := 0;
  v_total_price numeric := 0;
  v_duration integer;
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
    v_service_price := round(greatest(0, coalesce((v_resolved->>'price')::numeric, 0)), 2);
  else
    v_resolved := jsonb_build_object(
      'service_type', v_current.service_type,
      'service_group', v_current.service_group,
      'items', coalesce(v_current.service_items, '[]'::jsonb),
      'duration_min', v_current.duration_min,
      'subscription_id', v_current.subscription_id,
      'benefit_used', v_current.subscription_benefit_used
    );

    if jsonb_typeof(coalesce(v_current.service_items, '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(v_current.service_items, '[]'::jsonb)) > 0 then
      select round(coalesce(sum(greatest(0, coalesce(nullif(item->>'unit_price', '')::numeric, 0))), 0), 2)
      into v_service_price
      from jsonb_array_elements(v_current.service_items) item;
    end if;

    v_old_transport_fee := public.resolve_petshop_transport_fee(
      v_tenant_id,
      v_module_id,
      coalesce(v_current.transport_mode, 'cliente_leva')
    );
    if v_service_price <= 0 and coalesce(v_current.price, 0) > 0 then
      v_service_price := greatest(0, v_current.price - v_old_transport_fee);
    end if;
  end if;

  v_transport_mode := case
    when p_payload ? 'transport_mode' then coalesce(nullif(trim(p_payload->>'transport_mode'), ''), 'cliente_leva')
    else coalesce(nullif(trim(v_current.transport_mode), ''), 'cliente_leva')
  end;

  v_duration := greatest(10, coalesce(
    nullif(trim(p_payload->>'duration_min'), '')::integer,
    (v_resolved->>'duration_min')::integer,
    v_current.duration_min,
    60
  ));

  if not v_recalculate and not (p_payload ? 'transport_mode') then
    v_transport_fee := v_old_transport_fee;
    v_total_price := round(greatest(0, coalesce(v_current.price, v_service_price + v_transport_fee)), 2);
  else
    v_transport_fee := public.resolve_petshop_transport_fee(v_tenant_id, v_module_id, v_transport_mode);
    v_total_price := round(v_service_price + v_transport_fee, 2);
  end if;

  update public.appointments
  set client_id = v_client_id,
      pet_id = coalesce(nullif(p_payload->>'pet_id', '')::uuid, v_current.pet_id, v_client_id),
      service_type = v_resolved->>'service_type',
      service_group = v_resolved->>'service_group',
      service_items = v_resolved->'items',
      scheduled_at = coalesce(nullif(p_payload->>'scheduled_at', '')::timestamptz, v_current.scheduled_at),
      duration_min = v_duration,
      price = v_total_price,
      status = coalesce(nullif(trim(p_payload->>'status'), ''), v_current.status),
      notes = case when p_payload ? 'notes' then nullif(trim(p_payload->>'notes'), '') else v_current.notes end,
      source = coalesce(nullif(trim(p_payload->>'source'), ''), v_current.source, 'manual'),
      employee_id = case when p_payload ? 'employee_id' then nullif(p_payload->>'employee_id', '')::uuid else v_current.employee_id end,
      groomer_id = case when p_payload ? 'groomer_id' then nullif(p_payload->>'groomer_id', '')::uuid else v_current.groomer_id end,
      responsible_staff_key = case when p_payload ? 'responsible_staff_key' then nullif(trim(p_payload->>'responsible_staff_key'), '') else v_current.responsible_staff_key end,
      responsible_staff_name = case when p_payload ? 'responsible_staff_name' then nullif(trim(p_payload->>'responsible_staff_name'), '') else v_current.responsible_staff_name end,
      transport_mode = v_transport_mode,
      transport_label = case when p_payload ? 'transport_label' then nullif(trim(p_payload->>'transport_label'), '') else v_current.transport_label end,
      transport_address = case when p_payload ? 'transport_address' then nullif(trim(p_payload->>'transport_address'), '') else v_current.transport_address end,
      transport_neighborhood = case when p_payload ? 'transport_neighborhood' then nullif(trim(p_payload->>'transport_neighborhood'), '') else v_current.transport_neighborhood end,
      transport_city = case when p_payload ? 'transport_city' then nullif(trim(p_payload->>'transport_city'), '') else v_current.transport_city end,
      transport_reference = case when p_payload ? 'transport_reference' then nullif(trim(p_payload->>'transport_reference'), '') else v_current.transport_reference end,
      subscription_id = nullif(v_resolved->>'subscription_id', '')::uuid,
      subscription_benefit_used = coalesce((v_resolved->>'benefit_used')::boolean, false),
      updated_at = now()
  where id = p_appointment_id and tenant_id = v_tenant_id;

  return jsonb_build_object(
    'appointment_id', p_appointment_id,
    'service_price', v_service_price,
    'transport_fee', v_transport_fee,
    'price', v_total_price,
    'duration_min', v_duration,
    'service_items', v_resolved->'items'
  );
end;
$$;

revoke all on function public.book_petshop_appointment_transaction(jsonb) from public;
revoke all on function public.update_petshop_appointment_transaction(uuid, jsonb) from public;
grant execute on function public.book_petshop_appointment_transaction(jsonb) to authenticated, service_role;
grant execute on function public.update_petshop_appointment_transaction(uuid, jsonb) to authenticated, service_role;

commit;
