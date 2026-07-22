import { createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import { classifyCommonPetBreed, normalizePetbotBreedText } from '../../shared/petbotBreedCatalog.js'

const AVAILABLE_STATUSES = new Set(['available', 'livre', 'disponivel', 'aberto', 'open'])
const BUSY_STATUSES = new Set([
  'agendado',
  'confirmado',
  'em_andamento',
  'booked',
  'ocupado',
  'blocked',
  'bloqueado',
  'scheduled',
  'pendente',
])
const MAX_AGENT_STEPS = 7
const DEFAULT_TIMEZONE = 'America/Sao_Paulo'
const DEFAULT_SLOT_INTERVAL_MINUTES = 30
const DEFAULT_BOOKING_LEAD_MINUTES = 15
const DEFAULT_BOOKING_CAPACITY = 1
const DEFAULT_BUSINESS_HOURS = {
  1: [{ open: '08:00', close: '18:00' }],
  2: [{ open: '08:00', close: '18:00' }],
  3: [{ open: '08:00', close: '18:00' }],
  4: [{ open: '08:00', close: '18:00' }],
  5: [{ open: '08:00', close: '18:00' }],
  6: [{ open: '08:00', close: '18:00' }],
  7: [{ open: '08:00', close: '18:00' }],
}

function clean(value = '') {
  return String(value ?? '').trim()
}

function normalize(value = '') {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function nullableString(value, max = 240) {
  const text = clean(value)
  return text ? text.slice(0, max) : null
}

function positiveNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function normalizeCode(value = '') {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function formatWeightValue(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  return Number.isInteger(number)
    ? String(number)
    : number.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export function mergeInterpretedPetbotServiceFacts({
  interpretation = {},
  previousFacts = {},
} = {}) {
  const current = interpretation && typeof interpretation === 'object' ? interpretation : {}
  const previous = previousFacts && typeof previousFacts === 'object' ? previousFacts : {}

  const currentPetName = clean(current.pet_name)
  const previousPetName = clean(previous.pet_name)
  const currentBreed = clean(current.breed)
  const previousBreed = clean(previous.breed)
  const currentSpecies = clean(current.species)
  const previousSpecies = clean(previous.species)
  const petIdentityChanged = Boolean(
    (currentPetName && previousPetName && normalize(currentPetName) !== normalize(previousPetName))
    || (currentSpecies && previousSpecies && normalizeServiceSpecies(currentSpecies) !== normalizeServiceSpecies(previousSpecies)),
  )
  const breedChanged = Boolean(
    currentBreed && previousBreed
    && normalizePetbotBreedText(currentBreed) !== normalizePetbotBreedText(previousBreed),
  )
  const inherited = petIdentityChanged ? {} : previous

  const petName = currentPetName || clean(inherited.pet_name) || null
  const breed = currentBreed || clean(inherited.breed) || null
  const breedClassification = classifyCommonPetBreed(breed)
  const species = currentSpecies
    || breedClassification?.species
    || clean(inherited.species)
    || null
  const weightKg = positiveNumber(current.weight_kg, 0)
    || positiveNumber(inherited.weight_kg, 0)
    || null
  const weightLabel = clean(current.weight_label)
    || clean(inherited.weight_label)
    || (weightKg ? `${formatWeightValue(weightKg)} kg` : null)
  const hasCurrentWeight = positiveNumber(current.weight_kg, 0) > 0
  const coatFromCustomer = normalizeCoatType(current.coat_type)
  const inheritedCoat = breedChanged ? null : normalizeCoatType(inherited.coat_type)
  const coatType = coatFromCustomer
    || breedClassification?.coat_type
    || inheritedCoat
    || null

  return {
    pet_name: petName,
    pet_name_explicit: Boolean(petName),
    species,
    species_explicit: Boolean(species),
    breed,
    breed_explicit: Boolean(breed),
    weight_kg: weightKg,
    weight_label: weightLabel,
    weight_estimated: hasCurrentWeight
      ? Boolean(current.weight_estimated)
      : Boolean(inherited.weight_estimated),
    weight_explicit: Boolean(weightKg),
    coat_type: coatType,
    coat_type_explicit: Boolean(coatFromCustomer),
    coat_type_source: coatFromCustomer
      ? 'customer'
      : (breedClassification?.coat_type ? 'breed_catalog' : clean(inherited.coat_type_source) || null),
    pet_identity_changed: petIdentityChanged,
  }
}

export function groundPetbotServiceArgs(args = {}, facts = {}) {
  // The structured interpreter is the preferred semantic source, but the
  // autonomous agent may also extract the same customer facts while deciding
  // which tool to call. Accept those semantic arguments as a fallback instead
  // of forcing a deterministic dialogue layer. Operational fields (catalog,
  // price, stock and schedule) are still resolved and validated server-side.
  const factWeight = facts.weight_explicit ? positiveNumber(facts.weight_kg, 0) : 0
  const argumentWeight = positiveNumber(args.weight_kg, 0)
  const weightKg = factWeight || argumentWeight || null

  return {
    ...args,
    pet_name: facts.pet_name_explicit
      ? clean(facts.pet_name) || null
      : clean(args.pet_name) || null,
    species: facts.species_explicit
      ? clean(facts.species) || null
      : clean(args.species) || null,
    breed: facts.breed_explicit
      ? clean(facts.breed) || null
      : clean(args.breed) || null,
    weight_kg: weightKg,
    weight_label: facts.weight_explicit
      ? clean(facts.weight_label) || null
      : clean(args.weight_label) || (weightKg ? `${formatWeightValue(weightKg)} kg` : null),
    weight_estimated: facts.weight_explicit
      ? Boolean(facts.weight_estimated)
      : Boolean(args.weight_estimated),
    coat_type: clean(facts.coat_type) || clean(args.coat_type) || null,
  }
}

function parseTimeMinutes(value = '') {
  const match = clean(value).match(/^(\d{1,2})(?::(\d{2}))?$/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2] || 0)
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

function formatTimeMinutes(value) {
  const minutes = Number(value)
  if (!Number.isFinite(minutes)) return ''
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function normalizeBusinessHours(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : DEFAULT_BUSINESS_HOURS
  const normalized = {}
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    const raw = source[weekday] ?? source[String(weekday)] ?? DEFAULT_BUSINESS_HOURS[weekday] ?? []
    const periods = (Array.isArray(raw) ? raw : [])
      .map((period) => {
        const open = clean(period?.open)
        const close = clean(period?.close)
        const openMinutes = parseTimeMinutes(open)
        const closeMinutes = parseTimeMinutes(close)
        if (openMinutes === null || closeMinutes === null || closeMinutes <= openMinutes) return null
        return { open, close, openMinutes, closeMinutes }
      })
      .filter(Boolean)
    normalized[weekday] = periods
  }
  return normalized
}

export function normalizePetbotSchedulingSettings(settings = {}) {
  const timezone = clean(settings.timezone || settings.petbotTimezone) || DEFAULT_TIMEZONE
  const slotIntervalMin = Math.max(5, Math.min(240, Number(settings.slotIntervalMin || settings.petbotSlotIntervalMin || DEFAULT_SLOT_INTERVAL_MINUTES) || DEFAULT_SLOT_INTERVAL_MINUTES))
  const leadTimeMin = Math.max(0, Math.min(10080, Number(settings.bookingLeadTimeMin || settings.petbotBookingLeadTimeMin || DEFAULT_BOOKING_LEAD_MINUTES) || 0))
  const capacity = Math.max(1, Math.min(100, Number(settings.bookingCapacity || settings.petbotBookingCapacity || DEFAULT_BOOKING_CAPACITY) || DEFAULT_BOOKING_CAPACITY))
  const businessHours = normalizeBusinessHours(settings.businessHours || settings.petbotBusinessHours)
  return { timezone, slotIntervalMin, leadTimeMin, capacity, businessHours }
}

function serviceGroupForOrder(orderType = '') {
  return clean(orderType) === 'veterinaria' ? 'veterinaria' : 'banho_tosa'
}

function localizedNumber(value = '') {
  const number = Number(String(value).replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

function normalizeCoatType(value = '') {
  const text = normalize(value)
  if (!text) return null
  if (/dupl/.test(text)) return 'duplo'
  if (/long/.test(text)) return 'longo'
  if (/medi/.test(text)) return 'medio'
  if (/curt/.test(text)) return 'curto'
  if (/todas|qualquer|todos/.test(text)) return 'todas'
  return normalizeCode(value) || null
}

function normalizeServiceSpecies(value = '') {
  const text = normalize(value)
  if (!text) return null
  if (['dog', 'cao', 'caes', 'cachorro', 'cachorra', 'canino'].includes(text)) return 'dog'
  if (['cat', 'gato', 'gata', 'felino'].includes(text)) return 'cat'
  if (['other', 'outro', 'outra'].includes(text)) return 'other'
  return normalizeCode(value) || null
}

function inferServiceSpecies({ species = '', speciesTarget = '', name = '', category = '' } = {}) {
  const explicit = normalizeServiceSpecies(species || speciesTarget)
  if (explicit) return explicit

  const text = normalize([name, category].filter(Boolean).join(' '))
  if (/\b(gato|gata|gatos|gatas|felino|felina|felinos|felinas)\b/.test(text)) return 'cat'
  if (/\b(cao|caes|cachorro|cachorra|cachorros|cachorras|canino|canina|caninos|caninas)\b/.test(text)) return 'dog'
  if (/\b(banho|tosa)\b/.test(text) && /\bpet\b/.test(text) && /\bporte\b/.test(text)) return 'dog'
  return null
}

function serviceKind(value = '') {
  const text = normalize(value)
  if (/banho.*tosa|tosa.*banho/.test(text)) return 'banho_e_tosa'
  if (/tosa/.test(text)) return 'tosa'
  if (/banho/.test(text)) return 'banho'
  if (/consulta/.test(text)) return 'consulta'
  if (/vacina/.test(text)) return 'vacina'
  return normalizeCode(value) || null
}

function serviceGroupFromText(value = '') {
  const text = normalize(value)
  return /vet|consulta|vacina|clinica|medico|exame|cirurg|ultrassom/.test(text)
    ? 'veterinaria'
    : 'banho_tosa'
}

function catalogServiceCode(productId = '') {
  const compact = clean(productId).replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  return compact ? `catalog_${compact}` : ''
}

export function isServiceCatalogProduct(product = {}) {
  const metadata = product?.bot_metadata && typeof product.bot_metadata === 'object'
    ? product.bot_metadata
    : {}
  const name = normalize(product.name)
  const text = normalize([product.name, product.category, metadata.product_type].filter(Boolean).join(' '))

  if (/banheira|banho a seco|brinquedo|casinha|roupa|shampoo|varinha/.test(name)) return false
  if (/pacote.*banho|banho.*pacote/.test(name)) return false

  return normalize(metadata.product_type) === 'servico'
    || normalize(product.category) === 'servico'
    || /banho|tosa|desembolo|escovac|hidrat|higieniz|consulta|vacina|exame|cirurg/.test(text)
}

export function serviceFromCatalogProduct(product = {}) {
  if (!isServiceCatalogProduct(product) || product.active === false) return null
  const code = catalogServiceCode(product.id)
  const name = clean(product.name)
  const metadata = product?.bot_metadata && typeof product.bot_metadata === 'object'
    ? product.bot_metadata
    : {}
  if (!code || !name || Number(product.price || 0) <= 0) return null

  return {
    id: code,
    code,
    name,
    group_type: serviceGroupFromText(`${name} ${product.category || ''}`),
    default_price: Number(product.price || 0),
    default_duration_min: Math.max(15, Number(metadata.duration_min || metadata.service_duration_min || 60) || 60),
    active: true,
    sort_order: Number(product.sort_order || 500),
    source_product_id: clean(product.id),
    catalog_source: 'products',
    species: inferServiceSpecies({
      species: metadata.species,
      speciesTarget: product.species_target,
      name,
      category: product.category,
    }),
    breeds: Array.isArray(metadata.breed) ? metadata.breed : (clean(metadata.breed) ? [metadata.breed] : []),
    all_breeds: metadata.all_breeds === true,
    coat_type: normalizeCoatType(metadata.coat_type) || extractCoatType(name),
    weight_range: (
      Number.isFinite(Number(metadata.weight_min_kg)) || Number.isFinite(Number(metadata.weight_max_kg))
        ? {
          min: Number.isFinite(Number(metadata.weight_min_kg)) ? Number(metadata.weight_min_kg) : null,
          max: Number.isFinite(Number(metadata.weight_max_kg)) ? Number(metadata.weight_max_kg) : null,
        }
        : extractWeightRange(name)
    ),
    required_facts: Array.isArray(metadata.required_facts)
      ? metadata.required_facts.map((value) => normalizeCode(value)).filter(Boolean)
      : [],
    classification_version: Number(metadata.classification_version || 0) || null,
  }
}

export function mergePetshopServiceCatalogs(dedicatedServices = [], products = []) {
  const productServices = (products || []).map(serviceFromCatalogProduct).filter(Boolean)
  const byCode = new Map()
  const productById = new Map(productServices.map((service) => [clean(service.source_product_id), service]))
  const authoritativeKinds = new Set(productServices.map((service) => serviceKind(`${service.code} ${service.name}`)).filter(Boolean))

  for (const raw of dedicatedServices || []) {
    if (!raw || raw.active === false) continue
    const sourceProductId = clean(raw.source_product_id)
    const rawKind = serviceKind(`${raw.code || ''} ${raw.name || ''}`)
    if (!sourceProductId && rawKind && authoritativeKinds.has(rawKind)) continue
    const productService = sourceProductId ? productById.get(sourceProductId) : null
    const merged = productService
      ? {
        ...raw,
        ...productService,
        default_duration_min: Math.max(15, Number(raw.default_duration_min || productService.default_duration_min || 60) || 60),
      }
      : raw
    const key = normalizeCode(merged.code || merged.name || merged.id)
    if (key) byCode.set(key, merged)
  }

  for (const service of productServices) {
    const key = normalizeCode(service.code)
    const current = byCode.get(key)
    byCode.set(key, current ? { ...current, ...service, default_duration_min: current.default_duration_min || service.default_duration_min } : service)
  }

  return [...byCode.values()]
}

function extractWeightRange(value = '') {
  const text = normalize(value).replace(/,/g, '.')
  const range = text.match(/(\d+(?:\.\d+)?)\s*(?:kg\s*)?(?:a|ate|-)\s*(\d+(?:\.\d+)?)\s*kg/)
  if (range) {
    return {
      min: localizedNumber(range[1]),
      max: localizedNumber(range[2]),
    }
  }

  const above = text.match(/(?:acima|mais)\s+de\s+(\d+(?:\.\d+)?)\s*kg/)
  if (above) return { min: localizedNumber(above[1]), max: null }

  const until = text.match(/(?:ate)\s+(\d+(?:\.\d+)?)\s*kg/)
  if (until) return { min: 0, max: localizedNumber(until[1]) }

  return null
}

function extractCoatType(value = '') {
  const text = normalize(value)
  if (/pelo\s+dupl/.test(text)) return 'duplo'
  if (/pelo\s+long/.test(text)) return 'longo'
  if (/pelo\s+medi/.test(text)) return 'medio'
  if (/pelo\s+curt/.test(text)) return 'curto'
  if (/todas\s+as|todos\s+os|qualquer\s+pelo/.test(text)) return 'todas'
  return null
}

function normalizeService(row = {}) {
  const code = normalizeCode(row.code || row.service_type || row.name)
  const name = clean(row.name || row.service_type || code)
  const sourceProductId = clean(row.source_product_id)
  return {
    ...row,
    id: clean(row.id) || code,
    code,
    name,
    group_type: clean(row.group_type) || serviceGroupFromText(`${code} ${name}`),
    default_price: Number(row.default_price ?? row.price ?? 0),
    default_duration_min: Math.max(15, Number(row.default_duration_min ?? row.duration_min ?? 60) || 60),
    active: row.active !== false,
    source_product_id: sourceProductId || null,
    catalog_source: clean(row.catalog_source) || (sourceProductId ? 'products' : 'petshop_services'),
    service_kind: serviceKind(`${code} ${name}`),
    species: inferServiceSpecies({
      species: row.species,
      speciesTarget: row.species_target,
      name,
      category: row.category,
    }),
    weight_range: row.weight_range || extractWeightRange(name),
    coat_type: normalizeCoatType(row.coat_type) || extractCoatType(name),
    breeds: Array.isArray(row.breeds)
      ? row.breeds.map((value) => normalizePetbotBreedText(value)).filter(Boolean)
      : [],
    all_breeds: row.all_breeds === true,
    required_facts: Array.isArray(row.required_facts)
      ? row.required_facts.map((value) => normalizeCode(value)).filter(Boolean)
      : [],
  }
}

function serviceMatchesWeight(service, weightKg) {
  if (!service.weight_range || weightKg === null) return true
  const { min, max } = service.weight_range
  if (Number.isFinite(min) && weightKg < min) return false
  if (Number.isFinite(max) && weightKg > max) return false
  return true
}

function serviceMatchesCoat(service, coatType) {
  if (!service.coat_type || service.coat_type === 'todas' || !coatType) return true
  return service.coat_type === coatType
}

function isUniversalSmallDogBathService(service = {}, weightKg = null) {
  const weight = positiveNumber(weightKg, 0) || null
  if (weight === null || weight > 10) return false
  if (service.service_kind !== 'banho') return false
  if (service.species === 'cat') return false

  const range = service.weight_range
  if (!range || !Number.isFinite(Number(range.max)) || Number(range.max) > 10) return false
  if (Number.isFinite(Number(range.min)) && Number(range.min) > weight) return false

  const text = normalize(service.name)
  const universalCoat = !service.coat_type
    || service.coat_type === 'todas'
    || /todas\s+as\s+pelagens|qualquer\s+pelagem/.test(text)
  const universalBreed = service.all_breeds
    || !service.breeds?.length
    || /todas\s+as\s+racas|qualquer\s+raca/.test(text)

  return universalCoat && universalBreed
}

function serviceMatchesBreedPreset(service, breed = '') {
  const normalizedBreed = normalizePetbotBreedText(breed)
  if (!normalizedBreed || service.all_breeds || !service.breeds?.length) return false

  // Service metadata stores one canonical label per breed. User spelling
  // variants stay in the centralized catalog so aliases do not appear as
  // duplicate breeds in multiple service classifications.
  const canonicalBreed = normalizePetbotBreedText(classifyCommonPetBreed(breed)?.canonical || '')
  const candidates = new Set([normalizedBreed, canonicalBreed].filter(Boolean))

  return service.breeds.some((storedBreed) => [...candidates].some((candidate) => (
    candidate === storedBreed
    || candidate.startsWith(`${storedBreed} `)
    || candidate.endsWith(` ${storedBreed}`)
  )))
}

function preferExactCoatWithinWeightRanges(services = [], coatType = '') {
  const groups = new Map()
  for (const service of services) {
    const range = service.weight_range
    const key = range ? `${range.min ?? ''}:${range.max ?? ''}` : 'sem_faixa'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(service)
  }

  return [...groups.values()].flatMap((group) => {
    const exact = group.filter((service) => service.coat_type === coatType)
    return exact.length ? exact : group
  })
}

function inferredCoatTypeForBreed(breed = '', candidates = []) {
  const classification = classifyCommonPetBreed(breed)
  if (classification?.coat_type) return classification.coat_type

  const presetCoats = new Set(
    candidates
      .filter((service) => serviceMatchesBreedPreset(service, breed))
      .map((service) => service.coat_type)
      .filter((coat) => coat && coat !== 'todas'),
  )
  if (presetCoats.size === 1) return [...presetCoats][0]
  return null
}

function serviceSelection({ serviceQuery = '', orderType = '', services = [], weightKg = null, coatType = null, breed = null, species = null } = {}) {
  const query = normalize(serviceQuery)
  const code = normalizeCode(serviceQuery)
  const group = serviceGroupForOrder(orderType)
  const normalizedWeight = positiveNumber(weightKg, 0) || null
  let normalizedCoat = normalizeCoatType(coatType)
  const normalizedSpecies = normalizeServiceSpecies(species)
  const allCandidates = (services || [])
    .map(normalizeService)
    .filter((service) => service.active && (!group || service.group_type === group))

  if (!allCandidates.length) {
    return { service: null, candidates: [], required_fields: [], error: 'Nenhum serviço ativo foi encontrado no cadastro real.' }
  }

  const queryKind = serviceKind(serviceQuery)
  const exactId = allCandidates.find((service) => clean(service.id) === clean(serviceQuery) || clean(service.source_product_id) === clean(serviceQuery))
  const exactCatalogMatches = allCandidates.filter((service) => (
    service.code === code || normalize(service.name) === query
  ))
  const kindMatches = allCandidates.filter((service) => (
    (queryKind && service.service_kind === queryKind)
    || Boolean(query && (normalize(service.name).includes(query) || query.includes(normalize(service.name))))
  ))

  const authoritativeMatches = kindMatches.filter((service) => (
    service.catalog_source === 'products' || Boolean(service.source_product_id)
  ))
  const exactAuthoritative = exactCatalogMatches.filter((service) => (
    service.catalog_source === 'products' || Boolean(service.source_product_id)
  ))

  let candidates
  if (exactId && (exactId.catalog_source === 'products' || exactId.source_product_id)) {
    candidates = [exactId]
  } else if (exactAuthoritative.length) {
    candidates = exactAuthoritative
  } else if (authoritativeMatches.length) {
    // The catalog shown in Estoque > Servicos is the tenant's commercial
    // source of truth. Generic seeded rows such as "Banho - R$ 60" must not
    // override those entries, even when the model sends the generic code.
    candidates = authoritativeMatches
  } else if (exactId) {
    candidates = [exactId]
  } else {
    const exactSpecialized = exactCatalogMatches.filter((service) => service.weight_range || service.coat_type)
    const kindSpecialized = kindMatches.filter((service) => service.weight_range || service.coat_type)

    if (exactSpecialized.length) candidates = exactSpecialized
    else if (kindSpecialized.length) candidates = kindMatches
    else candidates = exactCatalogMatches.length ? exactCatalogMatches : kindMatches
  }

  if (!candidates.length) {
    return {
      service: null,
      candidates: allCandidates,
      required_fields: [],
      error: 'Serviço não encontrado ou inativo no cadastro real.',
    }
  }

  const specialized = candidates.filter((service) => service.weight_range || service.coat_type || service.species)
  if (specialized.length) candidates = specialized

  const requiredFields = []
  const distinctSpecies = new Set(candidates.map((service) => service.species).filter(Boolean))
  if (normalizedSpecies) {
    const exactSpecies = candidates.filter((service) => service.species === normalizedSpecies)
    if (exactSpecies.length) {
      candidates = exactSpecies
    } else {
      candidates = candidates.filter((service) => !service.species)
    }
    if (!candidates.length) {
      return {
        service: null,
        candidates: allCandidates,
        required_fields: [],
        error: `Nenhum serviço cadastrado atende a espécie informada (${clean(species)}).`,
      }
    }
  } else if (distinctSpecies.size > 1) {
    requiredFields.push('espécie do pet')
  }
  if (candidates.some((service) => service.weight_range) && normalizedWeight === null) {
    requiredFields.push('peso aproximado do pet')
  }

  let filtered = candidates
  if (normalizedWeight !== null) filtered = filtered.filter((service) => serviceMatchesWeight(service, normalizedWeight))
  if (normalizedWeight !== null && !filtered.length) {
    return {
      service: null,
      candidates,
      required_fields: [],
      error: `Nenhum serviço cadastrado atende o peso informado (${normalizedWeight} kg).`,
    }
  }

  // Regra comercial do catálogo: para cães de até 10 kg, o banho geral de
  // pequeno porte é a opção canônica. Raça/pelagem continuam úteis acima
  // dessa faixa, mas não devem criar escolhas técnicas desnecessárias aqui.
  if (normalizedSpecies === 'dog' && queryKind === 'banho' && normalizedWeight !== null && normalizedWeight <= 10) {
    const universalSmall = filtered.filter((service) => isUniversalSmallDogBathService(service, normalizedWeight))
    if (universalSmall.length) {
      const authoritative = universalSmall.filter((service) => service.catalog_source === 'products' || service.source_product_id)
      filtered = authoritative.length ? authoritative : universalSmall
    }
  }

  if (!normalizedCoat && clean(breed)) {
    normalizedCoat = inferredCoatTypeForBreed(breed, filtered)
  }

  const distinctCoats = new Set(filtered.map((service) => service.coat_type).filter((value) => value && value !== 'todas'))
  if (distinctCoats.size > 1 && !normalizedCoat) {
    if (clean(breed)) {
      const genericForWeight = filtered.filter((service) => service.coat_type === 'todas')
      if (genericForWeight.length) {
        filtered = genericForWeight
      } else {
        return {
          service: null,
          candidates: filtered,
          required_fields: [],
          error: 'A raça informada ainda não possui uma classificação única no catálogo. Encaminhe para um atendente sem inventar o serviço.',
        }
      }
    } else {
      requiredFields.push('tipo de pelo do pet')
    }
  }
  if (normalizedCoat) {
    filtered = filtered.filter((service) => serviceMatchesCoat(service, normalizedCoat))
    filtered = preferExactCoatWithinWeightRanges(filtered, normalizedCoat)
  }
  if (normalizedCoat && !filtered.length) {
    return {
      service: null,
      candidates,
      required_fields: [],
      error: `Nenhum serviço cadastrado atende o tipo de pelo informado (${clean(coatType)}).`,
    }
  }

  const factValues = {
    species: normalizedSpecies,
    breed: clean(breed),
    weight_kg: normalizedWeight,
    coat_type: normalizedCoat,
  }
  const requiredFacts = new Set(filtered.flatMap((service) => service.required_facts || []))
  for (const fact of requiredFacts) {
    if (factValues[fact]) continue
    if (fact === 'species') requiredFields.push('espécie do pet')
    if (fact === 'breed') requiredFields.push('raça do pet')
    if (fact === 'weight_kg') requiredFields.push('peso aproximado do pet')
    if (fact === 'coat_type') requiredFields.push('tipo de pelo do pet')
  }

  if (requiredFields.length) {
    return { service: null, candidates: filtered.length ? filtered : candidates, required_fields: requiredFields, error: null }
  }

  if (filtered.length === 1) return { service: filtered[0], candidates: filtered, required_fields: [], error: null }

  return {
    service: null,
    candidates: filtered,
    required_fields: ['serviço exato do cadastro'],
    error: 'Há mais de um serviço compatível. Não escolha um deles sem confirmar os dados que diferenciam as opções.',
  }
}

function normalizeMissingServiceField(value = '') {
  const normalized = normalize(value)
  if (/raca/.test(normalized)) return 'breed'
  if (/peso/.test(normalized)) return 'weight_kg'
  if (/pelo|pelagem/.test(normalized)) return 'coat_type'
  if (/servico/.test(normalized)) return 'service_choice'
  if (/data/.test(normalized)) return 'date'
  return normalizeCode(value)
}

export function resolvePetshopService(options = {}) {
  const selection = serviceSelection(options)
  if (selection.service) {
    const service = publicService(selection.service)
    return {
      ok: true,
      status: 'resolved',
      service,
      missing_fields: [],
      required_fields: [],
      candidates: [service],
      available_services: [service],
    }
  }

  const requiredFields = [...new Set(selection.required_fields || [])]
  const missingFields = [...new Set(requiredFields.map(normalizeMissingServiceField).filter(Boolean))]
  const candidates = (selection.candidates || []).slice(0, 12).map(publicService)
  return {
    ok: false,
    status: missingFields.length ? 'needs_input' : (selection.candidates?.length ? 'ambiguous' : 'not_found'),
    error: selection.error || null,
    missing_fields: missingFields,
    required_fields: requiredFields,
    candidates,
    available_services: candidates,
  }
}

function resolveServiceDefinition(options = {}) {
  return serviceSelection(options).service
}

function publicService(service) {
  return {
    id: service.id,
    product_id: service.source_product_id || null,
    code: service.code,
    name: service.name,
    price: service.default_price,
    duration_min: service.default_duration_min,
    service_kind: service.service_kind || serviceKind(`${service.code || ''} ${service.name || ''}`),
    weight_min_kg: service.weight_range?.min ?? null,
    weight_max_kg: service.weight_range?.max ?? null,
    coat_type: service.coat_type || null,
    species: service.species || null,
    catalog_source: service.catalog_source || null,
  }
}

export function findPetshopSubscriptionBenefit(service = {}, benefits = []) {
  const normalizedService = normalizeService(service)
  const kind = normalizedService.service_kind || serviceKind(`${normalizedService.code || ''} ${normalizedService.name || ''}`)
  if (!kind) return null

  const benefit = (Array.isArray(benefits) ? benefits : []).find((entry) => (
    normalizeCode(entry?.service_type) === kind
    && Number(entry?.remaining || 0) > 0
  ))
  if (!benefit) return null

  return {
    subscription_id: clean(benefit.subscription_id) || null,
    plan_name: clean(benefit.plan_name) || null,
    service_type: kind,
    remaining: Math.max(0, Number(benefit.remaining || 0)),
  }
}

function appointmentStartMs(row = {}) {
  const normalized = normalizeAppointment(row)
  const value = normalized.scheduled_at ? new Date(normalized.scheduled_at).getTime() : NaN
  return Number.isFinite(value) ? value : null
}

function appointmentDurationMs(row = {}) {
  return Math.max(15, Number(row.duration_min || 60) || 60) * 60 * 1000
}

function appointmentsOverlap(left = {}, right = {}) {
  const leftStart = appointmentStartMs(left)
  const rightStart = appointmentStartMs(right)
  if (leftStart === null || rightStart === null) return false
  return leftStart < rightStart + appointmentDurationMs(right)
    && rightStart < leftStart + appointmentDurationMs(left)
}

function isNoTransport(value = '') {
  return /^(nao|sem|nenhum|nao_quero|sem_transporte|cliente_leva|tutor_leva|proprio)$/.test(normalizeCode(value))
}

function normalizeTransportOptions(settings = {}) {
  const rawOptions = Array.isArray(settings.petTransportOptions) ? settings.petTransportOptions : []
  const options = rawOptions
    .map((option, index) => ({
      id: clean(option.id || option.mode || `opcao_${index + 1}`),
      label: clean(option.label || option.name || `Opção ${index + 1}`),
      fee: Number(option.fee ?? option.price ?? 0),
      active: option.active !== false,
    }))
    .filter((option) => option.active && option.id && option.label && Number.isFinite(option.fee) && option.fee >= 0)

  if (options.length) return options
  const fallbackFee = Number(settings.petTransportFee ?? 0)
  if (!Number.isFinite(fallbackFee) || fallbackFee <= 0) return []
  return [{ id: 'buscar_e_levar', label: 'Buscar e levar', fee: fallbackFee, active: true }]
}

export function listPetTransportOptions(settings = {}) {
  return normalizeTransportOptions(settings).map((option) => ({
    id: option.id,
    label: option.label,
    fee: option.fee,
  }))
}

export function resolvePetTransportSelection({ args = {}, settings = {}, orderType = '' } = {}) {
  if (clean(orderType) !== 'banho_tosa') {
    return { ok: true, requested: false, fee: 0, mode: null, label: null }
  }

  const requestedMode = clean(args.service_transport_mode)
  const requestedLabel = clean(args.service_transport_label)
  const requestedValue = requestedMode || requestedLabel
  if (!requestedValue || isNoTransport(requestedValue)) {
    return { ok: true, requested: false, fee: 0, mode: null, label: null }
  }

  const options = normalizeTransportOptions(settings)
  const requestedNormalized = normalize(requestedValue)
  const requestedCode = normalizeCode(requestedValue)
  const option = options.find((item) => normalizeCode(item.id) === requestedCode)
    || options.find((item) => normalize(item.label) === requestedNormalized)
    || options.find((item) => requestedNormalized.includes(normalize(item.label)) || normalize(item.label).includes(requestedNormalized))

  if (!option) {
    return {
      ok: false,
      requested: true,
      error: 'opção válida de transporte do pet',
      available_options: options.map((item) => ({ id: item.id, label: item.label, fee: item.fee })),
    }
  }

  return {
    ok: true,
    requested: true,
    fee: Number(option.fee),
    mode: option.id,
    label: option.label,
  }
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function appointmentDateIso(row = {}, timezone = DEFAULT_TIMEZONE) {
  if (row.service_date) return String(row.service_date).slice(0, 10)
  if (!row.scheduled_at) return ''
  const parsed = DateTime.fromISO(clean(row.scheduled_at), { setZone: true }).setZone(timezone)
  return parsed.isValid ? parsed.toISODate() : ''
}

function appointmentTimeText(row = {}, timezone = DEFAULT_TIMEZONE) {
  if (row.start_time) return String(row.start_time).slice(0, 5)
  if (!row.scheduled_at) return ''
  const parsed = DateTime.fromISO(clean(row.scheduled_at), { setZone: true }).setZone(timezone)
  return parsed.isValid ? parsed.toFormat('HH:mm') : ''
}

function normalizeAppointment(row = {}, timezone = DEFAULT_TIMEZONE) {
  const date = appointmentDateIso(row, timezone)
  const time = appointmentTimeText(row, timezone)
  const scheduledAt = clean(row.scheduled_at)
    || (date && time ? DateTime.fromISO(`${date}T${time}`, { zone: timezone }).toISO({ suppressMilliseconds: true }) : null)
  return {
    ...row,
    scheduled_at: scheduledAt,
    service_date: row.service_date || date || null,
    start_time: row.start_time || (time ? `${time}:00` : null),
  }
}

function formatScheduledAt(value, timezone = DEFAULT_TIMEZONE) {
  const parsed = DateTime.fromISO(clean(value), { setZone: true }).setZone(timezone)
  if (!parsed.isValid) return clean(value)
  return parsed.setLocale('pt-BR').toFormat('dd/MM/yyyy, HH:mm')
}

function sameScheduledInstant(left = '', right = '') {
  const leftDate = DateTime.fromISO(clean(left), { setZone: true })
  const rightDate = DateTime.fromISO(clean(right), { setZone: true })
  return leftDate.isValid && rightDate.isValid && leftDate.toMillis() === rightDate.toMillis()
}

function buildPendingOrderId(order) {
  return createHash('sha256').update(JSON.stringify(order)).digest('hex').slice(0, 20)
}

function formatOrderSummary(order, settings = {}) {
  const lines = ['**Resumo final**']
  lines.push(`• Cliente: ${order.customer_name}`)

  if (order.pet_name || order.species || order.size || order.breed || order.weight_kg || order.coat_type) {
    const pet = [
      order.pet_name,
      order.species,
      order.breed,
      order.size,
      order.weight_label || (order.weight_kg ? `${formatWeightValue(order.weight_kg)} kg` : null),
      order.coat_type ? `pelo ${order.coat_type}` : null,
    ].filter(Boolean).join(' / ')
    lines.push(`• Pet: ${pet}`)
  }

  for (const item of order.items || []) {
    const quantity = Number(item.quantity || 1)
    lines.push(`• ${quantity}x ${item.name}: ${money(quantity * Number(item.unit_price || 0))}`)
  }

  if (order.subscription_benefit) {
    const planLabel = clean(order.subscription_benefit.plan_name) || 'plano ativo'
    lines.push(`• Benefício do plano: ${planLabel} aplicado`)
    if (Number(order.regular_service_price || 0) > 0) {
      lines.push(`• Valor avulso do serviço: ${money(order.regular_service_price)}`)
    }
  }

  if (order.order_type !== 'produto') {
    lines.push(`• Serviço: ${order.service_label || order.service_type || order.order_type}`)
    lines.push(`• Horário: ${formatScheduledAt(order.scheduled_at, normalizePetbotSchedulingSettings(settings).timezone)}`)
    if (order.service_grooming_detail) lines.push(`• Acabamento: ${order.service_grooming_detail}`)
    if (Number(order.service_transport_fee || 0) > 0) {
      lines.push(`• Transporte do pet: ${money(order.service_transport_fee)}`)
    }
  } else {
    lines.push(`• Pagamento: ${order.payment_method}`)
    lines.push(`• Modalidade: ${order.fulfillment_type === 'entrega' ? 'entrega' : 'retirada na loja'}`)
    if (order.fulfillment_type === 'entrega') {
      lines.push(`• Endereço: ${[order.delivery_address, order.delivery_neighborhood, order.delivery_city].filter(Boolean).join(' - ')}`)
      lines.push(`• Referência: ${order.delivery_reference}`)
      lines.push(`• Taxa de entrega: ${money(settings.deliveryFee || 0)}`)
    }
  }

  lines.push(`• Total: ${money(order.total)}`)
  lines.push('')
  lines.push(order.order_type === 'produto' ? 'Confirma para separação?' : 'Confirma o agendamento?')
  return lines.join('\n')
}

function strictNullableString(description = '') {
  return {
    type: ['string', 'null'],
    ...(description ? { description } : {}),
  }
}

function strictNullableNumber(description = '') {
  return {
    type: ['number', 'null'],
    ...(description ? { description } : {}),
  }
}

export const PETBOT_AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_petshop_products',
      description: 'Pesquisa produtos reais e retorna candidatos, estoque, preços e os atributos que ainda diferenciam as opções.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' },
          species: { type: ['string', 'null'], enum: ['dog', 'cat', 'other', null] },
          age_category: strictNullableString(),
          size: strictNullableString(),
          brand: strictNullableString(),
          package_kg: strictNullableNumber(),
        },
        required: ['query', 'species', 'age_category', 'size', 'brand', 'package_kg'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resolve_petshop_service',
      description: 'Resolve um serviço exato do catálogo comercial usando somente os fatos já informados. Retorna o serviço ou os campos realmente ausentes.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          service_query: { type: 'string' },
          order_type: { type: 'string', enum: ['banho_tosa', 'veterinaria'] },
          species: { type: ['string', 'null'], enum: ['dog', 'cat', 'other', null] },
          breed: strictNullableString(),
          weight_kg: strictNullableNumber(),
          coat_type: strictNullableString(),
        },
        required: ['service_query', 'order_type', 'species', 'breed', 'weight_kg', 'coat_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_petshop_availability',
      description: 'Consulta a agenda real para um serviço já resolvido. Use antes de afirmar disponibilidade ou oferecer horários.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          service_id: { type: 'string', description: 'ID ou código exato retornado por resolve_petshop_service.' },
          order_type: { type: 'string', enum: ['banho_tosa', 'veterinaria'] },
          date: strictNullableString('Data YYYY-MM-DD.'),
          preferred_time: strictNullableString('Horário HH:mm quando informado.'),
          period: { type: ['string', 'null'], enum: ['specific', 'morning', 'afternoon', 'any', null] },
        },
        required: ['service_id', 'order_type', 'date', 'preferred_time', 'period'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_petshop_transport_options',
      description: 'Consulta as opções e taxas reais de transporte do pet configuradas pela loja. Use antes de oferecer MotoDog ou citar taxa.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_petshop_order',
      description: 'Revalida catálogo, preço, estoque, agenda, taxas e total e cria um pedido pendente para confirmação. Não registra a venda.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          customer_name: { type: 'string' },
          pet_name: strictNullableString(),
          species: { type: ['string', 'null'], enum: ['dog', 'cat', 'other', null] },
          size: strictNullableString(),
          breed: strictNullableString(),
          weight_kg: strictNullableNumber(),
          weight_label: strictNullableString(),
          weight_estimated: { type: 'boolean' },
          coat_type: strictNullableString(),
          symptom: strictNullableString(),
          order_type: { type: 'string', enum: ['produto', 'banho_tosa', 'veterinaria'] },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                product_id: strictNullableString(),
                name: { type: 'string' },
                quantity: { type: 'number' },
                upsell: { type: 'boolean' },
              },
              required: ['product_id', 'name', 'quantity', 'upsell'],
            },
          },
          appointment_id: strictNullableString(),
          scheduled_at: strictNullableString(),
          service_product_id: strictNullableString('UUID do produto-serviço resolvido no catálogo comercial.'),
          service_code: strictNullableString(),
          service_type: strictNullableString(),
          service_grooming_detail: strictNullableString(),
          payment_method: { type: ['string', 'null'], enum: ['pix', 'dinheiro', 'cartao', null] },
          fulfillment_type: { type: ['string', 'null'], enum: ['entrega', 'retirada', 'servico', null] },
          delivery_address: strictNullableString(),
          delivery_neighborhood: strictNullableString(),
          delivery_city: strictNullableString(),
          delivery_reference: strictNullableString(),
          change_for: strictNullableNumber(),
          service_transport_fee: strictNullableNumber(),
          service_transport_mode: strictNullableString(),
          service_transport_label: strictNullableString(),
          service_transport_address: strictNullableString(),
          service_transport_neighborhood: strictNullableString(),
          service_transport_city: strictNullableString(),
          service_transport_reference: strictNullableString(),
          notes: strictNullableString(),
        },
        required: [
          'customer_name', 'pet_name', 'species', 'size', 'breed', 'weight_kg', 'weight_label', 'weight_estimated',
          'coat_type', 'symptom', 'order_type', 'items', 'appointment_id', 'scheduled_at', 'service_product_id',
          'service_code', 'service_type', 'service_grooming_detail', 'payment_method', 'fulfillment_type',
          'delivery_address', 'delivery_neighborhood', 'delivery_city', 'delivery_reference', 'change_for',
          'service_transport_fee', 'service_transport_mode', 'service_transport_label', 'service_transport_address',
          'service_transport_neighborhood', 'service_transport_city', 'service_transport_reference', 'notes'
        ],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_confirmed_petshop_order',
      description: 'Registra exatamente o pedido pendente validado em um turno anterior após confirmação inequívoca.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { confirmation: { type: 'boolean' } },
        required: ['confirmation'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_pending_petshop_order',
      description: 'Cancela e descarta o pedido pendente quando o cliente desiste ou pede para recomeçar. Não cancela pedidos já registrados.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reason: strictNullableString(),
        },
        required: ['reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_product_image',
      description: 'Anexa a foto cadastrada de um produto real.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { product_id: { type: 'string' } },
        required: ['product_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'handoff_to_human',
      description: 'Transfere para uma pessoa quando a autonomia não consegue concluir com segurança ou o cliente solicita.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          target: { type: 'string', enum: ['atendente', 'veterinaria'] },
          reason: { type: 'string' },
        },
        required: ['target', 'reason'],
      },
    },
  },
]

