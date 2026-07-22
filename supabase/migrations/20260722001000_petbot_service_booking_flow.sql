-- PetBot service-booking business rules: services are paid after completion,
-- service transport is not product fulfillment, and WhatsApp appointments must
-- remain accepted by the source constraint.
begin;

alter table public.appointments
  alter column source set default 'manual';

alter table public.appointments
  drop constraint if exists appointments_source_check;

alter table public.appointments
  add constraint appointments_source_check
  check (source ~ '^[a-z0-9][a-z0-9_:-]{0,39}$');

create or replace function public.normalize_petbot_service_booking_sale()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.source = 'whatsapp' and new.fulfillment_type = 'servico' then
    -- A booking is not a paid sale. The payment method is collected only after
    -- the service is completed in the operational flow.
    new.payment_method := null;
    new.status := 'pendente';
    new.payment_status := 'a_receber';
    new.stock_reservation_expires_at := null;
    new.bot_engine_version := coalesce(new.bot_engine_version, 'petbot_agent_v3');
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_petbot_service_booking_sale on public.sales;
create trigger normalize_petbot_service_booking_sale
before insert on public.sales
for each row execute function public.normalize_petbot_service_booking_sale();

create or replace function public.normalize_petbot_service_delivery_payment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.source = 'whatsapp' and new.order_type = 'servico' then
    new.payment_status := 'a_receber';
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_petbot_service_delivery_payment on public.service_delivery_orders;
create trigger normalize_petbot_service_delivery_payment
before insert on public.service_delivery_orders
for each row execute function public.normalize_petbot_service_delivery_payment();

commit;
