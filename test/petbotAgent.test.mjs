import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PETBOT_AGENT_TOOLS,
  buildServiceAvailability,
  isExplicitPetbotConfirmation,
  preparePetshopOrderDraft,
  resolvePetTransportSelection,
  runPetbotAgent,
} from '../server/lib/petbotAgent.js'
import { buildServiceBreedPreset, classifyCommonPetBreed } from '../shared/petbotBreedCatalog.js'

test('detecta confirmação explícita sem aceitar texto ambíguo', () => {
  assert.equal(isExplicitPetbotConfirmation('sim'), true)
  assert.equal(isExplicitPetbotConfirmation('Pode finalizar'), true)
  assert.equal(isExplicitPetbotConfirmation('sim, mas troca para entrega'), false)
  assert.equal(isExplicitPetbotConfirmation('talvez'), false)
})

test('prepara pedido usando preço real do estoque', () => {
  const prepared = preparePetshopOrderDraft({
    args: {
      customer_name: 'Ana',
      order_type: 'produto',
      items: [{ product_id: 'p1', name: 'Preço inventado', quantity: 2, upsell: false }],
      payment_method: 'pix',
      fulfillment_type: 'entrega',
      delivery_address: 'Rua A, 10',
      delivery_neighborhood: 'Centro',
      delivery_city: 'São Paulo',
      delivery_reference: 'Portão azul',
    },
    products: [{ id: 'p1', name: 'Ração Real', price: 25, stock_quantity: 5, active: true }],
    settings: { deliveryFee: 10 },
  })

  assert.equal(prepared.ok, true)
  assert.equal(prepared.order.items[0].name, 'Ração Real')
  assert.equal(prepared.order.items[0].unit_price, 25)
  assert.equal(prepared.order.total, 60)
  assert.match(prepared.summary, /R\$\s?60,00/)
})

test('recusa pedido com produto inexistente ou dados incompletos', () => {
  const prepared = preparePetshopOrderDraft({
    args: {
      customer_name: 'Ana',
      order_type: 'produto',
      items: [{ product_id: 'fake', name: 'Produto', quantity: 1, upsell: false }],
      payment_method: null,
      fulfillment_type: null,
    },
    products: [],
  })

  assert.equal(prepared.ok, false)
  assert.ok(prepared.missing.some((item) => item.includes('produto real')))
  assert.ok(prepared.missing.includes('forma de pagamento'))
  assert.ok(prepared.missing.includes('entrega ou retirada'))
})

test('prepara serviço somente com horário disponível e preço real', () => {
  const prepared = preparePetshopOrderDraft({
    args: {
      customer_name: 'Bruno',
      pet_name: 'Thor',
      species: 'dog',
      size: 'medio',
      breed: null,
      symptom: null,
      order_type: 'banho_tosa',
      items: [],
      appointment_id: 'a1',
      scheduled_at: null,
      service_code: 'banho',
      service_type: 'Banho',
      service_transport_fee: 999,
      service_transport_mode: 'buscar_e_levar',
      service_transport_label: 'Buscar e levar',
      service_transport_address: 'Rua A, 10',
      service_transport_neighborhood: 'Centro',
      service_transport_reference: 'Portão azul',
    },
    services: [{ id: 's1', code: 'banho', name: 'Banho', group_type: 'banho_tosa', default_price: 80, default_duration_min: 60, active: true }],
    appointments: [{
      id: 'a1',
      service_type: 'banho',
      scheduled_at: '2026-07-25T14:00:00-03:00',
      price: 80,
      duration_min: 60,
      status: 'available',
    }],
    settings: {
      petTransportOptions: [{ id: 'buscar_e_levar', label: 'Buscar e levar', fee: 15, active: true }],
    },
    now: new Date('2026-07-21T12:00:00-03:00'),
  })

  assert.equal(prepared.ok, true)
  assert.equal(prepared.order.total, 95)
  assert.equal(prepared.order.appointment_id, 'a1')
  assert.equal(prepared.order.service_transport_fee, 15)
})

