-- Standardize the editable PetBot service classification so each common breed
-- appears once, in one canonical grooming coat class. Spelling aliases remain
-- in application code and are not duplicated in products.bot_metadata.breed.
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

with presets(coat_type, breeds) as (
  values
    ('curto', '["bulldog frances", "bulldog ingles", "pug", "pinscher miniatura", "american pit bull terrier", "american staffordshire terrier", "staffordshire bull terrier", "american bully", "boxer", "doberman", "rottweiler", "cane corso", "dogo argentino", "dogue alemao", "fila brasileiro", "beagle", "basset hound", "shar pei", "boston terrier", "bull terrier", "terrier brasileiro", "jack russell terrier", "chihuahua", "dachshund", "dalmata", "weimaraner", "vizsla", "whippet", "greyhound", "rhodesian ridgeback"]'::jsonb),
    ('medio', '["poodle", "bichon frise", "schnauzer", "west highland white terrier", "scottish terrier", "fox terrier", "cao de agua portugues", "lagotto romagnolo", "labradoodle", "goldendoodle"]'::jsonb),
    ('longo', '["shih tzu", "yorkshire terrier", "lhasa apso", "maltes", "pequines", "cavalier king charles spaniel", "cocker spaniel ingles", "cocker spaniel americano", "papillon", "galgo afegao", "havanes", "biewer terrier", "setter irlandes", "setter ingles"]'::jsonb),
    ('duplo', '["spitz alemao", "golden retriever", "labrador retriever", "pastor alemao", "husky siberiano", "border collie", "chow chow", "akita", "shiba inu", "samoieda", "pastor australiano", "pastor de shetland", "collie de pelo longo", "welsh corgi", "boiadeiro australiano", "boiadeiro bernes", "terra nova", "sao bernardo", "malamute do alasca", "keeshond", "retriever da nova escocia"]'::jsonb)
), service_candidates as (
  select
    product.id,
    case
      when public.normalize_petshop_catalog_text(coalesce(product.bot_metadata->>'coat_type', '')) in ('curto', 'medio', 'longo', 'duplo', 'todas')
        then public.normalize_petshop_catalog_text(product.bot_metadata->>'coat_type')
      when public.normalize_petshop_catalog_text(product.name) ~ '(pelo|pelagem)[ ]+dupl' then 'duplo'
      when public.normalize_petshop_catalog_text(product.name) ~ '(pelo|pelagem)[ ]+long' then 'longo'
      when public.normalize_petshop_catalog_text(product.name) ~ '(pelo|pelagem)[ ]+medi' then 'medio'
      when public.normalize_petshop_catalog_text(product.name) ~ '(pelo|pelagem)[ ]+curt' then 'curto'
      when public.normalize_petshop_catalog_text(product.name) ~ '(todas as racas|todos os pelos|todas as pelagens|qualquer pelo)' then 'todas'
      else null
    end as resolved_coat_type
  from public.products product
  where product.active = true
    and (
      public.normalize_petshop_catalog_text(coalesce(product.bot_metadata->>'product_type', '')) = 'servico'
      or public.normalize_petshop_catalog_text(coalesce(product.category, '')) in ('servico', 'banho', 'tosa', 'banho e tosa')
      or public.normalize_petshop_catalog_text(product.name) ~ '(banho|tosa|desembolo|escovac|hidrat)'
    )
), resolved as (
  select
    candidate.id,
    candidate.resolved_coat_type,
    coalesce(preset.breeds, '[]'::jsonb) as preset_breeds
  from service_candidates candidate
  left join presets preset on preset.coat_type = candidate.resolved_coat_type
  where candidate.resolved_coat_type is not null
)
update public.products product
set bot_metadata = coalesce(product.bot_metadata, '{}'::jsonb) || jsonb_build_object(
  'product_type', 'servico',
  'species', case
    when public.normalize_petshop_catalog_text(coalesce(product.bot_metadata->>'species', '')) in ('dog', 'cat')
      then product.bot_metadata->>'species'
    else 'dog'
  end,
  'coat_type', resolved.resolved_coat_type,
  'breed', case when resolved.resolved_coat_type = 'todas' then '[]'::jsonb else resolved.preset_breeds end,
  'all_breeds', resolved.resolved_coat_type = 'todas',
  'classification_version', 3,
  'classification_source', 'yuisync_exclusive_breed_presets_v2'
),
updated_at = now()
from resolved
where product.id = resolved.id;

-- Defensive assertion: no canonical breed may be present in two coat classes.
do $$
declare
  duplicate_breed text;
begin
  with classified as (
    select
      product.bot_metadata->>'coat_type' as coat_type,
      jsonb_array_elements_text(
        case
          when jsonb_typeof(product.bot_metadata->'breed') = 'array' then product.bot_metadata->'breed'
          else '[]'::jsonb
        end
      ) as breed
    from public.products product
    where product.active = true
      and product.bot_metadata->>'classification_source' = 'yuisync_exclusive_breed_presets_v2'
  )
  select breed into duplicate_breed
  from classified
  group by breed
  having count(distinct coat_type) > 1
  limit 1;

  if duplicate_breed is not null then
    raise exception 'PetBot breed classification is not exclusive: %', duplicate_breed;
  end if;
end $$;

commit;
