import 'dotenv/config'
import process from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import {
  PETBOT_AGENT_TOOLS,
  runPetbotAgent,
} from '../server/lib/petbotAgent.js'
import { interpretPetbotMessageWithLlm } from '../server/lib/petbotAi.js'
import {
  buildPetbotAgentV3Prompt,
  validatePetbotOperationalReply,
} from '../server/lib/petbotGrounding.js'

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const API_KEY = process.env.OPENAI_API_KEY || ''
const API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions'
const FIXED_NOW = new Date('2026-07-27T10:00:00-03:00')
const REPORT_PATH = resolve(process.cwd(), process.env.PETBOT_HUMANIZED_REPORT || 'artifacts/petbot-humanized-50.json')

const STORE_INFORMATION = {
  address: 'Avenida Constantino Pinto, 191 - Centro - Muriaé',
  phone: '(32) 98520-5279',
  business_hours: {
    'segunda-feira': ['08:00-18:00'],
    'terça-feira': ['08:00-18:00'],
    'quarta-feira': ['08:00-18:00'],
    'quinta-feira': ['08:00-18:00'],
    'sexta-feira': ['08:00-18:00'],
    sábado: ['08:00-13:00'],
    domingo: [],
  },
  product_payment_methods: ['Pix', 'dinheiro', 'cartão'],
  service_payment_policy: 'Pagamento após a conclusão do serviço.',
  approved_messages: {
    unknown_information: 'Preciso confirmar essa informação com nossa equipe. Posso chamar um atendente para ajudar?',
  },
}

const PRODUCTS = [
  { id: 'food-bulk', name: 'Ração Premium Cães Adultos Granel', price: 20, stock_quantity: 30, image_url: 'https://example.test/food.jpg' },
  { id: 'food-bag', name: 'Ração Premium Cães Adultos Saco 15 kg', price: 210, stock_quantity: 4, image_url: 'https://example.test/bag.jpg' },
  { id: 'flea-10kg', name: 'Antipulgas Cães até 10 kg', price: 74.9, stock_quantity: 8, image_url: 'https://example.test/flea.jpg' },
  { id: 'shampoo', name: 'Shampoo Neutro 500 ml', price: 34.9, stock_quantity: 10, image_url: 'https://example.test/shampoo.jpg' },
  { id: 'toy', name: 'Brinquedo Mordedor Corda', price: 29.9, stock_quantity: 6, image_url: 'https://example.test/toy.jpg' },
]

const SERVICES = {
  banho: { id: 'service-bath', code: 'banho_pet', name: 'Banho Pet Porte Pequeno', group_type: 'banho_tosa', default_price: 72, default_duration_min: 40 },
  maquina: { id: 'service-machine', code: 'tosa_maquina', name: 'Banho e Tosa na Máquina', group_type: 'banho_tosa', default_price: 110, default_duration_min: 90 },
  tesoura: { id: 'service-scissors', code: 'tosa_tesoura', name: 'Banho e Tosa na Tesoura', group_type: 'banho_tosa', default_price: 145, default_duration_min: 120 },
  vet: { id: 'service-vet', code: 'consulta_veterinaria', name: 'Consulta Veterinária', group_type: 'veterinaria', default_price: 120, default_duration_min: 40 },
}

const TRANSPORT_OPTIONS = [
  { id: 'sem_transporte', label: 'Cliente leva e busca', fee: 0, active: true },
  { id: 'somente_buscar', label: 'Somente buscar', fee: 12, active: true },
  { id: 'somente_levar', label: 'Somente levar', fee: 14, active: true },
  { id: 'buscar_e_levar', label: 'Buscar e levar', fee: 24, active: true },
]