test('calcula horário livre usando serviços reais e compromissos ocupados', () => {
  const availability = buildServiceAvailability({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    date: '2026-07-21',
    preferredTime: '15:00',
    period: 'specific',
    services: [{ id: 's1', code: 'banho', name: 'Banho', group_type: 'banho_tosa', default_price: 70, default_duration_min: 60, active: true }],
    appointments: [{
      id: 'busy-1',
      service_type: 'tosa',
      scheduled_at: '2026-07-21T13:00:00-03:00',
      duration_min: 60,
      status: 'agendado',
    }],
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(availability.ok, true)
  assert.equal(availability.requested_slot.available, true)
  assert.equal(availability.service.price, 70)
  assert.ok(availability.available_slots.some((slot) => slot.scheduled_at === '2026-07-21T15:00:00-03:00'))
})

test('marca horário ocupado e oferece alternativas reais', () => {
  const availability = buildServiceAvailability({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    date: '2026-07-21',
    preferredTime: '15:00',
    period: 'specific',
    services: [{ id: 's1', code: 'banho', name: 'Banho', group_type: 'banho_tosa', default_price: 70, default_duration_min: 60, active: true }],
    appointments: [{
      id: 'busy-1',
      service_type: 'tosa',
      scheduled_at: '2026-07-21T15:00:00-03:00',
      duration_min: 60,
      status: 'confirmado',
    }],
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(availability.ok, true)
  assert.equal(availability.requested_slot.available, false)
  assert.ok(availability.available_slots.length > 0)
  assert.ok(availability.available_slots.every((slot) => slot.scheduled_at !== '2026-07-21T15:00:00-03:00'))
})

test('prepara agendamento virtual com preço e duração do cadastro de serviços', () => {
  const prepared = preparePetshopOrderDraft({
    args: {
      customer_name: 'Gabriel',
      pet_name: 'Thor',
      species: 'dog',
      size: null,
      breed: 'Lhasa Apso',
      symptom: null,
      order_type: 'banho_tosa',
      items: [],
      appointment_id: null,
      scheduled_at: '2026-07-21T15:00:00-03:00',
      service_code: 'banho',
      service_type: 'Banho',
      service_transport_mode: 'sem_transporte',
    },
    services: [{ id: 's1', code: 'banho', name: 'Banho', group_type: 'banho_tosa', default_price: 75, default_duration_min: 60, active: true }],
    appointments: [],
    now: new Date('2026-07-21T10:48:00-03:00'),
  })

  assert.equal(prepared.ok, true)
  assert.equal(prepared.order.appointment_id, null)
  assert.equal(prepared.order.scheduled_at, '2026-07-21T15:00:00-03:00')
  assert.equal(prepared.order.items[0].unit_price, 75)
  assert.equal(prepared.order.total, 75)
})

test('taxa de transporte sempre vem da configuração da loja', () => {
  const selection = resolvePetTransportSelection({
    orderType: 'banho_tosa',
    args: {
      service_transport_mode: 'somente_buscar',
      service_transport_fee: 999,
    },
    settings: {
      petTransportOptions: [
        { id: 'somente_buscar', label: 'Somente buscar', fee: 22, active: true },
      ],
    },
  })

  assert.equal(selection.ok, true)
  assert.equal(selection.fee, 22)
  assert.equal(selection.mode, 'somente_buscar')
})

test('executa loop de ferramenta e devolve resposta final do agente', async () => {
  const requests = []
  let call = 0
  const result = await runPetbotAgent({
    model: 'gpt-4o-mini',
    systemPrompt: 'Atenda o cliente.',
    history: [],
    message: 'Meu nome é Ana',
    tools: [],
    initialToolChoice: { type: 'function', function: { name: 'update_customer_profile' } },
    callModel: async (request) => {
      requests.push(request)
      call += 1
      if (call === 1) {
        return {
          usage: { total_tokens: 10 },
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'update_customer_profile',
                  arguments: JSON.stringify({ customer_name: 'Ana' }),
                },
              }],
            },
          }],
        }
      }
      return {
        usage: { total_tokens: 8 },
        choices: [{ message: { content: 'Prazer, Ana! Como posso ajudar?' } }],
      }
    },
    executeTool: async () => ({ ok: true }),
  })

  assert.equal(result.reply, 'Prazer, Ana! Como posso ajudar?')
  assert.equal(result.tokensUsed, 18)
  assert.equal(result.toolRuns.length, 1)
  assert.equal(requests[0].parallel_tool_calls, false)
  assert.deepEqual(requests[0].tool_choice, { type: 'function', function: { name: 'update_customer_profile' } })
  assert.equal(requests[1].tool_choice, 'auto')
  assert.equal(requests[1].messages.at(-1).role, 'tool')
})


test('schemas das ferramentas usam modo estrito compatível', () => {
  for (const tool of PETBOT_AGENT_TOOLS) {
    assert.equal(tool.function.strict, true)
    const schema = tool.function.parameters
    assert.equal(schema.additionalProperties, false)
    assert.deepEqual(new Set(schema.required), new Set(Object.keys(schema.properties)))

    const itemSchema = schema.properties.items?.items
    if (itemSchema) {
      assert.equal(itemSchema.additionalProperties, false)
      assert.deepEqual(new Set(itemSchema.required), new Set(Object.keys(itemSchema.properties)))
    }
  }
})

