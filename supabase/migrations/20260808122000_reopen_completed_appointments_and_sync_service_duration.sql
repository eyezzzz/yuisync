begin;

-- ---------------------------------------------------------------------------
-- 1) Reabertura segura de atendimentos concluídos
--
-- Um atendimento de pacote pode ser marcado como concluído e depois voltar para
-- agendado/confirmado por correção operacional. O ciclo antigo mantinha o
-- benefício como `consumed`, então qualquer edição posterior de serviço ou
-- transporte era bloqueada, mesmo quando o atendimento já não estava concluído.
--
-- A regra abaixo desfaz somente o consumo vinculado ao próprio agendamento.
-- Se o pacote continua ativo, o benefício volta a ficar reservado. Se o pacote
-- não está mais ativo, o benefício é liberado e o atendimento reaberto volta a
-- ser avulso. Atendimentos já lançados no caixa continuam protegidos.
-- ---------------------------------------------------------------------------

create or replace function public.reverse_petshop_consumed_subscription_benefit(
  p_subscription_id uuid,
  p_tenant_id uuid,
  p_benefit_key text,
  p_reserve_again boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription record;
  v_plan_service jsonb;
  v_usage_key text;
  v_limit integer := 0;
  v_used integer := 0;
  v_reserved integer := 0;
  v_can_reserve boolean := false;
begin
  if p_subscription_id is null
    or p_tenant_id is null
    or nullif(trim(p_benefit_key), '') is null
  then
    return false;
  end if;

  select
    subscription.id,
    subscription.status as subscription_status,
    coalesce(subscription.services_used, '{}'::jsonb) as services_used,
    coalesce(subscription.services_reserved, '{}'::jsonb) as services_reserved,
    coalesce(plan.services, '[]'::jsonb) as plan_services,
    coalesce(plan.active, false) as plan_active
  into v_subscription
  from public.client_subscriptions subscription
  join public.subscription_plans plan
    on plan.id = subscription.plan_id
   and plan.tenant_id = subscription.tenant_id
   and plan.module_id = subscription.module_id
  where subscription.id = p_subscription_id
    and subscription.tenant_id = p_tenant_id
  for update of subscription;

  if not found then
    return false;
  end if;

  select value
  into v_plan_service
  from jsonb_array_elements(v_subscription.plan_services)
  where lower(trim(coalesce(value->>'service_type', ''))) = lower(trim(p_benefit_key))
     or lower(trim(coalesce(value->>'service_code', ''))) = lower(trim(p_benefit_key))
     or public.petshop_plan_service_key(
          coalesce(value->>'service_name', value->>'label'),
          coalesce(value->>'service_code', value->>'service_type'),
          value->>'group_type'
        ) = public.petshop_plan_service_key(p_benefit_key, p_benefit_key, null)
  order by case
    when lower(trim(coalesce(value->>'service_type', ''))) = lower(trim(p_benefit_key)) then 0
    when lower(trim(coalesce(value->>'service_code', ''))) = lower(trim(p_benefit_key)) then 1
    else 2
  end
  limit 1;

  if v_plan_service is null then
    return false;
  end if;

  v_usage_key := coalesce(
    nullif(trim(v_plan_service->>'service_type'), ''),
    nullif(trim(v_plan_service->>'service_code'), '')
  );
  if v_usage_key is null then
    return false;
  end if;

  v_limit := greatest(0, coalesce(nullif(v_plan_service->>'qty_per_cycle', '')::integer, 0));
  v_used := greatest(0, coalesce(nullif(v_subscription.services_used->>v_usage_key, '')::integer, 0));
  v_reserved := greatest(0, coalesce(nullif(v_subscription.services_reserved->>v_usage_key, '')::integer, 0));

  -- O consumo deste agendamento só pode ser revertido uma vez.
  if v_used <= 0 then
    return false;
  end if;

  v_used := v_used - 1;
  v_can_reserve := p_reserve_again
    and v_subscription.subscription_status = 'active'
    and v_subscription.plan_active
    and v_used + v_reserved < v_limit;

  if v_can_reserve then
    v_reserved := v_reserved + 1;
  end if;

  update public.client_subscriptions
  set services_used = jsonb_set(
        coalesce(services_used, '{}'::jsonb),
        array[v_usage_key],
        to_jsonb(v_used),
        true
      ),
      services_reserved = jsonb_set(
        coalesce(services_reserved, '{}'::jsonb),
        array[v_usage_key],
        to_jsonb(v_reserved),
        true
      ),
      updated_at = now()
  where id = p_subscription_id
    and tenant_id = p_tenant_id;

  return true;
end;
$$;

revoke all on function public.reverse_petshop_consumed_subscription_benefit(uuid, uuid, text, boolean) from public;
grant execute on function public.reverse_petshop_consumed_subscription_benefit(uuid, uuid, text, boolean)
  to service_role;


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
  v_reversed boolean;
  v_subscription_active boolean := false;
  v_keep_reservation boolean := false;
  v_service_total numeric := 0;
  v_transport_fee numeric := 0;
begin
  if new.module_id <> 'petshop' or new.status is not distinct from old.status then
    return new;
  end if;

  -- Reabrir um atendimento já pago exigiria alterar caixa/venda. Não fazemos
  -- isso silenciosamente, pois criaria divergência financeira.
  if old.status in ('concluido', 'completed', 'finalizado')
    and new.status not in ('concluido', 'completed', 'finalizado')
    and exists (
      select 1
      from public.sales sale
      where sale.tenant_id = old.tenant_id
        and sale.module_id = old.module_id
        and sale.appointment_id = old.id
    )
  then
    raise exception 'Atendimento já lançado no caixa. Estorne o lançamento antes de reabrir o agendamento.';
  end if;

  -- Concluído -> aberto novamente: desfaz o consumo do pacote deste atendimento.
  if old.status in ('concluido', 'completed', 'finalizado')
    and new.status not in ('concluido', 'completed', 'finalizado')
    and old.subscription_benefit_status = 'consumed'
    and old.subscription_id is not null
  then
    select exists (
      select 1
      from public.client_subscriptions subscription
      join public.subscription_plans plan
        on plan.id = subscription.plan_id
       and plan.tenant_id = subscription.tenant_id
       and plan.module_id = subscription.module_id
      where subscription.id = old.subscription_id
        and subscription.tenant_id = old.tenant_id
        and subscription.module_id = old.module_id
        and subscription.status = 'active'
        and plan.active = true
    ) into v_subscription_active;

    v_keep_reservation := v_subscription_active
      and new.status not in ('cancelado', 'no_show');

    for v_item in
      select *
      from jsonb_array_elements(coalesce(old.subscription_benefits, '[]'::jsonb))
    loop
      if coalesce(v_item->>'status', old.subscription_benefit_status, 'consumed') <> 'consumed' then
        continue;
      end if;

      v_key := nullif(trim(coalesce(v_item->>'key', v_item->>'benefit_key')), '');
      if v_key is null then
        continue;
      end if;

      v_reversed := public.reverse_petshop_consumed_subscription_benefit(
        old.subscription_id,
        old.tenant_id,
        v_key,
        v_keep_reservation
      );

      if not v_reversed then
        raise exception 'Não foi possível desfazer o consumo do benefício % ao reabrir o atendimento.', v_key;
      end if;
    end loop;

    new.subscription_benefits := public.mark_petshop_subscription_benefits(
      coalesce(old.subscription_benefits, '[]'::jsonb),
      case when v_keep_reservation then 'reserved' else 'released' end
    );

    if v_keep_reservation then
      new.subscription_benefit_status := 'reserved';
      new.subscription_benefit_used := true;
      return new;
    end if;

    -- Sem pacote ativo: a reabertura passa a ser um atendimento avulso.
    select coalesce(jsonb_agg(
      item
      || jsonb_build_object(
        'unit_price', greatest(0, coalesce(
          nullif(item->>'catalog_price', '')::numeric,
          catalog.default_price,
          nullif(item->>'unit_price', '')::numeric,
          0
        )),
        'catalog_price', greatest(0, coalesce(
          nullif(item->>'catalog_price', '')::numeric,
          catalog.default_price,
          nullif(item->>'unit_price', '')::numeric,
          0
        )),
        'benefit_used', false,
        'benefit_key', null,
        'benefit_status', null
      )
    ), '[]'::jsonb),
    coalesce(sum(greatest(0, coalesce(
      nullif(item->>'catalog_price', '')::numeric,
      catalog.default_price,
      nullif(item->>'unit_price', '')::numeric,
      0
    ))), 0)
    into new.service_items, v_service_total
    from jsonb_array_elements(coalesce(old.service_items, '[]'::jsonb)) item
    left join public.petshop_services catalog
      on catalog.tenant_id = old.tenant_id
     and catalog.module_id = old.module_id
     and catalog.code = coalesce(item->>'code', item->>'service_type');

    if jsonb_array_length(coalesce(new.service_items, '[]'::jsonb)) = 0 then
      select greatest(0, coalesce(service.default_price, old.price, 0))
      into v_service_total
      from public.petshop_services service
      where service.tenant_id = old.tenant_id
        and service.module_id = old.module_id
        and service.code = old.service_type
      limit 1;
      v_service_total := greatest(0, coalesce(v_service_total, old.price, 0));
    end if;

    v_transport_fee := public.resolve_petshop_transport_fee(
      old.tenant_id,
      old.module_id,
      coalesce(old.transport_mode, 'cliente_leva')
    );

    new.subscription_id := null;
    new.subscription_benefit_used := false;
    new.subscription_discount := 0;
    new.subscription_label := null;
    new.subscription_benefit_status := 'released';
    new.price := round(greatest(0, v_service_total) + greatest(0, coalesce(v_transport_fee, 0)), 2);
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


-- Corrige estados antigos em que o atendimento já voltou para aberto, mas o
-- benefício continuou marcado como consumido. Não altera atendimentos com venda.
do $$
declare
  v_appointment record;
  v_item jsonb;
  v_key text;
  v_active boolean;
  v_keep_reservation boolean;
  v_reversed boolean;
begin
  for v_appointment in
    select appointment.*
    from public.appointments appointment
    where appointment.module_id = 'petshop'
      and appointment.status not in ('concluido', 'completed', 'finalizado')
      and appointment.subscription_benefit_status = 'consumed'
      and appointment.subscription_id is not null
      and not exists (
        select 1
        from public.sales sale
        where sale.tenant_id = appointment.tenant_id
          and sale.module_id = appointment.module_id
          and sale.appointment_id = appointment.id
      )
    for update
  loop
    select exists (
      select 1
      from public.client_subscriptions subscription
      join public.subscription_plans plan
        on plan.id = subscription.plan_id
       and plan.tenant_id = subscription.tenant_id
       and plan.module_id = subscription.module_id
      where subscription.id = v_appointment.subscription_id
        and subscription.tenant_id = v_appointment.tenant_id
        and subscription.module_id = v_appointment.module_id
        and subscription.status = 'active'
        and plan.active = true
    ) into v_active;

    v_keep_reservation := v_active
      and v_appointment.status not in ('cancelado', 'no_show');

    for v_item in
      select * from jsonb_array_elements(coalesce(v_appointment.subscription_benefits, '[]'::jsonb))
    loop
      if coalesce(v_item->>'status', v_appointment.subscription_benefit_status, 'consumed') <> 'consumed' then
        continue;
      end if;
      v_key := nullif(trim(coalesce(v_item->>'key', v_item->>'benefit_key')), '');
      if v_key is null then continue; end if;

      v_reversed := public.reverse_petshop_consumed_subscription_benefit(
        v_appointment.subscription_id,
        v_appointment.tenant_id,
        v_key,
        v_keep_reservation
      );

      if not v_reversed then
        raise warning 'Não foi possível reverter benefício % do agendamento % durante saneamento.', v_key, v_appointment.id;
      end if;
    end loop;

    -- Atualiza apenas campos que não disparam o trigger de reconstrução. Assim
    -- o histórico permanece auditável e a próxima edição recalcula normalmente.
    update public.appointments
    set subscription_benefits = public.mark_petshop_subscription_benefits(
          coalesce(subscription_benefits, '[]'::jsonb),
          case when v_keep_reservation then 'reserved' else 'released' end
        ),
        subscription_benefit_status = case when v_keep_reservation then 'reserved' else 'released' end,
        updated_at = now()
    where id = v_appointment.id;
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2) Duração de serviços sincronizados com Produto/Estoque
--
-- A aba Serviços declara que nome, preço e duração dos itens de origem Produto
-- são controlados pelo Estoque. O carregamento antigo priorizava o valor antigo
-- de petshop_services antes do metadado do produto; um serviço configurado com
-- 40 min podia continuar aparecendo como 60 min.
-- ---------------------------------------------------------------------------

