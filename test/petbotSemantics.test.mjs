import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizePetbotInterpretation,
  resolvePetbotTurnSemantics,
} from '../server/lib/petbotAi.js'
import { mergeInterpretedPetbotServiceFacts } from '../server/lib/petbotAgent.js'
import {
  detectExplicitProductFulfillmentType,
  detectExplicitProductPaymentMethod,
  detectExplicitProductQuantity,
  mergeProductQueryFacts,
  buildVerifiedStoreQuestionReply,
  shouldAnswerVerifiedStoreQuestion,
} from '../server/lib/petbotGrounding.js'

function semantics(interpretation, hasPendingOrder = false) {
  return resolvePetbotTurnSemantics({
    interpretation: {
      dialogue_act: 'inform',
      reply_target: 'other',
      confidence: 0.96,
      ...interpretation,
    },
    hasPendingOrder,
  })
}

test('confirmação semântica depende do estado transacional e não de uma palavra específica', () => {
  for (const intent of ['produto', 'banho_tosa', 'veterinaria']) {
    const interpretation = {
      intent,
      dialogue_act: 'affirm',
      reply_target: 'final_confirmation',
      confirmation: true,
      confidence: 0.97,
    }
    assert.equal(semantics(interpretation, true).confirms_pending_order, true)
    assert.equal(semantics(interpretation, true).confirmation_decision_made, true)
    assert.equal(semantics(interpretation, false).confirms_pending_order, false)
  }

  assert.equal(semantics({
    dialogue_act: 'affirm',
    reply_target: 'appointment_time',
    confirmation: false,
  }, true).confirms_pending_order, false)

  assert.equal(semantics({
    dialogue_act: 'correct',
    reply_target: 'final_confirmation',
    confirmation: false,
  }, true).confirmation_decision_made, true)

  assert.equal(semantics({
    dialogue_act: 'affirm',
    reply_target: 'final_confirmation',
    confirmation: true,
    negation: true,
  }, true).confirms_pending_order, false)
})

test('baixa confiança não altera escolhas críticas e mantém o fallback seguro', () => {
  const result = resolvePetbotTurnSemantics({
    interpretation: {
      dialogue_act: 'select',
      reply_target: 'fulfillment',
      fulfillment_type: 'entrega',
      confidence: 0.41,
    },
  })

  assert.equal(result.confident, false)
  assert.equal(result.fulfillment_type, '')
  assert.equal(result.confirms_pending_order, false)

  const transport = resolvePetbotTurnSemantics({
    interpretation: {
      dialogue_act: 'select',
      reply_target: 'service_transport',
      service_transport_mode: 'motodog',
      confidence: 0.41,
    },
  })
  assert.equal(transport.service_transport_mode, '')
})

test('venda aceita significado estruturado mesmo quando a frase não pertence ao dicionário lexical', () => {
  assert.equal(detectExplicitProductFulfillmentType('manda aki pf'), '')
  assert.equal(detectExplicitProductPaymentMethod('passa no cartau'), '')
  assert.equal(detectExplicitProductQuantity('treis kilu', 'granel'), null)

  const base = {
    product_kind: 'food',
    package_preference: 'granel',
    quantity: null,
  }
  const deliveryInterpretation = {
    intent: 'produto',
    dialogue_act: 'select',
    reply_target: 'fulfillment',
    fulfillment_type: 'entrega',
    confidence: 0.96,
  }
  const delivery = mergeProductQueryFacts({
    interpretation: deliveryInterpretation,
    previousFacts: base,
    message: 'manda aki pf',
    semantics: semantics(deliveryInterpretation),
  })
  assert.equal(delivery.fulfillment_type, 'entrega')

  const paymentInterpretation = {
    intent: 'produto',
    dialogue_act: 'select',
    reply_target: 'payment',
    payment_method: 'cartao',
    confidence: 0.95,
  }
  const paid = mergeProductQueryFacts({
    interpretation: paymentInterpretation,
    previousFacts: delivery,
    message: 'passa no cartau',
    semantics: semantics(paymentInterpretation),
  })
  assert.equal(paid.payment_method, 'cartao')

  const quantityInterpretation = {
    intent: 'produto',
    dialogue_act: 'inform',
    reply_target: 'quantity',
    quantity: 3,
    confidence: 0.94,
  }
  const quantified = mergeProductQueryFacts({
    interpretation: quantityInterpretation,
    previousFacts: paid,
    message: 'treis kilu',
    semantics: semantics(quantityInterpretation),
  })
  assert.equal(quantified.quantity, 3)
  assert.equal(quantified.package_preference, 'granel')
})

