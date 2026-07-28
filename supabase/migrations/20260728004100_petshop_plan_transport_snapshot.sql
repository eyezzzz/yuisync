begin;

create or replace function public.mark_petshop_transport_benefit_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transport_covered boolean := false;
begin
  if new.module_id <> 'petshop'
    or jsonb_typeof(coalesce(new.service_items, '[]'::jsonb)) <> 'array'
  then
    return new;
  end if;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(new.subscription_benefits, '[]'::jsonb)) benefit
    where benefit->>'kind' = 'transport'
      and coalesce(benefit->>'transport_mode', 'buscar_e_levar') = 'buscar_e_levar'
      and coalesce(benefit->>'status', new.subscription_benefit_status, 'reserved') in ('reserved', 'consumed')
  ) into v_transport_covered;

  select coalesce(
    jsonb_agg(
      (item - 'transport_benefit_used')
      || case
        when v_transport_covered then jsonb_build_object('transport_benefit_used', true)
        else '{}'::jsonb
      end
    ),
    '[]'::jsonb
  )
  into new.service_items
  from jsonb_array_elements(coalesce(new.service_items, '[]'::jsonb)) item;

  return new;
end;
$$;

drop trigger if exists c_mark_petshop_transport_benefit_snapshot on public.appointments;
create trigger c_mark_petshop_transport_benefit_snapshot
before insert or update of service_items, subscription_benefits, subscription_benefit_status, transport_mode
on public.appointments
for each row execute function public.mark_petshop_transport_benefit_snapshot();

comment on function public.mark_petshop_transport_benefit_snapshot() is
  'Marca no snapshot do servico quando a tarifa MotoDog buscar e levar foi abatida pelo pacote.';

commit;
