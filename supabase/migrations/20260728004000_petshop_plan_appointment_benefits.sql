begin;

-- Mantem o espelho legado de pets gravavel sob RLS. O front usa o mesmo UUID
-- do cliente para o pet; o trigger preenche o tenant antes da avaliacao da policy.
create or replace function public.fill_pet_tenant_from_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tenant_id is null then
    select client.tenant_id
    into new.tenant_id
    from public.clients client
    where client.id = new.id
      and client.module_id = new.module_id
    limit 1;
  end if;

  if new.tenant_id is null then
    raise exception 'Nao foi possivel determinar o tenant do pet.';
  end if;

  if not exists (
    select 1
    from public.clients client
    where client.id = new.id
      and client.tenant_id = new.tenant_id
      and client.module_id = new.module_id
  ) then
    raise exception 'Pet nao pertence ao mesmo tenant do cliente.';
  end if;

  return new;
end;
$$;

drop trigger if exists fill_pet_tenant_from_client on public.pets;
create trigger fill_pet_tenant_from_client
before insert or update of id, module_id, tenant_id
on public.pets
for each row execute function public.fill_pet_tenant_from_client();

alter table public.appointments
  add column if not exists subscription_benefits jsonb not null default '[]'::jsonb,
  add column if not exists subscription_discount numeric(10,2) not null default 0,
  add column if not exists subscription_label text,
  add column if not exists subscription_benefit_status text;

alter table public.appointments
  drop constraint if exists appointments_subscription_benefits_check;
alter table public.appointments
  add constraint appointments_subscription_benefits_check
  check (jsonb_typeof(subscription_benefits) = 'array');

alter table public.appointments
  drop constraint if exists appointments_subscription_benefit_status_check;
alter table public.appointments
  add constraint appointments_subscription_benefit_status_check
  check (
    subscription_benefit_status is null
    or subscription_benefit_status in ('reserved', 'consumed', 'released')
  );

create index if not exists appointments_tenant_subscription_benefit_idx
  on public.appointments (tenant_id, subscription_id, subscription_benefit_status)
  where subscription_id is not null;

