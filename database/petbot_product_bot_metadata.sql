-- YuiSync - PetBot product metadata
-- Adds an operational taxonomy for the bot without changing the visual product category.

alter table public.products
  add column if not exists bot_metadata jsonb not null default '{}'::jsonb;

create or replace function public.petbot_normalize_text(p_value text)
returns text
language sql
immutable
as $$
  select trim(translate(lower(coalesce(p_value, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  ));
$$;

create or replace function public.petbot_infer_product_metadata(
  p_name text,
  p_category text,
  p_description text default null,
  p_species_target text default null
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_text text := public.petbot_normalize_text(concat_ws(' ', p_name, p_category, p_description, p_species_target));
  v_category text := public.petbot_normalize_text(p_category);
  v_product_type text := 'outro';
  v_species text := 'both';
  v_age text := 'any';
  v_size text := 'any';
  v_brand text := '';
  v_breed text[] := array[]::text[];
  v_is_bulk boolean := false;
  v_package_match text[];
  v_package_kg numeric := null;
  v_unit text := 'un';
begin
  if v_text ~ 'granel|a granel|kg solto' then
    v_product_type := 'granel';
    v_is_bulk := true;
    v_unit := 'kg';
  elsif v_text ~ '\ybanho\y|\ytosa\y|consulta|vacina|cirurg|biopsia|exame|ultrassom|leishmaniose|operatorio|proteina' or v_category ~ 'tosa|servico' then
    v_product_type := 'servico';
  elsif v_text ~ 'areia|higienica' then
    v_product_type := 'areia';
  elsif v_text ~ 'sache|sach[eê]' then
    v_product_type := 'sache';
  elsif v_text ~ 'petisco|bifinho|ossinho|dental|snack' then
    v_product_type := 'petisco';
  elsif v_text ~ 'antipulga|pulga|carrapato|bravecto|nexgard|simparic|frontline' then
    v_product_type := 'antipulgas';
  elsif v_text ~ 'shampoo|condicionador|perfume|higiene|tapete|banheira|sept clean' or v_category ~ 'banho|higiene' then
    v_product_type := 'higiene';
  elsif v_text ~ 'coleira|guia|peitoral|comedouro|bebedouro|caixa|transporte|alimentador|arranhador|cama|almofad|bolsa|casa para pet|casinha|bandeja|focinheira' or v_category ~ 'acessorio|aquarismo|jardinagem' then
    v_product_type := 'acessorio';
  elsif v_text ~ 'brinquedo|brinq|bolinha|bola |mordedor|pelucia' or v_category ~ 'brinquedo' then
    v_product_type := 'brinquedo';
  elsif v_text ~ 'medicamento|remedio|vermifugo|suplemento' then
    v_product_type := 'medicamento';
  elsif v_category = 'racao'
     or v_text ~ 'racao|racoes|alimento completo|premier|royal canin|formula natural|golden|pedigree|whiskas|special dog|special cat|gran plus|quatree' then
    v_product_type := 'racao';
  end if;

  if v_text ~ 'gato|gatos|felino|cat\b|special cat|whiskas|kitekat' then
    v_species := 'cat';
  elsif v_text ~ '\bcao\b|caes|cachorro|canino|dog\b|racas pequenas|racas medias|racas grandes|special dog|pedigree' then
    v_species := 'dog';
  end if;

  if v_text ~ 'filhote|puppy|kitten' then
    v_age := 'filhote';
  elsif v_text ~ 'castrad' then
    v_age := 'castrado';
  elsif v_text ~ 'senior|idoso' then
    v_age := 'senior';
  elsif v_text ~ 'adult' then
    v_age := 'adulto';
  end if;

  if v_text ~ 'shih tzu|shihtzu|shitzu' then v_breed := array_append(v_breed, 'Shih Tzu'); v_size := 'pequeno'; end if;
  if v_text ~ 'yorkshire' then v_breed := array_append(v_breed, 'Yorkshire'); v_size := 'pequeno'; end if;
  if v_text ~ 'pinscher' then v_breed := array_append(v_breed, 'Pinscher'); v_size := 'pequeno'; end if;
  if v_text ~ 'poodle' then v_breed := array_append(v_breed, 'Poodle'); v_size := 'pequeno'; end if;
  if v_text ~ 'lhasa' then v_breed := array_append(v_breed, 'Lhasa Apso'); v_size := 'pequeno'; end if;
  if v_text ~ 'maltes' then v_breed := array_append(v_breed, 'Maltes'); v_size := 'pequeno'; end if;
  if v_text ~ 'spitz' then v_breed := array_append(v_breed, 'Spitz'); v_size := 'pequeno'; end if;
  if v_text ~ 'pug' then v_breed := array_append(v_breed, 'Pug'); v_size := 'pequeno'; end if;
  if v_text ~ 'bulldog frances' then v_breed := array_append(v_breed, 'Bulldog Frances'); v_size := 'pequeno'; end if;
  if v_text ~ 'golden' then v_breed := array_append(v_breed, 'Golden Retriever'); v_size := 'grande'; end if;
  if v_text ~ 'labrador' then v_breed := array_append(v_breed, 'Labrador'); v_size := 'grande'; end if;
  if v_text ~ 'rottweiler' then v_breed := array_append(v_breed, 'Rottweiler'); v_size := 'grande'; end if;
  if v_text ~ 'pastor alemao' then v_breed := array_append(v_breed, 'Pastor Alemao'); v_size := 'grande'; end if;
  if v_text ~ 'pitbull' then v_breed := array_append(v_breed, 'Pitbull'); v_size := 'grande'; end if;
  if v_text ~ 'border collie' then v_breed := array_append(v_breed, 'Border Collie'); v_size := 'medio'; end if;
  if v_text ~ 'beagle' then v_breed := array_append(v_breed, 'Beagle'); v_size := 'medio'; end if;
  if v_text ~ 'cocker' then v_breed := array_append(v_breed, 'Cocker'); v_size := 'medio'; end if;

  if v_size = 'any' and v_text ~ 'racas pequenas|raca pequena|porte pequeno|\brp\b|pequen|mini' then v_size := 'pequeno'; end if;
  if v_size = 'any' and v_text ~ 'racas medias|raca media|porte medio|medio|media' then v_size := 'medio'; end if;
  if v_size = 'any' and v_text ~ 'racas grandes|raca grande|porte grande|grande' then v_size := 'grande'; end if;

  if v_text like '%royal canin%' then v_brand := 'royal canin';
  elsif v_text like '%formula natural%' then v_brand := 'formula natural';
  elsif v_text like '%special dog%' then v_brand := 'special dog';
  elsif v_text like '%special cat%' then v_brand := 'special cat';
  elsif v_text like '%gran plus%' then v_brand := 'gran plus';
  elsif v_text like '%premier%' then v_brand := 'premier';
  elsif v_text like '%golden%' then v_brand := 'golden';
  elsif v_text like '%pedigree%' then v_brand := 'pedigree';
  elsif v_text like '%whiskas%' then v_brand := 'whiskas';
  elsif v_text like '%quatree%' then v_brand := 'quatree';
  elsif v_text like '%bravecto%' then v_brand := 'bravecto';
  elsif v_text like '%nexgard%' then v_brand := 'nexgard';
  elsif v_text like '%simparic%' then v_brand := 'simparic';
  elsif v_text like '%frontline%' then v_brand := 'frontline';
  elsif v_text like '%kitekat%' then v_brand := 'kitekat';
  end if;

  v_package_match := regexp_match(v_text, '([0-9]+(?:[,.][0-9]+)?)\s*kg');
  if v_package_match is not null and not v_is_bulk then
    v_package_kg := replace(v_package_match[1], ',', '.')::numeric;
  end if;

  return jsonb_build_object(
    'product_type', v_product_type,
    'species', v_species,
    'age', v_age,
    'size', v_size,
    'breed', to_jsonb(v_breed),
    'brand', v_brand,
    'package_kg', v_package_kg,
    'is_bulk', v_is_bulk,
    'unit', v_unit,
    'search_key', concat_ws('/', v_product_type, nullif(v_brand, ''), v_species, v_size, v_age, nullif(array_to_string(v_breed, '/'), ''), case when v_package_kg is not null then v_package_kg::text || 'kg' end, case when v_is_bulk then 'granel' end),
    'search_aliases', to_jsonb(array_remove(array[v_product_type, v_brand, v_species, v_size, v_age, array_to_string(v_breed, ' ')], '')),
    'classification_version', 1
  );
end;
$$;

update public.products
set bot_metadata = coalesce(bot_metadata, '{}'::jsonb) || public.petbot_infer_product_metadata(name, category, description, species_target),
    updated_at = now()
where active is distinct from false;

create index if not exists idx_products_bot_metadata_gin
  on public.products using gin (bot_metadata);

create index if not exists idx_products_petbot_type
  on public.products (tenant_id, module_id, active, ((bot_metadata->>'product_type')));

create index if not exists idx_products_petbot_species_age
  on public.products (tenant_id, module_id, active, ((bot_metadata->>'species')), ((bot_metadata->>'age')));

create index if not exists idx_products_petbot_brand
  on public.products (tenant_id, module_id, active, ((bot_metadata->>'brand')));
