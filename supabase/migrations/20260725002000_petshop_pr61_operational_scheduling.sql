begin;

alter table public.settings
  add column if not exists veterinary_name text not null default 'Dra. Taina Campos',
  add column if not exists veterinary_business_hours jsonb not null default '{"1":[{"open":"13:00","close":"18:00"}],"2":[{"open":"13:00","close":"18:00"}],"3":[{"open":"13:00","close":"18:00"}],"4":[{"open":"13:00","close":"18:00"}],"5":[{"open":"13:00","close":"18:00"}],"6":[],"7":[]}'::jsonb,
  add column if not exists petshop_operational_staff jsonb not null default '[{"key":"esteticista-1","name":"Esteticista 1","active":true},{"key":"esteticista-2","name":"Esteticista 2","active":true}]'::jsonb,
  add column if not exists petshop_service_durations jsonb not null default '{"small":{"min_weight_kg":0,"max_weight_kg":9.99,"bath_min":40,"machine_grooming_min":90,"scissor_grooming_min":120},"medium":{"min_weight_kg":10,"max_weight_kg":21.99,"bath_min":60,"machine_grooming_min":120,"scissor_grooming_min":150}}'::jsonb,
  add column if not exists appointment_reminder_enabled boolean not null default false,
  add column if not exists appointment_reminder_lead_min integer not null default 60,
  add column if not exists appointment_reminder_template_name text not null default 'appointment_arrival_reminder';

alter table public.settings drop constraint if exists settings_appointment_reminder_lead_min_check;
alter table public.settings add constraint settings_appointment_reminder_lead_min_check
  check (appointment_reminder_lead_min between 30 and 60);

update public.settings
set petbot_booking_capacity = greatest(2, coalesce(petbot_booking_capacity, 1))
where module_id = 'petshop';

alter table public.appointments
  add column if not exists responsible_staff_key text,
  add column if not exists responsible_staff_name text;

create index if not exists appointments_tenant_responsible_schedule_idx
  on public.appointments (tenant_id, module_id, responsible_staff_key, scheduled_at)
  where responsible_staff_key is not null;

comment on column public.appointments.responsible_staff_key is
  'Identificador operacional configurado em settings.petshop_operational_staff; não representa login ou profile.';
comment on column public.appointments.responsible_staff_name is
  'Snapshot editável do nome operacional responsável pelo serviço.';

commit;
