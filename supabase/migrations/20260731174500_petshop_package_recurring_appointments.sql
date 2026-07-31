begin;

alter table public.client_subscriptions
  add column if not exists first_appointment_at timestamptz,
  add column if not exists recurring_appointments_created_at timestamptz;

comment on column public.client_subscriptions.first_appointment_at is
  'Primeira data e horario escolhidos para a sequencia semanal automatica do pacote.';

comment on column public.client_subscriptions.recurring_appointments_created_at is
  'Momento em que as quatro reservas semanais do pacote foram criadas de forma transacional.';

create or replace function public.create_petshop_package_recurring_appointments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_services jsonb := '[]'::jsonb;
  v_plan_active boolean := false;
  v_service jsonb;
  v_service_code text;
  v_motodog_qty integer := 0;
  v_index integer;
  v_scheduled_at timestamptz;
  v_transport_mode text;
  v_transport_label text;
  v_address text;
  v_client record;
  v_result jsonb;
begin
  if new.module_id <> 'petshop'
    or new.status <> 'active'
    or old.status = 'active'
    or new.first_appointment_at is null
    or new.recurring_appointments_created_at is not null
  then
    return new;
  end if;

  if new.first_appointment_at < now() - interval '5 minutes' then
    raise exception 'O primeiro agendamento do pacote precisa estar no presente ou no futuro.';
  end if;

  select
    coalesce(plan.services, '[]'::jsonb),
    coalesce(plan.active, false),
    client.address,
    client.neighborhood,
    client.city,
    coalesce(client.details, '{}'::jsonb) as details
  into
    v_plan_services,
    v_plan_active,
    v_client.address,
    v_client.neighborhood,
    v_client.city,
    v_client.details
  from public.subscription_plans plan
  join public.clients client
    on client.id = new.client_id
   and client.tenant_id = new.tenant_id
   and client.module_id = new.module_id
  where plan.id = new.plan_id
    and plan.tenant_id = new.tenant_id
    and plan.module_id = new.module_id
  limit 1;

  if not found then
    raise exception 'Pacote ou cliente nao encontrado para gerar a agenda recorrente.';
  end if;

  if not v_plan_active then
    raise exception 'O pacote foi desativado antes da criacao das reservas.';
  end if;

  select item.value
  into v_service
  from jsonb_array_elements(v_plan_services) with ordinality as item(value, position)
  where lower(coalesce(item.value->>'service_type', '')) <> 'motodog'
    and case
      when coalesce(item.value->>'qty_per_cycle', '') ~ '^\d+$'
        then (item.value->>'qty_per_cycle')::integer
      else 0
    end >= 4
  order by item.position
  limit 1;

  if v_service is null then
    raise exception 'O pacote precisa incluir pelo menos quatro unidades de um servico para criar as quatro reservas semanais.';
  end if;

  v_service_code := nullif(trim(coalesce(v_service->>'service_code', v_service->>'service_type')), '');
  if v_service_code is null or not exists (
    select 1
    from public.petshop_services service
    where service.tenant_id = new.tenant_id
      and service.module_id = new.module_id
      and service.code = v_service_code
      and service.active = true
  ) then
    raise exception 'O servico principal do pacote nao esta disponivel no catalogo da agenda.';
  end if;

  select coalesce(max(case
    when coalesce(item->>'qty_per_cycle', '') ~ '^\d+$'
      then (item->>'qty_per_cycle')::integer
    else 0
  end), 0)
  into v_motodog_qty
  from jsonb_array_elements(v_plan_services) item
  where lower(coalesce(item->>'service_type', '')) = 'motodog';

  v_address := concat_ws(
    ' - ',
    concat_ws(', ', nullif(trim(v_client.address), ''), nullif(trim(v_client.details->>'address_number'), '')),
    nullif(trim(v_client.details->>'address_complement'), '')
  );

  for v_index in 0..3
  loop
    v_scheduled_at := new.first_appointment_at + make_interval(days => v_index * 7);
    v_transport_mode := case when v_index < v_motodog_qty then 'buscar_e_levar' else 'cliente_leva' end;
    v_transport_label := case when v_transport_mode = 'buscar_e_levar' then 'MotoDog - buscar e levar' else 'Cliente traz e busca' end;

    v_result := public.book_petshop_appointment_transaction(jsonb_build_object(
      'tenant_id', new.tenant_id,
      'module_id', new.module_id,
      'client_id', new.client_id,
      'pet_id', new.client_id,
      'services', jsonb_build_array(jsonb_build_object('code', v_service_code)),
      'scheduled_at', v_scheduled_at,
      'status', 'agendado',
      'source', 'package_activation',
      'notes', format('Reserva automatica do pacote - semana %s de 4', v_index + 1),
      'transport_mode', v_transport_mode,
      'transport_label', v_transport_label,
      'transport_address', case when v_transport_mode = 'buscar_e_levar' then nullif(v_address, '') else null end,
      'transport_neighborhood', case when v_transport_mode = 'buscar_e_levar' then nullif(trim(v_client.neighborhood), '') else null end,
      'transport_city', case when v_transport_mode = 'buscar_e_levar' then nullif(trim(v_client.city), '') else null end,
      'transport_reference', case when v_transport_mode = 'buscar_e_levar' then nullif(trim(v_client.details->>'address_reference'), '') else null end,
      'idempotency_key', format('subscription:%s:weekly:%s', new.id, v_index + 1)
    ));

    if nullif(v_result->>'appointment_id', '') is null then
      raise exception 'Nao foi possivel criar a reserva semanal % do pacote.', v_index + 1;
    end if;
  end loop;

  update public.client_subscriptions
  set recurring_appointments_created_at = now(),
      updated_at = now()
  where id = new.id
    and tenant_id = new.tenant_id
    and module_id = new.module_id;

  return new;
end;
$$;

revoke all on function public.create_petshop_package_recurring_appointments() from public;
grant execute on function public.create_petshop_package_recurring_appointments() to authenticated, service_role;

drop trigger if exists create_petshop_package_recurring_appointments on public.client_subscriptions;
create trigger create_petshop_package_recurring_appointments
after update of status on public.client_subscriptions
for each row execute function public.create_petshop_package_recurring_appointments();

commit;