const pendingProduct = {
  id: 'pending-product-humanized',
  prepared_at: '2026-07-27T09:55:00-03:00',
  summary: '**Resumo final**\n• 1x Ração Premium Cães Adultos Saco 15 kg: R$ 210,00\n• Modalidade: retirada na loja\n• Total: R$ 210,00\n\nConfirma para separação?',
  order: {
    order_type: 'produto', customer_name: 'Cliente Teste', total: 210,
    items: [{ product_id: 'food-bag', name: 'Ração Premium Cães Adultos Saco 15 kg', quantity: 1, unit_price: 210 }],
    fulfillment_type: 'retirada', payment_method: 'a_combinar',
  },
}

const pendingService = {
  id: 'pending-service-humanized',
  prepared_at: '2026-07-27T09:55:00-03:00',
  summary: '**Resumo final**\n• Pet: Nina / dog / Shih Tzu / 6 kg\n• Serviço: Banho Pet Porte Pequeno\n• Horário: 29/07/2026, 14:00\n• Total: R$ 72,00\n\nConfirma o agendamento?',
  order: {
    order_type: 'banho_tosa', customer_name: 'Cliente Teste', pet_name: 'Nina', species: 'dog', breed: 'Shih Tzu', weight_kg: 6,
    service_type: 'banho_pet', service_label: 'Banho Pet Porte Pequeno', scheduled_at: '2026-07-29T14:00:00-03:00', total: 72,
    service_transport_mode: null,
  },
}

function scenario(id, group, message, expect = {}, extra = {}) {
  return { id, group, message, expect, ...extra }
}

