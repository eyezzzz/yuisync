import { classifyCommonPetBreed } from '../../shared/petbotBreedCatalog.js'

const FOOD_BRANDS = new Map([
  ['premier', 'premier'],
  ['royal canin', 'royal canin'],
  ['royal', 'royal'],
  ['golden', 'golden'],
  ['pedigree', 'pedigree'],
  ['whiskas', 'whiskas'],
  ['special dog', 'special dog'],
  ['formula natural', 'formula natural'],
  ['gran plus', 'gran plus'],
  ['quatree', 'quatree'],
  ['origens', 'origens'],
  ['biofresh', 'biofresh'],
  ['hills', 'hills'],
  ['hill s', 'hills'],
  ['pro plan', 'pro plan'],
])

const TYPE_ALIASES = {
  racao: ['racao', 'alimento'],
  granel: ['granel'],
  petisco: ['petisco', 'bifinho', 'snack', 'dental', 'ossinho', 'osso', 'sache', 'filezitos', 'canister'],
  antipulgas: ['antipulga', 'antipulgas', 'pulga', 'carrapato', 'bravecto', 'nexgard', 'simparic', 'credeli', 'advocate'],
  areia: ['areia', 'higienica'],
  higiene: ['shampoo', 'condicionador', 'perfume', 'sabonete', 'higiene', 'limpeza'],
  acessorio: ['coleira', 'guia', 'brinquedo', 'tapete', 'comedouro', 'bebedouro'],
}

const NEGATIVE_RATION_TERMS = [
  'petisco',
  'bifinho',
  'snack',
  'dental',
  'ossinho',
  'osso',
  'sache',
  'filezitos',
  'canister',
  'shampoo',
  'antipulga',
  'bravecto',
  'nexgard',
  'simparic',
  'advocate',
  'areia',
  'higienica',
  'tapete',
]

const CATALOG_STOP_WORDS = new Set([
  'quero',
  'queria',
  'pode',
  'poderia',
  'tem',
  'tenho',
  'uma',
  'um',
  'para',
  'pra',
  'pro',
  'meu',
  'minha',
  'dele',
  'dela',
  'ele',
  'ela',
  'de',
  'da',
  'do',
  'das',
  'dos',
  'kg',
  'quilo',
  'quilos',
  'saco',
  'pacote',
  'fechado',
  'racao',
  'comida',
])

export function normalizeCatalogText(value = '') {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function hasAny(text, terms) {
  const normalized = normalizeCatalogText(text)
  return terms.some((term) => normalized.includes(normalizeCatalogText(term)))
}

function objectValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function catalogTokens(text = '') {
  return normalizeCatalogText(text)
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !CATALOG_STOP_WORDS.has(token))
}

function productText(product = {}) {
  product = product || {}
  return normalizeCatalogText([
    product.name,
    product.category,
    product.description,
    product.species_target,
    product.barcode,
  ].filter(Boolean).join(' '))
}

function detectBrand(text = '') {
  const normalized = normalizeCatalogText(text)
  for (const [needle, brand] of FOOD_BRANDS.entries()) {
    if (normalized.includes(needle)) return brand
  }
  return ''
}

function detectBreed(text = '') {
  const normalized = normalizeCatalogText(text)
  const classification = classifyCommonPetBreed(normalized)
  if (classification) {
    return {
      label: normalizeCatalogText(classification.canonical),
      size: normalizeCatalogText(classification.size),
    }
  }
  return { label: '', size: '' }
}

function detectAge(text = '') {
  const normalized = normalizeCatalogText(text)
  if (/filhote|puppy|junior/.test(normalized)) return 'filhote'
  if (/castrad/.test(normalized)) return 'castrado'
  if (/senior|idos/.test(normalized)) return 'senior'
  if (/adult/.test(normalized)) return 'adulto'
  return ''
}

function detectSpecies(text = '') {
  const normalized = normalizeCatalogText(text)
  if (/\b(gato|gatos|gata|gatas|felino|felinos|cat)\b/.test(normalized) || /whiskas|kitekat/.test(normalized)) return 'cat'
  if (/\b(cao|caes|cachorro|cachorra|canino|caninos|dog)\b/.test(normalized) || detectBreed(normalized).label || /special dog|pedigree/.test(normalized)) return 'dog'
  return ''
}