test('runtime tenta o agente antes do guardião legado', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../server/lib/chat.js', import.meta.url), 'utf8'))
  const agentIndex = source.indexOf('return await respondWithPetbotAgent')
  const guardIndex = source.indexOf('let guard = runPetbotGuard', agentIndex)
  assert.ok(agentIndex > 0)
  assert.ok(guardIndex > agentIndex)
  assert.match(source, /pendingAtTurnStart/)
  assert.match(source, /isExplicitPetbotConfirmation\(trimmedMessage\)/)
  assert.match(source, /loadPetshopServices/)
  assert.match(source, /loadAppointmentsFresh/)
  assert.match(source, /check_petshop_availability/)
  assert.match(source, /resolvePetTransportSelection/)
})

test('nao escolhe banho generico quando catalogo varia por peso', () => {
  const availability = buildServiceAvailability({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    date: '2026-07-22',
    preferredTime: '14:00',
    period: 'specific',
    services: [
      { id: 'generic', code: 'banho', name: 'Banho', group_type: 'banho_tosa', default_price: 60, default_duration_min: 60, active: true },
      { id: 'small', code: 'banho_pet_porte_pequeno_0_kg_a_10_kg_todas_as_racas', name: 'Banho Pet Porte Pequeno 0 KG A 10 KG (Todas As Raças)', group_type: 'banho_tosa', default_price: 72, default_duration_min: 60, active: true },
      { id: 'medium-short', code: 'banho_pet_porte_medio_10_1_a_22_kg_pelo_curto', name: 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Curto)', group_type: 'banho_tosa', default_price: 88, default_duration_min: 75, active: true },
    ],
    appointments: [],
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(availability.ok, false)
  assert.deepEqual(availability.required_fields, ['peso do pet em kg'])
  assert.ok(availability.available_services.every((service) => service.name !== 'Banho'))
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
  assert.equal(prepared.order.service_label, 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Duplo)')
  assert.equal(prepared.order.items[0].unit_price, 104)
  assert.equal(prepared.order.total, 104)
  assert.match(prepared.summary, /Banho Pet Porte Medio 10,1 A 22 KG \(Pelo Duplo\)/)
  assert.doesNotMatch(prepared.summary, /Pagamento:/)
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
    preferredTime: '14:00',
    period: 'specific',
    services,
    appointments: [],
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(availability.ok, true)
  assert.equal(availability.service.code, 'banho_pet_porte_medio_10_1_a_22_kg_pelo_duplo')
  assert.equal(availability.service.price, 104)
})

test('prefere variacao de pelo exata em vez de opcao generica da mesma faixa', () => {
  const availability = buildServiceAvailability({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    weightKg: 12,
    coatType: 'duplo',
    date: '2026-07-22',
    preferredTime: '14:00',
    period: 'specific',
    services: [
      { id: 'medium-all', code: 'banho_pet_porte_medio_10_1_a_22_kg_todas_as_racas', name: 'Banho Pet Porte Medio 10,1 A 22 KG (Todas As Raças)', group_type: 'banho_tosa', default_price: 90, default_duration_min: 75, active: true },
      { id: 'medium-double', code: 'banho_pet_porte_medio_10_1_a_22_kg_pelo_duplo', name: 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Duplo)', group_type: 'banho_tosa', default_price: 104, default_duration_min: 90, active: true },
    ],
    appointments: [],
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(availability.ok, true)
  assert.equal(availability.service.code, 'banho_pet_porte_medio_10_1_a_22_kg_pelo_duplo')
  assert.equal(availability.service.price, 104)
})

test('exige data antes de oferecer horarios de um servico exato', () => {
  const availability = buildServiceAvailability({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    date: null,
    services: [{ id: 's1', code: 'banho', name: 'Banho', group_type: 'banho_tosa', default_price: 70, default_duration_min: 60, active: true }],
    appointments: [],
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(availability.ok, false)
  assert.deepEqual(availability.required_fields, ['data do agendamento'])
})


test('usa o catalogo de servicos da aba Estoque em vez do banho generico', () => {
  const services = mergePetshopServiceCatalogs(
    [{ id: 'generic', code: 'banho', name: 'Banho', group_type: 'banho_tosa', default_price: 60, default_duration_min: 60, active: true }],
    [
      { id: '11111111-1111-1111-1111-111111111111', name: 'Banho Pet Porte Pequeno 0 KG A 10 KG (Pelo Duplo)', category: 'Serviço', price: 92, stock_quantity: 999999, active: true, bot_metadata: { product_type: 'servico' } },
      { id: '22222222-2222-2222-2222-222222222222', name: 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Duplo)', category: 'Serviço', price: 108, stock_quantity: 999999, active: true, bot_metadata: { product_type: 'servico' } },
    ],
  )

  const unresolved = buildServiceAvailability({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    petName: 'Theo',
    species: 'dog',
    date: '2026-07-22',
    preferredTime: '14:00',
    period: 'specific',
    services,
    appointments: [],
    requirePetIdentity: true,
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(unresolved.ok, false)
  assert.deepEqual(unresolved.required_fields, ['peso do pet em kg'])
  assert.ok(unresolved.available_services.every((service) => service.price !== 60))

  const exact = buildServiceAvailability({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    petName: 'Theo',
    species: 'dog',
    weightKg: 8,
    coatType: 'duplo',
    date: '2026-07-22',
    preferredTime: '14:00',
    period: 'specific',
    services,
    appointments: [],
    requirePetIdentity: true,
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(exact.ok, true)
  assert.equal(exact.service.name, 'Banho Pet Porte Pequeno 0 KG A 10 KG (Pelo Duplo)')
  assert.equal(exact.service.price, 92)
  assert.match(exact.service.code, /^catalog_/)
})

test('nao libera preco ou agenda antes de identificar o pet', () => {
  const availability = buildServiceAvailability({
    serviceQuery: 'banho',
    orderType: 'banho_tosa',
    date: '2026-07-22',
    preferredTime: '14:00',
    period: 'specific',
    services: [{ id: 's1', code: 'banho', name: 'Banho', group_type: 'banho_tosa', default_price: 60, default_duration_min: 60, active: true }],
    appointments: [],
    requirePetIdentity: true,
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(availability.ok, false)
  assert.deepEqual(availability.required_fields, ['nome do pet', 'espécie do pet'])
  assert.equal(availability.service, undefined)
  assert.equal(availability.available_slots, undefined)
})

test('sequencia de coleta usa classificacao da raca sem pular nome e peso', () => {
  const services = mergePetshopServiceCatalogs([], [
    { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Banho Pet Porte Pequeno 0 KG A 10 KG (Pelo Curto)', category: 'Serviço', price: 80, active: true, bot_metadata: { product_type: 'servico' } },
    { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'Banho Pet Porte Pequeno 0 KG A 10 KG (Pelo Duplo)', category: 'Serviço', price: 95, active: true, bot_metadata: { product_type: 'servico' } },
  ])

  const withoutName = buildServiceAvailability({
    serviceQuery: 'banho', orderType: 'banho_tosa', species: 'dog', breed: 'Spitz',
    date: '2026-07-22', preferredTime: '14:00', period: 'specific', services,
    requirePetIdentity: true, now: new Date('2026-07-21T10:00:00-03:00'),
  })
  assert.equal(withoutName.required_fields[0], 'nome do pet')

  const withoutWeight = buildServiceAvailability({
    serviceQuery: 'banho', orderType: 'banho_tosa', petName: 'Theo', species: 'dog', breed: 'Spitz',
    date: '2026-07-22', preferredTime: '14:00', period: 'specific', services,
    requirePetIdentity: true, now: new Date('2026-07-21T10:00:00-03:00'),
  })
  assert.equal(withoutWeight.required_fields[0], 'peso do pet em kg')

  const classifiedByBreed = buildServiceAvailability({
    serviceQuery: 'banho', orderType: 'banho_tosa', petName: 'Theo', species: 'dog', breed: 'Spitz Alemão', weightKg: 7,
    date: '2026-07-22', preferredTime: '14:00', period: 'specific', services,
    requirePetIdentity: true, now: new Date('2026-07-21T10:00:00-03:00'),
  })
  assert.equal(classifiedByBreed.ok, true)
  assert.match(classifiedByBreed.service.name, /Pelo Duplo/)

  const unknownBreed = buildServiceAvailability({
    serviceQuery: 'banho', orderType: 'banho_tosa', petName: 'Theo', species: 'dog', breed: 'Raca inventada', weightKg: 7,
    date: '2026-07-22', preferredTime: '14:00', period: 'specific', services,
    requirePetIdentity: true, now: new Date('2026-07-21T10:00:00-03:00'),
  })
  assert.equal(unknownBreed.ok, false)
  assert.equal(unknownBreed.required_fields[0], 'tipo de pelo do pet')
})


test('catalogo comum padroniza pelagem e preserva racas ambiguas', () => {
  assert.equal(classifyCommonPetBreed('Lulu da Pomerânia')?.coat_type, 'duplo')
  assert.equal(classifyCommonPetBreed('Shih-tzu')?.coat_type, 'longo')
  assert.equal(classifyCommonPetBreed('Poodle toy')?.coat_type, 'medio')
  assert.equal(classifyCommonPetBreed('Bulldog Francês')?.coat_type, 'curto')
  assert.equal(classifyCommonPetBreed('Dachshund')?.ambiguous, true)
  assert.equal(classifyCommonPetBreed('SRD')?.coat_type, null)
})

test('preset de servico preenche somente racas da pelagem correspondente', () => {
  const preset = buildServiceBreedPreset('Banho Pet Porte Medio 10,1 A 22 KG (Pelo Duplo)')
  assert.equal(preset.coat_type, 'duplo')
  assert.equal(preset.species, 'dog')
  assert.ok(preset.breed.includes('spitz alemao'))
  assert.ok(preset.breed.includes('golden retriever'))
  assert.equal(preset.breed.includes('shih tzu'), false)

  const all = buildServiceBreedPreset('Banho Pet Porte Pequeno 0 KG A 10 KG (Todas As Raças)')
  assert.equal(all.coat_type, 'todas')
  assert.equal(all.all_breeds, true)
  assert.deepEqual(all.breed, [])
})

test('metadata editavel do servico tem prioridade na classificacao da raca', () => {
  const services = mergePetshopServiceCatalogs([], [
    {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Curto)',
      category: 'Serviço', price: 80, active: true,
      bot_metadata: { product_type: 'servico', coat_type: 'curto', breed: ['raca personalizada'] },
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Duplo)',
      category: 'Serviço', price: 105, active: true,
      bot_metadata: { product_type: 'servico', coat_type: 'duplo', breed: ['spitz alemao'] },
    },
  ])

  const availability = buildServiceAvailability({
    serviceQuery: 'banho', orderType: 'banho_tosa', petName: 'Theo', species: 'dog',
    breed: 'Spitz Alemão', weightKg: 12, date: '2026-07-22', preferredTime: '14:00',
    period: 'specific', services, appointments: [], requirePetIdentity: true,
    now: new Date('2026-07-21T10:00:00-03:00'),
  })

  assert.equal(availability.ok, true)
  assert.match(availability.service.name, /Pelo Duplo/)
  assert.equal(availability.service.price, 105)
})

test('peso decide entre servico pequeno geral e variacao de pelagem do porte seguinte', () => {
  const services = mergePetshopServiceCatalogs([], [
    {
      id: 'aaaaaaaa-1111-1111-1111-111111111111',
      name: 'Banho Pet Porte Pequeno 0 KG A 10 KG (Todas As Raças)',
      category: 'Serviço', price: 72, active: true,
      bot_metadata: { product_type: 'servico', coat_type: 'todas', all_breeds: true, breed: [] },
    },
    {
      id: 'bbbbbbbb-2222-2222-2222-222222222222',
      name: 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Curto)',
      category: 'Serviço', price: 88, active: true,
      bot_metadata: { product_type: 'servico', coat_type: 'curto', breed: ['bulldog frances'] },
    },
    {
      id: 'cccccccc-3333-3333-3333-333333333333',
      name: 'Banho Pet Porte Medio 10,1 A 22 KG (Pelo Duplo)',
      category: 'Serviço', price: 104, active: true,
      bot_metadata: { product_type: 'servico', coat_type: 'duplo', breed: ['spitz alemao'] },
    },
  ])

  const small = buildServiceAvailability({
    serviceQuery: 'banho', orderType: 'banho_tosa', petName: 'Theo', species: 'dog',
    breed: 'Spitz Alemão', weightKg: 8, date: '2026-07-22', preferredTime: '14:00',
    period: 'specific', services, appointments: [], requirePetIdentity: true,
    now: new Date('2026-07-21T10:00:00-03:00'),
  })
  assert.equal(small.ok, true)
  assert.match(small.service.name, /Porte Pequeno.*Todas As Raças/)
  assert.equal(small.service.price, 72)

  const medium = buildServiceAvailability({
    serviceQuery: 'banho', orderType: 'banho_tosa', petName: 'Theo', species: 'dog',
    breed: 'Spitz Alemão', weightKg: 12, date: '2026-07-22', preferredTime: '14:00',
    period: 'specific', services, appointments: [], requirePetIdentity: true,
    now: new Date('2026-07-21T10:00:00-03:00'),
  })
  assert.equal(medium.ok, true)
  assert.match(medium.service.name, /Porte Medio.*Pelo Duplo/)
  assert.equal(medium.service.price, 104)
})
