begin;

create or replace function public.ensure_petshop_hygienic_grooming_services(
  p_tenant_id uuid,
  p_module_id text default 'petshop'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tenant_id is null or coalesce(nullif(trim(p_module_id), ''), 'petshop') <> 'petshop' then
    return;
  end if;

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
    updated_at
  ) values
    (
      p_tenant_id,
      'petshop',
      'tosa_higienica',
      'Tosa higiênica',
      'banho_tosa',
      0,
      30,
      'percentage',
      0,
      false,
      310,
      'scissors',
      now()
    ),
    (
      p_tenant_id,
      'petshop',
      'tosa_higienica_com_detalhes',
      'Tosa higiênica com detalhes',
      'banho_tosa',
      0,
      45,
      'percentage',
      0,
      false,
      320,
      'scissors',
      now()
    )
  on conflict (tenant_id, module_id, code) do update
  set group_type = 'banho_tosa',
      icon = 'scissors',
      updated_at = now();
end;
$$;

revoke all on function public.ensure_petshop_hygienic_grooming_services(uuid, text) from public;
grant execute on function public.ensure_petshop_hygienic_grooming_services(uuid, text)
  to service_role;

do $$
declare
  v_scope record;
begin
  for v_scope in
    select distinct settings.tenant_id, settings.module_id
    from public.settings settings
    where settings.tenant_id is not null
      and settings.module_id = 'petshop'
  loop
    perform public.ensure_petshop_hygienic_grooming_services(
      v_scope.tenant_id,
      v_scope.module_id
    );
  end loop;
end;
$$;

create or replace function public.ensure_petshop_hygienic_grooming_services_from_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.module_id = 'petshop' then
    perform public.ensure_petshop_hygienic_grooming_services(
      new.tenant_id,
      new.module_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ensure_petshop_hygienic_grooming_services on public.settings;
create trigger trg_ensure_petshop_hygienic_grooming_services
after insert or update of tenant_id, module_id on public.settings
for each row
execute function public.ensure_petshop_hygienic_grooming_services_from_settings();

notify pgrst, 'reload schema';

commit;
