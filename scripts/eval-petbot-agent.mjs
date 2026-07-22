import 'dotenv/config'
import process from 'node:process'

import {
  PETBOT_AGENT_TOOLS,
  buildPetbotOperationalPreflight,
  explicitPetbotHandoffTarget,
  mergeInterpretedPetbotServiceFacts,
  runPetbotAgent,
  shouldForcePetbotServicePreparation,
} from '../server/lib/petbotAgent.js'
import {
  buildPetbotAgentV3Prompt,
  buildUnknownStoreQuestionReply,
  buildVerifiedStoreQuestionReply,
  validatePetbotOperationalReply,
} from '../server/lib/petbotGrounding.js'

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const API_KEY = process.env.OPENAI_API_KEY || ''
const API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions'
const FIXED_NOW = new Date('2026-07-22T12:00:00-03:00')

const SERVICES = [
  {
    id: 'dog-small', code: 'banho_pet_pequeno',
    name: 'BANHO PET PORTE PEQUENO 0 KG A 10 KG (TODAS AS PELAGENS)',
    group_type: 'banho_tosa', default_price: 72, default_duration_min: 60,
    active: true, catalog_source: 'products', source_product_id: '11111111-1111-1111-1111-111111111111',
    species: 'dog', weight_range: { min: 0, max: 10 }, coat_type: 'todas', all_breeds: true,
  },
  {
    id: 'vet-consultation', code: 'consulta_veterinaria', name: 'Consulta Veterinária',
    group_type: 'veterinaria', default_price: 120, default_duration_min: 40,
    active: true, catalog_source: 'products', source_product_id: '22222222-2222-2222-2222-222222222222',
    species: 'dog',
  },
]

const SCHEDULE_SETTINGS = {
  timezone: 'America/Sao_Paulo',
  businessHours: {
    1: [{ open: '08:00', close: '18:00' }], 2: [{ open: '08:00', close: '18:00' }],
    3: [{ open: '08:00', close: '18:00' }], 4: [{ open: '08:00', close: '18:00' }],
    5: [{ open: '08:00', close: '18:00' }], 6: [{ open: '08:00', close: '13:00' }], 7: [],
  },
  slotIntervalMin: 30,
  bookingLeadMinutes: 0,
  bookingCapacity: 1,
}

const STORE_INFORMATION = {
  address: 'Avenida Constantino Pinto, 191 - Centro - Muriaé',
  phone: '(32) 98520-5279',
  business_hours: {
    'segunda-feira': ['08:00-18:00'], 'terça-feira': ['08:00-18:00'],
    'quarta-feira': ['08:00-18:00'], 'quinta-feira': ['08:00-18:00'],
    'sexta-feira': ['08:00-18:00'], sábado: ['08:00-13:00'], domingo: [],
  },
  product_payment_methods: ['Pix', 'dinheiro', 'cartão'],
  service_payment_policy: 'Pagamento após a conclusão do serviço.',
  approved_messages: {
    unknown_information: 'Preciso confirmar essa informação com nossa equipe. Posso chamar um atendente para ajudar?',
  },
}

const defaultProducts = [
  { id: 'bulk-dog-food', name: 'Ração Premium Cães Adultos Granel', price: 20, stock_quantity: 30 },
  { id: 'bag-dog-food', name: 'Ração Premium Cães Adultos Saco 15 kg', price: 210, stock_quantity: 4 },
]

