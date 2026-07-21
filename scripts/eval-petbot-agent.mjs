import { readFile } from 'node:fs/promises'
import process from 'node:process'

import {
  PETBOT_AGENT_TOOLS,
  runPetbotAgent,
} from '../server/lib/petbotAgent.js'
import {
  buildPetbotAgentV3Prompt,
  validatePetbotOperationalReply,
} from '../server/lib/petbotGrounding.js'

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini-2024-07-18'
const API_KEY = process.env.OPENAI_API_KEY || ''
const API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions'
const FIXED_NOW = new Date('2026-07-21T12:00:00-03:00')

const REPLY_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'petbot_eval_reply',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
  },
}

const scenarios = [
  {
    id: 'service_missing_weight',
    message: 'Olá, quero marcar banho para meu shih tzu.',
    facts: { species: 'dog', breed: 'Shih Tzu', service_type: 'banho' },
    expect: {
      anyTool: ['resolve_petshop_service'],
      replyPattern: /peso|kg|quilos?/i,
      forbidden: [/R\$/i, /\b\d{1,2}:\d{2}\b/],
    },
  },
  {
    id: 'service_ready_for_schedule',
    message: 'O Thor é um shih tzu de uns 8 kg. Pode ser hoje às 14h?',
    facts: {
      pet_name: 'Thor', species: 'dog', breed: 'Shih Tzu', weight_kg: 8,
      weight_label: 'aproximadamente 8 kg', service_type: 'banho',
      service_date: '2026-07-21', service_time: '14:00',
    },
    expect: {
      allTools: ['resolve_petshop_service', 'check_petshop_availability'],
      replyPattern: /14:00|14h|hor[aá]rio/i,
      forbidden: [/120,00/],
    },
  },
  {
    id: 'ambiguous_product',
    message: 'Tem ração para cachorro?',
    facts: { intent: 'produto', product_kind: 'ração', species: 'dog' },
    expect: {
      allTools: ['search_petshop_products'],
      replyPattern: /adult|filhote|fase/i,
      forbidden: [/estoque dispon[ií]vel sem/i],
    },
  },
  {
    id: 'confirm_pending_order',
    message: 'Sim, pode confirmar.',
    facts: {},
    pendingOrder: {
      id: 'pending-eval-1',
      prepared_at: '2026-07-21T11:59:00-03:00',
      summary: '1x Banho 0 a 10 kg - Pelo Longo; 21/07/2026 às 14:00; total R$ 90,00.',
      order: {},
    },
    expect: {
      allTools: ['create_confirmed_petshop_order'],
      replyPattern: /confirmad|agendad|registrad/i,
    },
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
      headers: {
        authorization: `Bearer ${API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(body?.error?.message || `OpenAI HTTP ${response.status}`)
    }
    return body
  } finally {
    clearTimeout(timeout)
  }
}

function fakeToolResult(name, args, scenario) {
  if (name === 'resolve_petshop_service') {
    if (!scenario.facts?.breed || !scenario.facts?.weight_kg) {
      return {
        ok: false,
        status: 'needs_input',
        missing_fields: [
          ...(!scenario.facts?.breed ? ['breed'] : []),
          ...(!scenario.facts?.weight_kg ? ['weight_kg'] : []),
        ],
        required_fields: [
          ...(!scenario.facts?.breed ? ['raça do pet'] : []),
          ...(!scenario.facts?.weight_kg ? ['peso aproximado do pet'] : []),
        ],
      }
    }
    return {
      ok: true,
      status: 'resolved',
      service: {
        id: 'catalog-service-long-small',
        code: 'catalog_service_long_small',
        product_id: '11111111-1111-1111-1111-111111111111',
        name: 'Banho 0 a 10 kg - Pelo Longo',
        price: 90,
        duration_min: 60,
      },
    }
  }

  if (name === 'check_petshop_availability') {
    return {
      ok: true,
      status: 'available',
      service: { id: args.service_id, name: 'Banho 0 a 10 kg - Pelo Longo', price: 90 },
      requested_slot: { available: true, time: '14:00' },
      available_slots: [
        { time: '14:00', scheduled_at: '2026-07-21T14:00:00-03:00', price: 90, duration_min: 60 },
        { time: '14:30', scheduled_at: '2026-07-21T14:30:00-03:00', price: 90, duration_min: 60 },
      ],
    }
  }

  if (name === 'search_petshop_products') {
    return {
      ok: true,
      status: 'candidates',
      differentiators: [{ field: 'age_category', label: 'fase de vida', values: ['adulto', 'filhote'] }],
      products: [
        { id: 'p1', name: 'Ração X Cães Adultos 10 kg', price: 150, stock_quantity: 3 },
        { id: 'p2', name: 'Ração X Cães Filhotes 10 kg', price: 165, stock_quantity: 2 },
      ],
    }
  }

  if (name === 'create_confirmed_petshop_order') {
    return {
      ok: true,
      status: 'committed',
      sale_id: 'sale-eval-1',
      order_id: 'order-eval-1',
      appointment_id: 'appointment-eval-1',
      total: 90,
      payment_status: 'nao_aplicavel',
    }
  }

  if (name === 'prepare_petshop_order') {
    return {
      ok: true,
      status: 'prepared',
      pending_order_id: 'pending-eval-generated',
      summary: 'Pedido validado; total R$ 90,00.',
      order: { total: 90 },
    }
  }

  if (name === 'handoff_to_human') return { ok: true, target: args.target, reason: args.reason }
  if (name === 'send_product_image') return { ok: true, product_name: 'Produto de teste', image_attached: true }
  return { ok: false, status: 'unknown_tool', error: `Ferramenta não simulada: ${name}` }
}

function assertScenario(scenario, result) {
  const tools = result.toolRuns.map((run) => run.name)
  const errors = []
  for (const expected of scenario.expect?.allTools || []) {
    if (!tools.includes(expected)) errors.push(`não chamou ${expected}`)
  }
  if (scenario.expect?.anyTool?.length && !scenario.expect.anyTool.some((name) => tools.includes(name))) {
    errors.push(`não chamou nenhuma de: ${scenario.expect.anyTool.join(', ')}`)
  }
  if (scenario.expect?.replyPattern && !scenario.expect.replyPattern.test(result.reply)) {
    errors.push(`resposta não corresponde a ${scenario.expect.replyPattern}`)
  }
  for (const forbidden of scenario.expect?.forbidden || []) {
    if (forbidden.test(result.reply)) errors.push(`resposta contém padrão proibido ${forbidden}`)
  }
  return errors
}

async function runScenario(scenario) {
  let orderResult = null
  const prompt = buildPetbotAgentV3Prompt({
    storeName: 'Pet Shop de Avaliação',
    customer: { name: 'Cliente de teste', known: true },
    facts: scenario.facts,
    pendingOrder: scenario.pendingOrder || null,
    timezone: 'America/Sao_Paulo',
    now: FIXED_NOW,
  })

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
      if (name === 'create_confirmed_petshop_order' && toolResult.status === 'committed') orderResult = toolResult
      return toolResult
    },
    responseFormat: REPLY_FORMAT,
    parseReply,
    validateReply: ({ reply, toolRuns }) => {
      const validation = validatePetbotOperationalReply({
        reply,
        toolRuns,
        pendingOrder: scenario.pendingOrder || null,
        orderResult,
        timezone: 'America/Sao_Paulo',
      })
      return validation.ok
        ? { ok: true }
        : {
          ok: false,
          instruction: `Reescreva sem dados não validados: ${validation.problems.join('; ')}.`,
        }
    },
  })

  return { result, errors: assertScenario(scenario, result) }
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

  const report = []
  for (const scenario of scenarios) {
    try {
      const { result, errors } = await runScenario(scenario)
      report.push({
        id: scenario.id,
        ok: errors.length === 0,
        errors,
        reply: result.reply,
        tools: result.toolRuns.map((run) => run.name),
        tokens: result.tokensUsed,
      })
    } catch (error) {
      report.push({ id: scenario.id, ok: false, errors: [error instanceof Error ? error.message : String(error)] })
    }
  }

  console.log(JSON.stringify({ model: MODEL, report }, null, 2))
  if (report.some((item) => !item.ok)) process.exitCode = 1
}

await main()
