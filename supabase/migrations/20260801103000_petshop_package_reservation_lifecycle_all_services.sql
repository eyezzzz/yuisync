begin;

alter table public.client_subscriptions
  add column if not exists services_reserved jsonb not null default '{}'::jsonb;

alter table public.client_subscriptions
  drop constraint if exists client_subscriptions_services_reserved_check;
alter table public.client_subscriptions
  add constraint client_subscriptions_services_reserved_check
  check (jsonb_typeof(services_reserved) = 'object');

comment on column public.client_subscriptions.services_reserved is
  'Beneficios vinculados a agendamentos ainda nao concluidos. Nao contam como consumo realizado.';

create or replace function public.change_petshop_subscription_benefit(
  p_subscription_id uuid,
  p_tenant_id uuid,
  p_candidates text[],
  p_action text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription record;
  v_candidate text;
  v_candidate_key text;
  v_plan_service jsonb;
  v_usage_key text;
  v_limit integer;
  v_used integer;
  v_reserved integer;
  v_action text := lower(nullif(trim(p_action), ''));
begin
  if p_subscription_id is null or p_tenant_id is null then return null; end if;
  if v_action not in ('reserve', 'consume', 'release') then
    raise exception 'Acao de beneficio invalida: %.', p_action;
  end if;

  select
    subscription.id,
    coalesce(subscription.services_used, '{}'::jsonb) as services_used,
    coalesce(subscription.services_reserved, '{}'::jsonb) as services_reserved,
    coalesce(plan.services, '[]'::jsonb) as plan_services
  into v_subscription
  from public.client_subscriptions subscription
  join public.subscription_plans plan
    on plan.id = subscription.plan_id
   and plan.tenant_id = subscription.tenant_id
   and plan.module_id = subscription.module_id
  where subscription.id = p_subscription_id
    and subscription.tenant_id = p_tenant_id
    and subscription.status = 'active'
    and plan.active = true
  for update of subscription;

  if not found then return null; end if;

  foreach v_candidate in array coalesce(p_candidates, array[]::text[])
  loop
    v_candidate := nullif(trim(v_candidate), '');
    if v_candidate is null then continue; end if;
    v_candidate_key := public.petshop_plan_service_key(v_candidate, v_candidate, null);
    v_plan_service := null;

    select value
    into v_plan_service
    from jsonb_array_elements(v_subscription.plan_services)
    where lower(trim(coalesce(value->>'service_type', ''))) = lower(v_candidate)
       or lower(trim(coalesce(value->>'service_code', ''))) = lower(v_candidate)
       or public.petshop_plan_service_key(
            coalesce(value->>'service_name', value->>'label'),
            coalesce(value->>'service_code', value->>'service_type'),
            value->>'group_type'
          ) = v_candidate_key
    order by case
      when lower(trim(coalesce(value->>'service_type', ''))) = lower(v_candidate) then 0
      when lower(trim(coalesce(value->>'service_code', ''))) = lower(v_candidate) then 1
      else 2
    end
    limit 1;

    if v_plan_service is null then continue; end if;

    v_usage_key := coalesce(
      nullif(trim(v_plan_service->>'service_type'), ''),
      nullif(trim(v_plan_service->>'service_code'), '')
    );
    if v_usage_key is null then continue; end if;

    v_limit := greatest(0, coalesce(nullif(v_plan_service->>'qty_per_cycle', '')::integer, 0));
    v_used := greatest(0, coalesce(nullif(v_subscription.services_used->>v_usage_key, '')::integer, 0));
    v_reserved := greatest(0, coalesce(nullif(v_subscription.services_reserved->>v_usage_key, '')::integer, 0));

    if v_action = 'reserve' then
      if v_used + v_reserved >= v_limit then continue; end if;
      v_reserved := v_reserved + 1;
    elsif v_action = 'consume' then
      if v_used >= v_limit then continue; end if;
      v_used := v_used + 1;
      if v_reserved > 0 then v_reserved := v_reserved - 1; end if;
    else
      if v_reserved <= 0 then continue; end if;
      v_reserved := v_reserved - 1;
    end if;

    v_subscription.services_used := jsonb_set(
      v_subscription.services_used,
      array[v_usage_key],
      to_jsonb(v_used),
      true
    );
    v_subscription.services_reserved := jsonb_set(
      v_subscription.services_reserved,
      array[v_usage_key],
      to_jsonb(v_reserved),
      true
    );

    update public.client_subscriptions
    set services_used = v_subscription.services_used,
        services_reserved = v_subscription.services_reserved,
        updated_at = now()
    where id = v_subscription.id
      and tenant_id = p_tenant_id;

    return v_usage_key;
  end loop;

  return null;
end;
$$;

create or replace function public.reserve_petshop_subscription_benefit(
  p_subscription_id uuid,
  p_tenant_id uuid,
  p_candidates text[]
)
returns text
language sql
security definer
set search_path = public
as $$
  select public.change_petshop_subscription_benefit(
    p_subscription_id,
    p_tenant_id,
    p_candidates,
    'reserve'
  );
$$;

create or replace function public.consume_petshop_subscription_benefit(
  p_subscription_id uuid,
  p_tenant_id uuid,
  p_candidates text[]
)
returns text
language sql
security definer
set search_path = public
as $$
  select public.change_petshop_subscription_benefit(
    p_subscription_id,
    p_tenant_id,
    p_candidates,
    'consume'
  );
$$;

create or replace function public.release_petshop_subscription_benefit(
  p_subscription_id uuid,
  p_tenant_id uuid,
  p_benefit_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.change_petshop_subscription_benefit(
    p_subscription_id,
    p_tenant_id,
    array[p_benefit_key],
    'release'
  );
end;
$$;

revoke all on function public.change_petshop_subscription_benefit(uuid, uuid, text[], text) from public;
revoke all on function public.reserve_petshop_subscription_benefit(uuid, uuid, text[]) from public;
revoke all on function public.consume_petshop_subscription_benefit(uuid, uuid, text[]) from public;
revoke all on function public.release_petshop_subscription_benefit(uuid, uuid, text) from public;
grant execute on function public.consume_petshop_subscription_benefit(uuid, uuid, text[])
  to authenticated, service_role;

create or replace function public.find_petshop_client_subscription_for_benefit(
  p_tenant_id uuid,
  p_module_id text,
  p_client_id uuid,
  p_candidates text[]
)
returns table (
  subscription_id uuid,
  plan_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select subscription.id, plan.name
  from public.client_subscriptions subscription
  join public.subscription_plans plan
    on plan.id = subscription.plan_id
   and plan.tenant_id = subscription.tenant_id
   and plan.module_id = subscription.module_id
  where subscription.tenant_id = p_tenant_id
    and subscription.module_id = p_module_id
    and subscription.client_id = p_client_id
    and subscription.status = 'active'
    and plan.active = true
    and exists (
      select 1
      from jsonb_array_elements(coalesce(plan.services, '[]'::jsonb)) plan_service
      cross join lateral (
        select coalesce(
          nullif(trim(plan_service->>'service_type'), ''),
          nullif(trim(plan_service->>'service_code'), '')
        ) as usage_key
      ) resolved
      where resolved.usage_key is not null
        and greatest(0, coalesce(nullif(plan_service->>'qty_per_cycle', '')::integer, 0))
          > greatest(0, coalesce(nullif(coalesce(subscription.services_used, '{}'::jsonb)->>resolved.usage_key, '')::integer, 0))
          + greatest(0, coalesce(nullif(coalesce(subscription.services_reserved, '{}'::jsonb)->>resolved.usage_key, '')::integer, 0))
        and exists (
          select 1
          from unnest(coalesce(p_candidates, array[]::text[])) candidate
          where nullif(trim(candidate), '') is not null
            and (
              lower(trim(coalesce(plan_service->>'service_type', ''))) = lower(trim(candidate))
              or lower(trim(coalesce(plan_service->>'service_code', ''))) = lower(trim(candidate))
              or public.petshop_plan_service_key(
                coalesce(plan_service->>'service_name', plan_service->>'label'),
                coalesce(plan_service->>'service_code', plan_service->>'service_type'),
                plan_service->>'group_type'
              ) = public.petshop_plan_service_key(candidate, candidate, null)
            )
        )
    )
  order by
    subscription.next_billing_date asc nulls last,
    subscription.started_at asc nulls last,
    subscription.created_at asc;
$$;

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
  v_benefits jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_discount numeric := 0;
  v_duration integer := 0;
  v_subscription_id uuid;
  v_preferred_subscription_id uuid;
  v_plan_name text;
  v_subscription_result jsonb;
  v_generic_key text;
  v_benefit_key text;
  v_benefit boolean;
  v_any_benefit boolean := false;
begin
  if jsonb_typeof(v_requested) <> 'array' then
    raise exception 'Lista de servicos invalida.';
  end if;
  if jsonb_array_length(v_requested) = 0 and nullif(trim(p_fallback_service_type), '') is not null then
    v_requested := jsonb_build_array(jsonb_build_object('code', trim(p_fallback_service_type)));
  end if;
  if jsonb_array_length(v_requested) = 0 then
    raise exception 'Selecione pelo menos um servico.';
  end if;
  if jsonb_array_length(v_requested) > 10 then
    raise exception 'Limite de 10 servicos por agendamento.';
  end if;

  v_preferred_subscription_id := nullif(v_requested->0->>'subscription_id', '')::uuid;
  if v_preferred_subscription_id is not null then
    select subscription.id, plan.name
    into v_subscription_id, v_plan_name
    from public.client_subscriptions subscription
    join public.subscription_plans plan
      on plan.id = subscription.plan_id
     and plan.tenant_id = subscription.tenant_id
     and plan.module_id = subscription.module_id
    where subscription.id = v_preferred_subscription_id
      and subscription.tenant_id = p_tenant_id
      and subscription.module_id = p_module_id
      and subscription.client_id = p_client_id
      and subscription.status = 'active'
      and plan.active = true
    limit 1;

    if not found then
      raise exception 'O pacote indicado nao pertence ao pet ou nao esta ativo.';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(v_requested)
  loop
    v_code := nullif(trim(coalesce(v_item->>'code', v_item->>'service_type')), '');
    if v_code is null then raise exception 'Codigo de servico invalido.'; end if;
    if exists (
      select 1 from jsonb_array_elements(v_items) existing
      where existing->>'code' = v_code
    ) then
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

    v_service_group := public.classify_petshop_appointment_service_group(
      v_service.name,
      v_service.code,
      v_service.group_type
    );
    if v_service_group not in ('banho_tosa', 'veterinaria') then
      raise exception 'Servico % nao esta classificado para a agenda.', v_service.name;
    end if;
    if v_group is null then v_group := v_service_group; end if;
    if v_group <> v_service_group then
      raise exception 'Servicos de banho/tosa e veterinaria devem ser agendados separadamente.';
    end if;

    v_generic_key := public.petshop_plan_service_key(
      v_service.name,
      v_service.code,
      v_service_group
    );
    v_benefit_key := null;

    if v_subscription_id is null then
      v_subscription_result := public.reserve_petshop_client_subscription_benefit(
        p_tenant_id,
        p_module_id,
        p_client_id,
        array[v_service.code, v_generic_key]
      );
      v_benefit_key := nullif(v_subscription_result->>'benefit_key', '');
      if v_benefit_key is not null then
        v_subscription_id := nullif(v_subscription_result->>'subscription_id', '')::uuid;
        v_plan_name := nullif(v_subscription_result->>'plan_name', '');
      end if;
    else
      v_benefit_key := public.reserve_petshop_subscription_benefit(
        v_subscription_id,
        p_tenant_id,
        array[v_service.code, v_generic_key]
      );
    end if;

    v_benefit := v_benefit_key is not null;
    if v_benefit then
      v_any_benefit := true;
      v_discount := v_discount + greatest(0, coalesce(v_service.default_price, 0));
      v_benefits := v_benefits || jsonb_build_array(jsonb_build_object(
        'kind', 'service',
        'key', v_benefit_key,
        'service_code', v_service.code,
        'label', v_service.name,
        'catalog_price', greatest(0, coalesce(v_service.default_price, 0)),
        'status', 'reserved',
        'accounting', 'reserved_ledger'
      ));
    end if;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', v_service.code,
      'name', v_service.name,
      'group_type', v_service_group,
      'unit_price', case when v_benefit then 0 else greatest(0, coalesce(v_service.default_price, 0)) end,
      'catalog_price', greatest(0, coalesce(v_service.default_price, 0)),
      'duration_min', greatest(15, coalesce(v_service.default_duration_min, 60)),
      'benefit_used', v_benefit,
      'benefit_key', v_benefit_key,
      'benefit_status', case when v_benefit then 'reserved' else null end
    ));

    v_total := v_total + case when v_benefit then 0 else greatest(0, coalesce(v_service.default_price, 0)) end;
    v_duration := v_duration + greatest(15, coalesce(v_service.default_duration_min, 60));
  end loop;

  if jsonb_array_length(v_items) = 0 then raise exception 'Nenhum servico valido selecionado.'; end if;

  return jsonb_build_object(
    'items', v_items,
    'benefits', v_benefits,
    'service_type', v_items->0->>'code',
    'service_group', v_group,
    'price', round(v_total, 2),
    'discount', round(v_discount, 2),
    'duration_min', greatest(15, v_duration),
    'active_subscription_id', v_subscription_id,
    'subscription_id', case when v_any_benefit then v_subscription_id else null end,
    'subscription_label', case when v_any_benefit then v_plan_name else null end,
    'benefit_used', v_any_benefit
  );
end;
$$;

create or replace function public.transition_petshop_appointment_plan_benefits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_key text;
  v_consumed_key text;
begin
  if new.module_id <> 'petshop' or new.status is not distinct from old.status then
    return new;
  end if;

  if old.subscription_benefit_status = 'released'
    and old.status in ('cancelado', 'no_show')
    and new.status not in ('cancelado', 'no_show')
  then
    raise exception 'Reabra este atendimento pelo editor para recalcular o pacote.';
  end if;

  if coalesce(new.subscription_benefit_status, old.subscription_benefit_status) <> 'reserved' then
    return new;
  end if;

  if new.status in ('concluido', 'completed', 'finalizado') then
    for v_item in
      select * from jsonb_array_elements(coalesce(new.subscription_benefits, old.subscription_benefits, '[]'::jsonb))
    loop
      if coalesce(v_item->>'status', 'reserved') <> 'reserved' then continue; end if;
      v_key := nullif(trim(coalesce(v_item->>'key', v_item->>'benefit_key')), '');
      v_consumed_key := public.consume_petshop_subscription_benefit(
        coalesce(new.subscription_id, old.subscription_id),
        new.tenant_id,
        array[v_key]
      );
      if v_consumed_key is null then
        raise exception 'Nao foi possivel consumir o beneficio reservado %.', coalesce(v_key, 'nao identificado');
      end if;
    end loop;

    new.subscription_benefits := public.mark_petshop_subscription_benefits(
      coalesce(new.subscription_benefits, old.subscription_benefits),
      'consumed'
    );
    new.subscription_benefit_status := 'consumed';
    return new;
  end if;

  if new.status in ('cancelado', 'no_show') then
    for v_item in
      select * from jsonb_array_elements(coalesce(new.subscription_benefits, old.subscription_benefits, '[]'::jsonb))
    loop
      if coalesce(v_item->>'status', 'reserved') = 'reserved' then
        perform public.release_petshop_subscription_benefit(
          coalesce(new.subscription_id, old.subscription_id),
          new.tenant_id,
          coalesce(v_item->>'key', v_item->>'benefit_key')
        );
      end if;
    end loop;

    new.subscription_benefits := public.mark_petshop_subscription_benefits(
      coalesce(new.subscription_benefits, old.subscription_benefits),
      'released'
    );
    new.subscription_benefit_status := 'released';
  end if;

  return new;
end;
$$;

create or replace function public.consume_inserted_petshop_appointment_benefits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_key text;
  v_consumed_key text;
begin
  if new.module_id <> 'petshop'
    or new.status not in ('concluido', 'completed', 'finalizado')
    or new.subscription_benefit_status <> 'consumed'
    or new.subscription_id is null
  then
    return new;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(new.subscription_benefits, '[]'::jsonb))
  loop
    v_key := nullif(trim(coalesce(v_item->>'key', v_item->>'benefit_key')), '');
    v_consumed_key := public.consume_petshop_subscription_benefit(
      new.subscription_id,
      new.tenant_id,
      array[v_key]
    );
    if v_consumed_key is null then
      raise exception 'Nao foi possivel consumir o beneficio do atendimento concluido.';
    end if;
  end loop;

  new.subscription_benefits := public.mark_petshop_subscription_benefits(
    new.subscription_benefits,
    'consumed'
  );
  return new;