test('mudança semântica de embalagem substitui a escolha anterior sem exigir grafia exata', () => {
  const interpretation = {
    intent: 'produto',
    dialogue_act: 'correct',
    reply_target: 'package_preference',
    package_preference: 'saco_maior',
    package_kg: 15,
    confidence: 0.93,
  }
  const result = mergeProductQueryFacts({
    interpretation,
    previousFacts: {
      product_kind: 'food',
      package_preference: 'granel',
      quantity: 2,
    },
    message: 'melhor a sacaria grandona di quinze',
    semantics: semantics(interpretation),
  })

  assert.equal(result.package_preference, 'saco_maior')
  assert.equal(result.package_kg, 15)
  assert.equal(result.quantity, null)

  const uncertain = mergeProductQueryFacts({
    interpretation: {
      package_preference: 'saco_maior',
      package_kg: 15,
      dialogue_act: 'select',
      reply_target: 'package_preference',
      confidence: 0.4,
    },
    previousFacts: {
      product_kind: 'food',
      package_preference: 'granel',
      quantity: 2,
    },
    message: 'talvez eu mude',
    semantics: resolvePetbotTurnSemantics({
      interpretation: {
        package_preference: 'saco_maior',
        package_kg: 15,
        dialogue_act: 'select',
        reply_target: 'package_preference',
        confidence: 0.4,
      },
    }),
  })
  assert.equal(uncertain.package_preference, 'granel')
  assert.equal(uncertain.package_kg, null)
  assert.equal(uncertain.quantity, 2)
})

test('banho e veterinária compartilham atos semânticos sem compartilhar regras operacionais', () => {
  const transportInterpretation = {
    intent: 'banho_tosa',
    dialogue_act: 'select',
    reply_target: 'service_transport',
    service_transport_mode: 'cliente_leva',
    confidence: 0.94,
  }
  const transport = semantics(transportInterpretation)
  const bathFacts = mergeInterpretedPetbotServiceFacts({
    interpretation: {
      service_type: 'banho',
      service_transport_mode: transport.service_transport_mode,
    },
    previousFacts: { pet_name: 'Thor', species: 'dog' },
  })
  assert.equal(bathFacts.service_transport_mode, 'cliente_leva')

  const veterinary = semantics({
    intent: 'veterinaria',
    dialogue_act: 'inform',
    reply_target: 'appointment_time',
    service_transport_mode: 'cliente_leva',
  })
  assert.equal(veterinary.service_transport_mode, '')
})

test('pedido de atendimento humano é uma intenção canônica com destino estruturado', () => {
  const result = semantics({
    dialogue_act: 'request_human',
    reply_target: 'other',
    wants_human: true,
    handoff_target: 'veterinaria',
  })

  assert.equal(result.requests_human, true)
  assert.equal(result.handoff_target, 'veterinaria')

  const inconsistent = semantics({
    dialogue_act: 'request_human',
    reply_target: 'fulfillment',
    wants_human: false,
    handoff_target: 'atendente',
  })
  assert.equal(inconsistent.requests_human, false)

  const petFactMisclassifiedAsHandoff = semantics({
    dialogue_act: 'request_human',
    reply_target: 'pet_identity',
    wants_human: true,
    handoff_target: 'atendente',
  })
  assert.equal(petFactMisclassifiedAsHandoff.requests_human, false)
})

test('normalização preserva a taxonomia semântica e quantidade fracionada', () => {
  const result = normalizePetbotInterpretation({
    dialogue_act: 'select',
    reply_target: 'quantity',
    quantity: 0.5,
    option_index: 2,
    handoff_target: 'atendente',
  })

  assert.equal(result.dialogue_act, 'select')
  assert.equal(result.reply_target, 'quantity')
  assert.equal(result.quantity, 0.5)
  assert.equal(result.option_index, 2)
  assert.equal(result.handoff_target, 'atendente')

  const empty = normalizePetbotInterpretation({
    quantity: null,
    option_index: null,
    weight_kg: null,
  })
  assert.equal(empty.quantity, null)
  assert.equal(empty.option_index, null)
  assert.equal(empty.weight_kg, null)
})


