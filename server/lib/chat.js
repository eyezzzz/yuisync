import { DateTime } from 'luxon'
import { HttpError } from './http.js'
import { serverEnv } from './env.js'
import { logger } from './logger.js'
import {
  buildPetbotSearchText,
  recoverPetbotContextFromHistory,
} from './petbotContext.js'
import {
  buildInterpretedPetbotSearchText,
  interpretPetbotMessageWithLlm,
} from './petbotAi.js'
import { detectCatalogRequest, rankCatalogProducts } from './petbotCatalog.js'
import {
  PETBOT_AGENT_TOOLS,
  buildPetbotOperationalPreflight,
  buildServiceAvailability,
  findPetshopSubscriptionBenefit,
  groundPetbotServiceArgs,
  isExplicitPetbotConfirmation,
  mergeInterpretedPetbotServiceFacts,
  isServiceCatalogProduct,
  listPetTransportOptions,
  mergePetshopServiceCatalogs,
  normalizePetbotSchedulingSettings,
  preparePetshopOrderDraft,
  resolvePetshopService,
  resolvePetTransportSelection,
  runPetbotAgent,
} from './petbotAgent.js'
import {
  analyzeProductDifferentiation,
  buildPetbotAgentV3Prompt,
  normalizeProductQueryFacts,
  validatePetbotConversationReply,
  validatePetbotOperationalReply,
} from './petbotGrounding.js'

const SUPPORTED_MODULES = new Set(['petshop'])
const PRODUCT_CONTEXT_LIMIT = 18
const RECENT_HISTORY_LIMIT = 14
const PRODUCT_CATALOG_CACHE_MS = 5 * 60 * 1000
const SETTINGS_CACHE_MS = 60 * 1000
const APPOINTMENTS_CACHE_MS = 30 * 1000
const MAX_CACHED_PRODUCTS = 1500
const CLIENT_PROFILE_SELECT = 'id,name,phone,address,neighborhood,city,details'
const PRODUCT_STOP_WORDS = new Set([
  'aqui',
  'algum',
  'alguma',
  'alguns',
  'algumas',
  'comprar',
  'disponivel',
  'disponiveis',
  'gostaria',
  'para',
  'pode',
  'produto',
  'produtos',
  'queria',
  'quero',
  'qual',
  'quais',
  'tem',
  'tenho',
  'vcs',
  'voces',
  'ola',
  'opa',
  'bom',
  'boa',
  'dia',
  'ela',
  'ele',
  'ja',
  'meu',
  'minha',
  'nao',
  'tarde',
  'noite',
  'pra',
  'pro',
  'racao',
  'racoes',
  'sei',
  'ser',
  'seu',
  'sua',
  'um',
  'uma',
])

const DEFAULT_BOT_MODEL = serverEnv.openAiModel
const DEFAULT_BOT_TEMPERATURE = 0.5
function parsePetbotAgentReply(value = '') {
  const text = cleanText(value)
  if (!text) return { message: '' }
  try {
    const parsed = JSON.parse(text)
    return { message: cleanText(parsed?.message) }
  } catch {
    return { message: text }
  }
}

const DEFAULT_DELIVERY_FEE = 8
const AVAILABLE_STATUSES = new Set(['available', 'livre', 'disponivel', 'aberto', 'open'])
const BUSY_STATUSES = new Set(['agendado', 'confirmado', 'em_andamento', 'booked', 'ocupado', 'blocked', 'bloqueado'])
const KNOWN_BREED_TERMS = new Set([
  'akita',
  'beagle',
  'border',
  'boxer',
  'buldogue',
  'bulldog',
  'chihuahua',
  'collie',
  'dachshund',
  'doberman',
  'golden',
  'husky',
  'labrador',
  'lhasa',
  'maltese',
  'pastor',
  'pinscher',
  'pitbull',
  'poodle',
  'pug',
  'rottweiler',
  'schnauzer',
  'shi',
  'shih',
  'spitz',
  'tzu',
  'vira',
  'york',
  'yorkshire',
])
const AGE_CATEGORY_TERMS = new Set([
  'adulto',
  'adultos',
  'adulta',
  'adultas',
  'filhote',
  'filhotes',
  'puppy',
  'junior',
  'senior',
  'idoso',
  'castrado',
  'castrada',
  'castrados',
  'indoor',
  'light',
])
const SIZE_CATEGORY_TERMS = new Set([
  'mini',
  'pequeno',
  'pequenos',
  'pequena',
  'pequenas',
  'medio',
  'medios',
  'media',
  'medias',
  'grande',
  'grandes',
  'gigante',
  'gigantes',
])

const productCatalogCache = new Map()
const storeSettingsCache = new Map()
const appointmentsCache = new Map()

function scopeCacheKey(moduleId, tenantId) {
  return `${String(tenantId || '')}:${String(moduleId || '').toLowerCase()}`
}

async function cachedLoad(cache, key, ttlMs, loader) {
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && now - cached.loadedAt < ttlMs) return cached.value

  try {
    const value = await loader()
    cache.set(key, { loadedAt: now, value })
    return value
  } catch (error) {
    if (cached?.value) return cached.value
    throw error
  }
}

function detectIntent(message = '') {
  const lower = normalizeSearchText(message)

  if (/racao|petisc|brinquedo|shampoo|coleira|comprar|preco|estoque|tem |tem\?|voces tem/i.test(lower)) {
    return 'produto'
  }

  if (/banho|tosa|vet(erinario|erinaria)?|agend|consult|vacina/i.test(lower)) {
    return 'servico'
  }

  return 'duvida'
}

function normalizeSearchText(value = '') {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function normalizePhone(value = '') {
  return String(value || '').replace(/\D/g, '')
}

function cleanText(value = '') {
  return String(value || '').trim()
}

function petbotServiceFactsSignature(facts = {}) {
  return JSON.stringify({
    pet_name: normalizeSearchText(facts.pet_name),
    species: normalizeSearchText(facts.species),
    breed: normalizeSearchText(facts.breed),
    weight_kg: Number(facts.weight_kg || 0) || null,
  })
}

function isExplicitNoServiceNotesAnswer(message = '', history = []) {
  const answer = normalizeSearchText(message)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!/^(?:nao|n|nenhuma|nenhum|nada|sem observacao|sem observacoes|tudo certo|normal)$/.test(answer)) return false

  const previousAssistant = [...(history || [])]
    .reverse()
    .find((entry) => ['assistant', 'human_agent'].includes(entry?.role))
  const previousText = normalizeSearchText(previousAssistant?.content)
  return /\b(?:observacao|observacoes|recado|alergia|perfume|cuidado especial)\b/.test(previousText)
}

function appointmentDateIso(row = {}) {
  if (row.service_date) return String(row.service_date).slice(0, 10)
  if (!row.scheduled_at) return ''
  return new Date(row.scheduled_at).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

function appointmentTimeText(row = {}) {
  if (row.start_time) return String(row.start_time).slice(0, 5)
  if (!row.scheduled_at) return ''
  return new Date(row.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

function normalizeAppointmentRows(rows = []) {
  const byId = new Map()
  for (const row of rows || []) {
    if (!row) continue
    const date = appointmentDateIso(row)
    const time = appointmentTimeText(row)
    const scheduledAt = row.scheduled_at || (date && time ? `${date}T${time}:00-03:00` : null)
    byId.set(row.id || `${date}-${time}-${row.service_type}`, {
      ...row,
      scheduled_at: scheduledAt,
      service_date: row.service_date || date || null,
      start_time: row.start_time || (time ? `${time}:00` : null),
    })
  }
  return [...byId.values()].filter((row) => row.scheduled_at)
}

function parseJsonObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function hasPetbotState(context) {
  const parsed = parseJsonObject(context)
  const legacyState = parsed.petbot && typeof parsed.petbot === 'object' && parsed.petbot.updatedAt
  const agentState = parsed.petbot_agent && typeof parsed.petbot_agent === 'object' && parsed.petbot_agent.updatedAt
  return Boolean(legacyState || agentState)
}

function isUuid(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanText(value))
}

function parseRating(value = '') {
  const text = cleanText(value)
  if (!/^(10|[0-9])$/.test(text)) return null
  return Number(text)
}

function hasConfirmedOrderContext(session) {
  const context = parseJsonObject(session?.context)
  return Boolean(context.last_sale_id || context.last_order_id || context.last_appointment_id)
}

function parseRegistrationUpdateFromMessage(message = '') {
  const text = cleanText(message)
  const details = {}
  const document = text.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)?.[0] || ''
  const zip = text.match(/\b\d{5}-?\d{3}\b/)?.[0] || ''
  const birth = text.match(/\b(\d{2})[/-](\d{2})[/-](\d{4})\b/)
  const number = text.match(/\b(?:numero|n[uú]mero|nº|casa|apto|apartamento|ap)\s*[:\-]?\s*([a-z0-9-]+)\b/i)?.[1] || ''
  const reference = text.match(/\b(?:referencia|referência|ponto de referencia|perto de|ao lado de|em frente)\s*[:\-]?\s*(.+)$/i)?.[1] || ''
  if (zip) details.zip_code = zip
  if (birth) details.tutor_birth_date = `${birth[3]}-${birth[2]}-${birth[1]}`
  if (number) details.address_number = number
  if (reference) details.address_reference = reference.slice(0, 160)
  return { document, details }
}

async function updateCustomerRegistrationFromMessage(supabase, session, message) {
  if (!session.client_id) return false
  const parsed = parseRegistrationUpdateFromMessage(message)
  if (!parsed.document && !Object.keys(parsed.details).length) return false

  const { data: current } = await supabase
    .from('clients')
    .select('document,details')
    .eq('id', session.client_id)
    .maybeSingle()

  const nextDetails = {
    ...(parseJsonObject(current?.details)),
    ...parsed.details,
  }

  const { error } = await supabase
    .from('clients')
    .update({
      ...(parsed.document ? { document: parsed.document } : {}),
      details: {
        ...nextDetails,
        registration_status: nextDetails.tutor_birth_date && nextDetails.zip_code && nextDetails.address_number && nextDetails.address_reference && (parsed.document || current?.document)
          ? 'completo'
          : 'pendente',
      },
    })
    .eq('id', session.client_id)

  return !error
}

function isPlaceholderName(value = '') {
  const name = cleanText(value).toLowerCase()
  return !name
    || ['cliente', 'cliente whatsapp', 'whatsapp', 'sem nome'].includes(name)
    || /^cliente[-\s]?\d+/i.test(name)
    || /^\+?\d[\d\s().-]{6,}$/.test(name)
}

function normalizeSpecies(value = '') {
  const lower = cleanText(value).toLowerCase()
  if (lower.includes('cach') || lower.includes('dog')) return 'dog'
  if (lower.includes('gat') || lower.includes('cat')) return 'cat'
  return lower || ''
}

function buildSearchTerms(message = '') {
  const terms = normalizeSearchText(message)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !PRODUCT_STOP_WORDS.has(term))
    .flatMap((term) => {
      if (term === 'shi') return ['shi', 'shih', 'tzu', 'shihtzu']
      if (term === 'shihtzu') return ['shih', 'tzu', 'shihtzu']
      if (term === 'york') return ['york', 'yorkshire']
      return [term]
    })

  return [...new Set(terms)].slice(0, 12)
}

function buildCatalogSearchText(history = [], message = '') {
  const recentUserText = (history || [])
    .filter((entry) => entry?.role === 'user')
    .slice(-6)
    .map((entry) => cleanText(entry.content))
    .filter(Boolean)
    .join(' ')
  return [recentUserText, message].filter(Boolean).join(' ')
}

function isMissingTenantColumnError(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('tenant_id') && (
    message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('column')
  )
}

function isSellableProduct(product) {
  const name = String(product?.name || '').trim()
  return Boolean(product?.active)
    && !isServiceCatalogProduct(product)
    && name.toLowerCase() !== 'produto importado'
    && Number(product?.stock_quantity) > 0
    && Number(product?.price) > 0
}

function productSearchText(product) {
  return normalizeSearchText([
    product?.name,
    product?.category,
    product?.description,
    product?.species_target,
  ].filter(Boolean).join(' '))
}

function requestedWeightKg(terms = []) {
  for (const term of terms || []) {
    const match = String(term).match(/^(\d{1,2})(?:kg)?$/)
    if (match) return Number(match[1])
  }
  return null
}

function productWeightRangeScore(product, weightKg) {
  if (!weightKg) return 0
  const raw = String(product?.name || '').toLowerCase().replace(/,/g, '.')
  const ranges = [...raw.matchAll(/(\d+(?:\.\d+)?)\s*(?:a|-|ate|até)\s*(\d+(?:\.\d+)?)\s*kg/g)]
  if (!ranges.length) return 0
  const matches = ranges.some((range) => {
    const min = Number(range[1])
    const max = Number(range[2])
    return Number.isFinite(min) && Number.isFinite(max) && weightKg >= min && weightKg <= max
  })
  return matches ? 18 : -10
}

