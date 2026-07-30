begin;

-- Localiza a primeira assinatura ativa do pet que ainda possui algum dos
-- benefícios candidatos. A ordem prioriza o ciclo que vence primeiro e,
-- em seguida, a compra mais antiga. Cada compra continua sendo um registro
-- independente em client_subscriptions.
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
      where greatest(
        0,
        coalesce(nullif(plan_service->>'qty_per_cycle', '')::integer, 0)
      ) > greatest(
        0,
        coalesce(
          nullif(
            coalesce(subscription.services_used, '{}'::jsonb)->>coalesce(
              nullif(trim(plan_service->>'service_type'), ''),
              nullif(trim(plan_service->>'service_code'), '')
            ),
            ''
          )::integer,
          0
        )
      )
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
    subscription.created_at asc
$$;

comment on function public.find_petshop_client_subscription_for_benefit(uuid, text, uuid, text[]) is
  'Escolhe, sem consumir, a primeira assinatura ativa do pet com saldo compatível.';

-- Faz a escolha e a reserva em uma única operação de alto nível. Se outra
-- transação consumir o saldo entre a busca e o lock, tenta a assinatura seguinte.
create or replace function public.reserve_petshop_client_subscription_benefit(
  p_tenant_id uuid,
  p_module_id text,
  p_client_id uuid,
  p_candidates text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription record;
  v_benefit_key text;
begin
  if p_tenant_id is null
    or p_client_id is null
    or nullif(trim(p_module_id), '') is null
  then
    return null;
  end if;

  for v_subscription in
    select *
    from public.find_petshop_client_subscription_for_benefit(
      p_tenant_id,
      p_module_id,
      p_client_id,
      p_candidates
    )
  loop
    v_benefit_key := public.reserve_petshop_subscription_benefit(
      v_subscription.subscription_id,
      p_tenant_id,
      p_candidates
    );

    if v_benefit_key is not null then
      return jsonb_build_object(
        'subscription_id', v_subscription.subscription_id,
        'plan_name', v_subscription.plan_name,
        'benefit_key', v_benefit_key
      );
    end if;
  end loop;

  return null;
end;
$$;

comment on function public.reserve_petshop_client_subscription_benefit(uuid, text, uuid, text[]) is
  'Reserva o benefício na primeira compra ativa do pet que ainda possui saldo.';

-- Mantém um único subscription_id por agendamento. A primeira cobertura
-- encontrada define a instância do pacote; os demais itens do mesmo atendimento
-- usam essa mesma assinatura ou permanecem avulsos.
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

  for v_item in select * from jsonb_array_elements(v_requested)
  loop
    v_code := nullif(trim(coalesce(v_item->>'code', v_item->>'service_type')), '');
    if v_code is null then
      raise exception 'Codigo de servico invalido.';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_items) existing
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

    if not found then
      raise exception 'Servico nao encontrado ou inativo: %.', v_code;
    end if;

    v_service_group := public.classify_petshop_appointment_service_group(
      v_service.name,
      v_service.code,
      v_service.group_type
    );
    if v_service_group not in ('banho_tosa', 'veterinaria') then
      raise exception 'Servico % nao esta classificado para a agenda.', v_service.name;
    end if;
    if v_group is null then
      v_group := v_service_group;
    end if;
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
        'status', 'reserved'
      ));
    end if;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', v_service.code,
      'name', v_service.name,
      'group_type', v_service_group,
      'unit_price', case
        when v_benefit then 0
        else greatest(0, coalesce(v_service.default_price, 0))
      end,
      'catalog_price', greatest(0, coalesce(v_service.default_price, 0)),
      'duration_min', greatest(15, coalesce(v_service.default_duration_min, 60)),
      'benefit_used', v_benefit,
      'benefit_key', v_benefit_key,
      'benefit_status', case when v_benefit then 'reserved' else null end
    ));

    v_total := v_total + case
      when v_benefit then 0
      else greatest(0, coalesce(v_service.default_price, 0))
    end;
    v_duration := v_duration + greatest(
      15,
      coalesce(v_service.default_duration_min, 60)
    );
  end loop;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Nenhum servico valido selecionado.';
  end if;

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

-- Quando o atendimento usa apenas MotoDog, seleciona previamente uma assinatura
-- com saldo. O trigger transacional existente continuará sendo o único responsável
-- por efetivamente reservar o benefício.
create or replace function public.select_petshop_appointment_subscription_for_transport()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.module_id <> 'petshop'
    or new.subscription_id is not null
    or coalesce(new.status, 'agendado') in ('cancelado', 'no_show')
    or coalesce(new.transport_mode, 'cliente_leva') <> 'buscar_e_levar'
  then
    return new;
  end if;

  select candidate.subscription_id
  into new.subscription_id
  from public.find_petshop_client_subscription_for_benefit(
    new.tenant_id,
    new.module_id,
    new.client_id,
    array['motodog']
  ) candidate
  limit 1;

  return new;
end;
$$;

drop trigger if exists a0_select_petshop_transport_subscription on public.appointments;
create trigger a0_select_petshop_transport_subscription
before insert or update of client_id, transport_mode, status, subscription_id
on public.appointments
for each row execute function public.select_petshop_appointment_subscription_for_transport();

comment on function public.select_petshop_appointment_subscription_for_transport() is
  'Seleciona uma compra ativa do pet com saldo MotoDog antes da reserva transacional.';

commit;
