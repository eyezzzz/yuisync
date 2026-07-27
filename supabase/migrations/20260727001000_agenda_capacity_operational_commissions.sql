begin;

-- Two operational lanes are available for petshop appointments. This setting is
-- shared by manual bookings and the PetBot so both paths use the same source of
-- truth.
alter table public.settings
  alter column petbot_booking_capacity set default 2;

update public.settings
set petbot_booking_capacity = 2
where module_id = 'petshop'
  and petbot_booking_capacity is distinct from 2;

-- Manual appointments keep their transport snapshot on the appointment itself.
-- PetBot appointments may still be enriched from service_delivery_orders.
alter table public.appointments
  add column if not exists transport_mode text,
  add column if not exists transport_label text,
  add column if not exists transport_address text,
  add column if not exists transport_neighborhood text,
  add column if not exists transport_city text,
  add column if not exists transport_reference text;

alter table public.appointments
  drop constraint if exists appointments_transport_mode_check;

alter table public.appointments
  add constraint appointments_transport_mode_check
  check (
    transport_mode is null
    or transport_mode in ('cliente_leva', 'motodog', 'buscar_e_levar', 'somente_buscar', 'somente_levar')
  );

create index if not exists appointments_tenant_transport_schedule_idx
  on public.appointments (tenant_id, module_id, transport_mode, scheduled_at)
  where transport_mode is not null;

-- Enforce two simultaneous lanes and prevent the same operational responsible
-- person from being assigned to overlapping work. The advisory lock makes the
-- capacity check safe when two operators save at the same time.
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
  v_capacity integer := 2;
  v_overlap_count integer := 0;
begin
  if lower(coalesce(new.status, '')) <> all(active_statuses) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    new.tenant_id::text || ':' || new.module_id || ':' || coalesce(new.service_group, 'geral') || ':' || new.scheduled_at::date::text,
    0
  ));

  select greatest(2, coalesce(settings.petbot_booking_capacity, 2))
  into v_capacity
  from public.settings settings
  where settings.tenant_id = new.tenant_id
    and settings.module_id = new.module_id
  limit 1;

  v_capacity := coalesce(v_capacity, 2);

  if nullif(trim(coalesce(new.responsible_staff_key, '')), '') is not null and exists (
    select 1
    from public.appointments current
    where current.tenant_id = new.tenant_id
      and current.module_id = new.module_id
      and current.id is distinct from new.id
      and lower(coalesce(current.status, '')) = any(active_statuses)
      and nullif(trim(coalesce(current.responsible_staff_key, '')), '') = nullif(trim(new.responsible_staff_key), '')
      and current.scheduled_at < new.scheduled_at + make_interval(mins => greatest(15, coalesce(new.duration_min, 60)))
      and current.scheduled_at + make_interval(mins => greatest(15, coalesce(current.duration_min, 60))) > new.scheduled_at
  ) then
    raise exception 'O responsavel selecionado ja possui atendimento nesse horario.';
  end if;

  select count(*)::integer
  into v_overlap_count
  from public.appointments current
  where current.tenant_id = new.tenant_id
    and current.module_id = new.module_id
    and current.id is distinct from new.id
    and lower(coalesce(current.status, '')) = any(active_statuses)
    and coalesce(current.service_group, 'geral') = coalesce(new.service_group, 'geral')
    and current.scheduled_at < new.scheduled_at + make_interval(mins => greatest(15, coalesce(new.duration_min, 60)))
    and current.scheduled_at + make_interval(mins => greatest(15, coalesce(current.duration_min, 60))) > new.scheduled_at;

  if v_overlap_count >= v_capacity then
    raise exception 'O horario atingiu o limite de % vagas simultaneas.', v_capacity;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_appointment_overlap on public.appointments;
create trigger prevent_appointment_overlap
before insert or update of scheduled_at, duration_min, employee_id, groomer_id,
  responsible_staff_key, service_group, status
on public.appointments
for each row execute function public.prevent_appointment_overlap();

