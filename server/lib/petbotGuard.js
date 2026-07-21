import {
  classifyProduct,
  detectCatalogRequest,
  isCatalogType,
  rankCatalogProducts,
} from './petbotCatalog.js'

const DEFAULT_DELIVERY_FEE = 10
const DEFAULT_PET_TRANSPORT_FEE = 20
const DEFAULT_PET_TRANSPORT_OPTIONS = [
  { id: 'buscar_e_levar', label: 'Buscar e levar', fee: 20, maxWeightKg: 10, active: true },
  { id: 'somente_buscar', label: 'Somente buscar', fee: 15, maxWeightKg: 10, active: true },
  { id: 'somente_levar', label: 'Somente levar', fee: 15, maxWeightKg: 10, active: true },
]

const PETBOT_VERSION = 1

const DOG_BREEDS = new Map([
  ['shih tzu', { breed: 'Shih Tzu', size: 'pequeno' }],
  ['shi tzu', { breed: 'Shih Tzu', size: 'pequeno' }],
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

const FOOD_HINTS = [
  'racao',
  'ração',
  'comida',
  'alimento',
  'premier',
  'royal',
  'royal canin',
  'golden',
  'pedigree',
  'whiskas',
  'special dog',
  'formula natural',
  'gran plus',
  'quatree',
]

const FLEA_HINTS = ['antipulga', 'anti pulga', 'pulga', 'carrapato', 'bravecto', 'nexgard', 'simparic', 'credeli']

const SERVICE_HINTS = ['banho', 'banh', 'tosa', 'tosar', 'higien', 'agendar', 'agenda']
const VET_HINTS = ['vet', 'vetrinario', 'veternario', 'veterinario', 'veterinária', 'veterinaria', 'consulta', 'vacina', 'clinica', 'clínica', 'medico', 'médico']
const URGENCY_HINTS = ['vomit', 'sangr', 'veneno', 'intoxic', 'convuls', 'falta de ar', 'apatico', 'apático', 'nao come', 'não come']
const DISCOUNT_HINTS = ['desconto', 'abaixa', 'barato', 'mais em conta', 'melhor preco', 'melhor preço']
const HUMAN_HINTS = ['atendente', 'humano', 'pessoa', 'equipe', 'gerente', 'falar com alguem', 'falar com alguém', 'falar com veterinaria', 'falar com veterinária', 'me liga', 'ligacao', 'ligação']
const CRITICAL_URGENCY_HINTS = ['veneno', 'intoxic', 'falta de ar', 'nao respira', 'não respira', 'convuls', 'sangr', 'sangue', 'desmai', 'atropel', 'engasg']
const IMAGE_HINTS = ['foto', 'imagem', 'img', 'manda foto', 'tem foto', 'ver foto', 'embalagem', 'mostra foto', 'mostrar foto']
const BUSY_APPOINTMENT_STATUSES = new Set(['agendado', 'confirmado', 'em_andamento', 'booked', 'ocupado', 'blocked', 'bloqueado'])

const AWAITING_ACTIONS = {
  customer_name: 'pedir_nome',
  intent: 'identificar_intencao',
  species: 'pedir_especie',
  pet_category: 'pedir_categoria_pet',
  service_pet_details: 'pedir_categoria_pet',
  service_type: 'pedir_tipo_servico',
  grooming_detail: 'pedir_acabamento_tosa',
  service_notes: 'pedir_observacao_servico',
  service_date: 'pedir_dia_agendamento',
  service_time_preference: 'pedir_preferencia_horario',
  pet_name: 'pedir_nome_pet',
  symptom: 'pedir_sintoma',
  product_choice: 'oferecer_produtos',
  slot_choice: 'oferecer_horarios',
  upsell: 'oferecer_upsell',
  payment: 'pedir_pagamento',
  change_for: 'pedir_troco',
  fulfillment: 'pedir_entrega_retirada',
  delivery_address: 'pedir_endereco',
  service_transport: 'perguntar_transporte_pet',
  service_transport_address: 'pedir_endereco_transporte_pet',
  food_preferences: 'pedir_preferencia_racao',
  rating: 'pedir_avaliacao',
  human: 'handoff_humano',
}

const LLM_REDRAFT_ALLOWED_ACTIONS = new Set([
  'pedir_nome',
  'identificar_intencao',
  'pedir_especie',
  'pedir_categoria_pet',
  'pedir_tipo_servico',
  'pedir_acabamento_tosa',
  'pedir_observacao_servico',
  'pedir_dia_agendamento',
  'pedir_preferencia_horario',
  'pedir_nome_pet',
  'pedir_sintoma',
  'pedir_pagamento',
  'pedir_troco',
  'pedir_entrega_retirada',
  'pedir_endereco',
  'perguntar_transporte_pet',
  'pedir_endereco_transporte_pet',
  'pedir_preferencia_racao',
  'oferecer_upsell',
  'recusar_desconto',
  'cancelar',
  'handoff_humano',
])

const CHOICE_STOP_WORDS = new Set([
  'pode',
  'ser',
  'quero',
  'queria',
  'vou',
  'pegar',
  'levar',
  'essa',
  'esse',
  'dessa',
  'desse',
  'opcao',
  'opção',
  'racao',
  'ração',
])

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

function normalizeTransportOptions(settings = {}) {
  let raw = settings.petTransportOptions || settings.pet_transport_options || null
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      raw = null
    }
  }
  const source = Array.isArray(raw) && raw.length ? raw : DEFAULT_PET_TRANSPORT_OPTIONS
  const normalized = source
    .map((option, index) => ({
      id: clean(option.id || option.mode || DEFAULT_PET_TRANSPORT_OPTIONS[index]?.id || `opcao_${index + 1}`),
      label: clean(option.label || option.name || DEFAULT_PET_TRANSPORT_OPTIONS[index]?.label || `Opcao ${index + 1}`),
      fee: Number(option.fee ?? option.price ?? DEFAULT_PET_TRANSPORT_OPTIONS[index]?.fee ?? settings.petTransportFee ?? DEFAULT_PET_TRANSPORT_FEE),
      maxWeightKg: option.maxWeightKg ?? option.max_weight_kg ?? DEFAULT_PET_TRANSPORT_OPTIONS[index]?.maxWeightKg ?? 10,
      active: option.active !== false,
    }))
    .filter((option) => option.active && option.id && option.label && Number.isFinite(option.fee))

  if (normalized.length) return normalized
  return [{
    id: 'buscar_e_levar',
    label: 'Buscar e levar',
    fee: Number(settings.petTransportFee ?? DEFAULT_PET_TRANSPORT_FEE),
    maxWeightKg: 10,
    active: true,
  }]
}

function transportOptionLine(option, index) {
  const limit = Number(option.maxWeightKg || 0) > 0 ? `, ate ${option.maxWeightKg}kg` : ''
  return `${index + 1}. ${option.label} - ${money(option.fee)}${limit}`
}

function buildTransportQuestion(settings = {}) {
  const options = normalizeTransportOptions(settings)
  return [
    'Voce quer que a gente busque e entregue o pet na sua residencia?',
    'Opcoes MotoDog:',
    ...options.map(transportOptionLine),
    'Se nao quiser transporte, pode dizer "sem transporte".',
  ].join('\n')
}

function inferTransportOption(message = '', settings = {}) {
  const lower = norm(message)
  const options = normalizeTransportOptions(settings)
  if (!lower) return null
  const numeric = lower.match(/\b([123])\b/)
  if (numeric) return options[Number(numeric[1]) - 1] || null
  if (/(buscar|busca).*(levar|entregar|entrega|trazer|volta)|ida.*volta|leva.*traz/.test(lower)) {
    return options.find((option) => option.id === 'buscar_e_levar') || options[0] || null
  }
  if (/(somente|so|só|apenas).*(buscar|busca)|buscar apenas|so busca|só busca/.test(lower)) {
    return options.find((option) => option.id === 'somente_buscar') || null
  }
  if (/(somente|so|só|apenas).*(levar|entregar|entrega)|levar apenas|so levar|só levar/.test(lower)) {
    return options.find((option) => option.id === 'somente_levar') || null
  }
  return options.find((option) => lower.includes(norm(option.label))) || null
}

function applyTransportOption(state, option) {
  if (!option) return false
  state.serviceTransport ||= defaultServiceTransport()
  state.serviceTransport.offered = true
  state.serviceTransport.accepted = true
  state.serviceTransport.declined = false
  state.serviceTransport.mode = option.id
  state.serviceTransport.label = option.label
  state.serviceTransport.fee = Number(option.fee || 0)
  state.serviceTransport.maxWeightKg = option.maxWeightKg ?? null
  return true
}

function saoPauloTodayIso() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

function addDaysIso(dateIso, days) {
  const [year, month, day] = String(dateIso || saoPauloTodayIso()).split('-').map(Number)
  if (![year, month, day].every(Number.isFinite)) return saoPauloTodayIso()
  const date = new Date(Date.UTC(year, month - 1, day + Number(days || 0), 12, 0, 0))
  return date.toISOString().slice(0, 10)
}

function isoFromBrazilianDate(day, month, year = '') {
  const today = saoPauloTodayIso()
  const currentYear = Number(today.slice(0, 4))
  const parsedYear = year
    ? (String(year).length === 2 ? 2000 + Number(year) : Number(year))
    : currentYear
  const parsedDay = Number(day)
  const parsedMonth = Number(month)
  if (!parsedYear || parsedMonth < 1 || parsedMonth > 12 || parsedDay < 1 || parsedDay > 31) return ''
  const date = new Date(Date.UTC(parsedYear, parsedMonth - 1, parsedDay, 12, 0, 0))
  if (date.getUTCFullYear() !== parsedYear || date.getUTCMonth() !== parsedMonth - 1 || date.getUTCDate() !== parsedDay) return ''
  return date.toISOString().slice(0, 10)
}

function hasAny(text, terms) {
  const lower = norm(text)
  return terms.some((term) => lower.includes(norm(term)))
}

function addBlockedReason(state, ...reasons) {
  const aliases = {
    estoque_ausente: 'sem_estoque',
    marca_sem_estoque: 'sem_estoque',
    embalagem_sem_estoque: 'sem_estoque',
    estoque_insuficiente_quantidade: 'sem_estoque',
    sem_horario_real: 'agenda_sem_horario',
    erro_salvamento: 'salvamento_falhou',
  }
  const next = [...(state.blockedReasons || [])]
  for (const reason of reasons.filter(Boolean)) {
    next.push(reason)
    if (aliases[reason]) next.push(aliases[reason])
  }
  state.blockedReasons = [...new Set(next)]
  return state
}

function buildNamePrompt(message = '') {
  const lower = norm(message)
  if (/\bbom dia\b/.test(lower)) return 'Bom dia! Qual seu nome, por favor?'
  if (/\bboa tarde\b/.test(lower)) return 'Boa tarde! Qual seu nome, por favor?'
  if (/\bboa noite\b/.test(lower)) return 'Boa noite! Qual seu nome, por favor?'
  if (/^(oi|ola|opa)\b/.test(lower)) return 'Oi! Qual seu nome, por favor?'
  return 'Claro. Posso saber seu nome, por favor?'
}

function wantsProductImage(message = '') {
  return hasAny(message, IMAGE_HINTS)
}

function isKnownName(name = '') {
  const value = norm(name)
  return Boolean(value) && !['cliente', 'cliente teste', 'cliente whatsapp', 'whatsapp', 'sem nome'].includes(value) && !/^cliente[-\s]?\d+/.test(value)
}

function availableProducts(products = []) {
  return (products || []).filter((product) => product?.active !== false && Number(product?.stock_quantity || 0) > 0)
}

function hasEnoughStockForState(product = {}, state = {}) {
  const requestedQuantity = Number(
    state.selectedProduct?.product_id === clean(product.id || product.product_id)
      ? state.selectedProduct?.quantity
      : state.pendingQuantity,
  )
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 1) return true
  return Number(product.stock_quantity || 0) >= requestedQuantity
}

function availableAppointments(appointments = []) {
  const freeStatuses = new Set(['available', 'livre', 'disponivel', 'aberto', 'open'])
  return (appointments || [])
    .filter((appointment) => freeStatuses.has(norm(appointment?.status)))
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
}

function defaultUpsell() {
  return {
    offered: false,
    resolved: false,
    accepted: false,
    declined: false,
    item: null,
  }
}

function defaultPayment() {
  return {
    method: '',
    changeFor: null,
    changeAsked: false,
  }
}

function defaultFulfillment() {
  return {
    type: '',
    address: '',
    neighborhood: '',
    city: '',
    reference: '',
    deliveryFeeInformed: false,
  }
}

function defaultServiceTransport() {
  return {
    offered: false,
    accepted: false,
    declined: false,
    mode: '',
    label: '',
    maxWeightKg: null,
    fee: 0,
    address: '',
    neighborhood: '',
    city: '',
    reference: '',
  }
}

function defaultTotals() {
  return {
    subtotal: 0,
    deliveryFee: 0,
    serviceTransportFee: 0,
    total: 0,
  }
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
    brandPreferenceAny: false,
    brandPreferenceAsked: false,
    productKind: '',
    packagePreference: '',
    packageKg: null,
    packagePreferenceAny: false,
    packagePreferenceAsked: false,
    pendingQuantity: null,
    selectedProduct: null,
    productOptions: [],
    selectedSlot: null,
    slotOptions: [],
    serviceType: '',
    groomingChoiceConfirmed: false,
    serviceGroomingDetail: '',
    serviceNotes: '',
    serviceNotesAsked: false,
    serviceDate: '',
    serviceTimePreference: '',
    servicePreferredTime: '',
    serviceTransport: defaultServiceTransport(),
    upsell: defaultUpsell(),
    payment: defaultPayment(),
    fulfillment: defaultFulfillment(),
    totals: defaultTotals(),
    partialSummaryShown: false,
    finalSummaryShown: false,
    saved: false,
    registrationChecklist: defaultRegistrationChecklist(),
    paymentProof: defaultPaymentProof(),
    awaiting: '',
    blockedReasons: [],
    lastQuestion: '',
    confirmationKey: '',
    lastSaleId: '',
    lastOrderId: '',
    lastAppointmentId: '',
  }
}

function defaultRegistrationChecklist() {
  return {
    requested: false,
    completed: false,
    missing: [],
  }
}

function defaultPaymentProof() {
  return {
    status: 'nao_aplicavel',
    requested: false,
    received: false,
    mediaId: '',
    url: '',
  }
}

