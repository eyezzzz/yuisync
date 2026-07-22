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

const DOG_BREEDS = new Map([
  ['shih tzu', { label: 'shih tzu', size: 'pequeno' }],
  ['shi tzu', { label: 'shih tzu', size: 'pequeno' }],
  ['shihtzu', { label: 'shih tzu', size: 'pequeno' }],
  ['shitzu', { label: 'shih tzu', size: 'pequeno' }],
  ['yorkshire', { label: 'yorkshire', size: 'pequeno' }],
  ['lhasa', { label: 'lhasa', size: 'pequeno' }],
  ['lhasa apso', { label: 'lhasa', size: 'pequeno' }],
  ['spitz', { label: 'spitz', size: 'pequeno' }],
  ['spitz alemao', { label: 'spitz', size: 'pequeno' }],
  ['poodle', { label: 'poodle', size: 'pequeno' }],
  ['pinscher', { label: 'pinscher', size: 'pequeno' }],
  ['maltese', { label: 'maltes', size: 'pequeno' }],
  ['maltes', { label: 'maltes', size: 'pequeno' }],
  ['pug', { label: 'pug', size: 'pequeno' }],
  ['bulldog frances', { label: 'bulldog frances', size: 'pequeno' }],
  ['golden', { label: 'golden', size: 'grande' }],
  ['labrador', { label: 'labrador', size: 'grande' }],
  ['rottweiler', { label: 'rottweiler', size: 'grande' }],
  ['pastor alemao', { label: 'pastor alemao', size: 'grande' }],
  ['pitbull', { label: 'pitbull', size: 'grande' }],
  ['border collie', { label: 'border collie', size: 'medio' }],
  ['beagle', { label: 'beagle', size: 'medio' }],
  ['cocker', { label: 'cocker', size: 'medio' }],
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
  for (const [needle, breed] of DOG_BREEDS.entries()) {
    if (normalized.includes(needle)) return breed
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

function detectSize(text = '') {
  const normalized = normalizeCatalogText(text)
  if (/racas pequenas|raca pequena|porte pequeno|pequeno|mini|\brp\b/.test(normalized)) return 'pequeno'
  if (/racas medias|racas media|porte medio|medio|\brm\b/.test(normalized)) return 'medio'
  if (/racas grandes|racas grande|porte grande|grande|\brg\b/.test(normalized)) return 'grande'
  return detectBreed(normalized).size || ''
}

export function extractPackageKg(text = '') {
  const normalized = normalizeCatalogText(text).replace(/,/g, '.')
  const matches = [...normalized.matchAll(/\b(\d{1,2}(?:\.\d{1,2})?)\s*kg\b/g)]
  if (!matches.length) return null
  const value = Number(matches[matches.length - 1][1])
  return Number.isFinite(value) && value > 0 ? value : null
}

export function classifyProduct(product = {}) {
  product = product || {}
  const text = productText(product)
  const category = normalizeCatalogText(product.category)
  const name = normalizeCatalogText(product.name)
  const metadata = objectValue(product.bot_metadata)
  const isBulk = metadata.is_bulk === true || /\bgranel\b/.test(text) || /\ba granel\b/.test(text)
  const brand = normalizeCatalogText(metadata.brand) || detectBrand(text)
  const breed = metadata.breed
    ? { label: String(metadata.breed).trim(), normalized: normalizeCatalogText(metadata.breed) }
    : detectBreed(text)
  const age = normalizeCatalogText(metadata.age_category || metadata.age) || detectAge(text)
  const species = normalizeCatalogText(metadata.species || product.species_target) || detectSpecies(text)
  const size = normalizeCatalogText(metadata.size || metadata.pet_size) || detectSize(text)
  const metadataPackageKg = Number(metadata.package_kg || metadata.packageKg || 0)
  const packageKg = isBulk ? null : (metadataPackageKg > 0 ? metadataPackageKg : extractPackageKg(text))
  let type = normalizeCatalogText(metadata.product_type || metadata.type) || 'outro'

  if (isBulk) {
    type = 'granel'
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
  const text = normalizeCatalogText([
    message,
    state.productKind,
    state.packagePreference,
    state.brand,
    state.breed,
    state.ageCategory,
  ].filter(Boolean).join(' '))
  const packageKg = extractPackageKg(message) || Number(state.packageKg || 0) || null
  const wantsBulk = /\bgranel\b/.test(text) || state.packagePreference === 'granel'
  const wantsRation = /racao|alimento|comida|premier|royal|golden|pedigree|whiskas|special dog|formula natural|gran plus|quatree/.test(text)
    || state.productKind === 'food'
    || wantsBulk
    || Boolean(packageKg)
  const wantsFlea = hasAny(text, TYPE_ALIASES.antipulgas) || state.productKind === 'flea'
  const wantsLitter = hasAny(text, TYPE_ALIASES.areia) || state.productKind === 'litter'

  if (wantsFlea) return { type: 'antipulgas', packageKg, wantsBulk }
  if (wantsLitter) return { type: 'areia', packageKg, wantsBulk }
  if (wantsRation) return { type: wantsBulk ? 'granel' : 'racao', packageKg, wantsBulk }
  if (hasAny(text, TYPE_ALIASES.higiene)) return { type: 'higiene', packageKg, wantsBulk }
  if (hasAny(text, TYPE_ALIASES.petisco)) return { type: 'petisco', packageKg, wantsBulk }
  if (hasAny(text, TYPE_ALIASES.acessorio)) return { type: 'acessorio', packageKg, wantsBulk }
  return { type: '', packageKg, wantsBulk }
}

function allowedTypeForRequest(requestType, metadata) {
  if (!requestType) return true
  if (requestType === 'racao') return metadata.type === 'racao' || metadata.type === 'granel'
  if (requestType === 'granel') return metadata.type === 'granel'
  return metadata.type === requestType
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
  let score = 0

  if (request.type && !allowedTypeForRequest(request.type, metadata)) return -999
  if (metadata.barcode && requestText.includes(normalizeCatalogText(metadata.barcode))) score += 100
  for (const token of catalogTokens(message)) {
    if (metadata.searchable.includes(token)) score += token.length >= 5 ? 4 : 2
  }
  if (state.species && metadata.species && metadata.species !== state.species) score -= 60
  if (state.species && metadata.species === state.species) score += 16
  if (state.ageCategory && metadata.age === state.ageCategory) score += 14
  if (state.ageCategory && metadata.age && metadata.age !== state.ageCategory) score -= 18
  if (state.breed && metadata.breed && normalizeCatalogText(state.breed).includes(metadata.breed)) score += 20
  if (state.breed && !metadata.breed && metadata.size && state.size === metadata.size) score += 8
  if (state.breed && metadata.breed && !normalizeCatalogText(state.breed).includes(metadata.breed)) score -= 8
  if (state.size && metadata.size === state.size) score += 10
  if (state.size && metadata.size && metadata.size !== state.size) score -= 6
  if (state.brand && metadata.brand === normalizeCatalogText(state.brand)) score += 22
  if (state.brand && metadata.brand && metadata.brand !== normalizeCatalogText(state.brand)) score -= 8

  if (request.type === 'granel' || state.packagePreference === 'granel') {
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