function buildScenarios() {
  return [
    scenario('produto_01', 'produtos', 'Oi, vocês têm ração pra cachorro adulto? Pode me mostrar as opções?', { anyTools: ['search_petshop_products'], reply: /ração|granel|saco|opç/i }),
    scenario('produto_02', 'produtos', 'Preciso de um antipulgas pro meu cachorro, ele pesa uns 8 quilos.', { allTools: ['search_petshop_products'], query: /antipul|pulga/i }),
    scenario('produto_03', 'produtos', 'Tem shampoo neutro? Só queria saber o preço mesmo.', { allTools: ['search_petshop_products'], forbiddenTools: ['prepare_petshop_product_order'], reply: /shampoo|34|preço|valor/i }),
    scenario('produto_04', 'produtos', 'Quero dois sacos de ração de 15 kg e vou buscar aí na loja.', { allTools: ['search_petshop_products', 'prepare_petshop_product_order'], productOrder: { quantity: 2, fulfillment: 'retirada' } }),
    scenario('produto_05', 'produtos', 'Pode mandar uma ração de 15 kg na Rua das Flores 120, Centro, Muriaé, perto da praça? Pago no pix.', { allTools: ['search_petshop_products', 'prepare_petshop_product_order'], productOrder: { fulfillment: 'entrega', payment: 'pix' } }),
    scenario('produto_06', 'produtos', 'Queria um brinquedo de corda pro meu cachorro, tem foto?', { allTools: ['search_petshop_products', 'send_product_image'], reply: /foto|imagem|brinquedo|corda/i }),
    scenario('produto_07', 'produtos', 'Tem ração a granel? Queria só dois quilos e meio pra testar.', { allTools: ['search_petshop_products'], anyTools: ['prepare_petshop_product_order'], query: /ração|racao|granel/i }),
    scenario('produto_08', 'produtos', 'Vou retirar um shampoo e pago quando chegar aí.', { allTools: ['search_petshop_products', 'prepare_petshop_product_order'], productOrder: { fulfillment: 'retirada', payment: 'a_combinar' } }),
    scenario('produto_09', 'produtos', 'Esse antipulgas serve pra cachorro de 8 kg? Se servir, separa um pra mim, vou retirar na loja.', { allTools: ['search_petshop_products', 'prepare_petshop_product_order'], query: /antipul|pulga/i }),
    scenario('produto_10', 'produtos', 'Quero três brinquedos de corda, mas só se tiver em estoque. Vou retirar na loja.', { allTools: ['search_petshop_products', 'prepare_petshop_product_order'], productOrder: { quantity: 3 } }),

    scenario('servico_01', 'serviços', 'Queria marcar um banho pra Nina, shih tzu, 6 kg, quarta às 14h. Eu levo ela e não tenho observações.', { allTools: ['resolve_petshop_service', 'check_petshop_availability', 'prepare_petshop_service_booking'], service: /banho/i }),
    scenario('servico_02', 'serviços', 'Pode agendar banho e tosa na máquina pro Thor? Ele é poodle, 9 kg, quinta às 10h. Vou levar e não tenho observações.', { allTools: ['resolve_petshop_service', 'check_petshop_availability', 'prepare_petshop_service_booking'], service: /maquin|tosa/i }),
    scenario('servico_03', 'serviços', 'Quero tosa na tesoura pra Mel, maltês de 5 kg, sexta 13h. Levo na loja e não tenho observações.', { allTools: ['resolve_petshop_service', 'check_petshop_availability', 'prepare_petshop_service_booking'], service: /tesour|tosa/i }),
    scenario('servico_04', 'serviços', 'oi queria um bano pro meu shitzu de uns 7kg, quarta de tarde', { allTools: ['resolve_petshop_service', 'check_petshop_availability'], service: /banho/i, forbiddenTools: ['prepare_petshop_product_order'] }),
    scenario('servico_05', 'serviços', 'Quanto fica o banho de um spitz de 12 kg? Ainda não quero marcar.', { allTools: ['resolve_petshop_service'], forbiddenTools: ['prepare_petshop_service_booking'], reply: /banho|valor|preço|104|72/i }),
    scenario('servico_06', 'serviços', 'Vocês conseguem buscar meu cachorro para o banho?', { allTools: ['get_petshop_transport_options'], reply: /buscar|levar|MotoDog|transporte/i }),
    scenario('servico_07', 'serviços', 'Quero banho pro Bob, SRD 9 kg, quarta 15h. Quero buscar e levar pelo MotoDog. Rua das Flores 120, Centro, Muriaé, perto da praça. Sem observações.', { allTools: ['resolve_petshop_service', 'check_petshop_availability', 'get_petshop_transport_options', 'prepare_petshop_service_booking'], service: /banho/i }),
    scenario('servico_08', 'serviços', 'Tem horário para banho no domingo para a Nina, shih tzu de 6 kg?', { allTools: ['resolve_petshop_service', 'check_petshop_availability'], forbiddenTools: ['prepare_petshop_service_booking'], reply: /domingo|horário|dispon/i }),
    scenario('servico_09', 'serviços', 'Quero um banho pra minha cachorra, mas não sei o peso certinho ainda.', { allTools: ['resolve_petshop_service'], forbiddenTools: ['prepare_petshop_service_booking'], reply: /peso|aproximad/i }),
    scenario('servico_10', 'serviços', 'Quero marcar tosa, mas não sei se máquina ou tesoura. Pode me explicar primeiro?', { forbiddenTools: ['prepare_petshop_service_booking'], reply: /máquina|maquina|tesoura|diferen/i }),

    scenario('vet_01', 'veterinária', 'Queria marcar uma consulta pra minha cachorra Luna, 6 kg, ela está coçando muito. Quarta às 14h.', { allTools: ['resolve_petshop_service', 'check_petshop_availability', 'prepare_petshop_service_booking'], service: /veterin|consulta/i }),
    scenario('vet_02', 'veterinária', 'Quanto custa a consulta? Se tiver quinta 15h pode marcar pro Bob, cachorro pequeno com vômito desde ontem.', { allTools: ['resolve_petshop_service', 'check_petshop_availability', 'prepare_petshop_service_booking'], service: /veterin|consulta/i }),
    scenario('vet_03', 'veterinária', 'Meu cachorro está sem conseguir respirar e desmaiou agora.', { allTools: ['handoff_to_human'], forbiddenTools: ['prepare_petshop_service_booking'], reply: /urg|emerg|veterin|imediat/i }),
    scenario('vet_04', 'veterinária', 'Qual dose de dipirona eu dou pro meu cachorro de 8 kg?', { forbiddenTools: ['prepare_petshop_service_booking'], reply: /veterin|não posso|nao posso|consulta|atendente/i }),
    scenario('vet_05', 'veterinária', 'Quero consulta pra minha gata Jade, 4 kg, ela não está comendo. Sexta às 14h.', { allTools: ['resolve_petshop_service', 'check_petshop_availability', 'prepare_petshop_service_booking'], service: /veterin|consulta/i }),
    scenario('vet_06', 'veterinária', 'Tem consulta sábado de manhã para o Bob, cachorro SRD de 9 kg com coceira?', { allTools: ['resolve_petshop_service', 'check_petshop_availability'], forbiddenTools: ['prepare_petshop_service_booking'], reply: /sábado|sabado|horário|dispon/i }),
    scenario('vet_07', 'veterinária', 'Pode me passar direto pra veterinária?', { allTools: ['handoff_to_human'], handoff: 'veterinaria' }),
    scenario('vet_08', 'veterinária', 'Meu cachorro está mancando, mas está bem. Queria saber se vocês atendem isso.', { anyTools: ['resolve_petshop_service'], forbiddenTools: ['prepare_petshop_service_booking'], reply: /consulta|veterin|atend/i }),
    scenario('vet_09', 'veterinária', 'Quero marcar uma consulta, mas ainda não sei qual dia.', { allTools: ['resolve_petshop_service'], forbiddenTools: ['prepare_petshop_service_booking'], reply: /dia|data|quando/i }),
    scenario('vet_10', 'veterinária', 'Não quero mais essa consulta, pode cancelar o que ficou pendente.', { allTools: ['cancel_pending_petshop_order'], pendingOrder: pendingService }),

    scenario('confirmacao_01', 'confirmações', 'Confirmo.', { allTools: ['create_confirmed_petshop_order'], forbiddenTools: ['prepare_petshop_product_order'], reply: /confirmad|registrad|separa/i }, { pendingOrder: pendingProduct }),
    scenario('confirmacao_02', 'confirmações', 'sim, pode finalizar', { allTools: ['create_confirmed_petshop_order'], reply: /confirmad|registrad|agend/i }, { pendingOrder: pendingService }),
    scenario('confirmacao_03', 'confirmações', 'Pode confirmar de novo só pra garantir?', { allTools: ['create_confirmed_petshop_order'], reply: /já|ja|confirmad|não foi duplicado|nao foi duplicado/i }, { pendingOrder: pendingProduct, commitStatus: 'already_committed' }),
    scenario('confirmacao_04', 'confirmações', 'Sim, mas troca o horário para sexta às 15h.', { forbiddenTools: ['create_confirmed_petshop_order'], anyTools: ['cancel_pending_petshop_order', 'check_petshop_availability', 'prepare_petshop_service_booking'], pendingOrder: pendingService }),
    scenario('confirmacao_05', 'confirmações', 'Não confirma não, deixa pra outro dia.', { allTools: ['cancel_pending_petshop_order'], forbiddenTools: ['create_confirmed_petshop_order'], pendingOrder: pendingService }),
    scenario('confirmacao_06', 'confirmações', 'talvez, ainda vou ver aqui', { forbiddenTools: ['create_confirmed_petshop_order'], pendingOrder: pendingProduct, reply: /aguard|quando|confirm|sem problema|certo/i }),
    scenario('confirmacao_07', 'confirmações', 'pode separar por favor', { allTools: ['create_confirmed_petshop_order'], pendingOrder: pendingProduct }),
    scenario('confirmacao_08', 'confirmações', 'Sim, só que agora quero entrega.', { forbiddenTools: ['create_confirmed_petshop_order'], anyTools: ['cancel_pending_petshop_order', 'prepare_petshop_product_order'], pendingOrder: pendingProduct }),
    scenario('confirmacao_09', 'confirmações', 'Na verdade não é pra Nina, é pro Thor, 8 kg.', { forbiddenTools: ['create_confirmed_petshop_order'], anyTools: ['cancel_pending_petshop_order', 'resolve_petshop_service', 'prepare_petshop_service_booking'], pendingOrder: pendingService }),
    scenario('confirmacao_10', 'confirmações', 'Pode esperar um pouco antes de confirmar?', { forbiddenTools: ['create_confirmed_petshop_order'], pendingOrder: pendingService, reply: /aguard|sem problema|quando|confirm/i }),

    scenario('geral_01', 'geral', 'Qual o endereço de vocês e até que horas abre hoje?', { noTools: true, reply: /Constantino Pinto|191|18:00|18h/i }),
    scenario('geral_02', 'geral', 'Vocês abrem domingo?', { noTools: true, reply: /domingo|fechad|não abre|nao abre/i }),
    scenario('geral_03', 'geral', 'Aceita cartão e pix?', { noTools: true, reply: /cartão|cartao|Pix/i }),
    scenario('geral_04', 'geral', 'Quero falar com uma pessoa, por favor.', { allTools: ['handoff_to_human'], handoff: 'atendente' }),
    scenario('geral_05', 'geral', 'Esse preço está errado, quero reclamar com alguém.', { allTools: ['handoff_to_human'], forbiddenTools: ['prepare_petshop_product_order'], handoff: 'atendente' }),
    scenario('geral_06', 'geral', 'Consegue me dar um desconto nessa ração?', { allTools: ['handoff_to_human'], forbiddenTools: ['prepare_petshop_product_order'], handoff: 'atendente' }),
    scenario('geral_07', 'geral', 'Vocês hospedam cachorro quando a gente viaja?', { noTools: true, reply: /confirmar|equipe|atendente|não tenho essa informação|nao tenho essa informacao/i }),
    scenario('geral_08', 'geral', 'Quero marcar um negócio pro meu cachorro.', { noTools: true, reply: /qual|serviço|servico|banho|consulta|tosa/i }),
    scenario('geral_09', 'geral', 'Pode cancelar o pedido que ficou em aberto?', { allTools: ['cancel_pending_petshop_order'], pendingOrder: pendingProduct }),
    scenario('geral_10', 'geral', 'Tem como mandar a foto daquele brinquedo de corda?', { allTools: ['search_petshop_products', 'send_product_image'], reply: /foto|imagem|brinquedo/i }),
  ]
}

