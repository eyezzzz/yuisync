-- Make the commercial catalog shown in Estoque > Servicos the source of truth
-- for PetBot service selection and transactional appointment booking.
begin;

alter table public.petshop_services
  add column if not exists source_product_id uuid references public.products(id) on delete set null;

create unique index if not exists idx_petshop_services_source_product
  on public.petshop_services (tenant_id, module_id, source_product_id)
  where source_product_id is not null;

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
      and (
        source_product_id = old.id
        or code = 'catalog_' || replace(old.id::text, '-', '')
      );
    return old;
  end if;

  v_row := new;
  v_name := trim(coalesce(v_row.name, ''));
  v_text := public.normalize_petshop_catalog_text(concat_ws(' ', v_row.name, v_row.category, v_row.bot_metadata->>'product_type'));
  v_code := 'catalog_' || replace(v_row.id::text, '-', '');

  v_is_service := (
    public.normalize_petshop_catalog_text(trim(coalesce(v_row.bot_metadata->>'product_type', ''))) = 'servico'
    or public.normalize_petshop_catalog_text(trim(coalesce(v_row.category, ''))) = 'servico'
    or v_text ~ '(banho|tosa|desembolo|escovac|hidrat|higieniz|consulta|vacina|exame|cirurg)'
  )
  and public.normalize_petshop_catalog_text(v_name) !~ '(banheira|banho a seco|brinquedo|casinha|roupa|shampoo|varinha)'
  and public.normalize_petshop_catalog_text(v_name) !~ '(pacote.*banho|banho.*pacote)';

  if coalesce(v_row.bot_metadata->>'duration_min', '') ~ '^[0-9]+$' then
    v_duration := greatest(15, (v_row.bot_metadata->>'duration_min')::integer);
  elsif coalesce(v_row.bot_metadata->>'service_duration_min', '') ~ '^[0-9]+$' then
    v_duration := greatest(15, (v_row.bot_metadata->>'service_duration_min')::integer);
  end if;

  v_group := case
    when v_text ~ '(vet|consulta|vacina|clinica|medico|exame|cirurg|ultrassom)' then 'veterinaria'
    else 'banho_tosa'
  end;

  if v_is_service and coalesce(v_row.active, false) and coalesce(v_row.price, 0) > 0 and v_name <> '' then
    insert into public.petshop_services (
      tenant_id,
      module_id,
      code,
      name,
      group_type,
      default_price,
      default_duration_min,
      commission_type,
      commission_rate,
      active,
      sort_order,
      icon,
      source_product_id,
      updated_at
    ) values (
      v_row.tenant_id,
      v_row.module_id,
      v_code,
      v_name,
      v_group,
      v_row.price,
      v_duration,
      'percentage',
      0,
      true,
      500,
      case when v_group = 'veterinaria' then 'stethoscope' else 'droplets' end,
      v_row.id,
      now()
    )
    on conflict (tenant_id, module_id, code) do update
    set name = excluded.name,
        group_type = excluded.group_type,
        default_price = excluded.default_price,
        default_duration_min = excluded.default_duration_min,
        active = true,
        source_product_id = excluded.source_product_id,
        updated_at = now();
  else
    update public.petshop_services
    set active = false,
        updated_at = now()
    where tenant_id = v_row.tenant_id
      and module_id = v_row.module_id
      and (
        source_product_id = v_row.id
        or code = v_code
      );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_product_service_catalog on public.products;
create trigger trg_sync_product_service_catalog
after insert or update of name, category, price, active, bot_metadata, tenant_id, module_id
or delete on public.products
for each row execute function public.sync_product_service_to_petshop_services();

-- Backfill every existing active service displayed in Estoque > Servicos.
insert into public.petshop_services (
  tenant_id,
  module_id,
  code,
  name,
  group_type,
  default_price,
  default_duration_min,
  commission_type,
  commission_rate,
  active,
  sort_order,
  icon,
  source_product_id,
  updated_at
)
select
  product.tenant_id,
  product.module_id,
  'catalog_' || replace(product.id::text, '-', ''),
  trim(product.name),
  case
    when public.normalize_petshop_catalog_text(concat_ws(' ', product.name, product.category, product.bot_metadata->>'product_type')) ~ '(vet|consulta|vacina|clinica|medico|exame|cirurg|ultrassom)'
      then 'veterinaria'
    else 'banho_tosa'
  end,
  product.price,
  case
    when coalesce(product.bot_metadata->>'duration_min', '') ~ '^[0-9]+$'
      then greatest(15, (product.bot_metadata->>'duration_min')::integer)
    when coalesce(product.bot_metadata->>'service_duration_min', '') ~ '^[0-9]+$'
      then greatest(15, (product.bot_metadata->>'service_duration_min')::integer)
    else 60
  end,
  'percentage',
  0,
  true,
  500,
  case
    when public.normalize_petshop_catalog_text(concat_ws(' ', product.name, product.category, product.bot_metadata->>'product_type')) ~ '(vet|consulta|vacina|clinica|medico|exame|cirurg|ultrassom)'
      then 'stethoscope'
    else 'droplets'
  end,
  product.id,
  now()
from public.products product
where product.active = true
  and coalesce(product.price, 0) > 0
  and trim(coalesce(product.name, '')) <> ''
  and (
    public.normalize_petshop_catalog_text(trim(coalesce(product.bot_metadata->>'product_type', ''))) = 'servico'
    or public.normalize_petshop_catalog_text(trim(coalesce(product.category, ''))) = 'servico'
    or public.normalize_petshop_catalog_text(concat_ws(' ', product.name, product.category, product.bot_metadata->>'product_type')) ~ '(banho|tosa|desembolo|escovac|hidrat|higieniz|consulta|vacina|exame|cirurg)'
  )
  and public.normalize_petshop_catalog_text(product.name) !~ '(banheira|banho a seco|brinquedo|casinha|roupa|shampoo|varinha)'
  and public.normalize_petshop_catalog_text(product.name) !~ '(pacote.*banho|banho.*pacote)'
on conflict (tenant_id, module_id, code) do update
set name = excluded.name,
    group_type = excluded.group_type,
    default_price = excluded.default_price,
    default_duration_min = excluded.default_duration_min,
    active = true,
    source_product_id = excluded.source_product_id,
    updated_at = now();

commit;
