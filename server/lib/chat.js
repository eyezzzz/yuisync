import { HttpError } from './http.js'
import { serverEnv } from './env.js'
import { logger } from './logger.js'
import {
  buildPetbotSearchText,
  markPetbotOrderError,
  markPetbotOrderSaved,
  mergePetbotContext,
  recoverPetbotContextFromHistory,
  runPetbotGuard,
  snapshotPetbotState,
} from './petbotGuard.js'
import {
  buildInterpretedPetbotSearchText,
  interpretPetbotMessageWithLlm,
  redraftPetbotReplyWithLlm,
} from './petbotAi.js'

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
const DEFAULT_DELIVERY_FEE = 10
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

const PETBOT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'update_customer_profile',
      description: 'Atualiza o cadastro do cliente/pet quando o cliente informou dados novos na conversa.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          customer_name: { type: 'string' },
          pet_name: { type: 'string' },
          species: { type: 'string', enum: ['dog', 'cat', 'other', ''] },
          size: { type: 'string' },
          breed: { type: 'string' },
          symptom: { type: 'string' },
          address: { type: 'string' },
          neighborhood: { type: 'string' },
          city: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_confirmed_petshop_order',
      description: 'Registra venda, ordem operacional e/ou agendamento somente depois do cliente confirmar o resumo final.',
      parameters: {
        type: 'object',
        required: ['customer_name', 'order_type', 'items', 'total', 'payment_method', 'fulfillment_type'],
        additionalProperties: false,
        properties: {
          customer_name: { type: 'string' },
          pet_name: { type: 'string' },
          species: { type: 'string' },
          size: { type: 'string' },
          order_type: { type: 'string', enum: ['produto', 'banho_tosa', 'veterinaria'] },
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'quantity', 'unit_price'],
              additionalProperties: false,
              properties: {
                product_id: { type: 'string' },
                name: { type: 'string' },
                quantity: { type: 'number' },
                unit_price: { type: 'number' },
                upsell: { type: 'boolean' },
              },
            },
          },
          service_type: { type: 'string' },
          scheduled_at: { type: 'string' },
          total: { type: 'number' },
          payment_method: { type: 'string', enum: ['pix', 'dinheiro', 'cartao'] },
          change_for: { type: 'number' },
          fulfillment_type: { type: 'string', enum: ['entrega', 'retirada', 'servico'] },
          delivery_address: { type: 'string' },
          delivery_neighborhood: { type: 'string' },
          delivery_city: { type: 'string' },
          delivery_reference: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
  },
]

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

function escapeIlike(value = '') {
  return cleanText(value).replace(/[%_\\]/g, (char) => `\\${char}`)
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
  return Boolean(parsed.petbot && typeof parsed.petbot === 'object' && parsed.petbot.updatedAt)
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

function isPlaceholderName(value = '') {
  const name = cleanText(value).toLowerCase()
  return !name || ['cliente', 'cliente whatsapp', 'whatsapp', 'sem nome'].includes(name) || /^cliente[-\s]?\d+/i.test(name)
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

function buildStockContext(products) {
  if (!products?.length) {
    return 'Nenhum produto disponivel confirmado no cadastro para esta busca.'
  }

  return products
    .filter(isSellableProduct)
    .map((product) => [
      `ID: ${product.id}`,
      `NOME: ${product.name}`,
      `CAT: ${product.category || 'Sem categoria'}`,
      `PRECO: R$ ${Number(product.price || 0).toFixed(2)}`,
      `QTD: ${product.stock_quantity}`,
      `FOTO: ${product.image_url ? 'sim' : 'nao'}`,
    ].join(' | '))
    .join('\n')
}

function isSellableProduct(product) {
  const name = String(product?.name || '').trim()
  return Boolean(product?.active)
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

function buildAppointmentsContext(appointments) {
  if (!appointments?.length) {
    return 'Nenhum horario cadastrado na agenda para os proximos dias. Nao prometa horario; pergunte se deseja falar com atendente.'
  }

  const lines = appointments
    .slice(0, 30)
    .map((appointment) => {
      const dateIso = appointmentDateIso(appointment)
      const dateObj = dateIso ? new Date(`${dateIso}T12:00:00-03:00`) : new Date(appointment.scheduled_at)
      const time = appointmentTimeText(appointment)
      const date = dateObj.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'America/Sao_Paulo',
      })
      const status = cleanText(appointment.status).toLowerCase()
      const availability = AVAILABLE_STATUSES.has(status)
        ? 'DISPONIVEL'
        : BUSY_STATUSES.has(status)
          ? 'OCUPADO'
          : `STATUS ${status || 'nao informado'}`
      const price = Number(appointment.price || 0) > 0 ? ` | R$ ${Number(appointment.price).toFixed(2)}` : ''
      return `${date} ${time} - ${appointment.service_type || 'Atendimento'} | ${availability}${price}`
    })

  if (!lines.some((line) => line.includes('DISPONIVEL'))) {
    lines.push('Nao ha horario explicitamente disponivel no contexto. Ofereca consultar outros horarios com a equipe.')
  }

  return lines.join('\n')
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
    `Porte/peso: ${details.size || details.weight_kg || 'Nao informado'}`,
    `Raca: ${details.breed || 'Nao informado'}`,
    `Endereco cadastrado: ${[customer.client.address, customer.client.neighborhood, customer.client.city].filter(Boolean).join(' - ') || 'Nao informado'}`,
    `Nome confirmado: ${nameConfirmed ? 'sim' : 'nao'}`,
  ].join('\n')
}

