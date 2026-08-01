begin;

create or replace function public.mark_petshop_appointment_reserved_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.module_id <> 'petshop'
    or new.subscription_benefit_status <> 'reserved'
    or jsonb_typeof(coalesce(new.subscription_benefits, '[]'::jsonb)) <> 'array'
  then
    return new;
  end if;

  select coalesce(jsonb_agg(
    case
      when coalesce(benefit->>'status', 'reserved') = 'reserved'
        then benefit || jsonb_build_object('accounting', 'reserved_ledger')
      else benefit
    end
  ), '[]'::jsonb)
  into new.subscription_benefits
  from jsonb_array_elements(coalesce(new.subscription_benefits, '[]'::jsonb)) benefit;

  return new;
end;
$$;

drop trigger if exists a9_mark_petshop_appointment_reserved_ledger on public.appointments;
create trigger a9_mark_petshop_appointment_reserved_ledger
before insert or update of service_items, subscription_id, subscription_benefit_used, subscription_benefits, subscription_benefit_status, client_id, transport_mode
on public.appointments
for each row execute function public.mark_petshop_appointment_reserved_ledger();

-- A migration anterior reconstroi reservas existentes antes deste trigger ser
-- criado. Marca esses snapshots sem alterar novamente os saldos.
update public.appointments appointment
set subscription_benefits = (
  select coalesce(jsonb_agg(
    case
      when coalesce(benefit->>'status', 'reserved') = 'reserved'
        then benefit || jsonb_build_object('accounting', 'reserved_ledger')
      else benefit
    end
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(appointment.subscription_benefits, '[]'::jsonb)) benefit
),
updated_at = now()
where appointment.module_id = 'petshop'
  and appointment.subscription_benefit_status = 'reserved';

comment on function public.mark_petshop_appointment_reserved_ledger() is
  'Marca reservas novas para impedir que backfills futuros as confundam com consumo legado.';

commit;
