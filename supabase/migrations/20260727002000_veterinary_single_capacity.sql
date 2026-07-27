begin;

-- Banho e tosa mantem duas vagas simultaneas. A agenda veterinaria possui
-- capacidade unica, inclusive para insercoes do PetBot e chamadas diretas.
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

  if coalesce(new.service_group, 'geral') = 'veterinaria' then
    v_capacity := 1;
  else
    select greatest(2, coalesce(settings.petbot_booking_capacity, 2))
    into v_capacity
    from public.settings settings
    where settings.tenant_id = new.tenant_id
      and settings.module_id = new.module_id
    limit 1;

    v_capacity := coalesce(v_capacity, 2);
  end if;

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

comment on function public.prevent_appointment_overlap() is
  'Capacidade por grupo: duas vagas para banho/tosa e uma vaga para veterinaria.';

commit;
