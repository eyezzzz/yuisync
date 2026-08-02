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
  v_service_pool numeric := 0;
  v_fixed_total numeric := 0;
  v_core_total numeric := 0;
  v_core_units numeric := 0;
  v_all_total numeric := 0;
  v_all_units numeric := 0;
  v_matching_catalog numeric := 0;
  v_matching_core boolean := false;
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
  if not public.has_tenant_access(v_tenant_id) then
    raise exception 'Assinatura fora do tenant ativo.';
  end if;

  select to_jsonb(settings)
  into v_settings
  from public.settings settings
  where settings.tenant_id = v_tenant_id
    and settings.module_id = v_module_id
  limit 1;

  select case
    when coalesce(option->>'fee', '') ~ '^[0-9]+(\.[0-9]+)?$' then (option->>'fee')::numeric
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
      when coalesce(v_settings->>'pet_transport_fee', '') ~ '^[0-9]+(\.[0-9]+)?$'
        then (v_settings->>'pet_transport_fee')::numeric
      else 20
    end;
  end if;

  with plan_items as (
    select
      coalesce(nullif(item->>'service_code', ''), nullif(item->>'service_type', '')) as code,
      case when coalesce(item->>'qty_per_cycle', '') ~ '^[0-9]+$'
        then greatest(0, (item->>'qty_per_cycle')::integer)
        else 0
      end as qty,
      lower(concat_ws(' ', item->>'service_type', item->>'service_code', item->>'service_name')) as item_text,
      lower(concat_ws(' ', item->>'service_type', item->>'service_code', item->>'service_name', item->>'group_type', item->>'service_kind')) as transport_text
    from jsonb_array_elements(v_plan_services) item
  ), service_items as (
    select
      plan_item.*,
      greatest(0, coalesce(catalog.default_price, 0))::numeric as catalog_price,
      lower(concat_ws(' ', plan_item.item_text, catalog.code, catalog.name, catalog.category))
        ~ '(^|[ _-])(banho|tosa|tosagem|groom|trim|trimming|stripping)($|[ _-])' as is_core
    from plan_items plan_item
    left join public.petshop_services catalog
      on catalog.tenant_id = v_tenant_id
     and catalog.module_id = v_module_id
     and catalog.code = plan_item.code
    where plan_item.qty > 0
      and plan_item.transport_text !~ '(motodog|moto dog|transport|buscar e levar)'
  )
  select
    coalesce((select sum(item.qty) from plan_items item where item.transport_text ~ '(motodog|moto dog|transport|buscar e levar)'), 0),
    coalesce(sum(item.qty * item.catalog_price) filter (where not item.is_core), 0),
    coalesce(sum(item.qty * item.catalog_price) filter (where item.is_core), 0),
    coalesce(sum(item.qty) filter (where item.is_core), 0),
    coalesce(sum(item.qty * item.catalog_price), 0),
    coalesce(sum(item.qty), 0),
    coalesce(max(item.catalog_price) filter (where item.code = v_code), 0),
    coalesce(bool_or(item.is_core) filter (where item.code = v_code), false)
  into
    v_transport_qty,
    v_fixed_total,
    v_core_total,
    v_core_units,
    v_all_total,
    v_all_units,
    v_matching_catalog,
    v_matching_core
  from service_items item;

  v_service_pool := greatest(0, v_plan_price - greatest(0, v_transport_qty) * greatest(0, v_transport_fee));

  if v_core_units > 0 and v_fixed_total <= v_service_pool + 0.005 then
    if not v_matching_core and v_matching_catalog > 0 then
      return round(v_matching_catalog, 2);
    end if;
    if v_matching_core and v_core_total > 0 and v_matching_catalog > 0 then
      return round((v_service_pool - v_fixed_total) * v_matching_catalog / v_core_total, 2);
    end if;
    if v_matching_core and v_core_units > 0 then
      return round((v_service_pool - v_fixed_total) / v_core_units, 2);
    end if;
  end if;

  if v_all_total > 0 and v_matching_catalog > 0 then
    return round(v_service_pool * v_matching_catalog / v_all_total, 2);
  end if;
  if v_all_units > 0 then
    return round(v_service_pool / v_all_units, 2);
  end if;

  return 0;
end;
$$;

revoke all on function public.petshop_package_service_unit_value(uuid, text) from public;
grant execute on function public.petshop_package_service_unit_value(uuid, text) to authenticated, service_role;

comment on function public.petshop_package_service_unit_value(uuid, text) is
  'Mantem extras do pacote no valor integral, aplica o desconto aos servicos-base e exclui MotoDog da comissao.';

commit;