create or replace function public.petshop_product_service_duration(
  p_metadata jsonb,
  p_fallback integer default 60
)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_value text;
  v_key text;
begin
  foreach v_key in array array[
    'duration_min',
    'service_duration_min',
    'execution_duration_min',
    'execution_time_min',
    'service_time_min'
  ]
  loop
    v_value := nullif(trim(coalesce(p_metadata->>v_key, '')), '');
    if v_value ~ '^[0-9]+$' then
      return greatest(15, v_value::integer);
    end if;
  end loop;

  return greatest(15, coalesce(p_fallback, 60));
end;
$$;

-- Backfill imediato: o valor configurado no Produto/Estoque passa a vencer o
-- fallback antigo de 60 minutos no vínculo operacional.
update public.petshop_services service
set default_duration_min = public.petshop_product_service_duration(
      product.bot_metadata,
      service.default_duration_min
    ),
    updated_at = now()
from public.products product
where service.source_product_id = product.id
  and service.tenant_id = product.tenant_id
  and service.module_id = product.module_id
  and service.module_id = 'petshop'
  and public.petshop_product_service_duration(
        product.bot_metadata,
        service.default_duration_min
      ) is distinct from service.default_duration_min;

create or replace function public.sync_petshop_service_duration_from_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.module_id <> 'petshop' then
    return new;
  end if;

  update public.petshop_services service
  set default_duration_min = public.petshop_product_service_duration(
        new.bot_metadata,
        service.default_duration_min
      ),
      updated_at = now()
  where service.tenant_id = new.tenant_id
    and service.module_id = new.module_id
    and service.source_product_id = new.id;

  return new;
end;
$$;

drop trigger if exists zz_sync_petshop_service_duration_from_product on public.products;
create trigger zz_sync_petshop_service_duration_from_product
after insert or update of bot_metadata
on public.products
for each row
execute function public.sync_petshop_service_duration_from_product();

notify pgrst, 'reload schema';

commit;