function parseReply(value = '') {
  try {
    const parsed = JSON.parse(String(value || ''))
    return parsed?.message || parsed?.reply || String(value || '')
  } catch {
    return String(value || '')
  }
}

async function callModel(payload) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)
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

function productCandidates(query = '') {
  const text = String(query || '').toLowerCase()
  if (/antipul|pulga/.test(text)) return [PRODUCTS[2]]
  if (/shampoo|xampu/.test(text)) return [PRODUCTS[3]]
  if (/brinquedo|corda|mordedor/.test(text)) return [PRODUCTS[4]]
  if (/15\s*kg|saco/.test(text)) return [PRODUCTS[1]]
  return [PRODUCTS[0], PRODUCTS[1]]
}

function serviceFromArgs(args = {}, message = '') {
  const text = `${args.service_query || ''} ${message}`.toLowerCase()
  if (/veterin|consulta/.test(text) || args.order_type === 'veterinaria') return SERVICES.vet
  if (/tesour/.test(text)) return SERVICES.tesoura
  if (/maquin/.test(text)) return SERVICES.maquina
  return SERVICES.banho
}

function preparedProduct(args = {}) {
  const items = Array.isArray(args.items) && args.items.length ? args.items : [{ product_id: 'food-bag', name: PRODUCTS[1].name, quantity: 1, upsell: false }]
  const total = items.reduce((sum, item) => {
    const product = PRODUCTS.find((candidate) => candidate.id === item.product_id) || PRODUCTS[1]
    return sum + Number(product.price) * Number(item.quantity || 1)
  }, 0) + (args.fulfillment_type === 'entrega' ? 12 : 0)
  return {
    ok: true,
    status: 'prepared',
    pending_order_id: 'humanized-product-prepared',
    summary: `**Resumo final**\n• Produtos: ${items.length}\n• Total: R$ ${total.toFixed(2).replace('.', ',')}\n\nConfirma para separação?`,
    order: { ...args, order_type: 'produto', total, items },
  }
}

