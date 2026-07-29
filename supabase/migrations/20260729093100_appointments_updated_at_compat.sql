begin;

alter table public.appointments
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_appointment_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at
before update on public.appointments
for each row execute function public.set_appointment_updated_at();

commit;
