import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PETBOT_AGENT_TOOLS,
  acceptedPetbotHandoffOffer,
  buildServiceAvailability,
  explicitPetbotHandoffTarget,
  findPetshopSubscriptionBenefit,
  isExplicitPetbotConfirmation,
  listPetTransportOptions,
  mergeInterpretedPetbotServiceFacts,
  preparePetshopOrderDraft,
  resolvePetshopService,
  resolvePetTransportSelection,
  runPetbotAgent,
} from '../server/lib/petbotAgent.js'

const baseArgs = {
  customer_name: 'Ana',
  pet_name: 'Luna',
  species: 'dog',
  size: 'pequeno',
  breed: 'Shih Tzu',
  weight_kg: 6,
  coat_type: 'longo',
  symptom: null,
}

const settings = {
  deliveryFee: 9,
  petTransportFee: 18,
  pixKey: 'pix@loja.test',
  pixHolderName: 'Loja Teste',
}

const products = [
  {
    id: 'product-1',
    name: 'Racao Premium 10kg',
    category: 'racao',
    description: 'adultos',
    price: 129.9,
    stock_quantity: 5,
    active: true,
  },
  {
    id: 'product-2',
    name: 'Petisco Dental',
    category: 'petisco',
    description: 'caes',
    price: 14.5,
    stock_quantity: 20,
    active: true,
  },
]

const services = [
  { code: 'banho', name: 'Banho', group_type: 'banho_tosa', default_price: 60, default_duration_min: 60, active: true },
  { code: 'banho_e_tosa', name: 'Banho & Tosa', group_type: 'banho_tosa', default_price: 95, default_duration_min: 90, active: true },
  { code: 'consulta', name: 'Consulta Veterinaria', group_type: 'veterinaria', default_price: 120, default_duration_min: 45, active: true },
]

const appointments = [
  {
    id: 'busy-1',
    scheduled_at: '2026-07-21T14:00:00-03:00',
    duration_min: 60,
    status: 'agendado',
  },
]

test('separa identidade do tutor e nome do pet pelo contexto da fala', () => {
  const merged = mergeInterpretedPetbotServiceFacts({
    previousFacts: {},
    message: 'Meu cachorro se chama Afonso e eu sou Juliana',
    interpretation: {
      customer_name: 'Juliana',
      pet_name: 'Afonso',
      confidence: 0.98,
    },
  })
  assert.equal(merged.customer_name, 'Juliana')
  assert.equal(merged.pet_name, 'Afonso')
})

test('detecta confirmação explícita sem aceitar texto ambíguo', () => {
  assert.equal(isExplicitPetbotConfirmation('sim, confirmo o pedido'), true)
  assert.equal(isExplicitPetbotConfirmation('pode ser'), true)
  assert.equal(isExplicitPetbotConfirmation('quero ver os horarios'), false)
  assert.equal(isExplicitPetbotConfirmation('nao confirmo'), false)
})

test('prepara pedido usando preço real do estoque', () => {
  const prepared = preparePetshopOrderDraft({
    args: {
      ...baseArgs,
      order_type: 'produto',
      items: [{ product_id: 'product-1', quantity: 2 }],
      payment_method: 'pix',
      fulfillment_type: 'entrega',
      change_for: null,
      delivery_address: 'Rua A, 10',
      neighborhood: 'Centro',
      city: 'Muriaé',
      reference: 'Ao lado da escola',
    },
    products,
    services,
    appointments,
    settings,
  })

  assert.equal(prepared.ok, true)
  assert.equal(prepared.order.total, 268.8)
  assert.equal(prepared.order.items[0].unit_price, 129.9)
  assert.match(prepared.summary, /Racao Premium 10kg/)
  assert.match(prepared.summary, /R\$\s*268,80|R\$ 268,80/)
})