function productPackageKgScore(product, packageKg) {
  if (!packageKg) return 0
  const raw = normalizeSearchText(product?.name).replace(/,/g, '.')
  const compact = raw.replace(/\s+/g, '')
  const spaced = new RegExp(`\\b${packageKg}\\s*kg\\b`)
  if (spaced.test(raw) || compact.includes(`${packageKg}kg`)) return 24
  return -14
}

function hasDogBreedProductText(searchable = '') {
  return /shih tzu|shi tzu|shihtzu|yorkshire|lhasa|spitz|poodle|pinscher|bulldog|pug|maltes|maltês/.test(searchable)
}

function rankProduct(product, terms) {
  const searchable = productSearchText(product)
  const name = normalizeSearchText(product?.name)
  const category = normalizeSearchText(product?.category)
  let score = 0
  const weightKg = requestedWeightKg(terms)
  const packageKg = terms.some((term) => /kg$/.test(term)) ? weightKg : null
  const wantsAdult = terms.some((term) => ['adulto', 'adultos', 'adulta', 'adultas'].includes(term))
  const wantsPuppy = terms.some((term) => ['filhote', 'filhotes', 'puppy', 'junior'].includes(term))
  const wantsFlea = terms.some((term) => ['antipulga', 'antipulgas', 'pulga', 'pulgas', 'carrapato', 'carrapatos', 'bravecto', 'nexgard', 'simparic', 'credeli'].includes(term))
  const wantsLitter = terms.some((term) => ['areia', 'higienica', 'higiênica'].includes(term))
  const fleaProduct = /(antipulga|pulga|carrapato|bravecto|nexgard|simparic|credeli|matacura|coleira contra)/.test(searchable)
  const oralFleaProduct = /(bravecto|nexgard|simparic|credeli)/.test(searchable)
  const topicalFleaProduct = /(shampoo|sabonete|spray|talco|coleira|matacura)/.test(searchable)
  const wantsCat = terms.some((term) => ['gato', 'gatos', 'gata', 'gatas', 'cat', 'felino', 'felinos'].includes(term))
  const wantsDog = terms.some((term) => ['cao', 'caes', 'cachorro', 'cachorros', 'cachorra', 'dog', 'canino', 'caninos'].includes(term) || KNOWN_BREED_TERMS.has(term))
  const catProduct = /(gato|gatos|gata|felino|cat|whiskas|kitekat)/.test(searchable)
  const dogProduct = /\b(cao|caes|cachorro|canino|dog|pedigree|bifinho|ossinho)\b/.test(searchable)
    || /special dog/.test(searchable)
    || hasDogBreedProductText(searchable)
  const breedTerms = terms.filter((term) => KNOWN_BREED_TERMS.has(term))
  const categoryTerms = terms.filter((term) => AGE_CATEGORY_TERMS.has(term))
  const sizeTerms = terms.filter((term) => SIZE_CATEGORY_TERMS.has(term))

  for (const term of terms) {
    if (name.includes(term)) score += 8
    if (category.includes(term)) score += 4
    if (searchable.includes(term)) score += 2
  }

  for (const term of breedTerms) {
    if (name.includes(term)) score += 10
    if (!name.includes(term) && !searchable.includes(term)) score -= 2
  }

  for (const term of categoryTerms) {
    if (name.includes(term)) score += 8
    if (!name.includes(term) && !searchable.includes(term)) score -= 2
  }

  for (const term of sizeTerms) {
    if (name.includes(term)) score += 7
    if (!name.includes(term) && !searchable.includes(term)) score -= 1
  }

  if (wantsAdult && /adult/.test(name)) score += 8
  if (wantsAdult && /(filhote|puppy|junior)/.test(name)) score -= 12
  if (wantsPuppy && /(filhote|puppy|junior)/.test(name)) score += 8
  if (wantsPuppy && /adult/.test(name)) score -= 12
  if (wantsFlea && fleaProduct) score += 18
  if (wantsFlea && !fleaProduct) score -= 18
  if (wantsFlea && oralFleaProduct) score += 20
  if (wantsFlea && topicalFleaProduct && terms.some((term) => /\d/.test(term) || ['pequeno', 'medio', 'grande'].includes(term))) score -= 12
  if (wantsFlea && weightKg) score += productWeightRangeScore(product, weightKg)
  if (wantsLitter && /(areia|higienica|pa higienica)/.test(searchable)) score += 14
  if (wantsLitter && !/(areia|higienica|pa higienica)/.test(searchable)) score -= 25
  if (wantsCat && catProduct) score += 18
  if (wantsCat && dogProduct) score -= 35
  if (wantsDog && dogProduct) score += 12
  if (wantsDog && catProduct) score -= 35
  if (category.includes('racao') && packageKg) score += productPackageKgScore(product, packageKg)
  if (!breedTerms.length && hasDogBreedProductText(searchable)) score -= 10
  if (category.includes('racao')) score += 2
  score += Math.min(Number(product?.stock_quantity || 0), 20) / 20
  return score
}

function selectRelevantProducts(products, message) {
  const available = (products || []).filter(isSellableProduct)
  const searchTerms = buildSearchTerms(message)
  const intent = detectIntent(message)

  if (!available.length) return []

  const catalogRequest = detectCatalogRequest(message)
  const catalogMatched = rankCatalogProducts(available, {}, message)
    .filter((item) => item.score > 0)
    .map((item) => item.product)
  if (catalogMatched.length) return catalogMatched.slice(0, PRODUCT_CONTEXT_LIMIT)
  if (catalogRequest.type) return []

  const matched = searchTerms.length
    ? available
      .map((product) => ({ product, score: rankProduct(product, searchTerms) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.product)
    : []

  if (matched.length) return matched.slice(0, PRODUCT_CONTEXT_LIMIT)

  if (intent !== 'produto') return []

  return available
    .sort((a, b) => {
      const aCategory = normalizeSearchText(a?.category)
      const bCategory = normalizeSearchText(b?.category)
      if (aCategory.includes('racao') !== bCategory.includes('racao')) {
        return aCategory.includes('racao') ? -1 : 1
      }
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR')
    })
    .slice(0, PRODUCT_CONTEXT_LIMIT)
}

function expandDbSearchTerms(terms = []) {
  const extras = {
    racao: ['racao', 'ração'],
    caes: ['caes', 'cães'],
    cao: ['cao', 'cão'],
    sache: ['sache', 'sachê'],
    higienica: ['higienica', 'higiênica'],
    antipulga: ['antipulga', 'antipulgas', 'pulga', 'carrapato', 'bravecto', 'nexgard', 'simparic', 'credeli'],
    antipulgas: ['antipulga', 'antipulgas', 'pulga', 'carrapato', 'bravecto', 'nexgard', 'simparic', 'credeli'],
    pulga: ['pulga', 'pulgas', 'carrapato', 'bravecto', 'nexgard', 'simparic', 'credeli'],
    pulgas: ['pulga', 'pulgas', 'carrapato', 'bravecto', 'nexgard', 'simparic', 'credeli'],
    carrapato: ['carrapato', 'carrapatos', 'bravecto', 'nexgard', 'simparic', 'credeli'],
  }
  return [...new Set((terms || []).flatMap((term) => {
    const kg = String(term).match(/^(\d{1,2})kg$/)
    if (kg) return [term, `${kg[1]} kg`]
    return extras[term] || [term]
  }))].slice(0, 12)
}

function mergeProductsById(...lists) {
  const map = new Map()
  for (const list of lists) {
    for (const product of list || []) {
      if (product?.id && !map.has(String(product.id))) map.set(String(product.id), product)
    }
  }
  return [...map.values()]
}

async function searchProductsByTerms(supabase, moduleId, tenantId, terms, selectColumns) {
  const dbTerms = expandDbSearchTerms(terms)
  if (!dbTerms.length) return []

  const orFilter = dbTerms
    .flatMap((term) => ['name', 'category', 'description', 'barcode'].map((column) => `${column}.ilike.%${term}%`))
    .join(',')

  let query = supabase
    .from('products')
    .select(selectColumns)
    .eq('module_id', moduleId)
    .eq('active', true)
    .gt('stock_quantity', 0)
    .or(orFilter)
    .limit(120)

  if (tenantId) query = query.eq('tenant_id', tenantId)

  const { data, error } = await query
  if (error) {
    if (tenantId && isMissingTenantColumnError(error)) {
      throw new HttpError(500, 'Tenant isolation is not enabled in products table.')
    }
    throw new HttpError(500, 'Unable to search product context.')
  }
  return data || []
}

async function loadUpsellProducts(supabase, moduleId, tenantId, selectColumns) {
  let query = supabase
    .from('products')
    .select(selectColumns)
    .eq('module_id', moduleId)
    .eq('active', true)
    .gt('stock_quantity', 0)
    .or([
      'name.ilike.%petisco%',
      'name.ilike.%bifinho%',
      'name.ilike.%dental%',
      'name.ilike.%ossinho%',
      'name.ilike.%sache%',
      'name.ilike.%sachê%',
      'name.ilike.%areia%',
      'name.ilike.%shampoo%',
      'category.ilike.%petisco%',
      'category.ilike.%sache%',
      'category.ilike.%sachê%',
      'category.ilike.%higien%',
    ].join(','))
    .limit(40)

  if (tenantId) query = query.eq('tenant_id', tenantId)

  const { data, error } = await query
  if (error) return []
  return data || []
}

function buildCustomerContext(customer) {
  if (!customer?.client) {
    return [
      'Cliente nao encontrado no cadastro pelo telefone.',
      `Telefone: ${customer?.phone || 'Nao informado'}`,
      'Nome confirmado: nao. Pergunte o nome antes de vender.',
    ].join('\n')
  }

  const details = customer.client.details || {}
  const nameConfirmed = !isPlaceholderName(customer.client.name) && details.name_confirmed !== false
  return [
    `Cliente cadastrado pelo telefone: sim`,
    `Nome: ${nameConfirmed ? customer.client.name : 'nao confirmado'}`,
    `Telefone: ${customer.client.phone || customer.phone || 'Nao informado'}`,
    `Pet: ${details.pet_name || 'Nao informado'}`,
    `Especie: ${details.species || 'Nao informado'}`,
    `Porte: ${details.size || 'Nao informado'}`,
    `Peso: ${details.weight_kg ? `${details.weight_kg} kg` : 'Nao informado'}`,
    `Tipo de pelo: ${details.coat_type || 'Nao informado'}`,
    `Raca: ${details.breed || 'Nao informado'}`,
    `Endereco cadastrado: ${[customer.client.address, customer.client.neighborhood, customer.client.city].filter(Boolean).join(' - ') || 'Nao informado'}`,
    `Nome confirmado: ${nameConfirmed ? 'sim' : 'nao'}`,
  ].join('\n')
}

async function loadStoreSettings(supabase, moduleId, tenantId) {
  return cachedLoad(storeSettingsCache, scopeCacheKey(moduleId, tenantId), SETTINGS_CACHE_MS, async () => {
    let query = supabase
      .from('settings')
      .select('store_name,store_phone,store_address,store_neighborhood,store_city,bot_prompt,delivery_fee,pet_transport_fee,pix_key,pix_holder_name,message_templates,pet_transport_options,petbot_autonomy_mode,petbot_autonomy_allowlist,petbot_timezone,petbot_business_hours,petbot_slot_interval_min,petbot_booking_lead_time_min,petbot_booking_capacity')
      .eq('module_id', moduleId)

    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }

    let result = await query.maybeSingle()
    if (result.error && /(pet_transport_fee|pix_key|pix_holder_name|message_templates|pet_transport_options|petbot_autonomy_mode|petbot_autonomy_allowlist|petbot_timezone|petbot_business_hours|petbot_slot_interval_min|petbot_booking_lead_time_min|petbot_booking_capacity)/i.test(String(result.error.message || ''))) {
      let fallbackQuery = supabase
        .from('settings')
        .select('store_name,store_phone,store_address,store_neighborhood,store_city,bot_prompt,delivery_fee')
        .eq('module_id', moduleId)
      if (tenantId) fallbackQuery = fallbackQuery.eq('tenant_id', tenantId)
      result = await fallbackQuery.maybeSingle()
    }
    const { data, error } = result
    if (error) {
      if (tenantId && isMissingTenantColumnError(error)) {
        throw new HttpError(500, 'Tenant isolation is not enabled in settings table.')
      }
      throw new HttpError(500, 'Unable to load store configuration.')
    }

    return {
      storeName: data?.store_name || 'YuiSync',
      storePhone: data?.store_phone || '',
      storeAddress: data?.store_address || '',
      storeNeighborhood: data?.store_neighborhood || '',
      storeCity: data?.store_city || '',
      botPrompt: data?.bot_prompt || '',
      deliveryFee: Number(data?.delivery_fee ?? DEFAULT_DELIVERY_FEE),
      petTransportFee: Number(data?.pet_transport_fee ?? 20),
      pixKey: data?.pix_key || '',
      pixHolderName: data?.pix_holder_name || '',
      messageTemplates: data?.message_templates || {},
      petTransportOptions: Array.isArray(data?.pet_transport_options) ? data.pet_transport_options : [],
      // Until the canary migration is applied, preserve the currently deployed
      // behavior instead of unexpectedly routing every conversation to a human.
      autonomyMode: data?.petbot_autonomy_mode || 'canary',
      autonomyAllowlist: Array.isArray(data?.petbot_autonomy_allowlist) ? data.petbot_autonomy_allowlist : [],
      petbotTimezone: data?.petbot_timezone || 'America/Sao_Paulo',
      petbotBusinessHours: data?.petbot_business_hours && typeof data.petbot_business_hours === 'object'
        ? data.petbot_business_hours
        : null,
      petbotSlotIntervalMin: Number(data?.petbot_slot_interval_min || 30),
      petbotBookingLeadTimeMin: Number(data?.petbot_booking_lead_time_min || 15),
      petbotBookingCapacity: Number(data?.petbot_booking_capacity || 1),
    }
  })
}

function canPetbotCreateOrders(settings = {}, session = {}) {
  const mode = cleanText(settings.autonomyMode).toLowerCase() || 'canary'
  if (mode === 'enabled') return true
  if (mode !== 'canary') return false

  const phone = cleanText(session.customer_phone).replace(/\D/g, '')
  const allowlist = Array.isArray(settings.autonomyAllowlist) ? settings.autonomyAllowlist : []
  return Boolean(phone) && allowlist
    .map((entry) => cleanText(entry).replace(/\D/g, ''))
    .includes(phone)
}

function isCatalogColumnCompatibilityError(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('schema cache')
    || message.includes('column')
    || message.includes('does not exist')
    || message.includes('could not find')
}

async function loadPetshopServices(supabase, moduleId, tenantId) {
  const runDedicatedQuery = async (includeSourceProductId) => {
    const columns = includeSourceProductId
      ? 'id,code,name,group_type,default_price,default_duration_min,active,sort_order,source_product_id'
      : 'id,code,name,group_type,default_price,default_duration_min,active,sort_order'
    let query = supabase
      .from('petshop_services')
      .select(columns)
      .eq('module_id', moduleId)
      .eq('active', true)
      .order('sort_order')
      .order('name')

    if (tenantId) query = query.eq('tenant_id', tenantId)
    return query
  }

  let dedicatedResult = await runDedicatedQuery(true)
  if (dedicatedResult.error && isCatalogColumnCompatibilityError(dedicatedResult.error)) {
    dedicatedResult = await runDedicatedQuery(false)
  }

  let { data: dedicatedServices, error: dedicatedError } = dedicatedResult
  if (dedicatedError) {
    if (tenantId && isMissingTenantColumnError(dedicatedError)) {
      logger.warn('PetBot auxiliary service catalog has no tenant column; using tenant-scoped products instead', {
        moduleId,
        tenantId,
        message: dedicatedError.message,
      })
      dedicatedServices = []
      dedicatedError = null
    } else {
      logger.warn('PetBot dedicated service catalog unavailable; continuing with products', {
        moduleId,
        tenantId,
        message: dedicatedError.message,
      })
      dedicatedServices = []
    }
  }

  const runProductQuery = async (columns) => {
    let query = supabase
      .from('products')
      .select(columns)
      .eq('module_id', moduleId)
      .eq('active', true)
      .limit(MAX_CACHED_PRODUCTS)
    if (tenantId) query = query.eq('tenant_id', tenantId)
    return query
  }

  const productColumnSets = [
    'id,name,category,description,species_target,price,active,bot_metadata,updated_at',
    'id,name,category,description,species_target,price,active,bot_metadata',
    'id,name,category,description,price,active,bot_metadata',
    'id,name,category,price,active,bot_metadata',
    'id,name,category,description,species_target,price,active',
    'id,name,category,description,price,active',
    'id,name,category,price,active',
  ]
  let productResult = null
  for (const columns of productColumnSets) {
    productResult = await runProductQuery(columns)
    if (!productResult.error) break
    if (!isCatalogColumnCompatibilityError(productResult.error)) break
  }

  const { data: productRows, error: productError } = productResult || { data: [], error: null }
  if (productError) {
    if (tenantId && isMissingTenantColumnError(productError)) {
      throw new HttpError(500, 'Tenant isolation is not enabled in products table.')
    }
    if (!(dedicatedServices || []).length) {
      throw new HttpError(500, `Unable to load the service catalog from products: ${productError.message || 'unknown error'}`)
    }
    logger.warn('PetBot product service catalog unavailable; using dedicated services', {
      moduleId,
      tenantId,
      message: productError.message,
    })
  }

  return mergePetshopServiceCatalogs(
    (dedicatedServices || []).filter((service) => service.active !== false),
    productRows || [],
  )
}

async function loadProductsByIds(supabase, moduleId, tenantId, productIds = []) {
  const ids = [...new Set((productIds || []).map(cleanText).filter(isUuid))]
  if (!ids.length) return []

  let query = supabase
    .from('products')
    .select('id, name, category, description, species_target, barcode, image_url, price, stock_quantity, active, bot_metadata')
    .eq('module_id', moduleId)
    .in('id', ids)

  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data, error } = await query
  if (error) throw new HttpError(500, 'Unable to refresh product stock.')
  return data || []
}