function buildSystemPrompt({
  storeName,
  storePhone,
  storeAddress,
  storeNeighborhood,
  storeCity,
  deliveryFee,
  customerContext,
  stockContext,
  appointmentsContext,
  examplesContext,
  botPrompt,
}) {
  const customInstructions = String(botPrompt || '').trim()
  const storeLocation = [
    storeAddress,
    storeNeighborhood,
    storeCity,
  ].filter(Boolean).join(' - ') || 'Nao informado'

  return [
    `Voce e o atendente virtual oficial de ${storeName || 'esta loja'}.`,
    'Responda em portugues do Brasil, com tom cordial, claro e objetivo.',
    'Use somente os dados confirmados no contexto operacional abaixo.',
    'Nunca invente preco, estoque, horario, disponibilidade, endereco, politica comercial ou procedimento veterinario.',
    'Se o cliente pedir algo fora do contexto, peca os dados necessarios ou encaminhe para atendimento humano.',
    'Para agendamentos, nao confirme disponibilidade sem haver horario confirmado no contexto de agenda.',
    'Nunca aplique desconto. Se pedirem desconto, responda gentilmente: "Infelizmente nao conseguimos aplicar desconto nesse pedido."',
    'Mantenha respostas curtas e naturais para conversa de WhatsApp.',
    'Seu foco e vender, mas sem pressionar: se o cliente recusar o upsell, continue o pedido normalmente.',
    'Sempre pesquise no contexto do banco abaixo. Se o dado nao estiver no contexto, diga que vai consultar a equipe.',
    'Se o cliente ainda nao tem nome confirmado, peca o nome antes de qualquer triagem ou oferta, inclusive em saudacao simples.',
    '',
    'Fluxo obrigatorio:',
    '1. Saudacao + nome; 2. Intencao; 3. dados minimos do pet; 4. opcoes/horarios reais; 5. valor antes de confirmar; 6. um upsell; 7. resumo parcial; 8. pagamento; 9. troco se dinheiro; 10. entrega/retirada; 11. endereco se entrega; 12. resumo final; 13. confirmar separacao/agendamento; 14. avaliacao 0-10.',
    'Se o dado ja estiver no cadastro/contexto, nao pergunte de novo.',
    'Dados minimos produto: cliente, especie e idade/categoria quando relevante (adulto, filhote, castrado, senior). Se o cliente informar uma raca ou tamanho do dia a dia (ex.: Shih Tzu, Yorkshire, Poodle, Lhasa, Spitz, Bulldog, Golden, Labrador, Pinscher, porte pequeno/medio/grande), trate isso como categoria/porte suficiente e nao peca peso. Pergunte peso apenas para produtos que dependem tecnicamente de faixa de kg, como antipulgas, vermifugo ou medicamento.',
    'Dados minimos banho/tosa: cliente, nome do pet, especie, porte/raca e horario real disponivel.',
    'Dados minimos veterinaria: cliente, nome do pet, especie/tamanho, problema principal e horario real disponivel.',
    'Nunca assuma especie. Se o cliente nao disse cachorro/gato, pergunte. Nao diga "e cachorro, certo?".',
    'Upsell: ofereca 1 item ou servico relacionado; se o cliente recusar, continue o pedido normalmente.',
    'Se produto sem estoque, mostre alternativas similares do contexto. Se horario indisponivel, ofereca os proximos horarios disponiveis do contexto.',
    'Ao vender racao por marca/raca/tamanho, priorize produtos cujo nome contenha a marca, a raca/tamanho e adulto/filhote/castrado informado. So diga que nao tem estoque se nenhum item do contexto operacional corresponder.',
    'Depois do cliente confirmar o resumo final, use a ferramenta create_confirmed_petshop_order antes de responder a avaliacao.',
    'Ao chamar create_confirmed_petshop_order, envie product_id quando houver ID no estoque, nome do item, quantidade, preco unitario, fulfillment_type, pagamento e delivery_address completo quando for entrega.',
    'Trate "sim", "s", "sm", "confirmo", "pode finalizar" e equivalentes como confirmacao final quando o resumo final ja foi exibido.',
    'Depois de responder "Pedido confirmado", se o cliente enviar uma nota de 0 a 10, nao registre pedido de novo; apenas agradeca a avaliacao.',
    'Faca uma pergunta operacional por vez: primeiro pagamento, depois entrega/retirada, depois endereco se for entrega.',
    'Se o cliente responder pagamento e entrega juntos, aceite os dois e siga para endereco.',
    'Entrega: informe explicitamente a taxa configurada antes do resumo final. Some a taxa ao total final. Nunca deixe a taxa de entrega fora do total.',
    'Endereco de entrega minimo: rua/avenida, numero, bairro e ponto de referencia. Se faltar bairro ou referencia, peca o dado faltante antes de confirmar.',
    '',
    'Configuracao customizada deste tenant:',
    customInstructions || 'Nenhuma instrucao customizada cadastrada.',
    '',
    'Contexto operacional do banco de dados:',
    `Loja: ${storeName || 'Nao informado'}`,
    `Telefone da loja: ${storePhone || 'Nao informado'}`,
    `Endereco: ${storeLocation}`,
    `Taxa de entrega: R$ ${Number(deliveryFee ?? DEFAULT_DELIVERY_FEE).toFixed(2)}`,
    '',
    'Cliente atual:',
    customerContext || 'Cliente nao carregado.',
    '',
    'Estoque relevante:',
    stockContext || 'Nenhum produto confirmado para esta busca.',
    '',
    'Agenda dos proximos dias:',
    appointmentsContext || 'Agenda indisponivel no momento.',
    '',
    'Exemplos aprovados de conversa:',
    examplesContext || 'Nenhum exemplo cadastrado para este contexto.',
    'Use os exemplos apenas como modelo de estilo e fluxo. Nunca copie precos, estoque, horarios, nomes ou enderecos dos exemplos.',
    '',
    'Formato do resumo parcial:',
    '**Pedido em andamento:**\n• Cliente: [NOME]\n• Pet: [NOME/ESPECIE/PORTE]\n• [PRODUTO/SERVICO]: [DETALHE]\n• Extra: [UPSELL OU "nao adicionado"]\n• Total parcial: R$ [VALOR]\n• Pagamento: aguardando\n• Entrega/retirada: aguardando',
    '',
    'Pagamento: pergunte exatamente "Qual forma prefere? pix, dinheiro ou cartão?"',
    'Entrega/retirada: pergunte exatamente "Será entrega ou retirada na loja?"',
    'Se for entrega, antes do resumo final diga: "A taxa de entrega é R$ [TAXA]. O total com entrega fica R$ [TOTAL]."',
    'Resumo final de entrega deve mostrar subtotal, taxa de entrega e total final. Termine perguntando "Confirma para separação?" ou, para servico, "Confirma o agendamento?"',
    'Apos confirmar e registrar com a ferramenta, responda: "Pedido confirmado! 🎉\\n\\nDe 0 a 10, como avalia o atendimento?"',
  ].join('\n')
}

