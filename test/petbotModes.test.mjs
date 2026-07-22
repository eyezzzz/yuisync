import assert from 'node:assert/strict'
import test from 'node:test'

import {
  acceptedPetbotHandoffOffer,
  explicitPetbotHandoffTarget,
  groundPetbotServiceArgs,
  mergeInterpretedPetbotServiceFacts,
  preparePetshopOrderDraft,
  shouldForcePetbotServicePreparation,
} from '../server/lib/petbotAgent.js'
import {
  buildPetbotAgentV3Prompt,
  buildUnknownStoreQuestionReply,
  buildVerifiedStoreQuestionReply,
  shouldAnswerVerifiedStoreQuestion,
  validatePetbotOperationalReply,
} from '../server/lib/petbotGrounding.js'
import {
  detectExplicitVeterinaryEmergency,
  normalizePetbotInterpretation,
} from '../server/lib/petbotAi.js'

const now = new Date('2026-07-22T10:00:00-03:00')
const veterinaryService = {
  id: 'vet-consultation',
  code: 'consulta_veterinaria',
  name: 'Consulta Veterinária',
  group_type: 'veterinaria',
  default_price: 120,
  default_duration_min: 40,
  active: true,
  species: 'dog',
  catalog_source: 'products',
  source_product_id: 'vet-product',
}

test('veterinaria preserva porte e sintoma entre mensagens e limpa ao trocar de pet', () => {
  const firstTurn = mergeInterpretedPetbotServiceFacts({
    interpretation: {
      pet_name: 'Bob', species: 'dog', size: 'pequeno', symptom: 'coceira forte',
      service_type: 'consulta veterinária',
    },
  })
  const secondTurn = mergeInterpretedPetbotServiceFacts({
    interpretation: { service_date: 'amanhã', service_preferred_time: '14h' },
    previousFacts: firstTurn,
  })

  assert.equal(secondTurn.size, 'pequeno')
  assert.equal(secondTurn.symptom, 'coceira forte')
  assert.equal(groundPetbotServiceArgs({ size: null, symptom: null }, secondTurn).symptom, 'coceira forte')

  const changedPet = mergeInterpretedPetbotServiceFacts({
    interpretation: { pet_name: 'Luna', species: 'cat' },
    previousFacts: secondTurn,
  })
  assert.equal(changedPet.size, null)
  assert.equal(changedPet.symptom, null)
})

test('veterinaria completa força o resumo sem depender de uma nova decisão do modelo', () => {
  const ready = shouldForcePetbotServicePreparation({
    orderType: 'veterinaria',
    customerName: 'Ana',
    facts: {
      pet_name: 'Bob', species: 'dog', size: 'pequeno', symptom: 'coceira',
      service_date: '2026-07-25', service_preferred_time: '14:00',
    },
    resolvedService: veterinaryService,
    operationalContext: { availability: { requested_slot: { available: true } } },
  })
  assert.equal(ready, true)

  const missingSymptom = shouldForcePetbotServicePreparation({
    orderType: 'veterinaria',
    customerName: 'Ana',
    facts: {
      pet_name: 'Bob', species: 'dog', size: 'pequeno',
      service_date: '2026-07-25', service_preferred_time: '14:00',
    },
    resolvedService: veterinaryService,
    operationalContext: { availability: { requested_slot: { available: true } } },
  })
  assert.equal(missingSymptom, false)
})

test('agendamento veterinário não exige pagamento, transporte, peso ou pelagem', () => {
  const prepared = preparePetshopOrderDraft({
    args: {
      customer_name: 'Ana', pet_name: 'Bob', species: 'dog', size: 'pequeno',
      breed: null, weight_kg: null, symptom: 'coceira', order_type: 'veterinaria',
      appointment_id: null, scheduled_at: '2026-07-25T14:00:00-03:00',
      service_product_id: 'vet-product', service_code: 'consulta_veterinaria',
      service_type: 'consulta_veterinaria', notes: null,
    },
    services: [veterinaryService],
    appointments: [],
    settings: {
      petbotTimezone: 'America/Sao_Paulo',
      petbotBookingLeadTimeMin: 0,
      petbotBusinessHours: { 6: [{ open: '08:00', close: '18:00' }] },
    },
    now,
  })

  assert.equal(prepared.ok, true)
  assert.equal(prepared.order.order_type, 'veterinaria')
  assert.equal(prepared.order.payment_method, null)
  assert.equal(prepared.order.service_transport_mode, null)
  assert.doesNotMatch(prepared.summary, /Pix|dinheiro|cartão|MotoDog|pelagem|peso/i)
})

test('compra fracionada é revalidada contra o estoque antes da confirmação', () => {
  const args = {
    customer_name: 'Carlos', order_type: 'produto',
    items: [{ product_id: 'bulk-food', quantity: 2.5, upsell: false }],
    payment_method: 'pix', fulfillment_type: 'retirada',
  }
  const available = preparePetshopOrderDraft({
    args,
    products: [{ id: 'bulk-food', name: 'Ração Premium Granel', price: 20, stock_quantity: 4, active: true }],
  })
  assert.equal(available.ok, true)
  assert.equal(available.order.total, 50)

  const changedStock = preparePetshopOrderDraft({
    args: available.order,
    products: [{ id: 'bulk-food', name: 'Ração Premium Granel', price: 20, stock_quantity: 2, active: true }],
  })
  assert.equal(changedStock.ok, false)
  assert.ok(changedStock.missing.some((item) => /estoque suficiente/i.test(item)))
})

