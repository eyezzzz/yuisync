begin;

create or replace function public.petshop_package_service_unit_value(
  p_subscription_id uuid,
  p_service_code text
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_module_id text;
  v_plan_price numeric := 0;
  v_plan_services jsonb := '[]'::jsonb;
  v_settings jsonb := '{}'::jsonb;
  v_transport_fee numeric := 20;
  v_transport_qty numeric := 0;
  v_service_units numeric := 0;
  v_service_pool numeric := 0;
  v_total_catalog numeric := 0;
  v_matching_catalog numeric := 0;
  v_non_transport_count integer := 0;
  v_code text := nullif(trim(coalesce(p_service_code, '')), '');
begin
  select
    subscription.tenant_id,
    subscription.module_id,
    greatest(0, coalesce(plan.price, 0)),
    case when jsonb_typeof(coalesce(plan.services, '[]'::jsonb)) = 'array'
      then coalesce(plan.services, '[]'::jsonb)
      else '[]'::jsonb
    end
  into v_tenant_id, v_module_id, v_plan_price, v_plan_services
  from public.client_subscriptions subscription
  join public.subscription_plans plan
    on plan.id = subscription.plan_id
   and plan.tenant_id = subscription.tenant_id
   and plan.module_id = subscription.module_id
  where subscription.id = p_subscription_id
  limit 1;

  if not found then return 0; end if;

  select to_jsonb(settings)
  into v_settings
  from public.settings settings
  where settings.tenant_id = v_tenant_id
    and settings.module_id = v_module_id
  limit 1;

  select case
    when coalesce(option->>'fee', '') ~ '^\d+(\.\d+)?$' then (option->>'fee')::numeric
    else null
  end
  into v_transport_fee
  from jsonb_array_elements(
    case when jsonb_typeof(v_settings->'pet_transport_options') = 'array'
      then v_settings->'pet_transport_options'
      else '[]'::jsonb
    end
  ) option
  where option->>'id' in ('buscar_e_levar', 'motodog')
  order by case when option->>'id' = 'buscar_e_levar' then 0 else 1 end
  limit 1;

  if v_transport_fee is null then
    v_transport_fee := case
      when coalesce(v_settings->>'pet_transport_fee', '') ~ '^\d+(\.\d+)?$'
        then (v_settings->>'pet_transport_fee')::numeric
      else 20
    end;
  end if;

  with plan_items as (
    select
      item,
      coalesce(nullif(item->>'service_code', ''), nullif(item->>'service_type', '')) as code,
      case when coalesce(item->>'qty_per_cycle', '') ~ '^\d+$'
        then greatest(0, (item->>'qty_per_cycle')::integer)
        else 0
      end as qty,
      lower(concat_ws(' ', item->>'service_type', item->>'service_code', item->>'service_name', item->>'group_type', item->>'service_kind')) as item_text
    from jsonb_array_elements(v_plan_services) item
  ), service_items as (
    select
      plan_item.*,
      greatest(0, coalesce(catalog.default_price, 0))::numeric as catalog_price
    from plan_items plan_item
    left join public.petshop_services catalog
      on catalog.tenant_id = v_tenant_id
     and catalog.module_id = v_module_id
     and catalog.code = plan_item.code
    where plan_item.qty > 0
      and plan_item.item_text !~ '(motodog|moto dog|transport|buscar e levar)'
  )
  select
    coalesce((select sum(plan_item.qty) from plan_items plan_item where plan_item.item_text ~ '(motodog|moto dog|transport|buscar e levar)'), 0),
    coalesce(sum(service_item.qty), 0),
    coalesce(sum(service_item.qty * service_item.catalog_price), 0),
    count(*)::integer,
    coalesce(max(service_item.catalog_price) filter (where service_item.code = v_code), 0)
  into v_transport_qty, v_service_units, v_total_catalog, v_non_transport_count, v_matching_catalog
  from service_items service_item;

  if v_matching_catalog <= 0 and v_non_transport_count = 1 then
    select greatest(0, coalesce(catalog.default_price, 0))::numeric
    into v_matching_catalog
    from jsonb_array_elements(v_plan_services) item
    left join public.petshop_services catalog
      on catalog.tenant_id = v_tenant_id
     and catalog.module_id = v_module_id
     and catalog.code = coalesce(nullif(item->>'service_code', ''), nullif(item->>'service_type', ''))
    where lower(concat_ws(' ', item->>'service_type', item->>'service_code', item->>'service_name', item->>'group_type', item->>'service_kind')) !~ '(motodog|moto dog|transport|buscar e levar)'
    limit 1;
  end if;

  v_service_pool := greatest(0, v_plan_price - greatest(0, v_transport_qty) * greatest(0, v_transport_fee));

  if v_total_catalog > 0 and v_matching_catalog > 0 then
    return round(v_service_pool * v_matching_catalog / v_total_catalog, 2);
  end if;

  if v_service_units > 0 then
    return round(v_service_pool / v_service_units, 2);
  end if;

  return 0;
end;
$$;

revoke all on function public.petshop_package_service_unit_value(uuid, text) from public;
grant execute on function public.petshop_package_service_unit_value(uuid, text) to authenticated, service_role;

comment on function public.petshop_package_service_unit_value(uuid, text) is
  'Retorna o valor liquido unitario do servico dentro do pacote, excluindo integralmente o MotoDog e distribuindo o desconto entre os servicos.';

create or replace function public.calculate_petshop_operational_commissions(
  p_module_id text,
  p_start timestamptz,
  p_end timestamptz,
  p_tenant_id uuid default null
)
returns table (
  staff_key text,
  collaborator_name text,
  service_count bigint,
  grooming_count bigint,
  other_service_count bigint,
  service_revenue numeric,
  grooming_revenue numeric,
  other_service_revenue numeric,
  grooming_commission numeric,
  other_service_commission numeric,
  total_commission numeric,
  detail jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_tenant_id is null or not public.has_tenant_access(p_tenant_id) then
    raise exception 'Tenant invalido ou sem permissao.';
  end if;

  return query
  with configured_staff as (
    select
      nullif(trim(item->>'key'), '') as staff_key,
      coalesce(nullif(trim(item->>'name'), ''), nullif(trim(item->>'key'), ''), 'Esteticista') as staff_name,
      coalesce(nullif(item->>'active', '')::boolean, true) as active
    from public.settings settings
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(settings.petshop_operational_staff) = 'array' then settings.petshop_operational_staff
        else '[]'::jsonb
      end
    ) item
    where settings.tenant_id = p_tenant_id
      and settings.module_id = p_module_id
  ),
  appointment_base as (
    select
      appointment.id,
      nullif(trim(appointment.responsible_staff_key), '') as staff_key,
      coalesce(nullif(trim(appointment.responsible_staff_name), ''), nullif(trim(appointment.responsible_staff_key), ''), 'Esteticista') as snapshot_name,
      greatest(0, coalesce(appointment.price, 0))::numeric as appointment_price,
      appointment.subscription_id,
      coalesce(appointment.subscription_benefit_used, false) as subscription_benefit_used,
      case
        when jsonb_typeof(coalesce(appointment.service_items, '[]'::jsonb)) = 'array'
          and jsonb_array_length(coalesce(appointment.service_items, '[]'::jsonb)) > 0
          then appointment.service_items
        else jsonb_build_array(jsonb_build_object(
          'code', appointment.service_type,
          'name', appointment.service_type,
          'group_type', coalesce(appointment.service_group, 'banho_tosa'),
          'unit_price', greatest(0, coalesce(appointment.price, 0))
        ))
      end as items
    from public.appointments appointment
    where appointment.tenant_id = p_tenant_id
      and appointment.module_id = p_module_id
      and appointment.status = 'concluido'
      and appointment.scheduled_at >= p_start
      and appointment.scheduled_at <= p_end
      and nullif(trim(appointment.responsible_staff_key), '') is not null
      and coalesce(appointment.service_group, 'banho_tosa') = 'banho_tosa'
  ),
  service_lines as (
    select
      base.id as appointment_id,
      base.staff_key,
      base.snapshot_name,
      coalesce(item->>'code', item->>'service_type', '') as service_code,
      coalesce(item->>'name', item->>'code', item->>'service_type', 'Servico estetico') as service_name,
      base.subscription_id is not null and base.subscription_benefit_used as is_package,
      greatest(0, case
        when base.subscription_id is not null and base.subscription_benefit_used then
          public.petshop_package_service_unit_value(
            base.subscription_id,
            coalesce(item->>'code', item->>'service_type', '')
          )
        else coalesce(
          nullif(item->>'unit_price', '')::numeric,
          nullif(item->>'catalog_price', '')::numeric,
          case when jsonb_array_length(base.items) = 1 then base.appointment_price else 0 end
        )
      end)::numeric as revenue
    from appointment_base base
    cross join lateral jsonb_array_elements(base.items) item
    where coalesce(item->>'group_type', 'banho_tosa') = 'banho_tosa'
      and lower(concat_ws(' ', item->>'code', item->>'service_type', item->>'name', item->>'group_type')) !~ '(motodog|moto dog|transport|entrega|delivery|frete|buscar|levar)'
  ),
  rated_lines as (
    select
      line.*,
      public.normalize_petshop_catalog_text(concat_ws(' ', line.service_code, line.service_name))
        ~ '(tosa|tesoura|maquina|groom|trim)' as is_grooming
    from service_lines line
  ),
  totals as (
    select
      rated.staff_key,
      max(rated.snapshot_name) as snapshot_name,
      count(*)::bigint as service_count,
      count(*) filter (where rated.is_grooming)::bigint as grooming_count,
      count(*) filter (where not rated.is_grooming)::bigint as other_service_count,
      count(*) filter (where rated.is_package)::bigint as package_count,
      coalesce(sum(rated.revenue), 0)::numeric as service_revenue,
      coalesce(sum(rated.revenue) filter (where rated.is_grooming), 0)::numeric as grooming_revenue,
      coalesce(sum(rated.revenue) filter (where not rated.is_grooming), 0)::numeric as other_service_revenue,
      coalesce(sum(rated.revenue) filter (where rated.is_package), 0)::numeric as package_revenue,
      coalesce(sum(rated.revenue * 0.10) filter (where rated.is_grooming), 0)::numeric as grooming_commission,
      coalesce(sum(rated.revenue * 0.05) filter (where not rated.is_grooming), 0)::numeric as other_service_commission,
      coalesce(sum(rated.revenue * case when rated.is_grooming then 0.10 else 0.05 end) filter (where rated.is_package), 0)::numeric as package_commission
    from rated_lines rated
    group by rated.staff_key
  ),
  staff_catalog as (
    select configured.staff_key, configured.staff_name, configured.active
    from configured_staff configured
    where configured.staff_key is not null
    union
    select totals.staff_key, totals.snapshot_name, true
    from totals
  ),
  staff_rows as (
    select
      catalog.staff_key,
      max(catalog.staff_name) as staff_name,
      bool_or(catalog.active) as active
    from staff_catalog catalog
    group by catalog.staff_key
  )
  select
    staff.staff_key,
    staff.staff_name as collaborator_name,
    coalesce(totals.service_count, 0)::bigint,
    coalesce(totals.grooming_count, 0)::bigint,
    coalesce(totals.other_service_count, 0)::bigint,
    round(coalesce(totals.service_revenue, 0), 2),
    round(coalesce(totals.grooming_revenue, 0), 2),
    round(coalesce(totals.other_service_revenue, 0), 2),
    round(coalesce(totals.grooming_commission, 0), 2),
    round(coalesce(totals.other_service_commission, 0), 2),
    round(coalesce(totals.grooming_commission, 0) + coalesce(totals.other_service_commission, 0), 2),
    jsonb_build_object(
      'active', staff.active,
      'grooming_rate', 10,
      'other_service_rate', 5,
      'grooming_revenue', coalesce(totals.grooming_revenue, 0),
      'other_service_revenue', coalesce(totals.other_service_revenue, 0),
      'package_count', coalesce(totals.package_count, 0),
      'package_revenue', coalesce(totals.package_revenue, 0),
      'package_commission', coalesce(totals.package_commission, 0)
    )
  from staff_rows staff
  left join totals on totals.staff_key = staff.staff_key
  order by
    coalesce(totals.grooming_commission, 0) + coalesce(totals.other_service_commission, 0) desc,
    staff.staff_name asc;
end;
$$;

revoke all on function public.calculate_petshop_operational_commissions(text, timestamptz, timestamptz, uuid) from public;
grant execute on function public.calculate_petshop_operational_commissions(text, timestamptz, timestamptz, uuid)
  to authenticated, service_role;

comment on function public.calculate_petshop_operational_commissions(text, timestamptz, timestamptz, uuid) is
  'Calcula comissoes por esteticista; pacotes usam o valor liquido do servico, excluindo integralmente MotoDog.';

commit;