async function loadProducts(supabase, moduleId, tenantId, message) {
  const selectColumns = 'id, name, category, description, species_target, barcode, image_url, price, stock_quantity, active, bot_metadata'
  const loadCatalog = () => cachedLoad(productCatalogCache, scopeCacheKey(moduleId, tenantId), PRODUCT_CATALOG_CACHE_MS, async () => {
    let query = supabase
      .from('products')
      .select(selectColumns)
      .eq('module_id', moduleId)
      .eq('active', true)
      .gt('stock_quantity', 0)
      .limit(MAX_CACHED_PRODUCTS)

    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }

    const { data, error } = await query
    if (error) {
      if (tenantId && isMissingTenantColumnError(error)) {
        throw new HttpError(500, 'Tenant isolation is not enabled in products table.')
      }
      throw new HttpError(500, 'Unable to load product context.')
    }

    return data || []
  })

  const terms = buildSearchTerms(message)
  if (terms.length > 0) {
    const [searchedProducts, upsellProducts] = await Promise.all([
      searchProductsByTerms(supabase, moduleId, tenantId, terms, selectColumns),
      loadUpsellProducts(supabase, moduleId, tenantId, selectColumns),
    ])
    const selected = selectRelevantProducts(searchedProducts, message)
    if (selected.length > 0) return mergeProductsById(selected.slice(0, PRODUCT_CONTEXT_LIMIT), upsellProducts)
    const catalog = await loadCatalog()
    const fallbackSelected = selectRelevantProducts(catalog || [], message)
    if (fallbackSelected.length > 0) return mergeProductsById(fallbackSelected.slice(0, PRODUCT_CONTEXT_LIMIT), upsellProducts)
    return []
  }

  const catalog = await loadCatalog()

  const selected = selectRelevantProducts(catalog || [], message)
  if (selected.length > 0) return selected.slice(0, PRODUCT_CONTEXT_LIMIT)
  return (catalog || []).slice(0, PRODUCT_CONTEXT_LIMIT)
}

async function queryAppointments(supabase, moduleId, tenantId, settings = {}) {
  const schedule = normalizePetbotSchedulingSettings(settings)
  const localNow = DateTime.now().setZone(schedule.timezone)
  const today = localNow.toISODate()
  const end = localNow.plus({ days: 14 }).toISODate()
  const rangeStart = localNow.startOf('day').toUTC().toISO()
  const rangeEnd = localNow.plus({ days: 14 }).endOf('day').toUTC().toISO()
  const selectColumns = 'id, service_type, scheduled_at, service_date, start_time, status, price, duration_min, employee_id, groomer_id'
  let query = supabase
    .from('appointments')
    .select(selectColumns)
    .eq('module_id', moduleId)
    .gte('scheduled_at', rangeStart)
    .lte('scheduled_at', rangeEnd)
    .order('scheduled_at')
    .limit(1000)

  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data, error } = await query
  if (error) {
    if (tenantId && isMissingTenantColumnError(error)) {
      throw new HttpError(500, 'Tenant isolation is not enabled in appointments table.')
    }
    throw new HttpError(500, 'Unable to load appointment context.')
  }

  let byServiceDate = []
  let serviceDateQuery = supabase
    .from('appointments')
    .select(selectColumns)
    .eq('module_id', moduleId)
    .gte('service_date', today)
    .lte('service_date', end)
    .order('service_date')
    .order('start_time')
    .limit(100)

  if (tenantId) serviceDateQuery = serviceDateQuery.eq('tenant_id', tenantId)
  const serviceDateResult = await serviceDateQuery
  if (!serviceDateResult.error) byServiceDate = serviceDateResult.data || []

  return normalizeAppointmentRows([...(data || []), ...byServiceDate])
}

async function loadAppointments(supabase, moduleId, tenantId, settings = {}) {
  return cachedLoad(
    appointmentsCache,
    scopeCacheKey(moduleId, tenantId),
    APPOINTMENTS_CACHE_MS,
    () => queryAppointments(supabase, moduleId, tenantId, settings),
  )
}

async function loadAppointmentsFresh(supabase, moduleId, tenantId, settings = {}) {
  const rows = await queryAppointments(supabase, moduleId, tenantId, settings)
  appointmentsCache.set(scopeCacheKey(moduleId, tenantId), { loadedAt: Date.now(), value: rows })
  return rows
}

async function loadRecentMessages(supabase, sessionId) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, metadata, tokens_used, sent_at')
    .eq('session_id', sessionId)
    .order('sent_at', { ascending: false })
    .limit(RECENT_HISTORY_LIMIT)

  if (error) {
    throw new HttpError(500, 'Unable to load conversation history.')
  }

  return (data || []).reverse().map((message) => ({
    ...message,
    role: message.role === 'human_agent' ? 'assistant' : message.role,
    content: message.content,
    metadata: message.metadata || {},
  }))
}

async function findClientByPhone(supabase, moduleId, tenantId, phone) {
  const digits = normalizePhone(phone)
  if (!digits) return null

  const candidates = [...new Set([digits, cleanText(phone), `+${digits}`].filter(Boolean))]
  const { data, error } = await supabase
    .from('clients')
    .select(CLIENT_PROFILE_SELECT)
    .eq('module_id', moduleId)
    .eq('tenant_id', tenantId)
    .in('phone', candidates)
    .limit(5)

  if (error) {
    if (isMissingTenantColumnError(error)) {
      throw new HttpError(500, 'Tenant isolation is not enabled in clients table.')
    }
    throw new HttpError(500, 'Unable to load customer profile.')
  }

  return (data || []).find((client) => normalizePhone(client.phone) === digits) || null
}

