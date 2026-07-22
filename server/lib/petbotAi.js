import { classifyCommonPetBreed } from '../../shared/petbotBreedCatalog.js'

const DEFAULT_TEMPERATURE = 0.5
const DEFAULT_TIMEOUT_MS = 12_000

const INTENTS = new Set(['produto', 'banho_tosa', 'veterinaria', 'multi'])
const SPECIES = new Set(['dog', 'cat', 'other'])
const PRODUCT_KINDS = new Set(['food', 'flea', 'litter', 'specific'])
const PAYMENTS = new Set(['pix', 'dinheiro', 'cartao'])
const FULFILLMENTS = new Set(['entrega', 'retirada'])
const AGES = new Set(['filhote', 'adulto', 'castrado', 'senior'])
const SIZES = new Set(['pequeno', 'medio', 'grande'])
const SERVICE_TRANSPORT_MODES = new Set(['cliente_leva', 'motodog'])
const VETERINARY_RISKS = new Set(['none', 'urgent', 'emergency'])

function clean(value = '') {
  return String(value ?? '').trim()
}

function stripAccents(value = '') {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function norm(value = '') {
  return stripAccents(value).toLowerCase()
}

function clampNumber(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.min(max, Math.max(min, number))
}

function pickString(value, max = 120) {
  const text = clean(value)
  return text ? text.slice(0, max) : ''
}

function pickEnum(value, allowed) {
  const normalized = norm(value)
  return allowed.has(normalized) ? normalized : ''
}

function normalizeSpecies(value) {
  const normalized = norm(value)
  if (['dog', 'cao', 'caes', 'cachorro', 'cachorra', 'canino'].includes(normalized)) return 'dog'
  if (['cat', 'gato', 'gata', 'felino'].includes(normalized)) return 'cat'
  if (['other', 'outro', 'outra', 'ave', 'passaro', 'pássaro', 'coelho', 'roedor', 'reptil', 'réptil'].includes(normalized)) return 'other'
  return ''
}

function normalizePayment(value) {
  const normalized = norm(value)
  if (normalized.includes('pix')) return 'pix'
  if (normalized.includes('dinheiro')) return 'dinheiro'
  if (normalized.includes('cartao') || normalized.includes('credito') || normalized.includes('debito')) return 'cartao'
  return ''
}

function normalizeServiceTransportMode(value) {
  const normalized = norm(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (SERVICE_TRANSPORT_MODES.has(normalized)) return normalized
  if (/^(?:vou_levar|eu_levo|eu_vou_levar|vou_trazer|eu_trago|cliente_leva|tutor_leva)$/.test(normalized)) return 'cliente_leva'
  if (/(?:motodog|moto_dog|buscar|busca_e_leva)/.test(normalized)) return 'motodog'
  return ''
}

function normalizeBreed(value) {
  const text = pickString(value, 80)
  if (!text) return ''
  return classifyCommonPetBreed(text)?.canonical || text
}

function safeJsonParse(text = '') {
  const raw = clean(text)
  if (!raw) return null
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const source = fenced ? fenced[1] : raw
  try {
    return JSON.parse(source)
  } catch {
    const object = source.match(/\{[\s\S]*\}/)
    if (!object) return null
    try {
      return JSON.parse(object[0])
    } catch {
      return null
    }
  }
}

function compactHistory(history = []) {
  return (history || [])
    .slice(-8)
    .map((entry) => `${entry.role === 'assistant' ? 'Bot' : 'Cliente'}: ${clean(entry.content).slice(0, 240)}`)
    .filter(Boolean)
    .join('\n')
}

function compactState(state = {}) {
  const petbot = state?.petbot || state || {}
  const agentFacts = state?.petbot_agent?.facts
    || state?.petbot_agent?.explicit_facts
    || {}
  return {
    customer_name: petbot.customerName || '',
    intent: petbot.intent || '',
    awaiting: petbot.awaiting || '',
    pet_name: petbot.petName || agentFacts.pet_name || '',
    species: petbot.species || agentFacts.species || '',
    breed: petbot.breed || agentFacts.breed || '',
    size: petbot.size || '',
    weight_kg: petbot.weightKg || petbot.weight_kg || agentFacts.weight_kg || '',
    weight_label: agentFacts.weight_label || '',
    weight_estimated: Boolean(agentFacts.weight_estimated),
    coat_type: petbot.coatType || petbot.coat_type || agentFacts.coat_type || '',
    age_category: petbot.ageCategory || '',
    brand: petbot.brand || '',
    package_preference: petbot.packagePreference || '',
    service_date: petbot.serviceDate || agentFacts.service_date || '',
    service_time_preference: petbot.serviceTimePreference || agentFacts.service_time_preference || '',
    service_preferred_time: petbot.servicePreferredTime || agentFacts.service_preferred_time || '',
    service_grooming_detail: petbot.serviceGroomingDetail || '',
    service_notes: agentFacts.service_notes || '',
    service_notes_resolved: Boolean(agentFacts.service_notes_resolved),
    service_transport_mode: agentFacts.service_transport_mode || '',
    selected_product: petbot.selectedProduct?.name || '',
    selected_slot: petbot.selectedSlot?.label || petbot.selectedSlot?.scheduled_at || '',
    payment: petbot.payment?.method || '',
    fulfillment: petbot.fulfillment?.type || '',
    final_summary_shown: Boolean(petbot.finalSummaryShown),
  }
}

export function normalizePetbotInterpretation(input = {}) {
  const data = input && typeof input === 'object' ? input : {}
  const species = normalizeSpecies(data.species)
  const payment = normalizePayment(data.payment_method || data.payment)
  const breed = normalizeBreed(data.breed || data.pet_breed)

  return {
    customer_name: pickString(data.customer_name || data.customerName, 60),
    intent: pickEnum(data.intent, INTENTS),
    pet_name: pickString(data.pet_name || data.petName, 60),
    species,
    breed,
    size: pickEnum(data.size, SIZES),
    weight_kg: clampNumber(data.weight_kg ?? data.weightKg, 0.1, 200),
    weight_label: pickString(data.weight_label || data.weightLabel, 60),
    weight_estimated: Boolean(data.weight_estimated || data.weightEstimated),
    coat_type: pickString(data.coat_type || data.coatType, 30),
    age_category: pickEnum(data.age_category || data.ageCategory, AGES),
    product_kind: pickEnum(data.product_kind || data.productKind, PRODUCT_KINDS),
    brand: pickString(data.brand, 60),
    package_preference: pickString(data.package_preference || data.packagePreference, 40),
    package_kg: clampNumber(data.package_kg ?? data.packageKg, 0.1, 50),
    quantity: clampNumber(data.quantity, 1, 99),
    service_type: pickString(data.service_type || data.serviceType, 80),
    service_grooming_detail: pickString(data.service_grooming_detail || data.serviceGroomingDetail, 120),
    service_notes: pickString(data.service_notes || data.serviceNotes, 160),
    service_transport_mode: normalizeServiceTransportMode(data.service_transport_mode || data.serviceTransportMode),
    service_date: pickString(data.service_date || data.serviceDate || data.appointment_date || data.appointmentDate || data.preferred_date || data.preferredDate, 40),
    service_time_preference: pickString(data.service_time_preference || data.serviceTimePreference || data.time_preference || data.timePreference, 40),
    service_preferred_time: pickString(data.service_preferred_time || data.servicePreferredTime || data.preferred_time || data.preferredTime, 40),
    symptom: pickString(data.symptom, 160),
    veterinary_risk: pickEnum(data.veterinary_risk || data.veterinaryRisk, VETERINARY_RISKS) || 'none',
    payment_method: payment,
    fulfillment_type: pickEnum(data.fulfillment_type || data.fulfillmentType, FULFILLMENTS),
    delivery_address: pickString(data.delivery_address || data.deliveryAddress, 200),
    neighborhood: pickString(data.neighborhood, 80),
    city: pickString(data.city, 80),
    reference: pickString(data.reference, 120),
    wants_human: Boolean(data.wants_human || data.wantsHuman),
    wants_discount: Boolean(data.wants_discount || data.wantsDiscount),
    wants_image: Boolean(data.wants_image || data.wantsImage),
    confirmation: Boolean(data.confirmation),
    negation: Boolean(data.negation),
    confidence: clampNumber(data.confidence, 0, 1) ?? 0,
    raw_summary: pickString(data.raw_summary || data.rawSummary, 240),
  }
}

export function detectExplicitVeterinaryEmergency(message = '') {
  const normalized = norm(message).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normalized) return false

  return [
    /\b(?:dificuldade|dificuldades) (?:para|pra|de) respirar\b/,
    /\b(?:falta de ar|nao (?:esta )?respirando|nao respira|sem respirar)\b/,
    /\b(?:sangramento intenso|sangrando muito|hemorragia)\b/,
    /\b(?:convulsao|convulsionando|ataque convulsivo)\b/,
    /\b(?:desmaiado|desmaiada|inconsciente|sem consciencia)\b/,
    /\b(?:envenenado|envenenada|envenenamento|intoxicado|intoxicada|intoxicacao)\b/,
    /\b(?:atropelado|atropelada|atropelamento)\b/,
    /\b(?:engasgado|engasgada|engasgando)\b/,
  ].some((pattern) => pattern.test(normalized))
}

export function reconcilePetbotIdentityInterpretation(message = '', interpretation = null) {
  if (!interpretation || typeof interpretation !== 'object') return interpretation

  const reconciled = { ...interpretation }
  const normalizedMessage = norm(message).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  const explicitlyNamesCustomer = /\b(?:me chamo|meu nome (?:e|eh)|pode me chamar de|eu sou)\b/.test(normalizedMessage)
  const explicitlyNamesPet = (
    /\b(?:ele|ela|pet|cachorro|cachorra|cao|cadela|gato|gata|shih tzu)\b.{0,80}\b(?:se chama|chama se|nome (?:e|eh))\b/.test(normalizedMessage)
    || /\b(?:se chama|chama se)\s+[a-z]/.test(normalizedMessage)
  )
  const customerName = norm(reconciled.customer_name)
  const petName = norm(reconciled.pet_name)
  const duplicatedIdentity = Boolean(customerName && petName && customerName === petName)

  if (!explicitlyNamesCustomer && explicitlyNamesPet) {
    if (!petName && customerName) reconciled.pet_name = reconciled.customer_name
    reconciled.customer_name = ''
  } else if (!explicitlyNamesCustomer && duplicatedIdentity) {
    reconciled.customer_name = ''
  }

  return reconciled
}

function buildInterpreterMessages({ message, history = [], state = {}, customerContext = '', mediaContext = '', customInstructions = '' }) {
  return [
    {
      role: 'system',
      content: [
        'Voce e a camada de interpretacao do PetBot.',
        'Sua tarefa e extrair fatos estruturados da conversa. Nao responda o cliente.',
        'Nao invente preco, estoque, horario ou produto. Extraia somente sinais da fala, historico e estado.',
        'Pode normalizar grafias comuns e entender contexto de petshop, mas nao invente atributos que o cliente nao informou.',
        'Quando o produto escolhido ou contexto for granel e o cliente disser "2kg", "2 kg" ou "dois quilos", extraia package_kg e quantity como 2.',
        'Para agendamento, extraia service_date como o texto que o cliente disse ("hoje", "amanha", "20/05", "sexta") e service_time_preference/service_preferred_time como "manha", "tarde", "qualquer horario" ou "14h". Nao invente horario.',
        'Para tosa, se o cliente disser maquina 1/3/5/7, lamina, pente, acabamento ou foto de referencia, extraia service_grooming_detail.',
        'Quando a pergunta anterior for sobre observacoes do servico, extraia qualquer cuidado informado em service_notes. Se o cliente responder apenas que nao ha observacoes, use service_notes="sem observacao".',
        'Para banho/tosa, quando o cliente disser que ele mesmo vai levar ou trazer o pet, extraia service_transport_mode="cliente_leva". Quando escolher o MotoDog, use service_transport_mode="motodog".',
        'Para banho/tosa, interprete a raca e o peso aproximado quando estiverem presentes na fala, no historico recente ou no estado atual. Nunca deduza peso pela raca.',
        'Separe rigorosamente cliente e pet: "me chamo Ana" informa customer_name; "ele/ela se chama Afonso", "meu cachorro se chama Afonso" ou "o pet se chama Afonso" informa somente pet_name. Nunca copie o nome do pet para customer_name.',
        'Se o cliente disser um valor aproximado, mantenha weight_kg com o valor informado, weight_label com a forma natural e weight_estimated=true.',
        'Se disser uma faixa suficiente para o catalogo, como "ate 10 kg" ou "mais de 10 kg", use um valor operacional compativel em weight_kg, preserve a frase em weight_label e marque weight_estimated=true.',
        'Extraia coat_type somente quando o cliente disser a pelagem. A classificacao de pelagem por raca sera resolvida pelo catalogo do sistema, nao por esta camada.',
        'Para banho/tosa e veterinaria, pagamento nao e obrigatorio no chat; extraia payment_method somente quando o cliente falar pagamento espontaneamente.',
        'Classifique veterinary_risk="emergency" quando houver dificuldade para respirar, sangramento intenso, convulsao, desmaio/inconsciencia, envenenamento, atropelamento ou outro risco imediato. Use "urgent" para sintomas preocupantes sem risco imediato e "none" nos demais casos.',
        'Se o cliente disser "Robertao, quero uma racao", extraia customer_name "Robertao" e intent "produto".',
        'Interjeicoes como "ue", "uai", "oxe", "opa" nao sao nome.',
        'Retorne apenas JSON valido, sem markdown.',
        'Campos permitidos: customer_name, intent, pet_name, species, breed, size, weight_kg, weight_label, weight_estimated, coat_type, age_category, product_kind, brand, package_preference, package_kg, quantity, service_type, service_grooming_detail, service_notes, service_transport_mode, service_date, service_time_preference, service_preferred_time, symptom, veterinary_risk, payment_method, fulfillment_type, delivery_address, neighborhood, city, reference, wants_human, wants_discount, wants_image, confirmation, negation, confidence, raw_summary.',
        'Enums: intent produto|banho_tosa|veterinaria|multi; species dog|cat; size pequeno|medio|grande; age_category filhote|adulto|castrado|senior; product_kind food|flea|litter|specific; payment_method pix|dinheiro|cartao; fulfillment_type entrega|retirada.',
        clean(customInstructions) ? `Instrucoes de atendimento publicadas para este tenant:\n${clean(customInstructions).slice(0, 4000)}` : '',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        current_message: message,
        recent_history: compactHistory(history),
        current_state: compactState(state),
        customer_context: clean(customerContext).slice(0, 800),
        media_context: clean(mediaContext).slice(0, 400),
      }),
    },
  ]
}