test('memória de serviço preserva fatos quando peso chega depois de outras mensagens', () => {
  let facts = mergeInterpretedPetbotServiceFacts({
    interpretation: { pet_name: 'Thor', species: 'dog', breed: 'Shih Tzu' },
    previousFacts: {},
  })
  facts = mergeInterpretedPetbotServiceFacts({
    interpretation: { service_date: '2026-07-25', service_preferred_time: '10:00' },
    previousFacts: facts,
  })
  facts = mergeInterpretedPetbotServiceFacts({
    interpretation: { service_transport_mode: 'cliente_leva' },
    previousFacts: facts,
  })
  facts = mergeInterpretedPetbotServiceFacts({
    interpretation: { service_notes: 'sem perfume', service_notes_resolved: true },
    previousFacts: facts,
  })
  facts = mergeInterpretedPetbotServiceFacts({
    interpretation: { weight_kg: 8, weight_label: '8 kg' },
    previousFacts: facts,
  })

  assert.equal(facts.pet_name, 'Thor')
  assert.equal(facts.breed, 'Shih Tzu')
  assert.equal(facts.weight_kg, 8)
  assert.equal(facts.service_date, '2026-07-25')
  assert.equal(facts.service_preferred_time, '10:00')
  assert.equal(facts.service_transport_mode, 'cliente_leva')
  assert.equal(facts.service_notes, 'sem perfume')
  assert.equal(facts.service_notes_resolved, true)
})

test('pergunta sobre conteúdo do banho usa mensagem aprovada sem virar troca de serviço', () => {
  const storeInformation = {
    service_knowledge: {
      small_bath_service: 'Banho inclui corte de unhas, limpeza de ouvidos e tosa higiênica.',
    },
  }

  assert.equal(shouldAnswerVerifiedStoreQuestion({
    message: 'o banho inclui tosa higiênica?',
    detectedIntent: 'duvida',
    interpretedIntent: 'banho_tosa',
    serviceOrderType: 'banho_tosa',
    hasPendingOrder: false,
  }), true)

  assert.match(buildVerifiedStoreQuestionReply({
    message: 'o banho inclui tosa higiênica?',
    storeInformation,
  }), /inclui corte de unhas.*tosa higiênica/i)
})

test('MotoDog distingue modalidade generica das tres opcoes reais e preserva endereco', () => {
  assert.equal(normalizePetbotInterpretation({ service_transport_mode: 'motodog' }).service_transport_mode, 'motodog')
  assert.equal(normalizePetbotInterpretation({ service_transport_mode: 'buscar e levar' }).service_transport_mode, 'buscar_e_levar')
  assert.equal(normalizePetbotInterpretation({ service_transport_mode: 'somente buscar' }).service_transport_mode, 'somente_buscar')
  assert.equal(normalizePetbotInterpretation({ service_transport_mode: 'somente levar' }).service_transport_mode, 'somente_levar')

  let facts = mergeInterpretedPetbotServiceFacts({
    interpretation: { service_transport_mode: 'buscar_e_levar' },
    previousFacts: { pet_name: 'Thor', breed: 'Shih Tzu', weight_kg: 8 },
  })
  facts = mergeInterpretedPetbotServiceFacts({
    interpretation: {
      service_transport_address: 'Rua das Flores, 120',
      service_transport_neighborhood: 'Centro',
      service_transport_city: 'Muriaé',
      service_transport_reference: 'portão azul',
    },
    previousFacts: facts,
  })

  assert.equal(facts.service_transport_mode, 'buscar_e_levar')
  assert.equal(facts.service_transport_address, 'Rua das Flores, 120')
  assert.equal(facts.service_transport_neighborhood, 'Centro')
  assert.equal(facts.service_transport_city, 'Muriaé')
  assert.equal(facts.service_transport_reference, 'portão azul')
  assert.equal(facts.weight_kg, 8)
})