async function loadCustomerPets(supabase, session) {
  const phone = normalizePhone(session.customer_phone)
  if (!phone) return []

  try {
    const { data, error } = await supabase
      .from('pets')
      .select('id,pet_name,species,breed,weight_kg,notes,updated_at')
      .eq('tenant_id', session.tenant_id)
      .eq('module_id', session.module_id)
      .in('phone', [...new Set([phone, cleanText(session.customer_phone), `+${phone}`].filter(Boolean))])
      .order('updated_at', { ascending: false })
      .limit(20)

    if (error) {
      logger.warn('PetBot saved pets load failed', {
        sessionId: session.id,
        error: error.message,
      })
      return []
    }

    return (data || []).map((pet) => ({
      id: cleanText(pet.id),
      name: cleanText(pet.pet_name),
      species: cleanText(pet.species),
      breed: cleanText(pet.breed),
      weight_kg: Number(pet.weight_kg || 0) || null,
      notes: cleanText(pet.notes) || null,
    })).filter((pet) => pet.name)
  } catch (error) {
    logger.warn('PetBot saved pets load failed', {
      sessionId: session.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

async function loadCustomerSubscriptionBenefits(supabase, session, clientId) {
  const resolvedClientId = cleanText(clientId)
  if (!resolvedClientId) return []

  try {
    const { data, error } = await supabase
      .from('client_subscriptions')
      .select('id,services_used,started_at,subscription_plans(name,services)')
      .eq('tenant_id', session.tenant_id)
      .eq('module_id', session.module_id)
      .eq('client_id', resolvedClientId)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(10)

    if (error) {
      logger.warn('PetBot subscription benefits load failed', {
        sessionId: session.id,
        error: error.message,
      })
      return []
    }

    const benefits = []
    for (const subscription of data || []) {
      const plan = Array.isArray(subscription.subscription_plans)
        ? subscription.subscription_plans[0]
        : subscription.subscription_plans
      const services = Array.isArray(plan?.services) ? plan.services : []
      const usage = subscription.services_used && typeof subscription.services_used === 'object'
        ? subscription.services_used
        : {}
      for (const service of services) {
        const serviceType = cleanText(service?.service_type).toLowerCase()
        const total = Math.max(0, Number(service?.qty_per_cycle || 0))
        const used = Math.max(0, Number(usage?.[serviceType] || 0))
        const remaining = Math.max(0, total - used)
        if (!serviceType || remaining <= 0) continue
        benefits.push({
          subscription_id: cleanText(subscription.id),
          plan_name: cleanText(plan?.name) || null,
          service_type: serviceType,
          remaining,
          total,
          used,
        })
      }
    }

    const byServiceType = new Map()
    for (const benefit of benefits) {
      if (!byServiceType.has(benefit.service_type)) byServiceType.set(benefit.service_type, benefit)
    }
    return [...byServiceType.values()]
  } catch (error) {
    logger.warn('PetBot subscription benefits load failed', {
      sessionId: session.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

async function ensureCustomerProfile(supabase, session, patch = {}) {
  const moduleId = String(session.module_id || '').trim().toLowerCase()
  const tenantId = session.tenant_id
  const phone = normalizePhone(session.customer_phone)
  let client = session.client_id ? null : await findClientByPhone(supabase, moduleId, tenantId, phone)

  if (session.client_id) {
    const { data, error } = await supabase
      .from('clients')
      .select(CLIENT_PROFILE_SELECT)
      .eq('id', session.client_id)
      .maybeSingle()
    if (error) throw new HttpError(500, 'Unable to load linked customer profile.')
    client = data || null
  }

  const customerName = cleanText(patch.customer_name) || cleanText(client?.name) || cleanText(session.customer_name)
  const hasConfirmedName = Boolean(cleanText(patch.customer_name)) || Boolean(client && !isPlaceholderName(client.name) && client.details?.name_confirmed !== false)
  const nextDetails = {
    ...(client?.details || {}),
    ...(cleanText(patch.pet_name) ? { pet_name: cleanText(patch.pet_name) } : {}),
    ...(cleanText(patch.species) ? { species: normalizeSpecies(patch.species) } : {}),
    ...(cleanText(patch.size) ? { size: cleanText(patch.size) } : {}),
    ...(cleanText(patch.breed) ? { breed: cleanText(patch.breed) } : {}),
    ...(Number(patch.weight_kg) > 0 ? { weight_kg: Number(patch.weight_kg) } : {}),
    ...(cleanText(patch.coat_type) ? { coat_type: cleanText(patch.coat_type) } : {}),
    ...(cleanText(patch.symptom) ? { last_symptom: cleanText(patch.symptom) } : {}),
    name_confirmed: hasConfirmedName,
  }

  const payload = {
    module_id: moduleId,
    tenant_id: tenantId,
    type: 'pet',
    name: customerName || `Cliente ${phone || 'WhatsApp'}`,
    phone: phone || session.customer_phone || null,
    address: cleanText(patch.address) || client?.address || null,
    neighborhood: cleanText(patch.neighborhood) || client?.neighborhood || null,
    city: cleanText(patch.city) || client?.city || null,
    active: true,
    details: nextDetails,
  }

  if (!client) {
    const { data, error } = await supabase
      .from('clients')
      .insert(payload)
      .select(CLIENT_PROFILE_SELECT)
      .single()

    if (error) throw new HttpError(500, 'Unable to create customer profile.')
    client = data
  } else if (Object.keys(patch || {}).length > 0 || session.client_id !== client.id) {
    const { data, error } = await supabase
      .from('clients')
      .update(payload)
      .eq('id', client.id)
      .select(CLIENT_PROFILE_SELECT)
      .single()

    if (error) throw new HttpError(500, 'Unable to update customer profile.')
    client = data
  }

  const sessionPatch = {
    client_id: client.id,
    customer_phone: phone || session.customer_phone,
    ...(hasConfirmedName && client.name ? { customer_name: client.name } : {}),
  }

  await supabase
    .from('chat_sessions')
    .update(sessionPatch)
    .eq('id', session.id)

  return {
    client,
    phone: phone || session.customer_phone,
    isKnown: hasConfirmedName,
  }
}

function buildPetbotOrderTransactionPayload(session, customer, settings, args = {}) {
  const orderType = cleanText(args.order_type) || 'produto'
  const transport = resolvePetTransportSelection({ args, settings, orderType })
  if (!transport.ok) throw new Error('Opcao de transporte do pet invalida ou desatualizada.')

  return {
    session_id: session.id,
    tenant_id: session.tenant_id,
    module_id: session.module_id,
    idempotency_key: cleanText(args.idempotency_key),
    timezone: cleanText(settings.petbotTimezone) || 'America/Sao_Paulo',
    booking_capacity: Math.max(1, Number(settings.petbotBookingCapacity || 1) || 1),
    client_id: customer.client?.id || null,
    customer_name: cleanText(args.customer_name) || cleanText(customer.client?.name) || session.customer_name || 'Cliente',
    customer_phone: customer.phone || session.customer_phone || null,
    pet_name: cleanText(args.pet_name),
    species: cleanText(args.species),
    size: cleanText(args.size),
    breed: cleanText(args.breed),
    weight_kg: Number(args.weight_kg || 0),
    weight_label: cleanText(args.weight_label),
    coat_type: cleanText(args.coat_type),
    symptom: cleanText(args.symptom),
    order_type: orderType,
    payment_method: cleanText(args.payment_method),
    fulfillment_type: cleanText(args.fulfillment_type),
    delivery_address: cleanText(args.delivery_address),
    delivery_neighborhood: cleanText(args.delivery_neighborhood),
    delivery_city: cleanText(args.delivery_city),
    delivery_reference: cleanText(args.delivery_reference),
    delivery_fee: Number(settings.deliveryFee ?? DEFAULT_DELIVERY_FEE),
    service_transport_fee: Number(transport.fee || 0),
    service_transport_mode: cleanText(transport.mode),
    service_transport_label: cleanText(transport.label),
    service_transport_address: cleanText(args.service_transport_address),
    service_transport_neighborhood: cleanText(args.service_transport_neighborhood),
    service_transport_city: cleanText(args.service_transport_city),
    service_transport_reference: cleanText(args.service_transport_reference),
    service_grooming_detail: cleanText(args.service_grooming_detail),
    expected_total: Number(args.total || 0),
    appointment_id: cleanText(args.appointment_id),
    scheduled_at: cleanText(args.scheduled_at),
    service_product_id: cleanText(args.service_product_id),
    service_type: cleanText(args.service_type),
    service_label: cleanText(args.service_label),
    service_kind: cleanText(args.service_kind),
    duration_min: Number(args.duration_min || 60),
    change_for: Number(args.change_for || 0),
    notes: cleanText(args.notes),
    items: Array.isArray(args.items) ? args.items : [],
  }
}

function isMissingPetbotTransactionRpcError(error) {
  const code = cleanText(error?.code).toUpperCase()
  const message = cleanText(error?.message).toLowerCase()
  return code === 'PGRST202'
    || code === '42883'
    || (message.includes('create_petbot_order_transaction') && (
      message.includes('schema cache')
      || message.includes('could not find')
      || message.includes('does not exist')
      || message.includes('not found')
    ))
}

async function createConfirmedPetshopOrderViaRpc(supabase, session, settings, args = {}) {
  const customer = await ensureCustomerProfile(supabase, session, args)
  const payload = buildPetbotOrderTransactionPayload(session, customer, settings, args)
  if (!payload.idempotency_key) throw new Error('Chave idempotente do pedido ausente.')
  if (!payload.items.length) throw new Error('Pedido sem itens para registrar.')
  if (payload.order_type === 'produto' && !['pix', 'dinheiro', 'cartao'].includes(payload.payment_method)) {
    throw new Error('Forma de pagamento ausente ou invalida.')
  }

  const { data, error } = await supabase.rpc('create_petbot_order_transaction', {
    p_payload: payload,
  })

  if (error) {
    if (isMissingPetbotTransactionRpcError(error)) {
      throw new Error('A migracao transacional do PetBot nao foi aplicada no banco de producao.')
    }
    throw new Error(`Falha ao registrar pedido transacional: ${error.message}`)
  }

  return {
    sale_id: cleanText(data?.sale_id),
    order_id: cleanText(data?.order_id) || null,
    appointment_id: cleanText(data?.appointment_id) || null,
    total: Number(data?.total || payload.expected_total || 0),
    payment_status: args.order_type === 'produto'
      ? cleanText(data?.payment_status)
      : 'a_receber',
    subscription_benefit_used: Boolean(data?.subscription_benefit_used),
    subscription_plan_name: cleanText(data?.subscription_plan_name) || null,
    duplicated: Boolean(data?.duplicated),
  }
}

async function saveSatisfactionRating(supabase, sessionId, rating) {
  const closedAt = new Date().toISOString()
  const { error } = await supabase
    .from('chat_sessions')
    .update({
      csat_score: rating,
      status: 'closed',
      intent: 'satisfacao_coletada',
      closed_at: closedAt,
      last_message_at: closedAt,
    })
    .eq('id', sessionId)

  if (error) {
    throw new HttpError(500, 'Unable to save satisfaction rating.')
  }
}

async function loadBotRuntimeConfig(supabase, tenantId, moduleId) {
  try {
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id, model_name, temperature, system_prompt')
      .eq('module_id', moduleId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (companyErr || !company) return { modelName: DEFAULT_BOT_MODEL, temperature: DEFAULT_BOT_TEMPERATURE, systemPrompt: '' }

    return {
      modelName: company.model_name || DEFAULT_BOT_MODEL,
      temperature: Number(company.temperature ?? DEFAULT_BOT_TEMPERATURE),
      systemPrompt: cleanText(company.system_prompt),
    }
  } catch (err) {
    logger.warn('Bot runtime config load failed', { tenantId, moduleId, error: err.message })
    return { modelName: DEFAULT_BOT_MODEL, temperature: DEFAULT_BOT_TEMPERATURE, systemPrompt: '' }
  }
}

async function callOpenAIWithTimeout(params, timeoutMs) {
  const maxRetries = Math.max(0, Number(serverEnv.openAiMaxRetries || 0))
  let lastError = null

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${serverEnv.openAiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      })

      const payload = await response.json().catch(() => ({}))
      if (response.ok) return payload

      const detail = payload?.error?.message || `HTTP ${response.status}`
      const requestId = response.headers.get('x-request-id') || response.headers.get('openai-request-id') || null
      const retryable = [408, 409, 429].includes(response.status) || response.status >= 500
      const error = new HttpError(502, `OpenAI request failed: ${detail}`)
      error.openai = {
        status: response.status,
        request_id: requestId,
        type: payload?.error?.type || null,
        code: payload?.error?.code || null,
        param: payload?.error?.param || null,
      }
      logger.warn('OpenAI chat completion failed', {
        status: response.status,
        request_id: requestId,
        type: payload?.error?.type || null,
        code: payload?.error?.code || null,
        param: payload?.error?.param || null,
        message: detail,
      })
      if (!retryable || attempt >= maxRetries) throw error
      lastError = error
    } catch (error) {
      const timedOut = error?.name === 'AbortError'
      const normalizedError = timedOut
        ? new HttpError(504, 'AI response timed out. Please try again.')
        : error
      if ((!timedOut && error instanceof HttpError) || attempt >= maxRetries) throw normalizedError
      lastError = normalizedError
    } finally {
      clearTimeout(timer)
    }

    await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)))
  }

  throw lastError || new HttpError(502, 'OpenAI request failed.')
}

function normalizeDashboardUserMessages(message, options = {}) {
  const batch = Array.isArray(options.userMessages) ? options.userMessages : []
  const source = options.source || 'dashboard_simulation'
  const sharedMetadata = options.userMetadata || {}
  const now = new Date().toISOString()

  const normalized = batch
    .map((entry) => {
      const content = cleanText(entry?.content)
      if (!content) return null

      const parsedSentAt = cleanText(entry?.sent_at)
      const sentAtDate = parsedSentAt ? new Date(parsedSentAt) : null
      const sentAt = sentAtDate && !Number.isNaN(sentAtDate.getTime())
        ? sentAtDate.toISOString()
        : now
      const clientMessageId = cleanText(entry?.client_message_id || entry?.id)

      return {
        content,
        sent_at: sentAt,
        metadata: {
          source,
          ...(clientMessageId ? { client_message_id: clientMessageId } : {}),
          ...sharedMetadata,
        },
      }
    })
    .filter(Boolean)
    .slice(0, 10)

  if (normalized.length) return normalized

  return [{
    content: message,
    sent_at: now,
    metadata: {
      source,
      ...sharedMetadata,
    },
  }]
}

async function insertUserMessages(supabase, sessionId, userMessages) {
  const { error } = await supabase.from('chat_messages').insert(
    userMessages.map((userMessage) => ({
      session_id: sessionId,
      role: 'user',
      content: userMessage.content,
      metadata: userMessage.metadata,
      sent_at: userMessage.sent_at,
    }))
  )

  if (error) {
    throw new HttpError(500, 'Unable to save user message.')
  }
}

async function recordPetbotEvent(supabase, payload) {
  try {
    const { error } = await supabase.from('petbot_events').insert(payload)
    if (error) {
      logger.warn('Unable to persist PetBot audit event', { code: error.code, message: error.message })
    }
  } catch (error) {
    // The table is introduced by a migration. A missing audit table must never
    // prevent an active WhatsApp conversation from receiving its reply.
    logger.warn('PetBot audit event unavailable', { message: error instanceof Error ? error.message : String(error) })
  }
}

function parseAgentToolArguments(toolCall) {
  try {
    const parsed = JSON.parse(cleanText(toolCall?.function?.arguments) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function getPendingAgentOrder(context) {
  const parsed = parseJsonObject(context)
  const pending = parsed?.petbot_agent?.pending_order
  if (!pending || typeof pending !== 'object' || !pending.id || !pending.order) return null
  return pending
}

function inferPetbotServiceOrderType({ interpretation = {}, facts = {}, message = '', history = [] } = {}) {
  const interpretedIntent = cleanText(interpretation?.intent).toLowerCase()
  // Product conversations can contain words such as "banho" (for example,
  // shampoo para banho). Never preload the service catalog when the structured
  // interpreter has already classified the turn as a product sale.
  if (interpretedIntent === 'produto') return ''
  if (interpretedIntent === 'veterinaria') return 'veterinaria'
  if (interpretedIntent === 'banho_tosa') return 'banho_tosa'

  const text = normalizeSearchText([
    facts?.service_type,
    interpretation?.service_type,
    ...(history || []).slice(-6).map((entry) => entry?.content),
    message,
  ].filter(Boolean).join(' '))
  if (/veterin|consulta|vacina|exame|cirurg/.test(text)) return 'veterinaria'
  if (/banho|tosa|escovac|desembolo|hidrat|higien/.test(text)) return 'banho_tosa'
  return ''
}

function buildPetbotLocalRecoveryReply({ facts = {}, toolRuns = [], resolvedService = null, timezone = 'America/Sao_Paulo' } = {}) {
  const runs = Array.isArray(toolRuns) ? toolRuns : []
  const availabilityRun = [...runs].reverse().find((run) => (
    run?.name === 'check_petshop_availability'
    && run?.ok !== false
    && run?.result
  )) || [...runs].reverse().find((run) => run?.name === 'check_petshop_availability')
  const resolutionRun = [...runs].reverse().find((run) => (
    run?.name === 'resolve_petshop_service'
    && run?.ok !== false
    && run?.result
  )) || [...runs].reverse().find((run) => run?.name === 'resolve_petshop_service')
  const availability = availabilityRun?.result || null
  const resolution = resolutionRun?.result || null
  const petName = cleanText(facts.pet_name)

  const committedRun = [...runs].reverse().find((run) => (
    run?.name === 'create_confirmed_petshop_order'
    && run?.ok !== false
    && ['committed', 'already_committed'].includes(run?.result?.status)
  ))
  if (committedRun) {
    return petName
      ? `Pronto! O agendamento do ${petName} foi confirmado com sucesso.`
      : 'Pronto! O agendamento foi confirmado com sucesso.'
  }

  const preparedRun = [...runs].reverse().find((run) => (
    ['prepare_petshop_service_booking', 'prepare_petshop_product_order', 'prepare_petshop_order'].includes(run?.name)
    && run?.ok !== false
    && run?.result?.status === 'prepared'
  ))
  if (preparedRun?.result?.summary) return cleanText(preparedRun.result.summary)

  if (availability?.status === 'available') {
    if (availability.requested_slot?.available) {
      const time = cleanText(availability.requested_slot.scheduled_at)
      const formatted = time
        ? DateTime.fromISO(time, { setZone: true }).setZone(timezone).toFormat('HH:mm')
        : cleanText(facts.service_preferred_time)
      return `${formatted ? `Sim, ${formatted} está disponível.` : 'Sim, o horário solicitado está disponível.'}${petName ? ' Posso preparar o resumo do agendamento?' : ' Qual é o nome do seu pet?'}`
    }
    const slots = (availability.available_slots || []).slice(0, 6).map((slot) => cleanText(slot.time)).filter(Boolean)
    if (slots.length) {
      return `Encontrei estes horários disponíveis: ${slots.join(', ')}. Qual deles você prefere?`
    }
  }

  if (availability?.status === 'unavailable') {
    return 'Não encontrei horário disponível nessa data. Você prefere tentar outro dia ou outro período?'
  }

  const missingFields = new Set(resolution?.missing_fields || [])
  if (missingFields.has('breed') && missingFields.has('weight_kg')) {
    return 'Qual é a raça e o peso aproximado do seu pet?'
  }
  if (missingFields.has('breed')) return 'Qual é a raça do seu pet?'
  if (missingFields.has('weight_kg')) return 'Qual é o peso aproximado do seu pet?'
  if (resolvedService && !cleanText(facts.service_date)) return 'Qual dia você prefere para o agendamento?'

  if (availability?.status === 'temporarily_unavailable') {
    return 'Já guardei as informações do seu pet, mas não consegui atualizar a agenda agora. Posso tentar a consulta novamente?'
  }
  if (resolution?.status === 'ambiguous' || resolution?.status === 'not_found') {
    return 'Não consegui identificar com segurança um único serviço compatível no cadastro. Vou precisar que a equipe revise o catálogo antes de confirmar o agendamento.'
  }

  return 'Já guardei as informações que você enviou. Vou continuar o atendimento a partir delas, sem pedir que você repita os dados.'
}

function formatPetbotCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function buildPetbotCommittedReply({ pendingOrder = null, result = {}, timezone = 'America/Sao_Paulo' } = {}) {
  const order = pendingOrder?.order || {}
  const customerName = cleanText(order.customer_name)
  const greeting = `Pronto${customerName ? `, ${customerName}` : ''}!`
  const duplicated = cleanText(result.status) === 'already_committed'

  if (order.order_type !== 'produto') {
    const scheduled = DateTime.fromISO(cleanText(order.scheduled_at), { setZone: true }).setZone(timezone)
    const scheduleLabel = scheduled.isValid
      ? scheduled.setLocale('pt-BR').toFormat("dd/MM/yyyy 'às' HH:mm")
      : cleanText(order.scheduled_at)
    const petLabel = cleanText(order.pet_name) ? ` do ${cleanText(order.pet_name)}` : ''
    const lines = [
      duplicated
        ? `${greeting} Esse agendamento${petLabel} já estava confirmado para ${scheduleLabel}.`
        : `${greeting} O agendamento${petLabel} foi confirmado para ${scheduleLabel}.`,
    ]

    if (order.order_type === 'banho_tosa') {
      if (Number(order.service_transport_fee || 0) > 0) {
        lines.push(`MotoDog: ${cleanText(order.service_transport_label) || 'transporte do pet'} (${formatPetbotCurrency(order.service_transport_fee)}).`)
      } else {
        lines.push('Chegada do pet: cliente leva à loja.')
      }
    }
    if (cleanText(order.notes)) lines.push(`Observação registrada: ${cleanText(order.notes)}.`)
    lines.push(`Total: ${formatPetbotCurrency(result.total ?? order.total)}. Pagamento após a conclusão do serviço.`)
    return lines.join('\n')
  }

  const lines = [
    duplicated
      ? `${greeting} Esse pedido já estava confirmado.`
      : `${greeting} Seu pedido foi confirmado.`,
    `Total: ${formatPetbotCurrency(result.total ?? order.total)}.`,
  ]
  if (cleanText(result.pix_key)) {
    lines.push(`Chave Pix: ${cleanText(result.pix_key)}${cleanText(result.pix_holder_name) ? ` — ${cleanText(result.pix_holder_name)}` : ''}.`)
  }
  return lines.join('\n')
}


async function respondWithPetbotAgent({
  supabase,
  sessionId,
  trimmedMessage,
  options,
  session,
  sessionForAgent,
  moduleId,
  intent,
  history,
  storeSettings,
  runtimeConfig,
  customer,
  llmInterpretation,
  products,
  services,
  appointments,
  customInstructions,
}) {
  const pendingAtTurnStart = getPendingAgentOrder(sessionForAgent.context)
  const previousAgentContext = parseJsonObject(sessionForAgent.context)?.petbot_agent || {}
  const interpretationForFacts = {
    ...(llmInterpretation || {}),
    ...(isExplicitNoServiceNotesAnswer(trimmedMessage, history)
      ? { service_notes: null, service_notes_resolved: true }
      : {}),
  }
  let serviceFacts = mergeInterpretedPetbotServiceFacts({
    interpretation: interpretationForFacts,
    previousFacts: previousAgentContext.facts || previousAgentContext.explicit_facts || {},
  })
  let pendingOrder = pendingAtTurnStart
  let orderResult = null
  let needsHuman = false
  let handoffTarget = null
  let updatedCustomerName = cleanText(session.customer_name)
  let activeCustomer = customer
  const mediaMessages = []
  let liveProducts = Array.isArray(products) ? products : []
  let liveServices = Array.isArray(services) ? services : []
  let liveAppointments = Array.isArray(appointments) ? appointments : []
  let liveSubscriptionBenefits = []
  const previousResolvedServiceState = previousAgentContext.resolved_service && typeof previousAgentContext.resolved_service === 'object'
    ? previousAgentContext.resolved_service
    : null
  const currentFactsSignature = petbotServiceFactsSignature(serviceFacts)
  let resolvedServiceThisTurn = previousResolvedServiceState?.fact_signature === currentFactsSignature
    ? (previousResolvedServiceState.service || previousResolvedServiceState)
    : null

  const refreshServiceCatalog = async ({ required = false } = {}) => {
    try {
      const freshServices = await loadPetshopServices(supabase, moduleId, session.tenant_id)
      if (freshServices.length) liveServices = freshServices
      if (liveServices.length) return liveServices
      if (required) throw new Error('Nenhum serviço ativo foi carregado do catálogo.')
      return []
    } catch (error) {
      logger.warn('PetBot service catalog refresh failed', {
        sessionId,
        moduleId,
        error: error instanceof Error ? error.message : String(error),
        fallback_count: liveServices.length,
      })
      if (liveServices.length) return liveServices
      if (required) throw error
      return []
    }
  }

  const refreshAppointmentContext = async () => {
    try {
      const freshAppointments = await loadAppointmentsFresh(supabase, moduleId, session.tenant_id, storeSettings)
      liveAppointments = freshAppointments
      return { ok: true, appointments: liveAppointments }
    } catch (error) {
      logger.warn('PetBot appointment refresh failed', {
        sessionId,
        moduleId,
        error: error instanceof Error ? error.message : String(error),
        fallback_count: liveAppointments.length,
      })
      return {
        ok: false,
        appointments: liveAppointments,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const mergeServiceFactsFromToolArgs = (toolArgs = {}) => {
    const previousSignature = petbotServiceFactsSignature(serviceFacts)
    serviceFacts = mergeInterpretedPetbotServiceFacts({
      interpretation: toolArgs,
      previousFacts: serviceFacts,
    })
    if (petbotServiceFactsSignature(serviceFacts) !== previousSignature) resolvedServiceThisTurn = null
    return groundPetbotServiceArgs(toolArgs, serviceFacts)
  }

  const interpretedProfilePatch = {
    customer_name: cleanText(llmInterpretation?.customer_name),
    pet_name: cleanText(serviceFacts.pet_name),
    species: cleanText(serviceFacts.species),
    size: cleanText(llmInterpretation?.size),
    breed: cleanText(serviceFacts.breed),
    weight_kg: Number(serviceFacts.weight_kg || 0) || null,
    coat_type: cleanText(serviceFacts.coat_type),
    symptom: cleanText(llmInterpretation?.symptom),
    address: cleanText(llmInterpretation?.delivery_address),
    neighborhood: cleanText(llmInterpretation?.neighborhood),
    city: cleanText(llmInterpretation?.city),
  }
  if (Object.values(interpretedProfilePatch).some(Boolean)) {
    try {
      const persistedCustomer = await ensureCustomerProfile(supabase, sessionForAgent, interpretedProfilePatch)
      activeCustomer = persistedCustomer
      updatedCustomerName = cleanText(persistedCustomer.client?.name) || updatedCustomerName
    } catch (error) {
      logger.warn('PetBot fact persistence failed', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const trustedCustomerName = () => {
    const candidates = [
      cleanText(llmInterpretation?.customer_name),
      cleanText(activeCustomer?.client?.name),
      cleanText(updatedCustomerName),
      cleanText(sessionForAgent.customer_name),
      cleanText(session.customer_name),
    ]
    return candidates.find((value) => value && !isPlaceholderName(value)) || ''
  }

  const [savedPets, subscriptionBenefits] = await Promise.all([
    loadCustomerPets(supabase, sessionForAgent),
    loadCustomerSubscriptionBenefits(
      supabase,
      sessionForAgent,
      activeCustomer?.client?.id || sessionForAgent.client_id,
    ),
  ])
  liveSubscriptionBenefits = subscriptionBenefits

  const serviceOrderType = inferPetbotServiceOrderType({
    interpretation: llmInterpretation,
    facts: serviceFacts,
    message: trimmedMessage,
    history,
  })
  let preloadedToolRuns = []
  let operationalContext = null
  if (serviceOrderType) {
    // Availability shown to the customer must come from a fresh agenda read.
    // The cached load is useful for initial context, but it is not authoritative
    // enough to advertise a slot. If the refresh fails, preflight returns a
    // temporary-unavailable result while preserving all customer facts.
    const needsAgendaRefresh = Boolean(cleanText(serviceFacts.service_date))
    const appointmentRefresh = needsAgendaRefresh
      ? await refreshAppointmentContext()
      : { ok: true }
    const preflight = buildPetbotOperationalPreflight({
      facts: serviceFacts,
      orderType: serviceOrderType,
      services: liveServices,
      appointments: liveAppointments,
      subscriptionBenefits: liveSubscriptionBenefits,
      settings: storeSettings,
      agendaAvailable: appointmentRefresh.ok,
    })
    serviceFacts = preflight.facts
    preloadedToolRuns = preflight.toolRuns
    operationalContext = preflight.context
    if (preflight.resolvedService) resolvedServiceThisTurn = preflight.resolvedService
  }

  const systemPrompt = buildPetbotAgentV3Prompt({
    storeName: storeSettings.storeName,
    storePhone: storeSettings.storePhone,
    storeLocation: [storeSettings.storeAddress, storeSettings.storeNeighborhood, storeSettings.storeCity].filter(Boolean).join(' - '),
    customer: {
      name: cleanText(updatedCustomerName) || null,
      known: Boolean(activeCustomer?.isKnown),
      phone: cleanText(activeCustomer?.phone || session.customer_phone) || null,
      address: cleanText(activeCustomer?.client?.address) || null,
      neighborhood: cleanText(activeCustomer?.client?.neighborhood) || null,
      city: cleanText(activeCustomer?.client?.city) || null,
      saved_pet: {
        name: cleanText(activeCustomer?.client?.details?.pet_name) || null,
        species: cleanText(activeCustomer?.client?.details?.species) || null,
        breed: cleanText(activeCustomer?.client?.details?.breed) || null,
        weight_kg: Number(activeCustomer?.client?.details?.weight_kg || 0) || null,
        coat_type: cleanText(activeCustomer?.client?.details?.coat_type) || null,
        size: cleanText(activeCustomer?.client?.details?.size) || null,
      },
      saved_pets: savedPets,
      subscription_benefits: subscriptionBenefits,
    },
    facts: {
      customer_name: cleanText(llmInterpretation?.customer_name) || cleanText(updatedCustomerName) || null,
      pet_name: serviceFacts.pet_name,
      species: serviceFacts.species,
      breed: serviceFacts.breed,
      weight_kg: serviceFacts.weight_kg,
      weight_label: serviceFacts.weight_label,
      weight_estimated: serviceFacts.weight_estimated,
      coat_type: serviceFacts.coat_type,
      resolved_service: resolvedServiceThisTurn
        ? {
          id: resolvedServiceThisTurn.id,
          product_id: resolvedServiceThisTurn.product_id || null,
          code: resolvedServiceThisTurn.code,
          name: resolvedServiceThisTurn.name,
        }
        : null,
      intent: cleanText(llmInterpretation?.intent) || null,
      service_type: cleanText(serviceFacts.service_type || llmInterpretation?.service_type) || null,
      service_date: cleanText(serviceFacts.service_date || llmInterpretation?.service_date) || null,
      service_time: cleanText(
        serviceFacts.service_preferred_time
        || serviceFacts.service_time_preference
        || llmInterpretation?.service_preferred_time
        || llmInterpretation?.service_time_preference,
      ) || null,
      product_kind: cleanText(llmInterpretation?.product_kind) || null,
      age_category: cleanText(llmInterpretation?.age_category) || null,
      brand: cleanText(llmInterpretation?.brand) || null,
      package_kg: Number(llmInterpretation?.package_kg || 0) || null,
    },
    pendingOrder: pendingAtTurnStart,
    operationalContext,
    customInstructions,
    timezone: storeSettings.petbotTimezone,
  })

  const executeTool = async (toolCall) => {
    const name = cleanText(toolCall?.function?.name)
    const args = parseAgentToolArguments(toolCall)

    if (name === 'search_petshop_products') {
      const query = [
        cleanText(args.query),
        cleanText(args.species),
        cleanText(args.age_category),
        cleanText(args.size),
        cleanText(args.brand),
        Number(args.package_kg || 0) > 0 ? `${Number(args.package_kg)} kg` : '',
      ].filter(Boolean).join(' ')
      if (!query) return { ok: false, action: name, status: 'invalid_input', error: 'missing_query' }
      const searched = (await loadProducts(supabase, moduleId, session.tenant_id, query))
        .filter(isSellableProduct)
      const refreshed = await loadProductsByIds(
        supabase,
        moduleId,
        session.tenant_id,
        searched.map((product) => product.id),
      )
      const found = refreshed.filter(isSellableProduct)
      liveProducts = mergeProductsById(liveProducts, found)
      const known = {
        ...normalizeProductQueryFacts(llmInterpretation || {}, serviceFacts),
        species: cleanText(args.species) || normalizeProductQueryFacts(llmInterpretation || {}, serviceFacts).species,
        age_category: cleanText(args.age_category) || cleanText(llmInterpretation?.age_category),
        size: cleanText(args.size) || cleanText(llmInterpretation?.size),
        brand: cleanText(args.brand) || cleanText(llmInterpretation?.brand),
        package_kg: Number(args.package_kg || llmInterpretation?.package_kg || 0) || null,
      }
      const differentiation = analyzeProductDifferentiation(found.slice(0, 12), known)
      return {
        ok: found.length > 0,
        action: name,
        source: 'products',
        status: differentiation.status,
        differentiators: differentiation.differentiators,
        products: found.slice(0, 12).map((product) => ({
          id: product.id,
          name: product.name,
          category: product.category || null,
          species_target: product.species_target || null,
          price: Number(product.price || 0),
          stock_quantity: Number(product.stock_quantity || 0),
          image_available: Boolean(cleanText(product.image_url)),
        })),
      }
    }

    if (name === 'resolve_petshop_service') {
      const groundedArgs = mergeServiceFactsFromToolArgs(args)
      await refreshServiceCatalog({ required: false })
      let resolution = resolvePetshopService({
        serviceQuery: args.service_query || llmInterpretation?.service_type || args.order_type,
        orderType: args.order_type || llmInterpretation?.intent,
        services: liveServices,
        species: groundedArgs.species,
        breed: groundedArgs.breed,
        weightKg: groundedArgs.weight_kg,
        coatType: groundedArgs.coat_type,
      })
      if (resolution.status === 'needs_input') {
        const satisfied = new Set([
          ...(cleanText(serviceFacts.breed) ? ['breed'] : []),
          ...(Number(serviceFacts.weight_kg || 0) > 0 ? ['weight_kg'] : []),
          ...(cleanText(serviceFacts.species) ? ['species'] : []),
        ])
        const missingFields = (resolution.missing_fields || []).filter((field) => !satisfied.has(field))
        const requiredFields = (resolution.required_fields || []).filter((field) => {
          const normalized = normalizeSearchText(field)
          if (satisfied.has('breed') && normalized.includes('raca')) return false
          if (satisfied.has('weight_kg') && normalized.includes('peso')) return false
          if (normalized.includes('pelo') || normalized.includes('pelagem')) return false
          return true
        })
        resolution = {
          ...resolution,
          missing_fields: missingFields,
          required_fields: requiredFields,
          ...(missingFields.length || requiredFields.length ? {} : {
            status: 'ambiguous',
            error: resolution.error || 'O catálogo não conseguiu diferenciar o serviço usando os fatos já informados. Não repita perguntas ao cliente.',
          }),
        }
      }
      const subscriptionBenefit = resolution.ok && resolution.status === 'resolved'
        ? findPetshopSubscriptionBenefit(resolution.service, liveSubscriptionBenefits)
        : null
      const resolvedService = resolution.ok && resolution.status === 'resolved'
        ? {
          ...resolution.service,
          regular_price: Number(resolution.service.price || 0),
          price: subscriptionBenefit ? 0 : Number(resolution.service.price || 0),
          subscription_benefit: subscriptionBenefit,
        }
        : null
      resolvedServiceThisTurn = resolvedService
      const nextAction = resolution.status === 'resolved'
        ? 'check_availability_when_date_is_known'
        : resolution.status === 'needs_input'
          ? 'ask_missing_fields'
          : resolution.status === 'ambiguous'
            ? 'ask_one_differentiating_fact'
            : 'explain_unavailable_or_handoff_if_persistent'
      return {
        action: name,
        ...resolution,
        next_action: nextAction,
        ...(resolvedService ? { service: resolvedService, candidates: [resolvedService], available_services: [resolvedService] } : {}),
      }
    }

    if (name === 'check_petshop_availability') {
      mergeServiceFactsFromToolArgs({
        service_date: args.date,
        service_preferred_time: args.preferred_time,
        service_time_preference: args.period,
      })
      const requestedServiceId = cleanText(args.service_id)
      const allowedServiceIds = new Set([
        cleanText(resolvedServiceThisTurn?.id),
        cleanText(resolvedServiceThisTurn?.code),
        cleanText(resolvedServiceThisTurn?.product_id),
      ].filter(Boolean))
      if (!resolvedServiceThisTurn || !allowedServiceIds.has(requestedServiceId)) {
        return {
          ok: false,
          action: name,
          status: 'needs_service_resolution',
          next_action: 'resolve_service_or_ask_missing_fact',
          error: 'Resolva o serviço exato com os fatos do cliente antes de consultar a agenda.',
        }
      }
      await refreshServiceCatalog({ required: false })
      const appointmentRefresh = await refreshAppointmentContext()
      if (!appointmentRefresh.ok) {
        return {
          ok: false,
          action: name,
          status: 'temporarily_unavailable',
          next_action: 'apologize_briefly_and_offer_to_retry_the_schedule_without_handoff',
          error_code: 'agenda_refresh_failed',
        }
      }
      const availability = buildServiceAvailability({
        serviceQuery: args.service_id,
        orderType: args.order_type || llmInterpretation?.intent,
        species: serviceFacts.species,
        breed: serviceFacts.breed,
        weightKg: serviceFacts.weight_kg,
        coatType: serviceFacts.coat_type,
        date: args.date || serviceFacts.service_date,
        preferredTime: args.preferred_time || serviceFacts.service_preferred_time,
        period: args.period || serviceFacts.service_time_preference,
        services: liveServices,
        appointments: liveAppointments,
        settings: storeSettings,
        requirePetIdentity: false,
        requireServiceClassification: false,
      })
      const subscriptionBenefit = availability?.service
        ? findPetshopSubscriptionBenefit(availability.service, liveSubscriptionBenefits)
        : null
      const decoratePrice = (entry = {}) => ({
        ...entry,
        regular_price: Number(entry.price || availability?.service?.price || 0),
        price: subscriptionBenefit ? 0 : Number(entry.price || 0),
        subscription_benefit: subscriptionBenefit,
      })
      const nextAction = availability?.status === 'available'
        ? 'answer_with_validated_availability'
        : availability?.status === 'unavailable'
          ? 'offer_validated_alternatives_or_ask_another_date'
          : 'ask_missing_schedule_fact'
      return {
        action: name,
        ...availability,
        next_action: nextAction,
        ...(availability?.service ? { service: decoratePrice(availability.service) } : {}),
        available_slots: (availability?.available_slots || []).map(decoratePrice),
      }
    }

    if (name === 'get_petshop_transport_options') {
      const options = listPetTransportOptions(storeSettings)
      return {
        ok: true,
        action: name,
        status: options.length ? 'available' : 'unavailable',
        no_transport_allowed: true,
        options,
      }
    }

    if (['prepare_petshop_product_order', 'prepare_petshop_service_booking', 'prepare_petshop_order'].includes(name)) {
      const isProductOrder = name === 'prepare_petshop_product_order'
        || (name === 'prepare_petshop_order' && args.order_type === 'produto')
      const baseArgs = isProductOrder
        ? { ...args, order_type: 'produto' }
        : mergeServiceFactsFromToolArgs({ ...args, order_type: args.order_type || serviceOrderType || 'banho_tosa' })
      const modelCustomerName = cleanText(baseArgs.customer_name)
      const effectiveArgs = {
        ...baseArgs,
        customer_name: trustedCustomerName() || (!isPlaceholderName(modelCustomerName) ? modelCustomerName : ''),
        ...(isProductOrder ? {} : {
          items: [],
          payment_method: null,
          fulfillment_type: 'servico',
          delivery_address: null,
          delivery_neighborhood: null,
          delivery_city: null,
          delivery_reference: null,
          change_for: null,
        }),
      }
      if (isProductOrder) {
        const productIds = (Array.isArray(effectiveArgs.items) ? effectiveArgs.items : [])
          .map((item) => cleanText(item.product_id))
          .filter(Boolean)
        const freshProducts = await loadProductsByIds(supabase, moduleId, session.tenant_id, productIds)
        liveProducts = mergeProductsById(liveProducts, freshProducts)
      } else {
        await refreshServiceCatalog({ required: true })
        const appointmentRefresh = await refreshAppointmentContext()
        if (!appointmentRefresh.ok) {
          return {
            ok: false,
            action: name,
            status: 'temporarily_unavailable',
            missing_fields: [],
            error_code: 'agenda_refresh_failed',
          }
        }
      }

      const prepared = preparePetshopOrderDraft({
        args: effectiveArgs,
        products: liveProducts,
        services: liveServices,
        appointments: liveAppointments,
        subscriptionBenefits: liveSubscriptionBenefits,
        settings: storeSettings,
      })
      if (!prepared.ok) {
        return {
          ok: false,
          action: name,
          status: 'needs_input',
          missing_fields: prepared.missing || [],
        }
      }

      pendingOrder = {
        id: prepared.pending_order_id,
        order: prepared.order,
        summary: prepared.summary,
        prepared_at: new Date().toISOString(),
      }
      return {
        ok: true,
        action: name,
        pending_order_id: pendingOrder.id,
        status: 'prepared',
        summary: pendingOrder.summary,
        order: pendingOrder.order,
      }
    }

    if (name === 'create_confirmed_petshop_order') {
      if (args.confirmation !== true || !isExplicitPetbotConfirmation(trimmedMessage)) {
        return {
          ok: false,
          action: name,
          error: 'A mensagem atual não contém confirmação explícita do cliente.',
        }
      }
      if (!pendingAtTurnStart) {
        return {
          ok: false,
          action: name,
          error: 'Não existe pedido preparado em mensagem anterior. Prepare e apresente o resumo primeiro.',
        }
      }
      if (!canPetbotCreateOrders(storeSettings, sessionForAgent)) {
        needsHuman = true
        handoffTarget = 'atendente'
        return {
          ok: false,
          action: name,
          error: 'Este contato não está habilitado para criação autônoma de pedidos.',
          handoff: true,
        }
      }

      let refreshedProducts = liveProducts
      let refreshedServices = liveServices
      let refreshedAppointments = liveAppointments
      if (pendingAtTurnStart.order.order_type === 'produto') {
        const productIds = (pendingAtTurnStart.order.items || [])
          .map((item) => cleanText(item.product_id))
          .filter(Boolean)
        refreshedProducts = await loadProductsByIds(supabase, moduleId, session.tenant_id, productIds)
        liveProducts = mergeProductsById(liveProducts, refreshedProducts)
      } else {
        refreshedServices = await refreshServiceCatalog({ required: true })
        const appointmentRefresh = await refreshAppointmentContext()
        if (!appointmentRefresh.ok) {
          return {
            ok: false,
            action: name,
            status: 'temporarily_unavailable',
            reason: 'agenda_refresh_failed',
          }
        }
        refreshedAppointments = appointmentRefresh.appointments
        liveSubscriptionBenefits = await loadCustomerSubscriptionBenefits(
          supabase,
          sessionForAgent,
          activeCustomer?.client?.id || sessionForAgent.client_id,
        )
      }

      const groundedPendingOrder = pendingAtTurnStart.order.order_type === 'produto'
        ? pendingAtTurnStart.order
        : groundPetbotServiceArgs(pendingAtTurnStart.order, serviceFacts)
      const revalidated = preparePetshopOrderDraft({
        args: groundedPendingOrder,
        products: pendingAtTurnStart.order.order_type === 'produto' ? refreshedProducts : liveProducts,
        services: refreshedServices,
        appointments: refreshedAppointments,
        subscriptionBenefits: liveSubscriptionBenefits,
        settings: storeSettings,
      })
      if (!revalidated.ok) {
        return {
          ok: false,
          action: name,
          status: 'needs_refresh',
          reason: 'operational_data_changed',
          missing_fields: revalidated.missing || [],
        }
      }

      if (revalidated.pending_order_id !== pendingAtTurnStart.id) {
        pendingOrder = {
          id: revalidated.pending_order_id,
          order: revalidated.order,
          summary: revalidated.summary,
          prepared_at: new Date().toISOString(),
        }
        return {
          ok: false,
          action: name,
          status: 'changed',
          changed: true,
          pending_order_id: pendingOrder.id,
          summary: revalidated.summary,
          order: revalidated.order,
        }
      }

      orderResult = await createConfirmedPetshopOrderViaRpc(
        supabase,
        sessionForAgent,
        storeSettings,
        {
          ...revalidated.order,
          idempotency_key: `${sessionId}:${pendingAtTurnStart.id}`,
        },
      )
      pendingOrder = null
      return {
        ok: true,
        action: name,
        status: orderResult.duplicated ? 'already_committed' : 'committed',
        sale_id: orderResult.sale_id,
        order_id: orderResult.order_id,
        appointment_id: orderResult.appointment_id,
        total: orderResult.total,
        payment_status: orderResult.payment_status,
        subscription_benefit_used: Boolean(orderResult.subscription_benefit_used),
        subscription_plan_name: orderResult.subscription_plan_name || null,
        pix_key: pendingAtTurnStart.order.payment_method === 'pix' ? storeSettings.pixKey || null : null,
        pix_holder_name: pendingAtTurnStart.order.payment_method === 'pix' ? storeSettings.pixHolderName || null : null,
      }
    }

    if (name === 'cancel_pending_petshop_order') {
      const hadPendingOrder = Boolean(pendingOrder)
      pendingOrder = null
      return {
        ok: true,
        action: name,
        status: hadPendingOrder ? 'cancelled' : 'nothing_to_cancel',
        reason: cleanText(args.reason).slice(0, 240) || null,
      }
    }

    if (name === 'send_product_image') {
      const product = (liveProducts || []).find((item) => cleanText(item.id) === cleanText(args.product_id))
      if (!product) return { ok: false, action: name, error: 'Produto não encontrado no contexto real.' }
      if (!cleanText(product.image_url)) return { ok: false, action: name, error: 'Produto sem foto aprovada no cadastro.' }
      const attachment = {
        type: 'image',
        productId: product.id,
        productName: product.name,
        imageUrl: product.image_url,
      }
      mediaMessages.push(attachment)
      return {
        ok: true,
        action: name,
        product_name: product.name,
        image_attached: true,
      }
    }

    if (name === 'handoff_to_human') {
      needsHuman = true
      handoffTarget = args.target === 'veterinaria' ? 'veterinaria' : 'atendente'
      return {
        ok: true,
        action: name,
        target: handoffTarget,
        reason: cleanText(args.reason).slice(0, 240),
      }
    }

    return { ok: false, error: `Ferramenta desconhecida: ${name}` }
  }

  const currentMessageIsConfirmation = Boolean(pendingAtTurnStart && isExplicitPetbotConfirmation(trimmedMessage))
  const initialToolChoice = currentMessageIsConfirmation
    ? { type: 'function', function: { name: 'create_confirmed_petshop_order' } }
    : 'auto'

  const agentResult = await runPetbotAgent({
    model: runtimeConfig.modelName,
    temperature: runtimeConfig.temperature,
    systemPrompt,
    history,
    message: trimmedMessage,
    tools: PETBOT_AGENT_TOOLS,
    callModel: (params) => callOpenAIWithTimeout(params, serverEnv.openAiTimeoutMs),
    executeTool,
    initialToolChoice,
    // A one-field JSON response format added an unnecessary compatibility
    // surface to multi-turn function calling. Tool arguments remain strict;
    // customer-facing replies are plain text and validated server-side.
    responseFormat: null,
    parseReply: parsePetbotAgentReply,
    initialToolRuns: preloadedToolRuns,
    fallbackReply: ({ toolRuns }) => buildPetbotLocalRecoveryReply({
      facts: serviceFacts,
      toolRuns,
      resolvedService: resolvedServiceThisTurn,
      timezone: storeSettings.petbotTimezone,
    }),
    resolveTerminalReply: ({ toolName, result }) => {
      if (toolName !== 'create_confirmed_petshop_order') return ''
      if (!['committed', 'already_committed'].includes(cleanText(result?.status))) return ''
      return buildPetbotCommittedReply({
        pendingOrder: pendingAtTurnStart,
        result,
        timezone: storeSettings.petbotTimezone,
      })
    },
    validateReply: ({ reply: draftReply, toolRuns }) => {
      const operationalValidation = validatePetbotOperationalReply({
        reply: draftReply,
        toolRuns,
        pendingOrder,
        orderResult,
        timezone: storeSettings.petbotTimezone,
      })
      const conversationValidation = validatePetbotConversationReply({
        reply: draftReply,
        facts: serviceFacts,
        pendingOrder,
        currentMessageIsConfirmation,
        serviceContext: Boolean(
          serviceOrderType
          || (pendingOrder?.order?.order_type && pendingOrder.order.order_type !== 'produto'),
        ),
      })
      const problems = [
        ...(operationalValidation.problems || []),
        ...(conversationValidation.problems || []),
      ]
      if (!problems.length) return { ok: true }

      return {
        ok: false,
        instruction: [
          'A resposta anterior contradiz os dados confiáveis ou repetiu uma pergunta já respondida.',
          `Problemas: ${problems.join('; ')}.`,
          'Reescreva naturalmente usando o estado confiável e os resultados das ferramentas. Pergunte somente um fato que realmente esteja ausente.',
          'Nunca pergunte tipo de pelo ou pelagem e não peça novamente raça, peso, data ou horário já conhecidos.',
          'Não mencione validações, ferramentas, regras internas ou este aviso.',
        ].join('\n'),
      }
    },
  })

  const reply = cleanText(agentResult.reply)
  if (!reply) throw new HttpError(502, 'The PetBot agent response came back empty.')

  // Tool calls may extract a customer fact that the lightweight interpreter
  // omitted. Persist the final structured state after the autonomous loop, but
  // never let a profile write failure replace a valid customer response.
  const finalProfilePatch = {
    customer_name: cleanText(llmInterpretation?.customer_name) || cleanText(updatedCustomerName),
    pet_name: cleanText(serviceFacts.pet_name),
    species: cleanText(serviceFacts.species),
    breed: cleanText(serviceFacts.breed),
    weight_kg: Number(serviceFacts.weight_kg || 0) || null,
    coat_type: cleanText(serviceFacts.coat_type),
    symptom: cleanText(llmInterpretation?.symptom),
  }
  if (Object.values(finalProfilePatch).some(Boolean)) {
    try {
      const persistedCustomer = await ensureCustomerProfile(supabase, sessionForAgent, finalProfilePatch)
      activeCustomer = persistedCustomer
      updatedCustomerName = cleanText(persistedCustomer.client?.name) || updatedCustomerName
    } catch (error) {
      logger.warn('PetBot final fact persistence failed', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const botSentAt = new Date().toISOString()
  const existingContext = parseJsonObject(sessionForAgent.context)
  const nextContext = {
    ...existingContext,
    ...(orderResult ? {
      last_sale_id: orderResult.sale_id,
      last_order_id: orderResult.order_id || null,
      last_appointment_id: orderResult.appointment_id || null,
      last_payment_status: orderResult.payment_status || null,
      last_total: Number(orderResult.total || 0),
    } : {}),
    petbot_agent: {
      version: 3,
      engine_version: 'petbot_agent_v3',
      updatedAt: botSentAt,
      pending_order: pendingOrder,
      facts: serviceFacts,
      resolved_service: resolvedServiceThisTurn
        ? {
          fact_signature: petbotServiceFactsSignature(serviceFacts),
          service: resolvedServiceThisTurn,
        }
        : null,
      last_action: agentResult.recovered ? 'agent_recovery' : (agentResult.toolRuns.at(-1)?.name || 'reply'),
      last_tools: agentResult.toolRuns.map((run) => ({ name: run.name, ok: run.ok, status: run.status || null })),
      needs_human: needsHuman,
      handoff_target: handoffTarget,
      order_saved: Boolean(orderResult),
    },
  }

  const sessionPatch = {
    intent,
    context: nextContext,
    ...(updatedCustomerName ? { customer_name: updatedCustomerName } : {}),
    ...(needsHuman ? { status: 'human' } : {}),
    last_message_at: botSentAt,
  }

  let sessionUpdate = supabase
    .from('chat_sessions')
    .update(sessionPatch)
    .eq('id', sessionId)
  if (cleanText(session.last_message_at)) {
    sessionUpdate = sessionUpdate.eq('last_message_at', session.last_message_at)
  }
  const { data: updatedSession, error: sessionUpdateError } = await sessionUpdate
    .select('id, context')
    .maybeSingle()

  if (!sessionUpdateError && !updatedSession && cleanText(session.last_message_at)) {
    const staleError = new HttpError(409, 'A newer customer message superseded this PetBot turn.')
    staleError.code = 'PETBOT_STALE_TURN'
    throw staleError
  }
  if (sessionUpdateError || !updatedSession || !hasPetbotState(updatedSession.context)) {
    throw new HttpError(500, `Unable to persist PetBot agent state${sessionUpdateError?.message ? `: ${sessionUpdateError.message}` : '.'}`)
  }

  const primaryImage = mediaMessages.find((item) => item.type === 'image' && item.imageUrl)
  const { data: savedReply, error: replyInsertError } = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role: 'assistant',
      content: reply,
      metadata: {
        source: options.source || 'dashboard_simulation',
        ...(options.assistantMetadata || {}),
        ...(primaryImage ? {
          image_url: primaryImage.imageUrl,
          media_attachments: mediaMessages,
        } : {}),
        petbot_agent: {
          engine_version: 'petbot_agent_v3',
          model: runtimeConfig.modelName,
          tool_calls: agentResult.toolRuns.map((run) => ({ name: run.name, ok: run.ok, status: run.status || null, duration_ms: run.duration_ms || 0 })),
          steps: agentResult.steps || 0,
          validation_retries: agentResult.validationRetries || 0,
          recovered: Boolean(agentResult.recovered),
          terminal: Boolean(agentResult.terminal),
          recovery_reason: cleanText(agentResult.recoveryReason).slice(0, 160) || null,
          duration_ms: agentResult.durationMs || 0,
          pending_order_id: pendingOrder?.id || null,
          order_saved: Boolean(orderResult),
          needs_human: needsHuman,
          handoff_target: handoffTarget,
        },
      },
      tokens_used: agentResult.tokensUsed,
      sent_at: botSentAt,
    })
    .select('id, role, content, metadata, tokens_used, sent_at')
    .single()

  if (replyInsertError) throw new HttpError(500, 'Unable to save assistant response.')

  await recordPetbotEvent(supabase, {
    tenant_id: session.tenant_id,
    module_id: moduleId,
    session_id: sessionId,
    message_id: savedReply.id,
    event_type: orderResult ? 'order_saved' : (needsHuman ? 'handoff' : 'turn'),
    engine_version: 'petbot_agent_v3',
    intent,
    action: agentResult.toolRuns.at(-1)?.name || 'reply',
    outcome: orderResult ? 'saved' : (needsHuman ? 'handoff' : 'ok'),
    handoff_target: needsHuman ? handoffTarget : null,
    metadata: {
      tools: agentResult.toolRuns.map((run) => ({ name: run.name, ok: run.ok, status: run.status || null, duration_ms: run.duration_ms || 0 })),
      steps: agentResult.steps || 0,
      validation_retries: agentResult.validationRetries || 0,
      recovered: Boolean(agentResult.recovered),
      recovery_reason: cleanText(agentResult.recoveryReason).slice(0, 160) || null,
      duration_ms: agentResult.durationMs || 0,
      pending_order_id: pendingOrder?.id || null,
      source: options.source || 'dashboard_simulation',
    },
  })

  logger.info('Chat response generated', {
    sessionId,
    moduleId,
    intent,
    tokens: agentResult.tokensUsed,
    guarded: false,
    engine: 'petbot_agent_v3',
  })

  return { reply, savedMessage: savedReply }
}

function isPetbotServiceConversation(intent = '', message = '', history = []) {
  if (['banho_tosa', 'veterinaria'].includes(cleanText(intent))) return true
  const text = [...(history || []).slice(-6).map((entry) => cleanText(entry.content)), cleanText(message)]
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return /\b(banho|tosa|agendar|agendamento|consulta|vacina|veterin)\b/.test(text)
}

async function respondWithPetbotRecoverableFailure({
  supabase,
  session,
  sessionId,
  moduleId,
  intent,
  options,
  error,
}) {
  const serviceConversation = isPetbotServiceConversation(intent)
  const reply = serviceConversation
    ? 'Desculpe, não consegui concluir a consulta dos serviços e da agenda agora. As informações que você enviou continuam na conversa; posso tentar novamente sem você repetir os dados.'
    : 'Desculpe, não consegui concluir a consulta agora. As informações que você enviou continuam na conversa; posso tentar novamente sem você repetir os dados.'
  const botSentAt = new Date().toISOString()
  const existingContext = parseJsonObject(session.context)
  const previousAgentState = existingContext.petbot_agent && typeof existingContext.petbot_agent === 'object'
    ? existingContext.petbot_agent
    : {}
  const nextContext = {
    ...existingContext,
    petbot_agent: {
      ...previousAgentState,
      version: 3,
      engine_version: 'petbot_agent_v3',
      updatedAt: botSentAt,
      pending_order: previousAgentState.pending_order || null,
      last_action: 'recoverable_agent_error',
      last_tools: [],
      needs_human: false,
      handoff_target: null,
      order_saved: false,
      failure: cleanText(error instanceof Error ? error.message : error).slice(0, 300),
    },
  }

  let recoveryUpdate = supabase
    .from('chat_sessions')
    .update({ context: nextContext, last_message_at: botSentAt })
    .eq('id', sessionId)
  if (cleanText(session.last_message_at)) {
    recoveryUpdate = recoveryUpdate.eq('last_message_at', session.last_message_at)
  }
  const { data: recoveredSession, error: sessionError } = await recoveryUpdate
    .select('id')
    .maybeSingle()
  if (!sessionError && !recoveredSession && cleanText(session.last_message_at)) {
    const staleError = new HttpError(409, 'A newer customer message superseded this PetBot recovery turn.')
    staleError.code = 'PETBOT_STALE_TURN'
    throw staleError
  }
  if (sessionError) throw new HttpError(500, 'Unable to persist recoverable PetBot error.')

  const { data: savedReply, error: replyError } = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role: 'assistant',
      content: reply,
      metadata: {
        source: options.source || 'dashboard_simulation',
        engine_version: 'petbot_agent_v3',
        recoverable_agent_error: true,
        ...(options.assistantMetadata || {}),
      },
      tokens_used: 0,
      sent_at: botSentAt,
    })
    .select('id, role, content, metadata, tokens_used, sent_at')
    .single()
  if (replyError) throw new HttpError(500, 'Unable to save recoverable PetBot reply.')

  await recordPetbotEvent(supabase, {
    tenant_id: session.tenant_id,
    module_id: moduleId,
    session_id: sessionId,
    message_id: savedReply.id,
    event_type: 'agent_error',
    engine_version: 'petbot_agent_v3',
    intent,
    action: 'recoverable_agent_error',
    outcome: 'retry_requested',
    handoff_target: null,
    metadata: {
      source: options.source || 'dashboard_simulation',
      error: cleanText(error instanceof Error ? error.message : error).slice(0, 300),
      openai: error?.openai || null,
    },
  })

  return { reply, savedMessage: savedReply }
}

export async function respondToChatMessage(supabase, sessionId, message, options = {}) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : ''

  if (!trimmedMessage) {
    throw new HttpError(400, 'Message cannot be empty.')
  }

  if (trimmedMessage.length > 4000) {
    throw new HttpError(400, 'Message is too long.')
  }

  const { data: session, error: sessionError } = await supabase
    .from('chat_sessions')
    .select('id, module_id, tenant_id, customer_phone, customer_name, status, client_id, context, csat_score, last_message_at')
    .eq('id', sessionId)
    .maybeSingle()

  if (sessionError || !session) {
    throw new HttpError(404, 'Chat session not found.')
  }

  if (!session.tenant_id) {
    throw new HttpError(500, 'Chat session is missing tenant_id.')
  }

  const rating = parseRating(trimmedMessage)
  if (rating !== null && hasConfirmedOrderContext(session)) {
    if (!options.skipUserPersistence) {
      await insertUserMessages(supabase, sessionId, normalizeDashboardUserMessages(trimmedMessage, options))
    }
    await saveSatisfactionRating(supabase, sessionId, rating)
    const reply = `Obrigado pela nota ${rating}! Atendimento encerrado.`
    const botSentAt = new Date().toISOString()
    const { data: savedReply, error: replyInsertError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        role: 'assistant',
        content: reply,
        metadata: {
          source: options.source || 'dashboard_simulation',
          csat_score: rating,
          ...(options.assistantMetadata || {}),
        },
        tokens_used: 0,
        sent_at: botSentAt,
      })
      .select('id, role, content, metadata, tokens_used, sent_at')
      .single()

    if (replyInsertError) {
      throw new HttpError(500, 'Unable to save assistant response.')
    }

    return { reply, savedMessage: savedReply }
  }

  if (hasConfirmedOrderContext(session) && await updateCustomerRegistrationFromMessage(supabase, session, trimmedMessage)) {
    if (!options.skipUserPersistence) {
      await insertUserMessages(supabase, sessionId, normalizeDashboardUserMessages(trimmedMessage, options))
    }
    const reply = 'Recebi os dados e atualizei o cadastro. Obrigado!\n\nDe 0 a 10, como avalia o atendimento?'
    const botSentAt = new Date().toISOString()
    const { data: savedReply, error: replyInsertError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        role: 'assistant',
        content: reply,
        metadata: {
          source: options.source || 'dashboard_simulation',
          registration_update: true,
          ...(options.assistantMetadata || {}),
        },
        tokens_used: 0,
        sent_at: botSentAt,
      })
      .select('id, role, content, metadata, tokens_used, sent_at')
      .single()

    if (replyInsertError) {
      throw new HttpError(500, 'Unable to save assistant response.')
    }

    return { reply, savedMessage: savedReply }
  }

  if (session.status === 'human' && !options.allowBotWhenHuman) {
    throw new HttpError(409, 'Chat is currently assigned to a human agent.')
  }

  const moduleId = String(session.module_id || '').trim().toLowerCase()
  if (!SUPPORTED_MODULES.has(moduleId)) {
    throw new HttpError(400, `Unsupported module_id "${session.module_id}".`)
  }

  const intent = detectIntent(trimmedMessage)
  const history = await loadRecentMessages(supabase, sessionId)
  const recoveredContext = recoverPetbotContextFromHistory(session.context || {}, session, history)
  const sessionForAgent = { ...session, context: recoveredContext }
  const [storeSettings, runtimeConfig, customer] = await Promise.all([
    loadStoreSettings(supabase, moduleId, session.tenant_id),
    loadBotRuntimeConfig(supabase, session.tenant_id, moduleId),
    ensureCustomerProfile(supabase, sessionForAgent),
  ])
  const customInstructions = [storeSettings.botPrompt, runtimeConfig.systemPrompt]
    .filter(Boolean)
    .join('\n\n')
  const llmInterpretation = await interpretPetbotMessageWithLlm({
    apiKey: serverEnv.openAiApiKey,
    model: runtimeConfig.modelName,
    temperature: runtimeConfig.temperature,
    timeoutMs: serverEnv.openAiTimeoutMs,
    message: trimmedMessage,
    history,
    state: recoveredContext,
    customerContext: buildCustomerContext(customer),
    mediaContext: options.mediaContext || '',
    customInstructions,
  })
  const catalogSearchText = buildPetbotSearchText(
    buildInterpretedPetbotSearchText(buildCatalogSearchText(history, trimmedMessage), llmInterpretation),
    recoveredContext,
  )
  const [products, services, appointments] = await Promise.all([
    loadProducts(supabase, moduleId, session.tenant_id, catalogSearchText),
    loadPetshopServices(supabase, moduleId, session.tenant_id),
    loadAppointments(supabase, moduleId, session.tenant_id, storeSettings),
  ])

  const userMessages = normalizeDashboardUserMessages(trimmedMessage, options)
  if (!options.skipUserPersistence) {
    await insertUserMessages(supabase, sessionId, userMessages)
  }

  try {
    return await respondWithPetbotAgent({
      supabase,
      sessionId,
      trimmedMessage,
      options,
      session,
      sessionForAgent,
      moduleId,
      intent,
      history,
      storeSettings,
      runtimeConfig,
      customer,
      llmInterpretation,
      products,
      services,
      appointments,
      customInstructions,
    })
  } catch (error) {
    if (error?.code === 'PETBOT_STALE_TURN') throw error
    logger.warn('PetBot agent failed', {
      sessionId,
      moduleId,
      error: error instanceof Error ? error.message : String(error),
    })
    return respondWithPetbotRecoverableFailure({
      supabase,
      session: sessionForAgent,
      sessionId,
      moduleId,
      intent,
      options,
      error,
    })
  }
}
