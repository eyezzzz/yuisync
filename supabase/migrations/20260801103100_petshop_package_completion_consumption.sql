begin;

create or replace function public.reconcile_petshop_completed_appointment_package(p_appointment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_subscription_id uuid;
  v_plan_name text;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_benefits jsonb := '[]'::jsonb;
  v_new_benefits jsonb := '[]'::jsonb;
  v_service_code text;
  v_service_name text;
  v_group text;
  v_benefit_key text;
  v_catalog_unit numeric;
  v_net_unit numeric;
  v_catalog_transport numeric := 0;
  v_catalog_total numeric := 0;
  v_net_total numeric := 0;
  v_any_benefit boolean := false;
  v_covered boolean := false;
  v_transport_covered boolean := false;
  v_changed boolean := false;
begin
  if auth.uid() is null then raise exception 'Sessao autenticada obrigatoria.'; end if;

  select * into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then raise exception 'Agendamento nao encontrado.'; end if;
  if v_appointment.module_id <> 'petshop' or not public.has_tenant_access(v_appointment.tenant_id) then
    raise exception 'Agendamento nao pertence ao tenant ativo.';
  end if;
  if lower(coalesce(v_appointment.status, '')) not in ('concluido', 'completed', 'finalizado') then
    return jsonb_build_object('changed', false, 'appointment', to_jsonb(v_appointment));
  end if;
  if exists (
    select 1 from public.sales sale
    where sale.tenant_id = v_appointment.tenant_id
      and sale.appointment_id = v_appointment.id
  ) then
    return jsonb_build_object('changed', false, 'appointment', to_jsonb(v_appointment));
  end if;

  select subscription.id, plan.name
  into v_subscription_id, v_plan_name
  from public.client_subscriptions subscription
  join public.subscription_plans plan
    on plan.id = subscription.plan_id
   and plan.tenant_id = subscription.tenant_id
   and plan.module_id = subscription.module_id
  where subscription.tenant_id = v_appointment.tenant_id
    and subscription.module_id = v_appointment.module_id
    and subscription.client_id = v_appointment.client_id
    and subscription.status = 'active'
    and plan.active = true
  order by
    case when subscription.id = v_appointment.subscription_id then 0 else 1 end,
    subscription.started_at desc,
    subscription.created_at desc
  limit 1;

  v_items := case
    when jsonb_typeof(coalesce(v_appointment.service_items, '[]'::jsonb)) = 'array'
      then coalesce(v_appointment.service_items, '[]'::jsonb)
    else '[]'::jsonb
  end;
  v_benefits := case
    when jsonb_typeof(coalesce(v_appointment.subscription_benefits, '[]'::jsonb)) = 'array'
      then coalesce(v_appointment.subscription_benefits, '[]'::jsonb)
    else '[]'::jsonb
  end;
  v_new_benefits := v_benefits;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_service_code := coalesce(nullif(trim(v_item->>'code'), ''), nullif(trim(v_item->>'service_type'), ''));
    v_service_name := coalesce(nullif(trim(v_item->>'name'), ''), nullif(trim(v_item->>'label'), ''), v_service_code, 'Servico');
    v_group := coalesce(nullif(trim(v_item->>'group_type'), ''), v_appointment.service_group);
    v_catalog_unit := greatest(0, coalesce(
      nullif(v_item->>'catalog_price', '')::numeric,
      nullif(v_item->>'default_price', '')::numeric,
      nullif(v_item->>'unit_price', '')::numeric,
      nullif(v_item->>'price', '')::numeric,
      0
    ));
    v_net_unit := greatest(0, coalesce(
      nullif(v_item->>'unit_price', '')::numeric,
      nullif(v_item->>'price', '')::numeric,
      v_catalog_unit
    ));
    v_catalog_total := v_catalog_total + v_catalog_unit;
    v_benefit_key := null;

    select coalesce(nullif(benefit->>'key', ''), nullif(benefit->>'benefit_key', ''))
    into v_benefit_key
    from jsonb_array_elements(v_benefits) benefit
    where benefit->>'kind' = 'service'
      and coalesce(benefit->>'status', v_appointment.subscription_benefit_status, 'reserved') in ('reserved', 'consumed')
      and (
        (v_service_code is not null and benefit->>'service_code' = v_service_code)
        or (nullif(v_item->>'benefit_key', '') is not null and coalesce(benefit->>'key', benefit->>'benefit_key') = v_item->>'benefit_key')
      )
    limit 1;

    v_covered := coalesce(nullif(v_item->>'benefit_used', '')::boolean, false)
      or coalesce(nullif(v_item->>'subscription_benefit_used', '')::boolean, false)
      or v_benefit_key is not null;

    if not v_covered and v_subscription_id is not null then
      v_benefit_key := public.consume_petshop_subscription_benefit(
        v_subscription_id,
        v_appointment.tenant_id,
        array[
          v_service_code,
          public.petshop_plan_service_key(v_service_name, v_service_code, v_group)
        ]
      );
      v_covered := v_benefit_key is not null;
      v_changed := v_changed or v_covered;
    end if;

    if v_covered then
      v_any_benefit := true;
      if not exists (
        select 1 from jsonb_array_elements(v_new_benefits) benefit
        where benefit->>'kind' = 'service'
          and coalesce(benefit->>'service_code', '') = coalesce(v_service_code, '')
          and coalesce(benefit->>'status', 'reserved') in ('reserved', 'consumed')
      ) then
        v_new_benefits := v_new_benefits || jsonb_build_array(jsonb_build_object(
          'kind', 'service',
          'key', coalesce(v_benefit_key, v_service_code),
          'service_code', v_service_code,
          'label', v_service_name,
          'catalog_price', v_catalog_unit,
          'status', 'consumed'
        ));
      end if;
    else
      v_net_total := v_net_total + v_net_unit;
    end if;
  end loop;

  if jsonb_array_length(v_items) = 0 then
    v_catalog_unit := greatest(0, coalesce(v_appointment.price, 0));
    v_catalog_total := v_catalog_total + v_catalog_unit;
    if v_subscription_id is not null then
      v_benefit_key := public.consume_petshop_subscription_benefit(
        v_subscription_id,
        v_appointment.tenant_id,
        array[
          v_appointment.service_type,
          public.petshop_plan_service_key(v_appointment.service_type, v_appointment.service_type, v_appointment.service_group)
        ]
      );
    end if;
    if v_benefit_key is not null then
      v_any_benefit := true;
      v_changed := true;
      v_new_benefits := v_new_benefits || jsonb_build_array(jsonb_build_object(
        'kind', 'service', 'key', v_benefit_key, 'service_code', v_appointment.service_type,
        'label', v_appointment.service_type, 'catalog_price', v_catalog_unit, 'status', 'consumed'
      ));
    else
      v_net_total := v_net_total + v_catalog_unit;
    end if;
  end if;

  v_catalog_transport := public.resolve_petshop_transport_fee(
    v_appointment.tenant_id,
    v_appointment.module_id,
    coalesce(v_appointment.transport_mode, 'cliente_leva')
  );
  v_catalog_total := v_catalog_total + v_catalog_transport;

  select exists (
    select 1 from jsonb_array_elements(v_benefits) benefit
    where benefit->>'kind' = 'transport'
      and coalesce(benefit->>'status', v_appointment.subscription_benefit_status, 'reserved') in ('reserved', 'consumed')
  ) into v_transport_covered;
  if not v_transport_covered then
    select exists (
      select 1 from jsonb_array_elements(v_items) item
      where coalesce(nullif(item->>'transport_benefit_used', '')::boolean, false)
    ) into v_transport_covered;
  end if;

  if v_catalog_transport > 0 and not v_transport_covered and v_subscription_id is not null then
    v_benefit_key := public.consume_petshop_subscription_benefit(
      v_subscription_id,
      v_appointment.tenant_id,
      array['motodog']
    );
    v_transport_covered := v_benefit_key is not null;
    v_changed := v_changed or v_transport_covered;
    if v_transport_covered then
      v_new_benefits := v_new_benefits || jsonb_build_array(jsonb_build_object(
        'kind', 'transport', 'key', v_benefit_key, 'transport_mode', 'buscar_e_levar',
        'label', 'MotoDog - buscar e levar', 'catalog_price', v_catalog_transport, 'status', 'consumed'
      ));
    end if;
  end if;

  if v_transport_covered then
    v_any_benefit := true;
  else
    v_net_total := v_net_total + v_catalog_transport;
  end if;

  if v_any_benefit then
    update public.appointments
    set subscription_benefits = public.mark_petshop_subscription_benefits(v_new_benefits, 'consumed'),
        subscription_discount = round(greatest(0, v_catalog_total - v_net_total), 2),
        subscription_label = coalesce(v_appointment.subscription_label, v_plan_name, 'Pacote banho'),
        subscription_benefit_status = 'consumed',
        price = round(greatest(0, v_net_total), 2),
        updated_at = now()
    where id = v_appointment.id
    returning * into v_appointment;
  end if;

  return jsonb_build_object(
    'changed', v_changed,
    'appointment', to_jsonb(v_appointment)
  );
end;
$$;

revoke all on function public.reconcile_petshop_completed_appointment_package(uuid) from public;
grant execute on function public.reconcile_petshop_completed_appointment_package(uuid)
  to authenticated, service_role;

commit;
