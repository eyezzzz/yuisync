begin;

-- Faixa de peso opcional por serviço. Quando vazia, a Agenda continua aceitando
-- qualquer peso e pode usar a indicação de porte presente no nome como fallback.
alter table public.petshop_services
  add column if not exists min_weight_kg numeric(7,2),
  add column if not exists max_weight_kg numeric(7,2);

alter table public.petshop_services
  drop constraint if exists petshop_services_min_weight_kg_check,
  drop constraint if exists petshop_services_max_weight_kg_check,
  drop constraint if exists petshop_services_weight_range_check;

alter table public.petshop_services
  add constraint petshop_services_min_weight_kg_check
    check (min_weight_kg is null or min_weight_kg >= 0),
  add constraint petshop_services_max_weight_kg_check
    check (max_weight_kg is null or max_weight_kg >= 0),
  add constraint petshop_services_weight_range_check
    check (
      min_weight_kg is null
      or max_weight_kg is null
      or max_weight_kg >= min_weight_kg
    );

comment on column public.petshop_services.min_weight_kg is
  'Peso mínimo opcional do pet para exibir/usar o serviço na Agenda.';
comment on column public.petshop_services.max_weight_kg is
  'Peso máximo opcional do pet para exibir/usar o serviço na Agenda.';

-- Migração conservadora dos nomes de porte já existentes. Serviços genéricos
-- (escovação, hidratação, tosa higiênica etc.) permanecem sem faixa e continuam
-- disponíveis para qualquer peso. As faixas podem ser ajustadas depois na aba
-- Serviços sem precisar renomear o item.
update public.petshop_services
set min_weight_kg = null,
    max_weight_kg = 5,
    updated_at = now()
where module_id = 'petshop'
  and group_type = 'banho_tosa'
  and min_weight_kg is null
  and max_weight_kg is null
  and public.normalize_petshop_catalog_text(coalesce(name, '') || ' ' || coalesce(code, ''))
      ~ '(^| )(porte (mini|micro)|(mini|micro) porte)( |$)';

update public.petshop_services
set min_weight_kg = null,
    max_weight_kg = 9.99,
    updated_at = now()
where module_id = 'petshop'
  and group_type = 'banho_tosa'
  and min_weight_kg is null
  and max_weight_kg is null
  and public.normalize_petshop_catalog_text(coalesce(name, '') || ' ' || coalesce(code, ''))
      ~ '(^| )(porte pequen[a-z]*|pequen[a-z]* porte)( |$)';

update public.petshop_services
set min_weight_kg = 10,
    max_weight_kg = 19.99,
    updated_at = now()
where module_id = 'petshop'
  and group_type = 'banho_tosa'
  and min_weight_kg is null
  and max_weight_kg is null
  and public.normalize_petshop_catalog_text(coalesce(name, '') || ' ' || coalesce(code, ''))
      ~ '(^| )(porte medi[a-z]*|medi[a-z]* porte)( |$)';

update public.petshop_services
set min_weight_kg = 20,
    max_weight_kg = 39.99,
    updated_at = now()
where module_id = 'petshop'
  and group_type = 'banho_tosa'
  and min_weight_kg is null
  and max_weight_kg is null
  and public.normalize_petshop_catalog_text(coalesce(name, '') || ' ' || coalesce(code, ''))
      ~ '(^| )(porte grande|grande porte)( |$)';

update public.petshop_services
set min_weight_kg = 40,
    max_weight_kg = null,
    updated_at = now()
where module_id = 'petshop'
  and group_type = 'banho_tosa'
  and min_weight_kg is null
  and max_weight_kg is null
  and public.normalize_petshop_catalog_text(coalesce(name, '') || ' ' || coalesce(code, ''))
      ~ '(^| )(porte (gigante|extra grande)|(gigante|extra grande) porte)( |$)';

