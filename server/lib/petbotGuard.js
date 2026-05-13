const DEFAULT_DELIVERY_FEE = 10

const PETBOT_VERSION = 1

const DOG_BREEDS = new Map([
  ['shih tzu', { breed: 'Shih Tzu', size: 'pequeno' }],
  ['shihtzu', { breed: 'Shih Tzu', size: 'pequeno' }],
  ['shitzu', { breed: 'Shih Tzu', size: 'pequeno' }],
  ['yorkshire', { breed: 'Yorkshire', size: 'pequeno' }],
  ['pinscher', { breed: 'Pinscher', size: 'pequeno' }],
  ['poodle', { breed: 'Poodle', size: 'pequeno' }],
  ['lhasa', { breed: 'Lhasa Apso', size: 'pequeno' }],
  ['maltês', { breed: 'Maltês', size: 'pequeno' }],
  ['maltes', { breed: 'Maltês', size: 'pequeno' }],
  ['spitz', { breed: 'Spitz', size: 'pequeno' }],
  ['pug', { breed: 'Pug', size: 'pequeno' }],
  ['bulldog frances', { breed: 'Bulldog Francês', size: 'pequeno' }],
  ['golden', { breed: 'Golden Retriever', size: 'grande' }],
  ['labrador', { breed: 'Labrador', size: 'grande' }],
  ['rottweiler', { breed: 'Rottweiler', size: 'grande' }],
  ['pastor alemão', { breed: 'Pastor Alemão', size: 'grande' }],
  ['pastor alemao', { breed: 'Pastor Alemão', size: 'grande' }],
  ['pitbull', { breed: 'Pitbull', size: 'grande' }],
  ['border collie', { breed: 'Border Collie', size: 'medio' }],
  ['beagle', { breed: 'Beagle', size: 'medio' }],
  ['cocker', { breed: 'Cocker', size: 'medio' }],
])

const PRODUCT_HINTS = [
  'racao',
  'ração',
  'petisco',
  'bifinho',
  'sache',
  'sachê',
  'areia',
  'antipulga',
  'shampoo',
  'brinquedo',
  'coleira',
  'guia',
  'tapete',
  'comprar',
  'produto',
  'whiskas',
  'premier',
  'royal',
  'golden',
  'pedigree',
  'special dog',
  'formula natural',
]

const SERVICE_HINTS = ['banho', 'tosa', 'higienica', 'higiênica', 'agendar', 'agenda']
const VET_HINTS = ['vet', 'veterinario', 'veterinária', 'veterinaria', 'consulta', 'vacina']
const URGENCY_HINTS = ['vomit', 'sangr', 'veneno', 'intoxic', 'convuls', 'falta de ar', 'apatico', 'apático', 'nao come', 'não come']
const DISCOUNT_HINTS = ['desconto', 'abaixa', 'barato', 'mais em conta', 'melhor preco', 'melhor preço']

function clean(value = '') {
  return String(value ?? '').trim()
}

