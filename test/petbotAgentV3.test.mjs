import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PETBOT_AGENT_TOOLS,
  buildPetbotOperationalPreflight,
  buildServiceAvailability,
  findPetshopSubscriptionBenefit,
  groundPetbotServiceArgs,
  isServiceCatalogProduct,
  listPetTransportOptions,
  mergeInterpretedPetbotServiceFacts,
  normalizePetbotRequestedDate,
  normalizePetbotRequestedTime,
  preparePetshopOrderDraft,
  resolvePetTransportSelection,
  resolvePetshopService,
  runPetbotAgent,
  serviceFromCatalogProduct,
} from '../server/lib/petbotAgent.js'
import {
  analyzeProductDifferentiation,
  buildPetbotConversationOpening,
  buildPetbotAgentV3Prompt,
  prependPetbotConversationOpening,
  validatePetbotConversationReply,
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
  assert.match(prompt, /Você é a Luna, assistente virtual da Quatro Patas/)
  assert.match(prompt, /acolhedora, simpática e natural/)
  assert.doesNotMatch(prompt, /PRECO:|QTD:|ID:/)
  assert.doesNotMatch(prompt, /Qual é o peso exato|Não vou deduzir|Bom dia! Claro/)
})

test('Luna se apresenta e responde a saudação somente no início da conversa', () => {
  assert.equal(
    buildPetbotConversationOpening({
      message: 'Olá, bom dia, queria pedir uma ração',
      customerName: 'Vanessa',
      history: [],
    }),
    'Bom dia, Vanessa! Eu sou a Luna, assistente virtual da Quatro Patas! 😊',
  )
  assert.equal(
    prependPetbotConversationOpening({
      reply: 'Como posso ajudar?',
      message: 'boa tarde',
      history: [],
    }),
    'Boa tarde! Eu sou a Luna, assistente virtual da Quatro Patas! 😊\n\nComo posso ajudar?',
  )
  assert.equal(
    prependPetbotConversationOpening({
      reply: 'Vamos continuar.',
      message: 'boa noite',
      history: [{ role: 'assistant', content: 'Resposta anterior' }],
      customerName: 'Vanessa',
    }),
    'Vamos continuar.',
  )
  assert.equal(
    prependPetbotConversationOpening({
      reply: 'Bom dia! Que ótimo que você quer agendar um banho.',
      message: 'bom dia, quero agendar um banho',
      history: [],
      customerName: 'Ray',
    }),
    'Bom dia, Ray! Eu sou a Luna, assistente virtual da Quatro Patas! 😊\n\nQue ótimo que você quer agendar um banho.',
  )
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

test('observacao de servico entra no estado confiavel e nao e apagada por negativa posterior', () => {
  const withNote = mergeInterpretedPetbotServiceFacts({
    interpretation: { service_notes: 'Não colocar perfume' },
    previousFacts: { service_type: 'banho' },
  })
  assert.equal(withNote.service_notes, 'Não colocar perfume')
  assert.equal(withNote.service_notes_resolved, true)

  const noAdditionalNote = mergeInterpretedPetbotServiceFacts({
    interpretation: { service_notes_resolved: true },
    previousFacts: withNote,
  })
  assert.equal(noAdditionalNote.service_notes, 'Não colocar perfume')
  assert.equal(noAdditionalNote.service_notes_resolved, true)

  const grounded = groundPetbotServiceArgs({ notes: null }, noAdditionalNote)
  assert.equal(grounded.notes, 'Não colocar perfume')

  const changedPet = mergeInterpretedPetbotServiceFacts({
    interpretation: { pet_name: 'Nina' },
    previousFacts: { ...noAdditionalNote, pet_name: 'Thor' },
  })
  assert.equal(changedPet.service_notes, null)
  assert.equal(changedPet.service_notes_resolved, false)
})

test('decisao de chegada do pet entra no estado confiavel e fundamenta o preparo', () => {
  const facts = mergeInterpretedPetbotServiceFacts({
    interpretation: { service_transport_mode: 'cliente_leva' },
    previousFacts: { service_type: 'banho', pet_name: 'Thor' },
  })
  assert.equal(facts.service_transport_mode, 'cliente_leva')
  assert.equal(facts.service_transport_mode_explicit, true)

  const grounded = groundPetbotServiceArgs({ service_transport_mode: null }, facts)
  assert.equal(grounded.service_transport_mode, 'cliente_leva')
})

test('validador impede perguntar observacao novamente depois da etapa resolvida', () => {
  const validation = validatePetbotConversationReply({
    reply: 'Apenas para finalizar, você precisa de alguma observação especial para o banho?',
    facts: { service_type: 'banho', service_notes_resolved: true },
    serviceContext: true,
  })
  assert.equal(validation.ok, false)
  assert.ok(validation.problems.some((problem) => /observações do serviço já foram respondidas/.test(problem)))
})

test('validador impede upsell e repeticao da chegada durante o fechamento do servico', () => {
  const facts = {
    service_type: 'banho',
    pet_name: 'Thor',
    species: 'dog',
    breed: 'Shih Tzu',
    weight_kg: 7,
    service_date: '2026-07-22',
    service_preferred_time: '16:00',
    service_transport_mode: 'cliente_leva',
    service_notes: 'sem perfume',
    service_notes_resolved: true,
  }
  const toolRuns = [{
    name: 'check_petshop_availability',
    ok: true,
    result: { status: 'available', requested_slot: { available: true } },
  }]
  const validation = validatePetbotConversationReply({
    reply: 'Você vai levar o Thor, certo? Gostaria de adicionar outro serviço ou produto?',
    facts,
    serviceContext: true,
    toolRuns,
  })
  assert.equal(validation.ok, false)
  assert.ok(validation.problems.some((problem) => /chegada do pet já foi respondida/.test(problem)))
  assert.ok(validation.problems.some((problem) => /não ofereça produtos ou serviços adicionais/.test(problem)))
  assert.ok(validation.problems.some((problem) => /todos os dados do serviço estão completos/.test(problem)))
})

test('validador exige nome do pet antes de chegada ou resumo', () => {
  const validation = validatePetbotConversationReply({
    reply: 'Você vai levar seu Shih Tzu ou prefere o MotoDog?',
    facts: { service_type: 'banho', species: 'dog', breed: 'Shih Tzu', weight_kg: 7 },
    serviceContext: true,
  })
  assert.equal(validation.ok, false)
  assert.ok(validation.problems.some((problem) => /nome do pet ainda está ausente/.test(problem)))
})

test('validador não deixa compra pedir nome do pet nem pagamento na retirada', () => {
  const asksPetName = validatePetbotConversationReply({
    reply: 'Desculpe pela confusão! Para finalizar, preciso saber o nome do seu Shih Tzu.',
    facts: { product_kind: 'food', quantity: 3 },
    productContext: true,
  })
  assert.equal(asksPetName.ok, false)
  assert.ok(asksPetName.problems.some((problem) => /nome do pet não é obrigatório/.test(problem)))

  const asksPickupPayment = validatePetbotConversationReply({
    reply: 'Como prefere pagar: Pix, dinheiro ou cartão?',
    facts: {
      product_kind: 'food',
      quantity: 3,
      fulfillment_type: 'retirada',
      payment_method: 'a_combinar',
    },
    productContext: true,
  })
  assert.equal(asksPickupPayment.ok, false)
  assert.ok(asksPickupPayment.problems.some((problem) => /pagamento é a combinar/.test(problem)))

  const repeatsDeliveryPayment = validatePetbotConversationReply({
    reply: 'Você mencionou que seria no cartão, certo? Confirma essa forma de pagamento?',
    facts: {
      product_kind: 'food',
      fulfillment_type: 'entrega',
      payment_method: 'cartao',
    },
    productContext: true,
  })
  assert.equal(repeatsDeliveryPayment.ok, false)
  assert.ok(repeatsDeliveryPayment.problems.some((problem) => /já registrada/.test(problem)))
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

test('grounding impede dizer que opção escolhida acabou após revalidação positiva', () => {
  const validation = validatePetbotOperationalReply({
    reply: 'Parece que não temos essa ração disponível no momento.',
    toolRuns: [{
      name: 'search_petshop_products',
      ok: true,
      result: {
        checked: true,
        status: 'resolved',
        selected_candidate: {
          id: 'premier-adulto',
          available: true,
          sufficient_stock: true,
          stock_quantity: 17,
        },
      },
    }],
  })

  assert.equal(validation.ok, false)
  assert.ok(validation.problems.some((problem) => /estoque suficiente/.test(problem)))
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

test('mercadoria de banho e pacote nao entram no catalogo de agendamento', () => {
  const legacyServiceMetadata = { product_type: 'servico', service_group: 'banho_tosa' }
  for (const name of [
    'BANHO A SECO BEEPS 200ML',
    'PO BANHO SECO MUNDO PET',
    'PACOTE BANHO 0 A 10 KG',
  ]) {
    assert.equal(isServiceCatalogProduct({
      name,
      category: 'Banho',
      bot_metadata: legacyServiceMetadata,
    }), false, name)
  }
})

test('ração continua produto quando metadado legado marcou serviço por engano', () => {
  assert.equal(isServiceCatalogProduct({
    name: 'GRANEL BIONATURAL ADULTO RAÇAS PEQUENAS KG',
    category: 'Ração',
    bot_metadata: { product_type: 'servico' },
  }), false)
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

test('ferramenta transacional terminal encerra o turno sem segunda chamada ao modelo', async () => {
  let modelCalls = 0
  const result = await runPetbotAgent({
    model: 'gpt-4o-mini-test',
    systemPrompt: 'Confirme o agendamento.',
    message: 'Confirmo.',
    initialToolChoice: { type: 'function', function: { name: 'create_confirmed_petshop_order' } },
    callModel: async () => {
      modelCalls += 1
      return {
        usage: { total_tokens: 7 },
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'confirm-1',
              type: 'function',
              function: {
                name: 'create_confirmed_petshop_order',
                arguments: JSON.stringify({ confirmation: true }),
              },
            }],
          },
        }],
      }
    },
    executeTool: async () => ({ ok: true, status: 'committed', appointment_id: 'appt-1', total: 55 }),
    resolveTerminalReply: ({ result: toolResult }) => (
      toolResult.status === 'committed'
        ? 'Pronto! O agendamento foi confirmado.'
        : ''
    ),
  })

  assert.equal(modelCalls, 1)
  assert.equal(result.reply, 'Pronto! O agendamento foi confirmado.')
  assert.equal(result.terminal, true)
  assert.equal(result.toolRuns.length, 1)
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

test('pelagem nunca vira pergunta e fica fora das ferramentas conversacionais', () => {
  const prompt = buildPetbotAgentV3Prompt({
    storeName: 'Pet Feliz',
    facts: { breed: 'Shih Tzu', weight_kg: 8, coat_type: 'longo' },
  })
  assert.match(prompt, /Nunca pergunte tipo de pelo ou pelagem/i)

  const resolveTool = PETBOT_AGENT_TOOLS.find((tool) => tool.function.name === 'resolve_petshop_service')
  const prepareTool = PETBOT_AGENT_TOOLS.find((tool) => tool.function.name === 'prepare_petshop_service_booking')
  assert.ok(resolveTool)
  assert.ok(prepareTool)
  assert.equal(Object.hasOwn(resolveTool.function.parameters.properties, 'coat_type'), false)
  assert.equal(Object.hasOwn(prepareTool.function.parameters.properties, 'coat_type'), false)

  const unresolved = resolvePetshopService({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    species: 'dog',
    breed: null,
    weightKg: 12,
    services: [
      {
        id: 'short', code: 'banho_medio_curto', name: 'Banho 10,1 a 22 kg - Pelo Curto',
        group_type: 'banho_tosa', default_price: 90, default_duration_min: 60,
        active: true, species: 'dog', weight_range: { min: 10.1, max: 22 }, coat_type: 'curto',
      },
      {
        id: 'long', code: 'banho_medio_longo', name: 'Banho 10,1 a 22 kg - Pelo Longo',
        group_type: 'banho_tosa', default_price: 110, default_duration_min: 60,
        active: true, species: 'dog', weight_range: { min: 10.1, max: 22 }, coat_type: 'longo',
      },
    ],
  })

  assert.equal(unresolved.status, 'needs_input')
  assert.deepEqual(unresolved.missing_fields, ['breed'])
  assert.equal(unresolved.required_fields.some((field) => /pelo|pelagem/i.test(field)), false)
})

test('estado confiavel preserva raca peso data e horario sem pedir confirmacao novamente', () => {
  const facts = mergeInterpretedPetbotServiceFacts({
    interpretation: { service_preferred_time: '13:00' },
    previousFacts: {
      pet_name: 'Nina',
      species: 'dog',
      breed: 'Shih Tzu',
      weight_kg: 8,
      weight_label: '8 kg',
      weight_explicit: true,
      coat_type: 'longo',
      coat_type_source: 'breed_catalog',
      service_type: 'banho',
      service_date: '2026-07-22',
    },
  })

  assert.equal(facts.pet_name, 'Nina')
  assert.equal(facts.breed, 'Shih Tzu')
  assert.equal(facts.weight_kg, 8)
  assert.equal(facts.coat_type, 'longo')
  assert.equal(facts.service_type, 'banho')
  assert.equal(facts.service_date, '2026-07-22')
  assert.equal(facts.service_preferred_time, '13:00')

  const grounded = groundPetbotServiceArgs({
    breed: null,
    weight_kg: null,
  }, facts)
  assert.equal(grounded.breed, 'Shih Tzu')
  assert.equal(grounded.weight_kg, 8)
  assert.equal(grounded.coat_type, 'longo')
})


test('validador impede pergunta de pelagem e repeticao de peso ja informado', () => {
  const facts = {
    pet_name: 'Nina',
    breed: 'Shih Tzu',
    weight_kg: 8,
    service_date: '2026-07-22',
    service_preferred_time: '13:00',
  }

  const repeatedWeight = validatePetbotConversationReply({
    reply: 'Você poderia confirmar novamente o peso da Nina?',
    facts,
  })
  assert.equal(repeatedWeight.ok, false)
  assert.match(repeatedWeight.problems.join(' '), /peso já informado/i)

  const asksCoat = validatePetbotConversationReply({
    reply: 'Qual é o tipo de pelo dela?',
    facts,
  })
  assert.equal(asksCoat.ok, false)
  assert.match(asksCoat.problems.join(' '), /pelagem proibida/i)

  const valid = validatePetbotConversationReply({
    reply: 'Perfeito! Vou verificar a disponibilidade de hoje às 13h.',
    facts,
  })
  assert.equal(valid.ok, true)

  const finalSummary = validatePetbotConversationReply({
    reply: 'Nina, Shih Tzu, 8 kg, hoje às 13h. Confirma o agendamento?',
    facts,
  })
  assert.equal(finalSummary.ok, true)
})

test('mensagem de retorno de ferramenta segue o schema do Chat Completions sem campo name', async () => {
  let sequence = 0
  const result = await runPetbotAgent({
    model: 'gpt-4o-mini-test',
    systemPrompt: 'Atenda naturalmente.',
    message: 'Ela tem 8 kg e é um Shih Tzu.',
    callModel: async (params) => {
      sequence += 1
      if (sequence === 1) {
        return {
          usage: { total_tokens: 3 },
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'resolve-service-1',
                type: 'function',
                function: {
                  name: 'resolve_petshop_service',
                  arguments: JSON.stringify({
                    service_query: 'banho',
                    order_type: 'banho_tosa',
                    species: 'dog',
                    breed: 'Shih Tzu',
                    weight_kg: 8,
                  }),
                },
              }],
            },
          }],
        }
      }

      const toolMessage = params.messages.find((entry) => entry.role === 'tool')
      assert.ok(toolMessage)
      assert.equal(toolMessage.tool_call_id, 'resolve-service-1')
      assert.equal(Object.hasOwn(toolMessage, 'name'), false)
      assert.equal(typeof toolMessage.content, 'string')

      return {
        usage: { total_tokens: 4 },
        choices: [{ message: { content: JSON.stringify({ message: 'Perfeito! Vou verificar os horários disponíveis para hoje.' }) } }],
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

  assert.match(result.reply, /horários disponíveis/i)
  assert.equal(sequence, 2)
})


test('normaliza datas e horarios naturais no backend sem depender da LLM', () => {
  const now = new Date('2026-07-22T13:00:00.000Z')
  assert.equal(normalizePetbotRequestedDate('hoje', { now, timezone: 'America/Sao_Paulo' }), '2026-07-22')
  assert.equal(normalizePetbotRequestedDate('amanhã', { now, timezone: 'America/Sao_Paulo' }), '2026-07-23')
  assert.equal(normalizePetbotRequestedDate('depois de amanhã', { now, timezone: 'America/Sao_Paulo' }), '2026-07-24')
  assert.equal(normalizePetbotRequestedDate('sexta', { now, timezone: 'America/Sao_Paulo' }), '2026-07-24')
  assert.equal(normalizePetbotRequestedDate('23/07', { now, timezone: 'America/Sao_Paulo' }), '2026-07-23')
  assert.equal(normalizePetbotRequestedTime('às 13h'), '13:00')
  assert.equal(normalizePetbotRequestedTime('13:30'), '13:30')
})

test('preflight resolve Shih Tzu de 8 kg no banho geral e consulta agenda sem pelagem do cliente', () => {
  const now = new Date('2026-07-22T12:00:00.000Z')
  const services = [
    {
      id: 'cat-bath', code: 'banho_gato', name: 'BANHO GATO (TODAS AS PELAGENS)',
      group_type: 'banho_tosa', default_price: 120, default_duration_min: 60,
      active: true, catalog_source: 'products', source_product_id: 'cat-product', species: 'cat',
      weight_range: { min: 0, max: 10 }, coat_type: 'todas', all_breeds: true,
    },
    {
      id: 'small-dog-bath', code: 'banho_pet_pequeno',
      name: 'BANHO PET PORTE PEQUENO 0 KG A 10 KG (TODAS AS PELAGENS)',
      group_type: 'banho_tosa', default_price: 72, default_duration_min: 60,
      active: true, catalog_source: 'products', source_product_id: 'small-dog-product', species: 'dog',
      weight_range: { min: 0, max: 10 }, coat_type: 'todas', all_breeds: true,
    },
  ]
  const result = buildPetbotOperationalPreflight({
    facts: {
      pet_name: 'Nina', breed: 'Shih Tzu', weight_kg: 8,
      service_type: 'banho', service_date: 'hoje',
    },
    orderType: 'banho_tosa',
    services,
    appointments: [],
    settings: {
      timezone: 'America/Sao_Paulo',
      businessHours: { 3: [{ open: '08:00', close: '18:00' }] },
      slotIntervalMin: 30,
      bookingLeadMinutes: 0,
      bookingCapacity: 1,
    },
    now,
  })

  assert.equal(result.facts.service_date, '2026-07-22')
  assert.equal(result.resolution.status, 'resolved')
  assert.equal(result.resolvedService.id, 'small-dog-bath')
  assert.equal(result.resolvedService.price, 72)
  assert.equal(result.resolvedService.species, 'dog')
  assert.equal(result.availability.status, 'available')
  assert.ok(result.availability.available_slots.length > 0)
  assert.equal(result.toolRuns.some((run) => run.name === 'resolve_petshop_service'), true)
  assert.equal(result.toolRuns.some((run) => run.name === 'check_petshop_availability'), true)
})

test('falha total do modelo depois do preflight usa resposta local e nao pede repeticao', async () => {
  const preloaded = [{
    name: 'check_petshop_availability',
    ok: true,
    preloaded: true,
    result: {
      ok: true,
      status: 'available',
      available_slots: [{ time: '13:00' }, { time: '13:30' }],
    },
  }]
  let calls = 0
  const result = await runPetbotAgent({
    model: 'gpt-4o-mini',
    systemPrompt: 'Atenda naturalmente.',
    message: 'Ela tem 8 kg e é um Shih Tzu. Quais horários tem hoje?',
    initialToolRuns: preloaded,
    callModel: async () => {
      calls += 1
      throw new Error('simulated OpenAI outage')
    },
    executeTool: async () => ({ ok: true }),
    fallbackReply: ({ toolRuns }) => {
      const availability = toolRuns.find((run) => run.name === 'check_petshop_availability')?.result
      return `Encontrei estes horários disponíveis: ${availability.available_slots.map((slot) => slot.time).join(', ')}.`
    },
  })

  assert.equal(result.recovered, true)
  assert.match(result.reply, /13:00, 13:30/)
  assert.doesNotMatch(result.reply, /repita|repetir/i)
  assert.ok(calls >= 1)
})


test('validador bloqueia fallback generico que pede para repetir fatos ja salvos', () => {
  const result = validatePetbotConversationReply({
    reply: 'Desculpe, tive uma instabilidade. Pode repetir a última informação?',
    facts: { pet_name: 'Toby', breed: 'Shih Tzu', weight_kg: 7, service_date: '2026-07-22' },
  })
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((problem) => /repetir dados/.test(problem)))
})

test('agenda aceita o id exato ja resolvido sem exigir peso novamente', () => {
  const result = buildServiceAvailability({
    serviceQuery: 'small-dog-bath',
    orderType: 'banho_tosa',
    date: '2026-07-22',
    services: [{
      id: 'small-dog-bath', code: 'banho_pet_pequeno',
      name: 'BANHO PET PORTE PEQUENO 0 KG A 10 KG (TODAS AS PELAGENS)',
      group_type: 'banho_tosa', default_price: 72, default_duration_min: 60,
      active: true, catalog_source: 'products', source_product_id: 'small-dog-product',
      species: 'dog', weight_range: { min: 0, max: 10 }, coat_type: 'todas', all_breeds: true,
    }],
    appointments: [],
    settings: {
      timezone: 'America/Sao_Paulo',
      businessHours: { 3: [{ open: '08:00', close: '18:00' }] },
      bookingLeadMinutes: 0,
    },
    now: new Date('2026-07-22T12:00:00.000Z'),
    requireServiceClassification: false,
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 'available')
  assert.equal(result.service.id, 'small-dog-bath')
  assert.deepEqual(result.missing_fields || [], [])
})

test('troca de pet limpa fatos do animal mas preserva servico data e horario da conversa', () => {
  const facts = mergeInterpretedPetbotServiceFacts({
    interpretation: { pet_name: 'Nina' },
    previousFacts: {
      pet_name: 'Thor', species: 'dog', breed: 'Shih Tzu', weight_kg: 8,
      weight_label: '8 kg', coat_type: 'longo', service_type: 'banho',
      service_date: 'hoje', service_preferred_time: '13h', service_time_preference: 'specific',
    },
  })

  assert.equal(facts.pet_name, 'Nina')
  assert.equal(facts.breed, null)
  assert.equal(facts.weight_kg, null)
  assert.equal(facts.coat_type, null)
  assert.equal(facts.service_type, 'banho')
  assert.equal(facts.service_date, 'hoje')
  assert.equal(facts.service_preferred_time, '13h')
  assert.equal(facts.service_time_preference, 'specific')
})

test('agenda normaliza data e horario naturais em qualquer rota de ferramenta', () => {
  const result = buildServiceAvailability({
    serviceQuery: 'small-dog-bath',
    orderType: 'banho_tosa',
    date: 'hoje',
    preferredTime: 'às 13h',
    services: [{
      id: 'small-dog-bath', code: 'banho_pet_pequeno',
      name: 'BANHO PET PORTE PEQUENO 0 KG A 10 KG (TODAS AS PELAGENS)',
      group_type: 'banho_tosa', default_price: 72, default_duration_min: 60,
      active: true, catalog_source: 'products', source_product_id: 'small-dog-product',
      species: 'dog', weight_range: { min: 0, max: 10 }, coat_type: 'todas', all_breeds: true,
    }],
    appointments: [],
    settings: {
      timezone: 'America/Sao_Paulo',
      businessHours: { 3: [{ open: '08:00', close: '18:00' }] },
      bookingLeadMinutes: 0,
    },
    now: new Date('2026-07-22T12:00:00.000Z'),
    requireServiceClassification: false,
  })

  assert.equal(result.status, 'available')
  assert.equal(result.business_date, '2026-07-22')
  assert.equal(result.requested_slot.available, true)
  assert.match(result.requested_slot.scheduled_at, /T13:00/)
})

test('falha ao atualizar agenda preserva fatos e nao anuncia horario de cache', () => {
  const result = buildPetbotOperationalPreflight({
    facts: {
      pet_name: 'Toby', breed: 'Shih Tzu', weight_kg: 7,
      service_type: 'banho', service_date: 'hoje',
    },
    orderType: 'banho_tosa',
    services: [{
      id: 'small-dog-bath', code: 'banho_pet_pequeno',
      name: 'BANHO PET PORTE PEQUENO 0 KG A 10 KG (TODAS AS PELAGENS)',
      group_type: 'banho_tosa', default_price: 72, default_duration_min: 60,
      active: true, catalog_source: 'products', source_product_id: 'small-dog-product',
      species: 'dog', weight_range: { min: 0, max: 10 }, coat_type: 'todas', all_breeds: true,
    }],
    appointments: [],
    settings: { timezone: 'America/Sao_Paulo' },
    now: new Date('2026-07-22T12:00:00.000Z'),
    agendaAvailable: false,
  })

  assert.equal(result.resolution.status, 'resolved')
  assert.equal(result.availability.status, 'temporarily_unavailable')
  assert.equal(result.availability.error_code, 'agenda_refresh_failed')
  assert.deepEqual(result.availability.available_slots, [])
  assert.equal(result.toolRuns.at(-1).ok, false)
})

test('todas as ferramentas do agente percorrem o protocolo de retorno sem payload invalido', async () => {
  const toolNames = PETBOT_AGENT_TOOLS.map((tool) => tool.function.name)
  assert.deepEqual(toolNames, [
    'search_petshop_products',
    'resolve_petshop_service',
    'check_petshop_availability',
    'get_petshop_transport_options',
    'prepare_petshop_product_order',
    'prepare_petshop_service_booking',
    'create_confirmed_petshop_order',
    'cancel_pending_petshop_order',
    'send_product_image',
    'handoff_to_human',
  ])

  for (const toolName of toolNames) {
    let sequence = 0
    await runPetbotAgent({
      model: 'gpt-4o-mini-test',
      systemPrompt: 'Teste de contrato.',
      message: 'continue',
      tools: PETBOT_AGENT_TOOLS,
      callModel: async (params) => {
        sequence += 1
        if (sequence === 1) {
          return {
            choices: [{
              message: {
                content: null,
                tool_calls: [{
                  id: `${toolName}-call`,
                  type: 'function',
                  function: { name: toolName, arguments: '{}' },
                }],
              },
            }],
          }
        }
        const toolMessage = params.messages.find((entry) => entry.role === 'tool')
        assert.ok(toolMessage, toolName)
        assert.equal(toolMessage.tool_call_id, `${toolName}-call`, toolName)
        assert.equal(Object.hasOwn(toolMessage, 'name'), false, toolName)
        assert.doesNotThrow(() => JSON.parse(toolMessage.content), toolName)
        return { choices: [{ message: { content: 'Certo, vou continuar.' } }] }
      },
      executeTool: async (toolCall) => ({ ok: true, action: toolCall.function.name, status: 'tested' }),
      validateReply: () => ({ ok: true }),
    })
    assert.equal(sequence, 2, toolName)
  }
})


test('ferramentas separam compra de produto de agendamento de servico', () => {
  const productTool = PETBOT_AGENT_TOOLS.find((tool) => tool.function.name === 'prepare_petshop_product_order')
  const serviceTool = PETBOT_AGENT_TOOLS.find((tool) => tool.function.name === 'prepare_petshop_service_booking')
  assert.ok(productTool)
  assert.ok(serviceTool)

  const productFields = productTool.function.parameters.properties
  const serviceFields = serviceTool.function.parameters.properties
  assert.ok(Object.hasOwn(productFields, 'payment_method'))
  assert.ok(Object.hasOwn(productFields, 'fulfillment_type'))
  assert.ok(Object.hasOwn(productFields, 'change_for'))
  assert.ok(productFields.payment_method.enum.includes('a_combinar'))
  assert.equal(Object.hasOwn(serviceFields, 'payment_method'), false)
  assert.equal(Object.hasOwn(serviceFields, 'fulfillment_type'), false)
  assert.equal(Object.hasOwn(serviceFields, 'change_for'), false)
  assert.equal(Object.hasOwn(serviceFields, 'delivery_address'), false)
  assert.ok(Object.hasOwn(serviceFields, 'service_transport_mode'))
})

test('banho exige decisao de chegada do pet mas nunca forma de pagamento', () => {
  const baseArgs = {
    customer_name: 'Ricardo', pet_name: 'Toby', species: 'dog', breed: 'Shih Tzu', weight_kg: 6,
    weight_label: '6 kg', weight_estimated: true, coat_type: 'longo', order_type: 'banho_tosa',
    items: [], appointment_id: null, scheduled_at: '2026-07-22T14:30:00-03:00',
    service_code: service.code, service_type: service.code,
  }
  const missingTransport = preparePetshopOrderDraft({
    args: baseArgs,
    services: [service], appointments: [], now: new Date('2026-07-21T10:00:00-03:00'),
  })
  assert.equal(missingTransport.ok, false)
  assert.ok(missingTransport.missing.includes('como o pet chegará à loja (cliente leva ou MotoDog)'))
  assert.equal(missingTransport.missing.some((item) => /pagamento|troco|retirada/i.test(item)), false)

  const clientBrings = preparePetshopOrderDraft({
    args: { ...baseArgs, service_transport_mode: 'cliente_leva' },
    services: [service], appointments: [], now: new Date('2026-07-21T10:00:00-03:00'),
  })
  assert.equal(clientBrings.ok, true)
  assert.equal(clientBrings.order.payment_method, null)
  assert.equal(clientBrings.order.fulfillment_type, 'servico')
  assert.equal(clientBrings.order.change_for, null)
  assert.match(clientBrings.summary, /cliente leva à loja/i)
  assert.doesNotMatch(clientBrings.summary, /Pix|dinheiro|cartão|troco|retirada na loja/i)
})

test('MotoDog so vira pergunta obrigatoria depois de servico e horario resolvidos', () => {
  const incomplete = preparePetshopOrderDraft({
    args: {
      customer_name: 'Ricardo', pet_name: 'Toby', species: 'dog', breed: 'Shih Tzu', weight_kg: 6,
      weight_label: '6 kg', weight_estimated: true, order_type: 'banho_tosa', items: [],
      appointment_id: null, scheduled_at: null, service_code: service.code, service_type: service.code,
    },
    services: [service], appointments: [], now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(incomplete.ok, false)
  assert.ok(incomplete.missing.includes('horário real da agenda'))
  assert.equal(incomplete.missing.some((item) => /MotoDog|chegará à loja/i.test(item)), false)
})

test('MotoDog usa apenas opcao e taxa configuradas pela loja', () => {
  const selection = resolvePetTransportSelection({
    orderType: 'banho_tosa',
    args: { service_transport_mode: 'somente_buscar', service_transport_fee: 999 },
    settings: { petTransportOptions: [{ id: 'somente_buscar', label: 'Somente buscar', fee: 15, active: true }] },
    requireDecision: true,
  })
  assert.equal(selection.ok, true)
  assert.equal(selection.fee, 15)
  assert.equal(selection.label, 'Somente buscar')
})

test('validador bloqueia pagamento troco e entrega de produto em agendamento', () => {
  const common = { facts: { service_type: 'banho', pet_name: 'Toby' }, serviceContext: true }
  for (const reply of [
    'Qual forma prefere para o pagamento? Pix, dinheiro ou cartão?',
    'Precisa de troco para quanto?',
    'Você prefere retirada na loja ou entrega?',
  ]) {
    const result = validatePetbotConversationReply({ reply, ...common })
    assert.equal(result.ok, false, reply)
  }

  const natural = validatePetbotConversationReply({
    reply: 'Você vai trazer o Toby à loja ou prefere que a gente busque com o MotoDog?',
    ...common,
  })
  assert.equal(natural.ok, true)
})

test('validador nao permite listar como livre um horario reservado', () => {
  const result = validatePetbotOperationalReply({
    reply: 'Hoje às 14:00 está reservado. Horários disponíveis: 13:30, 14:00 e 14:30.',
    toolRuns: [{
      name: 'check_petshop_availability', ok: true,
      result: {
        status: 'available',
        requested_slot: { time: '14:00', scheduled_at: '2026-07-22T14:00:00-03:00', available: false },
        available_slots: [
          { time: '13:30', scheduled_at: '2026-07-22T13:30:00-03:00' },
          { time: '14:30', scheduled_at: '2026-07-22T14:30:00-03:00' },
        ],
      },
    }],
  })
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((problem) => problem.includes('14:00')))
})

test('confirmacao ja dada nao pode gerar nova pergunta de confirmacao', () => {
  const result = validatePetbotConversationReply({
    reply: 'Só preciso confirmar: você confirma o agendamento para 14:30?',
    facts: { service_type: 'banho' },
    pendingOrder: { order: { order_type: 'banho_tosa' } },
    currentMessageIsConfirmation: true,
    serviceContext: true,
  })
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((problem) => /já confirmou/i.test(problem)))
})

test('MotoDog bloqueia resumo ate escolher modalidade e completar endereco', () => {
  const baseArgs = {
    customer_name: 'Ray', pet_name: 'Thor', species: 'dog', breed: 'Shih Tzu', weight_kg: 8,
    weight_label: '8 kg', weight_estimated: true, coat_type: 'longo', order_type: 'banho_tosa',
    items: [], appointment_id: null, scheduled_at: '2026-07-23T16:00:00-03:00',
    service_code: service.code, service_type: service.code,
  }
  const settings = {
    petTransportOptions: [
      { id: 'buscar_e_levar', label: 'Buscar e levar', fee: 20, active: true },
      { id: 'somente_buscar', label: 'Somente buscar', fee: 15, active: true },
      { id: 'somente_levar', label: 'Somente levar', fee: 15, active: true },
    ],
  }

  const generic = preparePetshopOrderDraft({
    args: { ...baseArgs, service_transport_mode: 'motodog' },
    services: [service], appointments: [], settings,
    now: new Date('2026-07-23T10:00:00-03:00'),
  })
  assert.equal(generic.ok, false)
  assert.ok(generic.missing.includes('opção válida de transporte do pet'))

  const missingAddress = preparePetshopOrderDraft({
    args: { ...baseArgs, service_transport_mode: 'buscar_e_levar' },
    services: [service], appointments: [], settings,
    now: new Date('2026-07-23T10:00:00-03:00'),
  })
  assert.equal(missingAddress.ok, false)
  assert.ok(missingAddress.missing.includes('rua e número para transporte do pet'))
  assert.ok(missingAddress.missing.includes('bairro para transporte do pet'))
  assert.ok(missingAddress.missing.includes('cidade para transporte do pet'))
  assert.ok(missingAddress.missing.includes('ponto de referência para transporte do pet'))

  const complete = preparePetshopOrderDraft({
    args: {
      ...baseArgs,
      service_transport_mode: 'buscar_e_levar',
      service_transport_address: 'Rua das Flores, 120',
      service_transport_neighborhood: 'Centro',
      service_transport_city: 'Muriaé',
      service_transport_reference: 'portão azul',
    },
    services: [service], appointments: [], settings,
    now: new Date('2026-07-23T10:00:00-03:00'),
  })
  assert.equal(complete.ok, true)
  assert.equal(complete.order.service_transport_fee, 20)
  assert.equal(complete.order.total, 110)
  assert.match(complete.summary, /Buscar e levar.*R\$\s*20,00/i)
  assert.match(complete.summary, /Rua das Flores, 120.*Centro.*Muriaé/i)
  assert.match(complete.summary, /portão azul/i)
})

test('validador impede resumo antes de modalidade e endereco do MotoDog', () => {
  const availableRun = [{
    name: 'check_petshop_availability',
    ok: true,
    result: {
      status: 'available',
      requested_slot: { available: true, scheduled_at: '2026-07-23T16:00:00-03:00' },
    },
  }]
  const commonFacts = {
    pet_name: 'Thor', species: 'dog', breed: 'Shih Tzu', weight_kg: 8,
    service_type: 'banho', service_date: '2026-07-23', service_preferred_time: '16:00',
  }

  const generic = validatePetbotConversationReply({
    reply: 'Sim, 16:00 está disponível. Posso preparar o resumo do agendamento?',
    facts: { ...commonFacts, service_transport_mode: 'motodog' },
    serviceContext: true,
    toolRuns: availableRun,
  })
  assert.equal(generic.ok, false)
  assert.ok(generic.problems.some((problem) => /modalidade/i.test(problem)))

  const optionPrompt = validatePetbotConversationReply({
    reply: 'Qual modalidade você prefere: buscar e levar, somente buscar ou somente levar?',
    facts: { ...commonFacts, service_transport_mode: 'motodog' },
    serviceContext: true,
    toolRuns: availableRun,
  })
  assert.equal(optionPrompt.ok, true)

  const missingAddress = validatePetbotConversationReply({
    reply: 'Posso preparar o resumo agora?',
    facts: { ...commonFacts, service_transport_mode: 'buscar_e_levar' },
    serviceContext: true,
    toolRuns: availableRun,
  })
  assert.equal(missingAddress.ok, false)
  assert.ok(missingAddress.problems.some((problem) => /endereço/i.test(problem)))

  const unconfirmedProfileAddress = validatePetbotConversationReply({
    reply: 'Posso preparar o resumo agora?',
    facts: {
      ...commonFacts,
      service_transport_mode: 'buscar_e_levar',
      service_transport_address: 'Rua das Flores, 120',
      service_transport_neighborhood: 'Centro',
      service_transport_city: 'Muriaé',
      service_transport_reference: 'portão azul',
      service_transport_address_confirmed: false,
    },
    serviceContext: true,
    toolRuns: availableRun,
  })
  assert.equal(unconfirmedProfileAddress.ok, false)
  assert.ok(unconfirmedProfileAddress.problems.some((problem) => /não foi confirmado/i.test(problem)))
})