const scenarios = [
  {
    id: 'product_asks_bulk_or_bag',
    message: 'Vocês têm ração Premium para cachorro adulto?',
    facts: { intent: 'produto', product_kind: 'food', species: 'dog', age_category: 'adulto' },
    products: defaultProducts,
    expect: {
      allTools: ['search_petshop_products'],
      replyPattern: /granel|saco|embalagem/i,
      forbidden: [/agendar|horário disponível/i],
    },
  },
  {
    id: 'product_prepares_fractional_pickup',
    message: 'Quero 2,5 kg da ração Premium a granel, vou retirar e pagar no Pix.',
    facts: {
      intent: 'produto', product_kind: 'food', species: 'dog', age_category: 'adulto',
      brand: 'Premium', package_preference: 'granel', quantity: 2.5,
      payment_method: 'pix', fulfillment_type: 'retirada',
    },
    products: [defaultProducts[0]],
    expect: {
      allTools: ['search_petshop_products', 'prepare_petshop_product_order'],
      replyPattern: /resumo|confirma|separaç/i,
      forbidden: [/agendamento|MotoDog/i],
    },
  },
  {
    id: 'veterinary_prepares_complete_booking',
    message: 'O Bob é cachorro pequeno e está com muita coceira. Quero a consulta dia 25 às 12h.',
    facts: {
      intent: 'veterinaria', pet_name: 'Bob', species: 'dog', size: 'pequeno',
      symptom: 'muita coceira', service_type: 'consulta veterinária',
      service_date: '2026-07-25', service_preferred_time: '12:00',
    },
    expect: {
      allTools: ['resolve_petshop_service', 'check_petshop_availability', 'prepare_petshop_service_booking'],
      replyPattern: /resumo|confirma o agendamento|Consulta Veterinária/i,
      forbidden: [/Pix|dinheiro|cartão|MotoDog|pelagem/i],
    },
  },
  {
    id: 'veterinary_emergency_handoff',
    message: 'Meu cachorro está com sangramento intenso e dificuldade para respirar, preciso de ajuda agora.',
    facts: {
      intent: 'veterinaria', pet_name: 'Max', species: 'dog', size: 'medio',
      symptom: 'sangramento intenso e dificuldade para respirar', veterinary_risk: 'emergency',
      service_type: 'consulta veterinária',
    },
    expect: {
      allTools: ['handoff_to_human'],
      replyPattern: /veterin|equipe|atendimento|urg/i,
      forbiddenTools: ['prepare_petshop_service_booking', 'create_confirmed_petshop_order'],
      forbidden: [/horário disponível|agendamento confirmado/i],
    },
  },
  {
    id: 'known_store_question',
    message: 'Qual o endereço e o horário de vocês no sábado?',
    facts: {},
    expect: {
      noTools: true,
      replyPatterns: [/Constantino Pinto.*191/is, /08:00.*13:00/is],
      forbidden: [/não sei|talvez/i],
    },
  },
  {
    id: 'unknown_store_question',
    message: 'Vocês hospedam jabuti durante viagens?',
    facts: { intent: 'duvida' },
    expect: {
      noTools: true,
      replyPattern: /confirmar|equipe|atendente/i,
      forbidden: [/sim,? (?:nós )?hospedamos|oferecemos hospedagem|temos hotel/i],
    },
  },
  {
    id: 'explicit_attendant_handoff',
    message: 'Quero falar com um atendente, por favor.',
    facts: {},
    expect: {
      allTools: ['handoff_to_human'],
      replyPattern: /atendente|transfer/i,
      forbiddenTools: ['prepare_petshop_product_order', 'prepare_petshop_service_booking'],
    },
  },
  {
    id: 'explicit_veterinary_handoff',
    message: 'Pode me transferir para a veterinária?',
    facts: {},
    expect: {
      allTools: ['handoff_to_human'],
      replyPattern: /veterin|transfer/i,
      forbiddenTools: ['prepare_petshop_service_booking'],
    },
  },
  {
    id: 'confirm_product_order_once',
    message: 'Confirmo.',
    facts: {},
    pendingOrder: {
      id: 'pending-product-eval', prepared_at: '2026-07-22T11:59:00-03:00',
      summary: '2,5x Ração Premium Granel: R$ 50,00. Confirma para separação?',
      order: { order_type: 'produto', customer_name: 'Cliente de teste', total: 50 },
    },
    commitStatus: 'committed',
    expect: { allTools: ['create_confirmed_petshop_order'], replyPattern: /confirmad|registrad|separaç/i },
  },
  {
    id: 'confirm_product_order_idempotently',
    message: 'Sim, confirma.',
    facts: {},
    pendingOrder: {
      id: 'pending-product-eval', prepared_at: '2026-07-22T11:59:00-03:00',
      summary: '2,5x Ração Premium Granel: R$ 50,00. Confirma para separação?',
      order: { order_type: 'produto', customer_name: 'Cliente de teste', total: 50 },
    },
    commitStatus: 'already_committed',
    expect: { allTools: ['create_confirmed_petshop_order'], replyPattern: /já|confirmad|registrad/i },
  },
]

function parseReply(value = '') {
  try {
    return JSON.parse(String(value || '')).message || ''
  } catch {
    return String(value || '')
  }
}

async function callModel(payload) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body?.error?.message || `OpenAI HTTP ${response.status}`)
    return body
  } finally {
    clearTimeout(timeout)
  }
}

function serviceForArgs(args = {}) {
  return args.order_type === 'veterinaria' || /veterin|consulta/i.test(String(args.service_query || ''))
    ? SERVICES[1]
    : SERVICES[0]
}