end;
$$;

drop trigger if exists b0_consume_inserted_petshop_appointment_benefits on public.appointments;
create trigger b0_consume_inserted_petshop_appointment_benefits
before insert on public.appointments
for each row execute function public.consume_inserted_petshop_appointment_benefits();

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

    if v_scheduled_at < now() then
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
  'Consome apenas datas legadas e reserva todos os servicos aplicaveis das semanas futuras.';

create or replace function public.repair_petshop_package_recurring_appointment(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_week integer;
  v_services jsonb;
  v_resolved jsonb;
  v_transport_fee numeric;
begin
  select * into v_appointment
  from public.appointments
  where id = p_appointment_id
    and module_id = 'petshop'
    and source = 'package_activation'
    and subscription_id is not null
    and status not in ('concluido', 'completed', 'finalizado', 'cancelado', 'no_show')
  for update;

  if not found then return; end if;

  v_week := nullif(substring(v_appointment.idempotency_key from 'weekly:([0-9]+)$'), '')::integer;
  if v_week is null or v_week not between 1 and 4 then return; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code', coalesce(nullif(item->>'service_code', ''), nullif(item->>'service_type', '')),
    'subscription_id', subscription.id
  ) order by position), '[]'::jsonb)
  into v_services
  from public.client_subscriptions subscription
  join public.subscription_plans plan
    on plan.id = subscription.plan_id
   and plan.tenant_id = subscription.tenant_id
   and plan.module_id = subscription.module_id
  cross join lateral jsonb_array_elements(coalesce(plan.services, '[]'::jsonb)) with ordinality as plan_item(item, position)
  where subscription.id = v_appointment.subscription_id
    and subscription.tenant_id = v_appointment.tenant_id
    and lower(coalesce(item->>'service_type', '')) <> 'motodog'
    and lower(coalesce(item->>'service_kind', 'catalog')) <> 'transport'
    and coalesce(nullif(item->>'service_code', ''), nullif(item->>'service_type', '')) is not null
    and case
      when coalesce(item->>'qty_per_cycle', '') ~ '^\d+$'
        then (item->>'qty_per_cycle')::integer
      else 0
    end >= v_week;

  if jsonb_array_length(v_services) = 0 then return; end if;

  perform public.restore_petshop_appointment_benefits(v_appointment.id);
  v_resolved := public.resolve_petshop_appointment_services(
    v_appointment.tenant_id,
    v_appointment.module_id,
    v_appointment.client_id,
    v_services,
    null
  );
  v_transport_fee := public.resolve_petshop_transport_fee(
    v_appointment.tenant_id,
    v_appointment.module_id,
    coalesce(v_appointment.transport_mode, 'cliente_leva')
  );

  update public.appointments
  set service_type = v_resolved->>'service_type',
      service_group = v_resolved->>'service_group',
      service_items = v_resolved->'items',
      duration_min = greatest(10, coalesce((v_resolved->>'duration_min')::integer, duration_min, 60)),
      price = round(greatest(0, coalesce((v_resolved->>'price')::numeric, 0) + v_transport_fee), 2),
      subscription_id = nullif(v_resolved->>'subscription_id', '')::uuid,
      subscription_benefit_used = coalesce((v_resolved->>'benefit_used')::boolean, false),
      updated_at = now()
  where id = v_appointment.id;
