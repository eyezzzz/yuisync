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