-- Persist responsible staff and transport in the same transaction that creates
-- or edits the appointment. This prevents a valid reservation from being left
-- behind if the operational assignment is rejected.
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
    responsible_staff_key, responsible_staff_name,
    transport_mode, transport_label, transport_address, transport_neighborhood,
    transport_city, transport_reference,
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
    nullif(trim(p_payload->>'responsible_staff_key'), ''),
    nullif(trim(p_payload->>'responsible_staff_name'), ''),
    nullif(trim(p_payload->>'transport_mode'), ''),
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
      responsible_staff_key = case when p_payload ? 'responsible_staff_key' then nullif(trim(p_payload->>'responsible_staff_key'), '') else v_current.responsible_staff_key end,
      responsible_staff_name = case when p_payload ? 'responsible_staff_name' then nullif(trim(p_payload->>'responsible_staff_name'), '') else v_current.responsible_staff_name end,
      transport_mode = case when p_payload ? 'transport_mode' then nullif(trim(p_payload->>'transport_mode'), '') else v_current.transport_mode end,
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
    'price', (v_resolved->>'price')::numeric,
    'duration_min', (v_resolved->>'duration_min')::integer,
    'service_items', v_resolved->'items'
  );
end;
$$;

revoke all on function public.book_petshop_appointment_transaction(jsonb) from public;
revoke all on function public.update_petshop_appointment_transaction(uuid, jsonb) from public;
grant execute on function public.book_petshop_appointment_transaction(jsonb) to authenticated, service_role;
grant execute on function public.update_petshop_appointment_transaction(uuid, jsonb) to authenticated, service_role;

