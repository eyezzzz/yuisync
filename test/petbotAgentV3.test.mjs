import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PETBOT_AGENT_TOOLS,
  buildServiceAvailability,
  findPetshopSubscriptionBenefit,
  groundPetbotServiceArgs,
  listPetTransportOptions,
  mergeInterpretedPetbotServiceFacts,
  preparePetshopOrderDraft,
  resolvePetshopService,
  runPetbotAgent,
  serviceFromCatalogProduct,
} from '../server/lib/petbotAgent.js'
import {
  analyzeProductDifferentiation,
  buildPetbotAgentV3Prompt,
  validatePetbotOperationalReply,
} from '../server/lib/petbotGrounding.js'
import { buildPetbotSearchText, recoverPetbotContextFromHistory } from '../server/lib/petbotContext.js'

const service = {
  id: 'service-long-small',
  code: 'banho_pequeno_longo',
  name: 'Banho 0 a 10 kg - Pelo Longo',
  group_type: 'banho_tosa',
  default_price: 90,
  default_duration_min: 60,
  active: true,
  weight_range: { min: 0, max: 10 },
  coat_type: 'longo',
  species: 'dog',
}

test('prompt v3 entrega autonomia conversacional sem despejar catalogo ou frase pronta', () => {
  const prompt = buildPetbotAgentV3Prompt({
    storeName: 'Pet Feliz',
    customer: { name: 'Gabriel' },
    facts: { breed: 'Shih Tzu' },
  })

  assert.match(prompt, /Você decide como conduzir a conversa e quais ferramentas chamar/)
  assert.match(prompt, /servidor é a fonte de verdade/)
  assert.doesNotMatch(prompt, /PRECO:|QTD:|ID:/)
  assert.doesNotMatch(prompt, /Qual é o peso exato|Não vou deduzir|Bom dia! Claro/)
})

test('prompt v3 recebe perfil e pets salvos sem transformar isso em roteiro fixo', () => {
  const prompt = buildPetbotAgentV3Prompt({
    storeName: 'Pet Feliz',
    customer: {
      name: 'Gabriel',
      address: 'Rua A, 10',
      saved_pets: [{ name: 'Thor', species: 'dog', breed: 'Shih Tzu', weight_kg: 8 }],
    },
  })

  assert.match(prompt, /Thor/)
  assert.match(prompt, /Shih Tzu/)
  assert.match(prompt, /Não repita perguntas já respondidas/)
  assert.doesNotMatch(prompt, /Qual é o peso/)
})

test('mudanca explicita de pet nao herda peso ou raca do pet anterior', () => {
  const facts = mergeInterpretedPetbotServiceFacts({
    interpretation: { pet_name: 'Max', breed: 'Spitz Alemão' },
    previousFacts: {
      pet_name: 'Thor', species: 'dog', breed: 'Shih Tzu', weight_kg: 8,
      weight_label: '8 kg', coat_type: 'longo', coat_type_source: 'breed_catalog',
    },
  })

  assert.equal(facts.pet_name, 'Max')
  assert.equal(facts.breed, 'Spitz Alemão')
  assert.equal(facts.weight_kg, null)
  assert.equal(facts.coat_type, 'duplo')
  assert.equal(facts.pet_identity_changed, true)
})

test('grounding bloqueia preco, agenda, estoque e confirmacao inventados', () => {
  const invalid = validatePetbotOperationalReply({
    reply: 'Temos em estoque por R$ 120,00. O horário 14:00 está disponível e o agendamento foi confirmado.',
    toolRuns: [],
  })
  assert.equal(invalid.ok, false)
  assert.ok(invalid.problems.some((item) => /valor não validado/.test(item)))
  assert.ok(invalid.problems.some((item) => /estoque/.test(item)))
  assert.ok(invalid.problems.some((item) => /agenda/.test(item)))
  assert.ok(invalid.problems.some((item) => /transação/.test(item)))

  const valid = validatePetbotOperationalReply({
    reply: 'Temos em estoque por R$ 90,00. O horário 14:00 está disponível e o agendamento foi confirmado.',
    toolRuns: [
      { name: 'search_petshop_products', ok: true, result: { products: [{ price: 90, stock_quantity: 3 }] } },
      { name: 'check_petshop_availability', ok: true, result: { status: 'available', available_slots: [{ time: '14:00', price: 90 }] } },
      { name: 'create_confirmed_petshop_order', ok: true, result: { status: 'committed', total: 90 } },
    ],
  })
  assert.equal(valid.ok, true)
})

