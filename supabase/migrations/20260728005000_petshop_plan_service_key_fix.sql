begin;

-- Classifica o beneficio pelo nome e codigo reais do servico. O grupo da agenda
-- "banho_tosa" nao pode participar da primeira classificacao, pois fazia todo
-- banho individual parecer um servico combinado de banho e tosa.
create or replace function public.petshop_plan_service_key(
  p_name text,
  p_code text,
  p_group text default null
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_service_text text := public.normalize_petshop_catalog_text(concat_ws(' ', p_name, p_code));
  v_group_text text := public.normalize_petshop_catalog_text(p_group);
begin
  if v_service_text ~ '(banho.*tosa|tosa.*banho)' then return 'banho_e_tosa'; end if;
  if v_service_text ~ 'banho' then return 'banho'; end if;
  if v_service_text ~ 'tosa' then return 'tosa'; end if;
  if v_service_text ~ 'vacina' then return 'vacina'; end if;
  if v_service_text ~ '(consulta|retorno)' then return 'consulta'; end if;

  -- O grupo serve apenas como fallback para cadastros antigos sem nome/codigo
  -- descritivo. Nunca transforma banho ou tosa individual em banho_e_tosa.
  if v_group_text = 'veterinaria' then return nullif(trim(p_code), ''); end if;
  return nullif(trim(p_code), '');
end;
$$;

-- Protege exatamente o caso observado em producao e os dois casos vizinhos.
do $$
begin
  if public.petshop_plan_service_key(
    'BANHO PET PORTE PEQUENO 0 a 10kg todas as pelagens',
    'banho_pet_porte_pequeno',
    'banho_tosa'
  ) <> 'banho' then
    raise exception 'Falha ao classificar banho individual como beneficio banho.';
  end if;

  if public.petshop_plan_service_key(
    'Tosa higienica porte pequeno',
    'tosa_higienica_pequeno',
    'banho_tosa'
  ) <> 'tosa' then
    raise exception 'Falha ao classificar tosa individual como beneficio tosa.';
  end if;

  if public.petshop_plan_service_key(
    'Banho e tosa porte pequeno',
    'banho_tosa_pequeno',
    'banho_tosa'
  ) <> 'banho_e_tosa' then
    raise exception 'Falha ao classificar servico combinado como banho_e_tosa.';
  end if;
end;
$$;

comment on function public.petshop_plan_service_key(text, text, text) is
  'Resolve a chave generica do plano pelo nome/codigo real do servico, sem confundir o grupo banho_tosa com servico combinado.';

commit;