function preparedService(args = {}, message = '') {
  const service = serviceFromArgs(args, message)
  const scheduled = args.scheduled_at || '2026-07-29T14:00:00-03:00'
  return {
    ok: true,
    status: 'prepared',
    pending_order_id: 'humanized-service-prepared',
    summary: `**Resumo final**\n• Serviço: ${service.name}\n• Horário: 29/07/2026, 14:00\n• Total: R$ ${Number(service.default_price).toFixed(2).replace('.', ',')}\n\nConfirma o agendamento?`,
    order: { ...args, service_type: service.code, service_label: service.name, scheduled_at: scheduled, total: service.default_price },
  }
}

function toolResult(name, args, item) {
  if (name === 'search_petshop_products') {
    const products = productCandidates(args.query || item.message)
    return { ok: true, status: products.length === 1 ? 'resolved' : 'candidates', products, differentiators: products.length > 1 ? [{ field: 'package', label: 'forma de venda', values: ['granel', 'saco 15 kg'] }] : [] }
  }
  if (name === 'send_product_image') {
    const product = PRODUCTS.find((candidate) => candidate.id === args.product_id) || PRODUCTS[4]
    return { ok: true, status: 'sent', product_name: product.name, image_attached: true }
  }
  if (name === 'resolve_petshop_service') {
    const service = serviceFromArgs(args, item.message)
    const missing = []
    if (args.order_type === 'banho_tosa' && !args.weight_kg) missing.push('weight_kg')
    if (args.order_type === 'banho_tosa' && !args.breed) missing.push('breed')
    if (missing.length) return { ok: false, status: 'needs_input', missing_fields: missing, required_fields: missing.map((field) => field === 'weight_kg' ? 'peso aproximado do pet' : 'raça do pet') }
    return { ok: true, status: 'resolved', service }
  }
  if (name === 'check_petshop_availability') {
    const weekend = /domingo|sábado|sabado/.test(item.message.toLowerCase())
    if (weekend) return { ok: true, status: 'unavailable', requested_slot: { available: false }, available_slots: [] }
    return {
      ok: true,
      status: 'available',
      requested_slot: { available: true, time: '14:00', scheduled_at: '2026-07-29T14:00:00-03:00' },
      available_slots: [{ time: '14:00', scheduled_at: '2026-07-29T14:00:00-03:00', price: 72, duration_min: 40 }],
    }
  }
  if (name === 'get_petshop_transport_options') return { ok: true, status: 'available', options: TRANSPORT_OPTIONS }
  if (name === 'prepare_petshop_product_order') return preparedProduct(args)
  if (name === 'prepare_petshop_service_booking') return preparedService(args, item.message)
  if (name === 'create_confirmed_petshop_order') {
    return {
      ok: true,
      status: item.commitStatus || 'committed',
      sale_id: 'sale-humanized',
      order_id: 'order-humanized',
      appointment_id: item.pendingOrder?.order?.order_type === 'produto' ? null : 'appointment-humanized',
      total: item.pendingOrder?.order?.total || 72,
      payment_status: 'a_receber',
    }
  }
  if (name === 'cancel_pending_petshop_order') return { ok: true, status: 'cancelled', reason: args.reason || null }
  if (name === 'handoff_to_human') return { ok: true, status: 'transferred', target: args.target, reason: args.reason }
  return { ok: false, status: 'unknown_tool', error: `Ferramenta sem simulação: ${name}` }
}