export function isExplicitPetbotConfirmation(message = '') {
  const text = normalize(message).replace(/[.!?]+$/g, '').trim()
  if (!text) return false
  if (/^(sim|s|sm|confirmo|confirmado|pode|pode sim|pode finalizar|pode fechar|fecha|finaliza|ok|certo|correto|isso)$/.test(text)) return true
  return /\b(confirmo|pode finalizar|pode fechar|pode separar|confirma o agendamento|esta correto|tudo certo)\b/.test(text)
}

export function buildServiceAvailability({
  serviceQuery = '',
  orderType = 'banho_tosa',
  petName = null,
  species = null,
  breed = null,
  weightKg = null,
  coatType = null,
  date = null,
  preferredTime = null,
  period = null,
  services = [],
  appointments = [],
  settings = {},
  now = new Date(),
  requirePetIdentity = false,
  requireServiceClassification = false,
} = {}) {
  if (requirePetIdentity) {
    const missingFields = []
    if (!clean(petName)) missingFields.push('pet_name')
    if (!clean(species)) missingFields.push('species')
    if (missingFields.length) {
      const requiredFields = missingFields.map((field) => field === 'pet_name' ? 'nome do pet' : 'espécie do pet')
      return { ok: false, status: 'needs_input', missing_fields: missingFields, required_fields: requiredFields, candidates: [], available_services: [] }
    }
  }

  if (requireServiceClassification && clean(orderType) === 'banho_tosa') {
    const missingFields = []
    if (!clean(breed)) missingFields.push('breed')
    if (!positiveNumber(weightKg, 0)) missingFields.push('weight_kg')
    if (missingFields.length) {
      const requiredFields = missingFields.map((field) => field === 'breed' ? 'raça do pet' : 'peso aproximado do pet')
      return { ok: false, status: 'needs_input', missing_fields: missingFields, required_fields: requiredFields, candidates: [], available_services: [] }
    }
  }

  const resolved = resolvePetshopService({ serviceQuery, orderType, services, weightKg, coatType, breed, species })
  if (!resolved.ok) return resolved
  const resolvedId = clean(resolved.service.id)
  const resolvedCode = normalizeCode(resolved.service.code)
  const resolvedProductId = clean(resolved.service.product_id)
  const service = normalizeService((services || []).find((item) => (
    (resolvedProductId && clean(item.source_product_id) === resolvedProductId)
    || (resolvedId && clean(item.id) === resolvedId)
    || (resolvedCode && normalizeCode(item.code || item.name) === resolvedCode)
  )) || resolved.service)

  if (Number(service.default_price ?? service.price ?? 0) <= 0) {
    return { ok: false, status: 'invalid_catalog', error: 'service_without_price', service: publicService(service) }
  }

  const requestedDate = clean(date)
  if (!requestedDate) {
    return { ok: false, status: 'needs_input', missing_fields: ['date'], required_fields: ['data do agendamento'], candidates: [publicService(service)], available_services: [publicService(service)], service: publicService(service) }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return { ok: false, status: 'invalid_input', error: 'invalid_date', service: publicService(service) }
  }

  const schedule = normalizePetbotSchedulingSettings(settings)
  const day = DateTime.fromISO(requestedDate, { zone: schedule.timezone })
  if (!day.isValid) return { ok: false, status: 'invalid_input', error: 'invalid_date', service: publicService(service) }

  const requestedMinutes = preferredTime ? parseTimeMinutes(preferredTime) : null
  if (preferredTime && requestedMinutes === null) {
    return { ok: false, status: 'invalid_input', error: 'invalid_time', service: publicService(service) }
  }

  const periods = schedule.businessHours[day.weekday] || []
  const durationMin = Math.max(15, Number(service.default_duration_min ?? service.duration_min ?? 60) || 60)
  const busyAppointments = (appointments || [])
    .map((row) => normalizeAppointment(row, schedule.timezone))
    .filter((row) => BUSY_STATUSES.has(normalize(row.status)))
  const explicitAvailable = (appointments || [])
    .map((row) => normalizeAppointment(row, schedule.timezone))
    .filter((row) => AVAILABLE_STATUSES.has(normalize(row.status)))
  const nowDateTime = DateTime.fromJSDate(now).setZone(schedule.timezone)
  const slots = []

  const appointmentInterval = (row) => {
    const source = clean(row.scheduled_at)
    const start = source
      ? DateTime.fromISO(source, { setZone: true }).setZone(schedule.timezone)
      : DateTime.fromISO(`${appointmentDateIso(row, schedule.timezone)}T${appointmentTimeText(row, schedule.timezone)}`, { zone: schedule.timezone })
    if (!start.isValid) return null
    const duration = Math.max(15, Number(row.duration_min || 60) || 60)
    return { start, end: start.plus({ minutes: duration }) }
  }

  const candidateOverlaps = (candidateStart, candidateEnd, row) => {
    const interval = appointmentInterval(row)
    return Boolean(interval && candidateStart < interval.end && interval.start < candidateEnd)
  }

  const periodMatches = (minutes) => {
    if (period === 'morning') return minutes < 12 * 60
    if (period === 'afternoon') return minutes >= 12 * 60
    return true
  }

  const candidateMinutes = []
  if (requestedMinutes !== null) candidateMinutes.push(requestedMinutes)
  for (const businessPeriod of periods) {
    for (
      let minutes = businessPeriod.openMinutes;
      minutes + durationMin <= businessPeriod.closeMinutes;
      minutes += schedule.slotIntervalMin
    ) {
      if (!candidateMinutes.includes(minutes)) candidateMinutes.push(minutes)
    }
  }

  for (const minutes of candidateMinutes) {
    const containingPeriod = periods.find((businessPeriod) => (
      minutes >= businessPeriod.openMinutes && minutes + durationMin <= businessPeriod.closeMinutes
    ))
    if (!containingPeriod) continue
    if (!periodMatches(minutes) && minutes !== requestedMinutes) continue

    const time = formatTimeMinutes(minutes)
    const start = DateTime.fromISO(`${requestedDate}T${time}`, { zone: schedule.timezone })
    const end = start.plus({ minutes: durationMin })
    if (!start.isValid || start <= nowDateTime.plus({ minutes: schedule.leadTimeMin })) continue

    const overlapCount = busyAppointments.filter((row) => candidateOverlaps(start, end, row)).length
    if (overlapCount >= schedule.capacity) continue

    const explicitSlot = explicitAvailable.find((row) => {
      const interval = appointmentInterval(row)
      return interval?.start.toMillis() === start.toMillis()
    })
    const scheduledAt = start.toISO({ suppressMilliseconds: true })
    slots.push({
      id: explicitSlot?.id || null,
      service_type: service.code,
      service_product_id: service.source_product_id || null,
      scheduled_at: scheduledAt,
      service_date: requestedDate,
      start_time: `${time}:00`,
      duration_min: Number(explicitSlot?.duration_min || durationMin),
      price: Number(explicitSlot?.price || service.default_price || service.price),
      status: 'available',
      virtual: !explicitSlot,
      capacity_remaining: Math.max(0, schedule.capacity - overlapCount),
    })
  }

  slots.sort((left, right) => {
    if (requestedMinutes === null) return new Date(left.scheduled_at) - new Date(right.scheduled_at)
    const leftMinutes = parseTimeMinutes(appointmentTimeText(left, schedule.timezone)) ?? 0
    const rightMinutes = parseTimeMinutes(appointmentTimeText(right, schedule.timezone)) ?? 0
    return Math.abs(leftMinutes - requestedMinutes) - Math.abs(rightMinutes - requestedMinutes)
  })

  const requestedScheduledAt = requestedMinutes !== null
    ? DateTime.fromISO(`${requestedDate}T${formatTimeMinutes(requestedMinutes)}`, { zone: schedule.timezone }).toISO({ suppressMilliseconds: true })
    : null
  const requestedSlot = requestedScheduledAt
    ? slots.find((slot) => DateTime.fromISO(slot.scheduled_at).toMillis() === DateTime.fromISO(requestedScheduledAt).toMillis()) || null
    : null

  return {
    ok: true,
    status: slots.length ? 'available' : 'unavailable',
    source: 'products+appointments',
    timezone: schedule.timezone,
    business_date: requestedDate,
    service: publicService(service),
    requested_slot: requestedScheduledAt
      ? { scheduled_at: requestedScheduledAt, available: Boolean(requestedSlot) }
      : null,
    available_slots: slots.slice(0, 12).map((slot) => ({
      appointment_id: slot.id,
      service_product_id: slot.service_product_id,
      scheduled_at: slot.scheduled_at,
      date: slot.service_date,
      time: appointmentTimeText(slot, schedule.timezone),
      price: slot.price,
      duration_min: slot.duration_min,
      capacity_remaining: slot.capacity_remaining,
    })),
  }
}