-- Operational staff are stored in settings.petshop_operational_staff and do not
-- need a YuiSync login. Commission is calculated per service item: grooming/tosa
-- receives 10%; every other aesthetic service receives 5%.
create or replace function public.calculate_petshop_operational_commissions(
  p_module_id text,
  p_start timestamptz,
  p_end timestamptz,
  p_tenant_id uuid default null
)
returns table (
  staff_key text,
  collaborator_name text,
  service_count bigint,
  grooming_count bigint,
  other_service_count bigint,
  service_revenue numeric,
  grooming_revenue numeric,
  other_service_revenue numeric,
  grooming_commission numeric,
  other_service_commission numeric,
  total_commission numeric,
  detail jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_tenant_id is null or not public.has_tenant_access(p_tenant_id) then
    raise exception 'Tenant invalido ou sem permissao.';
  end if;

  return query
  with configured_staff as (
    select
      nullif(trim(item->>'key'), '') as staff_key,
      coalesce(nullif(trim(item->>'name'), ''), nullif(trim(item->>'key'), ''), 'Esteticista') as staff_name,
      coalesce(nullif(item->>'active', '')::boolean, true) as active
    from public.settings settings
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(settings.petshop_operational_staff) = 'array' then settings.petshop_operational_staff
        else '[]'::jsonb
      end
    ) item
    where settings.tenant_id = p_tenant_id
      and settings.module_id = p_module_id
  ),
  appointment_base as (
    select
      appointment.id,
      nullif(trim(appointment.responsible_staff_key), '') as staff_key,
      coalesce(nullif(trim(appointment.responsible_staff_name), ''), nullif(trim(appointment.responsible_staff_key), ''), 'Esteticista') as snapshot_name,
      greatest(0, coalesce(appointment.price, 0))::numeric as appointment_price,
      case
        when jsonb_typeof(coalesce(appointment.service_items, '[]'::jsonb)) = 'array'
          and jsonb_array_length(coalesce(appointment.service_items, '[]'::jsonb)) > 0
          then appointment.service_items
        else jsonb_build_array(jsonb_build_object(
          'code', appointment.service_type,
          'name', appointment.service_type,
          'group_type', coalesce(appointment.service_group, 'banho_tosa'),
          'unit_price', greatest(0, coalesce(appointment.price, 0))
        ))
      end as items
    from public.appointments appointment
    where appointment.tenant_id = p_tenant_id
      and appointment.module_id = p_module_id
      and appointment.status = 'concluido'
      and appointment.scheduled_at >= p_start
      and appointment.scheduled_at <= p_end
      and nullif(trim(appointment.responsible_staff_key), '') is not null
      and coalesce(appointment.service_group, 'banho_tosa') = 'banho_tosa'
  ),
  service_lines as (
    select
      base.id as appointment_id,
      base.staff_key,
      base.snapshot_name,
      coalesce(item->>'code', '') as service_code,
      coalesce(item->>'name', item->>'code', 'Servico estetico') as service_name,
      greatest(0, coalesce(
        nullif(item->>'unit_price', '')::numeric,
        nullif(item->>'catalog_price', '')::numeric,
        case when jsonb_array_length(base.items) = 1 then base.appointment_price else 0 end
      ))::numeric as revenue
    from appointment_base base
    cross join lateral jsonb_array_elements(base.items) item
    where coalesce(item->>'group_type', 'banho_tosa') = 'banho_tosa'
  ),
  rated_lines as (
    select
      line.*,
      public.normalize_petshop_catalog_text(concat_ws(' ', line.service_code, line.service_name))
        ~ '(tosa|tesoura|maquina|groom|trim)' as is_grooming
    from service_lines line
  ),
  totals as (
    select
      rated.staff_key,
      max(rated.snapshot_name) as snapshot_name,
      count(*)::bigint as service_count,
      count(*) filter (where rated.is_grooming)::bigint as grooming_count,
      count(*) filter (where not rated.is_grooming)::bigint as other_service_count,
      coalesce(sum(rated.revenue), 0)::numeric as service_revenue,
      coalesce(sum(rated.revenue) filter (where rated.is_grooming), 0)::numeric as grooming_revenue,
      coalesce(sum(rated.revenue) filter (where not rated.is_grooming), 0)::numeric as other_service_revenue,
      coalesce(sum(rated.revenue * 0.10) filter (where rated.is_grooming), 0)::numeric as grooming_commission,
      coalesce(sum(rated.revenue * 0.05) filter (where not rated.is_grooming), 0)::numeric as other_service_commission
    from rated_lines rated
    group by rated.staff_key
  ),
  staff_catalog as (
    select configured.staff_key, configured.staff_name, configured.active
    from configured_staff configured
    where configured.staff_key is not null
    union
    select totals.staff_key, totals.snapshot_name, true
    from totals
  ),
  staff_rows as (
    select
      catalog.staff_key,
      max(catalog.staff_name) as staff_name,
      bool_or(catalog.active) as active
    from staff_catalog catalog
    group by catalog.staff_key
  )
  select
    staff.staff_key,
    staff.staff_name as collaborator_name,
    coalesce(totals.service_count, 0)::bigint,
    coalesce(totals.grooming_count, 0)::bigint,
    coalesce(totals.other_service_count, 0)::bigint,
    round(coalesce(totals.service_revenue, 0), 2),
    round(coalesce(totals.grooming_revenue, 0), 2),
    round(coalesce(totals.other_service_revenue, 0), 2),
    round(coalesce(totals.grooming_commission, 0), 2),
    round(coalesce(totals.other_service_commission, 0), 2),
    round(coalesce(totals.grooming_commission, 0) + coalesce(totals.other_service_commission, 0), 2),
    jsonb_build_object(
      'active', staff.active,
      'grooming_rate', 10,
      'other_service_rate', 5,
      'grooming_revenue', coalesce(totals.grooming_revenue, 0),
      'other_service_revenue', coalesce(totals.other_service_revenue, 0)
    )
  from staff_rows staff
  left join totals on totals.staff_key = staff.staff_key
  order by
    coalesce(totals.grooming_commission, 0) + coalesce(totals.other_service_commission, 0) desc,
    staff.staff_name asc;
end;
$$;

revoke all on function public.calculate_petshop_operational_commissions(text, timestamptz, timestamptz, uuid) from public;
grant execute on function public.calculate_petshop_operational_commissions(text, timestamptz, timestamptz, uuid)
  to authenticated, service_role;

comment on function public.calculate_petshop_operational_commissions(text, timestamptz, timestamptz, uuid) is
  'Calcula comissoes por responsible_staff_key: tosa 10%, demais servicos esteticos 5%.';

commit;
