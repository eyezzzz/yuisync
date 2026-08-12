begin;

-- As novas faixas operacionais usam três casas decimais para que as viradas
-- 10,099 -> 10,100 e 22,100 -> 22,101 não sofram arredondamento no banco.
alter table public.petshop_services
  alter column min_weight_kg type numeric(8,3)
    using min_weight_kg::numeric(8,3),
  alter column max_weight_kg type numeric(8,3)
    using max_weight_kg::numeric(8,3);

-- Padronização solicitada para os serviços por porte:
-- pequeno: 0 a 10,099 kg
-- médio: 10,100 a 22,100 kg
-- grande: 22,101 a 40,000 kg
--
-- Serviços genéricos e faixas de mini/micro/gigante permanecem inalterados.
update public.petshop_services
set min_weight_kg = 0.000,
    max_weight_kg = 10.099,
    updated_at = now()
where module_id = 'petshop'
  and group_type = 'banho_tosa'
  and public.normalize_petshop_catalog_text(coalesce(name, '') || ' ' || coalesce(code, ''))
      ~ '(^| )(porte pequen[a-z]*|pequen[a-z]* porte)( |$)';

update public.petshop_services
set min_weight_kg = 10.100,
    max_weight_kg = 22.100,
    updated_at = now()
where module_id = 'petshop'
  and group_type = 'banho_tosa'
  and public.normalize_petshop_catalog_text(coalesce(name, '') || ' ' || coalesce(code, ''))
      ~ '(^| )(porte medi[a-z]*|medi[a-z]* porte)( |$)';

update public.petshop_services
set min_weight_kg = 22.101,
    max_weight_kg = 40.000,
    updated_at = now()
where module_id = 'petshop'
  and group_type = 'banho_tosa'
  and public.normalize_petshop_catalog_text(coalesce(name, '') || ' ' || coalesce(code, ''))
      ~ '(^| )(porte grande|grande porte)( |$)';

-- Mantém a mesma regra para novos serviços que forem criados sem uma faixa
-- manual. Se o usuário preencher mínimo/máximo explicitamente, a configuração
-- manual continua tendo prioridade.
create or replace function public.apply_petshop_standard_service_weight_band()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_text text;
begin
  if coalesce(new.module_id, '') <> 'petshop'
    or coalesce(new.group_type, '') <> 'banho_tosa'
    or new.min_weight_kg is not null
    or new.max_weight_kg is not null
  then
    return new;
  end if;

  v_service_text := public.normalize_petshop_catalog_text(
    coalesce(new.name, '') || ' ' || coalesce(new.code, '')
  );

  if v_service_text ~ '(^| )(porte pequen[a-z]*|pequen[a-z]* porte)( |$)' then
    new.min_weight_kg := 0.000;
    new.max_weight_kg := 10.099;
  elsif v_service_text ~ '(^| )(porte medi[a-z]*|medi[a-z]* porte)( |$)' then
    new.min_weight_kg := 10.100;
    new.max_weight_kg := 22.100;
  elsif v_service_text ~ '(^| )(porte grande|grande porte)( |$)' then
    new.min_weight_kg := 22.101;
    new.max_weight_kg := 40.000;
  end if;

  return new;
end;
$$;

drop trigger if exists a_apply_petshop_standard_service_weight_band
on public.petshop_services;

create trigger a_apply_petshop_standard_service_weight_band
before insert or update of name, code, group_type, min_weight_kg, max_weight_kg
on public.petshop_services
for each row
execute function public.apply_petshop_standard_service_weight_band();

comment on function public.apply_petshop_standard_service_weight_band() is
  'Preenche as faixas padrão de peso pequeno/médio/grande quando o serviço não possui faixa manual.';

notify pgrst, 'reload schema';

commit;