create or replace function public.petshop_plan_service_key(
  p_name text,
  p_code text,
  p_group text default null
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text := public.normalize_petshop_catalog_text(concat_ws(' ', p_name, p_code, p_group));
begin
  if v_text ~ '(banho.*tosa|tosa.*banho)' then return 'banho_e_tosa'; end if;
  if v_text ~ 'banho' then return 'banho'; end if;
  if v_text ~ 'tosa' then return 'tosa'; end if;
  if v_text ~ 'vacina' then return 'vacina'; end if;
  if v_text ~ '(consulta|retorno)' then return 'consulta'; end if;
  return nullif(trim(p_code), '');
end;
$$;

create or replace function public.mark_petshop_subscription_benefits(
  p_benefits jsonb,
  p_status text
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(benefit || jsonb_build_object('status', p_status)),
    '[]'::jsonb
  )
  from jsonb_array_elements(
    case when jsonb_typeof(coalesce(p_benefits, '[]'::jsonb)) = 'array'
      then coalesce(p_benefits, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) benefit;
$$;

create or replace function public.reserve_petshop_subscription_benefit(
  p_subscription_id uuid,
  p_tenant_id uuid,
  p_candidates text[]
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription record;
  v_candidate text;
  v_plan_service jsonb;
  v_limit integer;
  v_used integer;
begin
  if p_subscription_id is null or p_tenant_id is null then return null; end if;

  select
    subscription.id,
    coalesce(subscription.services_used, '{}'::jsonb) as services_used,
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

    select value
    into v_plan_service
    from jsonb_array_elements(v_subscription.plan_services)
    where lower(trim(value->>'service_type')) = lower(v_candidate)
    limit 1;

    if v_plan_service is null then continue; end if;

    v_limit := greatest(0, coalesce(nullif(v_plan_service->>'qty_per_cycle', '')::integer, 0));
    v_used := greatest(0, coalesce(nullif(v_subscription.services_used->>v_candidate, '')::integer, 0));

    if v_limit > v_used then
      v_subscription.services_used := jsonb_set(
        v_subscription.services_used,
        array[v_candidate],
        to_jsonb(v_used + 1),
        true
      );

      update public.client_subscriptions
      set services_used = v_subscription.services_used,
          updated_at = now()
      where id = v_subscription.id
        and tenant_id = p_tenant_id;

      return v_candidate;
    end if;
  end loop;

  return null;
end;
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
declare
  v_usage jsonb;
  v_key text := nullif(trim(p_benefit_key), '');
  v_used integer;
begin
  if p_subscription_id is null or p_tenant_id is null or v_key is null then return; end if;

  select coalesce(subscription.services_used, '{}'::jsonb)
  into v_usage
  from public.client_subscriptions subscription
  where subscription.id = p_subscription_id
    and subscription.tenant_id = p_tenant_id
  for update;

  if not found then return; end if;

  v_used := greatest(0, coalesce(nullif(v_usage->>v_key, '')::integer, 0) - 1);
  v_usage := jsonb_set(v_usage, array[v_key], to_jsonb(v_used), true);

  update public.client_subscriptions
  set services_used = v_usage,
      updated_at = now()
  where id = p_subscription_id
    and tenant_id = p_tenant_id;
end;
$$;

-- Resolve o servico real do catalogo, mas aceita a cobertura generica do plano
-- (por exemplo, service_type=banho cobrindo o banho de porte selecionado).
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
  if jsonb_array_length(v_requested) = 0 then raise exception 'Selecione pelo menos um servico.'; end if;
  if jsonb_array_length(v_requested) > 10 then raise exception 'Limite de 10 servicos por agendamento.'; end if;

  select subscription.id, plan.name
  into v_subscription_id, v_plan_name
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
  order by subscription.started_at desc, subscription.created_at desc
  limit 1;

  for v_item in select * from jsonb_array_elements(v_requested)
  loop
    v_code := nullif(trim(coalesce(v_item->>'code', v_item->>'service_type')), '');
    if v_code is null then raise exception 'Codigo de servico invalido.'; end if;
    if exists (select 1 from jsonb_array_elements(v_items) existing where existing->>'code' = v_code) then
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

    v_service_group := public.classify_petshop_appointment_service_group(v_service.name, v_service.code, v_service.group_type);
    if v_service_group not in ('banho_tosa', 'veterinaria') then
      raise exception 'Servico % nao esta classificado para a agenda.', v_service.name;
    end if;
    if v_group is null then v_group := v_service_group; end if;
    if v_group <> v_service_group then
      raise exception 'Servicos de banho/tosa e veterinaria devem ser agendados separadamente.';
    end if;

    v_generic_key := public.petshop_plan_service_key(v_service.name, v_service.code, v_service_group);
    v_benefit_key := public.reserve_petshop_subscription_benefit(
      v_subscription_id,
      p_tenant_id,
      array[v_service.code, v_generic_key]
    );
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

create or replace function public.restore_petshop_appointment_benefits(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment record;
  v_benefits jsonb;
  v_item jsonb;
  v_key text;
begin
  select
    appointment.id,
    appointment.tenant_id,
    appointment.subscription_id,
    appointment.subscription_benefit_used,
    appointment.subscription_benefit_status,
    appointment.subscription_benefits,
    appointment.service_type,
    appointment.service_items
  into v_appointment
  from public.appointments appointment
  where appointment.id = p_appointment_id
  for update;

  if not found
    or v_appointment.subscription_id is null
    or not coalesce(v_appointment.subscription_benefit_used, false)
    or coalesce(v_appointment.subscription_benefit_status, 'reserved') <> 'reserved'
  then
    return;
  end if;

  v_benefits := coalesce(v_appointment.subscription_benefits, '[]'::jsonb);
  if jsonb_array_length(v_benefits) = 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'kind', 'service',
      'key', coalesce(item->>'benefit_key', item->>'code'),
      'status', 'reserved'
    )), '[]'::jsonb)
    into v_benefits
    from jsonb_array_elements(coalesce(v_appointment.service_items, '[]'::jsonb)) item
    where coalesce((item->>'benefit_used')::boolean, false);
  end if;

  for v_item in select * from jsonb_array_elements(v_benefits)
  loop
    if coalesce(v_item->>'status', 'reserved') = 'reserved' then
      v_key := nullif(trim(coalesce(v_item->>'key', v_item->>'benefit_key')), '');
      perform public.release_petshop_subscription_benefit(
        v_appointment.subscription_id,
        v_appointment.tenant_id,
        v_key
      );
    end if;
  end loop;

  update public.appointments
  set subscription_benefits = public.mark_petshop_subscription_benefits(v_benefits, 'released'),
      subscription_benefit_status = 'released',
      updated_at = now()
  where id = p_appointment_id;
end;
$$;

create or replace function public.prepare_petshop_appointment_plan_benefits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rebuild_services boolean := false;
  v_transport_changed boolean := false;
  v_benefits jsonb := '[]'::jsonb;
  v_old_benefits jsonb := '[]'::jsonb;
  v_item jsonb;
  v_key text;
  v_subscription_id uuid;
  v_plan_name text;
  v_transport_fee numeric := 0;
  v_transport_key text;
  v_discount numeric := 0;
begin
  if new.module_id <> 'petshop' then return new; end if;

  if tg_op = 'UPDATE' then
    v_rebuild_services := new.service_items is distinct from old.service_items
      or new.subscription_id is distinct from old.subscription_id
      or new.client_id is distinct from old.client_id
      or (
        old.subscription_benefit_status = 'released'
        and coalesce(new.subscription_benefit_used, false)
      );
    v_transport_changed := new.transport_mode is distinct from old.transport_mode;

    if old.subscription_benefit_status = 'consumed'
      and (v_rebuild_services or v_transport_changed)
    then
      raise exception 'Beneficio de pacote ja consumido. Crie um novo agendamento para alterar servico ou transporte.';
    end if;

    if not v_rebuild_services and not v_transport_changed then
      return new;
    end if;

    v_old_benefits := coalesce(old.subscription_benefits, '[]'::jsonb);

    if old.subscription_benefit_status = 'reserved' and v_rebuild_services then
      for v_item in select * from jsonb_array_elements(v_old_benefits)
      loop
        if coalesce(v_item->>'status', 'reserved') = 'reserved' then
          perform public.release_petshop_subscription_benefit(
            old.subscription_id,
            old.tenant_id,
            coalesce(v_item->>'key', v_item->>'benefit_key')
          );
        end if;
      end loop;
    elsif old.subscription_benefit_status = 'reserved' and v_transport_changed then
      for v_item in select * from jsonb_array_elements(v_old_benefits)
      loop
        if v_item->>'kind' = 'transport' and coalesce(v_item->>'status', 'reserved') = 'reserved' then
          perform public.release_petshop_subscription_benefit(
            old.subscription_id,
            old.tenant_id,
            coalesce(v_item->>'key', 'motodog')
          );
        end if;
      end loop;
    end if;
  else
    v_rebuild_services := true;
    v_transport_changed := true;
  end if;

  for v_item in
    select * from jsonb_array_elements(coalesce(new.service_items, '[]'::jsonb))
  loop
    if coalesce((v_item->>'benefit_used')::boolean, false) then
      v_key := nullif(trim(coalesce(v_item->>'benefit_key', v_item->>'code')), '');
      v_benefits := v_benefits || jsonb_build_array(jsonb_build_object(
        'kind', 'service',
        'key', v_key,
        'service_code', v_item->>'code',
        'label', coalesce(v_item->>'name', 'Servico do pacote'),
        'catalog_price', greatest(0, coalesce(nullif(v_item->>'catalog_price', '')::numeric, 0)),
        'status', 'reserved'
      ));
      v_discount := v_discount + greatest(0, coalesce(nullif(v_item->>'catalog_price', '')::numeric, 0));
    end if;
  end loop;

  v_subscription_id := new.subscription_id;
  if v_subscription_id is null then
    select subscription.id
    into v_subscription_id
    from public.client_subscriptions subscription
    join public.subscription_plans plan
      on plan.id = subscription.plan_id
     and plan.tenant_id = subscription.tenant_id
     and plan.module_id = subscription.module_id
    where subscription.tenant_id = new.tenant_id
      and subscription.module_id = new.module_id
      and subscription.client_id = new.client_id
      and subscription.status = 'active'
      and plan.active = true
    order by subscription.started_at desc, subscription.created_at desc
    limit 1;
  end if;

  if coalesce(new.status, 'agendado') not in ('cancelado', 'no_show')
    and coalesce(new.transport_mode, 'cliente_leva') = 'buscar_e_levar'
    and v_subscription_id is not null
  then
    v_transport_key := public.reserve_petshop_subscription_benefit(
      v_subscription_id,
      new.tenant_id,
      array['motodog']
    );

    if v_transport_key is not null then
      v_transport_fee := public.resolve_petshop_transport_fee(
        new.tenant_id,
        new.module_id,
        'buscar_e_levar'
      );
      new.price := greatest(0, round(coalesce(new.price, 0) - v_transport_fee, 2));
      v_discount := v_discount + v_transport_fee;
      v_benefits := v_benefits || jsonb_build_array(jsonb_build_object(
        'kind', 'transport',
        'key', v_transport_key,
        'transport_mode', 'buscar_e_levar',
        'label', 'MotoDog - buscar e levar',
        'catalog_price', v_transport_fee,
        'status', 'reserved'
      ));
    end if;
  end if;

  if jsonb_array_length(v_benefits) > 0 then
    select plan.name
    into v_plan_name
    from public.client_subscriptions subscription
    join public.subscription_plans plan
      on plan.id = subscription.plan_id
     and plan.tenant_id = subscription.tenant_id
    where subscription.id = v_subscription_id
      and subscription.tenant_id = new.tenant_id
    limit 1;

    new.subscription_id := v_subscription_id;
    new.subscription_benefit_used := true;
    new.subscription_benefits := v_benefits;
    new.subscription_discount := round(v_discount, 2);
    new.subscription_label := coalesce(v_plan_name, 'Pacote banho');
    new.subscription_benefit_status := case
      when new.status = 'concluido' then 'consumed'
      else 'reserved'
    end;
    if new.status = 'concluido' then
      new.subscription_benefits := public.mark_petshop_subscription_benefits(v_benefits, 'consumed');
    end if;
  else
    new.subscription_id := null;
    new.subscription_benefit_used := false;
    new.subscription_benefits := '[]'::jsonb;
    new.subscription_discount := 0;
    new.subscription_label := null;
    new.subscription_benefit_status := null;
  end if;

  return new;
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

  if new.status = 'concluido' then
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

create or replace function public.release_petshop_appointment_plan_benefits_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
begin
  if old.module_id = 'petshop' and old.subscription_benefit_status = 'reserved' then
    for v_item in select * from jsonb_array_elements(coalesce(old.subscription_benefits, '[]'::jsonb))
    loop
      if coalesce(v_item->>'status', 'reserved') = 'reserved' then
        perform public.release_petshop_subscription_benefit(
          old.subscription_id,
          old.tenant_id,
          coalesce(v_item->>'key', v_item->>'benefit_key')
        );
      end if;
    end loop;
  end if;
  return old;
end;
$$;

drop trigger if exists a_prepare_petshop_appointment_plan_benefits on public.appointments;
create trigger a_prepare_petshop_appointment_plan_benefits
before insert or update of service_items, subscription_id, subscription_benefit_used, client_id, transport_mode
on public.appointments
for each row execute function public.prepare_petshop_appointment_plan_benefits();

drop trigger if exists b_transition_petshop_appointment_plan_benefits on public.appointments;
create trigger b_transition_petshop_appointment_plan_benefits
before update of status
on public.appointments
for each row execute function public.transition_petshop_appointment_plan_benefits();

drop trigger if exists release_petshop_appointment_plan_benefits_on_delete on public.appointments;
create trigger release_petshop_appointment_plan_benefits_on_delete
before delete on public.appointments
for each row execute function public.release_petshop_appointment_plan_benefits_on_delete();

revoke all on function public.reserve_petshop_subscription_benefit(uuid, uuid, text[]) from public;
revoke all on function public.release_petshop_subscription_benefit(uuid, uuid, text) from public;
revoke all on function public.resolve_petshop_appointment_services(uuid, text, uuid, jsonb, text) from public;
revoke all on function public.restore_petshop_appointment_benefits(uuid) from public;
grant execute on function public.resolve_petshop_appointment_services(uuid, text, uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.restore_petshop_appointment_benefits(uuid) to authenticated, service_role;

comment on column public.appointments.subscription_benefits is
  'Snapshot auditavel dos beneficios de plano reservados, consumidos ou liberados pelo agendamento.';
comment on column public.appointments.subscription_discount is
  'Valor de catalogo abatido pelo pacote, incluindo servico e MotoDog buscar e levar.';
comment on column public.appointments.subscription_label is
  'Nome do plano aplicado no momento da reserva.';

commit;