function inspectCalls(item, result, calls) {
  const errors = []
  const names = calls.map((call) => call.name)
  for (const name of item.expect.allTools || []) if (!names.includes(name)) errors.push(`não chamou ${name}`)
  if (item.expect.anyTools?.length && !item.expect.anyTools.some((name) => names.includes(name))) errors.push(`não chamou nenhuma de: ${item.expect.anyTools.join(', ')}`)
  for (const name of item.expect.forbiddenTools || []) if (names.includes(name)) errors.push(`chamou ferramenta proibida ${name}`)
  if (item.expect.noTools && names.length) errors.push(`chamou ferramentas sem necessidade: ${names.join(', ')}`)
  if (item.expect.reply && !item.expect.reply.test(result.reply || '')) errors.push(`resposta não corresponde a ${item.expect.reply}`)

  if (item.expect.query) {
    const search = calls.find((call) => call.name === 'search_petshop_products')
    if (!search || !item.expect.query.test(String(search.args.query || ''))) errors.push('consulta de produto não preservou a intenção')
  }
  if (item.expect.service) {
    const resolveCall = calls.find((call) => call.name === 'resolve_petshop_service')
    if (!resolveCall || !item.expect.service.test(`${resolveCall.args.service_query || ''} ${item.message}`)) errors.push('serviço resolvido não corresponde ao pedido')
  }
  if (item.expect.productOrder) {
    const prepare = calls.find((call) => call.name === 'prepare_petshop_product_order')
    if (!prepare) errors.push('pedido de produto não foi preparado')
    if (prepare && item.expect.productOrder.quantity && Number(prepare.args.items?.[0]?.quantity) !== item.expect.productOrder.quantity) errors.push('quantidade do produto incorreta')
    if (prepare && item.expect.productOrder.fulfillment && prepare.args.fulfillment_type !== item.expect.productOrder.fulfillment) errors.push('modalidade de entrega/retirada incorreta')
    if (prepare && item.expect.productOrder.payment && prepare.args.payment_method !== item.expect.productOrder.payment) errors.push('forma de pagamento incorreta')
  }
  if (item.expect.handoff) {
    const handoff = calls.find((call) => call.name === 'handoff_to_human')
    if (!handoff || handoff.args.target !== item.expect.handoff) errors.push(`handoff não foi direcionado para ${item.expect.handoff}`)
  }

  const unknown = result.toolRuns?.filter((run) => run.status === 'unknown_tool') || []
  if (unknown.length) errors.push(`ferramentas sem simulação: ${unknown.map((run) => run.name).join(', ')}`)
  return errors
}

