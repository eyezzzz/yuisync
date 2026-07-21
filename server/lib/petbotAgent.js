import { createHash } from 'node:crypto'

const AVAILABLE_STATUSES = new Set(['available', 'livre', 'disponivel', 'aberto', 'open'])
const MAX_AGENT_STEPS = 5

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

  if (order.pet_name || order.species || order.size || order.breed) {
    const pet = [order.pet_name, order.species, order.breed, order.size].filter(Boolean).join(' / ')
    lines.push(`• Pet: ${pet}`)
  }

  for (const item of order.items || []) {
    const quantity = Number(item.quantity || 1)
    lines.push(`• ${quantity}x ${item.name}: ${money(quantity * Number(item.unit_price || 0))}`)
  }

  if (order.order_type !== 'produto') {
    lines.push(`• Serviço: ${order.service_type || order.order_type}`)
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
          symptom: strictNullableString(),
          address: strictNullableString(),
          neighborhood: strictNullableString(),
          city: strictNullableString(),
        },
        required: ['customer_name', 'pet_name', 'species', 'size', 'breed', 'symptom', 'address', 'neighborhood', 'city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_petshop_order',
      description: 'Valida dados reais do estoque ou agenda, calcula o total e prepara o resumo final. Não registra a venda.',
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
          'customer_name', 'pet_name', 'species', 'size', 'breed', 'symptom', 'order_type', 'items',
          'appointment_id', 'scheduled_at', 'service_type', 'service_grooming_detail', 'payment_method',
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

export function preparePetshopOrderDraft({ args = {}, products = [], appointments = [], settings = {} } = {}) {
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

  const normalizedAppointments = (appointments || []).map(normalizeAppointment)
  const requestedAppointmentId = clean(args.appointment_id)
  const requestedScheduledAt = clean(args.scheduled_at)
  const appointment = normalizedAppointments.find((row) => (
    (requestedAppointmentId && clean(row.id) === requestedAppointmentId)
    || (requestedScheduledAt && clean(row.scheduled_at) === requestedScheduledAt)
  ))

  if (!base.pet_name) missing.push('nome do pet')
  if (!base.species) missing.push('espécie do pet')
  if (!base.size && !base.breed) missing.push('porte ou raça do pet')
  if (orderType === 'veterinaria' && !base.symptom) missing.push('problema principal')
  if (!appointment) missing.push('horário real da agenda')
  if (appointment && !AVAILABLE_STATUSES.has(normalize(appointment.status))) missing.push('horário disponível')
  const servicePrice = Number(appointment?.price || 0)
  if (appointment && servicePrice <= 0) missing.push('preço confirmado do serviço')
  if (missing.length) return { ok: false, missing: [...new Set(missing)] }

  const serviceType = clean(appointment.service_type) || clean(args.service_type) || (orderType === 'veterinaria' ? 'Veterinária' : 'Banho/tosa')
  const serviceTransportFee = positiveNumber(args.service_transport_fee, 0)
  const order = {
    ...base,
    items: [{
      product_id: null,
      name: serviceType,
      quantity: 1,
      unit_price: servicePrice,
      upsell: false,
    }],
    appointment_id: clean(appointment.id),
    scheduled_at: clean(appointment.scheduled_at),
    service_type: serviceType,
    duration_min: Number(appointment.duration_min || 60),
    payment_method: null,
    fulfillment_type: 'servico',
    service_transport_fee: serviceTransportFee,
    service_transport_mode: nullableString(args.service_transport_mode, 80),
    service_transport_label: nullableString(args.service_transport_label, 120),
    service_transport_address: nullableString(args.service_transport_address, 200),
    service_transport_neighborhood: nullableString(args.service_transport_neighborhood, 100),
    service_transport_city: nullableString(args.service_transport_city, 100),
    service_transport_reference: nullableString(args.service_transport_reference, 160),
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
      tool_choice: 'auto',
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