export function detectCatalogPetSize(text = '') {
  const normalized = normalizeCatalogText(text)
  if (/racas? pequenas?|porte pequeno|pequeno|mini|\bpeq\b|\brp\b|rac peq/.test(normalized)) return 'pequeno'
  if (/racas? medias?|porte medio|medio|\bmed\b|\brm\b|rac med/.test(normalized)) return 'medio'
  if (/racas? grandes?|porte grande|grande|\bgrd\b|\brg\b|rac gr/.test(normalized)) return 'grande'
  return detectBreed(normalized).size || ''
}

export function extractPackageKg(text = '') {
  const normalized = normalizeCatalogText(text).replace(/,/g, '.')
  const matches = [...normalized.matchAll(/\b(\d{1,2}(?:\.\d{1,2})?)\s*kg\b/g)]
  if (!matches.length) return null
  const value = Number(matches[matches.length - 1][1])
  return Number.isFinite(value) && value > 0 ? value : null
}

export function normalizeRationPackagePreference(value = '', packageKg = null) {
  const normalized = normalizeCatalogText(value)
  const lastMatchIndex = (pattern) => {
    const matches = [...normalized.matchAll(pattern)]
    return matches.length ? matches.at(-1).index : -1
  }
  const explicitPreferences = [
    { value: 'granel', index: lastMatchIndex(/\bgranel\b/g) },
    {
      value: 'pacote_pequeno',
      index: Math.max(
        lastMatchIndex(/\bpacote_pequeno\b/g),
        lastMatchIndex(/\b(?:pacote|embalagem)\s+(?:pequen[oa]|menor)\b/g),
      ),
    },
    {
      value: 'saco_maior',
      index: Math.max(
        lastMatchIndex(/\bsaco_maior\b/g),
        lastMatchIndex(/\b(?:saco|sacaria|embalagem)\s+(?:maior|grande|fechad[oa])\b/g),
        lastMatchIndex(/\b(?:saco|sacaria)\b/g),
      ),
    },
  ].filter((entry) => entry.index >= 0)
  if (explicitPreferences.length) {
    return explicitPreferences.sort((left, right) => right.index - left.index)[0].value
  }

  const explicitKg = Number(packageKg || extractPackageKg(normalized) || 0)
  if (explicitKg > 0) return explicitKg >= 7 ? 'saco_maior' : 'pacote_pequeno'
  return ''
}

export function rationPackagePreferenceForProduct(product = {}) {
  const metadata = product?.type ? product : classifyProduct(product)
  if (metadata.isBulk || metadata.type === 'granel') return 'granel'
  if (Number(metadata.packageKg || 0) >= 7) return 'saco_maior'
  if (Number(metadata.packageKg || 0) > 0) return 'pacote_pequeno'
  return ''
}

export function buildRationPackagePreferenceReply(message = '', state = {}) {
  const request = detectCatalogRequest(message, state)
  if (!['racao', 'granel'].includes(request.type)) return ''
  if (request.packagePreference || request.packageKg) return ''
  return 'Você prefere a ração a granel, pacote pequeno de 1 ou 2 kg, ou saco maior de 7, 10, 15, 20 ou 25 kg?'
}

