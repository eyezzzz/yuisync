-- =============================================================================
-- YuiSync - Petshop save/schema hardening
-- =============================================================================
-- Corrige pontos em que o schema antigo bloqueia fluxos novos:
-- 1) servicos editaveis da agenda nao podem ficar presos a uma lista antiga;
-- 2) clientes do petshop precisam ter espelho em pets para FK de appointments.pet_id.
-- =============================================================================

begin;

alter table public.appointments
  drop constraint if exists appointments_service_type_check;

alter table public.appointments
  drop constraint if exists appointments_service_type_not_blank;

alter table public.appointments
  add constraint appointments_service_type_not_blank
  check (length(trim(coalesce(service_type, ''))) > 0);

create or replace function public.ensure_petshop_pet_from_client(p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.clients%rowtype;
  v_species text;
  v_pet_name text;
begin
  select *
    into v_client
  from public.clients
  where id = p_client_id;

  if not found then
    raise exception 'Cliente % nao encontrado para sincronizar pet.', p_client_id;
  end if;

  v_species := lower(coalesce(v_client.details->>'species', 'other'));
  v_species := case
    when v_species in ('dog', 'cachorro', 'cao', 'cão', 'canino') then 'dog'
    when v_species in ('cat', 'gato', 'gata', 'felino') then 'cat'
    when v_species in ('bird', 'passaro', 'pássaro', 'ave') then 'bird'
    when v_species in ('rabbit', 'coelho') then 'rabbit'
    when v_species in ('fish', 'peixe') then 'fish'
    else 'other'
  end;

  v_pet_name := nullif(trim(coalesce(v_client.details->>'pet_name', '')), '');

  insert into public.pets (
    id,
    module_id,
    owner_name,
    owner_cpf,
    phone,
    email,
    owner_address,
    owner_neighborhood,
    owner_city,
    pet_name,
    species,
    breed,
    notes,
    updated_at
  )
  values (
    v_client.id,
    coalesce(v_client.module_id, 'petshop'),
    coalesce(nullif(trim(v_client.name), ''), 'Cliente'),
    nullif(trim(coalesce(v_client.document, '')), ''),
    coalesce(nullif(trim(v_client.phone), ''), 'sem telefone'),
    nullif(trim(coalesce(v_client.email, '')), ''),
    nullif(trim(coalesce(v_client.address, '')), ''),
    nullif(trim(coalesce(v_client.neighborhood, '')), ''),
    nullif(trim(coalesce(v_client.city, '')), ''),
    coalesce(v_pet_name, nullif(trim(v_client.name), ''), 'Pet'),
    v_species,
    nullif(trim(coalesce(v_client.details->>'breed', '')), ''),
    nullif(trim(coalesce(v_client.notes, '')), ''),
    now()
  )
  on conflict (id) do update
    set module_id = excluded.module_id,
        owner_name = excluded.owner_name,
        owner_cpf = excluded.owner_cpf,
        phone = excluded.phone,
        email = excluded.email,
        owner_address = excluded.owner_address,
        owner_neighborhood = excluded.owner_neighborhood,
        owner_city = excluded.owner_city,
        pet_name = excluded.pet_name,
        species = excluded.species,
        breed = excluded.breed,
        notes = excluded.notes,
        updated_at = now();

  return v_client.id;
end;
$$;

grant execute on function public.ensure_petshop_pet_from_client(uuid) to authenticated, service_role;

insert into public.pets (
  id,
  module_id,
  owner_name,
  owner_cpf,
  phone,
  email,
  owner_address,
  owner_neighborhood,
  owner_city,
  pet_name,
  species,
  breed,
  notes,
  updated_at
)
select
  c.id,
  coalesce(c.module_id, 'petshop'),
  coalesce(nullif(trim(c.name), ''), 'Cliente'),
  nullif(trim(coalesce(c.document, '')), ''),
  coalesce(nullif(trim(c.phone), ''), 'sem telefone'),
  nullif(trim(coalesce(c.email, '')), ''),
  nullif(trim(coalesce(c.address, '')), ''),
  nullif(trim(coalesce(c.neighborhood, '')), ''),
  nullif(trim(coalesce(c.city, '')), ''),
  coalesce(nullif(trim(coalesce(c.details->>'pet_name', '')), ''), nullif(trim(c.name), ''), 'Pet'),
  case
    when lower(coalesce(c.details->>'species', 'other')) in ('dog', 'cachorro', 'cao', 'cão', 'canino') then 'dog'
    when lower(coalesce(c.details->>'species', 'other')) in ('cat', 'gato', 'gata', 'felino') then 'cat'
    when lower(coalesce(c.details->>'species', 'other')) in ('bird', 'passaro', 'pássaro', 'ave') then 'bird'
    when lower(coalesce(c.details->>'species', 'other')) in ('rabbit', 'coelho') then 'rabbit'
    when lower(coalesce(c.details->>'species', 'other')) in ('fish', 'peixe') then 'fish'
    else 'other'
  end,
  nullif(trim(coalesce(c.details->>'breed', '')), ''),
  nullif(trim(coalesce(c.notes, '')), ''),
  now()
from public.clients c
where c.module_id = 'petshop'
on conflict (id) do update
  set module_id = excluded.module_id,
      owner_name = excluded.owner_name,
      owner_cpf = excluded.owner_cpf,
      phone = excluded.phone,
      email = excluded.email,
      owner_address = excluded.owner_address,
      owner_neighborhood = excluded.owner_neighborhood,
      owner_city = excluded.owner_city,
      pet_name = excluded.pet_name,
      species = excluded.species,
      breed = excluded.breed,
      notes = excluded.notes,
      updated_at = now();

commit;
