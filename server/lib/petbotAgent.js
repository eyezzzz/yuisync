import { createHash } from 'node:crypto'

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
const MAX_AGENT_STEPS = 5
const STORE_OPEN_MINUTES = 8 * 60
const STORE_CLOSE_MINUTES = 18 * 60
const SLOT_INTERVAL_MINUTES = 30

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

function serviceKind(value = '') {
  const text = normalize(value)
  if (/banho.*tosa|tosa.*banho/.test(text)) return 'banho_e_tosa'
  if (/tosa/.test(text)) return 'tosa'
  if (/banho/.test(text)) return 'banho'
  if (/consulta/.test(text)) return 'consulta'
  if (/vacina/.test(text)) return 'vacina'
  return normalizeCode(value) || null
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
  return {
    ...row,
    id: clean(row.id) || code,
    code,
    name,
    group_type: clean(row.group_type) || (/vet|consulta|vacina|clinica/.test(code) ? 'veterinaria' : 'banho_tosa'),
    default_price: Number(row.default_price ?? row.price ?? 0),
    default_duration_min: Math.max(15, Number(row.default_duration_min ?? row.duration_min ?? 60) || 60),
    active: row.active !== false,
    service_kind: serviceKind(`${code} ${name}`),
    weight_range: extractWeightRange(name),
    coat_type: extractCoatType(name),
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

function serviceSelection({ serviceQuery = '', orderType = '', services = [], weightKg = null, coatType = null } = {}) {
  const query = normalize(serviceQuery)
  const code = normalizeCode(serviceQuery)
  const group = serviceGroupForOrder(orderType)
  const normalizedWeight = positiveNumber(weightKg, 0) || null
  const normalizedCoat = normalizeCoatType(coatType)
  const allCandidates = (services || [])
    .map(normalizeService)
    .filter((service) => service.active && (!group || service.group_type === group))

  if (!allCandidates.length) {
    return { service: null, candidates: [], required_fields: [], error: 'Nenhum serviço ativo foi encontrado no cadastro real.' }
  }

  const queryKind = serviceKind(serviceQuery)
  const exactId = allCandidates.find((service) => clean(service.id) === clean(serviceQuery))
  const exactCatalogMatches = allCandidates.filter((service) => (
    service.code === code || normalize(service.name) === query
  ))
  const kindMatches = allCandidates.filter((service) => (
    (queryKind && service.service_kind === queryKind)
    || Boolean(query && (normalize(service.name).includes(query) || query.includes(normalize(service.name))))
  ))

  let candidates
  if (exactId) {
    candidates = [exactId]
  } else {
    const exactSpecialized = exactCatalogMatches.filter((service) => service.weight_range || service.coat_type)
    const kindSpecialized = kindMatches.filter((service) => service.weight_range || service.coat_type)

    // A generic code such as "banho" must not override the tenant's detailed
    // catalog. Exact specialized codes, however, are authoritative after the
    // agent has resolved them through the catalog tool.
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

  const specialized = candidates.filter((service) => service.weight_range || service.coat_type)
  if (specialized.length) candidates = specialized

  const requiredFields = []
  if (candidates.some((service) => service.weight_range) && normalizedWeight === null) {
    requiredFields.push('peso do pet em kg')
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

  const distinctCoats = new Set(filtered.map((service) => service.coat_type).filter((value) => value && value !== 'todas'))
  if (distinctCoats.size > 1 && !normalizedCoat) requiredFields.push('tipo de pelo do pet')
  if (normalizedCoat) {
    filtered = filtered.filter((service) => serviceMatchesCoat(service, normalizedCoat))
    const exactCoatMatches = filtered.filter((service) => service.coat_type === normalizedCoat)
    if (exactCoatMatches.length) filtered = exactCoatMatches
  }
  if (normalizedCoat && !filtered.length) {
    return {
      service: null,
      candidates,
      required_fields: [],
      error: `Nenhum serviço cadastrado atende o tipo de pelo informado (${clean(coatType)}).`,
    }
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

function resolveServiceDefinition(options = {}) {
  return serviceSelection(options).service
}

function publicService(service) {
  return {
    id: service.id,
    code: service.code,
    name: service.name,
    price: service.default_price,
    duration_min: service.default_duration_min,
    weight_min_kg: service.weight_range?.min ?? null,
    weight_max_kg: service.weight_range?.max ?? null,
    coat_type: service.coat_type || null,
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

function appointmentDateIso(row = {}) {
  if (row.service_date) return String(row.service_date).slice(0, 10)
  if (!row.scheduled_at) return ''
  return new Date(row.scheduled_at).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

function appointmentTimeText(row = {}) {
  if (row.start_time) return String(row.start_time).slice(0, 5)
  if (!row.scheduled_at) return ''
  return new Date(row.scheduled_at).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

function normalizeAppointment(row = {}) {
  const date = appointmentDateIso(row)
  const time = appointmentTimeText(row)
  return {
    ...row,
    scheduled_at: row.scheduled_at || (date && time ? `${date}T${time}:00-03:00` : null),
    service_date: row.service_date || date || null,
    start_time: row.start_time || (time ? `${time}:00` : null),
  }
}

function formatScheduledAt(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return clean(value)
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
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
      order.weight_kg ? `${order.weight_kg} kg` : null,
      order.coat_type ? `pelo ${order.coat_type}` : null,
    ].filter(Boolean).join(' / ')
    lines.push(`• Pet: ${pet}`)
  }

  for (const item of order.items || []) {
    const quantity = Number(item.quantity || 1)
    lines.push(`• ${quantity}x ${item.name}: ${money(quantity * Number(item.unit_price || 0))}`)
  }

  if (order.order_type !== 'produto') {
    lines.push(`• Serviço: ${order.service_label || order.service_type || order.order_type}`)
    lines.push(`• Horário: ${formatScheduledAt(order.scheduled_at)}`)
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
      name: 'update_customer_profile',
      description: 'Salva dados de cliente ou pet que foram informados explicitamente na conversa.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          customer_name: strictNullableString(),
          pet_name: strictNullableString(),
          species: { type: ['string', 'null'], enum: ['dog', 'cat', 'other', null] },
          size: strictNullableString(),
          breed: strictNullableString(),
          weight_kg: strictNullableNumber('Peso informado explicitamente pelo cliente, em kg.'),
          coat_type: strictNullableString('Tipo de pelo informado: curto, medio, longo, duplo ou todas.'),
          symptom: strictNullableString(),
          address: strictNullableString(),
          neighborhood: strictNullableString(),
          city: strictNullableString(),
        },
        required: ['customer_name', 'pet_name', 'species', 'size', 'breed', 'weight_kg', 'coat_type', 'symptom', 'address', 'neighborhood', 'city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_petshop_products',
      description: 'Consulta o estoque real e os preços atuais antes de afirmar que um produto existe, está disponível ou custa determinado valor.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' },
          species: { type: ['string', 'null'], enum: ['dog', 'cat', 'other', null] },
        },
        required: ['query', 'species'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_petshop_availability',
      description: 'Seleciona o serviço exato do cadastro por peso/tipo de pelo e calcula horários livres contra a agenda atual. Use antes de informar preço, duração ou disponibilidade.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          service_query: { type: 'string' },
          order_type: { type: 'string', enum: ['banho_tosa', 'veterinaria'] },
          weight_kg: strictNullableNumber('Peso exato do pet em kg quando o catálogo de serviços varia por peso.'),
          coat_type: strictNullableString('Tipo de pelo: curto, medio, longo, duplo ou todas.'),
          date: strictNullableString('Data exata no formato YYYY-MM-DD. Resolva hoje/amanhã usando a data atual do prompt.'),
          preferred_time: strictNullableString('Horário exato no formato HH:mm, quando informado.'),
          period: { type: ['string', 'null'], enum: ['specific', 'morning', 'afternoon', 'any', null] },
        },
        required: ['service_query', 'order_type', 'weight_kg', 'coat_type', 'date', 'preferred_time', 'period'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_petshop_order',
      description: 'Valida produto ou serviço exato do cadastro, agenda, preço e total, e prepara o resumo final. Não registra a venda.',
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
          weight_kg: strictNullableNumber('Peso exato do pet em kg, quando o serviço cadastrado varia por peso.'),
          coat_type: strictNullableString('Tipo de pelo: curto, medio, longo, duplo ou todas.'),
          symptom: strictNullableString(),
          order_type: { type: 'string', enum: ['produto', 'banho_tosa', 'veterinaria'] },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                product_id: strictNullableString('ID exato do produto exibido no contexto.'),
                name: { type: 'string' },
                quantity: { type: 'number' },
                upsell: { type: 'boolean' },
              },
              required: ['product_id', 'name', 'quantity', 'upsell'],
            },
          },
          appointment_id: strictNullableString(),
          scheduled_at: strictNullableString(),
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
          'customer_name', 'pet_name', 'species', 'size', 'breed', 'weight_kg', 'coat_type', 'symptom', 'order_type', 'items',
          'appointment_id', 'scheduled_at', 'service_code', 'service_type', 'service_grooming_detail', 'payment_method',
          'fulfillment_type', 'delivery_address', 'delivery_neighborhood', 'delivery_city', 'delivery_reference',
          'change_for', 'service_transport_fee', 'service_transport_mode', 'service_transport_label',
          'service_transport_address', 'service_transport_neighborhood', 'service_transport_city',
          'service_transport_reference', 'notes',
        ],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_confirmed_petshop_order',
      description: 'Registra o pedido que já foi preparado em uma mensagem anterior. Use somente após confirmação explícita do cliente.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          confirmation: { type: 'boolean', description: 'Deve ser true somente quando o cliente confirmou explicitamente.' },
        },
        required: ['confirmation'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_product_image',
      description: 'Seleciona a foto cadastrada de um produto real para envio ao cliente.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          product_id: { type: 'string' },
        },
        required: ['product_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'handoff_to_human',
      description: 'Transfere a conversa quando faltar dado operacional, houver risco veterinário ou o cliente pedir uma pessoa.',
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
  weightKg = null,
  coatType = null,
  date = null,
  preferredTime = null,
  period = null,
  services = [],
  appointments = [],
  now = new Date(),
} = {}) {
  const selection = serviceSelection({ serviceQuery, orderType, services, weightKg, coatType })
  const service = selection.service
  if (!service) {
    return {
      ok: false,
      error: selection.error || 'Faltam dados para selecionar o serviço exato do cadastro real.',
      required_fields: selection.required_fields,
      available_services: selection.candidates.map(publicService),
      instruction: selection.required_fields.length
        ? `Pergunte somente: ${selection.required_fields[0]}. Não informe preço nem escolha um serviço enquanto houver ambiguidade.`
        : 'Não invente serviço, preço ou disponibilidade. Use apenas uma opção exata retornada pelo cadastro.',
    }
  }

  if (service.default_price <= 0) {
    return { ok: false, error: 'Serviço cadastrado sem preço válido.', service: { code: service.code, name: service.name } }
  }

  const requestedDate = clean(date)
  if (!requestedDate) {
    return {
      ok: false,
      error: 'A data do agendamento ainda não foi informada.',
      required_fields: ['data do agendamento'],
      service: publicService(service),
      instruction: 'Pergunte a data desejada antes de oferecer horários. Não misture horários de dias diferentes.',
    }
  }
  if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return { ok: false, error: 'Data inválida. Use YYYY-MM-DD.' }
  }

  const dates = [requestedDate]
  const requestedMinutes = preferredTime ? parseTimeMinutes(preferredTime) : null
  if (preferredTime && requestedMinutes === null) {
    return { ok: false, error: 'Horário inválido. Use HH:mm.' }
  }

  const busyAppointments = (appointments || [])
    .map(normalizeAppointment)
    .filter((row) => BUSY_STATUSES.has(normalize(row.status)))
  const explicitAvailable = (appointments || [])
    .map(normalizeAppointment)
    .filter((row) => AVAILABLE_STATUSES.has(normalize(row.status)))
  const nowMs = now.getTime()
  const durationMin = service.default_duration_min
  const slots = []

  const periodMatches = (minutes) => {
    if (period === 'morning') return minutes < 12 * 60
    if (period === 'afternoon') return minutes >= 12 * 60
    return true
  }

  for (const dateIso of dates) {
    const candidateMinutes = []
    if (requestedMinutes !== null) candidateMinutes.push(requestedMinutes)
    for (let minutes = STORE_OPEN_MINUTES; minutes + durationMin <= STORE_CLOSE_MINUTES; minutes += SLOT_INTERVAL_MINUTES) {
      if (!candidateMinutes.includes(minutes)) candidateMinutes.push(minutes)
    }

    for (const minutes of candidateMinutes) {
      if (minutes < STORE_OPEN_MINUTES || minutes + durationMin > STORE_CLOSE_MINUTES) continue
      if (!periodMatches(minutes) && minutes !== requestedMinutes) continue
      const time = formatTimeMinutes(minutes)
      const scheduledAt = `${dateIso}T${time}:00-03:00`
      const scheduledMs = new Date(scheduledAt).getTime()
      if (scheduledMs <= nowMs + 15 * 60 * 1000) continue

      const explicitSlot = explicitAvailable.find((row) => appointmentStartMs(row) === scheduledMs)
      const candidate = {
        id: explicitSlot?.id || null,
        service_type: service.code,
        scheduled_at: scheduledAt,
        service_date: dateIso,
        start_time: `${time}:00`,
        duration_min: Number(explicitSlot?.duration_min || durationMin),
        price: Number(explicitSlot?.price || service.default_price),
        status: 'available',
        virtual: !explicitSlot,
      }
      if (busyAppointments.some((row) => appointmentsOverlap(candidate, row))) continue
      slots.push(candidate)
    }
  }

  slots.sort((left, right) => {
    if (requestedMinutes === null || !requestedDate) return new Date(left.scheduled_at) - new Date(right.scheduled_at)
    const leftMinutes = parseTimeMinutes(appointmentTimeText(left)) ?? 0
    const rightMinutes = parseTimeMinutes(appointmentTimeText(right)) ?? 0
    return Math.abs(leftMinutes - requestedMinutes) - Math.abs(rightMinutes - requestedMinutes)
  })

  const requestedScheduledAt = requestedDate && requestedMinutes !== null
    ? `${requestedDate}T${formatTimeMinutes(requestedMinutes)}:00-03:00`
    : null
  const requestedSlot = requestedScheduledAt
    ? slots.find((slot) => slot.scheduled_at === requestedScheduledAt) || null
    : null

  return {
    ok: true,
    source: 'petshop_services+appointments',
    service: publicService(service),
    requested_slot: requestedScheduledAt
      ? { scheduled_at: requestedScheduledAt, available: Boolean(requestedSlot) }
      : null,
    available_slots: slots.slice(0, 8).map((slot) => ({
      appointment_id: slot.id,
      scheduled_at: slot.scheduled_at,
      date: slot.service_date,
      time: appointmentTimeText(slot),
      price: slot.price,
      duration_min: slot.duration_min,
    })),
    instruction: requestedSlot
      ? 'O horário solicitado está livre. Use exatamente o scheduled_at e o service.code retornados ao preparar o agendamento.'
      : slots.length
        ? 'O horário solicitado não está livre ou não foi informado. Ofereça apenas os horários retornados.'
        : 'Não há horário livre no período consultado. Não invente alternativas.',
  }
}

export function preparePetshopOrderDraft({ args = {}, products = [], services = [], appointments = [], settings = {}, now = new Date() } = {}) {
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
  if (!base.size && !base.breed) missing.push('porte ou raça do pet')
  if (orderType === 'veterinaria' && !base.symptom) missing.push('problema principal')

  const normalizedAppointments = (appointments || []).map(normalizeAppointment)
  const requestedAppointmentId = clean(args.appointment_id)
  let requestedScheduledAt = clean(args.scheduled_at)
  const explicitAppointment = requestedAppointmentId
    ? normalizedAppointments.find((row) => clean(row.id) === requestedAppointmentId)
    : null
  if (explicitAppointment?.scheduled_at) requestedScheduledAt = clean(explicitAppointment.scheduled_at)

  const serviceQuery = clean(args.service_code || args.service_type || explicitAppointment?.service_type)
  const selection = serviceSelection({
    serviceQuery,
    orderType,
    services,
    weightKg: base.weight_kg,
    coatType: base.coat_type,
  })
  const serviceDefinition = selection.service
  if (!serviceDefinition) {
    if (selection.required_fields.length) missing.push(...selection.required_fields)
    else missing.push('serviço ativo do cadastro')
  }
  if (!requestedScheduledAt) missing.push('horário real da agenda')

  const requestedDate = appointmentDateIso({ scheduled_at: requestedScheduledAt })
  const requestedTime = appointmentTimeText({ scheduled_at: requestedScheduledAt })
  const availability = serviceDefinition && requestedDate && requestedTime
    ? buildServiceAvailability({
      serviceQuery: serviceDefinition.code,
      orderType,
      weightKg: base.weight_kg,
      coatType: base.coat_type,
      date: requestedDate,
      preferredTime: requestedTime,
      period: 'specific',
      services,
      appointments,
      now,
    })
    : null
  const availableSlot = availability?.available_slots?.find((slot) => clean(slot.scheduled_at) === requestedScheduledAt) || null
  if (requestedScheduledAt && (!availability?.ok || !availableSlot)) missing.push('horário disponível')

  const servicePrice = Number(availableSlot?.price ?? serviceDefinition?.default_price ?? 0)
  if (serviceDefinition && servicePrice <= 0) missing.push('preço confirmado do serviço')

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
    scheduled_at: requestedScheduledAt,
    service_type: serviceType,
    service_label: serviceDefinition.name,
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

  for (let step = 0; step < Math.max(1, maxSteps); step += 1) {
    const response = await callModel({
      model,
      temperature,
      messages,
      tools,
      tool_choice: step === 0 ? initialToolChoice : 'auto',
      parallel_tool_calls: false,
      max_tokens: 800,
    })
    tokensUsed += Number(response?.usage?.total_tokens || 0)

    const assistantMessage = response?.choices?.[0]?.message || {}
    const toolCalls = Array.isArray(assistantMessage.tool_calls) ? assistantMessage.tool_calls : []
    const content = clean(assistantMessage.content)

    if (!toolCalls.length) {
      if (!content) throw new Error('O agente retornou uma resposta vazia.')
      return { reply: content, toolRuns, tokensUsed, messages }
    }

    messages.push({
      role: 'assistant',
      content: assistantMessage.content || null,
      tool_calls: toolCalls,
    })

    for (const toolCall of toolCalls) {
      let result
      try {
        result = await executeTool(toolCall)
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
      toolRuns.push({
        name: clean(toolCall?.function?.name),
        ok: result?.ok !== false,
        result,
      })
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: clean(toolCall?.function?.name),
        content: JSON.stringify(result).slice(0, 12000),
      })
    }
  }

  throw new Error('O agente excedeu o limite de etapas desta mensagem.')
}