export function classifyProduct(product = {}) {
  product = product || {}
  const text = productText(product)
  const category = normalizeCatalogText(product.category)
  const name = normalizeCatalogText(product.name)
  const metadata = objectValue(product.bot_metadata)
  const isBulk = metadata.is_bulk === true || /\bgranel\b/.test(text) || /\ba granel\b/.test(text)
  const brand = normalizeCatalogText(metadata.brand) || detectBrand(text)
  const metadataBreed = Array.isArray(metadata.breed)
    ? (metadata.breed.length === 1 ? metadata.breed[0] : '')
    : metadata.breed
  const breed = metadataBreed
    ? { label: normalizeCatalogText(metadataBreed), normalized: normalizeCatalogText(metadataBreed) }
    : detectBreed(text)
  const age = normalizeCatalogText(metadata.age_category || metadata.age) || detectAge(text)
  const species = normalizeCatalogText(metadata.species || product.species_target) || detectSpecies(text)
  const size = normalizeCatalogText(metadata.size || metadata.pet_size) || detectCatalogPetSize(text)
  const metadataPackageKg = Number(metadata.package_kg || metadata.packageKg || 0)
  const packageKg = isBulk ? null : (metadataPackageKg > 0 ? metadataPackageKg : extractPackageKg(text))
  let type = normalizeCatalogText(metadata.product_type || metadata.type) || 'outro'

  if (isBulk) {
    type = 'granel'
  } else if (/\bracao\b/.test(category)) {
    type = 'racao'
  } else if (type !== 'outro') {
    // Editable catalog metadata wins over name heuristics.
  } else if (hasAny(text, TYPE_ALIASES.antipulgas)) {
    type = 'antipulgas'
  } else if (hasAny(text, TYPE_ALIASES.areia)) {
    type = 'areia'
  } else if (hasAny(text, TYPE_ALIASES.higiene)) {
    type = 'higiene'
  } else if (hasAny(text, TYPE_ALIASES.petisco)) {
    type = 'petisco'
  } else if (
    hasAny(text, TYPE_ALIASES.racao)
    || (brand && /\b(kg|adult|filhote|castrad|senior|racas|raca|porte|cao|caes|gato|gatos)\b/.test(text))
  ) {
    type = 'racao'
  } else if (hasAny(text, TYPE_ALIASES.acessorio)) {
    type = 'acessorio'
  }

  if (type === 'racao' && NEGATIVE_RATION_TERMS.some((term) => text.includes(normalizeCatalogText(term)))) {
    type = hasAny(text, TYPE_ALIASES.petisco) ? 'petisco' : 'outro'
  }

  return {
    type,
    brand,
    species,
    breed: breed.label,
    size,
    age,
    packageKg,
    isBulk,
    barcode: String(product.barcode || '').trim(),
    searchable: `${name} ${category} ${text}`.trim(),
  }
}

export function detectCatalogRequest(message = '', state = {}) {
  const productKind = state.productKind || state.product_kind
  const statePackagePreference = state.packagePreference || state.package_preference
  const statePackageKg = state.packageKg || state.package_kg
  const ageCategory = state.ageCategory || state.age_category
  const text = normalizeCatalogText([
    message,
    productKind,
    statePackagePreference,
    state.brand,
    state.breed,
    ageCategory,
  ].filter(Boolean).join(' '))
  const packageKg = extractPackageKg(message) || Number(statePackageKg || 0) || null
  const packagePreference = normalizeRationPackagePreference(
    [statePackagePreference, message].filter(Boolean).join(' '),
    packageKg,
  )
  const wantsBulk = packagePreference === 'granel'
  const wantsRation = /racao|alimento|comida|premier|royal|golden|pedigree|whiskas|special dog|formula natural|gran plus|quatree/.test(text)
    || productKind === 'food'
    || wantsBulk
    || Boolean(packageKg)
  const wantsFlea = hasAny(text, TYPE_ALIASES.antipulgas) || productKind === 'flea'
  const wantsLitter = hasAny(text, TYPE_ALIASES.areia) || productKind === 'litter'

  if (wantsFlea) return { type: 'antipulgas', packageKg, wantsBulk, packagePreference }
  if (wantsLitter) return { type: 'areia', packageKg, wantsBulk, packagePreference }
  if (wantsRation) return { type: wantsBulk ? 'granel' : 'racao', packageKg, wantsBulk, packagePreference }
  if (hasAny(text, TYPE_ALIASES.higiene)) return { type: 'higiene', packageKg, wantsBulk, packagePreference }
  if (hasAny(text, TYPE_ALIASES.petisco)) return { type: 'petisco', packageKg, wantsBulk, packagePreference }
  if (hasAny(text, TYPE_ALIASES.acessorio)) return { type: 'acessorio', packageKg, wantsBulk, packagePreference }
  return { type: '', packageKg, wantsBulk, packagePreference }
}

function allowedTypeForRequest(requestType, metadata) {
  if (!requestType) return true
  if (requestType === 'racao') return metadata.type === 'racao' || metadata.type === 'granel'
  if (requestType === 'granel') return metadata.type === 'granel'
  return metadata.type === requestType
}

function allowedPackageForPreference(packagePreference, metadata) {
  if (!packagePreference) return true
  return rationPackagePreferenceForProduct(metadata) === packagePreference
}

