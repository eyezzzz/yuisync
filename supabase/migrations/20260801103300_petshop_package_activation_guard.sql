begin;

create or replace function public.validate_petshop_package_activation_benefits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.module_id <> 'petshop'
    or new.source <> 'package_activation'
    or coalesce(new.status, 'agendado') in ('cancelado', 'no_show')
  then
    return new;
  end if;

  if jsonb_typeof(coalesce(new.service_items, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(new.service_items, '[]'::jsonb)) = 0
  then
    raise exception 'Reserva recorrente sem servicos do pacote.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(new.service_items, '[]'::jsonb)) item
    where not coalesce(nullif(item->>'benefit_used', '')::boolean, false)
  ) then
    raise exception 'Todos os servicos da reserva recorrente precisam estar cobertos pelo pacote.';
  end if;

  return new;
end;
$$;

drop trigger if exists z_validate_petshop_package_activation_benefits on public.appointments;
create trigger z_validate_petshop_package_activation_benefits
before insert or update of service_items, source, status
on public.appointments
for each row execute function public.validate_petshop_package_activation_benefits();

comment on function public.validate_petshop_package_activation_benefits() is
  'Impede que uma recorrencia de pacote seja gravada parcialmente como atendimento avulso.';

commit;