function fakeToolResult(name, args, scenario) {
  if (name === 'search_petshop_products') {
    const products = scenario.products || defaultProducts
    return {
      ok: products.length > 0,
      status: products.length === 1 ? 'resolved' : 'candidates',
      differentiators: products.length > 1
        ? [{ field: 'package_preference', label: 'forma de venda', values: ['granel', 'saco'] }]
        : [],
      products,
    }
  }
  if (name === 'resolve_petshop_service') {
    const service = serviceForArgs(args)
    return { ok: true, status: 'resolved', service }
  }
  if (name === 'check_petshop_availability') {
    const service = serviceForArgs(args)
    return {
      ok: true, status: 'available', service,
      requested_slot: { available: true, time: '14:00', scheduled_at: '2026-07-25T14:00:00-03:00' },
      available_slots: [{ time: '14:00', scheduled_at: '2026-07-25T14:00:00-03:00', price: service.default_price, duration_min: service.default_duration_min }],
    }
  }
  if (name === 'prepare_petshop_product_order') {
    return { ok: true, status: 'prepared', pending_order_id: 'product-prepared', summary: '**Resumo final**\n• 2,5 kg de ração: R$ 50,00\n\nConfirma para separação?', order: { order_type: 'produto', total: 50 } }
  }
  if (name === 'prepare_petshop_service_booking') {
    const time = scenario.facts?.service_preferred_time || '14:00'
    return { ok: true, status: 'prepared', pending_order_id: 'vet-prepared', summary: `**Resumo final**\n• Consulta Veterinária\n• Horário: 25/07/2026 às ${time}\n• Total: R$ 120,00\n\nConfirma o agendamento?`, order: { order_type: 'veterinaria', total: 120 } }
  }
  if (name === 'create_confirmed_petshop_order') {
    return {
      ok: true, status: scenario.commitStatus || 'committed', sale_id: 'sale-eval-1',
      order_id: 'order-eval-1', appointment_id: scenario.pendingOrder?.order?.order_type === 'produto' ? null : 'appointment-eval-1',
      total: scenario.pendingOrder?.order?.total || 120, payment_status: 'a_receber',
    }
  }
  if (name === 'handoff_to_human') return { ok: true, status: 'transferred', target: args.target, reason: args.reason }
  if (name === 'get_petshop_transport_options') return { ok: true, status: 'unavailable', no_transport_allowed: true, options: [] }
  if (name === 'cancel_pending_petshop_order') return { ok: true, status: 'cancelled' }
  if (name === 'send_product_image') return { ok: true, product_name: 'Produto de teste', image_attached: true }
  return { ok: false, status: 'unknown_tool', error: `Ferramenta não simulada: ${name}` }
}

function assertScenario(scenario, result) {
  const tools = result.toolRuns.map((run) => run.name)
  const errors = []
  for (const expected of scenario.expect?.allTools || []) {
    if (!tools.includes(expected)) errors.push(`não chamou ${expected}`)
  }
  for (const forbidden of scenario.expect?.forbiddenTools || []) {
    if (tools.includes(forbidden)) errors.push(`chamou ferramenta proibida ${forbidden}`)
  }
  if (scenario.expect?.noTools && tools.length) errors.push(`chamou ferramentas sem necessidade: ${tools.join(', ')}`)
  if (scenario.expect?.replyPattern && !scenario.expect.replyPattern.test(result.reply)) {
    errors.push(`resposta não corresponde a ${scenario.expect.replyPattern}`)
  }
  for (const required of scenario.expect?.replyPatterns || []) {
    if (!required.test(result.reply)) errors.push(`resposta não corresponde a ${required}`)
  }
  for (const forbidden of scenario.expect?.forbidden || []) {
    if (forbidden.test(result.reply)) errors.push(`resposta contém padrão proibido ${forbidden}`)
  }
  return errors
}