test('pedido explícito de pessoa é transferido sem confundir consulta veterinária', () => {
  assert.equal(explicitPetbotHandoffTarget('quero falar com um atendente'), 'atendente')
  assert.equal(explicitPetbotHandoffTarget('me transfere para a veterinária'), 'veterinaria')
  assert.equal(explicitPetbotHandoffTarget('preciso de um veterinário para meu cachorro'), '')
  assert.equal(explicitPetbotHandoffTarget('preciso de um veterinário para meu cachorro', { wants_human: true }), '')
  assert.equal(explicitPetbotHandoffTarget('quero falar com alguém', { wants_human: true }), 'atendente')
  assert.equal(acceptedPetbotHandoffOffer('sim', [
    { role: 'assistant', content: 'Posso chamar um atendente para verificar para você?' },
  ]), true)
  assert.equal(acceptedPetbotHandoffOffer('sim', [
    { role: 'assistant', content: 'Confirma o agendamento?' },
  ]), false)
})

test('dúvidas recebem somente informações verificadas e mensagens aprovadas', () => {
  const prompt = buildPetbotAgentV3Prompt({
    storeName: 'Quatro Patas',
    storePhone: '(32) 99999-0000',
    storeLocation: 'Rua da Loja, 10 - Centro',
    storeInformation: {
      business_hours: { 'segunda-feira': ['08:00-18:00'] },
      product_payment_methods: ['Pix', 'dinheiro', 'cartão'],
      approved_messages: { appointment_confirmation: 'Mensagem aprovada de confirmação.' },
    },
  })

  assert.match(prompt, /Informações verificadas da loja/)
  assert.match(prompt, /Rua da Loja, 10/)
  assert.match(prompt, /08:00-18:00/)
  assert.match(prompt, /Mensagem aprovada de confirmação/)
  assert.match(prompt, /precisa confirmar com a equipe e ofereça falar com um atendente/)
})

test('pergunta composta de loja responde todos os fatos disponíveis sem usar o modelo', () => {
  const reply = buildVerifiedStoreQuestionReply({
    message: 'Qual o endereço e o horário de sábado?',
    storeInformation: {
      address: 'Rua da Loja, 10 - Centro',
      business_hours: { sábado: ['08:00-13:00'] },
    },
  })
  assert.match(reply, /Rua da Loja, 10/)
  assert.match(reply, /sábado: 08:00-13:00/)
})

test('agente não pode anunciar transferência sem registrar o handoff', () => {
  const invalid = validatePetbotOperationalReply({
    reply: 'Claro, vou transferir você para a veterinária agora.',
    toolRuns: [],
  })
  assert.equal(invalid.ok, false)
  assert.ok(invalid.problems.some((problem) => /sem executar o handoff/.test(problem)))

  const valid = validatePetbotOperationalReply({
    reply: 'Claro, vou transferir você para a veterinária agora.',
    toolRuns: [{ name: 'handoff_to_human', ok: true, result: { status: 'transferred', target: 'veterinaria' } }],
  })
  assert.equal(valid.ok, true)
})

test('interpretador classifica emergência veterinária em campo estruturado', () => {
  assert.equal(normalizePetbotInterpretation({ veterinary_risk: 'emergency' }).veterinary_risk, 'emergency')
  assert.equal(normalizePetbotInterpretation({ veterinary_risk: 'valor_invalido' }).veterinary_risk, 'none')
})

test('emergência veterinária tem trava local mesmo se o modelo classificar errado', () => {
  assert.equal(detectExplicitVeterinaryEmergency('Meu cachorro está com dificuldade para respirar'), true)
  assert.equal(detectExplicitVeterinaryEmergency('Ele está com sangramento intenso'), true)
  assert.equal(detectExplicitVeterinaryEmergency('Quero marcar uma consulta de rotina'), false)
})

test('dúvida sem informação cadastrada nunca recebe fato inventado', () => {
  assert.equal(
    buildUnknownStoreQuestionReply({ storeInformation: {} }),
    'Não tenho essa informação confirmada no cadastro da loja. Posso chamar um atendente para verificar para você?',
  )
  assert.equal(
    buildUnknownStoreQuestionReply({
      storeInformation: { approved_messages: { unknown_information: 'Vou confirmar com a equipe. Quer falar com um atendente?' } },
    }),
    'Vou confirmar com a equipe. Quer falar com um atendente?',
  )
})

test('resposta curta de compra ou serviço não é confundida com dúvida da loja', () => {
  assert.equal(shouldAnswerVerifiedStoreQuestion({
    message: 'Vocês hospedam jabuti?', detectedIntent: 'duvida',
  }), true)
  assert.equal(shouldAnswerVerifiedStoreQuestion({
    message: '2kg', detectedIntent: 'duvida', interpretedIntent: 'produto',
  }), false)
  assert.equal(shouldAnswerVerifiedStoreQuestion({
    message: 'vou levar', detectedIntent: 'duvida', serviceOrderType: 'banho_tosa',
  }), false)
  assert.equal(shouldAnswerVerifiedStoreQuestion({
    message: 'sim', detectedIntent: 'duvida', hasPendingOrder: true,
  }), false)
})