end;
$$;

revoke all on function public.repair_petshop_package_recurring_appointment(uuid) from public;

-- Migra as reservas antigas, que estavam somadas indevidamente em services_used,
-- para o novo ledger de reservas. O marcador torna o backfill idempotente.
do $$
declare
  v_subscription record;
  v_benefit record;
  v_used jsonb;
  v_reserved jsonb;
  v_used_count integer;
  v_reserved_count integer;
begin
  for v_subscription in
    select distinct appointment.subscription_id, appointment.tenant_id
    from public.appointments appointment
    where appointment.module_id = 'petshop'
      and appointment.subscription_id is not null
      and appointment.subscription_benefit_status = 'reserved'
  loop
    select
      coalesce(subscription.services_used, '{}'::jsonb),
      coalesce(subscription.services_reserved, '{}'::jsonb)
    into v_used, v_reserved
    from public.client_subscriptions subscription
    where subscription.id = v_subscription.subscription_id
      and subscription.tenant_id = v_subscription.tenant_id
    for update;

    if not found then continue; end if;

    for v_benefit in
      select
        coalesce(nullif(benefit->>'key', ''), nullif(benefit->>'benefit_key', '')) as benefit_key,
        count(*)::integer as benefit_count
      from public.appointments appointment
      cross join lateral jsonb_array_elements(coalesce(appointment.subscription_benefits, '[]'::jsonb)) benefit
      where appointment.subscription_id = v_subscription.subscription_id
        and appointment.tenant_id = v_subscription.tenant_id
        and appointment.subscription_benefit_status = 'reserved'
        and coalesce(benefit->>'status', 'reserved') = 'reserved'
        and coalesce(benefit->>'accounting', '') <> 'reserved_ledger'
      group by coalesce(nullif(benefit->>'key', ''), nullif(benefit->>'benefit_key', ''))
    loop
      if v_benefit.benefit_key is null then continue; end if;
      v_used_count := greatest(0, coalesce(nullif(v_used->>v_benefit.benefit_key, '')::integer, 0) - v_benefit.benefit_count);
      v_reserved_count := greatest(0, coalesce(nullif(v_reserved->>v_benefit.benefit_key, '')::integer, 0)) + v_benefit.benefit_count;
      v_used := jsonb_set(v_used, array[v_benefit.benefit_key], to_jsonb(v_used_count), true);
      v_reserved := jsonb_set(v_reserved, array[v_benefit.benefit_key], to_jsonb(v_reserved_count), true);
    end loop;

    update public.client_subscriptions
    set services_used = v_used,
        services_reserved = v_reserved,
        updated_at = now()
    where id = v_subscription.subscription_id
      and tenant_id = v_subscription.tenant_id;
  end loop;

  update public.appointments appointment
  set subscription_benefits = (
    select coalesce(jsonb_agg(benefit || jsonb_build_object('accounting', 'reserved_ledger')), '[]'::jsonb)
    from jsonb_array_elements(coalesce(appointment.subscription_benefits, '[]'::jsonb)) benefit
  ),
  updated_at = now()
  where appointment.module_id = 'petshop'
    and appointment.subscription_benefit_status = 'reserved'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(appointment.subscription_benefits, '[]'::jsonb)) benefit
      where coalesce(benefit->>'accounting', '') <> 'reserved_ledger'
    );