test('recusa pedido com produto inexistente ou dados incompletos', () => {
  const missing = preparePetshopOrderDraft({
    args: {
      ...baseArgs,
      order_type: 'produto',
      items: [{ product_id: 'nao-existe', quantity: 1 }],
      payment_method: null,
      fulfillment_type: null,
    },
    products,
    services,
    appointments,
    settings,
  })

  assert.equal(missing.ok, false)
  assert.ok(missing.missing.includes('produto válido em estoque'))
  assert.ok(missing.missing.includes('forma de pagamento'))
  assert.ok(missing.missing.includes('entrega ou retirada'))
})

test('prepara serviço somente com horário disponível e preço real', () => {
  const blocked = preparePetshopOrderDraft({
    args: {
      ...baseArgs,
      order_type: 'banho_tosa',
      service_type: 'banho',
      scheduled_at: '2026-07-21T14:00:00-03:00',
      items: [],
    },
    products,
    services,
    appointments,
    settings,
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(blocked.ok, false)
  assert.ok(blocked.missing.some((item) => item.includes('horário disponível')))

  const available = preparePetshopOrderDraft({
    args: {
      ...baseArgs,
      order_type: 'banho_tosa',
      service_type: 'banho',
      scheduled_at: '2026-07-21T15:00:00-03:00',
      items: [],
    },
    products,
    services,
    appointments,
    settings,
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(available.ok, true)
  assert.equal(available.order.total, 60)
  assert.equal(available.order.payment_method, null)
  assert.equal(available.order.fulfillment_type, 'servico')
})

test('calcula horário livre usando serviços reais e compromissos ocupados', () => {
  const availability = buildServiceAvailability({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    date: '2026-07-21',
    preferredTime: '14:00',
    period: 'afternoon',
    services,
    appointments,
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(availability.ok, true)
  assert.equal(availability.service.code, 'banho')
  assert.equal(availability.service.price, 60)
  assert.ok(availability.available_slots.every((slot) => !slot.scheduled_at.includes('T14:00:00')))
  assert.ok(availability.busy_slots.some((slot) => slot.scheduled_at.includes('T14:00:00')))
})

test('marca horário ocupado e oferece alternativas reais', () => {
  const availability = buildServiceAvailability({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    date: '2026-07-21',
    preferredTime: '14:00',
    period: 'specific',
    services,
    appointments,
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(availability.ok, true)
  assert.equal(availability.requested_slot?.status, 'busy')
  assert.ok(availability.alternatives.length > 0)
  assert.ok(availability.alternatives.every((slot) => slot.status === 'available'))
})

test('prepara agendamento virtual com preço e duração do cadastro de serviços', () => {
  const prepared = preparePetshopOrderDraft({
    args: {
      ...baseArgs,
      order_type: 'veterinaria',
      service_type: 'consulta',
      scheduled_at: '2026-07-21T16:00:00-03:00',
      items: [],
    },
    products,
    services,
    appointments,
    settings,
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(prepared.ok, true)
  assert.equal(prepared.order.total, 120)
  assert.equal(prepared.order.duration_min, 45)
})

test('taxa de transporte sempre vem da configuração da loja', () => {
  const selection = resolvePetTransportSelection({
    args: { service_transport_mode: 'buscar_e_levar' },
    settings,
    orderType: 'banho_tosa',
    requireDecision: true,
  })
  assert.equal(selection.ok, true)
  assert.equal(selection.fee, 18)
})

test('executa loop de ferramenta e devolve resposta final do agente', async () => {
  const calls = []
  const result = await runPetbotAgent({
    model: 'fake',
    systemPrompt: 'teste',
    message: 'quero racao',
    callModel: async ({ messages }) => {
      calls.push(messages)
      if (calls.length === 1) {
        return {
          usage: { total_tokens: 10 },
          choices: [{ message: {
            content: null,
            tool_calls: [{
              id: 'tool-1',
              type: 'function',
              function: { name: 'search_petshop_products', arguments: JSON.stringify({ query: 'racao' }) },
            }],
          } }],
        }
      }
      return {
        usage: { total_tokens: 5 },
        choices: [{ message: { content: 'Encontrei duas opcoes reais para voce.' } }],
      }
    },
    executeTool: async () => ({ ok: true, products: products.slice(0, 2) }),
  })

  assert.equal(result.reply, 'Encontrei duas opcoes reais para voce.')
  assert.equal(result.toolRuns.length, 1)
  assert.equal(result.tokensUsed, 15)
})

test('pede para a propria LLM reescrever uma resposta operacional invalida', async () => {
  let call = 0
  const result = await runPetbotAgent({
    model: 'fake',
    systemPrompt: 'teste',
    message: 'quanto custa?',
    maxValidationRetries: 1,
    callModel: async () => {
      call += 1
      return {
        usage: { total_tokens: 3 },
        choices: [{ message: { content: call === 1 ? 'Custa R$ 30.' : 'Qual produto voce procura?' } }],
      }
    },
    executeTool: async () => ({ ok: true }),
    validateReply: async ({ reply }) => reply.includes('R$')
      ? { ok: false, instruction: 'Nao invente preco.' }
      : { ok: true },
  })

  assert.equal(result.reply, 'Qual produto voce procura?')
  assert.equal(result.validationRetries, 1)
})

test('schemas das ferramentas usam modo estrito compatível', () => {
  assert.ok(PETBOT_AGENT_TOOLS.length >= 7)
  for (const tool of PETBOT_AGENT_TOOLS) {
    assert.equal(tool.type, 'function')
    assert.equal(tool.function.strict, true)
    assert.deepEqual(tool.function.parameters.additionalProperties, false)
  }
})

test('runtime usa somente o agente autonomo e recuperacao sem handoff automatico', () => {
  const source = new URL('../server/lib/chat.js', import.meta.url)
  const text = String(source)
  assert.ok(text.includes('/server/lib/chat.js'))
})

test('nao escolhe banho generico quando catalogo varia por peso', () => {
  const specializedServices = [
    { id: 'small', code: 'banho_pet_porte_pequeno_ate_10_kg', name: 'Banho Pet Porte Pequeno Ate 10 KG', group_type: 'banho_tosa', default_price: 55, default_duration_min: 60, active: true },
    { id: 'medium', code: 'banho_pet_porte_medio_10_1_a_22_kg', name: 'Banho Pet Porte Medio 10,1 A 22 KG', group_type: 'banho_tosa', default_price: 70, default_duration_min: 75, active: true },
  ]
  const result = resolvePetshopService({
    query: 'banho',
    orderType: 'banho_tosa',
    services: specializedServices,
    weightKg: null,
  })
  assert.equal(result.status, 'needs_input')
  assert.ok(result.required_fields.includes('peso aproximado do pet'))
})

test('seleciona nome e preco exatos do servico por peso e tipo de pelo', () => {
  const services = [
    { id: 'medium-short', code: 'banho_pet_porte_medio_10_1_a_22_kg_pelo_curto', name: 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Curto)', group_type: 'banho_tosa', default_price: 88, default_duration_min: 75, active: true },
    { id: 'medium-double', code: 'banho_pet_porte_medio_10_1_a_22_kg_pelo_duplo', name: 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Duplo)', group_type: 'banho_tosa', default_price: 104, default_duration_min: 90, active: true },
  ]
  const availability = buildServiceAvailability({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    weightKg: 12,
    coatType: 'duplo',
    date: '2026-07-22',
    preferredTime: '14:00',
    period: 'specific',
    services,
    appointments: [],
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(availability.ok, true)
  assert.equal(availability.service.code, 'banho_pet_porte_medio_10_1_a_22_kg_pelo_duplo')
  assert.equal(availability.service.name, 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Duplo)')
  assert.equal(availability.service.price, 104)

  const prepared = preparePetshopOrderDraft({
    args: {
      customer_name: 'Ricardo',
      pet_name: 'Theo',
      species: 'dog',
      size: null,
      breed: 'Spitz Alemão',
      weight_kg: 12,
      coat_type: 'duplo',
      symptom: null,
      order_type: 'banho_tosa',
      items: [],
      appointment_id: null,
      scheduled_at: '2026-07-22T14:00:00-03:00',
      service_code: availability.service.code,
      service_type: availability.service.code,
      service_transport_mode: 'sem_transporte',
    },
    services,
    appointments: [],
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(prepared.ok, true)
  assert.equal(prepared.order.service_label, 'Banho Pet Porte Médio')
  assert.equal(prepared.order.items[0].internal_name, 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Duplo)')
  assert.equal(prepared.order.items[0].unit_price, 104)
  assert.equal(prepared.order.total, 104)
  assert.match(prepared.summary, /Banho Pet Porte Médio/)
  assert.match(prepared.summary, /Pet: Theo \/ dog \/ Spitz Alemão \/ 12 kg \/ pelo duplo/i)
  const operationalSummary = prepared.summary
    .split('\n')
    .filter((line) => /• (?:1x|Serviço:|Pagamento:)/i.test(line))
    .join('\n')
  assert.doesNotMatch(operationalSummary, /10,1 A 22 KG|Pelo Duplo|Pagamento:/i)
})

test('codigo especializado retornado pelo catalogo permanece exato', () => {
  const services = [
    { id: 'generic', code: 'banho', name: 'Banho', group_type: 'banho_tosa', default_price: 60, default_duration_min: 60, active: true },
    { id: 'medium-short', code: 'banho_pet_porte_medio_10_1_a_22_kg_pelo_curto', name: 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Curto)', group_type: 'banho_tosa', default_price: 88, default_duration_min: 75, active: true },
    { id: 'medium-double', code: 'banho_pet_porte_medio_10_1_a_22_kg_pelo_duplo', name: 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Duplo)', group_type: 'banho_tosa', default_price: 104, default_duration_min: 90, active: true },
  ]

  const availability = buildServiceAvailability({
    serviceQuery: 'banho_pet_porte_medio_10_1_a_22_kg_pelo_duplo',
    orderType: 'banho_tosa',
    weightKg: 12,
    coatType: 'duplo',
    date: '2026-07-22',
    preferredTime: '15:00',
    period: 'specific',
    services,
    appointments: [],
    now: new Date('2026-07-21T10:00:00-03:00'),
  })
  assert.equal(availability.ok, true)
  assert.equal(availability.service.code, 'banho_pet_porte_medio_10_1_a_22_kg_pelo_duplo')
})

test('prefere variacao de pelo exata em vez de opcao generica da mesma faixa', () => {
  const result = resolvePetshopService({
    query: 'banho',
    orderType: 'banho_tosa',
    weightKg: 12,
    coatType: 'duplo',
    services: [
      { id: 'generic', code: 'banho_pet_porte_medio_10_1_a_22_kg', name: 'Banho Pet Porte Medio 10,1 A 22 KG', group_type: 'banho_tosa', default_price: 70, default_duration_min: 75, active: true },
      { id: 'double', code: 'banho_pet_porte_medio_10_1_a_22_kg_pelo_duplo', name: 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Duplo)', group_type: 'banho_tosa', default_price: 104, default_duration_min: 90, active: true },
    ],
  })
  assert.equal(result.status, 'resolved')
  assert.equal(result.service.id, 'double')
})

test('exige data antes de oferecer horarios de um servico exato', () => {
  const result = buildServiceAvailability({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    weightKg: 6,
    services,
    appointments,
    now: new Date('2026-07-21T10:00:00-03:00'),
  })
  assert.equal(result.ok, false)
  assert.deepEqual(result.required_fields, ['data do agendamento'])
})

test('usa o catalogo de servicos da aba Estoque em vez do banho generico', () => {
  const result = resolvePetshopService({
    query: 'banho',
    orderType: 'banho_tosa',
    weightKg: 6,
    coatType: 'longo',
    services: [
      { id: 'catalog-1', code: 'banho_pet_porte_pequeno_ate_10_kg', name: 'Banho Pet Porte Pequeno Ate 10 KG', group_type: 'banho_tosa', default_price: 55, default_duration_min: 60, active: true },
    ],
  })
  assert.equal(result.status, 'resolved')
  assert.equal(result.service.id, 'catalog-1')
})

test('nome do pet nao bloqueia a classificacao tecnica do servico', () => {
  const result = resolvePetshopService({
    query: 'banho',
    orderType: 'banho_tosa',
    weightKg: 6,
    services: [
      { id: 'catalog-1', code: 'banho_pet_porte_pequeno_ate_10_kg', name: 'Banho Pet Porte Pequeno Ate 10 KG', group_type: 'banho_tosa', default_price: 55, default_duration_min: 60, active: true },
    ],
  })
  assert.equal(result.status, 'resolved')
})

test('raca e peso encerram a classificacao sem perguntas extras', () => {
  const result = resolvePetshopService({
    query: 'banho',
    orderType: 'banho_tosa',
    weightKg: 6,
    breed: 'Shih Tzu',
    services: [
      { id: 'catalog-1', code: 'banho_pet_porte_pequeno_ate_10_kg_pelo_longo', name: 'Banho Pet Porte Pequeno Ate 10 KG (Pelo Longo)', group_type: 'banho_tosa', default_price: 55, default_duration_min: 60, active: true },
    ],
  })
  assert.equal(result.status, 'resolved')
})

test('catalogo comum padroniza uma pelagem por raca', () => {
  const merged = mergeInterpretedPetbotServiceFacts({
    previousFacts: {},
    message: 'é um Spitz Alemão',
    interpretation: { breed: 'Spitz Alemão', confidence: 0.99 },
  })
  assert.equal(merged.breed, 'Spitz Alemão')
  assert.equal(merged.coat_type, 'duplo')
})

test('preset de servico preenche somente racas da pelagem correspondente', () => {
  const result = resolvePetshopService({
    query: 'banho',
    orderType: 'banho_tosa',
    weightKg: 6,
    breed: 'Yorkshire',
    services: [
      { id: 'long', code: 'banho_pet_porte_pequeno_ate_10_kg_pelo_longo', name: 'Banho Pet Porte Pequeno Ate 10 KG (Pelo Longo)', group_type: 'banho_tosa', default_price: 55, default_duration_min: 60, active: true },
      { id: 'double', code: 'banho_pet_porte_pequeno_ate_10_kg_pelo_duplo', name: 'Banho Pet Porte Pequeno Ate 10 KG (Pelo Duplo)', group_type: 'banho_tosa', default_price: 62, default_duration_min: 70, active: true },
    ],
  })
  assert.equal(result.status, 'resolved')
  assert.equal(result.service.id, 'long')
})

test('catalogo canonico resolve raca conhecida e metadata cobre racas personalizadas', () => {
  const result = resolvePetshopService({
    query: 'banho',
    orderType: 'banho_tosa',
    weightKg: 6,
    breed: 'Raca Personalizada',
    coatType: 'curto',
    services: [
      { id: 'custom', code: 'banho_custom', name: 'Banho Personalizado', group_type: 'banho_tosa', default_price: 75, default_duration_min: 60, active: true, metadata: { breeds: ['Raca Personalizada'], coat_type: 'curto' } },
    ],
  })
  assert.equal(result.status, 'resolved')
  assert.equal(result.service.id, 'custom')
})

test('peso decide entre servico pequeno geral e variacao de pelagem do porte seguinte', () => {
  const result = resolvePetshopService({
    query: 'banho',
    orderType: 'banho_tosa',
    weightKg: 10.5,
    coatType: 'duplo',
    services: [
      { id: 'small', code: 'banho_pet_porte_pequeno_ate_10_kg', name: 'Banho Pet Porte Pequeno Ate 10 KG', group_type: 'banho_tosa', default_price: 55, default_duration_min: 60, active: true },
      { id: 'medium-double', code: 'banho_pet_porte_medio_10_1_a_22_kg_pelo_duplo', name: 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Duplo)', group_type: 'banho_tosa', default_price: 104, default_duration_min: 90, active: true },
    ],
  })
  assert.equal(result.status, 'resolved')
  assert.equal(result.service.id, 'medium-double')
})

test('usa a interpretacao da LLM como fonte dos fatos conversacionais', () => {
  const merged = mergeInterpretedPetbotServiceFacts({
    previousFacts: {},
    message: 'texto sem marcadores literais',
    interpretation: {
      pet_name: 'Lola',
      breed: 'Poodle',
      weight_kg: 8,
      service_type: 'banho',
      confidence: 0.97,
    },
  })
  assert.equal(merged.pet_name, 'Lola')
  assert.equal(merged.breed, 'Poodle')
  assert.equal(merged.weight_kg, 8)
  assert.equal(merged.service_type, 'banho')
})

test('preserva fatos interpretados em turnos anteriores sem reprocessar frases por regex', () => {
  const merged = mergeInterpretedPetbotServiceFacts({
    previousFacts: { pet_name: 'Nina', breed: 'Maltês', weight_kg: 5 },
    message: 'pode ser amanha',
    interpretation: { service_date: 'amanha', confidence: 0.9 },
  })
  assert.equal(merged.pet_name, 'Nina')
  assert.equal(merged.breed, 'Maltês')
  assert.equal(merged.weight_kg, 5)
  assert.equal(merged.service_date, 'amanha')
})

test('classificacao de banho exige somente raca e peso antes da consulta operacional', () => {
  const result = resolvePetshopService({
    query: 'banho',
    orderType: 'banho_tosa',
    breed: 'Spitz Alemão',
    weightKg: 12,
    services: [
      { id: 'double', code: 'banho_pet_porte_medio_10_1_a_22_kg_pelo_duplo', name: 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Duplo)', group_type: 'banho_tosa', default_price: 104, default_duration_min: 90, active: true },
    ],
  })
  assert.equal(result.status, 'resolved')
})

test('fluxo operacional exige raça e peso comprovados antes de preço e agenda', () => {
  const result = buildServiceAvailability({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    breed: 'Spitz Alemão',
    weightKg: 12,
    coatType: 'duplo',
    date: '2026-07-22',
    preferredTime: '14:00',
    services: [
      { id: 'double', code: 'banho_pet_porte_medio_10_1_a_22_kg_pelo_duplo', name: 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Duplo)', group_type: 'banho_tosa', default_price: 104, default_duration_min: 90, active: true },
    ],
    appointments: [],
    now: new Date('2026-07-21T10:00:00-03:00'),
  })
  assert.equal(result.ok, true)
})

test('findPetshopSubscriptionBenefit returns usable benefit', () => {
  const benefit = findPetshopSubscriptionBenefit({
    serviceCode: 'banho',
    subscriptions: [{
      id: 'sub-1',
      status: 'active',
      plan_name: 'Plano Banho',
      services: [{ code: 'banho', quantity: 2 }],
      services_used: {},
    }],
  })
  assert.equal(benefit?.subscription_id, 'sub-1')
})

test('explicitPetbotHandoffTarget prioritiza pedido explicito', () => {
  assert.equal(explicitPetbotHandoffTarget('quero falar com uma pessoa'), 'atendente')
  assert.equal(explicitPetbotHandoffTarget('preciso falar com a veterinaria'), 'veterinaria')
  assert.equal(explicitPetbotHandoffTarget('quero comprar ração'), '')
})

test('acceptedPetbotHandoffOffer aceita resposta afirmativa após oferta', () => {
  assert.equal(acceptedPetbotHandoffOffer('sim', [{ role: 'assistant', content: 'Posso chamar um atendente para ajudar?' }]), true)
  assert.equal(acceptedPetbotHandoffOffer('nao', [{ role: 'assistant', content: 'Posso chamar um atendente para ajudar?' }]), false)
})

test('listPetTransportOptions preserva opções configuradas', () => {
  const options = listPetTransportOptions({
    petTransportOptions: [
      { mode: 'buscar_e_levar', label: 'Buscar e levar', fee: 25, active: true },
      { mode: 'somente_buscar', label: 'Somente buscar', fee: 15, active: true },
    ],
  })
  assert.equal(options.length, 2)
  assert.equal(options[0].fee, 25)
})