export function preparePetshopOrderDraft({ args = {}, products = [], services = [], appointments = [], subscriptionBenefits = [], settings = {}, now = new Date() } = {}) {
  const customerName = clean(args.customer_name)
  const orderType = clean(args.order_type)
  const missing = []
  if (!customerName) missing.push('nome do cliente')
  if (!['produto', 'banho_tosa', 'veterinaria'].includes(orderType)) missing.push('tipo do pedido')

  const base = {
    customer_name: customerName,
    pet_name: nullableString(args.pet_name, 80),
    species: nullableString(args.species, 20),
    size: nullableString(args.size, 60),
    breed: nullableString(args.breed, 80),
    weight_kg: positiveNumber(args.weight_kg, 0) || null,
    weight_label: nullableString(args.weight_label, 80),
    weight_estimated: Boolean(args.weight_estimated),
    coat_type: normalizeCoatType(args.coat_type),
    symptom: nullableString(args.symptom, 200),
    order_type: orderType,
    service_grooming_detail: nullableString(args.service_grooming_detail, 160),
    notes: nullableString(args.notes, 300),
    change_for: positiveNumber(args.change_for, 0) || null,
  }

  if (orderType === 'produto') {
    const sourceItems = Array.isArray(args.items) ? args.items : []
    if (!sourceItems.length) missing.push('produto')

    const productMap = new Map((products || []).map((product) => [clean(product.id), product]))
    const normalizedItems = []
    for (const item of sourceItems) {
      const productId = clean(item.product_id)
      const product = productMap.get(productId)
      const quantity = positiveNumber(item.quantity, 0)
      if (!productId || !product) {
        missing.push(`produto real: ${clean(item.name) || 'não identificado'}`)
        continue
      }
      if (product.active === false || Number(product.stock_quantity || 0) <= 0 || Number(product.price || 0) <= 0) {
        missing.push(`produto disponível: ${clean(product.name)}`)
        continue
      }
      if (!quantity) {
        missing.push(`quantidade de ${clean(product.name)}`)
        continue
      }
      if (Number(product.stock_quantity || 0) < quantity) {
        missing.push(`estoque suficiente de ${clean(product.name)}`)
        continue
      }
      normalizedItems.push({
        product_id: productId,
        name: clean(product.name),
        quantity,
        unit_price: Number(product.price),
        upsell: Boolean(item.upsell),
      })
    }

    const paymentMethod = clean(args.payment_method).toLowerCase()
    const fulfillmentType = clean(args.fulfillment_type).toLowerCase()
    if (!['pix', 'dinheiro', 'cartao'].includes(paymentMethod)) missing.push('forma de pagamento')
    if (!['entrega', 'retirada'].includes(fulfillmentType)) missing.push('entrega ou retirada')

    const deliveryAddress = nullableString(args.delivery_address, 200)
    const deliveryNeighborhood = nullableString(args.delivery_neighborhood, 100)
    const deliveryCity = nullableString(args.delivery_city, 100)
    const deliveryReference = nullableString(args.delivery_reference, 160)
    if (fulfillmentType === 'entrega') {
      if (!deliveryAddress || !/\d/.test(deliveryAddress)) missing.push('rua e número da entrega')
      if (!deliveryNeighborhood) missing.push('bairro da entrega')
      if (!deliveryReference) missing.push('ponto de referência')
    }

    if (missing.length) return { ok: false, missing: [...new Set(missing)] }

    const subtotal = normalizedItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
    const deliveryFee = fulfillmentType === 'entrega' ? Number(settings.deliveryFee || 0) : 0
    const order = {
      ...base,
      items: normalizedItems,
      payment_method: paymentMethod,
      fulfillment_type: fulfillmentType,
      delivery_address: deliveryAddress,
      delivery_neighborhood: deliveryNeighborhood,
      delivery_city: deliveryCity,
      delivery_reference: deliveryReference,
      total: subtotal + deliveryFee,
    }
    const pendingOrderId = buildPendingOrderId(order)
    return {
      ok: true,
      pending_order_id: pendingOrderId,
      order,
      summary: formatOrderSummary(order, settings),
    }
  }

  if (!base.pet_name) missing.push('nome do pet')
  if (!base.species) missing.push('espécie do pet')
  if (orderType === 'banho_tosa') {
    if (!base.breed) missing.push('raça do pet')
    if (!base.weight_kg) missing.push('peso aproximado do pet')
  } else if (!base.size && !base.breed) {
    missing.push('porte ou raça do pet')
  }
  if (orderType === 'veterinaria' && !base.symptom) missing.push('problema principal')

  const schedule = normalizePetbotSchedulingSettings(settings)
  const normalizedAppointments = (appointments || []).map((row) => normalizeAppointment(row, schedule.timezone))
  const requestedAppointmentId = clean(args.appointment_id)
  let requestedScheduledAt = clean(args.scheduled_at)
  const explicitAppointment = requestedAppointmentId
    ? normalizedAppointments.find((row) => clean(row.id) === requestedAppointmentId)
    : null
  if (explicitAppointment?.scheduled_at) requestedScheduledAt = clean(explicitAppointment.scheduled_at)

  const serviceQuery = clean(args.service_product_id || args.service_code || args.service_type || explicitAppointment?.service_type)
  const selection = serviceSelection({
    serviceQuery,
    orderType,
    services,
    weightKg: base.weight_kg,
    coatType: base.coat_type,
    breed: base.breed,
    species: base.species,
  })
  const serviceDefinition = selection.service
  if (serviceDefinition && !base.coat_type) {
    base.coat_type = serviceDefinition.coat_type && serviceDefinition.coat_type !== 'todas'
      ? serviceDefinition.coat_type
      : classifyCommonPetBreed(base.breed)?.coat_type || null
  }
  if (!serviceDefinition) {
    if (selection.required_fields.length) missing.push(...selection.required_fields)
    else missing.push('serviço ativo do cadastro')
  }
  if (!requestedScheduledAt) missing.push('horário real da agenda')

  const requestedDate = appointmentDateIso({ scheduled_at: requestedScheduledAt }, schedule.timezone)
  const requestedTime = appointmentTimeText({ scheduled_at: requestedScheduledAt }, schedule.timezone)
  const availability = serviceDefinition && requestedDate && requestedTime
    ? buildServiceAvailability({
      serviceQuery: serviceDefinition.code,
      orderType,
      weightKg: base.weight_kg,
      coatType: base.coat_type,
      breed: base.breed,
      species: base.species,
      date: requestedDate,
      preferredTime: requestedTime,
      period: 'specific',
      services,
      appointments,
      settings,
      now,
    })
    : null
  const availableSlot = availability?.available_slots?.find((slot) => sameScheduledInstant(slot.scheduled_at, requestedScheduledAt)) || null
  if (requestedScheduledAt && (!availability?.ok || !availableSlot)) missing.push('horário disponível')

  const regularServicePrice = Number(availableSlot?.price ?? serviceDefinition?.default_price ?? 0)
  if (serviceDefinition && regularServicePrice <= 0) missing.push('preço confirmado do serviço')
  const subscriptionBenefit = serviceDefinition
    ? findPetshopSubscriptionBenefit(serviceDefinition, subscriptionBenefits)
    : null
  const servicePrice = subscriptionBenefit ? 0 : regularServicePrice

  const transport = resolvePetTransportSelection({ args, settings, orderType })
  if (!transport.ok) missing.push(transport.error)
  const transportAddress = nullableString(args.service_transport_address, 200)
  const transportNeighborhood = nullableString(args.service_transport_neighborhood, 100)
  const transportCity = nullableString(args.service_transport_city, 100)
  const transportReference = nullableString(args.service_transport_reference, 160)
  if (transport.ok && transport.requested) {
    if (!transportAddress || !/\d/.test(transportAddress)) missing.push('rua e número para transporte do pet')
    if (!transportNeighborhood) missing.push('bairro para transporte do pet')
    if (!transportReference) missing.push('ponto de referência para transporte do pet')
  }

  if (missing.length) return { ok: false, missing: [...new Set(missing)] }

  const serviceType = serviceDefinition.code
  const serviceTransportFee = Number(transport.fee || 0)
  const order = {
    ...base,
    items: [{
      product_id: null,
      name: serviceDefinition.name,
      quantity: 1,
      unit_price: servicePrice,
      upsell: false,
    }],
    appointment_id: availableSlot.appointment_id || null,
    scheduled_at: availableSlot.scheduled_at,
    service_product_id: serviceDefinition.source_product_id || null,
    service_type: serviceType,
    service_label: serviceDefinition.name,
    service_kind: serviceDefinition.service_kind || serviceKind(`${serviceDefinition.code || ''} ${serviceDefinition.name || ''}`),
    regular_service_price: regularServicePrice,
    subscription_benefit: subscriptionBenefit,
    duration_min: Number(availableSlot.duration_min || serviceDefinition.default_duration_min || 60),
    payment_method: null,
    fulfillment_type: 'servico',
    service_transport_fee: serviceTransportFee,
    service_transport_mode: transport.mode,
    service_transport_label: transport.label,
    service_transport_address: transport.requested ? transportAddress : null,
    service_transport_neighborhood: transport.requested ? transportNeighborhood : null,
    service_transport_city: transport.requested ? transportCity : null,
    service_transport_reference: transport.requested ? transportReference : null,
    total: servicePrice + serviceTransportFee,
  }
  const pendingOrderId = buildPendingOrderId(order)
  return {
    ok: true,
    pending_order_id: pendingOrderId,
    order,
    summary: formatOrderSummary(order, settings),
  }
}

