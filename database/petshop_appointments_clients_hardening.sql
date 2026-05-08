begin;

alter table public.appointments
  add column if not exists client_id uuid;

create index if not exists idx_appointments_client_id
  on public.appointments (client_id);

create index if not exists idx_appointments_module_scheduled_at
  on public.appointments (module_id, scheduled_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_client_id_fkey'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_client_id_fkey
      foreign key (client_id)
      references public.clients(id)
      on delete cascade
      not valid;
  end if;
exception
  when duplicate_object then
    null;
end;
$$;

do $$
begin
  begin
    alter table public.appointments
      validate constraint appointments_client_id_fkey;
  exception
    when others then
      raise notice 'appointments_client_id_fkey ficou como NOT VALID. Revise clientes orfaos antes de validar novamente.';
  end;
end;
$$;

commit;
