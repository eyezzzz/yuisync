-- Keep the commercial catalog, PetBot runtime and appointment transaction on
-- the same classification rules. This migration also repairs legacy rows that
-- made physical bath products look like bookable services.
begin;

create or replace function public.is_petbot_service_name_excluded(p_name text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select public.normalize_petshop_catalog_text(p_name) ~
      '(banheira|banho (a )?seco|brinquedo|casinha|roupa|shampoo|varinha)'
    or public.normalize_petshop_catalog_text(p_name) ~
      '(pacote.*banho|banho.*pacote)';
$$;

create or replace function public.is_petbot_service_catalog_product(
  p_name text,
  p_category text,
  p_metadata jsonb
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select not public.is_petbot_service_name_excluded(p_name)
    and (
      public.normalize_petshop_catalog_text(coalesce(p_metadata->>'product_type', '')) = 'servico'
      or public.normalize_petshop_catalog_text(p_category) in (
        'servico', 'banho', 'tosa', 'banho e tosa', 'veterinaria'
      )
      or public.normalize_petshop_catalog_text(p_name) ~
        '(banho|tosa|desembolo|escovac|hidrat|higieniz|consulta|vacina|exame|cirurg|ultrassom|castr|curativo|microchip|hemograma|radiograf|raio[ -]?x|odontolog|anestesia)'
    );
$$;

create or replace function public.infer_petbot_service_weight_metadata(
  p_name text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text := replace(public.normalize_petshop_catalog_text(p_name), ',', '.');
  v_match text[];
  v_min numeric := null;
  v_max numeric := null;
begin
  if coalesce(p_metadata->>'weight_min_kg', '') ~ '^[0-9]+([.][0-9]+)?$' then
    v_min := (p_metadata->>'weight_min_kg')::numeric;
  end if;
  if coalesce(p_metadata->>'weight_max_kg', '') ~ '^[0-9]+([.][0-9]+)?$' then
    v_max := (p_metadata->>'weight_max_kg')::numeric;
  end if;

  if v_min is null or v_max is null then
    v_match := regexp_match(
      v_text,
      '([0-9]+([.][0-9]+)?)[ ]*(kg[ ]*)?(a|ate|-)[ ]*([0-9]+([.][0-9]+)?)[ ]*kg'
    );
    if v_match is not null then
      v_min := coalesce(v_min, v_match[1]::numeric);
      v_max := coalesce(v_max, v_match[5]::numeric);
    end if;
  end if;

  if v_max is null then
    v_match := regexp_match(v_text, 'ate[ ]+([0-9]+([.][0-9]+)?)[ ]*kg');
    if v_match is not null then
      v_min := coalesce(v_min, 0);
      v_max := v_match[1]::numeric;
    end if;
  end if;

  if v_min is null and v_max is null then
    return '{}'::jsonb;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'weight_min_kg', v_min,
    'weight_max_kg', v_max
  ));
end;
$$;

create or replace function public.apply_petbot_service_species_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_species text;
  v_weight_metadata jsonb;
  v_name text := public.normalize_petshop_catalog_text(new.name);
begin
  new.bot_metadata := coalesce(new.bot_metadata, '{}'::jsonb);

  if public.is_petbot_service_name_excluded(new.name) then
    new.bot_metadata := (new.bot_metadata - 'service_group' - 'group_type')
      || jsonb_build_object('product_type', 'produto');
    return new;
  end if;

  if not public.is_petbot_service_catalog_product(new.name, new.category, new.bot_metadata) then
    return new;
  end if;

  new.bot_metadata := jsonb_set(new.bot_metadata, '{product_type}', '"servico"'::jsonb, true);
  v_species := case
    when v_name ~ '(^| )(gato|gata|gatos|gatas|felino|felina|felinos|felinas)( |$)' then 'cat'
    else public.infer_petbot_service_species(
      new.bot_metadata->>'species', new.species_target, new.name, new.category
    )
  end;
  if v_species is not null then
    new.bot_metadata := jsonb_set(new.bot_metadata, '{species}', to_jsonb(v_species), true);
  end if;

  v_weight_metadata := public.infer_petbot_service_weight_metadata(new.name, new.bot_metadata);
  if v_weight_metadata <> '{}'::jsonb then
    new.bot_metadata := new.bot_metadata || v_weight_metadata;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_apply_petbot_service_species_metadata on public.products;
create trigger trg_apply_petbot_service_species_metadata
before insert or update of name, category, species_target, bot_metadata
on public.products
for each row execute function public.apply_petbot_service_species_metadata();

create or replace function public.sync_product_service_to_petshop_services()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.products%rowtype;
  v_name text;
  v_code text;
  v_group text;
  v_duration integer := 60;
  v_is_service boolean := false;
begin
  if tg_op = 'DELETE' then
    update public.petshop_services
    set active = false, updated_at = now()
    where tenant_id = old.tenant_id
      and module_id = old.module_id
      and (source_product_id = old.id or code = 'catalog_' || replace(old.id::text, '-', ''));
    return old;
  end if;

  v_row := new;
  v_name := trim(coalesce(v_row.name, ''));
  v_code := 'catalog_' || replace(v_row.id::text, '-', '');
  v_is_service := public.is_petbot_service_catalog_product(
    v_row.name, v_row.category, coalesce(v_row.bot_metadata, '{}'::jsonb)
  );

  if coalesce(v_row.bot_metadata->>'duration_min', '') ~ '^[0-9]+$' then
    v_duration := greatest(15, (v_row.bot_metadata->>'duration_min')::integer);
  elsif coalesce(v_row.bot_metadata->>'service_duration_min', '') ~ '^[0-9]+$' then
    v_duration := greatest(15, (v_row.bot_metadata->>'service_duration_min')::integer);
  end if;

  v_group := public.resolve_petshop_service_group(
    v_name, v_code, v_row.category, v_row.description,
    coalesce(v_row.bot_metadata, '{}'::jsonb), null
  );

  if v_is_service and coalesce(v_row.active, false)
    and coalesce(v_row.price, 0) > 0 and v_name <> '' then
    insert into public.petshop_services (
      tenant_id, module_id, code, name, group_type, default_price,
      default_duration_min, commission_type, commission_rate, active,
      sort_order, icon, source_product_id, updated_at
    ) values (
      v_row.tenant_id, v_row.module_id, v_code, v_name, v_group, v_row.price,
      v_duration, 'percentage', 0, true, 500,
      case when v_group = 'veterinaria' then 'stethoscope' when v_group = 'banho_tosa' then 'droplets' else 'paw' end,
      v_row.id, now()
    )
    on conflict (tenant_id, module_id, code) do update
    set name = excluded.name,
        group_type = excluded.group_type,
        default_price = excluded.default_price,
        default_duration_min = excluded.default_duration_min,
        active = true,
        source_product_id = excluded.source_product_id,
        icon = excluded.icon,
        updated_at = now();
  else
    update public.petshop_services
    set active = false, updated_at = now()
    where tenant_id = v_row.tenant_id
      and module_id = v_row.module_id
      and (source_product_id = v_row.id or code = v_code);
  end if;
  return new;
end;
$$;

-- Known physical merchandise and bath plans must never enter the appointment
-- catalog, even when a legacy import marked them as services.
update public.products product
set category = case
      when public.normalize_petshop_catalog_text(product.name) ~ '(pacote.*banho|banho.*pacote)'
        then 'Pacote'
      else product.category
    end,
    bot_metadata = (coalesce(product.bot_metadata, '{}'::jsonb) - 'service_group' - 'group_type')
      || jsonb_build_object('product_type', 'produto'),
    updated_at = now()
where public.is_petbot_service_name_excluded(product.name);

-- A product explicitly named as a feline service is authoritative over stale
-- dog/all metadata imported from older catalogs.
update public.products product
set species_target = 'cat',
    bot_metadata = jsonb_set(
      coalesce(product.bot_metadata, '{}'::jsonb), '{species}', '"cat"'::jsonb, true
    ),
    updated_at = now()
where public.is_petbot_service_catalog_product(product.name, product.category, product.bot_metadata)
  and public.normalize_petshop_catalog_text(product.name) ~
    '(^| )(gato|gata|gatos|gatas|felino|felina|felinos|felinas)( |$)';

-- Re-run the BEFORE trigger for every actual service so legacy weight ranges
-- become explicit metadata and future transaction validation is deterministic.
update public.products product
set bot_metadata = coalesce(product.bot_metadata, '{}'::jsonb),
    updated_at = now()
where public.is_petbot_service_catalog_product(product.name, product.category, product.bot_metadata);

update public.petshop_services service
set active = false, updated_at = now()
from public.products product
where service.source_product_id = product.id
  and not public.is_petbot_service_catalog_product(
    product.name, product.category, coalesce(product.bot_metadata, '{}'::jsonb)
  );

-- Patch the deployed transactional RPC without replacing later concurrency,
-- order-upsert and single-stock-writer hardening migrations.
do $migration$
declare
  v_definition text;
  v_changed boolean := false;
  v_service_pattern text := 'and[[:space:]]+\([[:space:]]*lower\(coalesce\(p\.bot_metadata->>''product_type'', ''''\)\)[[:space:]]*=[[:space:]]*''servico''[[:space:]]+or[[:space:]]+lower\(coalesce\(p\.category, ''''\)\)[[:space:]]+in[[:space:]]+\([^)]*\)[[:space:]]+or[[:space:]]+lower\(coalesce\(p\.name, ''''\)\)[[:space:]]+~[[:space:]]+''[^'']+''[[:space:]]*\)';
  v_payment_pattern text := 'returning[[:space:]]+id[[:space:]]+into[[:space:]]+v_sale_id;';
begin
  select pg_get_functiondef('public.create_petbot_order_transaction(jsonb)'::regprocedure)
  into v_definition;

  if v_definition !~ 'is_petbot_service_catalog_product\(p\.name, p\.category, p\.bot_metadata\)' then
    if v_definition !~* v_service_pattern then
      raise exception 'Nao foi possivel localizar a classificacao de servico na RPC do PetBot.';
    end if;
    v_definition := regexp_replace(
      v_definition,
      v_service_pattern,
      'and public.is_petbot_service_catalog_product(p.name, p.category, p.bot_metadata)',
      'i'
    );
    v_changed := true;
  end if;

  if v_definition !~* 'returning[[:space:]]+id,[[:space:]]+payment_status[[:space:]]+into[[:space:]]+v_sale_id,[[:space:]]+v_payment_status;' then
    if v_definition !~* v_payment_pattern then
      raise exception 'Nao foi possivel localizar o retorno da venda na RPC do PetBot.';
    end if;
    v_definition := regexp_replace(
      v_definition,
      v_payment_pattern,
      'returning id, payment_status into v_sale_id, v_payment_status;',
      'i'
    );
    v_changed := true;
  end if;

  if v_changed then
    execute v_definition;
  end if;
end
$migration$;

revoke all on function public.create_petbot_order_transaction(jsonb) from public, anon, authenticated;
grant execute on function public.create_petbot_order_transaction(jsonb) to service_role;

commit;