test('diferenciacao de produto pergunta somente atributos que realmente variam', () => {
  const result = analyzeProductDifferentiation([
    { id: '1', name: 'Ração X Cães Adultos 10 kg', category: 'Ração', species_target: 'dog', bot_metadata: { age: 'adulto', brand: 'x', package_kg: 10 } },
    { id: '2', name: 'Ração X Cães Filhotes 10 kg', category: 'Ração', species_target: 'dog', bot_metadata: { age: 'filhote', brand: 'x', package_kg: 10 } },
  ], { species: 'dog', brand: 'x', package_kg: 10 })

  assert.deepEqual(result.differentiators.map((item) => item.field), ['age_category'])
})

test('servico respeita especie e nao seleciona variante de outro animal', () => {
  const result = resolvePetshopService({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    species: 'cat',
    breed: 'Persa',
    weightKg: 5,
    coatType: 'longo',
    services: [
      { ...service, id: 'dog', species: 'dog' },
      { ...service, id: 'cat', code: 'banho_gato_longo', name: 'Banho Gato Pelo Longo', species: 'cat', default_price: 110 },
    ],
  })

  assert.equal(result.ok, true)
  assert.equal(result.service.id, 'cat')
  assert.equal(result.service.price, 110)
})

test('banho de cachorro elimina servico de gato mesmo sem metadado de especie', () => {
  const result = resolvePetshopService({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    species: 'dog',
    breed: 'Shih Tzu',
    weightKg: 8,
    coatType: 'longo',
    services: [
      {
        id: 'cat', code: 'banho_gato', name: 'BANHO GATO (TODAS AS PELAGENS)',
        group_type: 'banho_tosa', default_price: 120, default_duration_min: 60,
        active: true, catalog_source: 'products', source_product_id: 'cat-product',
      },
      {
        id: 'small', code: 'banho_pet_pequeno',
        name: 'BANHO PET PORTE PEQUENO 0 KG A 10 KG (TODAS AS PELAGENS)',
        group_type: 'banho_tosa', default_price: 72, default_duration_min: 60,
        active: true, catalog_source: 'products', source_product_id: 'dog-small-product',
      },
    ],
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 'resolved')
  assert.equal(result.service.id, 'small')
  assert.equal(result.service.price, 72)
  assert.equal(result.service.species, 'dog')
})

test('banho geral de cachorro ate 10 kg tem prioridade sobre variacao por pelagem', () => {
  const result = resolvePetshopService({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    species: 'dog',
    breed: 'Shih Tzu',
    weightKg: 8,
    coatType: 'longo',
    services: [
      {
        id: 'general', code: 'banho_pet_pequeno',
        name: 'BANHO PET PORTE PEQUENO 0 KG A 10 KG (TODAS AS PELAGENS)',
        group_type: 'banho_tosa', default_price: 72, default_duration_min: 60,
        active: true, catalog_source: 'products', source_product_id: 'general-product', species: 'dog',
      },
      {
        id: 'long', code: 'banho_pet_pequeno_longo',
        name: 'BANHO PET PORTE PEQUENO 0 KG A 10 KG (PELO LONGO)',
        group_type: 'banho_tosa', default_price: 95, default_duration_min: 60,
        active: true, catalog_source: 'products', source_product_id: 'long-product', species: 'dog',
      },
    ],
  })

  assert.equal(result.ok, true)
  assert.equal(result.service.id, 'general')
  assert.equal(result.service.price, 72)
})

test('catalogo escolhe uma unica opcao canonica quando existem banhos pequenos duplicados', () => {
  const result = resolvePetshopService({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    species: 'dog',
    breed: 'Shih Tzu',
    weightKg: 8,
    coatType: 'longo',
    services: [
      {
        id: 'legacy', code: 'banho_pequeno_legacy',
        name: 'Banho até 10 kg todas as pelagens',
        group_type: 'banho_tosa', default_price: 60, default_duration_min: 60,
        active: true, catalog_source: 'petshop_services', species: 'dog',
        weight_range: { min: 0, max: 10 }, coat_type: 'todas', all_breeds: true,
      },
      {
        id: 'catalog', code: 'banho_pet_pequeno',
        name: 'BANHO PET PORTE PEQUENO 0 KG A 10 KG (TODAS AS PELAGENS)',
        group_type: 'banho_tosa', default_price: 72, default_duration_min: 60,
        active: true, catalog_source: 'products', source_product_id: 'catalog-product', species: 'dog',
        weight_range: { min: 0, max: 10 }, coat_type: 'todas', all_breeds: true,
      },
    ],
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 'resolved')
  assert.equal(result.service.id, 'catalog')
  assert.equal(result.service.price, 72)
})

test('area explicita do servico no cadastro tem prioridade sobre inferencia pelo nome', () => {
  const product = serviceFromCatalogProduct({
    id: 'product-1',
    name: 'Avaliação de pele e pelagem',
    category: 'Serviço',
    price: 150,
    active: true,
    bot_metadata: {
      product_type: 'servico',
      service_group: 'veterinaria',
      duration_min: 40,
    },
  })

  assert.equal(product.group_type, 'veterinaria')
})

test('banho de gato continua selecionando somente o catalogo felino', () => {
  const result = resolvePetshopService({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    species: 'cat',
    breed: 'Persa',
    weightKg: 5,
    coatType: 'longo',
    services: [
      {
        id: 'cat', code: 'banho_gato', name: 'BANHO GATO (TODAS AS PELAGENS)',
        group_type: 'banho_tosa', default_price: 120, default_duration_min: 60,
        active: true, catalog_source: 'products', source_product_id: 'cat-product',
      },
      {
        id: 'small', code: 'banho_pet_pequeno',
        name: 'BANHO PET PORTE PEQUENO 0 KG A 10 KG (TODAS AS PELAGENS)',
        group_type: 'banho_tosa', default_price: 72, default_duration_min: 60,
        active: true, catalog_source: 'products', source_product_id: 'dog-small-product',
      },
    ],
  })

  assert.equal(result.ok, true)
  assert.equal(result.service.id, 'cat')
  assert.equal(result.service.species, 'cat')
})

test('agenda respeita expediente, antecedencia e capacidade configurados', () => {
  const settings = {
    petbotTimezone: 'America/Sao_Paulo',
    petbotBusinessHours: {
      1: [{ open: '09:00', close: '12:00' }],
      2: [], 3: [], 4: [], 5: [], 6: [], 7: [],
    },
    petbotSlotIntervalMin: 30,
    petbotBookingLeadTimeMin: 60,
    petbotBookingCapacity: 2,
  }
  const common = {
    serviceQuery: service.code,
    orderType: 'banho_tosa',
    species: 'dog',
    breed: 'Shih Tzu',
    weightKg: 8,
    coatType: 'longo',
    services: [service],
    settings,
    now: new Date('2026-07-20T08:00:00-03:00'), // segunda-feira
  }

  const capacityOneUsed = buildServiceAvailability({
    ...common,
    date: '2026-07-20',
    preferredTime: '10:00',
    appointments: [{ scheduled_at: '2026-07-20T10:00:00-03:00', duration_min: 60, status: 'agendado' }],
  })
  assert.equal(capacityOneUsed.requested_slot.available, true)
  assert.equal(capacityOneUsed.available_slots.find((slot) => slot.time === '10:00').capacity_remaining, 1)

  const capacityFull = buildServiceAvailability({
    ...common,
    date: '2026-07-20',
    preferredTime: '10:00',
    appointments: [
      { scheduled_at: '2026-07-20T10:00:00-03:00', duration_min: 60, status: 'agendado' },
      { scheduled_at: '2026-07-20T10:00:00-03:00', duration_min: 60, status: 'confirmado' },
    ],
  })
  assert.equal(capacityFull.requested_slot.available, false)

  const closed = buildServiceAvailability({ ...common, date: '2026-07-21', preferredTime: '10:00', appointments: [] })
  assert.equal(closed.status, 'unavailable')
  assert.equal(closed.available_slots.length, 0)
})

test('preparo reconhece o mesmo instante mesmo com representacoes ISO diferentes', () => {
  const prepared = preparePetshopOrderDraft({
    args: {
      customer_name: 'Gabriel', pet_name: 'Thor', species: 'dog', breed: 'Shih Tzu', weight_kg: 8,
      coat_type: 'longo', order_type: 'banho_tosa', items: [], appointment_id: null,
      scheduled_at: '2026-07-22T14:00:00.000-03:00', service_code: service.code,
      service_type: service.code, service_transport_mode: 'sem_transporte',
    },
    services: [service],
    appointments: [],
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(prepared.ok, true)
  assert.equal(prepared.order.scheduled_at, '2026-07-22T14:00:00-03:00')
})

test('loop do agente registra passos, retries e duracao de ferramentas', async () => {
  let calls = 0
  const result = await runPetbotAgent({
    model: 'gpt-4o-mini-2024-07-18',
    systemPrompt: 'Use ferramentas.',
    message: 'Quero produto.',
    callModel: async () => {
      calls += 1
      if (calls === 1) {
        return { choices: [{ message: { content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'search_petshop_products', arguments: '{}' } }] } }], usage: { total_tokens: 10 } }
      }
      return { choices: [{ message: { content: 'Resposta final.' } }], usage: { total_tokens: 5 } }
    },
    executeTool: async () => ({ ok: true, status: 'resolved' }),
  })

  assert.equal(result.steps, 2)
  assert.equal(result.tokensUsed, 15)
  assert.equal(result.validationRetries, 0)
  assert.equal(result.toolRuns.length, 1)
  assert.equal(typeof result.toolRuns[0].duration_ms, 'number')
  assert.equal(typeof result.durationMs, 'number')
})

test('fatos semanticos podem vir do tool calling sem criar roteiro deterministico', () => {
  const fromAgent = groundPetbotServiceArgs({
    pet_name: 'Thor',
    species: 'dog',
    breed: 'Shih Tzu',
    weight_kg: 8,
    weight_label: 'uns 8 kg',
    weight_estimated: true,
  }, {})

  assert.equal(fromAgent.pet_name, 'Thor')
  assert.equal(fromAgent.breed, 'Shih Tzu')
  assert.equal(fromAgent.weight_kg, 8)
  assert.equal(fromAgent.weight_label, 'uns 8 kg')

  const trustedContextWins = groundPetbotServiceArgs({ breed: 'Spitz Alemão', weight_kg: 12 }, {
    breed: 'Shih Tzu', breed_explicit: true,
    weight_kg: 8, weight_label: '8 kg', weight_explicit: true,
  })
  assert.equal(trustedContextWins.breed, 'Shih Tzu')
  assert.equal(trustedContextWins.weight_kg, 8)
})

test('recuperacao de contexto usa apenas estado estruturado e nao reinterpreta texto por regex', () => {
  const recovered = recoverPetbotContextFromHistory({}, {}, [
    { role: 'user', content: 'meu shih tzu pesa 8 kg' },
  ])
  assert.deepEqual(recovered, {})

  const structured = recoverPetbotContextFromHistory({}, { customer_name: 'Gabriel' }, [
    { role: 'assistant', metadata: { petbot_state: { breed: 'Shih Tzu', weightKg: 8 } } },
  ])
  assert.equal(structured.petbot.breed, 'Shih Tzu')
  assert.match(buildPetbotSearchText('banho', structured), /Shih Tzu/)
})

test('opcoes de transporte sao lidas da configuracao real da loja', () => {
  assert.deepEqual(listPetTransportOptions({
    petTransportFee: 999,
    petTransportOptions: [
      { id: 'buscar', label: 'Somente buscar', fee: 18, active: true },
      { id: 'inativo', label: 'Inativo', fee: 1, active: false },
    ],
  }), [{ id: 'buscar', label: 'Somente buscar', fee: 18 }])
})



test('beneficio de plano e resolvido pelo backend e zera apenas o servico', () => {
  const benefit = findPetshopSubscriptionBenefit(service, [{
    subscription_id: 'subscription-1',
    plan_name: 'Clube Banho',
    service_type: 'banho',
    remaining: 2,
  }])
  assert.equal(benefit.plan_name, 'Clube Banho')

  const prepared = preparePetshopOrderDraft({
    args: {
      customer_name: 'Gabriel', pet_name: 'Thor', species: 'dog', breed: 'Shih Tzu', weight_kg: 8,
      coat_type: 'longo', order_type: 'banho_tosa', items: [], appointment_id: null,
      scheduled_at: '2026-07-22T14:00:00-03:00', service_code: service.code,
      service_type: service.code, service_transport_mode: 'sem_transporte',
    },
    services: [service],
    appointments: [],
    subscriptionBenefits: [{
      subscription_id: 'subscription-1',
      plan_name: 'Clube Banho',
      service_type: 'banho',
      remaining: 2,
    }],
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(prepared.ok, true)
  assert.equal(prepared.order.regular_service_price, 90)
  assert.equal(prepared.order.items[0].unit_price, 0)
  assert.equal(prepared.order.total, 0)
  assert.equal(prepared.order.subscription_benefit.plan_name, 'Clube Banho')
  assert.match(prepared.summary, /Benefício do plano: Clube Banho aplicado/)
})

test('agente expoe cancelamento de pedido pendente sem resposta fixa', () => {
  const cancelTool = PETBOT_AGENT_TOOLS.find((tool) => tool.function.name === 'cancel_pending_petshop_order')
  assert.ok(cancelTool)
  assert.equal(cancelTool.function.strict, true)
  assert.match(cancelTool.function.description, /Cancela e descarta/)
})

test('agente interrompe ferramenta repetida e finaliza naturalmente sem handoff', async () => {
  const calls = []
  let sequence = 0
  const result = await runPetbotAgent({
    model: 'gpt-4o-mini-test',
    systemPrompt: 'Atenda naturalmente.',
    message: 'Tem horário hoje às 13h para o Thor?',
    maxSteps: 7,
    callModel: async (params) => {
      calls.push(params)
      sequence += 1
      if (sequence <= 2) {
        return {
          usage: { total_tokens: 10 },
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: `call-${sequence}`,
                type: 'function',
                function: {
                  name: 'resolve_petshop_service',
                  arguments: JSON.stringify({
                    service_query: 'banho',
                    order_type: 'banho_tosa',
                    species: 'dog',
                    breed: null,
                    weight_kg: null,
                    coat_type: null,
                  }),
                },
              }],
            },
          }],
        }
      }
      return {
        usage: { total_tokens: 5 },
        choices: [{ message: { content: JSON.stringify({ message: 'Claro! Qual é a raça e o peso aproximado do Thor?' }) } }],
      }
    },
    executeTool: async () => ({
      ok: false,
      status: 'needs_input',
      missing_fields: ['breed', 'weight_kg'],
      required_fields: ['raça do pet', 'peso aproximado do pet'],
    }),
    responseFormat: {
      type: 'json_schema',
      json_schema: {
        name: 'reply',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { message: { type: 'string' } },
          required: ['message'],
        },
      },
    },
    parseReply: (content) => content ? JSON.parse(content) : { message: '' },
    validateReply: () => ({ ok: true }),
  })

  assert.equal(result.recovered, true)
  assert.match(result.reply, /raça/i)
  assert.match(result.reply, /peso/i)
  assert.equal(result.toolRuns.length, 2)
  assert.equal(calls.length, 3)
  assert.equal('tools' in calls[2], false)
  assert.equal('tool_choice' in calls[2], false)
})

