import { renderGuardedPetbotReply } from './petbotGuard.js'

const DEFAULT_TEMPERATURE = 0.5
const DEFAULT_TIMEOUT_MS = 12_000

const INTENTS = new Set(['produto', 'banho_tosa', 'veterinaria', 'multi'])
const SPECIES = new Set(['dog', 'cat'])
const PRODUCT_KINDS = new Set(['food', 'flea', 'litter', 'specific'])
const PAYMENTS = new Set(['pix', 'dinheiro', 'cartao'])
const FULFILLMENTS = new Set(['entrega', 'retirada'])
const AGES = new Set(['filhote', 'adulto', 'castrado', 'senior'])
const SIZES = new Set(['pequeno', 'medio', 'grande'])

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
  return ''
}

function normalizePayment(value) {
  const normalized = norm(value)
  if (normalized.includes('pix')) return 'pix'
  if (normalized.includes('dinheiro')) return 'dinheiro'
  if (normalized.includes('cartao') || normalized.includes('credito') || normalized.includes('debito')) return 'cartao'
  return ''
}

function normalizeBreed(value) {
  const normalized = norm(value).replace(/\s+/g, ' ')
  if (['shih tzu', 'shi tzu', 'shihtzu', 'shitzu'].includes(normalized)) return 'Shih Tzu'
  if (normalized.includes('spitz')) return 'Spitz'
  if (normalized.includes('poodle')) return 'Poodle'
  if (normalized.includes('pinscher')) return 'Pinscher'
  if (normalized.includes('golden')) return 'Golden Retriever'
  if (normalized.includes('labrador')) return 'Labrador'
  return pickString(value, 60)
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
  return {
    customer_name: petbot.customerName || '',
    intent: petbot.intent || '',
    awaiting: petbot.awaiting || '',
    pet_name: petbot.petName || '',
    species: petbot.species || '',
    breed: petbot.breed || '',
    size: petbot.size || '',
    weight_kg: petbot.weightKg || petbot.weight_kg || '',
    coat_type: petbot.coatType || petbot.coat_type || '',
    age_category: petbot.ageCategory || '',
    brand: petbot.brand || '',
    package_preference: petbot.packagePreference || '',
    service_date: petbot.serviceDate || '',
    service_time_preference: petbot.serviceTimePreference || '',
    service_preferred_time: petbot.servicePreferredTime || '',
    service_grooming_detail: petbot.serviceGroomingDetail || '',
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
  const normalizedBreed = norm(breed)

  return {
    customer_name: pickString(data.customer_name || data.customerName, 60),
    intent: pickEnum(data.intent, INTENTS),
    pet_name: pickString(data.pet_name || data.petName, 60),
    species,
    breed,
    size: pickEnum(data.size, SIZES) || (normalizedBreed === 'shih tzu' ? 'pequeno' : ''),
    weight_kg: clampNumber(data.weight_kg ?? data.weightKg, 0.1, 200),
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
    service_date: pickString(data.service_date || data.serviceDate || data.appointment_date || data.appointmentDate || data.preferred_date || data.preferredDate, 40),
    service_time_preference: pickString(data.service_time_preference || data.serviceTimePreference || data.time_preference || data.timePreference, 40),
    service_preferred_time: pickString(data.service_preferred_time || data.servicePreferredTime || data.preferred_time || data.preferredTime, 40),
    symptom: pickString(data.symptom, 160),
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

function buildInterpreterMessages({ message, history = [], state = {}, customerContext = '', mediaContext = '', customInstructions = '' }) {
  return [
    {
      role: 'system',
      content: [
        'Voce e a camada de interpretacao do PetBot.',
        'Sua tarefa e extrair fatos estruturados da conversa. Nao responda o cliente.',
        'Nao invente preco, estoque, horario ou produto. Extraia somente sinais da fala, historico e estado.',
        'Pode inferir contexto comum de petshop: "racao" = produto de alimento; "shi tzu", "shih tzu", "shitzu" = cachorro pequeno da raca Shih Tzu; "spitz", "poodle", "pinscher" = cachorro pequeno; "golden", "labrador" = cachorro grande.',
        'Quando o produto escolhido ou contexto for granel e o cliente disser "2kg", "2 kg" ou "dois quilos", extraia package_kg e quantity como 2.',
        'Para agendamento, extraia service_date como o texto que o cliente disse ("hoje", "amanha", "20/05", "sexta") e service_time_preference/service_preferred_time como "manha", "tarde", "qualquer horario" ou "14h". Nao invente horario.',
        'Para tosa, se o cliente disser maquina 1/3/5/7, lamina, pente, acabamento ou foto de referencia, extraia service_grooming_detail.',
        'Para banho/tosa, extraia weight_kg somente quando o cliente informar peso explicitamente. Extraia coat_type quando disser pelo curto, medio, longo, duplo ou equivalente. Nunca deduza peso ou pelo pela raca.',
        'Para banho/tosa e veterinaria, pagamento nao e obrigatorio no chat; extraia payment_method somente quando o cliente falar pagamento espontaneamente.',
        'Se o cliente disser "Robertao, quero uma racao", extraia customer_name "Robertao" e intent "produto".',
        'Interjeicoes como "ue", "uai", "oxe", "opa" nao sao nome.',
        'Retorne apenas JSON valido, sem markdown.',
        'Campos permitidos: customer_name, intent, pet_name, species, breed, size, weight_kg, coat_type, age_category, product_kind, brand, package_preference, package_kg, quantity, service_type, service_grooming_detail, service_notes, service_date, service_time_preference, service_preferred_time, symptom, payment_method, fulfillment_type, delivery_address, neighborhood, city, reference, wants_human, wants_discount, wants_image, confirmation, negation, confidence, raw_summary.',
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
        response_format: { type: 'json_object' },
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

async function callChatText({ apiKey, model, temperature, timeoutMs, messages, maxTokens = 260 }) {
  if (!apiKey) return ''
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
        messages,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) return ''
    return clean(payload?.choices?.[0]?.message?.content || '')
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

export async function interpretPetbotMessageWithLlm(options = {}) {
  const content = await callChatJson({
    apiKey: options.apiKey,
    model: options.model,
    temperature: options.temperature ?? DEFAULT_TEMPERATURE,
    timeoutMs: options.timeoutMs,
    messages: buildInterpreterMessages(options),
  })
  const parsed = safeJsonParse(content)
  return parsed ? normalizePetbotInterpretation(parsed) : null
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

function buildRedraftMessages({ message, history = [], directive = {}, customInstructions = '' }) {
  return [
    {
      role: 'system',
      content: [
        'Voce e o PetBot, atendente de petshop no WhatsApp.',
        'Reescreva a resposta autorizada para soar humana, curta e natural.',
        'Nao mude a acao, nao adicione preco, produto, horario, desconto, endereco ou confirmacao fora da resposta autorizada.',
        'Se a resposta autorizada ja estiver boa, pode devolver quase igual.',
        'Responda apenas a mensagem final para o cliente.',
        clean(customInstructions) ? `Estilo e instrucoes publicadas do tenant:\n${clean(customInstructions).slice(0, 4000)}` : '',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        current_message: message,
        recent_history: compactHistory(history),
        action: directive.action,
        allowed_data: directive.allowedData || {},
        fallback_reply: directive.fallbackReply || '',
        forbidden: directive.forbidden || [],
      }),
    },
  ]
}

export async function redraftPetbotReplyWithLlm(options = {}) {
  const directive = options.directive || {}
  if (!directive.allowLlmRedraft) {
    return {
      reply: clean(directive.fallbackReply || options.fallbackReply || ''),
      used: false,
      validation: { ok: true, problems: [] },
    }
  }

  const draft = await callChatText({
    apiKey: options.apiKey,
    model: options.model,
    temperature: options.temperature ?? DEFAULT_TEMPERATURE,
    timeoutMs: options.timeoutMs,
    messages: buildRedraftMessages(options),
  })

  if (!draft) {
    return {
      reply: clean(directive.fallbackReply || options.fallbackReply || ''),
      used: false,
      validation: { ok: false, problems: ['llm_sem_resposta'] },
    }
  }

  const rendered = renderGuardedPetbotReply(draft, directive)
  return {
    ...rendered,
    used: rendered.validation.ok,
  }
}
