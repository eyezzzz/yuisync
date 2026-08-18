begin;

-- services_reserved é um ledger derivado dos agendamentos ainda abertos.
-- Bugs legados deixaram alguns ciclos com reserva órfã: a tela mostrava 3/4,
-- o operador digitava 4 e o frontend reduzia silenciosamente de volta para 3.
--
-- Esta função reconstrói somente as reservas a partir dos benefícios realmente
-- vinculados a agendamentos abertos. services_used continua sendo preservado,
-- inclusive quando foi ajustado administrativamente.
create or replace function public.reconcile_petshop_subscription_reservations(
  p_subscription_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription record;
  v_plan_service jsonb;
  v_usage_key text;
  v_reserved_count integer;
  v_reserved jsonb;
begin
  if p_subscription_id is null then
    return null;
  end if;

  select
    subscription.id,
    subscription.tenant_id,
    subscription.module_id,
    coalesce(subscription.services_reserved, '{}'::jsonb) as services_reserved,
    coalesce(plan.services, '[]'::jsonb) as plan_services
  into v_subscription
  from public.client_subscriptions subscription
  join public.subscription_plans plan
    on plan.id = subscription.plan_id
   and plan.tenant_id = subscription.tenant_id
   and plan.module_id = subscription.module_id
  where subscription.id = p_subscription_id
    and subscription.module_id = 'petshop'
  for update of subscription;

  if not found then
    return null;
  end if;

  if auth.uid() is not null
    and not public.has_tenant_access(v_subscription.tenant_id)
  then
    raise exception 'Assinatura nao pertence ao tenant ativo.';
  end if;

  v_reserved := v_subscription.services_reserved;

  for v_plan_service in
    select value
    from jsonb_array_elements(v_subscription.plan_services)
  loop
    v_usage_key := coalesce(
      nullif(trim(v_plan_service->>'service_type'), ''),
      nullif(trim(v_plan_service->>'service_code'), '')
    );

    if v_usage_key is null then
      continue;
    end if;

    select count(*)::integer
    into v_reserved_count
    from public.appointments appointment
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(appointment.subscription_benefits, '[]'::jsonb)) = 'array'
          then coalesce(appointment.subscription_benefits, '[]'::jsonb)
        else '[]'::jsonb
      end
    ) benefit
    where appointment.subscription_id = v_subscription.id
      and appointment.tenant_id = v_subscription.tenant_id
      and appointment.module_id = v_subscription.module_id
      and coalesce(appointment.status, '') not in (
        'concluido', 'completed', 'finalizado', 'cancelado', 'no_show'
      )
      and coalesce(appointment.subscription_benefit_status, 'reserved') = 'reserved'
      and coalesce(benefit->>'status', 'reserved') = 'reserved'
      and lower(trim(coalesce(
        benefit->>'key',
        benefit->>'benefit_key',
        benefit->>'service_code',
        ''
      ))) = lower(v_usage_key);

    v_reserved := jsonb_set(
      v_reserved,
      array[v_usage_key],
      to_jsonb(greatest(0, coalesce(v_reserved_count, 0))),
      true
    );
  end loop;

  if v_reserved is distinct from v_subscription.services_reserved then
    update public.client_subscriptions
    set services_reserved = v_reserved,
        updated_at = now()
    where id = v_subscription.id
      and tenant_id = v_subscription.tenant_id;
  end if;

  return v_reserved;
end;
$$;

revoke all on function public.reconcile_petshop_subscription_reservations(uuid) from public;
grant execute on function public.reconcile_petshop_subscription_reservations(uuid)
  to authenticated, service_role;

comment on function public.reconcile_petshop_subscription_reservations(uuid) is
  'Reconstrói services_reserved usando apenas benefícios reservados em agendamentos PetShop ainda abertos.';

-- Mantém o ledger sincronizado depois de criar, editar, concluir, cancelar ou
-- remover um agendamento. O trigger ignora updates sem alteração de pacote/status.
create or replace function public.sync_petshop_subscription_reservations_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_subscription_id uuid;
  v_new_subscription_id uuid;
begin
  if tg_op = 'UPDATE'
    and old.subscription_id is not distinct from new.subscription_id
    and old.status is not distinct from new.status
    and old.subscription_benefit_status is not distinct from new.subscription_benefit_status
    and old.subscription_benefits is not distinct from new.subscription_benefits
  then
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_old_subscription_id := old.subscription_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_new_subscription_id := new.subscription_id;
  end if;

  if v_old_subscription_id is not null
    and v_old_subscription_id is distinct from v_new_subscription_id
  then
    perform public.reconcile_petshop_subscription_reservations(v_old_subscription_id);
  end if;

  if v_new_subscription_id is not null then
    perform public.reconcile_petshop_subscription_reservations(v_new_subscription_id);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists z_sync_petshop_subscription_reservations
on public.appointments;

create trigger z_sync_petshop_subscription_reservations
after insert or update or delete
on public.appointments
for each row
execute function public.sync_petshop_subscription_reservations_from_appointment();

-- Saneia os ciclos que já estavam inconsistentes antes da instalação do trigger.
do $$
declare
  v_subscription_id uuid;
begin
  for v_subscription_id in
    select subscription.id
    from public.client_subscriptions subscription
    where subscription.module_id = 'petshop'
      and subscription.status in ('active', 'paused')
  loop
    perform public.reconcile_petshop_subscription_reservations(v_subscription_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
