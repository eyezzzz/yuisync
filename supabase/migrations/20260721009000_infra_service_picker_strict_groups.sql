-- Strict service areas and searchable multi-service picker support.
begin;

create or replace function public.normalize_petshop_catalog_text(p_value text)
returns text
language sql
immutable
as $$
  select translate(
    lower(coalesce(p_value, '')),
    'áàãâäéèêëíìîïóòõôöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc'
  );
$$;

create or replace function public.resolve_petshop_service_group(
  p_name text,
  p_code text default null,
  p_category text default null,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_declared_group text default null
)
returns text
language sql
immutable
as $$
  with normalized as (
    select
      public.normalize_petshop_catalog_text(trim(coalesce(p_metadata->>'service_group', ''))) as metadata_group,
      public.normalize_petshop_catalog_text(trim(coalesce(p_declared_group, ''))) as declared_group,
      public.normalize_petshop_catalog_text(concat_ws(
        ' ', p_name, p_code, p_category, p_description,
        p_metadata->>'service_category',
        p_metadata->>'department',
        p_metadata->>'area'
      )) as service_text
  )
  select case
    when metadata_group in ('banho_tosa', 'veterinaria', 'outro') then metadata_group
    when service_text ~ '(vet|veterin|consulta|vacina|clinica|medico|exame|cirurg|ultrassom|castr|retorno|internac|curativo|vermifug|microchip|aplicacao|hemograma|radiograf|raio[ -]?x|coleta|sorolog|odontolog|anestesia|medicacao|eletrocard|ecocard|emergencia|procedimento)'
      then 'veterinaria'
    when service_text ~ '(banho|tosa|desembolo|escovac|hidrat|higien|groom|perfume|spa|trim|unha|ouvido|orelha)'
      then 'banho_tosa'
    when declared_group in ('banho_tosa', 'veterinaria', 'outro') then declared_group
    else 'outro'
  end
  from normalized;
$$;

create or replace function public.classify_petshop_appointment_service_group(
  p_name text,
  p_code text default null,
  p_declared_group text default null
)
returns text
language sql
immutable
as $$
  select case
    when public.normalize_petshop_catalog_text(trim(coalesce(p_declared_group, ''))) in ('banho_tosa', 'veterinaria', 'outro')
      then public.normalize_petshop_catalog_text(trim(p_declared_group))
    else public.resolve_petshop_service_group(p_name, p_code, null, null, '{}'::jsonb, null)
  end;
$$;

-- Stop showing synthetic defaults that were seeded by the legacy team SQL.
-- Exact price/duration/name matching protects real manually-created services
-- that happen to use a short code such as "banho".
update public.petshop_services
set active = false,
    updated_at = now()
where source_product_id is null
  and (
    (code = 'banho' and name = 'Banho' and default_price = 60 and default_duration_min = 60)
    or (code = 'tosa' and name = 'Tosa' and default_price = 80 and default_duration_min = 60)
    or (code = 'banho_e_tosa' and name = 'Banho e Tosa' and default_price = 120 and default_duration_min = 90)
    or (code = 'escovacao' and name = 'Escovacao' and default_price = 40 and default_duration_min = 45)
    or (code = 'consulta' and name = 'Consulta Veterinaria' and default_price = 120 and default_duration_min = 40)
    or (code = 'veterinario' and name = 'Veterinario' and default_price = 150 and default_duration_min = 40)
    or (code = 'vacina' and name = 'Vacina' and default_price = 90 and default_duration_min = 30)
    or (code = 'motoboy' and name = 'Motoboy/Transporte' and default_price = 20 and default_duration_min = 30)
    or (code = 'outro' and name = 'Outro' and default_price = 0 and default_duration_min = 60)
  );

-- Persist an explicit area in the commercial service catalog. Unknown services
-- are classified as "outro" and therefore stay out of both agenda tabs until
-- the operator selects the correct area in the service editor.
update public.products product
set bot_metadata = jsonb_set(
      coalesce(product.bot_metadata, '{}'::jsonb),
      '{service_group}',
      to_jsonb(public.resolve_petshop_service_group(
        product.name,
        null,
        product.category,
        product.description,
        coalesce(product.bot_metadata, '{}'::jsonb),
        null
      )),
      true
    ),
    updated_at = now()
