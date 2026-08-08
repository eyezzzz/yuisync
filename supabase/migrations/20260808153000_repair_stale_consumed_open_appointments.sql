begin;

-- Corrige o estado legado em que um atendimento foi concluído, consumiu um
-- benefício de pacote e depois voltou para um status aberto, mas permaneceu com
-- subscription_benefit_status = 'consumed'. Esse estado não deve impedir a
-- edição operacional do agendamento.

create or replace function public.repair_petshop_reopened_consumed_appointment(
  p_appointment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment record;
  v_benefits jsonb := '[]'::jsonb;
  v_item jsonb;
  v_key text;
  v_reversed boolean;
begin
  select
    appointment.id,
    appointment.tenant_id,
    appointment.module_id,
    appointment.status,
    appointment.subscription_id,
    appointment.subscription_benefit_used,
    appointment.subscription_benefit_status,
    appointment.subscription_benefits,
    appointment.service_type,
    appointment.service_group,
    appointment.service_items
  into v_appointment
  from public.appointments appointment
  where appointment.id = p_appointment_id
  for update;

  if not found
    or v_appointment.module_id <> 'petshop'
    or v_appointment.status in ('concluido', 'completed', 'finalizado')
    or v_appointment.subscription_benefit_status <> 'consumed'
    or v_appointment.subscription_id is null
  then
    return false;
  end if;

  -- Se já existe venda/caixa vinculada, não alteramos silenciosamente a parte
  -- financeira. Nesse caso o usuário deve estornar antes de trocar o serviço.
  if exists (
    select 1
    from public.sales sale
    where sale.tenant_id = v_appointment.tenant_id
      and sale.module_id = v_appointment.module_id
      and sale.appointment_id = v_appointment.id
  ) then
    raise exception 'Atendimento já lançado no caixa. Estorne o lançamento antes de alterar serviço ou transporte.';
  end if;

  v_benefits := case
    when jsonb_typeof(coalesce(v_appointment.subscription_benefits, '[]'::jsonb)) = 'array'
      then coalesce(v_appointment.subscription_benefits, '[]'::jsonb)
    else '[]'::jsonb
  end;

  -- Compatibilidade com registros antigos que marcaram o agendamento como
  -- consumido antes de existir o snapshot subscription_benefits.
  if jsonb_array_length(v_benefits) = 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'kind', 'service',
      'key', coalesce(
        nullif(item->>'benefit_key', ''),
        public.petshop_plan_service_key(
          coalesce(item->>'name', item->>'label'),
          coalesce(item->>'code', item->>'service_type'),
          coalesce(item->>'group_type', v_appointment.service_group)
        ),
        nullif(item->>'code', ''),
        nullif(item->>'service_type', '')
      ),
      'service_code', coalesce(item->>'code', item->>'service_type'),
      'label', coalesce(item->>'name', item->>'label', item->>'code', item->>'service_type'),
      'status', 'consumed'
    )), '[]'::jsonb)
    into v_benefits
    from jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(v_appointment.service_items, '[]'::jsonb)) = 'array'
          then coalesce(v_appointment.service_items, '[]'::jsonb)
        else '[]'::jsonb
      end
    ) item
    where coalesce((item->>'benefit_used')::boolean, false);
  end if;

  if jsonb_array_length(v_benefits) = 0 and nullif(trim(v_appointment.service_type), '') is not null then
    v_benefits := jsonb_build_array(jsonb_build_object(
      'kind', 'service',
      'key', public.petshop_plan_service_key(
        v_appointment.service_type,
        v_appointment.service_type,
        v_appointment.service_group
      ),
      'service_code', v_appointment.service_type,
      'label', v_appointment.service_type,
      'status', 'consumed'
    ));
  end if;

  for v_item in
    select * from jsonb_array_elements(v_benefits)
  loop
    if coalesce(v_item->>'status', 'consumed') <> 'consumed' then
      continue;
    end if;

    v_key := nullif(trim(coalesce(v_item->>'key', v_item->>'benefit_key', v_item->>'service_code')), '');
    if v_key is null then
      continue;
    end if;

    -- Ao reabrir para edição, o consumo antigo é desfeito e não é reservado
    -- imediatamente. A transação de edição resolverá novamente o pacote, caso
    -- exista um pacote ativo e elegível para o novo serviço.
    v_reversed := public.reverse_petshop_consumed_subscription_benefit(
      v_appointment.subscription_id,
      v_appointment.tenant_id,
      v_key,
      false
    );
  end loop;

  -- Primeiro altera somente campos que NÃO fazem o trigger legado de preparação
  -- rodar. Assim quebramos o estado 'consumed' antes da edição real.
  update public.appointments
  set subscription_benefits = public.mark_petshop_subscription_benefits(v_benefits, 'released'),
      subscription_benefit_status = 'released',
      updated_at = now()
  where id = v_appointment.id
    and tenant_id = v_appointment.tenant_id;

  return true;