async function runScenario(scenario) {
  let orderResult = null
  const facts = mergeInterpretedPetbotServiceFacts({ interpretation: scenario.facts || {} })
  const serviceOrderType = ['banho_tosa', 'veterinaria'].includes(scenario.facts?.intent)
    ? scenario.facts.intent
    : (scenario.facts?.service_type ? 'banho_tosa' : '')
  const preflight = serviceOrderType
    ? buildPetbotOperationalPreflight({
      facts, orderType: serviceOrderType, services: SERVICES, appointments: [],
      settings: SCHEDULE_SETTINGS, now: FIXED_NOW,
    })
    : { facts, toolRuns: [], context: null, resolvedService: null }
  const prompt = buildPetbotAgentV3Prompt({
    storeName: 'Quatro Patas', storePhone: STORE_INFORMATION.phone,
    storeLocation: STORE_INFORMATION.address, storeInformation: STORE_INFORMATION,
    customer: { name: 'Cliente de teste', known: true }, facts: { ...preflight.facts, ...(scenario.facts || {}) },
    pendingOrder: scenario.pendingOrder || null, operationalContext: preflight.context,
    timezone: 'America/Sao_Paulo', now: FIXED_NOW,
  })
  const forcePreparation = !scenario.pendingOrder && shouldForcePetbotServicePreparation({
    orderType: serviceOrderType, customerName: 'Cliente de teste', facts: preflight.facts,
    resolvedService: preflight.resolvedService, operationalContext: preflight.context,
  })

  const verifiedStoreReply = buildVerifiedStoreQuestionReply({
    message: scenario.message,
    storeInformation: STORE_INFORMATION,
  })
  if (verifiedStoreReply && !serviceOrderType && !scenario.pendingOrder) {
    const result = { reply: verifiedStoreReply, toolRuns: [], tokensUsed: 0 }
    return { result, errors: assertScenario(scenario, result) }
  }

  const requestedHandoffTarget = scenario.facts?.veterinary_risk === 'emergency'
    ? 'veterinaria'
    : explicitPetbotHandoffTarget(scenario.message, scenario.facts || {})
  if (requestedHandoffTarget) {
    const result = {
      reply: requestedHandoffTarget === 'veterinaria'
        ? 'Claro. Vou transferir seu atendimento para nossa equipe veterinária agora.'
        : 'Claro. Vou transferir seu atendimento para um atendente agora.',
      toolRuns: [{
        name: 'handoff_to_human', ok: true, status: 'transferred',
        result: { ok: true, target: requestedHandoffTarget },
      }],
      tokensUsed: 0,
    }
    return { result, errors: assertScenario(scenario, result) }
  }

  if (scenario.facts?.intent === 'duvida' && !serviceOrderType && !scenario.pendingOrder) {
    const result = {
      reply: buildUnknownStoreQuestionReply({ storeInformation: STORE_INFORMATION }),
      toolRuns: [],
      tokensUsed: 0,
    }
    return { result, errors: assertScenario(scenario, result) }
  }

  const result = await runPetbotAgent({
    model: MODEL,
    temperature: 0.3,
    systemPrompt: prompt,
    message: scenario.message,
    tools: PETBOT_AGENT_TOOLS,
    callModel,
    executeTool: async (toolCall) => {
      const name = toolCall?.function?.name || ''
      const args = JSON.parse(toolCall?.function?.arguments || '{}')
      const toolResult = fakeToolResult(name, args, scenario)
      if (name === 'create_confirmed_petshop_order' && ['committed', 'already_committed'].includes(toolResult.status)) orderResult = toolResult
      return toolResult
    },
    responseFormat: null,
    parseReply,
    initialToolChoice: forcePreparation ? { type: 'function', function: { name: 'prepare_petshop_service_booking' } } : 'auto',
    initialToolRuns: preflight.toolRuns,
    resolveTerminalReply: ({ toolName, result: toolResult }) => {
      if (toolName === 'prepare_petshop_service_booking' && toolResult?.status === 'prepared') return toolResult.summary
      if (toolName === 'create_confirmed_petshop_order' && ['committed', 'already_committed'].includes(toolResult?.status)) {
        return toolResult.status === 'already_committed'
          ? 'Esse pedido já estava confirmado e não foi duplicado.'
          : 'Pedido confirmado e registrado com sucesso.'
      }
      return ''
    },
    validateReply: ({ reply, toolRuns }) => {
      const validation = validatePetbotOperationalReply({
        reply, toolRuns, pendingOrder: scenario.pendingOrder || null, orderResult,
        timezone: 'America/Sao_Paulo',
      })
      return validation.ok ? { ok: true } : {
        ok: false,
        instruction: `Reescreva sem dados não validados: ${validation.problems.join('; ')}.`,
      }
    },
  })

  return { result, errors: assertScenario(scenario, result) }
}

function optionValue(prefix, fallback = '') {
  const option = process.argv.find((value) => value.startsWith(`${prefix}=`))
  return option ? option.slice(prefix.length + 1) : fallback
}

async function main() {
  if (process.argv.includes('--list')) {
    console.log(scenarios.map(({ id, message }) => ({ id, message })))
    return
  }
  if (!API_KEY) {
    console.error('Defina OPENAI_API_KEY para executar a avaliação viva do PetBot.')
    process.exitCode = 2
    return
  }

  const requestedScenario = optionValue('--scenario')
  const repeat = Math.max(1, Math.min(5, Number(optionValue('--repeat', '1')) || 1))
  const selected = requestedScenario ? scenarios.filter((scenario) => scenario.id === requestedScenario) : scenarios
  if (!selected.length) throw new Error(`Cenário não encontrado: ${requestedScenario}`)

  const report = []
  for (const scenario of selected) {
    for (let run = 1; run <= repeat; run += 1) {
      try {
        const { result, errors } = await runScenario(scenario)
        report.push({
          id: scenario.id, run, ok: errors.length === 0, errors, reply: result.reply,
          tools: result.toolRuns.map((toolRun) => toolRun.name), tokens: result.tokensUsed,
        })
      } catch (error) {
        report.push({ id: scenario.id, run, ok: false, errors: [error instanceof Error ? error.message : String(error)] })
      }
    }
  }

  console.log(JSON.stringify({ model: MODEL, passed: report.filter((item) => item.ok).length, total: report.length, report }, null, 2))
  if (report.some((item) => !item.ok)) process.exitCode = 1
}

await main()