test('resposta vazia do modelo entra em finalizacao segura sem handoff automatico', async () => {
  let sequence = 0
  const result = await runPetbotAgent({
    model: 'gpt-4o-mini-test',
    systemPrompt: 'Atenda naturalmente.',
    message: 'Quero agendar um banho.',
    callModel: async () => {
      sequence += 1
      if (sequence === 1) return { usage: { total_tokens: 2 }, choices: [{ message: { content: '' } }] }
      return {
        usage: { total_tokens: 3 },
        choices: [{ message: { content: JSON.stringify({ message: 'Claro! Para qual pet você quer agendar?' }) } }],
      }
    },
    executeTool: async () => ({ ok: true }),
    parseReply: (content) => content ? JSON.parse(content) : { message: '' },
    validateReply: () => ({ ok: true }),
  })

  assert.equal(result.recovered, true)
  assert.match(result.reply, /qual pet/i)
  assert.equal(sequence, 2)
})

test('falha temporaria do modelo depois de uma ferramenta tenta finalizar o turno antes de propagar erro', async () => {
  let sequence = 0
  const result = await runPetbotAgent({
    model: 'gpt-4o-mini-test',
    systemPrompt: 'Atenda naturalmente.',
    message: 'É um Shih Tzu de 8 kg.',
    callModel: async (params) => {
      sequence += 1
      if (sequence === 1) {
        return {
          usage: { total_tokens: 3 },
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'resolve-1',
                type: 'function',
                function: {
                  name: 'resolve_petshop_service',
                  arguments: JSON.stringify({
                    service_query: 'banho', order_type: 'banho_tosa', species: 'dog',
                    breed: 'Shih Tzu', weight_kg: 8, coat_type: 'longo',
                  }),
                },
              }],
            },
          }],
        }
      }
      if (sequence === 2) throw new Error('timeout temporario')
      return {
        usage: { total_tokens: 4 },
        choices: [{ message: { content: JSON.stringify({ message: 'Perfeito! Qual horário você prefere hoje?' }) } }],
      }
    },
    executeTool: async () => ({
      ok: true,
      status: 'resolved',
      service: { id: 'small', name: 'Banho pequeno', price: 72 },
    }),
    parseReply: (content) => content ? JSON.parse(content) : { message: '' },
    validateReply: () => ({ ok: true }),
  })

  assert.equal(result.recovered, true)
  assert.match(result.reply, /horário/i)
  assert.equal(result.toolRuns.length, 1)
  assert.equal(sequence, 3)
})
