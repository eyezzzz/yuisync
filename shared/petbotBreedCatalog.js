const CLASSIFICATION_VERSION = 3
const CLASSIFICATION_SOURCE = 'yuisync_exclusive_breed_presets_v2'

export const PETBOT_COAT_TYPES = Object.freeze(['curto', 'medio', 'longo', 'duplo'])

export function normalizePetbotBreedText(value = '') {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Operational grooming classification, not a genetic/veterinary diagnosis.
// "duplo" is reserved for breeds whose undercoat materially changes bath,
// drying and brushing effort. Long silky/drop coats remain "longo" even when
// a breed standard also mentions an undercoat. Tenants can edit the generated
// breed lists in Classificacao do PetBot when their commercial table differs.
export const COMMON_PET_BREED_CLASSIFICATIONS = Object.freeze([
  // Heavy undercoat / double-coat grooming class.
  { canonical: 'Spitz Alemão', species: 'dog', coat_type: 'duplo', aliases: ['spitz alemão', 'spitz alemao', 'spitz', 'lulu da pomerânia', 'lulu da pomerania', 'pomerânia', 'pomerania', 'pomeranian', 'spitz anão', 'spitz anao'] },
  { canonical: 'Golden Retriever', species: 'dog', coat_type: 'duplo', aliases: ['golden retriever', 'golden'] },
  { canonical: 'Labrador Retriever', species: 'dog', coat_type: 'duplo', aliases: ['labrador retriever', 'labrador', 'lab'] },
  { canonical: 'Pastor Alemão', species: 'dog', coat_type: 'duplo', aliases: ['pastor alemão', 'pastor alemao', 'german shepherd'] },
  { canonical: 'Husky Siberiano', species: 'dog', coat_type: 'duplo', aliases: ['husky siberiano', 'husky', 'siberian husky'] },
  { canonical: 'Border Collie', species: 'dog', coat_type: 'duplo', aliases: ['border collie', 'border'] },
  { canonical: 'Chow Chow', species: 'dog', coat_type: 'duplo', aliases: ['chow chow', 'chow'] },
  { canonical: 'Akita', species: 'dog', coat_type: 'duplo', aliases: ['akita', 'akita inu', 'akita americano', 'american akita'] },
  { canonical: 'Shiba Inu', species: 'dog', coat_type: 'duplo', aliases: ['shiba inu', 'shiba'] },
  { canonical: 'Samoieda', species: 'dog', coat_type: 'duplo', aliases: ['samoieda', 'samoyed'] },
  { canonical: 'Pastor Australiano', species: 'dog', coat_type: 'duplo', aliases: ['pastor australiano', 'australian shepherd', 'aussie'] },
  { canonical: 'Pastor de Shetland', species: 'dog', coat_type: 'duplo', aliases: ['pastor de shetland', 'shetland sheepdog', 'sheltie'] },
  { canonical: 'Collie de Pelo Longo', species: 'dog', coat_type: 'duplo', aliases: ['collie de pelo longo', 'rough collie'] },
  { canonical: 'Welsh Corgi', species: 'dog', coat_type: 'duplo', aliases: ['welsh corgi', 'corgi', 'corgi pembroke', 'pembroke welsh corgi', 'corgi cardigan', 'cardigan welsh corgi'] },
  { canonical: 'Boiadeiro Australiano', species: 'dog', coat_type: 'duplo', aliases: ['boiadeiro australiano', 'australian cattle dog', 'blue heeler', 'red heeler'] },
  { canonical: 'Boiadeiro Bernês', species: 'dog', coat_type: 'duplo', aliases: ['boiadeiro bernês', 'boiadeiro bernes', 'bernese mountain dog', 'bernese'] },
  { canonical: 'Terra Nova', species: 'dog', coat_type: 'duplo', aliases: ['terra nova', 'newfoundland'] },
  { canonical: 'São Bernardo', species: 'dog', coat_type: 'duplo', aliases: ['são bernardo', 'sao bernardo', 'saint bernard'] },
  { canonical: 'Malamute do Alasca', species: 'dog', coat_type: 'duplo', aliases: ['malamute do alasca', 'malamute', 'alaskan malamute'] },
  { canonical: 'Keeshond', species: 'dog', coat_type: 'duplo', aliases: ['keeshond', 'spitz lobo', 'wolfspitz'] },
  { canonical: 'Retriever da Nova Escócia', species: 'dog', coat_type: 'duplo', aliases: ['retriever da nova escócia', 'retriever da nova escocia', 'nova scotia duck tolling retriever', 'toller'] },

  // Long, silky, drop or heavily feathered grooming class.
  { canonical: 'Shih Tzu', species: 'dog', coat_type: 'longo', aliases: ['shih tzu', 'shi tzu', 'shihtzu', 'shitzu'] },
  { canonical: 'Yorkshire Terrier', species: 'dog', coat_type: 'longo', aliases: ['yorkshire terrier', 'yorkshire', 'york'] },
  { canonical: 'Lhasa Apso', species: 'dog', coat_type: 'longo', aliases: ['lhasa apso', 'lhasa'] },
  { canonical: 'Maltês', species: 'dog', coat_type: 'longo', aliases: ['maltês', 'maltes', 'maltese'] },
  { canonical: 'Pequinês', species: 'dog', coat_type: 'longo', aliases: ['pequinês', 'pequines', 'pekingese'] },
  { canonical: 'Cavalier King Charles Spaniel', species: 'dog', coat_type: 'longo', aliases: ['cavalier king charles spaniel', 'cavalier king charles', 'cavalier'] },
  { canonical: 'Cocker Spaniel Inglês', species: 'dog', coat_type: 'longo', aliases: ['cocker spaniel inglês', 'cocker spaniel ingles', 'cocker inglês', 'cocker ingles', 'english cocker spaniel'] },
  { canonical: 'Cocker Spaniel Americano', species: 'dog', coat_type: 'longo', aliases: ['cocker spaniel americano', 'cocker americano', 'american cocker spaniel'] },
  { canonical: 'Papillon', species: 'dog', coat_type: 'longo', aliases: ['papillon', 'spaniel anão continental', 'spaniel anao continental'] },
  { canonical: 'Galgo Afegão', species: 'dog', coat_type: 'longo', aliases: ['galgo afegão', 'galgo afegao', 'afghan hound'] },
  { canonical: 'Havanês', species: 'dog', coat_type: 'longo', aliases: ['havanês', 'havanes', 'havanese', 'bichon havanês', 'bichon havanes'] },
  { canonical: 'Biewer Terrier', species: 'dog', coat_type: 'longo', aliases: ['biewer terrier', 'biewer'] },
  { canonical: 'Setter Irlandês', species: 'dog', coat_type: 'longo', aliases: ['setter irlandês', 'setter irlandes', 'irish setter'] },
  { canonical: 'Setter Inglês', species: 'dog', coat_type: 'longo', aliases: ['setter inglês', 'setter ingles', 'english setter'] },

  // Curly, wavy, woolly or wire coat grooming class.
  { canonical: 'Poodle', species: 'dog', coat_type: 'medio', aliases: ['poodle', 'poodle toy', 'poodle miniatura', 'poodle médio', 'poodle medio', 'poodle standard', 'poodle gigante'] },
  { canonical: 'Bichon Frisé', species: 'dog', coat_type: 'medio', aliases: ['bichon frisé', 'bichon frise'] },
  { canonical: 'Schnauzer', species: 'dog', coat_type: 'medio', aliases: ['schnauzer', 'schnauzer miniatura', 'schnauzer standard', 'schnauzer gigante'] },
  { canonical: 'West Highland White Terrier', species: 'dog', coat_type: 'medio', aliases: ['west highland white terrier', 'westie'] },
  { canonical: 'Scottish Terrier', species: 'dog', coat_type: 'medio', aliases: ['scottish terrier', 'terrier escocês', 'terrier escoces', 'scottie'] },
  { canonical: 'Fox Terrier', species: 'dog', coat_type: 'medio', aliases: ['fox terrier', 'fox terrier de pelo duro', 'wire fox terrier'] },
  { canonical: 'Cão de Água Português', species: 'dog', coat_type: 'medio', aliases: ['cão de água português', 'cao de agua portugues', 'portuguese water dog'] },
  { canonical: 'Lagotto Romagnolo', species: 'dog', coat_type: 'medio', aliases: ['lagotto romagnolo', 'lagotto'] },
  { canonical: 'Labradoodle', species: 'dog', coat_type: 'medio', aliases: ['labradoodle'] },
  { canonical: 'Goldendoodle', species: 'dog', coat_type: 'medio', aliases: ['goldendoodle'] },

  // Smooth or predominantly short-coat grooming class.
  { canonical: 'Bulldog Francês', species: 'dog', coat_type: 'curto', aliases: ['bulldog francês', 'bulldog frances', 'buldogue francês', 'buldogue frances', 'french bulldog', 'frenchie'] },
  { canonical: 'Bulldog Inglês', species: 'dog', coat_type: 'curto', aliases: ['bulldog inglês', 'bulldog ingles', 'buldogue inglês', 'buldogue ingles', 'english bulldog'] },
  { canonical: 'Pug', species: 'dog', coat_type: 'curto', aliases: ['pug'] },
  { canonical: 'Pinscher Miniatura', species: 'dog', coat_type: 'curto', aliases: ['pinscher miniatura', 'pinscher', 'miniature pinscher'] },
  { canonical: 'American Pit Bull Terrier', species: 'dog', coat_type: 'curto', aliases: ['american pit bull terrier', 'pit bull', 'pitbull'] },
  { canonical: 'American Staffordshire Terrier', species: 'dog', coat_type: 'curto', aliases: ['american staffordshire terrier', 'amstaff'] },
  { canonical: 'Staffordshire Bull Terrier', species: 'dog', coat_type: 'curto', aliases: ['staffordshire bull terrier', 'staffbull', 'staffie'] },
  { canonical: 'American Bully', species: 'dog', coat_type: 'curto', aliases: ['american bully', 'bully'] },
  { canonical: 'Boxer', species: 'dog', coat_type: 'curto', aliases: ['boxer'] },
  { canonical: 'Doberman', species: 'dog', coat_type: 'curto', aliases: ['doberman', 'dobermann'] },
  { canonical: 'Rottweiler', species: 'dog', coat_type: 'curto', aliases: ['rottweiler', 'rott'] },
  { canonical: 'Cane Corso', species: 'dog', coat_type: 'curto', aliases: ['cane corso'] },
  { canonical: 'Dogo Argentino', species: 'dog', coat_type: 'curto', aliases: ['dogo argentino'] },
  { canonical: 'Dogue Alemão', species: 'dog', coat_type: 'curto', aliases: ['dogue alemão', 'dogue alemao', 'great dane'] },
  { canonical: 'Fila Brasileiro', species: 'dog', coat_type: 'curto', aliases: ['fila brasileiro', 'fila'] },
  { canonical: 'Beagle', species: 'dog', coat_type: 'curto', aliases: ['beagle'] },
  { canonical: 'Basset Hound', species: 'dog', coat_type: 'curto', aliases: ['basset hound', 'basset'] },
  { canonical: 'Shar Pei', species: 'dog', coat_type: 'curto', aliases: ['shar pei', 'shar-pei'] },
  { canonical: 'Boston Terrier', species: 'dog', coat_type: 'curto', aliases: ['boston terrier'] },
  { canonical: 'Bull Terrier', species: 'dog', coat_type: 'curto', aliases: ['bull terrier'] },
  { canonical: 'Terrier Brasileiro', species: 'dog', coat_type: 'curto', aliases: ['terrier brasileiro', 'fox paulistinha'] },
  { canonical: 'Jack Russell Terrier', species: 'dog', coat_type: 'curto', aliases: ['jack russell', 'jack russell terrier', 'jack russell de pelo curto', 'jack russell pelo curto', 'jack russell smooth coat'] },
  { canonical: 'Chihuahua', species: 'dog', coat_type: 'curto', aliases: ['chihuahua', 'chihuahua de pelo curto', 'chihuahua pelo curto', 'smooth coat chihuahua', 'short-haired chihuahua'] },
  { canonical: 'Dachshund', species: 'dog', coat_type: 'curto', aliases: ['dachshund', 'teckel', 'salsicha', 'dachshund de pelo curto', 'dachshund pelo curto', 'teckel de pelo curto', 'salsicha de pelo curto'] },
  { canonical: 'Dálmata', species: 'dog', coat_type: 'curto', aliases: ['dálmata', 'dalmata', 'dalmatian'] },
  { canonical: 'Weimaraner', species: 'dog', coat_type: 'curto', aliases: ['weimaraner'] },
  { canonical: 'Vizsla', species: 'dog', coat_type: 'curto', aliases: ['vizsla', 'braco húngaro', 'braco hungaro'] },
  { canonical: 'Whippet', species: 'dog', coat_type: 'curto', aliases: ['whippet'] },
  { canonical: 'Greyhound', species: 'dog', coat_type: 'curto', aliases: ['greyhound', 'galgo inglês', 'galgo ingles'] },
  { canonical: 'Rhodesian Ridgeback', species: 'dog', coat_type: 'curto', aliases: ['rhodesian ridgeback', 'ridgeback'] },
])

const AMBIGUOUS_BREEDS = Object.freeze([
  { canonical: 'SRD', species: 'dog', aliases: ['srd', 'sem raça definida', 'sem raca definida', 'vira lata', 'vira-lata', 'mestiço', 'mestico'], reason: 'A pelagem varia entre indivíduos.' },
])

// A customer who volunteers a specific coat variety should be respected, but
// the editable service lists still contain only the generalized breed name.
// This keeps one breed in one default class without discarding explicit data.
const EXPLICIT_COAT_VARIANTS = Object.freeze([
  { canonical: 'Chihuahua', species: 'dog', coat_type: 'longo', aliases: ['chihuahua de pelo longo', 'chihuahua pelo longo', 'long haired chihuahua', 'long-haired chihuahua'] },
  { canonical: 'Dachshund', species: 'dog', coat_type: 'longo', aliases: ['dachshund de pelo longo', 'dachshund pelo longo', 'teckel de pelo longo', 'salsicha de pelo longo'] },
  { canonical: 'Dachshund', species: 'dog', coat_type: 'medio', aliases: ['dachshund de pelo duro', 'dachshund pelo duro', 'teckel de pelo duro', 'salsicha de pelo duro'] },
  { canonical: 'Jack Russell Terrier', species: 'dog', coat_type: 'medio', aliases: ['jack russell de pelo duro', 'jack russell pelo duro', 'jack russell rough coat', 'jack russell broken coat'] },
  { canonical: 'Fox Terrier', species: 'dog', coat_type: 'curto', aliases: ['fox terrier de pelo liso', 'smooth fox terrier'] },
])

const indexedExplicitCoatVariants = EXPLICIT_COAT_VARIANTS
  .flatMap((entry) => (entry.aliases || []).map((alias) => ({
    key: normalizePetbotBreedText(alias),
    entry,
  })))
  .filter((item) => item.key)
  .sort((left, right) => right.key.length - left.key.length)

const indexedBreeds = COMMON_PET_BREED_CLASSIFICATIONS
  .flatMap((entry) => [entry.canonical, ...(entry.aliases || [])].map((alias) => ({
    key: normalizePetbotBreedText(alias),
    entry,
  })))
  .filter((item) => item.key)
  .sort((left, right) => right.key.length - left.key.length)

const indexedAmbiguousBreeds = AMBIGUOUS_BREEDS
  .flatMap((entry) => [entry.canonical, ...(entry.aliases || [])].map((alias) => ({
    key: normalizePetbotBreedText(alias),
    entry,
  })))
  .filter((item) => item.key)
  .sort((left, right) => right.key.length - left.key.length)

function matchesAlias(normalizedBreed, alias) {
  return normalizedBreed === alias
    || normalizedBreed.startsWith(`${alias} `)
    || normalizedBreed.endsWith(` ${alias}`)
}

export function classifyCommonPetBreed(value = '') {
  const normalized = normalizePetbotBreedText(value)
  if (!normalized) return null

  const explicitVariant = indexedExplicitCoatVariants.find((item) => matchesAlias(normalized, item.key))
  if (explicitVariant) {
    return {
      canonical: explicitVariant.entry.canonical,
      species: explicitVariant.entry.species,
      coat_type: explicitVariant.entry.coat_type,
      ambiguous: false,
      explicit_coat: true,
      classification_version: CLASSIFICATION_VERSION,
    }
  }

  const exact = indexedBreeds.find((item) => matchesAlias(normalized, item.key))
  if (exact) {
    return {
      canonical: exact.entry.canonical,
      species: exact.entry.species,
      coat_type: exact.entry.coat_type,
      ambiguous: false,
      classification_version: CLASSIFICATION_VERSION,
    }
  }

  const ambiguous = indexedAmbiguousBreeds.find((item) => matchesAlias(normalized, item.key))
  if (ambiguous) {
    return {
      canonical: ambiguous.entry.canonical,
      species: ambiguous.entry.species,
      coat_type: null,
      ambiguous: true,
      reason: ambiguous.entry.reason,
      classification_version: CLASSIFICATION_VERSION,
    }
  }

  return null
}

export function commonCanonicalBreedsForCoatType(coatType = '') {
  const normalized = normalizePetbotBreedText(coatType)
  if (!PETBOT_COAT_TYPES.includes(normalized)) return []

  return COMMON_PET_BREED_CLASSIFICATIONS
    .filter((entry) => entry.coat_type === normalized)
    .map((entry) => normalizePetbotBreedText(entry.canonical))
    .filter(Boolean)
}

export function commonBreedAliasesForCoatType(coatType = '') {
  const normalized = normalizePetbotBreedText(coatType)
  if (!PETBOT_COAT_TYPES.includes(normalized)) return []

  const values = []
  for (const entry of COMMON_PET_BREED_CLASSIFICATIONS) {
    if (entry.coat_type !== normalized) continue
    values.push(entry.canonical, ...(entry.aliases || []))
  }

  return [...new Set(values.map((value) => normalizePetbotBreedText(value)).filter(Boolean))]
}

export function inferServiceCoatType(value = '') {
  const text = normalizePetbotBreedText(value)
  if (!text) return null
  if (/\bpelo dupl/.test(text) || /\bpelagem dupl/.test(text)) return 'duplo'
  if (/\bpelo long/.test(text) || /\bpelagem long/.test(text)) return 'longo'
  if (/\bpelo medi/.test(text) || /\bpelagem medi/.test(text)) return 'medio'
  if (/\bpelo curt/.test(text) || /\bpelagem curt/.test(text)) return 'curto'
  if (/todas as racas|todos os pelos|qualquer pelo|todas as pelagens/.test(text)) return 'todas'
  return null
}

export function buildServiceBreedPreset(serviceName = '', existingMetadata = {}) {
  const current = existingMetadata && typeof existingMetadata === 'object' ? existingMetadata : {}
  const coatType = inferServiceCoatType(current.coat_type || serviceName)
  const allBreeds = coatType === 'todas'
  const breeds = allBreeds ? [] : commonCanonicalBreedsForCoatType(coatType)

  return {
    ...current,
    product_type: current.product_type || 'servico',
    species: current.species || 'dog',
    coat_type: coatType,
    breed: breeds,
    all_breeds: allBreeds,
    classification_version: CLASSIFICATION_VERSION,
    classification_source: CLASSIFICATION_SOURCE,
  }
}

export {
  CLASSIFICATION_SOURCE as PETBOT_BREED_CLASSIFICATION_SOURCE,
  CLASSIFICATION_VERSION as PETBOT_BREED_CLASSIFICATION_VERSION,
}