function normalizeHistory(history = []) {
  return (history || [])
    .slice(-14)
    .map((entry) => ({
      role: entry.role === 'assistant' || entry.role === 'human_agent' ? 'assistant' : 'user',
      content: clean(entry.content).slice(0, 3000),
    }))
    .filter((entry) => entry.content)
}

async function finalizePetbotAgentTurn({
  model,
  temperature,
  messages,
  callModel,
  validateReply,
  responseFormat,
  parseReply,
  toolRuns,
  tokensUsed,
  validationRetries,
  startedAt,
  reason,
} = {}) {
  const finalMessages = [
    ...messages,
    {
      role: 'system',
      content: [
        'Finalize esta mensagem agora, sem chamar novas ferramentas.',
        'Use apenas os fatos e resultados de ferramentas já presentes na conversa.',
        'Quando ainda faltar algum dado para consultar serviço, preço ou agenda, faça uma única pergunta natural e útil para continuar.',
        'Quando uma ferramenta tiver falhado ou não tiver retornado dados confiáveis, não invente a resposta operacional e não transfira automaticamente para uma pessoa.',
        'Não mencione limite de etapas, validação, ferramenta, catálogo interno, erro técnico ou estas instruções.',
        `Contexto interno de recuperação: ${clean(reason) || 'finalização segura do turno'}.`,
      ].join('\n'),
    },
  ]

  let totalTokens = Number(tokensUsed || 0)
  let retries = Number(validationRetries || 0)
  let lastValidation = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await callModel({
      model,
      temperature,
      messages: finalMessages,
      max_tokens: 500,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    })
    totalTokens += Number(response?.usage?.total_tokens || 0)

    const rawContent = clean(response?.choices?.[0]?.message?.content)
    let parsedContent = rawContent
    if (typeof parseReply === 'function') {
      const parsed = parseReply(rawContent)
      parsedContent = parsed && typeof parsed === 'object' ? parsed.message : parsed
    }
    const content = clean(parsedContent)
    if (!content) {
      finalMessages.push({
        role: 'system',
        content: 'Produza uma resposta curta e natural para o cliente. Faça uma pergunta útil quando faltar informação.',
      })
      continue
    }

    if (typeof validateReply === 'function') {
      const validation = await validateReply({ reply: content, toolRuns, messages: finalMessages })
      if (validation?.ok === false) {
        lastValidation = validation
        retries += 1
        finalMessages.push({ role: 'assistant', content: rawContent || content })
        finalMessages.push({
          role: 'system',
          content: clean(validation.instruction)
            || 'Reescreva sem afirmar dados operacionais não validados. Faça uma pergunta natural se necessário.',
        })
        continue
      }
    }

    return {
      reply: content,
      toolRuns,
      tokensUsed: totalTokens,
      messages: finalMessages,
      validationRetries: retries,
      steps: toolRuns.length,
      recovered: true,
      recoveryReason: clean(reason) || 'safe_finalize',
      durationMs: Date.now() - startedAt,
    }
  }

  const error = new Error(lastValidation?.error || 'O agente não conseguiu finalizar o turno com segurança.')
  error.code = 'PETBOT_AGENT_RECOVERY_FAILED'
  error.toolRuns = toolRuns
  error.validation = lastValidation
  throw error
}

