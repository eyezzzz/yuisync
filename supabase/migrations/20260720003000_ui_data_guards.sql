begin;

create or replace function public.enforce_booking_motodog_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  configured_fee numeric := 0;
begin
  new.need_motodog := coalesce(new.need_motodog, false) or coalesce(new.transport_mode, '') = 'pickup';
  new.transport_mode := case when new.need_motodog then 'pickup' else 'dropoff' end;

  if new.need_motodog then
    select coalesce(
      (select (option->>'fee')::numeric
       from jsonb_array_elements(coalesce(settings.pet_transport_options, '[]'::jsonb)) option
       where option->>'id' = 'somente_buscar' and coalesce((option->>'active')::boolean, true)
       limit 1),
      settings.pet_transport_fee,
      0
    ) into configured_fee
    from public.settings settings
    where settings.tenant_id = new.tenant_id and settings.module_id = new.module_id
    limit 1;
    new.motodog_fee := coalesce(configured_fee, 0);
  else
    new.motodog_fee := 0;
    new.pickup_address := null;
    new.pickup_neighborhood := null;
    new.pickup_city := null;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_booking_motodog_fee on public.petshop_growth_booking_requests;
create trigger enforce_booking_motodog_fee
before insert or update of transport_mode, need_motodog, motodog_fee
on public.petshop_growth_booking_requests
for each row execute function public.enforce_booking_motodog_fee();

commit;