const PETBOT_INTERPRETATION_SCHEMA = {
  name: 'petbot_turn_interpretation',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      customer_name: { type: ['string', 'null'] },
      intent: { type: ['string', 'null'], enum: ['produto', 'banho_tosa', 'veterinaria', 'multi', null] },
      pet_name: { type: ['string', 'null'] },
      species: { type: ['string', 'null'], enum: ['dog', 'cat', 'other', null] },
      breed: { type: ['string', 'null'] },
      size: { type: ['string', 'null'], enum: ['pequeno', 'medio', 'grande', null] },
      weight_kg: { type: ['number', 'null'] },
      weight_label: { type: ['string', 'null'] },
      weight_estimated: { type: 'boolean' },
      coat_type: { type: ['string', 'null'] },
      age_category: { type: ['string', 'null'], enum: ['filhote', 'adulto', 'castrado', 'senior', null] },
      product_kind: { type: ['string', 'null'], enum: ['food', 'flea', 'litter', 'specific', null] },
      brand: { type: ['string', 'null'] },
      package_preference: { type: ['string', 'null'] },
      package_kg: { type: ['number', 'null'] },
      quantity: { type: ['number', 'null'] },
      service_type: { type: ['string', 'null'] },
      service_grooming_detail: { type: ['string', 'null'] },
      service_notes: { type: ['string', 'null'] },
      service_transport_mode: { type: ['string', 'null'], enum: ['cliente_leva', 'motodog', null] },
      service_date: { type: ['string', 'null'] },
      service_time_preference: { type: ['string', 'null'] },
      service_preferred_time: { type: ['string', 'null'] },
      symptom: { type: ['string', 'null'] },
      veterinary_risk: { type: 'string', enum: ['none', 'urgent', 'emergency'] },
      payment_method: { type: ['string', 'null'], enum: ['pix', 'dinheiro', 'cartao', null] },
      fulfillment_type: { type: ['string', 'null'], enum: ['entrega', 'retirada', null] },
      delivery_address: { type: ['string', 'null'] },
      neighborhood: { type: ['string', 'null'] },
      city: { type: ['string', 'null'] },
      reference: { type: ['string', 'null'] },
      wants_human: { type: 'boolean' },
      wants_discount: { type: 'boolean' },
      wants_image: { type: 'boolean' },
      confirmation: { type: 'boolean' },
      negation: { type: 'boolean' },
      confidence: { type: 'number' },
      raw_summary: { type: ['string', 'null'] },
    },
    required: [
      'customer_name', 'intent', 'pet_name', 'species', 'breed', 'size', 'weight_kg', 'weight_label',
      'weight_estimated', 'coat_type', 'age_category', 'product_kind', 'brand', 'package_preference',
      'package_kg', 'quantity', 'service_type', 'service_grooming_detail', 'service_notes', 'service_transport_mode', 'service_date',
      'service_time_preference', 'service_preferred_time', 'symptom', 'veterinary_risk', 'payment_method', 'fulfillment_type',
      'delivery_address', 'neighborhood', 'city', 'reference', 'wants_human', 'wants_discount', 'wants_image',
      'confirmation', 'negation', 'confidence', 'raw_summary',
    ],
  },
}

