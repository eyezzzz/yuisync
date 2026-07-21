-- Keep one active record for each service name without deleting sales,
-- appointments or any other historical reference.
begin;

with ranked_service_products as (
  select
    id,
    row_number() over (
      partition by tenant_id, module_id, lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as position
  from public.products
  where active = true
    and (
      lower(trim(coalesce(category, ''))) = 'serviço'
      or lower(trim(coalesce(category, ''))) = 'servico'
      or lower(coalesce(bot_metadata->>'product_type', '')) = 'servico'
    )
)
update public.products product
set active = false,
    updated_at = now()
from ranked_service_products ranked
where product.id = ranked.id
  and ranked.position > 1;

-- `petshop_services` is optional for legacy tenants, so only normalize it
-- when the dedicated services table has already been installed.
do $$
begin
  if to_regclass('public.petshop_services') is not null then
    execute $sql$
      with ranked_services as (
        select
          id,
          row_number() over (
            partition by tenant_id, module_id, lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
            order by updated_at desc nulls last, created_at desc nulls last, id desc
          ) as position
        from public.petshop_services
        where active = true
      )
      update public.petshop_services service
      set active = false,
          updated_at = now()
      from ranked_services ranked
      where service.id = ranked.id
        and ranked.position > 1
    $sql$;
  end if;
end $$;

commit;