function stripAccents(value = '') {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function norm(value = '') {
  return stripAccents(value).toLowerCase()
}

function money(value = 0) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`
}

function hasAny(text, terms) {
  const lower = norm(text)
  return terms.some((term) => lower.includes(norm(term)))
}

function isKnownName(name = '') {
  const value = norm(name)
  return Boolean(value) && !['cliente', 'cliente teste', 'cliente whatsapp', 'whatsapp', 'sem nome'].includes(value) && !/^cliente[-\s]?\d+/.test(value)
}

function availableProducts(products = []) {
  return (products || []).filter((product) => product?.active !== false && Number(product?.stock_quantity || 0) > 0)
}

function availableAppointments(appointments = []) {
  const freeStatuses = new Set(['available', 'livre', 'disponivel', 'aberto', 'open'])
  return (appointments || [])
    .filter((appointment) => freeStatuses.has(norm(appointment?.status)))
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
}

function defaultState() {
  return {
    version: PETBOT_VERSION,
    status: 'triagem',
    intent: '',
    customerName: '',
    nameConfirmed: false,
    petName: '',
    species: '',
    size: '',
    breed: '',
    ageCategory: '',
    symptom: '',
    brand: '',
    selectedProduct: null,
    productOptions: [],
    selectedSlot: null,
    slotOptions: [],
    serviceType: '',
    upsell: {
      offered: false,
      resolved: false,
      accepted: false,
      declined: false,
      item: null,
    },
    payment: {
      method: '',
      changeFor: null,
      changeAsked: false,
    },
    fulfillment: {
      type: '',
      address: '',
      neighborhood: '',
      city: '',
      reference: '',
    },
    totals: {
      subtotal: 0,
      deliveryFee: 0,
      total: 0,
    },
    partialSummaryShown: false,
    finalSummaryShown: false,
    saved: false,
    awaiting: '',
    blockedReasons: [],
    lastQuestion: '',
    confirmationKey: '',
    lastSaleId: '',
    lastOrderId: '',
    lastAppointmentId: '',
  }
}

export function getPetbotState(context = {}) {
  const incoming = context?.petbot && typeof context.petbot === 'object' ? context.petbot : {}
  const base = defaultState()
  return {
    ...base,
    ...incoming,
    upsell: { ...base.upsell, ...(incoming.upsell || {}) },
    payment: { ...base.payment, ...(incoming.payment || {}) },
    fulfillment: { ...base.fulfillment, ...(incoming.fulfillment || {}) },
    totals: { ...base.totals, ...(incoming.totals || {}) },
    blockedReasons: Array.isArray(incoming.blockedReasons) ? incoming.blockedReasons : [],
    productOptions: Array.isArray(incoming.productOptions) ? incoming.productOptions : [],
    slotOptions: Array.isArray(incoming.slotOptions) ? incoming.slotOptions : [],
  }
}

export function mergePetbotContext(context = {}, state) {
  return {
    ...(context || {}),
    petbot: {
      ...state,
      version: PETBOT_VERSION,
      updatedAt: new Date().toISOString(),
    },
  }
}

export function buildPetbotSearchText(message = '', context = {}) {
  const state = getPetbotState(context)
  return [
    message,
    state.intent,
    state.species,
    state.size,
    state.breed,
    state.ageCategory,
    state.brand,
    state.selectedProduct?.name,
    ...(state.productOptions || []).slice(0, 3).map((item) => item.name),
  ].filter(Boolean).join(' ')
}

function hydrateFromCustomer(state, session = {}, customer = {}) {
  const client = customer?.client || {}
  const details = client.details || {}
  const name = clean(customer?.isKnown ? client.name : '') || clean(session.customer_name)
  if (!state.customerName && isKnownName(name)) {
    state.customerName = name
    state.nameConfirmed = true
  }
  if (!state.petName && clean(details.pet_name)) state.petName = clean(details.pet_name)
  if (!state.species && clean(details.species)) state.species = normalizeSpecies(details.species)
  if (!state.size && clean(details.size || details.weight_kg)) state.size = clean(details.size || details.weight_kg)
  if (!state.breed && clean(details.breed)) {
    state.breed = clean(details.breed)
    const breedInfo = inferBreedAndSize(details.breed)
    if (!state.size && breedInfo.size) state.size = breedInfo.size
  }
  if (!state.fulfillment.address && clean(client.address)) state.fulfillment.address = clean(client.address)
  if (!state.fulfillment.neighborhood && clean(client.neighborhood)) state.fulfillment.neighborhood = clean(client.neighborhood)
  if (!state.fulfillment.city && clean(client.city)) state.fulfillment.city = clean(client.city)
  return state
}

function normalizeSpecies(value = '') {
  const lower = norm(value)
  if (lower.includes('cach') || lower.includes('cao') || lower.includes('dog')) return 'dog'
  if (lower.includes('gat') || lower.includes('cat') || lower.includes('felin')) return 'cat'
  return clean(value)
}

function inferSpecies(message = '') {
  const lower = norm(message)
  if (lower.includes('cach') || lower.includes('cao') || lower.includes('cadela')) return 'dog'
  if (lower.includes('gat') || lower.includes('felin')) return 'cat'
  if (inferBreedAndSize(message).breed) return 'dog'
  return ''
}

function inferBreedAndSize(message = '') {
  const lower = norm(message)
  for (const [key, info] of DOG_BREEDS.entries()) {
    if (lower.includes(norm(key))) return info
  }
  return { breed: '', size: '' }
}

function inferSize(message = '') {
  const lower = norm(message)
  if (/(pequen|mini|porte p|5 ?kg|6 ?kg|7 ?kg|8 ?kg|9 ?kg)/.test(lower)) return 'pequeno'
  if (/(medio|médio|porte m|10 ?kg|12 ?kg|15 ?kg|18 ?kg)/.test(lower)) return 'medio'
  if (/(grande|porte g|20 ?kg|25 ?kg|30 ?kg|40 ?kg)/.test(lower)) return 'grande'
  return inferBreedAndSize(message).size || ''
}

function inferAge(message = '') {
  const lower = norm(message)
  if (lower.includes('filhote')) return 'filhote'
  if (lower.includes('castrad')) return 'castrado'
  if (lower.includes('senior') || lower.includes('idos')) return 'senior'
  if (lower.includes('adult')) return 'adulto'
  return ''
}

function inferBrand(message = '') {
  const lower = norm(message)
  const brands = ['premier', 'royal canin', 'royal', 'golden', 'pedigree', 'whiskas', 'special dog', 'formula natural', 'gran plus', 'quatree']
  return brands.find((brand) => lower.includes(norm(brand))) || ''
}

function detectIntent(message = '', currentIntent = '') {
  const hasProductCore = hasAny(message, ['racao', 'ração', 'petisco', 'sache', 'sachê', 'areia', 'antipulga', 'shampoo', 'comprar', 'produto', 'estoque'])
  const hasProduct = hasAny(message, PRODUCT_HINTS)
  const hasService = hasAny(message, SERVICE_HINTS)
  const hasVet = hasAny(message, VET_HINTS) || hasAny(message, URGENCY_HINTS)
  if ((currentIntent === 'banho_tosa' || currentIntent === 'veterinaria') && !hasProductCore && !hasService && !hasVet) {
    return currentIntent
  }
  if ((hasProduct && (hasService || hasVet))) return 'multi'
  if (hasVet) return 'veterinaria'
  if (hasService) return 'banho_tosa'
  if (hasProduct) return 'produto'
  return currentIntent || ''
}

function isAffirmative(message = '') {
  return /^(s|sim|sm|ok|okay|pode|confirmo|confirma|fechado|fecha|isso|isso mesmo|perfeito|quero|vou querer|pode ser)\b/i.test(clean(message))
}

function isNegative(message = '') {
  return /^(n|nao|não|negativo|sem|dispenso|não quero|nao quero)\b/i.test(clean(message))
}

function detectPayment(message = '') {
  const lower = norm(message)
  if (lower.includes('pix')) return 'pix'
  if (lower.includes('dinheiro')) return 'dinheiro'
  if (lower.includes('cartao') || lower.includes('cartão') || lower.includes('credito') || lower.includes('debito')) return 'cartao'
  return ''
}

function detectFulfillment(message = '') {
  const lower = norm(message)
  if (lower.includes('entrega') || lower.includes('entregar') || lower.includes('delivery')) return 'entrega'
  if (lower.includes('retirada') || lower.includes('retirar') || lower.includes('buscar') || lower.includes('loja')) return 'retirada'
  return ''
}

function extractCustomerName(message = '', state) {
  const text = clean(message)
  if (!text) return ''
  const lower = norm(text)
  if (state.awaiting === 'customer_name') {
    const first = text.split(/[,.]/)[0].replace(/^(meu nome e|meu nome é|sou|eu sou|aqui e|aqui é)\s+/i, '').trim()
    if (isPlausibleName(first)) return titleName(first)
  }
  const explicit = text.match(/(?:meu nome e|meu nome é|sou|eu sou|aqui e|aqui é)\s+([A-Za-zÀ-ÿ'\s]{2,40})/i)
  if (explicit && isPlausibleName(explicit[1])) return titleName(explicit[1])
  if (text.includes(',') && !lower.startsWith('oi,')) {
    const first = text.split(',')[0].trim()
    if (isPlausibleName(first)) return titleName(first)
  }
  if (!detectIntent(text) && isPlausibleName(text) && text.split(/\s+/).length <= 3) return titleName(text)
  return ''
}

function isPlausibleName(value = '') {
  const text = clean(value)
  if (text.length < 2 || text.length > 40) return false
  if (/\d/.test(text)) return false
  const lower = norm(text)
  if (['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'quero racao', 'quero ração'].includes(lower)) return false
  if (hasAny(lower, [...PRODUCT_HINTS, ...SERVICE_HINTS, ...VET_HINTS])) return false
  return true
}

function titleName(value = '') {
  return clean(value)
    .split(/\s+/)
    .map((part) => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part)
    .join(' ')
}

function extractPetName(message = '', state) {
  const text = clean(message)
  if (!text) return ''
  const explicit = text.match(/(?:pet chama|nome dele e|nome dele é|nome dela e|nome dela é|chama)\s+([A-Za-zÀ-ÿ'\s]{2,30})/i)
  if (explicit) return titleName(explicit[1].split(/[,.]/)[0])
  if (state.awaiting === 'pet_name' || state.awaiting === 'pet_details' || state.awaiting === 'service_pet_details') {
    const first = text.split(/[,.]/)[0].trim()
    if (isPlausibleName(first)) return titleName(first)
  }
  return ''
}

function extractSymptom(message = '') {
  const lower = norm(message)
  if (hasAny(lower, URGENCY_HINTS) || /coce|manc|diarre|espirr|tosse|dor|ferid|passando mal|nao esta comendo|não está comendo/.test(lower)) {
    return clean(message).slice(0, 120)
  }
  return ''
}

function parseChangeFor(message = '') {
  const lower = norm(message)
  if (lower.includes('sem troco') || lower.includes('nao precisa') || lower.includes('não precisa')) return 0
  const match = clean(message).match(/(?:para|pra)?\s*r?\$?\s*(\d+(?:[,.]\d{1,2})?)/i)
  return match ? Number(match[1].replace(',', '.')) : null
}

function updateAddressFromMessage(state, message = '') {
  const text = clean(message)
  const lower = norm(text)
  if (!text) return

  const looksLikeStreet = /(rua|avenida|av\.|av |alameda|travessa|praça|praca|rodovia|estrada)/i.test(text)
  if (looksLikeStreet || (state.awaiting === 'delivery_address' && !state.fulfillment.address)) {
    state.fulfillment.address = text
  }

  const bairroMatch = text.match(/bairro\s+([^,.-]+)/i)
  if (bairroMatch) state.fulfillment.neighborhood = clean(bairroMatch[1])
  if (!state.fulfillment.neighborhood && text.split(',').length >= 3) {
    state.fulfillment.neighborhood = clean(text.split(',')[2])
  }

  const refMatch = text.match(/(?:referencia|referência|perto|proximo|próximo|ao lado|em frente)\s*(?:de|da|do|ao|a)?\s*([^,.]+)/i)
  if (refMatch) state.fulfillment.reference = clean(refMatch[0])

  if (!state.fulfillment.reference && (lower.includes('perto') || lower.includes('lado') || lower.includes('frente'))) {
    state.fulfillment.reference = text
  }
}

function missingAddressFields(state) {
  const missing = []
  const address = clean(state.fulfillment.address)
  if (!address || !/\d/.test(address)) missing.push('rua e número')
  if (!clean(state.fulfillment.neighborhood)) missing.push('bairro')
  if (!clean(state.fulfillment.reference)) missing.push('ponto de referência')
  return missing
}

function productSnapshot(product, upsell = false) {
  if (!product) return null
  return {
    product_id: clean(product.id),
    name: clean(product.name),
    category: clean(product.category),
    quantity: 1,
    unit_price: Number(product.price || 0),
    stock_quantity: Number(product.stock_quantity || 0),
    upsell,
  }
}

function tokenizeForScore(...values) {
  return values
    .join(' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map(norm)
    .filter((term) => term.length >= 3)
}

function scoreProduct(product, state, message) {
  const haystack = norm([product.name, product.category].join(' '))
  let score = 0
  const queryTerms = tokenizeForScore(message, state.brand, state.breed, state.size, state.ageCategory, state.species === 'dog' ? 'cao cachorro' : '', state.species === 'cat' ? 'gato' : '')
  for (const term of queryTerms) {
    if (haystack.includes(term)) score += 3
  }
  if (state.intent === 'produto' && /(racao|ração)/.test(norm(message)) && /racao|ração/.test(haystack)) score += 5
  if (state.species === 'dog' && /(cao|cão|cachorro|canino|caes|cães)/.test(haystack)) score += 4
  if (state.species === 'cat' && /(gato|gatos|felino)/.test(haystack)) score += 4
  if (state.ageCategory && haystack.includes(norm(state.ageCategory))) score += 4
  if (state.breed && haystack.includes(norm(state.breed))) score += 8
  if (state.size && haystack.includes(norm(state.size))) score += 3
  if (state.brand && haystack.includes(norm(state.brand))) score += 8
  if (/canister/.test(haystack) && /(racao|ração)/.test(norm(message))) score -= 8
  return score
}

function rankProducts(products, state, message) {
  return availableProducts(products)
    .map((product) => ({ product, score: scoreProduct(product, state, message) }))
    .sort((a, b) => b.score - a.score || Number(a.product.price || 0) - Number(b.product.price || 0))
}

function chooseProductFromOptions(state, message) {
  const options = state.productOptions || []
  if (!options.length) return null
  const lower = norm(message)
  if (options.length === 1 && isAffirmative(message)) return options[0]
  const ordinal = lower.match(/\b(primeir[ao]|1|segunda|segund[ao]|2|terceir[ao]|3)\b/)
  if (ordinal) {
    if (['primeira', 'primeiro', '1'].includes(ordinal[1])) return options[0]
    if (['segunda', 'segundo', '2'].includes(ordinal[1])) return options[1]
    if (['terceira', 'terceiro', '3'].includes(ordinal[1])) return options[2]
  }
  return options.find((option) => {
    const name = norm(option.name)
    const terms = tokenizeForScore(message)
    return terms.length > 0 && terms.every((term) => name.includes(term) || norm(option.category).includes(term))
  }) || null
}

function pickUpsell(products, state) {
  const selectedId = state.selectedProduct?.product_id
  const lowerSpecies = state.species
  const candidates = availableProducts(products).filter((product) => clean(product.id) !== selectedId)
  const scored = candidates.map((product) => {
    const haystack = norm([product.name, product.category].join(' '))
    let score = 0
    if (/(petisco|bifinho|dental|ossinho)/.test(haystack)) score += lowerSpecies === 'dog' ? 9 : 3
    if (/(dental|bifinho|ossinho)/.test(haystack)) score += lowerSpecies === 'dog' ? 4 : 1
    if (/(sache|sachê)/.test(haystack)) score += lowerSpecies === 'cat' ? 9 : 4
    if (/(areia|higienica|higiênica)/.test(haystack)) score += lowerSpecies === 'cat' ? 7 : 1
    if (/(shampoo|antipulga)/.test(haystack)) score += 5
    if (/canister/.test(haystack)) score -= 5
    if (Number(product.price || 0) <= 0) score -= 20
    return { product, score }
  }).sort((a, b) => b.score - a.score || Number(a.product.price || 0) - Number(b.product.price || 0))

  return scored[0]?.score > 0 ? productSnapshot(scored[0].product, true) : null
}

function serviceMatches(intent, appointment) {
  const service = norm(appointment?.service_type)
  if (intent === 'veterinaria') return /(vet|consulta|vacina|avaliacao|avaliação)/.test(service)
  return /(banho|tosa|higien)/.test(service)
}

function formatSlot(slot) {
  const date = new Date(slot.scheduled_at)
  const day = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  const service = clean(slot.service_type) || 'Atendimento'
  const price = Number(slot.price || 0) > 0 ? ` - ${money(slot.price)}` : ''
  return `${day} às ${time} (${service})${price}`
}

function chooseSlotFromOptions(state, message) {
  const options = state.slotOptions || []
  if (!options.length) return null
  const lower = norm(message)
  if (options.length === 1 && isAffirmative(message)) return options[0]
  const ordinal = lower.match(/\b(primeir[ao]|1|segunda|segund[ao]|2|terceir[ao]|3)\b/)
  if (ordinal) {
    if (['primeira', 'primeiro', '1'].includes(ordinal[1])) return options[0]
    if (['segunda', 'segundo', '2'].includes(ordinal[1])) return options[1]
    if (['terceira', 'terceiro', '3'].includes(ordinal[1])) return options[2]
  }
  const time = lower.match(/\b(\d{1,2})(?::|h)?(\d{2})?\b/)
  if (time) {
    const hour = time[1].padStart(2, '0')
    const minute = (time[2] || '00').padStart(2, '0')
    return options.find((slot) => {
      const date = new Date(slot.scheduled_at)
      const slotTime = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
      return slotTime === `${hour}:${minute}`
    }) || null
  }
  return null
}

function summarizePet(state) {
  return [state.petName, state.species === 'dog' ? 'cachorro' : state.species === 'cat' ? 'gato' : state.species, state.breed, state.size, state.ageCategory]
    .filter(Boolean)
    .join(' / ') || 'aguardando'
}

function selectedItems(state) {
  const items = []
  if (state.selectedProduct) items.push(state.selectedProduct)
  if (state.upsell.accepted && state.upsell.item) items.push(state.upsell.item)
  return items
}

function recalcTotals(state, deliveryFee) {
  const itemsSubtotal = selectedItems(state).reduce((sum, item) => sum + Number(item.quantity || 1) * Number(item.unit_price || 0), 0)
  const serviceSubtotal = state.selectedSlot ? Number(state.selectedSlot.price || 0) : 0
  const subtotal = state.intent === 'produto' ? itemsSubtotal : serviceSubtotal
  const fee = state.intent === 'produto' && state.fulfillment.type === 'entrega' ? Number(deliveryFee ?? DEFAULT_DELIVERY_FEE) : 0
  state.totals = {
    subtotal,
    deliveryFee: fee,
    total: subtotal + fee,
  }
  return state
}

function buildPartialSummary(state) {
  const lines = [
    '**Pedido em andamento:**',
    `• Cliente: ${state.customerName}`,
    `• Pet: ${summarizePet(state)}`,
  ]
  if (state.intent === 'produto') {
    lines.push(`• Produto: ${state.selectedProduct?.name || 'aguardando'}`)
  } else {
    lines.push(`• Serviço: ${state.serviceType || (state.intent === 'veterinaria' ? 'veterinária' : 'banho/tosa')}`)
    if (state.selectedSlot) lines.push(`• Horário: ${formatSlot(state.selectedSlot)}`)
  }
  lines.push(`• Extra: ${state.upsell.accepted && state.upsell.item ? state.upsell.item.name : 'não adicionado'}`)
  lines.push(`• Total parcial: ${money(state.totals.subtotal)}`)
  lines.push(`• Pagamento: ${state.payment.method || 'aguardando'}`)
  lines.push(`• Entrega/retirada: ${state.intent === 'produto' ? state.fulfillment.type || 'aguardando' : 'serviço agendado'}`)
  return lines.join('\n')
}

function buildFinalSummary(state) {
  const lines = [
    '**Resumo do pedido:**',
    `• Cliente: ${state.customerName}`,
    `• Pet: ${summarizePet(state)}`,
  ]
  if (state.intent === 'produto') {
    selectedItems(state).forEach((item) => {
      lines.push(`• Item: ${item.name} - ${money(Number(item.unit_price || 0) * Number(item.quantity || 1))}`)
    })
    if (state.fulfillment.type === 'entrega') lines.push(`• Taxa de entrega: ${money(state.totals.deliveryFee)}`)
  } else {
    lines.push(`• Serviço: ${state.serviceType || (state.intent === 'veterinaria' ? 'veterinária' : 'banho/tosa')}`)
    if (state.selectedSlot) lines.push(`• Horário: ${formatSlot(state.selectedSlot)}`)
  }
  lines.push(`• Total: ${money(state.totals.total)}`)
  lines.push(`• Pagamento: ${state.payment.method}${state.payment.method === 'dinheiro' && state.payment.changeFor ? `, troco para ${money(state.payment.changeFor)}` : ''}`)
  if (state.intent === 'produto') {
    if (state.fulfillment.type === 'entrega') {
      lines.push(`• Entrega: ${state.fulfillment.address} - ${state.fulfillment.neighborhood}${state.fulfillment.reference ? ` (${state.fulfillment.reference})` : ''}`)
    } else {
      lines.push('• Retirada: na loja')
    }
  }
  lines.push('')
  lines.push(state.intent === 'produto' ? 'Confirma para separação?' : 'Confirma o agendamento?')
  return lines.join('\n')
}

function buildOrderArgs(state) {
  if (state.intent === 'produto') {
    return {
      customer_name: state.customerName,
      pet_name: state.petName,
      species: state.species,
      size: state.size,
      breed: state.breed,
      order_type: 'produto',
      items: selectedItems(state).map((item) => ({
        product_id: item.product_id,
        name: item.name,
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unit_price || 0),
        upsell: Boolean(item.upsell),
      })),
      total: state.totals.total,
      payment_method: state.payment.method,
      change_for: state.payment.changeFor,
      fulfillment_type: state.fulfillment.type,
      delivery_address: state.fulfillment.address,
      delivery_neighborhood: state.fulfillment.neighborhood,
      delivery_city: state.fulfillment.city,
      delivery_reference: state.fulfillment.reference,
      notes: `PetBot guard v${PETBOT_VERSION}`,
    }
  }

  return {
    customer_name: state.customerName,
    pet_name: state.petName,
    species: state.species,
    size: state.size || state.breed,
    breed: state.breed,
    symptom: state.symptom,
    order_type: state.intent,
    service_type: state.serviceType || (state.intent === 'veterinaria' ? 'veterinária' : 'banho/tosa'),
    scheduled_at: state.selectedSlot?.scheduled_at,
    appointment_id: state.selectedSlot?.id,
    items: [{
      name: state.serviceType || (state.intent === 'veterinaria' ? 'Consulta veterinária' : 'Banho/tosa'),
      quantity: 1,
      unit_price: Number(state.selectedSlot?.price || 0),
      upsell: false,
    }],
    total: state.totals.total,
    payment_method: state.payment.method,
    change_for: state.payment.changeFor,
    fulfillment_type: 'servico',
    notes: [state.symptom ? `Sintoma: ${state.symptom}` : null, `PetBot guard v${PETBOT_VERSION}`].filter(Boolean).join(' | '),
  }
}

function applyMessageFacts(state, message) {
  const name = extractCustomerName(message, state)
  if (name && !state.nameConfirmed) {
    state.customerName = name
    state.nameConfirmed = true
  }

  const intent = detectIntent(message, state.intent)
  if (intent) state.intent = intent

  const species = inferSpecies(message)
  if (species) state.species = species

  const breedInfo = inferBreedAndSize(message)
  if (breedInfo.breed) {
    state.breed = breedInfo.breed
    state.species ||= 'dog'
    state.size ||= breedInfo.size
  }

  const size = inferSize(message)
  if (size) state.size = size

  const age = inferAge(message)
  if (age) state.ageCategory = age

  const brand = inferBrand(message)
  if (brand) state.brand = brand

  const petName = extractPetName(message, state)
  if (petName && !state.petName) state.petName = petName

  const symptom = extractSymptom(message)
  if (symptom && state.intent === 'veterinaria') state.symptom = symptom

  const payment = detectPayment(message)
  if (payment) state.payment.method = payment

  const fulfillment = detectFulfillment(message)
  if (fulfillment && state.intent === 'produto') state.fulfillment.type = fulfillment

  if (state.payment.method === 'dinheiro' && state.payment.changeAsked) {
    const changeFor = parseChangeFor(message)
    if (changeFor !== null) state.payment.changeFor = changeFor
  }

  updateAddressFromMessage(state, message)
  return state
}

function guardResult(reply, state, extra = {}) {
  return {
    handled: true,
    reply,
    state,
    intent: state.intent || 'geral',
    blockedReasons: state.blockedReasons || [],
    ...extra,
  }
}

function ask(reply, state, awaiting, reason) {
  state.awaiting = awaiting
  state.lastQuestion = awaiting
  if (reason) state.blockedReasons = [...new Set([...(state.blockedReasons || []), reason])]
  return guardResult(reply, state)
}

function presentProducts(state, products, message) {
  const ranked = rankProducts(products, state, message)
  const strong = ranked.filter((item) => item.score > 0).slice(0, 3)
  const options = (strong.length ? strong : ranked.slice(0, 3)).map((item) => productSnapshot(item.product))
  state.productOptions = options.filter(Boolean)
  state.awaiting = 'product_choice'

  if (!state.productOptions.length) {
    state.blockedReasons = [...new Set([...(state.blockedReasons || []), 'estoque_ausente'])]
    return guardResult('Consultei aqui e não encontrei produto disponível com esses dados. Quer que eu chame alguém da equipe para te ajudar?', state)
  }

  const intro = strong.length ? 'Consultei o estoque e tenho essas opções:' : 'Não encontrei exatamente o que você pediu, mas tenho essas alternativas com estoque:'
  const lines = state.productOptions.map((product, index) => `${index + 1}. ${product.name} - ${money(product.unit_price)}`)
  return guardResult(`${intro}\n${lines.join('\n')}\n\nQual prefere?`, state)
}

function presentSlots(state, appointments) {
  const slots = availableAppointments(appointments).filter((appointment) => serviceMatches(state.intent, appointment)).slice(0, 3)
  state.slotOptions = slots.map((slot) => ({
    id: clean(slot.id),
    service_type: clean(slot.service_type),
    scheduled_at: slot.scheduled_at,
    price: Number(slot.price || 0),
  }))
  state.awaiting = 'slot_choice'

  if (!state.slotOptions.length) {
    state.blockedReasons = [...new Set([...(state.blockedReasons || []), 'sem_horario_real'])]
    return guardResult('Consultei a agenda e não achei horário disponível agora. Quer que eu chame a equipe para ver outros horários?', state)
  }

  const lines = state.slotOptions.map((slot, index) => `${index + 1}. ${formatSlot(slot)}`)
  return guardResult(`Consultei a agenda e tenho:\n${lines.join('\n')}\n\nQual horário prefere?`, state)
}

function serviceFlow(state, message, appointments, settings) {
  if (!state.petName) {
    return ask('Perfeito. Qual o nome do pet?', state, 'pet_name', 'pet_nome_pendente')
  }
  if (!state.species) {
    return ask('Ele é cachorro ou gato?', state, 'species', 'especie_pendente')
  }
  if (state.intent === 'banho_tosa' && !state.size && !state.breed) {
    return ask('Qual o porte ou raça dele?', state, 'service_pet_details', 'porte_pendente')
  }
  if (state.intent === 'veterinaria' && !state.symptom) {
    return ask('Qual é o problema principal dele?', state, 'symptom', 'sintoma_pendente')
  }

  const chosenSlot = chooseSlotFromOptions(state, message)
  if (chosenSlot) state.selectedSlot = chosenSlot

  if (!state.selectedSlot) return presentSlots(state, appointments)
  if (Number(state.selectedSlot.price || 0) <= 0) {
    state.blockedReasons = [...new Set([...(state.blockedReasons || []), 'preco_servico_ausente'])]
    return guardResult('Tenho esse horário, mas o valor não está confirmado no sistema. Vou chamar a equipe para fechar certinho.', state, { needsHuman: true })
  }

  state.serviceType = state.selectedSlot.service_type || (state.intent === 'veterinaria' ? 'veterinária' : 'banho/tosa')
  state.upsell.resolved = true
  recalcTotals(state, settings.deliveryFee)

  if (!state.partialSummaryShown) {
    state.partialSummaryShown = true
    if (!state.payment.method) {
      return ask(`${buildPartialSummary(state)}\n\nQual forma prefere? pix, dinheiro ou cartão?`, state, 'payment', 'pagamento_pendente')
    }
  }
  return checkoutFlow(state, settings)
}

function checkoutFlow(state, settings) {
  recalcTotals(state, settings.deliveryFee)

  if (!state.payment.method) {
    return ask('Qual forma prefere? pix, dinheiro ou cartão?', state, 'payment', 'pagamento_pendente')
  }

  if (state.payment.method === 'dinheiro' && state.payment.changeFor === null) {
    state.payment.changeAsked = true
    return ask('Precisa de troco para quanto?', state, 'change_for', 'troco_pendente')
  }

  if (state.intent === 'produto') {
    if (!state.fulfillment.type) {
      return ask('Será entrega ou retirada na loja?', state, 'fulfillment', 'entrega_retirada_pendente')
    }

    if (state.fulfillment.type === 'entrega') {
      const missing = missingAddressFields(state)
      if (missing.length) {
        return ask(`Para entrega, me passa ${missing.join(', ')}.`, state, 'delivery_address', 'endereco_incompleto')
      }
    }
  }

  if (!state.finalSummaryShown) {
    state.finalSummaryShown = true
    state.status = 'resumo_final'
    return guardResult(buildFinalSummary(state), state)
  }

  return guardResult('Só preciso da sua confirmação para finalizar.', state)
}

function productFlow(state, message, products, settings) {
  if (!state.species) {
    return ask('É para cachorro ou gato?', state, 'species', 'especie_pendente')
  }
  if (!state.size && !state.ageCategory) {
    if (state.species === 'cat') {
      return ask('Seu gato é filhote, adulto ou castrado?', state, 'pet_category', 'categoria_pendente')
    }
    return ask('Ele é filhote, adulto ou qual porte/raça?', state, 'pet_category', 'categoria_pendente')
  }

  const chosen = chooseProductFromOptions(state, message)
  if (chosen) state.selectedProduct = chosen

  if (!state.selectedProduct) return presentProducts(state, products, message)

  if (!state.upsell.offered) {
    const upsell = pickUpsell(products, state)
    state.upsell.offered = true
    state.upsell.item = upsell
    if (upsell) {
      state.awaiting = 'upsell'
      return guardResult(`A ${state.selectedProduct.name} fica ${money(state.selectedProduct.unit_price)}.\n\nPosso incluir ${upsell.name} por ${money(upsell.unit_price)}? Quer adicionar?`, state)
    }
    state.upsell.resolved = true
  }

  if (state.awaiting === 'upsell') {
    if (isNegative(message)) {
      state.upsell.declined = true
      state.upsell.accepted = false
      state.upsell.resolved = true
    } else if (isAffirmative(message)) {
      state.upsell.accepted = Boolean(state.upsell.item)
      state.upsell.declined = !state.upsell.item
      state.upsell.resolved = true
    } else if (detectPayment(message) || detectFulfillment(message)) {
      state.upsell.declined = true
      state.upsell.accepted = false
      state.upsell.resolved = true
    }
  }

  if (!state.upsell.resolved) {
    return guardResult(`A ${state.selectedProduct.name} fica ${money(state.selectedProduct.unit_price)}.\n\nQuer adicionar ${state.upsell.item?.name || 'um complemento'}?`, state)
  }

  recalcTotals(state, settings.deliveryFee)

  if (!state.partialSummaryShown) {
    state.partialSummaryShown = true
    if (!state.payment.method) {
      return ask(`${buildPartialSummary(state)}\n\nQual forma prefere? pix, dinheiro ou cartão?`, state, 'payment', 'pagamento_pendente')
    }
  }

  return checkoutFlow(state, settings)
}

function maybeHandleDiscount(state, products) {
  if (state.intent !== 'produto') {
    return 'Infelizmente não conseguimos aplicar desconto nesse pedido.'
  }
  const cheap = availableProducts(products)
    .filter((product) => clean(product.id) !== state.selectedProduct?.product_id)
    .sort((a, b) => Number(a.price || 0) - Number(b.price || 0))[0]

  if (!cheap) return 'Infelizmente não conseguimos aplicar desconto nesse pedido.'
  const option = productSnapshot(cheap)
  state.productOptions = [option].filter(Boolean)
  return `Infelizmente não conseguimos aplicar desconto nesse pedido.\n\nPosso te mostrar uma opção mais econômica: ${option.name} por ${money(option.unit_price)}. Quer seguir com ela?`
}

export function runPetbotGuard({
  message,
  session = {},
  customer = {},
  products = [],
  appointments = [],
  settings = {},
} = {}) {
  const trimmed = clean(message)
  const context = session.context || {}
  const state = hydrateFromCustomer(getPetbotState(context), session, customer)
  state.blockedReasons = []
  state.totals.deliveryFee = Number(settings.deliveryFee ?? DEFAULT_DELIVERY_FEE)

  if (state.status === 'awaiting_rating') {
    const rating = trimmed.match(/^(10|[0-9])$/)
    if (rating) {
      state.status = 'closed'
      state.awaiting = ''
      state.csatScore = Number(rating[1])
      return guardResult('Obrigado pela avaliação! Atendimento finalizado por aqui. ✅', state, { shouldSaveRating: true, rating: Number(rating[1]) })
    }
  }

  applyMessageFacts(state, trimmed)

  if (state.finalSummaryShown && !state.saved && isAffirmative(trimmed)) {
    recalcTotals(state, settings.deliveryFee)
    state.status = 'confirmando'
    state.confirmationKey = `${state.intent}:${state.customerName}:${state.totals.total}:${state.selectedProduct?.product_id || state.selectedSlot?.id || ''}`
    return guardResult('Perfeito, vou registrar agora.', state, { shouldSaveOrder: true, orderArgs: buildOrderArgs(state) })
  }

  if (hasAny(trimmed, DISCOUNT_HINTS)) {
    return guardResult(maybeHandleDiscount(state, products), state)
  }

  if (state.intent === 'multi') {
    return ask('Consigo te ajudar com os dois. Vamos começar por produto ou por agendamento?', state, 'intent', 'fluxo_misto')
  }

  if (!state.nameConfirmed) {
    return ask('Oi! Claro. Posso saber seu nome, por favor?', state, 'customer_name', 'nome_pendente')
  }

  if (!state.intent) {
    if (/taxa|entrega|delivery/i.test(trimmed)) {
      return guardResult(`Temos entrega sim. A taxa configurada é ${money(settings.deliveryFee ?? DEFAULT_DELIVERY_FEE)}.\n\nVocê quer produto, banho/tosa ou veterinária?`, state)
    }
    return ask(`Perfeito, ${state.customerName}. Você precisa de produto, banho/tosa ou veterinária?`, state, 'intent', 'intencao_pendente')
  }

  if (hasAny(trimmed, URGENCY_HINTS) && state.intent !== 'veterinaria') {
    state.intent = 'veterinaria'
  }

  if (state.intent === 'produto') return productFlow(state, trimmed, products, settings)
  if (state.intent === 'banho_tosa' || state.intent === 'veterinaria') return serviceFlow(state, trimmed, appointments, settings)

  return ask(`Perfeito, ${state.customerName}. Você precisa de produto, banho/tosa ou veterinária?`, state, 'intent', 'intencao_pendente')
}

export function markPetbotOrderSaved(state, result = {}) {
  const next = getPetbotState({ petbot: state })
  next.saved = true
  next.status = 'awaiting_rating'
  next.awaiting = 'rating'
  next.finalSummaryShown = true
  next.lastSaleId = clean(result.sale_id)
  next.lastOrderId = clean(result.order_id)
  next.lastAppointmentId = clean(result.appointment_id)
  return next
}

export function markPetbotOrderError(state, error) {
  const next = getPetbotState({ petbot: state })
  next.status = 'error'
  next.blockedReasons = [...new Set([...(next.blockedReasons || []), 'erro_salvamento'])]
  next.lastError = error instanceof Error ? error.message : clean(error)
  return next
}