async function callChatJson({ apiKey, model, temperature, timeoutMs, messages, maxTokens = 350 }) {
  if (!apiKey) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS)

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : DEFAULT_TEMPERATURE,
        max_tokens: maxTokens,
        response_format: { type: 'json_schema', json_schema: PETBOT_INTERPRETATION_SCHEMA },
        messages,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) return null
    return payload?.choices?.[0]?.message?.content || ''
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}


export async function interpretPetbotMessageWithLlm(options = {}) {
  const content = await callChatJson({
    apiKey: options.apiKey,
    model: options.model,
    temperature: 0,
    timeoutMs: options.timeoutMs,
    messages: buildInterpreterMessages(options),
  })
  const parsed = safeJsonParse(content)
  const emergency = detectExplicitVeterinaryEmergency(options.message)
  if (!parsed) {
    return emergency
      ? normalizePetbotInterpretation({
        intent: 'veterinaria',
        symptom: options.message,
        veterinary_risk: 'emergency',
        confidence: 1,
      })
      : null
  }

  const interpretation = reconcilePetbotIdentityInterpretation(
    options.message,
    normalizePetbotInterpretation(parsed),
  )
  return emergency
    ? { ...interpretation, intent: 'veterinaria', veterinary_risk: 'emergency' }
    : interpretation
}

export function buildInterpretedPetbotSearchText(message = '', interpretation = null) {
  const data = normalizePetbotInterpretation(interpretation || {})
  return [
    message,
    data.intent === 'produto' ? 'produto' : '',
    data.product_kind === 'food' ? 'racao alimento' : '',
    data.product_kind === 'flea' ? 'antipulga pulga carrapato' : '',
    data.product_kind === 'litter' ? 'areia higienica gato' : '',
    data.species === 'dog' ? 'cachorro cao caes' : '',
    data.species === 'cat' ? 'gato felino' : '',
    data.breed,
    data.size,
    data.age_category,
    data.brand,
    data.package_preference,
    data.package_kg ? `${data.package_kg}kg` : '',
  ].filter(Boolean).join(' ')
}