async function runScenario(item) {
  const calls = []
  let orderResult = null
  const interpretation = await interpretPetbotMessageWithLlm({
    apiKey: API_KEY,
    model: MODEL,
    timeoutMs: 45_000,
    message: item.message,
    history: [],
    state: { petbot_agent: { pending_order: item.pendingOrder || null } },
    customerContext: 'Cliente Teste',
  })
  const prompt = buildPetbotAgentV3Prompt({
    storeName: 'Quatro Patas',
    storePhone: STORE_INFORMATION.phone,
    storeLocation: STORE_INFORMATION.address,
    storeInformation: STORE_INFORMATION,
    customer: { name: 'Cliente Teste', known: true },
    facts: interpretation || {},
    pendingOrder: item.pendingOrder || null,
    operationalContext: null,
    timezone: 'America/Sao_Paulo',
    now: FIXED_NOW,
  })

  const result = await runPetbotAgent({
    model: MODEL,
    temperature: 0.25,
    systemPrompt: prompt,
    message: item.message,
    tools: PETBOT_AGENT_TOOLS,
    callModel,
    executeTool: async (toolCall) => {
      const name = toolCall?.function?.name || ''
      let args = {}
      try { args = JSON.parse(toolCall?.function?.arguments || '{}') } catch { args = {} }
      calls.push({ name, args })
      const response = toolResult(name, args, item)
      if (name === 'create_confirmed_petshop_order' && ['committed', 'already_committed'].includes(response.status)) orderResult = response
      return response
    },
    responseFormat: null,
    parseReply,
    initialToolChoice: 'auto',
    resolveTerminalReply: ({ toolName, result: toolResponse }) => {
      if (toolName === 'prepare_petshop_product_order' && toolResponse?.status === 'prepared') return toolResponse.summary
      if (toolName === 'prepare_petshop_service_booking' && toolResponse?.status === 'prepared') return toolResponse.summary
      if (toolName === 'create_confirmed_petshop_order' && ['committed', 'already_committed'].includes(toolResponse?.status)) {
        return toolResponse.status === 'already_committed'
          ? 'Esse pedido já estava confirmado e não foi duplicado.'
          : 'Pedido confirmado e registrado com sucesso.'
      }
      if (toolName === 'cancel_pending_petshop_order' && toolResponse?.status === 'cancelled') return 'Tudo certo, descartei o pedido pendente.'
      return ''
    },
    validateReply: ({ reply, toolRuns }) => {
      const validation = validatePetbotOperationalReply({
        reply,
        toolRuns,
        pendingOrder: item.pendingOrder || null,
        orderResult,
        timezone: 'America/Sao_Paulo',
      })
      return validation.ok ? { ok: true } : { ok: false, instruction: `Reescreva sem dados não validados: ${validation.problems.join('; ')}.` }
    },
  })

  return { result, calls, interpretation, errors: inspectCalls(item, result, calls) }
}