export function getPetbotState(context = {}) {
  const parsedContext = parseContextObject(context)
  const incoming = parsedContext?.petbot && typeof parsedContext.petbot === 'object' ? parsedContext.petbot : {}
  const base = defaultState()
  return {
    ...base,
    ...incoming,
    upsell: { ...base.upsell, ...(incoming.upsell || {}) },
    payment: { ...base.payment, ...(incoming.payment || {}) },
    fulfillment: { ...base.fulfillment, ...(incoming.fulfillment || {}) },
    serviceTransport: { ...base.serviceTransport, ...(incoming.serviceTransport || {}) },
    registrationChecklist: { ...base.registrationChecklist, ...(incoming.registrationChecklist || {}) },
    paymentProof: { ...base.paymentProof, ...(incoming.paymentProof || {}) },
    totals: { ...base.totals, ...(incoming.totals || {}) },
    blockedReasons: Array.isArray(incoming.blockedReasons) ? incoming.blockedReasons : [],
    productOptions: Array.isArray(incoming.productOptions) ? incoming.productOptions : [],
    slotOptions: Array.isArray(incoming.slotOptions) ? incoming.slotOptions : [],
  }
}

export function mergePetbotContext(context = {}, state) {
  const parsedContext = parseContextObject(context)
  return {
    ...(parsedContext || {}),
    petbot: {
      ...state,
      version: PETBOT_VERSION,
      updatedAt: new Date().toISOString(),
    },
  }
}