end;
$$;

revoke all on function public.repair_petshop_reopened_consumed_appointment(uuid) from public;
grant execute on function public.repair_petshop_reopened_consumed_appointment(uuid) to service_role;


-- A interface usa esta RPC para qualquer edição que envolva serviço, cliente,
-- data ou transporte. Antes de resolver o novo serviço, saneamos automaticamente
-- o estado legado 'aberto + consumed'. Isso evita o 400 que hoje é devolvido
-- pelo trigger prepare_petshop_appointment_plan_benefits.
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
  v_services_changed boolean := false;
  v_service_type_changed boolean := false;
  v_requested_service_codes text[] := array[]::text[];
  v_current_service_codes text[] := array[]::text[];
  v_transport_changed boolean := false;
  v_current_transport_mode text;
  v_requested_transport_mode text;
  v_transport_mode text;
  v_old_transport_fee numeric := 0;
  v_transport_fee numeric := 0;
  v_service_price numeric := 0;
  v_total_price numeric := 0;
  v_duration integer;
begin
  select * into v_current
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then raise exception 'Agendamento nao encontrado.'; end if;
  if v_tenant_id is null then v_tenant_id := v_current.tenant_id; end if;
  if v_current.tenant_id <> v_tenant_id
    or v_current.module_id <> v_module_id
    or not public.has_tenant_access(v_tenant_id)
  then
    raise exception 'Agendamento nao pertence ao tenant ativo.';
  end if;

  -- Estado legado: atendimento já está aberto, mas ainda carrega benefício
  -- consumido. Reparamos ANTES de resolver os novos serviços para que a reserva
  -- do pacote seja recalculada corretamente e para que o trigger legado não
  -- rejeite a atualização.
  if v_current.status not in ('concluido', 'completed', 'finalizado')
    and v_current.subscription_benefit_status = 'consumed'
    and v_current.subscription_id is not null
  then
    perform public.repair_petshop_reopened_consumed_appointment(p_appointment_id);

    select * into v_current
    from public.appointments
    where id = p_appointment_id
      and tenant_id = v_tenant_id
    for update;
  end if;

  v_client_id := coalesce(
    nullif(p_payload->>'client_id', '')::uuid,
    nullif(p_payload->>'pet_id', '')::uuid,
    v_current.client_id
  );

  if not exists (
    select 1
    from public.clients
    where id = v_client_id
      and tenant_id = v_tenant_id
      and module_id = v_module_id
      and active = true
  ) then
    raise exception 'Cliente nao pertence ao tenant ativo.';
  end if;

  if p_payload ? 'services' then
    select coalesce(array_agg(requested.code order by requested.ordinality), array[]::text[])
    into v_requested_service_codes
    from (
      select
        entry.ordinality,
        nullif(trim(coalesce(entry.item->>'code', entry.item->>'service_type')), '') as code
      from jsonb_array_elements(coalesce(p_payload->'services', '[]'::jsonb))
        with ordinality as entry(item, ordinality)
    ) requested
    where requested.code is not null;

    select coalesce(array_agg(current_item.code order by current_item.ordinality), array[]::text[])
    into v_current_service_codes
    from (
      select
        entry.ordinality,
        nullif(trim(coalesce(entry.item->>'code', entry.item->>'service_type')), '') as code
      from jsonb_array_elements(coalesce(v_current.service_items, '[]'::jsonb))
        with ordinality as entry(item, ordinality)
    ) current_item
    where current_item.code is not null;

    v_services_changed := v_requested_service_codes is distinct from v_current_service_codes;
  end if;

  v_service_type_changed := nullif(trim(p_payload->>'service_type'), '') is not null
    and nullif(trim(p_payload->>'service_type'), '')
      is distinct from nullif(trim(v_current.service_type), '');

  v_recalculate := v_services_changed
    or v_service_type_changed
    or v_client_id is distinct from v_current.client_id;

  if v_recalculate then
    perform public.restore_petshop_appointment_benefits(p_appointment_id);
    v_resolved := public.resolve_petshop_appointment_services(
      v_tenant_id,
      v_module_id,
      v_client_id,
      case
        when p_payload ? 'services' then coalesce(p_payload->'services', '[]'::jsonb)
        else coalesce(v_current.service_items, '[]'::jsonb)
      end,
      coalesce(nullif(p_payload->>'service_type', ''), v_current.service_type)
    );
    v_service_price := round(greatest(0, coalesce((v_resolved->>'price')::numeric, 0)), 2);
  else
    v_resolved := jsonb_build_object(
      'service_type', v_current.service_type,
      'service_group', v_current.service_group,
      'items', coalesce(v_current.service_items, '[]'::jsonb),
      'duration_min', v_current.duration_min,
      'subscription_id', v_current.subscription_id,
      'benefit_used', v_current.subscription_benefit_used
    );

    if jsonb_typeof(coalesce(v_current.service_items, '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(v_current.service_items, '[]'::jsonb)) > 0
    then
      select round(coalesce(sum(greatest(
        0,
        coalesce(nullif(item->>'unit_price', '')::numeric, 0)
      )), 0), 2)
      into v_service_price
      from jsonb_array_elements(v_current.service_items) item;
    end if;

    v_old_transport_fee := public.resolve_petshop_transport_fee(
      v_tenant_id,
      v_module_id,
      coalesce(v_current.transport_mode, 'cliente_leva')
    );

    if v_service_price <= 0 and coalesce(v_current.price, 0) > 0 then
      v_service_price := greatest(0, v_current.price - v_old_transport_fee);
    end if;
  end if;

  v_current_transport_mode := coalesce(
    nullif(trim(v_current.transport_mode), ''),
    'cliente_leva'
  );
  v_requested_transport_mode := case
    when p_payload ? 'transport_mode'
      then coalesce(nullif(trim(p_payload->>'transport_mode'), ''), 'cliente_leva')
    else v_current_transport_mode
  end;
  v_transport_changed := (p_payload ? 'transport_mode')
    and v_requested_transport_mode is distinct from v_current_transport_mode;

  -- Preserva inclusive NULL legado quando o modal envia o equivalente
  -- `cliente_leva`; isso evita disparar a proteção como se o transporte mudasse.
  v_transport_mode := case
    when v_transport_changed then v_requested_transport_mode
    else v_current.transport_mode
  end;

  v_duration := greatest(10, coalesce(
    nullif(trim(p_payload->>'duration_min'), '')::integer,
    (v_resolved->>'duration_min')::integer,
    v_current.duration_min,
    60
  ));

  if not v_recalculate and not v_transport_changed then
    v_transport_fee := v_old_transport_fee;
    v_total_price := round(
      greatest(0, coalesce(v_current.price, v_service_price + v_transport_fee)),
      2
    );
  else
    v_transport_fee := public.resolve_petshop_transport_fee(
      v_tenant_id,
      v_module_id,
      coalesce(v_transport_mode, 'cliente_leva')
    );
    v_total_price := round(v_service_price + v_transport_fee, 2);
  end if;

  update public.appointments
  set client_id = v_client_id,
      pet_id = coalesce(nullif(p_payload->>'pet_id', '')::uuid, v_current.pet_id, v_client_id),
      service_type = v_resolved->>'service_type',
      service_group = v_resolved->>'service_group',
      service_items = v_resolved->'items',
      scheduled_at = coalesce(nullif(p_payload->>'scheduled_at', '')::timestamptz, v_current.scheduled_at),
      duration_min = v_duration,
      price = v_total_price,
      status = coalesce(nullif(trim(p_payload->>'status'), ''), v_current.status),
      notes = case
        when p_payload ? 'notes' then nullif(trim(p_payload->>'notes'), '')
        else v_current.notes
      end,
      source = coalesce(nullif(trim(p_payload->>'source'), ''), v_current.source, 'manual'),
      employee_id = case
        when p_payload ? 'employee_id' then nullif(p_payload->>'employee_id', '')::uuid
        else v_current.employee_id
      end,
      groomer_id = case
        when p_payload ? 'groomer_id' then nullif(p_payload->>'groomer_id', '')::uuid
        else v_current.groomer_id
      end,
      responsible_staff_key = case
        when p_payload ? 'responsible_staff_key'
          then nullif(trim(p_payload->>'responsible_staff_key'), '')
        else v_current.responsible_staff_key
      end,
      responsible_staff_name = case
        when p_payload ? 'responsible_staff_name'
          then nullif(trim(p_payload->>'responsible_staff_name'), '')
        else v_current.responsible_staff_name
      end,
      transport_mode = v_transport_mode,
      transport_label = case
        when p_payload ? 'transport_label' then nullif(trim(p_payload->>'transport_label'), '')
        else v_current.transport_label
      end,
      transport_address = case
        when p_payload ? 'transport_address' then nullif(trim(p_payload->>'transport_address'), '')
        else v_current.transport_address
      end,
      transport_neighborhood = case
        when p_payload ? 'transport_neighborhood' then nullif(trim(p_payload->>'transport_neighborhood'), '')
        else v_current.transport_neighborhood
      end,
      transport_city = case
        when p_payload ? 'transport_city' then nullif(trim(p_payload->>'transport_city'), '')
        else v_current.transport_city
      end,
      transport_reference = case
        when p_payload ? 'transport_reference' then nullif(trim(p_payload->>'transport_reference'), '')
        else v_current.transport_reference
      end,
      subscription_id = nullif(v_resolved->>'subscription_id', '')::uuid,
      subscription_benefit_used = coalesce((v_resolved->>'benefit_used')::boolean, false),
      updated_at = now()
  where id = p_appointment_id
    and tenant_id = v_tenant_id;

  return jsonb_build_object(
    'appointment_id', p_appointment_id,
    'service_price', v_service_price,
    'transport_fee', v_transport_fee,
    'price', v_total_price,
    'duration_min', v_duration,
    'service_items', v_resolved->'items'
  );
end;
$$;

revoke all on function public.update_petshop_appointment_transaction(uuid, jsonb) from public;
grant execute on function public.update_petshop_appointment_transaction(uuid, jsonb)
  to authenticated, service_role;


-- Saneia imediatamente registros antigos já reabertos. Registros com venda
-- vinculada ficam intactos para não corromper o caixa.
do $$
declare
  v_appointment record;
begin
  for v_appointment in
    select appointment.id
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
    order by appointment.created_at
  loop
    perform public.repair_petshop_reopened_consumed_appointment(v_appointment.id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
