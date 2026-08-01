begin;

-- Garante o invariante do ciclo: consumo realizado + reservas abertas nunca
-- ultrapassam a quantidade contratada. Corrige especificamente assinaturas
-- antigas em que uma reserva de hoje havia sido contada também como consumo.
do $$
declare
  v_subscription record;
  v_item jsonb;
  v_key text;
  v_limit integer;
  v_used integer;
  v_reserved integer;
  v_usage jsonb;
begin
  for v_subscription in
    select
      subscription.id,
      subscription.tenant_id,
      coalesce(subscription.services_used, '{}'::jsonb) as services_used,
      coalesce(subscription.services_reserved, '{}'::jsonb) as services_reserved,
      coalesce(plan.services, '[]'::jsonb) as plan_services
    from public.client_subscriptions subscription
    join public.subscription_plans plan
      on plan.id = subscription.plan_id
     and plan.tenant_id = subscription.tenant_id
     and plan.module_id = subscription.module_id
    where subscription.module_id = 'petshop'
      and subscription.status = 'active'
      and exists (
        select 1
        from public.appointments appointment
        where appointment.subscription_id = subscription.id
          and appointment.tenant_id = subscription.tenant_id
          and appointment.source = 'package_activation'
          and appointment.subscription_benefit_status = 'reserved'
          and appointment.scheduled_at::date = current_date
      )
    for update of subscription
  loop
    v_usage := v_subscription.services_used;

    for v_item in select * from jsonb_array_elements(v_subscription.plan_services)
    loop
      v_key := coalesce(
        nullif(trim(v_item->>'service_type'), ''),
        nullif(trim(v_item->>'service_code'), '')
      );
      if v_key is null then continue; end if;

      v_limit := greatest(0, coalesce(nullif(v_item->>'qty_per_cycle', '')::integer, 0));
      v_used := greatest(0, coalesce(nullif(v_usage->>v_key, '')::integer, 0));
      v_reserved := greatest(0, coalesce(nullif(v_subscription.services_reserved->>v_key, '')::integer, 0));

      if v_used + v_reserved > v_limit then
        v_usage := jsonb_set(
          v_usage,
          array[v_key],
          to_jsonb(greatest(0, v_limit - v_reserved)),
          true
        );
      end if;
    end loop;

    update public.client_subscriptions
    set services_used = v_usage,
        updated_at = now()
    where id = v_subscription.id
      and tenant_id = v_subscription.tenant_id;
  end loop;
end;
$$;

