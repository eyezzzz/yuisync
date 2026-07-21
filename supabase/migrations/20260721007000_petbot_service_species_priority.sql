-- PetBot: normaliza a espécie dos serviços comerciais para que o agente nunca
-- misture opções de gato e cachorro. A prioridade comercial de banho para cães
-- de até 10 kg fica no resolvedor do servidor; esta migração protege também a
-- revalidação transacional no banco e os novos cadastros.
begin;

create or replace function public.normalize_petshop_catalog_text(p_value text)
returns text
language sql
immutable
as $$
  select translate(
    lower(coalesce(p_value, '')),
    'áàãâäéèêëíìîïóòõôöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc'
  );
$$;

create or replace function public.infer_petbot_service_species(
  p_explicit_species text,
  p_species_target text,
  p_name text,
  p_category text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_explicit text := public.normalize_petshop_catalog_text(
    coalesce(nullif(trim(p_explicit_species), ''), nullif(trim(p_species_target), ''))
  );
  v_text text := public.normalize_petshop_catalog_text(
    concat_ws(' ', coalesce(p_name, ''), coalesce(p_category, ''))
  );
begin
  if v_explicit in ('dog', 'cao', 'caes', 'cachorro', 'cachorra', 'canino', 'canina') then
    return 'dog';
  end if;
  if v_explicit in ('cat', 'gato', 'gata', 'felino', 'felina') then
    return 'cat';
  end if;
  if v_explicit in ('other', 'outro', 'outra') then
    return 'other';
  end if;

  if v_text ~ '(^| )(gato|gata|gatos|gatas|felino|felina|felinos|felinas)( |$)' then
    return 'cat';
  end if;
  if v_text ~ '(^| )(cao|caes|cachorro|cachorra|cachorros|cachorras|canino|canina|caninos|caninas)( |$)' then
    return 'dog';
  end if;
  if v_text ~ '(^| )(banho|tosa)( |$)'
    and v_text ~ '(^| )pet( |$)'
    and v_text ~ '(^| )porte( |$)'
  then
    return 'dog';
  end if;

  return null;
end;
$$;

create or replace function public.apply_petbot_service_species_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_is_service boolean := false;
  v_species text;
begin
  new.bot_metadata := coalesce(new.bot_metadata, '{}'::jsonb);
  v_is_service := (
    public.normalize_petshop_catalog_text(new.bot_metadata->>'product_type') = 'servico'
    or public.normalize_petshop_catalog_text(new.category) in (
      'servico', 'banho', 'tosa', 'veterinaria'
    )
    or public.normalize_petshop_catalog_text(new.name) ~
      '(banho|tosa|consulta|vacina|exame|cirurg|hidrat|escovac|desembolo)'
  );

  if not v_is_service then
    return new;
  end if;

  v_species := public.infer_petbot_service_species(
    new.bot_metadata->>'species',
    new.species_target,
    new.name,
    new.category
  );

  if v_species is not null then
    new.bot_metadata := jsonb_set(new.bot_metadata, '{species}', to_jsonb(v_species), true);
  end if;
  return new;
end;
$$;

update public.products product
set bot_metadata = jsonb_set(
  coalesce(product.bot_metadata, '{}'::jsonb),
  '{species}',
  to_jsonb(public.infer_petbot_service_species(
    product.bot_metadata->>'species',
    product.species_target,
    product.name,
    product.category
  )),
  true
)
where (
    public.normalize_petshop_catalog_text(product.bot_metadata->>'product_type') = 'servico'
    or public.normalize_petshop_catalog_text(product.category) in (
      'servico', 'banho', 'tosa', 'veterinaria'
    )
    or public.normalize_petshop_catalog_text(product.name) ~
      '(banho|tosa|consulta|vacina|exame|cirurg|hidrat|escovac|desembolo)'
  )
  and public.infer_petbot_service_species(
    product.bot_metadata->>'species',
    product.species_target,
    product.name,
    product.category
  ) is not null
  and coalesce(product.bot_metadata->>'species', '') is distinct from
    public.infer_petbot_service_species(
      product.bot_metadata->>'species',
      product.species_target,
      product.name,
      product.category
    );

drop trigger if exists trg_apply_petbot_service_species_metadata on public.products;
create trigger trg_apply_petbot_service_species_metadata
before insert or update of name, category, species_target, bot_metadata
on public.products
for each row execute function public.apply_petbot_service_species_metadata();

commit;