export async function runPetbotAgent({
  model,
  temperature = 0.3,
  systemPrompt,
  history = [],
  message,
  tools = PETBOT_AGENT_TOOLS,
  callModel,
  executeTool,
  maxSteps = MAX_AGENT_STEPS,
  initialToolChoice = 'auto',
  validateReply = null,
  responseFormat = null,
  parseReply = null,
} = {}) {
  if (typeof callModel !== 'function') throw new TypeError('callModel is required')
  if (typeof executeTool !== 'function') throw new TypeError('executeTool is required')

  const messages = [
    { role: 'system', content: clean(systemPrompt) },
    ...normalizeHistory(history),
    { role: 'user', content: clean(message) },
  ]
  const toolRuns = []
  let tokensUsed = 0
  let validationRetries = 0
  const repeatedToolCalls = new Map()
  let forcedRecoveryReason = null
  const startedAt = Date.now()

  for (let step = 0; step < Math.max(1, maxSteps); step += 1) {
    const response = await callModel({
      model,
      temperature,
      messages,
      tools,
      tool_choice: step === 0 ? initialToolChoice : 'auto',
      parallel_tool_calls: false,
      max_tokens: 800,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    })
    tokensUsed += Number(response?.usage?.total_tokens || 0)

    const assistantMessage = response?.choices?.[0]?.message || {}
    const toolCalls = Array.isArray(assistantMessage.tool_calls) ? assistantMessage.tool_calls : []
    const rawContent = clean(assistantMessage.content)
    let parsedContent = rawContent
    if (typeof parseReply === 'function') {
      const parsed = parseReply(rawContent)
      parsedContent = parsed && typeof parsed === 'object' ? parsed.message : parsed
    }
    const content = clean(parsedContent)

    if (!toolCalls.length) {
      if (!content) {
        return finalizePetbotAgentTurn({
          model,
          temperature,
          messages,
          callModel,
          validateReply,
          responseFormat,
          parseReply,
          toolRuns,
          tokensUsed,
          validationRetries,
          startedAt,
          reason: 'resposta vazia antes da conclusão do turno',
        })
      }
      if (typeof validateReply === 'function') {
        const validation = await validateReply({
          reply: content,
          toolRuns,
          messages,
        })
        if (validation?.ok === false) {
          if (step >= Math.max(1, maxSteps) - 1) {
            return finalizePetbotAgentTurn({
              model,
              temperature,
              messages: [
                ...messages,
                { role: 'assistant', content: rawContent || content },
                { role: 'system', content: clean(validation.instruction) },
              ],
              callModel,
              validateReply,
              responseFormat,
              parseReply,
              toolRuns,
              tokensUsed,
              validationRetries: validationRetries + 1,
              startedAt,
              reason: validation.error || `resposta operacional inválida: ${(validation.problems || []).join('; ')}`,
            })
          }
          validationRetries += 1
          messages.push({ role: 'assistant', content })
          messages.push({
            role: 'system',
            content: clean(validation.instruction)
              || 'Reescreva a resposta de forma natural, sem afirmar dados operacionais que não foram validados.',
          })
          continue
        }
      }
      return {
        reply: content,
        toolRuns,
        tokensUsed,
        messages,
        validationRetries,
        steps: step + 1,
        durationMs: Date.now() - startedAt,
      }
    }

    messages.push({
      role: 'assistant',
      content: assistantMessage.content || null,
      tool_calls: toolCalls,
    })

    for (const toolCall of toolCalls) {
      let result
      const toolStartedAt = Date.now()
      try {
        result = await executeTool(toolCall)
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
      const toolName = clean(toolCall?.function?.name)
      const toolStatus = clean(result?.status) || null
      toolRuns.push({
        name: toolName,
        ok: result?.ok !== false,
        status: toolStatus,
        duration_ms: Date.now() - toolStartedAt,
        result,
      })
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolName,
        content: JSON.stringify(result).slice(0, 12000),
      })

      const signature = `${toolName}:${clean(toolCall?.function?.arguments)}:${toolStatus || ''}`
      const repetitions = (repeatedToolCalls.get(signature) || 0) + 1
      repeatedToolCalls.set(signature, repetitions)
      if (repetitions >= 2) {
        forcedRecoveryReason = `ferramenta repetida sem novos fatos: ${toolName}${toolStatus ? ` (${toolStatus})` : ''}`
      }
    }

    if (forcedRecoveryReason) {
      return finalizePetbotAgentTurn({
        model,
        temperature,
        messages,
        callModel,
        validateReply,
        responseFormat,
        parseReply,
        toolRuns,
        tokensUsed,
        validationRetries,
        startedAt,
        reason: forcedRecoveryReason,
      })
    }
  }

  return finalizePetbotAgentTurn({
    model,
    temperature,
    messages,
    callModel,
    validateReply,
    responseFormat,
    parseReply,
    toolRuns,
    tokensUsed,
    validationRetries,
    startedAt,
    reason: 'limite de etapas atingido antes de uma resposta final',
  })
}