create or replace function public.create_petshop_package_recurring_appointments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_services jsonb := '[]'::jsonb;
  v_plan_active boolean := false;
  v_motodog_qty integer := 0;
  v_index integer;
  v_scheduled_at timestamptz;
  v_transport_mode text;
  v_transport_label text;
  v_address text;
  v_client_address text;
  v_client_neighborhood text;
  v_client_city text;
  v_client_details jsonb := '{}'::jsonb;
  v_pet_id uuid;
  v_week_services jsonb;
  v_item jsonb;
  v_code text;
  v_consumed_key text;
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

  select
    coalesce(plan.services, '[]'::jsonb),
    coalesce(plan.active, false),
    client.address,
    client.neighborhood,
    client.city,
    coalesce(client.details, '{}'::jsonb)
  into
    v_plan_services,
    v_plan_active,
    v_client_address,
    v_client_neighborhood,
    v_client_city,
    v_client_details
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
    raise exception 'Pacote ou cliente/pet nao encontrado para gerar a agenda recorrente.';
  end if;
  if not v_plan_active then
    raise exception 'O pacote foi desativado antes da criacao das reservas.';
  end if;

  v_pet_id := public.ensure_petshop_pet_from_client(new.client_id);

  select coalesce(max(case
    when coalesce(item->>'qty_per_cycle', '') ~ '^\d+$'
      then (item->>'qty_per_cycle')::integer
    else 0
  end), 0)
  into v_motodog_qty
  from jsonb_array_elements(v_plan_services) item
  where lower(coalesce(item->>'service_type', '')) = 'motodog'
     or lower(coalesce(item->>'service_kind', '')) = 'transport';

  v_address := concat_ws(
    ' - ',
    concat_ws(', ', nullif(trim(v_client_address), ''), nullif(trim(v_client_details->>'address_number'), '')),
    nullif(trim(v_client_details->>'address_complement'), '')
  );

  for v_index in 0..3
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
      'code', coalesce(nullif(item->>'service_code', ''), nullif(item->>'service_type', '')),
      'subscription_id', new.id
    ) order by position), '[]'::jsonb)
    into v_week_services
    from jsonb_array_elements(v_plan_services) with ordinality as plan_item(item, position)
    where lower(coalesce(item->>'service_type', '')) <> 'motodog'
      and lower(coalesce(item->>'service_kind', 'catalog')) <> 'transport'
      and coalesce(nullif(item->>'service_code', ''), nullif(item->>'service_type', '')) is not null
      and case
        when coalesce(item->>'qty_per_cycle', '') ~ '^\d+$'
          then (item->>'qty_per_cycle')::integer
        else 0
      end > v_index;

    if jsonb_array_length(v_week_services) = 0 then
      raise exception 'O pacote nao possui servicos reais para a semana %.', v_index + 1;
    end if;

    v_scheduled_at := new.first_appointment_at + make_interval(days => v_index * 7);
    v_transport_mode := case when v_index < v_motodog_qty then 'buscar_e_levar' else 'cliente_leva' end;
    v_transport_label := case when v_transport_mode = 'buscar_e_levar' then 'MotoDog - buscar e levar' else 'Cliente traz e busca' end;

    -- Legado significa uma data anterior ao dia atual. Qualquer horario de hoje
    -- permanece reservado e so vira consumo ao concluir o atendimento.
    if v_scheduled_at::date < current_date then
      for v_item in select * from jsonb_array_elements(v_week_services)
      loop
        v_code := nullif(trim(v_item->>'code'), '');
        v_consumed_key := public.consume_petshop_subscription_benefit(
          new.id,
          new.tenant_id,
          array[v_code]
        );
        if v_consumed_key is null then
          raise exception 'Nao foi possivel consumir o servico legado % da semana %.', coalesce(v_code, 'nao identificado'), v_index + 1;
        end if;
      end loop;

      if v_transport_mode = 'buscar_e_levar' then
        v_consumed_key := public.consume_petshop_subscription_benefit(
          new.id,
          new.tenant_id,
          array['motodog']
        );
        if v_consumed_key is null then
          raise exception 'Nao foi possivel consumir o MotoDog legado da semana %.', v_index + 1;
        end if;
      end if;
      continue;
    end if;

    v_result := public.book_petshop_appointment_transaction(jsonb_build_object(
      'tenant_id', new.tenant_id,
      'module_id', new.module_id,
      'client_id', new.client_id,
      'pet_id', v_pet_id,
      'services', v_week_services,
      'scheduled_at', v_scheduled_at,
      'status', 'agendado',
      'source', 'package_activation',
      'notes', format('Reserva automatica do pacote - semana %s de 4', v_index + 1),
      'transport_mode', v_transport_mode,
      'transport_label', v_transport_label,
      'transport_address', case when v_transport_mode = 'buscar_e_levar' then nullif(v_address, '') else null end,
      'transport_neighborhood', case when v_transport_mode = 'buscar_e_levar' then nullif(trim(v_client_neighborhood), '') else null end,
      'transport_city', case when v_transport_mode = 'buscar_e_levar' then nullif(trim(v_client_city), '') else null end,
      'transport_reference', case when v_transport_mode = 'buscar_e_levar' then nullif(trim(v_client_details->>'address_reference'), '') else null end,
      'idempotency_key', format('subscription:%s:weekly:%s', new.id, v_index + 1)
    ));

    if nullif(v_result->>'appointment_id', '') is null then
      raise exception 'Nao foi possivel criar a reserva futura % do pacote.', v_index + 1;
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

comment on function public.create_petshop_package_recurring_appointments() is
  'Consome somente datas anteriores a hoje; hoje e datas futuras permanecem reservados ate a conclusao.';

commit;
