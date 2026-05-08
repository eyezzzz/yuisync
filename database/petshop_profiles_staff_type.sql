begin;

alter table public.profiles
  add column if not exists staff_type text;

update public.profiles
set staff_type = 'funcionario'
where coalesce(staff_type, '') = '';

alter table public.profiles
  alter column staff_type set default 'funcionario';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_staff_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      drop constraint profiles_staff_type_check;
  end if;

  alter table public.profiles
    add constraint profiles_staff_type_check
    check (staff_type in ('funcionario', 'banho_tosa', 'veterinaria', 'motodog'));
exception
  when duplicate_object then
    null;
end;
$$;

create index if not exists idx_profiles_staff_type
  on public.profiles (staff_type);

commit;