async function main() {
  if (!API_KEY) throw new Error('Defina OPENAI_API_KEY para executar a bateria humanizada.')
  const scenarios = buildScenarios()
  if (scenarios.length !== 50) throw new Error(`A bateria precisa conter 50 cenários; encontrou ${scenarios.length}.`)

  const rows = []
  for (const [index, item] of scenarios.entries()) {
    process.stdout.write(`[${index + 1}/50] ${item.id}: ${item.message}\n`)
    try {
      const { result, calls, interpretation, errors } = await runScenario(item)
      rows.push({
        id: item.id,
        group: item.group,
        message: item.message,
        ok: errors.length === 0,
        errors,
        reply: result.reply,
        interpretation,
        tools: calls,
        tokens: result.tokensUsed,
        validation_retries: result.validationRetries || 0,
      })
    } catch (error) {
      rows.push({ id: item.id, group: item.group, message: item.message, ok: false, errors: [error instanceof Error ? error.message : String(error)], tools: [] })
    }
  }

  const toolCoverage = {}
  for (const tool of PETBOT_AGENT_TOOLS) toolCoverage[tool.function.name] = 0
  for (const row of rows) for (const call of row.tools || []) toolCoverage[call.name] = (toolCoverage[call.name] || 0) + 1
  const uncoveredTools = Object.entries(toolCoverage).filter(([, count]) => count === 0).map(([name]) => name)
  const groups = [...new Set(rows.map((row) => row.group))].map((group) => {
    const selected = rows.filter((row) => row.group === group)
    return { group, total: selected.length, passed: selected.filter((row) => row.ok).length, failed: selected.filter((row) => !row.ok).length }
  })
  const report = {
    suite: 'petbot_humanized_50',
    model: MODEL,
    generated_at: new Date().toISOString(),
    total: rows.length,
    passed: rows.filter((row) => row.ok).length,
    failed: rows.filter((row) => !row.ok).length,
    groups,
    tool_coverage: toolCoverage,
    uncovered_tools: uncoveredTools,
    report: rows,
  }

  await mkdir(dirname(REPORT_PATH), { recursive: true })
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report, null, 2))
  if (report.failed || uncoveredTools.length) process.exitCode = 1
}

await main()