-- Proteção no banco: além do filtro visual da Agenda, uma gravação direta não
-- pode criar/trocar um serviço para uma faixa incompatível quando o pet possui
-- peso cadastrado. Atualizações administrativas que não mudam pet/serviço não
-- são bloqueadas, preservando históricos antigos.
create or replace function public.validate_petshop_appointment_service_weight()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_weight_text text;
  v_weight numeric;
  v_code text;
  v_service record;
  v_service_text text;
  v_min_weight numeric;
  v_max_weight numeric;
begin
  if coalesce(new.module_id, '') <> 'petshop' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.client_id is not distinct from old.client_id
      and new.pet_id is not distinct from old.pet_id
      and new.service_type is not distinct from old.service_type
      and new.service_items is not distinct from old.service_items
    then
      return new;
    end if;
  end if;

  select replace(trim(coalesce(client.details->>'weight_kg', '')), ',', '.')
  into v_weight_text
  from public.clients client
  where client.id = coalesce(new.client_id, new.pet_id)
    and client.tenant_id = new.tenant_id
    and client.module_id = new.module_id
  limit 1;

  if coalesce(v_weight_text, '') ~ '^[0-9]+([.][0-9]+)?$' then
    v_weight := v_weight_text::numeric;
  else
    select pet.weight_kg
    into v_weight
    from public.pets pet
    where pet.id = coalesce(new.pet_id, new.client_id)
      and pet.tenant_id = new.tenant_id
      and pet.module_id = new.module_id
    limit 1;
  end if;

  if v_weight is null then
    return new;
  end if;

  for v_code in
    select distinct requested.code
    from (
      select nullif(trim(coalesce(item->>'code', item->>'service_type')), '') as code
      from jsonb_array_elements(
        case
          when jsonb_typeof(coalesce(new.service_items, '[]'::jsonb)) = 'array'
            then coalesce(new.service_items, '[]'::jsonb)
          else '[]'::jsonb
        end
      ) item

      union

      select nullif(trim(new.service_type), '')
    ) requested
    where requested.code is not null
  loop
    select
      service.name,
      service.code,
      service.min_weight_kg,
      service.max_weight_kg
    into v_service
    from public.petshop_services service
    where service.tenant_id = new.tenant_id
      and service.module_id = new.module_id
      and service.code = v_code
    limit 1;

    if not found then
      continue;
    end if;

    v_min_weight := v_service.min_weight_kg;
    v_max_weight := v_service.max_weight_kg;

    -- Para novos serviços ainda sem faixa gravada, mantém no banco o mesmo
    -- fallback por nome usado pela interface.
    if v_min_weight is null and v_max_weight is null then
      v_service_text := public.normalize_petshop_catalog_text(
        coalesce(v_service.name, '') || ' ' || coalesce(v_service.code, '')
      );

      if v_service_text ~ '(^| )(porte (mini|micro)|(mini|micro) porte)( |$)' then
        v_max_weight := 5;
      elsif v_service_text ~ '(^| )(porte pequen[a-z]*|pequen[a-z]* porte)( |$)' then
        v_max_weight := 9.99;
      elsif v_service_text ~ '(^| )(porte medi[a-z]*|medi[a-z]* porte)( |$)' then
        v_min_weight := 10;
        v_max_weight := 19.99;
      elsif v_service_text ~ '(^| )(porte grande|grande porte)( |$)' then
        v_min_weight := 20;
        v_max_weight := 39.99;
      elsif v_service_text ~ '(^| )(porte (gigante|extra grande)|(gigante|extra grande) porte)( |$)' then
        v_min_weight := 40;
      end if;
    end if;

    if (v_min_weight is not null and v_weight < v_min_weight)
      or (v_max_weight is not null and v_weight > v_max_weight)
    then
      raise exception 'Serviço "%" não é compatível com o peso cadastrado do pet (% kg).',
        coalesce(v_service.name, v_code), v_weight;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_validate_petshop_appointment_service_weight
on public.appointments;

create trigger trg_validate_petshop_appointment_service_weight
before insert or update
on public.appointments
for each row
execute function public.validate_petshop_appointment_service_weight();

notify pgrst, 'reload schema';

commit;
