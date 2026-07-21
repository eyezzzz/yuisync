-- Backfill the editable PetBot classification on commercial bath/grooming
-- services. Weight remains authoritative; breed is used only to resolve the
-- operational coat class. Existing non-empty manual breed lists are preserved.
begin;

with presets(coat_type, breeds) as (
  values
    ('curto', '["bulldog frances", "buldogue frances", "french bulldog", "frenchie", "bulldog ingles", "buldogue ingles", "english bulldog", "pug", "pinscher miniatura", "pinscher", "miniature pinscher", "american pit bull terrier", "pit bull", "pitbull", "american staffordshire terrier", "amstaff", "staffordshire bull terrier", "staffbull", "staffie", "american bully", "bully", "boxer", "doberman", "dobermann", "rottweiler", "rott", "cane corso", "dogo argentino", "dogue alemao", "great dane", "fila brasileiro", "fila", "beagle", "basset hound", "basset", "shar pei", "boston terrier", "bull terrier", "terrier brasileiro", "fox paulistinha", "jack russell de pelo curto", "jack russell pelo curto", "jack russell smooth coat", "chihuahua de pelo curto", "chihuahua pelo curto", "smooth coat chihuahua", "short haired chihuahua", "dachshund de pelo curto", "dachshund pelo curto", "teckel de pelo curto", "salsicha de pelo curto", "dalmata", "dalmatian", "weimaraner", "vizsla", "braco hungaro", "whippet", "greyhound", "galgo ingles", "rhodesian ridgeback", "ridgeback"]'::jsonb),
    ('medio', '["poodle", "poodle toy", "poodle miniatura", "poodle medio", "poodle standard", "poodle gigante", "bichon frise", "schnauzer", "schnauzer miniatura", "schnauzer standard", "schnauzer gigante", "west highland white terrier", "westie", "scottish terrier", "terrier escoces", "scottie", "fox terrier de pelo duro", "wire fox terrier", "dachshund de pelo duro", "dachshund pelo duro", "teckel de pelo duro", "salsicha de pelo duro", "jack russell de pelo duro", "jack russell pelo duro", "jack russell rough coat", "jack russell broken coat", "cao de agua portugues", "portuguese water dog", "lagotto romagnolo", "lagotto", "labradoodle", "goldendoodle"]'::jsonb),
    ('longo', '["shih tzu", "shi tzu", "shihtzu", "shitzu", "yorkshire terrier", "yorkshire", "york", "lhasa apso", "lhasa", "maltes", "maltese", "pequines", "pekingese", "cavalier king charles spaniel", "cavalier king charles", "cavalier", "cocker spaniel ingles", "cocker ingles", "english cocker spaniel", "cocker spaniel americano", "cocker americano", "american cocker spaniel", "papillon", "spaniel anao continental", "galgo afegao", "afghan hound", "havanes", "havanese", "bichon havanes", "biewer terrier", "biewer", "setter irlandes", "irish setter", "setter ingles", "english setter", "chihuahua de pelo longo", "chihuahua pelo longo", "long haired chihuahua", "dachshund de pelo longo", "dachshund pelo longo", "teckel de pelo longo", "salsicha de pelo longo"]'::jsonb),
    ('duplo', '["spitz alemao", "spitz", "lulu da pomerania", "pomerania", "pomeranian", "spitz anao", "golden retriever", "golden", "labrador retriever", "labrador", "lab", "pastor alemao", "german shepherd", "husky siberiano", "husky", "siberian husky", "border collie", "border", "chow chow", "chow", "akita", "akita inu", "akita americano", "american akita", "shiba inu", "shiba", "samoieda", "samoyed", "pastor australiano", "australian shepherd", "aussie", "pastor de shetland", "shetland sheepdog", "sheltie", "collie de pelo longo", "rough collie", "welsh corgi", "corgi", "corgi pembroke", "pembroke welsh corgi", "corgi cardigan", "cardigan welsh corgi", "boiadeiro australiano", "australian cattle dog", "blue heeler", "red heeler", "boiadeiro bernes", "bernese mountain dog", "bernese", "terra nova", "newfoundland", "sao bernardo", "saint bernard", "malamute do alasca", "malamute", "alaskan malamute", "keeshond", "spitz lobo", "wolfspitz", "retriever da nova escocia", "nova scotia duck tolling retriever", "toller"]'::jsonb)
), service_candidates as (
  select
    product.id,
    product.bot_metadata,
    public.normalize_petshop_catalog_text(product.name) as normalized_name,
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
      or public.normalize_petshop_catalog_text(coalesce(product.category, '')) = 'servico'
    )
), resolved as (
  select
    candidate.id,
    candidate.bot_metadata,
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
  'classification_version', 2,
  'classification_source', 'yuisync_common_breed_presets_v1'
),
updated_at = now()
from resolved
where product.id = resolved.id
  and (
    product.bot_metadata->>'classification_source' = 'yuisync_common_breed_presets_v1'
    or product.bot_metadata->'breed' is null
    or jsonb_typeof(product.bot_metadata->'breed') <> 'array'
    or jsonb_array_length(product.bot_metadata->'breed') = 0
  );

commit;