async function loadStoreSettings(supabase, moduleId, tenantId) {
  return cachedLoad(storeSettingsCache, scopeCacheKey(moduleId, tenantId), SETTINGS_CACHE_MS, async () => {
    let query = supabase
      .from('settings')
      .select('store_name,store_phone,store_address,store_neighborhood,store_city,bot_prompt,delivery_fee')
      .eq('module_id', moduleId)

    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }

    const { data, error } = await query.maybeSingle()
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
    }
  })
}

async function loadProducts(supabase, moduleId, tenantId, message) {
  const selectColumns = 'id, name, category, description, species_target, image_url, price, stock_quantity, active'
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

async function loadAppointments(supabase, moduleId, tenantId) {
  return cachedLoad(appointmentsCache, scopeCacheKey(moduleId, tenantId), APPOINTMENTS_CACHE_MS, async () => {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    const selectColumns = 'id, service_type, scheduled_at, service_date, start_time, status, price'
    let query = supabase
      .from('appointments')
      .select(selectColumns)
      .eq('module_id', moduleId)
      .gte('scheduled_at', `${today}T00:00:00-03:00`)
      .lte('scheduled_at', `${end}T23:59:59-03:00`)
      .order('scheduled_at')
      .limit(40)

    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }

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
      .limit(40)

    if (tenantId) {
      serviceDateQuery = serviceDateQuery.eq('tenant_id', tenantId)
    }

    const serviceDateResult = await serviceDateQuery
    if (!serviceDateResult.error) {
      byServiceDate = serviceDateResult.data || []
    }

    return normalizeAppointmentRows([...(data || []), ...byServiceDate])
  })
}

function isBotExamplesSchemaError(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('bot_conversation_examples') && (
    message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('relation')
    || message.includes('column')
  )
}

function scoreConversationExample(example, terms, intent) {
  let score = 0
  if (String(example.intent || '').toLowerCase() === String(intent || '').toLowerCase()) score += 12
  if (String(example.intent || '').toLowerCase() === 'geral') score += 3

  const haystack = [
    example.intent,
    example.stage,
    example.user_message,
    example.ideal_reply,
    example.notes,
    ...(Array.isArray(example.tags) ? example.tags : []),
  ].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  for (const term of terms) {
    if (haystack.includes(term)) score += 2
  }

  return score
}

function buildExamplesContext(examples) {
  if (!examples?.length) return ''

  return examples
    .slice(0, 3)
    .map((example, index) => [
      `Exemplo ${index + 1} (${example.intent || 'geral'} / ${example.stage || 'geral'}):`,
      `Cliente: ${cleanText(example.user_message)}`,
      `PetBot: ${cleanText(example.ideal_reply)}`,
      cleanText(example.notes) ? `Notas: ${cleanText(example.notes)}` : null,
    ].filter(Boolean).join('\n'))
    .join('\n---\n')
}

