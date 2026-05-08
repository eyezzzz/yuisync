-- =============================================================================
-- YuiSync Core - Status Hotfix (appointments + booking RPC)
-- =============================================================================
-- Execute este SQL antes do seed, para compatibilizar qualquer check constraint
-- existente na coluna appointments.status.
-- =============================================================================

begin;

alter table public.companies add column if not exists schedule_free_status text not null default 'available';
alter table public.companies add column if not exists schedule_booked_status text not null default 'booked';

do $$
declare
  v_status_constraint text;
  v_status_value text;
  v_allowed_statuses text[] := '{}';
  v_free_status text;
  v_booked_status text;
begin
  select pg_get_constraintdef(c.oid)
  into v_status_constraint
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'appointments'
    and c.contype = 'c'
    and (
      c.conname = 'appointments_status_check'
      or pg_get_constraintdef(c.oid) ilike '%status%'
    )
  order by case when c.conname = 'appointments_status_check' then 0 else 1 end, c.oid
  limit 1;

  if v_status_constraint is not null then
    for v_status_value in
      select lower((regexp_matches(v_status_constraint, '''([^'']+)''', 'g'))[1])
    loop
      if v_status_value is null or v_status_value = '' then
        continue;
      end if;
      if not (v_status_value = any(v_allowed_statuses)) then
        v_allowed_statuses := array_append(v_allowed_statuses, v_status_value);
      end if;
    end loop;
  end if;

  v_booked_status := null;
  foreach v_status_value in array array[
    'booked', 'agendado', 'reservado', 'confirmado', 'ocupado', 'blocked', 'bloqueado', 'concluido'
  ]
  loop
    if coalesce(array_length(v_allowed_statuses, 1), 0) = 0 or v_status_value = any(v_allowed_statuses) then
      v_booked_status := v_status_value;
      exit;
    end if;
  end loop;

  v_free_status := null;
  foreach v_status_value in array array[
    'available', 'livre', 'disponivel', 'aberto', 'open', 'aguardando', 'pendente', 'cancelado'
  ]
  loop
    if (
      coalesce(array_length(v_allowed_statuses, 1), 0) = 0
      or v_status_value = any(v_allowed_statuses)
    ) and v_status_value <> coalesce(v_booked_status, '') then
      v_free_status := v_status_value;
      exit;
    end if;
  end loop;

  if v_booked_status is null and coalesce(array_length(v_allowed_statuses, 1), 0) > 0 then
    v_booked_status := v_allowed_statuses[1];
  end if;

  if v_free_status is null and coalesce(array_length(v_allowed_statuses, 1), 0) > 0 then
    select s into v_free_status
    from unnest(v_allowed_statuses) as s
    where s <> v_booked_status
    limit 1;
  end if;

  v_free_status := coalesce(v_free_status, 'available');
  v_booked_status := coalesce(
    v_booked_status,
    case when v_free_status = 'booked' then 'agendado' else 'booked' end
  );

  update public.companies
  set
    schedule_free_status = v_free_status,
    schedule_booked_status = v_booked_status
  where id = '00000000-0000-0000-0000-000000000002';
end $$;

create or replace function public.book_appointment(
  p_slot_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_company_id uuid,
  p_conversation_id uuid,
  p_service_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.appointments%rowtype;
  v_free_status text;
  v_booked_status text;
begin
  select
    nullif(lower(trim(coalesce(c.schedule_free_status, ''))), ''),
    nullif(lower(trim(coalesce(c.schedule_booked_status, ''))), '')
  into v_free_status, v_booked_status
  from public.companies c
  where c.id = p_company_id;

  v_free_status := coalesce(v_free_status, 'available');
  v_booked_status := coalesce(
    v_booked_status,
    case when v_free_status = 'booked' then 'agendado' else 'booked' end
  );

  select *
  into v_slot
  from public.appointments
  where id = p_slot_id
    and company_id = p_company_id
  for update skip locked;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'slot_taken');
  end if;

  if lower(coalesce(v_slot.status::text, '')) <> v_free_status then
    return jsonb_build_object('success', false, 'reason', 'slot_taken');
  end if;

  update public.appointments
  set
    status = v_booked_status,
    conversation_id = coalesce(p_conversation_id, conversation_id),
    service_type = coalesce(nullif(trim(p_service_type), ''), service_type, 'agendamento'),
    customer_name = coalesce(nullif(trim(p_customer_name), ''), customer_name, 'Cliente'),
    customer_phone = coalesce(nullif(trim(p_customer_phone), ''), customer_phone),
    description = coalesce(description, 'Agendamento confirmado via YuiSync'),
    updated_at = now()
  where id = v_slot.id
  returning * into v_slot;

  return jsonb_build_object(
    'success', true,
    'reason', null,
    'appointment_id', v_slot.id,
    'service_date', v_slot.service_date,
    'start_time', v_slot.start_time,
    'status', v_slot.status
  );
end;
$$;

grant execute on function public.book_appointment(uuid, text, text, uuid, uuid, text)
to authenticated, service_role;

do $$
declare
  v_tenant uuid;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'system_update_logs'
  ) then
    select t.id
    into v_tenant
    from public.tenants t
    where t.active = true
    order by t.created_at asc
    limit 1;

    insert into public.system_update_logs (
      tenant_id,
      module_id,
      category,
      status,
      source,
      title,
      description,
      fingerprint,
      created_at
    )
    values (
      v_tenant,
      'system',
      'infra',
      'success',
      'changelog',
      'Hotfix de status do motor Yui aplicado',
      'book_appointment e mapeamento de status da agenda foram adaptados ao appointments_status_check real.',
      'milestone-yui-core-status-hotfix-20260403',
      now()
    )
    on conflict (fingerprint) do nothing;
  end if;
end $$;

commit;
