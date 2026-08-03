begin;

-- Repair deployments where the package reservation lifecycle migration was
-- recorded or partially superseded without leaving the exact benefit API that
-- the checkout/reconciliation functions call at runtime.
alter table public.client_subscriptions
  add column if not exists services_reserved jsonb not null default '{}'::jsonb;

update public.client_subscriptions
set services_reserved = '{}'::jsonb
where services_reserved is null
   or jsonb_typeof(services_reserved) <> 'object';

alter table public.client_subscriptions
  alter column services_reserved set default '{}'::jsonb,
  alter column services_reserved set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'client_subscriptions_services_reserved_check'
      and conrelid = 'public.client_subscriptions'::regclass
  ) then
    alter table public.client_subscriptions
      add constraint client_subscriptions_services_reserved_check
      check (jsonb_typeof(services_reserved) = 'object');
  end if;
end;
$$;

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
  if p_subscription_id is null or p_tenant_id is null then
    return null;
  end if;
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

  if not found then
    return null;
  end if;

  foreach v_candidate in array coalesce(p_candidates, array[]::text[])
  loop
    v_candidate := nullif(trim(v_candidate), '');
    if v_candidate is null then
      continue;
    end if;

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

    if v_plan_service is null then
      continue;
    end if;

    v_usage_key := coalesce(
      nullif(trim(v_plan_service->>'service_type'), ''),
      nullif(trim(v_plan_service->>'service_code'), '')
    );
    if v_usage_key is null then
      continue;
    end if;

    v_limit := greatest(0, coalesce(nullif(v_plan_service->>'qty_per_cycle', '')::integer, 0));
    v_used := greatest(0, coalesce(nullif(v_subscription.services_used->>v_usage_key, '')::integer, 0));
    v_reserved := greatest(0, coalesce(nullif(v_subscription.services_reserved->>v_usage_key, '')::integer, 0));

    if v_action = 'reserve' then
      if v_used + v_reserved >= v_limit then
        continue;
      end if;
      v_reserved := v_reserved + 1;
    elsif v_action = 'consume' then
      if v_used >= v_limit then
        continue;
      end if;
      v_used := v_used + 1;
      if v_reserved > 0 then
        v_reserved := v_reserved - 1;
      end if;
    else
      if v_reserved <= 0 then
        continue;
      end if;
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

grant execute on function public.reserve_petshop_subscription_benefit(uuid, uuid, text[])
  to authenticated, service_role;
grant execute on function public.consume_petshop_subscription_benefit(uuid, uuid, text[])
  to authenticated, service_role;
grant execute on function public.release_petshop_subscription_benefit(uuid, uuid, text)
  to authenticated, service_role;

do $$
begin
  if to_regprocedure('public.consume_petshop_subscription_benefit(uuid,uuid,text[])') is null then
    raise exception 'Falha ao reparar consume_petshop_subscription_benefit(uuid, uuid, text[]).';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