function exactPackageScore(metadata, requestedKg) {
  if (!requestedKg || metadata.isBulk) return 0
  if (!metadata.packageKg) return -4
  if (metadata.packageKg === requestedKg) return 36
  const distance = Math.abs(metadata.packageKg - requestedKg)
  if (distance <= 1) return 12
  if (metadata.packageKg < requestedKg) return Math.max(2, 10 - distance)
  return Math.max(-8, 4 - distance)
}

function scoreMetadata(metadata, state = {}, message = '') {
  const request = detectCatalogRequest(message, state)
  const requestText = normalizeCatalogText(message)
  const requestedBreed = normalizeCatalogText(state.breed)
  const productBreed = normalizeCatalogText(metadata.breed)
  const requestedBrand = normalizeCatalogText(state.brand)
  const requestedAge = state.ageCategory || state.age_category
  const rationRequest = request.type === 'racao' || request.type === 'granel'
  let score = 0

  if (request.type && !allowedTypeForRequest(request.type, metadata)) return -999
  if (!allowedPackageForPreference(request.packagePreference, metadata)) return -999
  if (rationRequest && state.species && metadata.species && metadata.species !== state.species) return -999
  if (
    rationRequest
    && requestedBreed
    && productBreed
    && !requestedBreed.includes(productBreed)
    && !productBreed.includes(requestedBreed)
  ) return -999
  if (rationRequest && state.size && metadata.size && metadata.size !== state.size) return -999
  if (metadata.barcode && requestText.includes(normalizeCatalogText(metadata.barcode))) score += 100
  for (const token of catalogTokens(message)) {
    if (metadata.searchable.includes(token)) score += token.length >= 5 ? 4 : 2
  }
  if (state.species && metadata.species && metadata.species !== state.species) score -= 60
  if (state.species && metadata.species === state.species) score += 16
  if (requestedAge && metadata.age === requestedAge) score += 14
  if (requestedAge && metadata.age && metadata.age !== requestedAge) score -= 18
  if (state.breed && metadata.breed && requestedBreed.includes(productBreed)) score += 20
  if (state.breed && !metadata.breed && metadata.size && state.size === metadata.size) score += 8
  if (state.breed && metadata.breed && !requestedBreed.includes(productBreed)) score -= 8
  if (state.size && metadata.size === state.size) score += 10
  if (state.size && metadata.size && metadata.size !== state.size) score -= 6
  if (state.brand && metadata.brand === requestedBrand) score += 22
  if (state.brand && metadata.brand && metadata.brand !== requestedBrand) score -= 8

  if (request.type === 'granel' || request.packagePreference === 'granel') {
    score += metadata.isBulk ? 35 : -80
  } else if (request.type === 'racao') {
    score += metadata.type === 'racao' ? 10 : 0
    score += metadata.type === 'granel' ? 4 : 0
  }

  score += exactPackageScore(metadata, request.packageKg)
  if (metadata.packageKg) score += Math.min(metadata.packageKg, 20) / 20
  return score
}

export function rankCatalogProducts(products = [], state = {}, message = '') {
  const available = (products || []).filter((product) => (
    product?.active !== false
    && Number(product?.stock_quantity || 0) > 0
    && Number(product?.price || 0) >= 0
  ))
  const request = detectCatalogRequest(message, state)
  const requestedQuantity = Number(state.pendingQuantity || state.selectedProduct?.quantity || 0)

  return available
    .map((product) => {
      const metadata = classifyProduct(product)
      let score = scoreMetadata(metadata, state, message)
      if (requestedQuantity > 0 && metadata.isBulk && Number(product.stock_quantity || 0) < requestedQuantity) score = -999
      return { product, metadata, score }
    })
    .filter((item) => item.score > -999)
    .filter((item) => !request.type || allowedTypeForRequest(request.type, item.metadata))
    .sort((a, b) => (
      b.score - a.score
      || Number(a.metadata.packageKg || 0) - Number(b.metadata.packageKg || 0)
      || Number(a.product.price || 0) - Number(b.product.price || 0)
      || String(a.product.name || '').localeCompare(String(b.product.name || ''), 'pt-BR')
    ))
}

export function isCatalogType(product = {}, type = '') {
  const metadata = classifyProduct(product)
  if (type === 'racao') return metadata.type === 'racao' || metadata.type === 'granel'
  return metadata.type === type
}
