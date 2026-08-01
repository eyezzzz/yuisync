begin;

alter table public.appointments
  add column if not exists grooming_machine_no integer;

alter table public.appointments
  drop constraint if exists appointments_grooming_machine_no_check;

alter table public.appointments
  add constraint appointments_grooming_machine_no_check
  check (grooming_machine_no is null or grooming_machine_no in (4, 7, 10));

comment on column public.appointments.grooming_machine_no is
  'Numero opcional da maquina usada no atendimento de tosa. Valores operacionais: 4, 7 ou 10.';

commit;