where (
    public.normalize_petshop_catalog_text(coalesce(product.bot_metadata->>'product_type', '')) = 'servico'
    or public.normalize_petshop_catalog_text(product.category) = 'servico'
  )
  and coalesce(product.bot_metadata->>'service_group', '') not in ('banho_tosa', 'veterinaria', 'outro');

update public.petshop_services service
set group_type = public.resolve_petshop_service_group(
      product.name,
      service.code,
      product.category,
      product.description,
      coalesce(product.bot_metadata, '{}'::jsonb),
      null
    ),
    icon = case
      when public.resolve_petshop_service_group(product.name, service.code, product.category, product.description, coalesce(product.bot_metadata, '{}'::jsonb), null) = 'veterinaria' then 'stethoscope'
      when public.resolve_petshop_service_group(product.name, service.code, product.category, product.description, coalesce(product.bot_metadata, '{}'::jsonb), null) = 'banho_tosa' then 'droplets'
      else 'paw'
    end,
    updated_at = now()
from public.products product
where service.source_product_id = product.id
  and service.tenant_id = product.tenant_id
  and service.module_id = product.module_id;

update public.petshop_services
set group_type = public.resolve_petshop_service_group(name, code, null, null, '{}'::jsonb, group_type),
    updated_at = now()
where source_product_id is null
  and group_type not in ('banho_tosa', 'veterinaria', 'motoboy', 'outro');

create or replace function public.sync_product_service_to_petshop_services()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.products%rowtype;
  v_text text;
  v_name text;
  v_code text;
  v_group text;
  v_duration integer := 60;
  v_is_service boolean := false;
begin
  if tg_op = 'DELETE' then
    update public.petshop_services
    set active = false,
        updated_at = now()
    where tenant_id = old.tenant_id
      and module_id = old.module_id
      and (source_product_id = old.id or code = 'catalog_' || replace(old.id::text, '-', ''));
    return old;
  end if;

  v_row := new;
  v_name := trim(coalesce(v_row.name, ''));
  v_text := public.normalize_petshop_catalog_text(concat_ws(
    ' ', v_row.name, v_row.category, v_row.description,
    v_row.bot_metadata->>'product_type', v_row.bot_metadata->>'service_group'
  ));
  v_code := 'catalog_' || replace(v_row.id::text, '-', '');

  v_is_service := (
    public.normalize_petshop_catalog_text(trim(coalesce(v_row.bot_metadata->>'product_type', ''))) = 'servico'
    or public.normalize_petshop_catalog_text(trim(coalesce(v_row.category, ''))) = 'servico'
    or v_text ~ '(banho|tosa|desembolo|escovac|hidrat|higien|consulta|vacina|exame|cirurg|ultrassom|castr|curativo|microchip|hemograma|radiograf|raio[ -]?x|odontolog)'
  )
  and public.normalize_petshop_catalog_text(v_name) !~ '(banheira|banho a seco|brinquedo|casinha|roupa|shampoo|varinha)'
  and public.normalize_petshop_catalog_text(v_name) !~ '(pacote.*banho|banho.*pacote)';

  if coalesce(v_row.bot_metadata->>'duration_min', '') ~ '^[0-9]+$' then
    v_duration := greatest(15, (v_row.bot_metadata->>'duration_min')::integer);
  elsif coalesce(v_row.bot_metadata->>'service_duration_min', '') ~ '^[0-9]+$' then
    v_duration := greatest(15, (v_row.bot_metadata->>'service_duration_min')::integer);
  end if;

  v_group := public.resolve_petshop_service_group(
    v_name,
    v_code,
    v_row.category,
    v_row.description,
    coalesce(v_row.bot_metadata, '{}'::jsonb),
    null
  );

  if v_is_service and coalesce(v_row.active, false) and coalesce(v_row.price, 0) > 0 and v_name <> '' then
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
    set active = false,
        updated_at = now()
    where tenant_id = v_row.tenant_id
      and module_id = v_row.module_id
      and (source_product_id = v_row.id or code = v_code);
  end if;

  return new;
end;
$$;

commit;