end;
$$;

-- Garante que todas as datas legadas ja vencidas estejam consumidas para cada
-- item do pacote, sem duplicar o servico principal que a versao anterior gravou.
do $$
declare
  v_subscription record;
  v_item jsonb;
  v_usage_key text;
  v_limit integer;
  v_due integer;
  v_used integer;
  v_usage jsonb;
begin
  for v_subscription in
    select subscription.*, coalesce(plan.services, '[]'::jsonb) as plan_services
    from public.client_subscriptions subscription
    join public.subscription_plans plan
      on plan.id = subscription.plan_id
     and plan.tenant_id = subscription.tenant_id
     and plan.module_id = subscription.module_id
    where subscription.module_id = 'petshop'
      and subscription.status = 'active'
      and subscription.first_appointment_at is not null
      and subscription.recurring_appointments_created_at is not null
  loop
    v_usage := coalesce(v_subscription.services_used, '{}'::jsonb);

    for v_item in select * from jsonb_array_elements(v_subscription.plan_services)
    loop
      v_usage_key := coalesce(
        nullif(trim(v_item->>'service_type'), ''),
        nullif(trim(v_item->>'service_code'), '')
      );
      if v_usage_key is null then continue; end if;

      v_limit := greatest(0, coalesce(nullif(v_item->>'qty_per_cycle', '')::integer, 0));
      select count(*)::integer
      into v_due
      from generate_series(0, 3) week_index
      where week_index < v_limit
        and v_subscription.first_appointment_at + make_interval(days => week_index * 7) < now();

      v_used := greatest(
        greatest(0, coalesce(nullif(v_usage->>v_usage_key, '')::integer, 0)),
        v_due
      );
      v_usage := jsonb_set(v_usage, array[v_usage_key], to_jsonb(v_used), true);
    end loop;

    update public.client_subscriptions
    set services_used = v_usage,
        updated_at = now()
    where id = v_subscription.id
      and tenant_id = v_subscription.tenant_id;
  end loop;
end;
$$;

-- Completa os agendamentos futuros ja criados pela versao anterior, incluindo
-- todos os servicos aplicaveis daquela semana e reconstruindo suas reservas.
do $$
declare
  v_appointment record;
begin
  for v_appointment in
    select appointment.id
    from public.appointments appointment
    where appointment.module_id = 'petshop'
      and appointment.source = 'package_activation'
      and appointment.subscription_id is not null
      and appointment.subscription_benefit_status = 'reserved'
      and appointment.status not in ('concluido', 'completed', 'finalizado', 'cancelado', 'no_show')
  loop
    perform public.repair_petshop_package_recurring_appointment(v_appointment.id);
  end loop;
end;
$$;

commit;