function parseContextObject(context = {}) {
  if (context && typeof context === 'object' && !Array.isArray(context)) return context
  if (typeof context !== 'string' || !context.trim()) return {}
  try {
    const parsed = JSON.parse(context)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function snapshotPetbotState(state = {}) {
  const next = getPetbotState({ petbot: state })
  return {
    version: PETBOT_VERSION,
    status: next.status,
    intent: next.intent,
    awaiting: next.awaiting,
    lastAction: next.lastAction,
    customerName: next.customerName,
    nameConfirmed: Boolean(next.nameConfirmed),
    petName: next.petName,
    species: next.species,
    size: next.size,
    breed: next.breed,
    ageCategory: next.ageCategory,
    symptom: next.symptom,
    brand: next.brand,
    brandPreferenceAny: Boolean(next.brandPreferenceAny),
    brandPreferenceAsked: Boolean(next.brandPreferenceAsked),
    productKind: next.productKind,
    packagePreference: next.packagePreference,
    packageKg: next.packageKg,
    packagePreferenceAny: Boolean(next.packagePreferenceAny),
    packagePreferenceAsked: Boolean(next.packagePreferenceAsked),
    pendingQuantity: next.pendingQuantity,
    serviceType: next.serviceType,
    groomingChoiceConfirmed: Boolean(next.groomingChoiceConfirmed),
    serviceGroomingDetail: next.serviceGroomingDetail,
    serviceNotes: next.serviceNotes,
    serviceNotesAsked: Boolean(next.serviceNotesAsked),
    serviceDate: next.serviceDate,
    serviceTimePreference: next.serviceTimePreference,
    servicePreferredTime: next.servicePreferredTime,
    selectedProduct: next.selectedProduct,
    productOptions: Array.isArray(next.productOptions) ? next.productOptions.slice(0, 5) : [],
    selectedSlot: next.selectedSlot,
    slotOptions: Array.isArray(next.slotOptions) ? next.slotOptions.slice(0, 5) : [],
    upsell: next.upsell,
    payment: next.payment,
    fulfillment: next.fulfillment,
    serviceTransport: next.serviceTransport,
    totals: next.totals,
    finalSummaryShown: Boolean(next.finalSummaryShown),
    saved: Boolean(next.saved),
    csatScore: next.csatScore,
    blockedReasons: Array.isArray(next.blockedReasons) ? next.blockedReasons.slice(-8) : [],
    updatedAt: new Date().toISOString(),
  }
}

export function recoverPetbotContextFromHistory(context = {}, session = {}, history = []) {
  const incoming = parseContextObject(context)
  if (incoming.petbot && typeof incoming.petbot === 'object' && Object.keys(incoming.petbot).length > 0) {
    return incoming
  }

  const messages = Array.isArray(history) ? history : []
  const lastSnapshot = [...messages]
    .reverse()
    .map((message) => message?.metadata?.petbot_state)
    .find((state) => state && typeof state === 'object' && !Array.isArray(state))
  const state = getPetbotState({ petbot: lastSnapshot || {} })

  const sessionName = clean(session.customer_name)
  if (!state.customerName && isKnownName(sessionName)) {
    state.customerName = titleName(sessionName)
    state.nameConfirmed = true
  }

  const sessionIntent = clean(session.intent)
  if (!state.intent && sessionIntent && !['geral', 'duvida', 'dúvida'].includes(norm(sessionIntent))) {
    state.intent = sessionIntent
  }

  for (const entry of messages) {
    if (entry?.role !== 'user') continue
    applyMessageFacts(state, clean(entry.content))
  }

  const hasUsefulState = state.nameConfirmed
    || state.intent
    || state.species
    || state.breed
    || state.ageCategory
    || state.selectedProduct
    || state.selectedSlot
    || state.serviceDate
    || state.serviceGroomingDetail
    || state.serviceTransport?.accepted
    || state.payment.method
    || state.fulfillment.type

  return hasUsefulState ? mergePetbotContext(incoming, state) : incoming
}

export function buildPetbotSearchText(message = '', context = {}) {
  const state = getPetbotState(context)
  return [
    message,
    state.intent,
    state.species,
    state.species === 'dog' ? 'cachorro cao caes canino' : '',
    state.species === 'cat' ? 'gato gatos felino' : '',
    state.size,
    state.breed,
    state.ageCategory,
    state.brand,
    state.packagePreference,
    state.packageKg ? `${state.packageKg}kg` : '',
    state.serviceType,
    state.serviceNotes,
    state.serviceGroomingDetail,
    state.serviceDate,
    state.serviceTimePreference,
    state.servicePreferredTime,
    state.serviceTransport?.address,
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
  state.registrationChecklist = {
    ...defaultRegistrationChecklist(),
    ...(state.registrationChecklist || {}),
    missing: registrationMissingFields(state, client, details),
  }
  return state
}

function registrationMissingFields(state = {}, client = {}, details = {}) {
  const missing = []
  if (!clean(details.tutor_birth_date)) missing.push('data de nascimento do tutor')
  if (!clean(client.document)) missing.push('CPF do tutor')
  if (!clean(details.zip_code)) missing.push('CEP da rua')
  if (!clean(details.address_number) || !clean(details.address_reference)) missing.push('numero da casa e ponto de referencia')
  if (!clean(state.petName || details.pet_name) || !clean(state.breed || details.breed)) missing.push('nome e raca do pet')
  return [...new Set(missing)]
}

function normalizeSpecies(value = '') {
  const lower = norm(value)
  if (/\b(cachorro|cachorra|cao|caes|cadela|dog|canino|caninos)\b/.test(lower)) return 'dog'
  if (/\b(gato|gata|gatos|gatas|cat|felino|felinos)\b/.test(lower)) return 'cat'
  return clean(value)
}

function inferSpecies(message = '') {
  const lower = norm(message)
  if (/\b(gato|gata|gatos|gatas|cat|felino|felinos)\b/.test(lower)) return 'cat'
  if (/\b(cachorro|cachorra|cao|caes|cadela|dog|canino|caninos)\b/.test(lower)) return 'dog'
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
  if (/(pequen|mini|porte p|\b(?:5|6|7|8|9)\s?kg\b)/.test(lower)) return 'pequeno'
  if (/(medio|médio|porte m|\b(?:10|12|15|18)\s?kg\b)/.test(lower)) return 'medio'
  if (/(grande|porte g|\b(?:20|25|30|40)\s?kg\b)/.test(lower)) return 'grande'
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

function hasNoBrandPreference(message = '') {
  const lower = norm(message)
  return /(sem preferencia|sem preferência|tanto faz|qualquer marca|pode ser qualquer|a que tiver|nao tenho marca|não tenho marca|nao tenho preferencia|não tenho preferência)/.test(lower)
}

function isFoodRequest(message = '', state = {}) {
  return hasAny([message, state.brand, state.selectedProduct?.name].filter(Boolean).join(' '), FOOD_HINTS)
}

function isFoodPreferenceContext(message = '', state = {}) {
  return isFoodRequest(message, state)
    || state.productKind === 'food'
    || state.packagePreference === 'granel'
    || Boolean(state.packageKg)
    || state.awaiting === 'food_preferences'
}

function isFleaRequest(message = '') {
  return hasAny(message, FLEA_HINTS)
}

function isSpecificNonFoodProductRequest(message = '') {
  return hasAny(message, ['areia', 'shampoo', 'petisco', 'bifinho', 'sache', 'sachê', 'brinquedo', 'coleira', 'guia', 'tapete'])
}

function isLitterRequest(message = '') {
  return hasAny(message, ['areia', 'higienica', 'higiênica'])
}

function isFoodProduct(product = {}) {
  return isCatalogType(product, 'racao')
  const haystack = norm([product.name, product.category, product.description].join(' '))
  return /(racao|ração|granel|alimento|premier|royal|golden|pedigree|whiskas|special dog|formula natural|gran plus|quatree)/.test(haystack)
}

function isRationProduct(product = {}) {
  return isCatalogType(product, 'racao')
  const haystack = norm([product.name, product.category, product.description].join(' '))
  if (/(petisco|bifinho|sache|sachê|snack|filezitos|bites|dental|osso|ossinho|shampoo|antipulga|advocate|bravecto|nexgard|simparic|areia|higienica|higiênica)/.test(haystack)) {
    return false
  }
  return /(racao|ração|granel|alimento)/.test(haystack)
    || (/(premier|royal|golden|pedigree|whiskas|special dog|formula natural|gran plus|quatree)/.test(haystack)
      && /\b(kg|adulto|filhote|castrad|racas|raças)\b/.test(haystack))
}

function isRationRequest(message = '', state = {}) {
  return hasAny(message, ['racao', 'ração', 'granel', 'alimento'])
    || state.productKind === 'food'
    || state.packagePreference === 'granel'
    || Boolean(state.packageKg)
}

function hasDogBreedProductText(haystack = '') {
  return /(shih tzu|shi tzu|shihtzu|yorkshire|lhasa|spitz|poodle|pinscher|bulldog|pug|maltes|maltês)/.test(haystack)
}

function isDogProductText(haystack = '') {
  return /\b(cao|caes|cachorro|canino|dog|canister|bifinho|ossinho)\b/.test(haystack)
    || hasDogBreedProductText(haystack)
}

function isCatProductText(haystack = '') {
  return /(gato|gatos|felino|cat|whiskas|kitekat)/.test(haystack)
}

function detectIntent(message = '', currentIntent = '') {
  const hasProductCore = hasAny(message, ['racao', 'ração', 'petisco', 'sache', 'sachê', 'areia', 'antipulga', 'shampoo', 'comprar', 'produto', 'estoque'])
  const hasProduct = hasAny(message, PRODUCT_HINTS)
  const hasServiceCore = hasAny(message, ['banho', 'banh', 'tosa', 'tosar', 'agendar', 'agenda'])
  const hasHygienicService = hasAny(message, ['higien']) && !hasAny(message, ['areia', 'tapete'])
  const hasService = hasServiceCore || hasHygienicService
  const hasVet = hasAny(message, VET_HINTS) || hasAny(message, URGENCY_HINTS)
  if ((currentIntent === 'banho_tosa' || currentIntent === 'veterinaria') && !hasProductCore && !hasService && !hasVet) {
    return currentIntent
  }
  if ((hasProductCore && (hasService || hasVet))) return 'multi'
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
  const normalizeCandidate = (value = '') => clean(value)
    .replace(/^(ue|ué|oxe|uai|opa|oi|ola|olá)\s+/i, '')
    .trim()
  if (state.awaiting === 'customer_name') {
    const first = normalizeCandidate(text.split(/[,.]/)[0].replace(/^(meu nome e|meu nome é|sou|eu sou|aqui e|aqui é)\s+/i, ''))
    if (isPlausibleName(first)) return titleName(first)
  }
  const explicit = text.match(/(?:meu nome e|meu nome é|sou|eu sou|aqui e|aqui é)\s+([A-Za-zÀ-ÿ'\s]{2,40})/i)
  if (explicit && isPlausibleName(normalizeCandidate(explicit[1]))) return titleName(normalizeCandidate(explicit[1]))
  const leadingNameWithIntent = text.match(/^([A-Za-zÀ-ÿ']{2,30})(?:,)?\s+(?:quero|queria|preciso|gostaria|comprar|vou)\b/i)
  if (leadingNameWithIntent && isPlausibleName(normalizeCandidate(leadingNameWithIntent[1]))) {
    return titleName(normalizeCandidate(leadingNameWithIntent[1]))
  }
  if (text.includes(',') && !lower.startsWith('oi,')) {
    const first = normalizeCandidate(text.split(',')[0])
    if (isPlausibleName(first)) return titleName(first)
  }
  const candidate = normalizeCandidate(text)
  if (!detectIntent(text) && isPlausibleName(candidate) && candidate.split(/\s+/).length <= 3) return titleName(candidate)
  return ''
}

function isPlausibleName(value = '') {
  const text = clean(value)
  if (text.length < 2 || text.length > 40) return false
  if (/\d/.test(text)) return false
  const lower = norm(text)
  if (/^(oi|ola|bom dia|boa tarde|boa noite)\b/.test(lower)) return false
  if (/(bom dia|boa tarde|boa noite)/.test(lower) && text.split(/\s+/).length <= 4) return false
  if (['oi', 'ola', 'olá', 'ue', 'ué', 'uai', 'oxe', 'bom dia', 'boa tarde', 'boa noite', 'quero racao', 'quero ração'].includes(lower)) return false
  if (hasAny(lower, [...PRODUCT_HINTS, ...SERVICE_HINTS, ...VET_HINTS])) return false
  if (/(manc|vomit|diarre|coce|espirr|tosse|dor|sangr|veneno|apatic|passando mal|nao come|não come)/.test(lower)) return false
  return true
}

function titleName(value = '') {
  return clean(value)
    .split(/\s+/)
    .map((part) => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part)
    .join(' ')
}

function isPlausiblePetName(value = '') {
  const text = clean(value).split(/\s+/)[0] || ''
  const lower = norm(text)
  if (!isPlausibleName(text)) return false
  if ([
    'meu',
    'minha',
    'pet',
    'cachorro',
    'cachorra',
    'cao',
    'gato',
    'gata',
    'porte',
    'pequeno',
    'medio',
    'grande',
    'adulto',
    'filhote',
    'semana',
    'amanha',
    'amanhã',
    'hoje',
    'quinta',
    'sexta',
    'sabado',
    'sábado',
  ].includes(lower)) return false
  if ([...DOG_BREEDS.keys()].some((breed) => norm(breed).split(/\s+/).includes(lower))) return false
  return true
}

function extractPetName(message = '', state) {
  const text = clean(message)
  if (!text) return ''
  const explicit = text.match(/(?:pet chama|nome dele e|nome dele é|nome dela e|nome dela é|chama)\s+([A-Za-zÀ-ÿ'\s]{2,30})/i)
  if (explicit) return titleName(explicit[1].split(/[,.]/)[0])
  const serviceLike = ['banho_tosa', 'veterinaria'].includes(state.intent) || hasAny(text, SERVICE_HINTS) || hasAny(text, VET_HINTS)
  if (serviceLike) {
    const afterPara = text.match(/(?:para|pra|pro)\s+(?:o|a)?\s*([A-Za-zÀ-ÿ']{2,24})(?=\s+(?:cachorro|cachorra|cao|cão|gato|gata|shih|golden|poodle|pinscher|spitz|pequeno|medio|médio|grande|com|que|esta|está|ta|tá)|[,.]|$)/i)
    if (afterPara && isPlausiblePetName(afterPara[1])) return titleName(afterPara[1])
  }
  if (state.awaiting === 'pet_name' || state.awaiting === 'pet_details' || state.awaiting === 'service_pet_details') {
    const firstToken = text.split(/\s+/)[0]
    if (isPlausiblePetName(firstToken) && /(cachorro|cachorra|cao|cão|gato|gata|pequeno|medio|médio|grande|shih|golden|poodle|pinscher|spitz|com|coce|manc|vomit|espirr)/i.test(text)) {
      return titleName(firstToken)
    }
    if (inferBreedAndSize(text).breed) {
      const firstWord = text.split(/\s+/)[0]
      if (isPlausiblePetName(firstWord)) return titleName(firstWord)
    }
    const first = text.split(/[,.]/)[0].trim()
    if (isPlausibleName(first) && first.split(/\s+/).length <= 2) return titleName(first)
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

function inferServiceType(message = '', intent = '') {
  const lower = norm(message)
  if (/(vacina|vacinacao)/.test(lower)) return 'Vacina'
  if (/(vet|vetrinario|veternario|veterinari|consulta|avaliacao|clinica|medico)/.test(lower)) {
    return intent === 'veterinaria' ? 'Consulta veterinária' : ''
  }
  const wantsBath = /\bbanh/.test(lower)
  const wantsGroom = /\btos|higien/.test(lower)
  if (wantsBath && wantsGroom) return 'Banho e tosa'
  if (wantsGroom && /higien/.test(lower)) return 'Tosa higiênica'
  if (wantsGroom) return 'Tosa'
  if (wantsBath) return 'Banho'
  return ''
}

function applyBathGroomingChoice(state, message = '') {
  if (state.intent !== 'banho_tosa' || state.awaiting !== 'grooming_confirmation') return false
  const lower = norm(message)
  if (!lower) return false

  if (/(sem tosa|so banho|só banho|apenas banho|banho somente)/.test(lower)) {
    state.serviceType = 'Banho'
    state.groomingChoiceConfirmed = true
    return true
  }
  if (/(higien|tosa higienica|tosa higiênica)/.test(lower)) {
    state.serviceType = 'Banho e tosa higiênica'
    state.groomingChoiceConfirmed = true
    return true
  }
  if (/(corpinho|corpo todo|tosa no corpo|tosa corpo|tosa completa)/.test(lower)) {
    state.serviceType = 'Banho e tosa'
    state.serviceGroomingDetail ||= 'Tosa no corpinho'
    state.groomingChoiceConfirmed = true
    return true
  }
  return false
}

function hasNoServiceNotes(message = '') {
  const lower = norm(message)
  return /^(sem obs|sem observacao|sem observacoes|sem nada|nada|nao|não|n|nenhuma|nenhum|nao tem|não tem|tudo certo|normal)\b/.test(lower)
}

function extractServiceNotes(message = '', state = {}) {
  const text = clean(message)
  const lower = norm(text)
  if (!text || hasNoServiceNotes(text)) return ''
  if (state.awaiting === 'service_notes') {
    if (detectPayment(text) || detectFulfillment(text)) return ''
    return text.slice(0, 160)
  }
  if (/(morde|bravo|agressiv|arisco|medo|alerg|sensivel|sensível|idoso|sem perfume|nao usar perfume|não usar perfume|perfume nao|perfume não|no pelo|nó no pelo|nos pelo|nós no pelo|embolad|machuc|ferid|pulga|carrapato)/.test(lower)) {
    return text.slice(0, 160)
  }
  return ''
}

function serviceNeedsGroomingDetail(state = {}) {
  return state.intent === 'banho_tosa' && /tosa|higien/.test(norm(state.serviceType))
}

function detectGroomingDetail(message = '', state = {}) {
  const text = clean(message)
  const lower = norm(text)
  if (!text) return ''

  const machine = lower.match(/\b(?:maquina|maquinha|lamina|lâmina|pente)?\s*([1357])\b/)
  if (machine && (state.awaiting === 'grooming_detail' || /(maquina|maquinha|lamina|lâmina|pente|tosa)/.test(lower))) {
    return `MÃ¡quina ${machine[1]}`
  }
  if (/(foto|imagem|referencia|referÃªncia|igual a foto|vou mandar)/.test(lower)) {
    return 'Foto/referÃªncia do cliente'
  }
  if (state.awaiting === 'grooming_detail' && text.length >= 2 && !detectPayment(text) && !detectFulfillment(text)) {
    return text.slice(0, 120)
  }
  return ''
}

function isUpsellCompatibilityObjection(message = '') {
  const lower = norm(message)
  return /(mas|so que|porém|porem|nao|não)/.test(lower)
    && /(filhote|adulto|gato|cachorro|castrado|senior|errado|nao serve|não serve)/.test(lower)
}

const WEEKDAY_INDEXES = [
  ['domingo', 0],
  ['segunda', 1],
  ['segunda feira', 1],
  ['terca', 2],
  ['terca feira', 2],
  ['terça', 2],
  ['terça feira', 2],
  ['quarta', 3],
  ['quarta feira', 3],
  ['quinta', 4],
  ['quinta feira', 4],
  ['sexta', 5],
  ['sexta feira', 5],
  ['sabado', 6],
  ['sábado', 6],
]

function parseServiceDatePreference(message = '') {
  const lower = norm(message)
  if (!lower) return ''
  if (/(qualquer dia|tanto faz o dia|dia tanto faz|sem preferencia de dia|sem preferência de dia)/.test(lower)) return 'any'
  if (/\bhoje\b/.test(lower)) return saoPauloTodayIso()
  if (/(depois de amanha|depois de amanhã)/.test(lower)) return addDaysIso(saoPauloTodayIso(), 2)
  if (/\bamanha\b|\bamanhã\b/.test(lower)) return addDaysIso(saoPauloTodayIso(), 1)

  const iso = lower.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const brDate = lower.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/)
  if (brDate) return isoFromBrazilianDate(brDate[1], brDate[2], brDate[3] || '')

  const today = saoPauloTodayIso()
  const todayWeekday = new Date(`${today}T12:00:00-03:00`).getDay()
  const wantsNextWeek = /(semana que vem|proxima semana|próxima semana)/.test(lower)
  for (const [label, target] of WEEKDAY_INDEXES) {
    if (!new RegExp(`\\b${label}\\b`).test(lower)) continue
    const rawDelta = (target - todayWeekday + 7) % 7
    const delta = wantsNextWeek || /que vem|proxim[ao]|próxim[ao]/.test(lower)
      ? rawDelta + (rawDelta === 0 ? 7 : 0)
      : rawDelta
    return addDaysIso(today, delta)
  }
  return ''
}

function parseServiceTimePreference(message = '', awaiting = '') {
  const lower = norm(message)
  if (!lower) return null
  if (/(qualquer horario|qualquer horário|qualquer hora|tanto faz|sem preferencia|sem preferência|nao tenho preferencia|não tenho preferência)/.test(lower)) {
    return { period: 'any', exact: '' }
  }
  if (awaiting === 'service_time_preference' && isNegative(message)) return { period: 'any', exact: '' }
  if (/(quais horarios|quais horários|horarios tem|horários tem|tem horario|tem horário)/.test(lower)) {
    return { period: 'any', exact: '' }
  }

  const exactMatches = [...lower.matchAll(/\b(?:as|às|pelas|por volta de|perto de|umas)?\s*([01]?\d|2[0-3])(?:\s*(?:h|horas?)|:([0-5]\d))\b/g)]
  const exactMatch = exactMatches.find((match) => {
    const start = match.index || 0
    const end = start + match[0].length
    const previous = lower[start - 1] || ''
    const next = lower[end] || ''
    return !['/', '.', '-'].includes(previous) && !['/', '.', '-'].includes(next)
  })
  if (exactMatch) {
    const hour = exactMatch[1].padStart(2, '0')
    const minute = (exactMatch[2] || '00').padStart(2, '0')
    return { period: 'specific', exact: `${hour}:${minute}` }
  }

  if (/fim da tarde|final da tarde/.test(lower)) return { period: 'late_afternoon', exact: '' }
  if (/\bmanha\b|\bmanhã\b/.test(lower)) return { period: 'morning', exact: '' }
  if (/\btarde\b/.test(lower)) return { period: 'afternoon', exact: '' }
  if (/\bnoite\b/.test(lower)) return { period: 'evening', exact: '' }
  return null
}

function applyServiceSchedulePreference(state, message = '') {
  if (!['banho_tosa', 'veterinaria'].includes(state.intent)) return state
  const date = parseServiceDatePreference(message)
  if (date) {
    state.serviceDate = date
    state.selectedSlot = null
    state.slotOptions = []
  }
  const time = parseServiceTimePreference(message, state.awaiting)
  if (time) {
    state.serviceTimePreference = time.period
    state.servicePreferredTime = time.exact
    if (state.awaiting !== 'slot_choice') {
      state.selectedSlot = null
      state.slotOptions = []
    }
  }
  return state
}

function parseChangeFor(message = '') {
  const lower = norm(message)
  if (lower.includes('sem troco') || lower.includes('nao precisa') || lower.includes('não precisa')) return 0
  const match = clean(message).match(/(?:para|pra)?\s*r?\$?\s*(\d+(?:[,.]\d{1,2})?)/i)
  return match ? Number(match[1].replace(',', '.')) : null
}

function parseProductQuantity(message = '') {
  const lower = norm(message)
  const withUnit = lower.match(/\b(\d{1,2})\s*(sacos?|pacotes?|unidades?|unid|desse|dessa|desses|dessas)\b/)
  if (withUnit) return Math.max(1, Math.min(99, Number(withUnit[1])))
  return null
}

function isBulkProduct(product = {}) {
  return classifyProduct(product).isBulk
  const item = product || {}
  const haystack = norm([item.name, item.category].join(' '))
  return /\bgranel\b/.test(haystack) || /\ba granel\b/.test(haystack)
}

function parseBulkKgQuantity(message = '', product = null) {
  const lower = norm(message)
  if (!isBulkProduct(product) && !/\bgranel\b/.test(lower)) return null
  if (/(saco|pacote|fechado|embalagem)/.test(lower) && !/\bgranel\b/.test(lower)) return null
  if (/\b(meio|meia)\s*(?:kg|quilo|quilos)\b/.test(lower)) return 0.5
  const match = lower.match(/\b(\d{1,2}(?:[,.]\d{1,2})?)\s*(?:kg|quilo|quilos)\b/)
  const wordMatch = lower.match(/\b(um|uma|dois|duas|tres|três|quatro|cinco)\s*(?:kg|quilo|quilos)\b/)
  const wordNumbers = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, três: 3, quatro: 4, cinco: 5 }
  if (!match && !wordMatch) return null
  const quantity = match ? Number(match[1].replace(',', '.')) : wordNumbers[wordMatch[1]]
  if (!Number.isFinite(quantity) || quantity <= 0) return null
  return Math.max(0.1, Math.min(99, quantity))
}

function parseSelectedProductQuantity(message = '', product = null) {
  return parseBulkKgQuantity(message, product) || parseProductQuantity(message)
}

function hasProductQuantitySignal(message = '') {
  const lower = norm(message)
  if (/\b(meio|meia)\s*(?:kg|quilo|quilos)\b/.test(lower)) return true
  return /\b\d{1,2}(?:[,.]\d{1,2})?\s*(?:kg|quilo|quilos|sacos?|pacotes?|unidades?|unid)\b/.test(lower)
    || /\b(?:um|uma|dois|duas|tres|três|quatro|cinco)\s*(?:kg|quilo|quilos|sacos?|pacotes?|unidades?)\b/.test(lower)
}

function shouldTreatKgAsBulkQuantity(message = '', state = {}) {
  const lower = norm(message)
  return state.packagePreference === 'granel'
    && requestedPackageKgFromMessage(message)
    && !/(saco|pacote|fechado|embalagem)/.test(lower)
}

function isCriticalVeterinaryMessage(message = '') {
  const lower = norm(message)
  if (hasAny(lower, CRITICAL_URGENCY_HINTS)) return true
  if (/vomit.*(muito|sangue|sem parar|forte)/.test(lower)) return true
  if (/(nao|não)\s+(levanta|anda|responde)/.test(lower)) return true
  if (/(muito|bem)\s+apatic/.test(lower)) return true
  return false
}

function resetOrderProgressForIntentChange(state, nextIntent) {
  state.selectedProduct = null
  state.productOptions = []
  state.selectedSlot = null
  state.slotOptions = []
  state.serviceType = ''
  state.serviceGroomingDetail = ''
  state.serviceNotes = ''
  state.serviceNotesAsked = false
  state.serviceDate = ''
  state.serviceTimePreference = ''
  state.servicePreferredTime = ''
  state.serviceTransport = defaultServiceTransport()
  state.upsell = defaultUpsell()
  state.payment = defaultPayment()
  state.fulfillment = defaultFulfillment()
  state.totals = defaultTotals()
  state.partialSummaryShown = false
  state.finalSummaryShown = false
  state.saved = false
  state.awaiting = ''
  state.confirmationKey = ''
  if (nextIntent === 'produto') state.symptom = ''
  if (nextIntent !== 'produto') {
    state.brand = ''
    state.brandPreferenceAny = false
    state.brandPreferenceAsked = false
    state.productKind = ''
    state.packagePreference = ''
    state.packageKg = null
    state.packagePreferenceAny = false
    state.packagePreferenceAsked = false
    state.pendingQuantity = null
  }
}

function updateAddressFromMessage(state, message = '') {
  const text = clean(message)
  const lower = norm(text)
  if (!text) return

  const looksLikeStreet = /(rua|avenida|av\.|av |alameda|travessa|praça|praca|rodovia|estrada)/i.test(text)
  if (looksLikeStreet || (state.awaiting === 'delivery_address' && !state.fulfillment.address)) {
    state.fulfillment.address = text
  }

  if (state.awaiting === 'delivery_address' && state.fulfillment.address && !looksLikeStreet) {
    const parts = text.split(',').map(clean).filter(Boolean)
    if (!state.fulfillment.neighborhood && parts[0]) {
      state.fulfillment.neighborhood = parts[0].replace(/^bairro\s+/i, '')
    }
    if (!state.fulfillment.reference && parts.length >= 2) {
      state.fulfillment.reference = parts.slice(1).join(', ')
    }
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

function updateServiceTransportAddressFromMessage(state, message = '') {
  const text = clean(message)
  const lower = norm(text)
  if (!text) return
  state.serviceTransport ||= defaultServiceTransport()

  const looksLikeStreet = /(rua|avenida|av\.|av |alameda|travessa|praÃ§a|praca|rodovia|estrada)/i.test(text)
  if (looksLikeStreet || (state.awaiting === 'service_transport_address' && !state.serviceTransport.address)) {
    state.serviceTransport.address = text
  }

  if (state.awaiting === 'service_transport_address' && state.serviceTransport.address && !looksLikeStreet) {
    const parts = text.split(',').map(clean).filter(Boolean)
    if (!state.serviceTransport.neighborhood && parts[0]) {
      state.serviceTransport.neighborhood = parts[0].replace(/^bairro\s+/i, '')
    }
    if (!state.serviceTransport.reference && parts.length >= 2) {
      state.serviceTransport.reference = parts.slice(1).join(', ')
    }
  }

  const bairroMatch = text.match(/bairro\s+([^,.-]+)/i)
  if (bairroMatch) state.serviceTransport.neighborhood = clean(bairroMatch[1])
  if (!state.serviceTransport.neighborhood && text.split(',').length >= 3) {
    state.serviceTransport.neighborhood = clean(text.split(',')[2])
  }

  const refMatch = text.match(/(?:referencia|referÃªncia|perto|proximo|prÃ³ximo|ao lado|em frente)\s*(?:de|da|do|ao|a)?\s*([^,.]+)/i)
  if (refMatch) state.serviceTransport.reference = clean(refMatch[0])

  if (!state.serviceTransport.reference && (lower.includes('perto') || lower.includes('lado') || lower.includes('frente'))) {
    state.serviceTransport.reference = text
  }
}

function missingServiceTransportAddressFields(state) {
  const missing = []
  const address = clean(state.serviceTransport?.address)
  if (!address || !/\d/.test(address)) missing.push('rua e nÃºmero')
  if (!clean(state.serviceTransport?.neighborhood)) missing.push('bairro')
  if (!clean(state.serviceTransport?.reference)) missing.push('ponto de referÃªncia')
  return missing
}

function productSnapshot(product, upsell = false) {
  if (!product) return null
  const catalog = classifyProduct(product)
  return {
    product_id: clean(product.id),
    name: clean(product.name),
    category: clean(product.category),
    catalog_type: catalog.type,
    package_kg: catalog.packageKg,
    is_bulk: Boolean(catalog.isBulk),
    image_url: clean(product.image_url),
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

function requestedWeightKgFromMessage(message = '') {
  const match = norm(message).match(/\b(\d{1,2})(?:\s*kg|kg)\b/)
  return match ? Number(match[1]) : null
}

function requestedPackageKgFromMessage(message = '') {
  const lower = norm(message)
  if (!/(saco|pacote|kg|quilo|quilos)/.test(lower)) return null
  const match = lower.match(/\b(\d{1,2})\s?kg\b/)
  return match ? Number(match[1]) : null
}

function inferPackagePreference(message = '') {
  const lower = norm(message)
  const kg = requestedPackageKgFromMessage(message)
  if (kg) return { packagePreference: `${kg}kg`, packageKg: kg, any: false }
  if (/(granel|a granel)/.test(lower)) return { packagePreference: 'granel', packageKg: null, any: false }
  if (/(pacote pequeno|pacotinho|1\s?kg|um kg|1 quilo)/.test(lower)) return { packagePreference: '1kg', packageKg: 1, any: false }
  if (/(saco fechado|saco grande|saco|fechado)/.test(lower)) return { packagePreference: 'saco fechado', packageKg: null, any: false }
  if (/(sem preferencia|sem preferência|tanto faz|qualquer embalagem|qualquer pacote|pode ser qualquer|a que tiver)/.test(lower)) {
    return { packagePreference: '', packageKg: null, any: true }
  }
  return null
}

function valueAppearsInMessage(message = '', value = '') {
  const source = norm(message)
  const target = norm(value)
  if (!source || !target) return false
  return source.includes(target)
}

function isPlausibleAddressDetail(value = '') {
  const lower = norm(value)
  if (!lower || lower.length < 2) return false
  return !/(^ola$|bom dia|boa tarde|boa noite|racao|ração|premier|golden|shih|tzu|produto|banho|veterin|pix|cartao|cartão|dinheiro|entrega|retirada)/.test(lower)
}

function hasServiceDateSignal(message = '') {
  return Boolean(parseServiceDatePreference(message))
}

function hasServiceTimeSignal(message = '') {
  return Boolean(parseServiceTimePreference(message))
}

function applyInterpretedFacts(state, facts = {}, currentMessage = '') {
  if (!facts || typeof facts !== 'object') return

  const interpretedName = clean(facts.customer_name || facts.customerName)
  if (interpretedName && !state.nameConfirmed && isPlausibleName(interpretedName)) {
    state.customerName = titleName(interpretedName)
    state.nameConfirmed = true
  }

  const nextIntent = clean(facts.intent)
  if (nextIntent && ['produto', 'banho_tosa', 'veterinaria', 'multi'].includes(nextIntent)) {
    if (state.intent && state.intent !== nextIntent) resetOrderProgressForIntentChange(state, nextIntent)
    state.intent = nextIntent
  }

  const interpretedSpecies = normalizeSpecies(facts.species)
  if (interpretedSpecies === 'dog' || interpretedSpecies === 'cat') state.species = interpretedSpecies

  const interpretedBreed = clean(facts.breed)
  if (interpretedBreed) {
    state.breed = normalizeBreedLabel(interpretedBreed)
    const breedInfo = inferBreedAndSize(interpretedBreed)
    if (breedInfo.breed) {
      state.breed = breedInfo.breed
      state.species ||= 'dog'
      state.size ||= breedInfo.size
    }
  }

  const interpretedSize = clean(facts.size)
  if (['pequeno', 'medio', 'grande'].includes(norm(interpretedSize))) state.size = norm(interpretedSize)

  const interpretedAge = clean(facts.age_category || facts.ageCategory)
  if (['filhote', 'adulto', 'castrado', 'senior'].includes(norm(interpretedAge))) state.ageCategory = norm(interpretedAge)

  const interpretedPetName = clean(facts.pet_name || facts.petName)
  if (interpretedPetName && !state.petName && isPlausiblePetName(interpretedPetName)) {
    state.petName = titleName(interpretedPetName)
  }

  const productKind = clean(facts.product_kind || facts.productKind)
  if (['food', 'flea', 'litter', 'specific'].includes(productKind) && state.intent === 'produto') {
    state.productKind = productKind
  }

  const brand = clean(facts.brand)
  if (brand && state.intent === 'produto') {
    state.brand = brand
    state.brandPreferenceAny = false
    state.brandPreferenceAsked = true
  }

  const packagePreference = clean(facts.package_preference || facts.packagePreference)
  const packageKg = Number(facts.package_kg ?? facts.packageKg)
  const hasPackageSignal = Boolean(
    (inferPackagePreference(currentMessage) || requestedPackageKgFromMessage(currentMessage))
      && isFoodPreferenceContext(currentMessage, state),
  )
  if ((packagePreference || Number.isFinite(packageKg))
    && state.intent === 'produto'
    && (state.awaiting === 'food_preferences' || hasPackageSignal)) {
    const kgFromMessage = requestedPackageKgFromMessage(currentMessage)
    const kgCandidate = Number.isFinite(packageKg) ? packageKg : kgFromMessage
    if (Number.isFinite(kgCandidate) && shouldTreatKgAsBulkQuantity(currentMessage, state)) {
      state.pendingQuantity = kgCandidate
      state.packagePreference = 'granel'
      state.packageKg = null
      state.packagePreferenceAny = false
      state.packagePreferenceAsked = true
    } else {
      state.packagePreference = packagePreference || `${packageKg}kg`
      state.packageKg = Number.isFinite(packageKg) ? packageKg : null
      state.packagePreferenceAny = false
      state.packagePreferenceAsked = true
    }
  }

  const quantity = Number(facts.quantity)
  const bulkQuantity = isBulkProduct(state.selectedProduct) && Number.isFinite(packageKg) ? packageKg : null
  const nextQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : bulkQuantity
  if (Number.isFinite(nextQuantity) && nextQuantity > 0 && state.intent === 'produto' && hasProductQuantitySignal(currentMessage)) {
    if (state.selectedProduct && state.awaiting !== 'product_choice') state.selectedProduct.quantity = nextQuantity
    else state.pendingQuantity = nextQuantity
  }

  const serviceType = clean(facts.service_type || facts.serviceType)
  if (serviceType && ['banho_tosa', 'veterinaria'].includes(state.intent)) state.serviceType = serviceType

  const serviceNotes = clean(facts.service_notes || facts.serviceNotes)
  if (serviceNotes && state.intent === 'banho_tosa') {
    state.serviceNotes = serviceNotes.slice(0, 160)
    state.serviceNotesAsked = true
  }

  const groomingDetail = clean(facts.service_grooming_detail || facts.serviceGroomingDetail)
  if (groomingDetail && state.intent === 'banho_tosa') {
    state.serviceGroomingDetail = groomingDetail.slice(0, 120)
  }

  const serviceDate = clean(facts.service_date || facts.serviceDate || facts.appointment_date || facts.appointmentDate || facts.preferred_date || facts.preferredDate)
  if (serviceDate
    && ['banho_tosa', 'veterinaria'].includes(state.intent)
    && (state.awaiting === 'service_date' || hasServiceDateSignal(currentMessage))) {
    applyServiceSchedulePreference(state, serviceDate)
  }
  const serviceTimePreference = clean(facts.service_time_preference || facts.serviceTimePreference || facts.time_preference || facts.timePreference || facts.preferred_time || facts.preferredTime)
  if (serviceTimePreference
    && ['banho_tosa', 'veterinaria'].includes(state.intent)
    && (state.awaiting === 'service_time_preference' || hasServiceTimeSignal(currentMessage))) {
    applyServiceSchedulePreference(state, serviceTimePreference)
  }

  const symptom = clean(facts.symptom)
  if (symptom && state.intent === 'veterinaria') state.symptom = symptom.slice(0, 160)

  const payment = detectPayment(facts.payment_method || facts.payment)
  if (payment && state.intent === 'produto') state.payment.method = payment

  const fulfillment = detectFulfillment(facts.fulfillment_type || facts.fulfillmentType)
  if (fulfillment && state.intent === 'produto') state.fulfillment.type = fulfillment

  const canApplyAddressFacts = state.intent === 'produto'
    && (state.awaiting === 'delivery_address' || state.fulfillment.type === 'entrega')
  const address = clean(facts.delivery_address || facts.deliveryAddress)
  if (address && canApplyAddressFacts && valueAppearsInMessage(currentMessage, address)) updateAddressFromMessage(state, address)

  const neighborhood = clean(facts.neighborhood)
  if (canApplyAddressFacts && neighborhood && isPlausibleAddressDetail(neighborhood) && valueAppearsInMessage(currentMessage, neighborhood)) {
    state.fulfillment.neighborhood = neighborhood
  }

  const city = clean(facts.city)
  if (canApplyAddressFacts && city && isPlausibleAddressDetail(city) && valueAppearsInMessage(currentMessage, city)) {
    state.fulfillment.city = city
  }

  const reference = clean(facts.reference)
  if (canApplyAddressFacts && reference && isPlausibleAddressDetail(reference) && valueAppearsInMessage(currentMessage, reference)) {
    state.fulfillment.reference = reference
  }
}

function normalizeBreedLabel(value = '') {
  const lower = norm(value)
  if (['shi tzu', 'shih tzu', 'shihtzu', 'shitzu'].includes(lower)) return 'Shih Tzu'
  return clean(value)
}

function productPackageMatches(product, packageKg) {
  if (!packageKg) return false
  return productPackageKgScore(product, packageKg) > 0
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
  const raw = norm(product?.name || '').replace(/,/g, '.')
  const compact = raw.replace(/\s+/g, '')
  const spaced = new RegExp(`\\b${packageKg}\\s*kg\\b`)
  if (spaced.test(raw) || compact.includes(`${packageKg}kg`)) return 24
  return -14
}

function scoreProduct(product, state, message) {
  const haystack = norm([product.name, product.category].join(' '))
  let score = 0
  const wantsFlea = isFleaRequest(message)
  const wantsLitter = isLitterRequest(message)
  const weightKg = requestedWeightKgFromMessage(message)
  const packageKg = shouldTreatKgAsBulkQuantity(message, state) ? state.packageKg : requestedPackageKgFromMessage(message) || state.packageKg
  const wantsFood = isFoodRequest(message, state) || state.productKind === 'food' || Boolean(packageKg && state.intent === 'produto')
  if (state.species === 'dog' && isCatProductText(haystack)) score -= 45
  if (state.species === 'cat' && isDogProductText(haystack)) score -= 45
  const queryTerms = tokenizeForScore(message, state.brand, state.breed, state.size, state.ageCategory, state.species === 'dog' ? 'cao cachorro' : '', state.species === 'cat' ? 'gato' : '')
  for (const term of queryTerms) {
    if (haystack.includes(term)) score += 3
  }
  if (state.intent === 'produto' && /(racao|ração)/.test(norm(message)) && /racao|ração/.test(haystack)) score += 5
  if (wantsFood && /(racao|ração|alimento|premier|royal|golden|pedigree|whiskas|special dog|formula natural|gran plus|quatree)/.test(haystack)) score += 8
  if (wantsFood && /(canister|shampoo|areia|antipulga|pulga|bravecto|nexgard|simparic|sabonete|molho|sorvete|sache|sachê|petisco|bifinho)/.test(haystack)) score -= 25
  const fleaRequest = wantsFlea || state.productKind === 'flea'
  const litterRequest = wantsLitter || state.productKind === 'litter'
  if (fleaRequest && /(antipulga|anti pulga|pulga|carrapato|bravecto|nexgard|simparic|credeli|coleira contra|matacura)/.test(haystack)) score += 16
  if (fleaRequest && !/(antipulga|anti pulga|pulga|carrapato|bravecto|nexgard|simparic|credeli|coleira contra|matacura)/.test(haystack)) score -= 18
  if (fleaRequest && /(bravecto|nexgard|simparic|credeli)/.test(haystack)) score += 20
  if (fleaRequest && /(shampoo|sabonete|spray|talco|coleira|matacura)/.test(haystack) && (weightKg || state.size)) score -= 12
  if (fleaRequest && weightKg) score += productWeightRangeScore(product, weightKg)
  if (litterRequest && /(areia|higienica|higiênica|pa higienica)/.test(haystack)) score += 14
  if (litterRequest && !/(areia|higienica|higiênica|pa higienica)/.test(haystack)) score -= 25
  if (wantsFood && packageKg) score += productPackageKgScore(product, packageKg)
  if (wantsFood && state.packagePreference === 'granel' && /granel/.test(haystack)) score += 16
  if (wantsFood && state.packagePreference === 'granel' && !/granel/.test(haystack)) score -= 8
  if (wantsFood && state.packagePreference === 'saco fechado' && /granel/.test(haystack)) score -= 12
  if (state.species === 'dog' && /\b(cao|cachorro|canino|caes)\b/.test(haystack)) score += 4
  if (state.species === 'cat' && /(gato|gatos|felino)/.test(haystack)) score += 4
  if (state.ageCategory && haystack.includes(norm(state.ageCategory))) score += 4
  if (state.breed && haystack.includes(norm(state.breed))) score += 8
  if (!state.breed && hasDogBreedProductText(haystack)) score -= 10
  if (state.size && haystack.includes(norm(state.size))) score += 3
  if (state.brand && haystack.includes(norm(state.brand))) score += 8
  if (state.brand && !haystack.includes(norm(state.brand))) score -= 3
  if (/canister/.test(haystack) && /(racao|ração)/.test(norm(message))) score -= 8
  return score
}

function rankProducts(products, state, message) {
  const catalogRequest = detectCatalogRequest(message, state)
  const ranked = rankCatalogProducts(products, state, message)
    .filter((item) => hasEnoughStockForState(item.product, state))
    .map((item) => ({ product: item.product, score: item.score, metadata: item.metadata }))
  if (ranked.length) return ranked
  if (catalogRequest.type) return []
  const foodRequest = isFoodPreferenceContext(message, state)
  const rationRequest = isRationRequest(message, state)
  return availableProducts(products)
    .filter((product) => hasEnoughStockForState(product, state))
    .filter((product) => !rationRequest || isRationProduct(product))
    .filter((product) => rationRequest || !foodRequest || isFoodProduct(product))
    .map((product) => ({ product, score: scoreProduct(product, state, message) }))
    .sort((a, b) => b.score - a.score || Number(a.product.price || 0) - Number(b.product.price || 0))
}

function chooseProductFromOptions(state, message) {
  const options = state.productOptions || []
  if (!options.length) return null
  const lower = norm(message)
  if (options.length === 1 && isAffirmative(message)) {
    if (hasProductQuantitySignal(message)) {
      const optionText = norm([options[0].name, options[0].category].join(' '))
      const identityTerms = tokenizeForScore(message)
        .filter((term) => !CHOICE_STOP_WORDS.has(term))
        .filter((term) => !/^\d+$/.test(term))
        .filter((term) => !['kg', 'quilo', 'quilos', 'meio', 'meia'].includes(term))
      if (!identityTerms.some((term) => optionText.includes(term))) return null
    }
    return options[0]
  }
  const ordinal = lower.match(/\b(primeir[ao]|1|segunda|segund[ao]|2|terceir[ao]|3)\b/)
  if (ordinal) {
    if (['primeira', 'primeiro', '1'].includes(ordinal[1])) return options[0]
    if (['segunda', 'segundo', '2'].includes(ordinal[1])) return options[1]
    if (['terceira', 'terceiro', '3'].includes(ordinal[1])) return options[2]
  }
  return options.find((option) => {
    const name = norm(option.name)
    const terms = tokenizeForScore(message).filter((term) => !CHOICE_STOP_WORDS.has(term))
    return terms.length > 0 && terms.some((term) => name.includes(term) || norm(option.category).includes(term))
  }) || null
}

function selectProductFromChoice(state, product, message) {
  if (!product) return false
  const quantity = parseSelectedProductQuantity(message, product) || state.pendingQuantity
  const requestedQuantity = Number(quantity || product.quantity || 1)
  if (Number.isFinite(requestedQuantity)
    && requestedQuantity > 0
    && Number(product.stock_quantity || 0) < requestedQuantity) {
    addBlockedReason(state, 'estoque_insuficiente_quantidade')
    state.selectedProduct = null
    state.productOptions = []
    return false
  }
  state.selectedProduct = product
  if (quantity) state.selectedProduct.quantity = quantity
  state.pendingQuantity = null
  return true
}

function isCompatibleUpsell(product = {}, state = {}) {
  const haystack = norm([product.name, product.category, product.description].join(' '))
  if (state.species === 'dog' && isCatProductText(haystack)) return false
  if (state.species === 'cat' && isDogProductText(haystack)) return false
  if (state.ageCategory === 'filhote') {
    if (/(adulto|adult|castrad|senior|idoso)/.test(haystack)) return false
    if (/(sache|sachê|petisco|bifinho|snack)/.test(haystack) && !/(filhote|puppy|junior)/.test(haystack)) return false
  }
  if (state.ageCategory === 'adulto' && /(filhote|puppy|junior)/.test(haystack)) return false
  if (state.ageCategory === 'castrado' && /(filhote|puppy|junior)/.test(haystack)) return false
  return true
}

function pickUpsell(products, state) {
  const selectedId = state.selectedProduct?.product_id
  const lowerSpecies = state.species
  const candidates = availableProducts(products)
    .filter((product) => clean(product.id) !== selectedId)
    .filter((product) => isCompatibleUpsell(product, state))
  const scored = candidates.map((product) => {
    const haystack = norm([product.name, product.category].join(' '))
    let score = 0
    if (lowerSpecies === 'dog' && isCatProductText(haystack)) score -= 25
    if (lowerSpecies === 'cat' && isDogProductText(haystack)) score -= 25
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

function serviceMatches(intent, appointment, requestedServiceType = '') {
  const service = norm(appointment?.service_type)
  const requested = norm(requestedServiceType)
  const isVetSlot = /(vet|veterinari|consulta|vacina|avaliacao|clinica|medico)/.test(service)
  const isBathSlot = /(banho|tosa|higien)/.test(service)

  if (intent === 'veterinaria') {
    if (!isVetSlot) return false
    if (/vacina/.test(requested)) return /vacina/.test(service)
    return true
  }

  if (isVetSlot || !isBathSlot) return false
  if (/tosa higien/.test(requested)) return /(higien|tosa)/.test(service)
  if (/tosa/.test(requested) && !/banho/.test(requested)) return /(tosa|higien)/.test(service)
  if (/banho/.test(requested) && /tosa/.test(requested)) return /(banho.*tosa|tosa.*banho|higien)/.test(service)
  if (/banho/.test(requested)) return /banho/.test(service)
  return true
}

function serviceDefaults(state = {}) {
  const requested = norm(state.serviceType)
  if (state.intent === 'veterinaria') {
    if (/vacina/.test(requested)) return { service_type: 'Vacina', price: 90 }
    return { service_type: 'Consulta veterinária', price: 120 }
  }
  if (/banho/.test(requested) && /tosa/.test(requested)) return { service_type: 'Banho e tosa', price: 120 }
  if (/tosa/.test(requested)) return { service_type: clean(state.serviceType) || 'Tosa', price: 80 }
  return { service_type: clean(state.serviceType) || 'Banho', price: 60 }
}

function slotDateIso(slot) {
  if (slot?.service_date) return String(slot.service_date).slice(0, 10)
  if (!slot?.scheduled_at) return ''
  return new Date(slot.scheduled_at).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

function slotTimeText(slot) {
  if (slot?.start_time) return String(slot.start_time).slice(0, 5)
  if (!slot?.scheduled_at) return ''
  return new Date(slot.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

function slotScheduledAt(slot) {
  if (slot?.scheduled_at) return slot.scheduled_at
  const date = slotDateIso(slot)
  const time = slotTimeText(slot)
  return date && time ? `${date}T${time}:00-03:00` : ''
}

function slotKey(slot) {
  return `${slotDateIso(slot)} ${slotTimeText(slot)}`
}

function slotDurationMs(slot = {}) {
  const minutes = Number(slot.duration_min || slot.durationMin || 60)
  return Math.max(15, Number.isFinite(minutes) ? minutes : 60) * 60 * 1000
}

function slotStartMs(slot = {}) {
  const scheduledAt = slotScheduledAt(slot)
  const time = scheduledAt ? new Date(scheduledAt).getTime() : NaN
  return Number.isFinite(time) ? time : null
}

function slotsOverlap(left = {}, right = {}) {
  const leftStart = slotStartMs(left)
  const rightStart = slotStartMs(right)
  if (leftStart === null || rightStart === null) return false
  return leftStart < rightStart + slotDurationMs(right)
    && rightStart < leftStart + slotDurationMs(left)
}

function buildVirtualSlots(state = {}, appointments = []) {
  const defaults = serviceDefaults(state)
  const dates = state.serviceDate && state.serviceDate !== 'any'
    ? [state.serviceDate]
    : Array.from({ length: 3 }, (_, index) => addDaysIso(saoPauloTodayIso(), index))
  const busyAppointments = (appointments || [])
    .filter((appointment) => BUSY_APPOINTMENT_STATUSES.has(norm(appointment?.status)))
  const explicitFreeSlots = availableAppointments(appointments)
  const explicitKeys = new Set(availableAppointments(appointments).map(slotKey).filter(Boolean))
  const now = Date.now()
  const times = Array.from({ length: 19 }, (_, index) => {
    const minutes = 8 * 60 + index * 30
    const hour = Math.floor(minutes / 60)
    const minute = minutes % 60
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  })
  const slots = []

  for (const date of dates) {
    for (const time of times) {
      const key = `${date} ${time}`
      const scheduledAt = `${date}T${time}:00-03:00`
      const candidate = {
        id: '',
        virtual: true,
        service_type: defaults.service_type,
        scheduled_at: scheduledAt,
        service_date: date,
        start_time: `${time}:00`,
        duration_min: 60,
        status: 'available',
        price: defaults.price,
      }
      if (new Date(scheduledAt).getTime() <= now + 15 * 60 * 1000) continue
      if (explicitKeys.has(key)) continue
      if (busyAppointments.some((appointment) => slotsOverlap(candidate, appointment))) continue
      if (explicitFreeSlots.some((slot) => slotsOverlap(candidate, slot))) continue
      slots.push(candidate)
    }
  }

  return slots
}

function slotMatchesDate(slot, serviceDate = '') {
  if (!serviceDate || serviceDate === 'any') return true
  return slotDateIso(slot) === serviceDate
}

function slotMatchesTimePreference(slot, state = {}) {
  const preference = clean(state.serviceTimePreference)
  if (!preference || preference === 'any') return true
  const time = slotTimeText(slot)
  const [hour] = time.split(':').map(Number)
  if (!Number.isFinite(hour)) return true
  if (preference === 'specific') return time === clean(state.servicePreferredTime)
  if (preference === 'morning') return hour >= 7 && hour < 12
  if (preference === 'afternoon') return hour >= 12 && hour < 18
  if (preference === 'late_afternoon') return hour >= 16 && hour < 19
  if (preference === 'evening') return hour >= 18 && hour < 22
  return true
}

function timeTextToMinutes(value = '') {
  const [hour, minute = '0'] = clean(value).split(':')
  const total = Number(hour) * 60 + Number(minute)
  return Number.isFinite(total) ? total : null
}

function scheduleLabel(state = {}) {
  const parts = []
  if (state.serviceDate && state.serviceDate !== 'any') {
    const date = new Date(`${state.serviceDate}T12:00:00-03:00`)
    parts.push(date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }))
  } else if (state.serviceDate === 'any') {
    parts.push('qualquer dia')
  }
  const periodLabels = {
    morning: 'de manhã',
    afternoon: 'à tarde',
    late_afternoon: 'no fim da tarde',
    evening: 'à noite',
    specific: state.servicePreferredTime ? `às ${state.servicePreferredTime}` : '',
    any: 'em qualquer horário',
  }
  const timeLabel = periodLabels[state.serviceTimePreference]
  if (timeLabel) parts.push(timeLabel)
  return parts.join(' ')
}

function formatSlot(slot) {
  const dateIso = slotDateIso(slot)
  const date = dateIso ? new Date(`${dateIso}T12:00:00-03:00`) : new Date(slot.scheduled_at)
  const day = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
  const time = slotTimeText(slot)
  const service = clean(slot.service_type) || 'Atendimento'
  const price = Number(slot.price || 0) > 0 ? ` - ${money(slot.price)}` : ''
  return `${day} às ${time} (${service})${price}`
}

function chooseSlotFromOptions(state, message) {
  const options = state.slotOptions || []
  if (!options.length) return null
  const lower = norm(message)
  const progressingWithOnlyOption = options.length === 1
    && (isAffirmative(message) || detectPayment(message) || /confirm|pode|fechar|fecha|ok|beleza|seguir/.test(lower))
    && !isNegative(message)
  if (progressingWithOnlyOption) return options[0]
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
      const slotTime = slotTimeText(slot)
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

function formatQuantity(value = 1) {
  const number = Number(value || 1)
  if (!Number.isFinite(number)) return '1'
  return Number.isInteger(number) ? String(number) : String(number).replace('.', ',')
}

function formatItemLabel(item) {
  const quantity = Number(item?.quantity || 1)
  if (isBulkProduct(item)) return `${formatQuantity(quantity)}kg ${item.name}`
  if (quantity > 1) return `${formatQuantity(quantity)}x ${item.name}`
  return item.name
}

function selectedProductPriceLine(state) {
  const item = state.selectedProduct
  const quantity = Number(item?.quantity || 1)
  const total = Number(item?.unit_price || 0) * quantity
  if (isBulkProduct(item)) return `${formatQuantity(quantity)}kg de ${item.name} ficam ${money(total)}.`
  if (quantity > 1) return `${formatQuantity(quantity)}x ${item.name} ficam ${money(total)}.`
  return `A ${item.name} fica ${money(item.unit_price)}.`
}

function recalcTotals(state, deliveryFee, petTransportFee = DEFAULT_PET_TRANSPORT_FEE) {
  const itemsSubtotal = selectedItems(state).reduce((sum, item) => sum + Number(item.quantity || 1) * Number(item.unit_price || 0), 0)
  const serviceSubtotal = state.selectedSlot ? Number(state.selectedSlot.price || 0) : 0
  const subtotal = state.intent === 'produto' ? itemsSubtotal : serviceSubtotal
  const delivery = state.intent === 'produto' && state.fulfillment.type === 'entrega' ? Number(deliveryFee ?? DEFAULT_DELIVERY_FEE) : 0
  const transport = state.intent === 'banho_tosa' && state.serviceTransport?.accepted
    ? Number(state.serviceTransport.fee || petTransportFee || DEFAULT_PET_TRANSPORT_FEE)
    : 0
  if (state.intent === 'banho_tosa' && state.serviceTransport?.accepted) {
    state.serviceTransport.fee = transport
  }
  state.totals = {
    subtotal,
    deliveryFee: delivery,
    serviceTransportFee: transport,
    total: subtotal + delivery + transport,
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
    lines.push(`• Produto: ${state.selectedProduct ? formatItemLabel(state.selectedProduct) : 'aguardando'}`)
  } else {
    lines.push(`• Serviço: ${state.serviceType || (state.intent === 'veterinaria' ? 'veterinária' : 'banho/tosa')}`)
    if (state.selectedSlot) lines.push(`• Horário: ${formatSlot(state.selectedSlot)}`)
    if (state.serviceGroomingDetail) lines.push(`• Acabamento: ${state.serviceGroomingDetail}`)
    if (state.serviceNotes) lines.push(`• Observação: ${state.serviceNotes}`)
    if (state.serviceTransport?.accepted) {
      lines.push(`• Transporte: sim (${money(state.totals.serviceTransportFee || state.serviceTransport.fee)})`)
    } else if (state.serviceTransport?.declined) {
      lines.push('• Transporte: não')
    }
  }
  lines.push(`• Extra: ${state.upsell.accepted && state.upsell.item ? state.upsell.item.name : 'não adicionado'}`)
  lines.push(`• Total parcial: ${money(state.totals.subtotal)}`)
  if (state.intent === 'produto') lines.push(`• Pagamento: ${state.payment.method || 'aguardando'}`)
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
      lines.push(`• Item: ${formatItemLabel(item)} - ${money(Number(item.unit_price || 0) * Number(item.quantity || 1))}`)
    })
    if (state.fulfillment.type === 'entrega') lines.push(`• Taxa de entrega: ${money(state.totals.deliveryFee)}`)
  } else {
    lines.push(`• Serviço: ${state.serviceType || (state.intent === 'veterinaria' ? 'veterinária' : 'banho/tosa')}`)
    if (state.selectedSlot) lines.push(`• Horário: ${formatSlot(state.selectedSlot)}`)
    if (state.serviceGroomingDetail) lines.push(`• Acabamento: ${state.serviceGroomingDetail}`)
    if (state.serviceNotes) lines.push(`• Observação: ${state.serviceNotes}`)
    if (state.serviceTransport?.accepted) {
      lines.push(`• Transporte: ${money(state.totals.serviceTransportFee || state.serviceTransport.fee)}`)
      lines.push(`• Buscar em: ${state.serviceTransport.address} - ${state.serviceTransport.neighborhood}${state.serviceTransport.reference ? ` (${state.serviceTransport.reference})` : ''}`)
    } else if (state.intent === 'banho_tosa') {
      lines.push('• Transporte: não')
    }
  }
  lines.push(`• Total: ${money(state.totals.total)}`)
  if (state.intent === 'produto') {
    lines.push(`• Pagamento: ${state.payment.method}${state.payment.method === 'dinheiro' && state.payment.changeFor ? `, troco para ${money(state.payment.changeFor)}` : ''}`)
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
      delivery_fee: state.totals.deliveryFee,
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
    scheduled_at: slotScheduledAt(state.selectedSlot),
    appointment_id: state.selectedSlot?.virtual ? '' : state.selectedSlot?.id,
    duration_min: Number(state.selectedSlot?.duration_min || 60),
    items: [{
      name: state.serviceType || (state.intent === 'veterinaria' ? 'Consulta veterinária' : 'Banho/tosa'),
      quantity: 1,
      unit_price: Number(state.selectedSlot?.price || 0),
      upsell: false,
    }],
    total: state.totals.total,
    payment_method: '',
    change_for: null,
    fulfillment_type: 'servico',
    service_transport_fee: state.serviceTransport?.accepted ? Number(state.totals.serviceTransportFee || state.serviceTransport.fee || 0) : 0,
    service_transport_mode: state.serviceTransport?.accepted ? state.serviceTransport.mode : '',
    service_transport_label: state.serviceTransport?.accepted ? state.serviceTransport.label : '',
    service_transport_address: state.serviceTransport?.accepted ? state.serviceTransport.address : '',
    service_transport_neighborhood: state.serviceTransport?.accepted ? state.serviceTransport.neighborhood : '',
    service_transport_city: state.serviceTransport?.accepted ? state.serviceTransport.city : '',
    service_transport_reference: state.serviceTransport?.accepted ? state.serviceTransport.reference : '',
    service_grooming_detail: state.serviceGroomingDetail,
    notes: [
      state.symptom ? `Sintoma: ${state.symptom}` : null,
      state.serviceGroomingDetail ? `Acabamento: ${state.serviceGroomingDetail}` : null,
      state.serviceNotes ? `Observação: ${state.serviceNotes}` : null,
      state.serviceTransport?.accepted ? `Transporte pet: ${money(state.totals.serviceTransportFee || state.serviceTransport.fee)} - ${state.serviceTransport.address} - ${state.serviceTransport.neighborhood}${state.serviceTransport.reference ? ` (${state.serviceTransport.reference})` : ''}` : null,
      `PetBot guard v${PETBOT_VERSION}`,
    ].filter(Boolean).join(' | '),
  }
}

function applyMessageFacts(state, message, settings = {}) {
  const name = extractCustomerName(message, state)
  if (name && !state.nameConfirmed) {
    state.customerName = name
    state.nameConfirmed = true
  }

  const previousIntent = state.intent
  const intent = detectIntent(message, state.intent)
  if (intent && previousIntent && intent !== previousIntent) {
    resetOrderProgressForIntentChange(state, intent)
  }
  if (intent) state.intent = intent

  const serviceType = inferServiceType(message, state.intent)
  if (serviceType && ['banho_tosa', 'veterinaria'].includes(state.intent)) {
    state.serviceType = serviceType
  }

  applyBathGroomingChoice(state, message)

  if (state.intent === 'produto') {
    if (isFleaRequest(message)) state.productKind = 'flea'
    else if (isLitterRequest(message)) state.productKind = 'litter'
    else if (isFoodRequest(message, state)) state.productKind = 'food'
    else if (isSpecificNonFoodProductRequest(message) && !state.productKind) state.productKind = 'specific'
  }

  const species = inferSpecies(message)
  if (species) state.species = species

  const breedInfo = inferBreedAndSize(message)
  if (breedInfo.breed) {
    state.breed = breedInfo.breed
    state.species ||= 'dog'
    state.size ||= breedInfo.size
  }

  const size = inferSize(message)
  if (size && !(state.species === 'cat' && requestedPackageKgFromMessage(message))) state.size = size

  const age = inferAge(message)
  if (age) state.ageCategory = age

  const brand = inferBrand(message)
  if (brand) {
    state.brand = brand
    state.brandPreferenceAny = false
    state.brandPreferenceAsked = true
  } else if (state.awaiting === 'food_preferences' && (hasNoBrandPreference(message) || isNegative(message))) {
    state.brandPreferenceAny = true
    state.brandPreferenceAsked = true
  }

  const packagePreference = isFoodPreferenceContext(message, state) ? inferPackagePreference(message) : null
  if (packagePreference) {
    if (shouldTreatKgAsBulkQuantity(message, state)) {
      state.pendingQuantity = packagePreference.packageKg
      state.packagePreference = 'granel'
      state.packageKg = null
      state.packagePreferenceAny = false
      state.packagePreferenceAsked = true
    } else {
      state.packagePreference = packagePreference.packagePreference
      state.packageKg = packagePreference.packageKg
      state.packagePreferenceAny = Boolean(packagePreference.any)
      state.packagePreferenceAsked = true
    }
  } else if (state.awaiting === 'food_preferences' && (hasNoBrandPreference(message) || isNegative(message))) {
    state.packagePreferenceAny = true
    state.packagePreferenceAsked = true
  }

  const petName = extractPetName(message, state)
  if (petName && !state.petName) state.petName = petName

  const symptom = extractSymptom(message)
  if (state.intent === 'veterinaria') {
    if (symptom) state.symptom = symptom
    else if (state.serviceType === 'Vacina' && /vacina/.test(norm(message))) state.symptom = 'Vacina'
    else if (state.awaiting === 'symptom' && clean(message) && !detectPayment(message) && !detectFulfillment(message)) {
      state.symptom = clean(message).slice(0, 120)
    }
  }

  if (state.intent === 'banho_tosa') {
    const groomingDetail = detectGroomingDetail(message, state)
    if (groomingDetail && serviceNeedsGroomingDetail(state)) {
      state.serviceGroomingDetail = groomingDetail
    }
    if (hasNoServiceNotes(message) && state.awaiting === 'service_notes') {
      state.serviceNotes = ''
      state.serviceNotesAsked = true
    } else {
      const serviceNotes = extractServiceNotes(message, state)
      if (serviceNotes) {
        state.serviceNotes = serviceNotes
        state.serviceNotesAsked = true
      }
    }
  }

  applyServiceSchedulePreference(state, message)

  const payment = detectPayment(message)
  if (payment && state.intent === 'produto') state.payment.method = payment

  const fulfillment = detectFulfillment(message)
  if (fulfillment && state.intent === 'produto') state.fulfillment.type = fulfillment

  if (state.intent === 'banho_tosa' && state.awaiting === 'service_transport') {
    state.serviceTransport ||= defaultServiceTransport()
    state.serviceTransport.offered = true
    const transportOption = inferTransportOption(message, settings)
    if (transportOption) {
      applyTransportOption(state, transportOption)
    } else if (isNegative(message)) {
      state.serviceTransport.accepted = false
      state.serviceTransport.declined = true
    } else if (isAffirmative(message) && normalizeTransportOptions(settings).length === 1) {
      applyTransportOption(state, normalizeTransportOptions(settings)[0])
    }
  }

  const quantity = parseSelectedProductQuantity(message, state.selectedProduct)
  if (quantity && state.intent === 'produto') {
    if (state.selectedProduct && state.awaiting !== 'product_choice') {
      state.selectedProduct.quantity = quantity
    } else {
      state.pendingQuantity = quantity
    }
  }

  if (state.payment.method === 'dinheiro' && state.payment.changeAsked) {
    const changeFor = parseChangeFor(message)
    if (changeFor !== null) state.payment.changeFor = changeFor
  }

  updateAddressFromMessage(state, message)
  if (state.intent === 'banho_tosa' && state.serviceTransport?.accepted) {
    updateServiceTransportAddressFromMessage(state, message)
  }
  return state
}

function actionFromState(state, fallback = 'responder_controlado') {
  if (state.status === 'awaiting_rating') return 'pedir_avaliacao'
  if (state.status === 'human_requested') return 'handoff_humano'
  if (state.status === 'cancelado') return 'cancelar'
  if (state.awaiting && AWAITING_ACTIONS[state.awaiting]) return AWAITING_ACTIONS[state.awaiting]
  if (state.finalSummaryShown && !state.saved) return 'aguardar_confirmacao'
  return fallback
}

function compactProduct(item) {
  if (!item) return null
  return {
    product_id: clean(item.product_id || item.id),
    name: clean(item.name),
    category: clean(item.category),
    image_url: clean(item.image_url),
    quantity: Number(item.quantity || 1),
    unit_price: Number(item.unit_price ?? item.price ?? 0),
    stock_quantity: Number(item.stock_quantity || 0),
    upsell: Boolean(item.upsell),
  }
}

function compactSlot(slot) {
  if (!slot) return null
  return {
    id: clean(slot.id),
    service_type: clean(slot.service_type),
    scheduled_at: slot.scheduled_at,
    service_date: slot.service_date,
    start_time: slot.start_time,
    virtual: Boolean(slot.virtual),
    duration_min: Number(slot.duration_min || 60),
    price: Number(slot.price || 0),
    label: formatSlot(slot),
  }
}

function buildAllowedData(state) {
  return {
    customer_name: state.customerName,
    pet: {
      name: state.petName,
      species: state.species,
      size: state.size,
      breed: state.breed,
      age_category: state.ageCategory,
      symptom: state.symptom,
    },
    intent: state.intent,
    product_kind: state.productKind,
    brand: state.brand,
    brand_preference_any: Boolean(state.brandPreferenceAny),
    package_preference: state.packagePreference,
    package_kg: state.packageKg,
    package_preference_any: Boolean(state.packagePreferenceAny),
    pending_quantity: state.pendingQuantity,
    service_type: state.serviceType,
    service_grooming_detail: state.serviceGroomingDetail,
    service_notes: state.serviceNotes,
    service_date: state.serviceDate,
    service_time_preference: state.serviceTimePreference,
    service_preferred_time: state.servicePreferredTime,
    selected_product: compactProduct(state.selectedProduct),
    product_options: (state.productOptions || []).map(compactProduct).filter(Boolean),
    selected_slot: compactSlot(state.selectedSlot),
    slot_options: (state.slotOptions || []).map(compactSlot).filter(Boolean),
    upsell: {
      offered: Boolean(state.upsell.offered),
      resolved: Boolean(state.upsell.resolved),
      accepted: Boolean(state.upsell.accepted),
      item: compactProduct(state.upsell.item),
    },
    payment: { ...state.payment },
    fulfillment: { ...state.fulfillment },
    service_transport: { ...state.serviceTransport },
    totals: { ...state.totals },
  }
}

function buildGuardDirective(action, fallbackReply, state, extra = {}) {
  const hasStructuredSummary = /\*\*(Pedido em andamento|Resumo do pedido):\*\*/i.test(clean(fallbackReply))
  const allowLlm = LLM_REDRAFT_ALLOWED_ACTIONS.has(action) && !hasStructuredSummary && !extra.shouldSaveOrder && !extra.shouldSaveRating
  return {
    version: PETBOT_VERSION,
    action,
    allowLlmRedraft: allowLlm,
    critical: Boolean(hasStructuredSummary || extra.needsHuman || extra.shouldSaveOrder || extra.shouldSaveRating || ['oferecer_produtos', 'oferecer_horarios', 'resumo_final', 'aguardar_confirmacao'].includes(action)),
    fallbackReply,
    blockedReasons: state.blockedReasons || [],
    allowedData: buildAllowedData(state),
    forbidden: [
      'inventar_produto_preco_estoque_horario',
      'confirmar_pedido_sem_resumo_final',
      'alterar_total_sem_recalculo',
      'aplicar_desconto',
      'pedir_dado_ja_confirmado',
      'oferecer_mais_de_um_upsell',
    ],
  }
}

function normalizePriceToken(value = '') {
  return norm(value).replace(/\s+/g, ' ')
}

function allowedPriceTokens(directive = {}) {
  const tokens = new Set()
  const fallbackPrices = clean(directive.fallbackReply).match(/R\$\s*\d+(?:[,.]\d{1,2})?/g) || []
  fallbackPrices.forEach((price) => tokens.add(normalizePriceToken(price)))

  const data = directive.allowedData || {}
  ;[data.totals?.subtotal, data.totals?.deliveryFee, data.totals?.total].forEach((value) => {
    if (Number(value || 0) > 0) tokens.add(normalizePriceToken(money(value)))
  })
  ;[data.selected_product, data.upsell?.item, ...(data.product_options || [])].filter(Boolean).forEach((item) => {
    if (Number(item.unit_price || 0) > 0) tokens.add(normalizePriceToken(money(item.unit_price)))
  })
  ;[data.selected_slot, ...(data.slot_options || [])].filter(Boolean).forEach((slot) => {
    if (Number(slot.price || 0) > 0) tokens.add(normalizePriceToken(money(slot.price)))
  })
  return tokens
}

export function validatePetbotDraft(draft = '', directive = {}) {
  const text = clean(draft)
  const action = clean(directive.action)
  const lower = norm(text)
  const problems = []

  if (!text) problems.push('resposta_vazia')
  if (/(pedido|agendamento)\s+confirmado/.test(lower) && !['pedido_salvo', 'pedir_avaliacao'].includes(action)) {
    problems.push('confirmacao_nao_autorizada')
  }
  if (/(fechado|separad|finalizad)/.test(lower) && !['aguardar_confirmacao', 'pedido_salvo', 'pedir_avaliacao'].includes(action)) {
    problems.push('fechamento_nao_autorizado')
  }
  if (/(desconto|consigo fazer por|faco por|faço por)/.test(lower) && action !== 'recusar_desconto') {
    problems.push('desconto_nao_autorizado')
  }
  if (action === 'recusar_desconto') {
    if (!/infelizmente nao conseguimos aplicar desconto/.test(lower)) problems.push('recusa_desconto_ausente')
    if (/(consigo fazer por|faco por|faço por|baixo para|abaixo para)/.test(lower)) problems.push('desconto_concedido')
  }
  if (action === 'pedir_nome' && (/R\$\s*\d/.test(text) || /(tenho|opcoes|opções|produto)/i.test(text))) {
    problems.push('pulou_nome')
  }
  if (action === 'pedir_pagamento' && !/(pix|dinheiro|cartao|cartão)/.test(lower)) {
    problems.push('pergunta_pagamento_ausente')
  }
  if (action === 'pedir_troco' && !/troco/.test(lower)) {
    problems.push('pergunta_troco_ausente')
  }
  if (action === 'pedir_entrega_retirada' && !/(entrega|retirada|retirar|loja)/.test(lower)) {
    problems.push('pergunta_entrega_retirada_ausente')
  }
  if (action !== 'oferecer_upsell' && /(quer adicionar|posso incluir|incluo|adicionar mais)/.test(lower)) {
    problems.push('upsell_nao_autorizado')
  }
  if (!['pedir_endereco', 'pedir_endereco_transporte_pet', 'resumo_final', 'aguardar_confirmacao'].includes(action) && /(rua|avenida|bairro|ponto de referencia|ponto de referência)/.test(lower)) {
    problems.push('endereco_nao_autorizado')
  }
  if (directive.allowLlmRedraft && text.split('\n').length > 7) {
    problems.push('resposta_longa')
  }

  const allowedPrices = allowedPriceTokens(directive)
  const mentionedPrices = text.match(/R\$\s*\d+(?:[,.]\d{1,2})?/g) || []
  for (const price of mentionedPrices) {
    if (!allowedPrices.has(normalizePriceToken(price))) problems.push('preco_nao_autorizado')
  }

  return {
    ok: problems.length === 0,
    problems: [...new Set(problems)],
  }
}

export function renderGuardedPetbotReply(draft = '', directive = {}) {
  const validation = validatePetbotDraft(draft, directive)
  return {
    reply: validation.ok ? clean(draft) : clean(directive.fallbackReply),
    validation,
  }
}

function guardResult(reply, state, extra = {}) {
  const action = extra.action || actionFromState(state)
  const guardDirective = extra.guardDirective || buildGuardDirective(action, reply, state, extra)
  state.lastAction = action
  return {
    handled: true,
    reply,
    state,
    intent: state.intent || 'geral',
    action,
    guardDirective,
    directive: guardDirective,
    blockedReasons: state.blockedReasons || [],
    ...extra,
  }
}

function ask(reply, state, awaiting, reason) {
  state.awaiting = awaiting
  state.lastQuestion = awaiting
  if (reason) addBlockedReason(state, reason)
  return guardResult(reply, state)
}

function presentProducts(state, products, message) {
  const ranked = rankProducts(products, state, message)
  const strong = ranked.filter((item) => item.score > 0).slice(0, 3)
  const options = (strong.length ? strong : ranked.slice(0, 3)).map((item) => productSnapshot(item.product))
  state.productOptions = options.filter(Boolean)
  state.awaiting = 'product_choice'

  if (!state.productOptions.length) {
    addBlockedReason(state, 'estoque_ausente')
    return guardResult('Consultei aqui e não encontrei produto disponível com esses dados. Quer que eu chame um atendente para te ajudar?', state, { action: 'sem_estoque' })
  }

  const hasRequestedBrand = Boolean(state.brand)
  const hasBrandMatch = !hasRequestedBrand || state.productOptions.some((product) => norm(product.name).includes(norm(state.brand)))
  if (hasRequestedBrand && !hasBrandMatch) {
    addBlockedReason(state, 'marca_sem_estoque')
  }
  const hasRequestedPackage = Boolean(state.packageKg)
  const hasPackageMatch = !hasRequestedPackage || state.productOptions.some((product) => productPackageMatches(product, state.packageKg))
  if (hasRequestedPackage && !hasPackageMatch) {
    addBlockedReason(state, 'embalagem_sem_estoque')
  }
  const intro = strong.length && hasBrandMatch && hasPackageMatch
    ? 'Consultei o estoque e tenho essas opções:'
    : hasRequestedPackage && !hasPackageMatch
      ? `Infelizmente não tenho essa embalagem de ${state.packageKg}kg no estoque, mas tenho essas alternativas:`
      : 'Não encontrei exatamente o que você pediu, mas tenho essas alternativas com estoque:'
  const lines = state.productOptions.map((product, index) => `${index + 1}. ${product.name} - ${money(product.unit_price)}${product.image_url ? ' (tem foto)' : ''}`)
  return guardResult(`${intro}\n${lines.join('\n')}\n\nQual prefere?`, state, { action: 'oferecer_produtos' })
}

function sendProductImage(state) {
  const product = state.selectedProduct
  const imageUrl = clean(product?.image_url)
  if (!product) {
    return guardResult('Me fala qual produto você quer ver a foto primeiro?', state, { action: 'pedir_produto_para_foto' })
  }

  if (!imageUrl) {
    addBlockedReason(state, 'foto_produto_ausente')
    return guardResult(`Ainda não tenho foto aprovada da ${product.name} no cadastro. Posso seguir com as informações do produto?`, state, { action: 'foto_produto_ausente' })
  }

  return guardResult(`Claro, essa é a foto aprovada da ${product.name}.`, state, {
    action: 'enviar_foto_produto',
    mediaMessages: [{
      type: 'image',
      imageUrl,
      caption: `${product.name} - ${money(product.unit_price)}`,
    }],
  })
}

function presentSlots(state, appointments) {
  const explicitServiceSlots = availableAppointments(appointments)
    .filter((appointment) => serviceMatches(state.intent, appointment, state.serviceType))
  const serviceSlots = explicitServiceSlots.length
    ? explicitServiceSlots
    : buildVirtualSlots(state, appointments).filter((slot) => serviceMatches(state.intent, slot, state.serviceType))
  const dateSlots = serviceSlots.filter((slot) => slotMatchesDate(slot, state.serviceDate))
  const preferredSlots = dateSlots.filter((slot) => slotMatchesTimePreference(slot, state))
  const requestedMinutes = state.serviceTimePreference === 'specific' ? timeTextToMinutes(state.servicePreferredTime) : null
  const nearbyDateSlots = requestedMinutes === null
    ? dateSlots
    : [...dateSlots].sort((a, b) => {
      const distanceA = Math.abs((timeTextToMinutes(slotTimeText(a)) ?? requestedMinutes) - requestedMinutes)
      const distanceB = Math.abs((timeTextToMinutes(slotTimeText(b)) ?? requestedMinutes) - requestedMinutes)
      return distanceA - distanceB || String(slotScheduledAt(a)).localeCompare(String(slotScheduledAt(b)))
    })
  const chosenSlots = preferredSlots.length ? preferredSlots : nearbyDateSlots.length ? nearbyDateSlots : serviceSlots
  const slots = chosenSlots.slice(0, 3)
  state.slotOptions = slots.map((slot) => ({
    id: clean(slot.id),
    service_type: clean(slot.service_type),
    scheduled_at: slot.scheduled_at,
    service_date: slot.service_date,
    start_time: slot.start_time,
    virtual: Boolean(slot.virtual),
    duration_min: Number(slot.duration_min || 60),
    price: Number(slot.price || 0),
  }))
  state.awaiting = 'slot_choice'

  if (!state.slotOptions.length) {
    addBlockedReason(state, 'sem_horario_real')
    const target = state.intent === 'veterinaria' ? 'a veterinária' : 'um atendente'
    return guardResult(`Consultei a agenda e não achei horário disponível agora. Quer que eu chame ${target} para ver outros horários?`, state, { action: 'sem_horario' })
  }

  const lines = state.slotOptions.map((slot, index) => `${index + 1}. ${formatSlot(slot)}`)
  const requested = scheduleLabel(state)
  const dateOnly = state.serviceDate && state.serviceDate !== 'any'
    ? new Date(`${state.serviceDate}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
    : state.serviceDate === 'any'
      ? 'os próximos dias'
      : 'os próximos horários'
  const intro = requested && preferredSlots.length
    ? `Consultei a agenda para ${requested} e tenho:`
    : requested && dateSlots.length
      ? `Não achei nesse horário exato, mas para ${dateOnly} tenho:`
      : requested
        ? `Não achei para ${requested}, mas tenho estes próximos horários:`
        : 'Consultei a agenda e tenho:'
  return guardResult(`${intro}\n${lines.join('\n')}\n\nQual horário prefere?`, state, { action: 'oferecer_horarios' })
}

function serviceFlow(state, message, appointments, settings) {
  if (state.intent === 'banho_tosa' && !state.serviceType) {
    return ask('É banho, tosa ou banho e tosa?', state, 'service_type', 'tipo_servico_pendente')
  }
  if (state.intent === 'banho_tosa' && state.species === 'cat') {
    return handoffToHuman(state, 'Para banho/tosa de gato, vou chamar um atendente para avaliar com cuidado e combinar o melhor atendimento.', 'banho_tosa_gato_atendente')
  }
  if (state.intent === 'banho_tosa' && !state.groomingChoiceConfirmed) {
    return ask('Você quer o banho com a tosa higiênica mesmo ou tosa no corpinho?', state, 'grooming_confirmation', 'confirmacao_tosa_pendente')
  }
  if (!state.petName) {
    return ask('Perfeito. Qual o nome do pet?', state, 'pet_name', 'pet_nome_pendente')
  }
  if (!state.species) {
    return ask('Ele é cachorro ou gato?', state, 'species', 'especie_pendente')
  }
  if (state.intent === 'banho_tosa' && state.species === 'cat') {
    return handoffToHuman(state, 'Para banho/tosa de gato, vou chamar um atendente para avaliar com cuidado e combinar o melhor atendimento.', 'banho_tosa_gato_atendente')
  }
  if (state.intent === 'banho_tosa' && !state.size && !state.breed) {
    return ask('Qual o porte ou raça dele?', state, 'service_pet_details', 'porte_pendente')
  }
  if (state.intent === 'veterinaria' && !state.symptom) {
    return ask('Qual é o problema principal dele?', state, 'symptom', 'sintoma_pendente')
  }
  if (serviceNeedsGroomingDetail(state) && !state.serviceGroomingDetail) {
    return ask('Como você quer a tosa? Pode me dizer máquina 1, 3, 5 ou 7, ou enviar uma foto de referência.', state, 'grooming_detail', 'acabamento_tosa_pendente')
  }
  if (state.intent === 'banho_tosa' && !state.serviceNotesAsked && !state.serviceNotes) {
    return ask('Alguma observação para banho/tosa? Ex: alergia, nós no pelo, bravo ou sem perfume. Se não tiver, me fala "sem observação".', state, 'service_notes', 'observacao_servico_pendente')
  }
  if (!state.serviceDate) {
    return ask('Para qual dia você quer agendar?', state, 'service_date', 'dia_agendamento_pendente')
  }
  if (!state.serviceTimePreference) {
    return ask('Tem preferência de horário? Pode ser manhã, tarde ou um horário específico.', state, 'service_time_preference', 'preferencia_horario_pendente')
  }

  const chosenSlot = chooseSlotFromOptions(state, message)
  if (chosenSlot) state.selectedSlot = chosenSlot

  if (!state.selectedSlot) return presentSlots(state, appointments)
  if (Number(state.selectedSlot.price || 0) <= 0) {
    addBlockedReason(state, 'preco_servico_ausente')
    const target = state.intent === 'veterinaria' ? 'a veterinária' : 'um atendente'
    return guardResult(`Tenho esse horário, mas o valor não está confirmado no sistema. Vou chamar ${target} para fechar certinho.`, state, {
      needsHuman: true,
      action: 'handoff_humano',
      handoffTarget: state.intent === 'veterinaria' ? 'veterinaria' : 'atendente',
    })
  }

  state.serviceType = state.selectedSlot.service_type || (state.intent === 'veterinaria' ? 'veterinária' : 'banho/tosa')
  state.upsell.resolved = true
  recalcTotals(state, settings.deliveryFee, settings.petTransportFee)

  if (state.intent === 'banho_tosa' && !state.serviceTransport?.offered) {
    state.partialSummaryShown = true
    state.serviceTransport ||= defaultServiceTransport()
    state.serviceTransport.offered = true
    const firstTransport = normalizeTransportOptions(settings)[0]
    state.serviceTransport.fee = Number(firstTransport?.fee ?? settings.petTransportFee ?? DEFAULT_PET_TRANSPORT_FEE)
    recalcTotals(state, settings.deliveryFee, settings.petTransportFee)
    return ask(`${buildPartialSummary(state)}\n\n${buildTransportQuestion(settings)}`, state, 'service_transport', 'transporte_pet_pendente')
  }

  if (state.intent === 'banho_tosa' && state.serviceTransport?.offered && !state.serviceTransport.accepted && !state.serviceTransport.declined) {
    return ask(buildTransportQuestion(settings), state, 'service_transport', 'transporte_pet_pendente')
  }

  if (state.intent === 'banho_tosa' && state.serviceTransport?.accepted) {
    const missing = missingServiceTransportAddressFields(state)
    if (missing.length) {
      state.serviceTransport.fee = Number(state.serviceTransport.fee || settings.petTransportFee || DEFAULT_PET_TRANSPORT_FEE)
      recalcTotals(state, settings.deliveryFee, settings.petTransportFee)
      return ask(`Perfeito. Para o MotoDog, me passa ${missing.join(', ')}.`, state, 'service_transport_address', 'endereco_transporte_incompleto')
    }
  }

  if (!state.partialSummaryShown) {
    state.partialSummaryShown = true
  }
  return checkoutFlow(state, settings)
}

function checkoutFlow(state, settings) {
  recalcTotals(state, settings.deliveryFee, settings.petTransportFee)

  if (state.intent !== 'produto') {
    if (!state.finalSummaryShown) {
      state.finalSummaryShown = true
      state.status = 'resumo_final'
      return guardResult(buildFinalSummary(state), state, { action: 'resumo_final' })
    }
    return guardResult('Só preciso da sua confirmação para finalizar.', state, { action: 'aguardar_confirmacao' })
  }

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
        const feeText = state.fulfillment.deliveryFeeInformed
          ? 'Para entrega'
          : `Cobramos ${money(settings.deliveryFee ?? DEFAULT_DELIVERY_FEE)} para entregar. Tudo bem?`
        state.fulfillment.deliveryFeeInformed = true
        return ask(`${feeText}\n\nMe passa ${missing.join(', ')}.`, state, 'delivery_address', 'endereco_incompleto')
      }
    }
  }

  if (!state.finalSummaryShown) {
    state.finalSummaryShown = true
    state.status = 'resumo_final'
    return guardResult(buildFinalSummary(state), state, { action: 'resumo_final' })
  }

  return guardResult('Só preciso da sua confirmação para finalizar.', state, { action: 'aguardar_confirmacao' })
}

function needsFoodPreferences(state) {
  if (state.intent !== 'produto' || state.productKind !== 'food' || state.selectedProduct) return false
  if (state.brandPreferenceAsked || state.packagePreferenceAsked) return false
  const hasBrandSignal = Boolean(state.brand || state.brandPreferenceAny)
  const hasPackageSignal = Boolean(state.packagePreference || state.packageKg || state.packagePreferenceAny)
  return !hasBrandSignal && !hasPackageSignal
}

function askFoodPreferences(state) {
  state.brandPreferenceAsked = true
  state.packagePreferenceAsked = true
  return ask(
    'Para a ração, você prefere granel ou saco fechado?\n\nSe tiver preferência de marca, pode me dizer junto. Para saco fechado, também pode informar 7kg, 15kg ou 20kg.',
    state,
    'food_preferences',
    'preferencia_racao_pendente',
  )
}

function productFlow(state, message, products, settings) {
  // The sale format changes the catalog and quantity semantics, so establish
  // it before the pet triage whenever the customer asks for ração.
  if (!availableProducts(products).length) return presentProducts(state, products, message)
  if (needsFoodPreferences(state)) return askFoodPreferences(state)

  if (!state.species) {
    return ask('É para cachorro ou gato?', state, 'species', 'especie_pendente')
  }
  const earlyChosen = chooseProductFromOptions(state, message)
  if (earlyChosen) {
    if (!selectProductFromChoice(state, earlyChosen, message)) {
      return presentProducts(state, products, message)
    }
  }
  if (!state.selectedProduct && !(state.productOptions || []).length && !state.ageCategory && isFoodRequest(message, state)) {
    if (state.species === 'cat') {
      return ask('Seu gato é filhote, adulto ou castrado?', state, 'pet_category', 'categoria_pendente')
    }
    return ask('Ele é adulto ou filhote?', state, 'pet_category', 'categoria_pendente')
  }
  if (!state.selectedProduct && !state.size && !state.ageCategory) {
    if (isFleaRequest(message)) {
      return ask('Qual o peso ou porte dele?', state, 'pet_category', 'categoria_pendente')
    }
    if (isSpecificNonFoodProductRequest(message)) {
      return presentProducts(state, products, message)
    }
    if (state.species === 'cat') {
      return ask('Seu gato é filhote, adulto ou castrado?', state, 'pet_category', 'categoria_pendente')
    }
    return ask('Ele é filhote, adulto ou qual porte/raça?', state, 'pet_category', 'categoria_pendente')
  }

  const chosen = !state.selectedProduct ? chooseProductFromOptions(state, message) : null
  if (chosen) {
    if (!selectProductFromChoice(state, chosen, message)) {
      return presentProducts(state, products, message)
    }
  }

  if (wantsProductImage(message)) {
    if (!state.selectedProduct && (state.productOptions || []).length === 1) {
      state.selectedProduct = state.productOptions[0]
    }
    if (!state.selectedProduct && (state.productOptions || []).length > 1) {
      return guardResult('Claro. Qual opção você quer ver a foto?', state, { action: 'pedir_produto_para_foto' })
    }
    if (state.selectedProduct) return sendProductImage(state)
  }

  if (!state.selectedProduct) return presentProducts(state, products, message)

  if (!state.upsell.offered) {
    const upsell = pickUpsell(products, state)
    state.upsell.offered = true
    state.upsell.item = upsell
    if (upsell) {
      state.awaiting = 'upsell'
      return guardResult(`${selectedProductPriceLine(state)}\n\nPosso incluir ${upsell.name} por ${money(upsell.unit_price)}? Quer adicionar?`, state, { action: 'oferecer_upsell' })
    }
    state.upsell.resolved = true
  }

  if (state.awaiting === 'upsell') {
    if (isNegative(message) || isUpsellCompatibilityObjection(message)) {
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
    return guardResult(`${selectedProductPriceLine(state)}\n\nQuer adicionar ${state.upsell.item?.name || 'um complemento'}?`, state, { action: 'oferecer_upsell' })
  }

  recalcTotals(state, settings.deliveryFee, settings.petTransportFee)

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
  if (!state.selectedProduct && !(state.productOptions || []).length) {
    if (state.awaiting === 'pet_category') {
      return 'Infelizmente não conseguimos aplicar desconto nesse pedido.\n\nPara eu te mostrar uma opção correta do estoque, me confirma se é adulto ou filhote?'
    }
    return 'Infelizmente não conseguimos aplicar desconto nesse pedido.\n\nPosso te mostrar uma opção mais econômica assim que eu confirmar o produto certo.'
  }
  const optionPool = state.productOptions?.length
    ? state.productOptions
    : availableProducts(products).map((product) => productSnapshot(product)).filter(Boolean)
  const desiredCategory = norm(state.selectedProduct?.category || optionPool[0]?.category || '')
  const cheap = optionPool
    .filter((product) => clean(product.product_id || product.id) !== state.selectedProduct?.product_id)
    .filter((product) => !desiredCategory || norm(product.category).includes(desiredCategory) || desiredCategory.includes(norm(product.category)))
    .sort((a, b) => Number(a.unit_price ?? a.price ?? 0) - Number(b.unit_price ?? b.price ?? 0))[0]

  if (!cheap) return 'Infelizmente não conseguimos aplicar desconto nesse pedido.'
  const option = cheap.product_id ? cheap : productSnapshot(cheap)
  state.productOptions = [option].filter(Boolean)
  state.awaiting = 'product_choice'
  return `Infelizmente não conseguimos aplicar desconto nesse pedido.\n\nPosso te mostrar uma opção mais econômica: ${option.name} por ${money(option.unit_price)}. Quer seguir com ela?`
}

function wantsContinueWithoutDiscount(message = '') {
  const lower = norm(message)
  return /sem desconto/.test(lower) && /(nao|não|pode|seguir|continua|mesmo produto|esse mesmo)/.test(lower)
}

function handoffToHuman(state, reply, reason) {
  state.status = 'human_requested'
  state.awaiting = 'human'
  addBlockedReason(state, reason)
  const handoffTarget = state.intent === 'veterinaria' || String(reason || '').includes('veterinaria')
    ? 'veterinaria'
    : 'atendente'
  return guardResult(reply, state, { needsHuman: true, action: 'handoff_humano', handoffTarget })
}

export function runPetbotGuard({
  message,
  session = {},
  customer = {},
  products = [],
  appointments = [],
  settings = {},
  interpretation = null,
} = {}) {
  const trimmed = clean(message)
  const context = session.context || {}
  const state = hydrateFromCustomer(getPetbotState(context), session, customer)
  state.blockedReasons = []
  state.totals.deliveryFee = Number(settings.deliveryFee ?? DEFAULT_DELIVERY_FEE)
  state.totals.serviceTransportFee = state.serviceTransport?.accepted
    ? Number(state.serviceTransport.fee || settings.petTransportFee || DEFAULT_PET_TRANSPORT_FEE)
    : 0

  if (state.status === 'awaiting_rating') {
    const rating = trimmed.match(/^(10|[0-9])$/)
    if (rating) {
      state.status = 'closed'
      state.awaiting = ''
      state.csatScore = Number(rating[1])
      return guardResult('Obrigado pela avaliação! Atendimento finalizado por aqui. ✅', state, { shouldSaveRating: true, rating: Number(rating[1]) })
    }
  }

  applyInterpretedFacts(state, interpretation, trimmed)
  applyMessageFacts(state, trimmed, settings)

  if (interpretation?.wants_human || hasAny(trimmed, HUMAN_HINTS)) {
    const target = state.intent === 'veterinaria' ? 'a veterinária' : 'um atendente'
    return handoffToHuman(state, `Claro. Vou chamar ${target} para continuar com você por aqui.`, 'atendente_solicitado')
  }

  if (isCriticalVeterinaryMessage(trimmed)) {
    state.intent = 'veterinaria'
    state.symptom ||= trimmed.slice(0, 120)
    return handoffToHuman(state, 'Entendi. Esse caso precisa de atenção rápida. Vou chamar a veterinária para te orientar com cuidado.', 'veterinaria_sensivel')
  }

  if (isAffirmative(trimmed) && ['sem_estoque', 'sem_horario'].includes(state.lastAction)) {
    const target = state.intent === 'veterinaria' ? 'a veterinária' : 'um atendente'
    return handoffToHuman(state, `Perfeito. Vou chamar ${target} para verificar isso certinho com você.`, state.lastAction)
  }

  if (state.finalSummaryShown && !state.saved && (interpretation?.confirmation || isAffirmative(trimmed))) {
    recalcTotals(state, settings.deliveryFee, settings.petTransportFee)
    state.status = 'confirmando'
    state.confirmationKey = `${state.intent}:${state.customerName}:${state.totals.total}:${state.selectedProduct?.product_id || state.selectedSlot?.id || ''}`
    return guardResult('Perfeito, vou registrar agora.', state, { shouldSaveOrder: true, orderArgs: buildOrderArgs(state), action: 'confirmar_salvar' })
  }

  if (state.finalSummaryShown && !state.saved && (interpretation?.negation || isNegative(trimmed))) {
    state.status = 'cancelado'
    state.awaiting = ''
    addBlockedReason(state, 'confirmacao_recusada')
    return guardResult('Tudo bem, não vou finalizar esse pedido. Se quiser alterar algo, me diga o que prefere.', state, { action: 'cancelar' })
  }

  if (state.intent === 'produto' && state.selectedProduct && wantsContinueWithoutDiscount(trimmed)) {
    state.upsell.accepted = false
    state.upsell.resolved = true
  } else if (interpretation?.wants_discount || hasAny(trimmed, DISCOUNT_HINTS)) {
    return guardResult(maybeHandleDiscount(state, products), state, { action: 'recusar_desconto' })
  }

  if (state.intent === 'multi') {
    return ask('Consigo te ajudar com os dois. Vamos começar por produto ou por agendamento?', state, 'intent', 'fluxo_misto')
  }

  if (!state.nameConfirmed) {
    return ask(buildNamePrompt(trimmed), state, 'customer_name', 'nome_pendente')
  }

  if (!state.intent) {
    if (/taxa|entrega|delivery/i.test(trimmed)) {
      return guardResult(`Temos entrega sim. A taxa configurada é ${money(settings.deliveryFee ?? DEFAULT_DELIVERY_FEE)}.\n\nVocê quer produto, banho/tosa ou veterinária?`, state)
    }
    if (state.species && /(atendimento|atender|cuidar|ver meu|minha gata|meu gato)/i.test(trimmed)) {
      return ask(`Perfeito, ${state.customerName}. Seria veterinária, banho ou outro atendimento?`, state, 'intent', 'intencao_servico_ambigua')
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

export function buildPetbotConfirmationReply(state = {}, settings = {}) {
  const lines = ['Pedido confirmado! 🎉']
  const templates = settings.messageTemplates || settings.message_templates || {}
  const renderTemplate = (template, replacements = {}) => String(template || '')
    .replace(/\[([A-Z_]+)\]/g, (_, key) => replacements[key] ?? `[${key}]`)
  const isPix = norm(state.payment?.method) === 'pix'
  if (isPix) {
    const pixKey = clean(settings.pixKey || settings.pix_key)
    const holder = clean(settings.pixHolderName || settings.pix_holder_name)
    const rawTemplate = String(templates.payment_proof_request || '')
    const template = renderTemplate(rawTemplate, {
      PIX_KEY: pixKey || 'chave Pix informada pela equipe',
      PIX_TITULAR: holder,
      NOME: state.customerName || 'cliente',
    })
    const pixDetails = pixKey ? `Pagamento via Pix: ${pixKey}${holder ? ` (${holder})` : ''}.` : ''
    lines.push(template
      ? `${rawTemplate.includes('[PIX_KEY]') ? '' : `${pixDetails}\n`}${template}`.trim()
      : (pixKey
      ? `Pagamento via Pix: ${pixKey}${holder ? ` (${holder})` : ''}.\nAssim que puder, envie o comprovante para a equipe dar baixa.`
      : 'Pagamento via Pix combinado.\nAssim que puder, envie o comprovante para a equipe dar baixa.'))
  }

  const missing = Array.isArray(state.registrationChecklist?.missing)
    ? state.registrationChecklist.missing.filter(Boolean)
    : []
  if (missing.length) {
    const rawTemplate = String(templates.registration_checklist || '')
    const template = renderTemplate(rawTemplate, {
      NOME: state.customerName || 'cliente',
      CAMPOS: missing.map((item) => `â€¢ ${item}`).join('\n'),
    })
    lines.push(template
      ? `${template}${rawTemplate.includes('[CAMPOS]') ? '' : `\n${missing.map((item) => `• ${item}`).join('\n')}`}`
      : [
      'Para completar seu cadastro conosco, depois me envie:',
      ...missing.map((item) => `• ${item}`),
    ].join('\n'))
  }

  lines.push('De 0 a 10, como avalia o atendimento?')
  return lines.join('\n\n')
}

export function markPetbotOrderSaved(state, result = {}) {
  const next = getPetbotState({ petbot: state })
  next.saved = true
  next.status = 'awaiting_rating'
  next.awaiting = 'rating'
  next.finalSummaryShown = true
  if (next.petName && next.breed && Array.isArray(next.registrationChecklist?.missing)) {
    next.registrationChecklist.missing = next.registrationChecklist.missing.filter((item) => !/nome e raca do pet/i.test(item))
  }
  next.registrationChecklist.requested = Boolean(next.registrationChecklist?.missing?.length)
  if (norm(next.payment?.method) === 'pix') {
    next.paymentProof.status = 'aguardando_comprovante'
    next.paymentProof.requested = true
  }
  next.lastSaleId = clean(result.sale_id)
  next.lastOrderId = clean(result.order_id)
  next.lastAppointmentId = clean(result.appointment_id)
  return next
}

export function markPetbotOrderError(state, error) {
  const next = getPetbotState({ petbot: state })
  next.status = 'error'
  addBlockedReason(next, 'erro_salvamento')
  next.lastError = error instanceof Error ? error.message : clean(error)
  return next
}