async function loadConversationExamples(supabase, moduleId, tenantId, message, intent) {
  let query = supabase
    .from('bot_conversation_examples')
    .select('intent,stage,user_message,ideal_reply,notes,tags,created_at')
    .eq('module_id', moduleId)
    .eq('active', true)
    .limit(80)

  if (tenantId) {
    query = query.or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
  }

  const { data, error } = await query
  if (error) {
    if (isBotExamplesSchemaError(error)) return ''
    logger.warn('Conversation examples load failed', { tenantId, moduleId, error: error.message })
    return ''
  }

  const terms = buildSearchTerms(message)
  const ranked = (data || [])
    .map((example) => ({
      example,
      score: scoreConversationExample(example, terms, intent),
    }))
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .map((item) => item.example)

  const selected = ranked.length > 0 ? ranked : (data || []).slice(0, 2)
  return buildExamplesContext(selected)
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

async function createConfirmedPetshopOrder(supabase, session, settings, args = {}) {
  const sessionContext = parseJsonObject(session.context)
  if (sessionContext.last_sale_id) {
    return {
      sale_id: sessionContext.last_sale_id,
      order_id: sessionContext.last_order_id || null,
      appointment_id: sessionContext.last_appointment_id || null,
      total: Number(sessionContext.last_total || 0),
      duplicated: true,
    }
  }

  const customer = await ensureCustomerProfile(supabase, session, args)
  const items = Array.isArray(args.items) ? args.items : []
  if (!items.length) throw new Error('Pedido sem itens para registrar.')

  if (!['pix', 'dinheiro', 'cartao'].includes(args.payment_method)) {
    throw new Error('Forma de pagamento ausente ou invalida.')
  }

  const productIds = [...new Set(items.map((item) => cleanText(item.product_id)).filter(Boolean))]
  let productMap = new Map()
  if (productIds.length > 0) {
    const { data: productRows, error: productError } = await supabase
      .from('products')
      .select('id,name,price,stock_quantity,active')
      .eq('tenant_id', session.tenant_id)
      .eq('module_id', session.module_id)
      .in('id', productIds)

    if (productError) throw new Error(`Falha ao validar estoque: ${productError.message}`)
    productMap = new Map((productRows || []).map((product) => [String(product.id), product]))
  }

  if (args.order_type === 'produto' && productIds.length !== items.length) {
    throw new Error('Produto sem ID do estoque nao pode ser registrado.')
  }

  const normalizedItems = items.map((item) => {
    const productId = cleanText(item.product_id)
    const quantity = Math.max(1, Number(item.quantity || 1))
    if (!productId) {
      if (args.order_type === 'produto') throw new Error('Produto sem ID do estoque nao pode ser registrado.')
      return {
        product_id: null,
        name: cleanText(item.name) || cleanText(args.service_type) || 'Servico',
        quantity,
        unit_price: Number(item.unit_price || 0),
        upsell: Boolean(item.upsell),
      }
    }

    const product = productMap.get(productId)
    if (!product || product.active === false) throw new Error(`Produto indisponivel no estoque: ${cleanText(item.name) || productId}`)
    if (Number(product.stock_quantity || 0) < quantity) throw new Error(`Estoque insuficiente para ${product.name}.`)

    return {
      product_id: productId,
      name: cleanText(product.name) || cleanText(item.name),
      quantity,
      unit_price: Number(product.price || 0),
      upsell: Boolean(item.upsell),
    }
  })

  if (args.order_type === 'produto') {
    if (!['entrega', 'retirada'].includes(args.fulfillment_type)) {
      throw new Error('Entrega ou retirada precisa estar definida antes de registrar.')
    }
    if (args.fulfillment_type === 'entrega') {
      const deliveryAddress = cleanText(args.delivery_address)
      const deliveryNeighborhood = cleanText(args.delivery_neighborhood)
      const deliveryReference = cleanText(args.delivery_reference)
      if (!deliveryAddress || !/\d/.test(deliveryAddress) || !deliveryNeighborhood || !deliveryReference) {
        throw new Error('Endereco de entrega incompleto.')
      }
    }
  }

  let validatedAppointment = null
  if (args.order_type !== 'produto') {
    const appointmentId = cleanText(args.appointment_id)
    const scheduledAt = cleanText(args.scheduled_at)
    if (!appointmentId && !scheduledAt) throw new Error('Horario real da agenda ausente.')

    let appointmentQuery = supabase
      .from('appointments')
      .select('id,service_type,scheduled_at,service_date,start_time,status,price')
      .eq('tenant_id', session.tenant_id)
      .eq('module_id', session.module_id)

    appointmentQuery = appointmentId ? appointmentQuery.eq('id', appointmentId) : appointmentQuery.eq('scheduled_at', scheduledAt)

    const { data, error } = await appointmentQuery.limit(1).maybeSingle()
    if (error) throw new Error(`Falha ao validar agenda: ${error.message}`)
    if (!data) throw new Error('Horario nao encontrado na agenda.')

    const status = cleanText(data.status).toLowerCase()
    if (!AVAILABLE_STATUSES.has(status)) throw new Error('Horario nao esta mais disponivel.')

    validatedAppointment = data
    args.scheduled_at = normalizeAppointmentRows([data])[0]?.scheduled_at || data.scheduled_at
    args.service_type = cleanText(data.service_type) || cleanText(args.service_type) || args.order_type
    normalizedItems[0].unit_price = Number(data.price || normalizedItems[0].unit_price || 0)
    normalizedItems[0].name = cleanText(data.service_type) || normalizedItems[0].name
  }

  const subtotal = normalizedItems.reduce((sum, item) => sum + Number(item.quantity || 1) * Number(item.unit_price || 0), 0)
  const deliveryFee = args.fulfillment_type === 'entrega' ? Number(settings.deliveryFee ?? DEFAULT_DELIVERY_FEE) : 0
  const total = subtotal + deliveryFee
  const orderType = args.order_type === 'produto' ? 'entrega' : 'servico'
  const fulfillmentType = args.order_type === 'produto'
    ? (args.fulfillment_type === 'retirada' ? 'balcao' : 'entrega')
    : 'servico'
  const inferredAddress = args.fulfillment_type === 'entrega'
    ? await inferDeliveryAddressFromMessages(supabase, session.id)
    : ''
  const deliveryAddress = cleanText(args.delivery_address) || inferredAddress || customer.client.address || null
  const deliveryNeighborhood = cleanText(args.delivery_neighborhood) || customer.client.neighborhood || null
  const deliveryCity = cleanText(args.delivery_city) || customer.client.city || null
  const deliveryLine = [deliveryAddress, deliveryNeighborhood, deliveryCity].filter(Boolean).join(' - ')
  const resolvedItems = await resolveOrderItems(supabase, session, normalizedItems)
  const itemSummary = resolvedItems
    .map((item) => `${Number(item.quantity || 1)}x ${item.display_name} - R$ ${Number(item.subtotal || 0).toFixed(2)}`)
    .join('; ')

  const notes = [
    `Origem: PetBot WhatsApp`,
    `Sessao: ${session.id}`,
    itemSummary ? `Itens: ${itemSummary}` : null,
    deliveryLine ? `Endereco: ${deliveryLine}` : null,
    cleanText(args.notes),
    args.fulfillment_type === 'retirada' ? 'Retirada na loja' : null,
    args.fulfillment_type === 'entrega' ? `Taxa de entrega: R$ ${deliveryFee.toFixed(2)}` : null,
    cleanText(args.delivery_reference) ? `Referencia: ${cleanText(args.delivery_reference)}` : null,
    Number(args.change_for || 0) > 0 ? `Troco para R$ ${Number(args.change_for).toFixed(2)}` : null,
  ].filter(Boolean).join(' | ')

  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .insert({
      tenant_id: session.tenant_id,
      module_id: session.module_id,
      client_id: customer.client.id,
      customer_name: cleanText(args.customer_name) || customer.client.name,
      customer_phone: customer.phone,
      payment_method: args.payment_method || null,
      subtotal,
      discount: 0,
      total_price: total,
      status: 'concluido',
      source: 'whatsapp',
      fulfillment_type: fulfillmentType,
      notes,
    })
    .select('id,total_price')
    .single()

  if (saleError) throw new Error(`Falha ao registrar venda: ${saleError.message}`)

  const saleItems = resolvedItems.map(({ display_name, ...item }) => ({
    ...item,
    sale_id: sale.id,
  }))

  const { error: itemsError } = await supabase.from('sale_items').insert(saleItems)
  if (itemsError) throw new Error(`Falha ao registrar itens: ${itemsError.message}`)

  for (const item of saleItems) {
    if (!item.product_id) continue
    const { data: product } = await supabase
      .from('products')
      .select('stock_quantity')
      .eq('id', item.product_id)
      .maybeSingle()
    if (!product) continue
    const nextStock = Math.max(0, Number(product.stock_quantity || 0) - Number(item.quantity || 0))
    await supabase.from('products').update({ stock_quantity: nextStock }).eq('id', item.product_id)
  }

  let appointment = null
  if (args.order_type !== 'produto' && validatedAppointment) {
    const payload = {
      tenant_id: session.tenant_id,
      module_id: session.module_id,
      client_id: customer.client.id,
      pet_id: customer.client.id,
      service_type: cleanText(args.service_type) || args.order_type,
      scheduled_at: cleanText(args.scheduled_at),
      duration_min: 60,
      price: total,
      status: 'agendado',
      source: 'whatsapp',
      customer_name: cleanText(args.customer_name) || customer.client.name,
      customer_phone: customer.phone,
      description: notes,
      notes,
    }

    const { data, error } = await supabase
      .from('appointments')
      .update(payload)
      .eq('id', validatedAppointment.id)
      .select('id,scheduled_at')
      .single()
    if (error) throw new Error(`Falha ao registrar agendamento: ${error.message}`)
    appointment = data
  }

  const orderPayload = {
    tenant_id: session.tenant_id,
    module_id: session.module_id,
    sale_id: sale.id,
    client_id: customer.client.id,
    session_id: session.id,
    source: 'whatsapp',
    order_type: orderType,
    status: orderType === 'servico' ? 'agendado' : 'separacao',
    scheduled_for: appointment?.scheduled_at || null,
    delivery_address: args.fulfillment_type === 'entrega' ? deliveryAddress : null,
    delivery_neighborhood: args.fulfillment_type === 'entrega' ? deliveryNeighborhood : null,
    delivery_city: args.fulfillment_type === 'entrega' ? deliveryCity : null,
    contact_phone: customer.phone,
    notes,
  }

  let { data: order, error: orderError } = await supabase
    .from('service_delivery_orders')
    .update(orderPayload)
    .eq('sale_id', sale.id)
    .select('id')
    .maybeSingle()

  if (!order && !orderError) {
    const insertedOrder = await supabase
      .from('service_delivery_orders')
      .insert(orderPayload)
      .select('id')
      .single()
    order = insertedOrder.data
    orderError = insertedOrder.error
  }

  if (orderError && String(orderError.message || '').includes('duplicate')) {
    const updatedOrder = await supabase
      .from('service_delivery_orders')
      .update({
        status: orderPayload.status,
        scheduled_for: orderPayload.scheduled_for,
        delivery_address: orderPayload.delivery_address,
        delivery_neighborhood: orderPayload.delivery_neighborhood,
        delivery_city: orderPayload.delivery_city,
        contact_phone: orderPayload.contact_phone,
        notes: orderPayload.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('sale_id', sale.id)
      .select('id')
      .maybeSingle()
    order = updatedOrder.data
    orderError = updatedOrder.error
  }

  if (orderError) {
    throw new Error(`Falha ao registrar ordem operacional: ${orderError.message}`)
  }

  await supabase
    .from('chat_sessions')
    .update({
      intent: 'pedido_confirmado',
      context: {
        ...(session.context || {}),
        last_sale_id: sale.id,
        last_order_id: order?.id || null,
        last_appointment_id: appointment?.id || null,
        last_total: total,
      },
      last_message_at: new Date().toISOString(),
    })
    .eq('id', session.id)

  return {
    sale_id: sale.id,
    order_id: order?.id || null,
    appointment_id: appointment?.id || null,
    total,
  }
}

function buildPetbotOrderTransactionPayload(session, customer, settings, args = {}) {
  return {
    session_id: session.id,
    tenant_id: session.tenant_id,
    module_id: session.module_id,
    client_id: customer.client?.id || null,
    customer_name: cleanText(args.customer_name) || cleanText(customer.client?.name) || session.customer_name || 'Cliente',
    customer_phone: customer.phone || session.customer_phone || null,
    order_type: cleanText(args.order_type) || 'produto',
    payment_method: cleanText(args.payment_method),
    fulfillment_type: cleanText(args.fulfillment_type),
    delivery_address: cleanText(args.delivery_address),
    delivery_neighborhood: cleanText(args.delivery_neighborhood),
    delivery_city: cleanText(args.delivery_city),
    delivery_reference: cleanText(args.delivery_reference),
    delivery_fee: Number(settings.deliveryFee ?? DEFAULT_DELIVERY_FEE),
    expected_total: Number(args.total || 0),
    appointment_id: cleanText(args.appointment_id),
    scheduled_at: cleanText(args.scheduled_at),
    service_type: cleanText(args.service_type),
    change_for: Number(args.change_for || 0),
    notes: cleanText(args.notes),
    items: Array.isArray(args.items) ? args.items : [],
  }
}

async function createConfirmedPetshopOrderViaRpc(supabase, session, settings, args = {}) {
  const sessionContext = parseJsonObject(session.context)
  if (sessionContext.last_sale_id) {
    return {
      sale_id: sessionContext.last_sale_id,
      order_id: sessionContext.last_order_id || null,
      appointment_id: sessionContext.last_appointment_id || null,
      total: Number(sessionContext.last_total || 0),
      duplicated: true,
    }
  }

  const customer = await ensureCustomerProfile(supabase, session, args)
  const payload = buildPetbotOrderTransactionPayload(session, customer, settings, args)
  if (!payload.items.length) throw new Error('Pedido sem itens para registrar.')
  if (!['pix', 'dinheiro', 'cartao'].includes(payload.payment_method)) {
    throw new Error('Forma de pagamento ausente ou invalida.')
  }

  const { data, error } = await supabase.rpc('create_petbot_order_transaction', {
    p_payload: payload,
  })

  if (error) throw new Error(`Falha ao registrar pedido transacional: ${error.message}`)

  return {
    sale_id: cleanText(data?.sale_id),
    order_id: cleanText(data?.order_id) || null,
    appointment_id: cleanText(data?.appointment_id) || null,
    total: Number(data?.total || payload.expected_total || 0),
    duplicated: Boolean(data?.duplicated),
  }
}

async function executePetbotTool(supabase, session, settings, toolCall) {
  const name = toolCall?.function?.name
  let args = {}
  try {
    args = JSON.parse(toolCall?.function?.arguments || '{}')
  } catch {
    args = {}
  }

  if (name === 'update_customer_profile') {
    const customer = await ensureCustomerProfile(supabase, session, args)
    return {
      ok: true,
      action: name,
      client_id: customer.client.id,
      name_confirmed: customer.isKnown,
    }
  }

  if (name === 'create_confirmed_petshop_order') {
    const result = await createConfirmedPetshopOrderViaRpc(supabase, session, settings, args)
    return {
      ok: true,
      action: name,
      ...result,
    }
  }

  return { ok: false, error: `Ferramenta desconhecida: ${name}` }
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

async function resolveOrderItems(supabase, session, items) {
  const rows = []

  for (const item of items) {
    let productId = isUuid(item.product_id) ? cleanText(item.product_id) : null
    let productName = cleanText(item.name)

    if (!productId && productName) {
      const { data: product } = await supabase
        .from('products')
        .select('id,name')
        .eq('module_id', session.module_id)
        .eq('tenant_id', session.tenant_id)
        .ilike('name', productName)
        .limit(1)
        .maybeSingle()

      if (product?.id) {
        productId = product.id
        productName ||= product.name
      }
    }

    const quantity = Number(item.quantity || 1)
    const unitPrice = Number(item.unit_price || 0)
    rows.push({
      tenant_id: session.tenant_id,
      sale_id: null,
      product_id: productId,
      quantity,
      unit_price: unitPrice,
      subtotal: quantity * unitPrice,
      upsell: Boolean(item.upsell),
      display_name: productName || 'Produto nao identificado',
    })
  }

  return rows
}

async function inferDeliveryAddressFromMessages(supabase, sessionId) {
  const { data } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('sent_at', { ascending: false })
    .limit(20)

  const candidates = (data || [])
    .filter((message) => message.role === 'user')
    .map((message) => cleanText(message.content))
    .filter((text) => {
      const normalized = normalizeSearchText(text)
      return text.length >= 10
        && /\d/.test(text)
        && /\b(rua|r\.|avenida|av\.|travessa|alameda|rodovia|estrada|bairro|ap|apto|apartamento|casa|numero|nº|n )\b/.test(normalized)
    })

  return candidates[0] || ''
}

async function loadBotRuntimeConfig(supabase, tenantId, moduleId) {
  try {
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id, model_name, temperature')
      .eq('module_id', moduleId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (companyErr || !company) return { modelName: DEFAULT_BOT_MODEL, temperature: DEFAULT_BOT_TEMPERATURE }

    return {
      modelName: company.model_name || DEFAULT_BOT_MODEL,
      temperature: Number(company.temperature ?? DEFAULT_BOT_TEMPERATURE),
    }
  } catch (err) {
    logger.warn('Bot runtime config load failed', { tenantId, moduleId, error: err.message })
    return { modelName: DEFAULT_BOT_MODEL, temperature: DEFAULT_BOT_TEMPERATURE }
  }
}

async function callOpenAIWithTimeout(params, timeoutMs) {
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
    if (!response.ok) {
      const detail = payload?.error?.message || `HTTP ${response.status}`
      throw new HttpError(502, `OpenAI request failed: ${detail}`)
    }

    return payload
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new HttpError(504, 'AI response timed out. Please try again.')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
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
    .select('id, module_id, tenant_id, customer_phone, customer_name, status, client_id, context, csat_score')
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
    await insertUserMessages(supabase, sessionId, normalizeDashboardUserMessages(trimmedMessage, options))
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
  const sessionForGuard = { ...session, context: recoveredContext }
  const [storeSettings, runtimeConfig, customer] = await Promise.all([
    loadStoreSettings(supabase, moduleId, session.tenant_id),
    loadBotRuntimeConfig(supabase, session.tenant_id, moduleId),
    ensureCustomerProfile(supabase, sessionForGuard),
  ])
  const llmInterpretation = await interpretPetbotMessageWithLlm({
    apiKey: serverEnv.openAiApiKey,
    model: runtimeConfig.modelName,
    temperature: runtimeConfig.temperature,
    timeoutMs: serverEnv.openAiTimeoutMs,
    message: trimmedMessage,
    history,
    state: recoveredContext,
    customerContext: buildCustomerContext(customer),
  })
  const catalogSearchText = buildPetbotSearchText(
    buildInterpretedPetbotSearchText(buildCatalogSearchText(history, trimmedMessage), llmInterpretation),
    recoveredContext,
  )
  const [products, appointments] = await Promise.all([
    loadProducts(supabase, moduleId, session.tenant_id, catalogSearchText),
    loadAppointments(supabase, moduleId, session.tenant_id),
  ])

  const userMessages = normalizeDashboardUserMessages(trimmedMessage, options)
  await insertUserMessages(supabase, sessionId, userMessages)

  let guard = runPetbotGuard({
    message: trimmedMessage,
    session: sessionForGuard,
    customer,
    products,
    appointments,
    settings: storeSettings,
    interpretation: llmInterpretation,
  })
  let reply = guard.reply?.trim()
  let state = guard.state
  let orderResult = null
  let redraftResult = null
  const mediaMessages = Array.isArray(guard.mediaMessages) ? guard.mediaMessages : []
  const primaryImage = mediaMessages.find((item) => item?.type === 'image' && item.imageUrl)

  if (guard.shouldSaveOrder) {
    try {
      orderResult = await createConfirmedPetshopOrderViaRpc(supabase, sessionForGuard, storeSettings, guard.orderArgs)
      state = markPetbotOrderSaved(state, orderResult)
      reply = 'Pedido confirmado! 🎉\n\nDe 0 a 10, como avalia o atendimento?'
    } catch (error) {
      state = markPetbotOrderError(state, error)
      reply = 'Parece que houve um problema ao registrar o pedido. Vou chamar a equipe para resolver isso antes de finalizar.'
      logger.warn('PetBot guarded order save failed', {
        sessionId,
        moduleId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (guard.guardDirective?.allowLlmRedraft) {
    redraftResult = await redraftPetbotReplyWithLlm({
      apiKey: serverEnv.openAiApiKey,
      model: runtimeConfig.modelName,
      temperature: runtimeConfig.temperature,
      timeoutMs: serverEnv.openAiTimeoutMs,
      message: trimmedMessage,
      history,
      directive: guard.guardDirective,
      fallbackReply: reply,
    })
    if (redraftResult?.reply) reply = redraftResult.reply
  }

  if (!reply) {
    throw new HttpError(502, 'The PetBot response came back empty.')
  }

  const botSentAt = new Date().toISOString()
  const nextContext = mergePetbotContext({
    ...(sessionForGuard.context || {}),
    ...(orderResult ? {
      last_sale_id: orderResult.sale_id,
      last_order_id: orderResult.order_id || null,
      last_appointment_id: orderResult.appointment_id || null,
    } : {}),
  }, state)

  const sessionPatch = {
    intent: guard.intent || intent,
    context: nextContext,
    ...(state?.customerName ? { customer_name: state.customerName } : {}),
    ...(guard.shouldSaveRating ? { csat_score: guard.rating, status: 'closed', closed_at: botSentAt } : {}),
    ...(guard.needsHuman ? { status: 'human' } : {}),
    last_message_at: botSentAt,
  }

  const { data: updatedSession, error: sessionUpdateError } = await supabase
    .from('chat_sessions')
    .update(sessionPatch)
    .eq('id', sessionId)
    .select('id, context')
    .maybeSingle()

  if (sessionUpdateError) {
    logger.error('Unable to persist PetBot session state', {
      sessionId,
      moduleId,
      code: sessionUpdateError.code,
      message: sessionUpdateError.message,
    })
    throw new HttpError(500, `Unable to update chat session: ${sessionUpdateError.message}`)
  }

  if (!updatedSession || !hasPetbotState(updatedSession.context)) {
    logger.error('PetBot session update did not persist context.petbot', {
      sessionId,
      moduleId,
      hasUpdatedSession: Boolean(updatedSession),
    })
    throw new HttpError(500, 'Unable to persist PetBot session state.')
  }

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
        petbot_state: snapshotPetbotState(state),
        petbot_guard: {
          version: state?.version || 1,
          intent: guard.intent,
          action: guard.action,
          blocked_reasons: state?.blockedReasons || [],
          needs_human: Boolean(guard.needsHuman),
          allow_llm_redraft: Boolean(guard.guardDirective?.allowLlmRedraft),
          llm_interpretation: llmInterpretation,
          llm_redraft_used: Boolean(redraftResult?.used),
          llm_redraft_validation: redraftResult?.validation || null,
          order_saved: Boolean(orderResult),
        },
      },
      tokens_used: 0,
      sent_at: botSentAt,
    })
    .select('id, role, content, metadata, tokens_used, sent_at')
    .single()

  if (replyInsertError) {
    throw new HttpError(500, 'Unable to save assistant response.')
  }

  const { data: finalSession, error: finalSessionError } = await supabase
    .from('chat_sessions')
    .update({
      context: nextContext,
      last_message_at: botSentAt,
    })
    .eq('id', sessionId)
    .select('id, context')
    .maybeSingle()

  if (finalSessionError || !finalSession || !hasPetbotState(finalSession.context)) {
    logger.error('PetBot final session state did not persist after assistant message', {
      sessionId,
      moduleId,
      code: finalSessionError?.code,
      message: finalSessionError?.message,
      hasFinalSession: Boolean(finalSession),
    })
    throw new HttpError(500, 'Unable to persist PetBot session state after assistant response.')
  }

  logger.info('Chat response generated', {
    sessionId,
    moduleId,
    intent: guard.intent || intent,
    tokens: 0,
    guarded: true,
    engine: 'petbot_guard_v1',
  })

  return {
    reply,
    savedMessage: savedReply,
  }
}
