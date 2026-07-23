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
  buildRationQualificationReply,
  buildUnknownStoreQuestionReply,
  buildVerifiedStoreQuestionReply,
  enrichProductQueryFactsFromSavedPet,
  mergeProductQueryFacts,
  productFactsSignature,
  resolveRecentProductCandidate,
  shouldAnswerVerifiedStoreQuestion,
  validatePetbotOperationalReply,
} from '../server/lib/petbotGrounding.js'
import {
  detectExplicitVeterinaryEmergency,
  normalizePetbotInterpretation,
} from '../server/lib/petbotAi.js'
import {
  buildRationPackagePreferenceReply,
  classifyProduct,
  detectCatalogRequest,
  rankCatalogProducts,
} from '../server/lib/petbotCatalog.js'
import {
  COMMON_PET_BREED_CLASSIFICATIONS,
  classifyCommonPetBreed,
} from '../shared/petbotBreedCatalog.js'

const now = new Date('2026-07-22T10:00:00-03:00')

test('todas as raças cadastradas no catálogo comum possuem porte comercial', () => {
  const missing = COMMON_PET_BREED_CLASSIFICATIONS
    .filter((entry) => !classifyCommonPetBreed(entry.canonical)?.size)
    .map((entry) => entry.canonical)

  assert.deepEqual(missing, [])
  assert.equal(classifyCommonPetBreed('Shih Tzu')?.size, 'pequeno')
  assert.equal(classifyCommonPetBreed('Beagle')?.size, 'medio')
  assert.equal(classifyCommonPetBreed('Golden Retriever')?.size, 'grande')
  assert.equal(classifyCommonPetBreed('Poodle gigante')?.size, 'grande')
  assert.equal(classifyCommonPetBreed('Schnauzer miniatura')?.size, 'pequeno')
})

test('interpretador deriva porte da raça sem depender da resposta do modelo', () => {
  assert.equal(normalizePetbotInterpretation({ breed: 'Shih Tzu' }).size, 'pequeno')
  assert.equal(normalizePetbotInterpretation({ breed: 'Border Collie' }).size, 'medio')
  assert.equal(normalizePetbotInterpretation({ breed: 'Rottweiler' }).size, 'grande')
})

test('matriz de rações preserva 900 combinações de raça, fase e formato', () => {
  const ages = ['filhote', 'adulto', 'senior', 'castrado']
  const formats = [
    { message: 'quero a granel', preference: 'granel', packageKg: null },
    { message: 'quero pacote de 2 kg', preference: 'pacote_pequeno', packageKg: 2 },
    { message: 'quero saco de 15 kg', preference: 'saco_maior', packageKg: 15 },
  ]
  let validated = 0

  for (const breedEntry of COMMON_PET_BREED_CLASSIFICATIONS) {
    const classification = classifyCommonPetBreed(breedEntry.canonical)
    for (const age of ages) {
      for (const format of formats) {
        const identifiedPet = mergeProductQueryFacts({
          interpretation: {
            product_kind: 'food',
            pet_name: 'Thor',
            breed: breedEntry.canonical,
          },
          message: `quero uma ração para o Thor, ele é ${breedEntry.canonical}`,
        })
        const selectedFormat = mergeProductQueryFacts({
          interpretation: {},
          previousFacts: identifiedPet,
          message: format.message,
        })
        const completed = mergeProductQueryFacts({
          interpretation: {},
          previousFacts: selectedFormat,
          message: `ele é ${age}`,
        })

        assert.equal(completed.species, 'dog')
        assert.equal(completed.size, classification.size)
        assert.equal(completed.age_category, age)
        assert.equal(completed.package_preference, format.preference)
        assert.equal(completed.package_kg, format.packageKg)
        assert.equal(buildRationQualificationReply({ message: `ele é ${age}`, facts: completed }), '')

        if (format.preference === 'granel') {
          const signatureBeforeQuantity = productFactsSignature(completed)
          const withQuantity = mergeProductQueryFacts({
            interpretation: { quantity: 2 },
            previousFacts: completed,
            message: 'a 1 mesmo, me vê 2 kg',
          })
          assert.equal(withQuantity.package_preference, 'granel')
          assert.equal(withQuantity.package_kg, null)
          assert.equal(withQuantity.quantity, 2)
          assert.equal(productFactsSignature(withQuantity), signatureBeforeQuantity)
        }
        validated += 1
      }
    }
  }

  assert.equal(validated, COMMON_PET_BREED_CLASSIFICATIONS.length * 12)
})

test('toda ração pergunta o formato antes de consultar produtos', () => {
  const state = { product_kind: 'food', breed: 'Shih Tzu', size: 'pequeno' }
  const reply = buildRationPackagePreferenceReply('quero uma ração para shih tzu', state)

  assert.match(reply, /granel/i)
  assert.match(reply, /1 ou 2 kg/i)
  assert.match(reply, /7, 10, 15, 20 ou 25 kg/i)
  assert.equal(buildRationPackagePreferenceReply('quero a granel', state), '')
  assert.equal(buildRationPackagePreferenceReply('quero saco de 15 kg', state), '')
})

test('preferência de embalagem e raça sobrevivem a mensagens separadas', () => {
  const firstTurn = mergeProductQueryFacts({
    interpretation: { product_kind: 'food', breed: 'Shih Tzu', brand: 'Premier' },
    message: 'quero uma ração Premier para shih tzu',
  })
  const secondTurn = mergeProductQueryFacts({
    interpretation: {},
    previousFacts: firstTurn,
    message: 'e a granel?',
  })
  const thirdTurn = mergeProductQueryFacts({
    interpretation: {},
    previousFacts: secondTurn,
    message: 'na verdade prefiro saco maior',
  })

  assert.equal(firstTurn.size, 'pequeno')
  assert.equal(secondTurn.breed, 'Shih Tzu')
  assert.equal(secondTurn.brand, 'premier')
  assert.equal(secondTurn.package_preference, 'granel')
  assert.equal(detectCatalogRequest('e a granel?', secondTurn).type, 'granel')
  assert.equal(thirdTurn.package_preference, 'saco_maior')
})

test('kg solicitado depois da escolha a granel continua quantidade e não vira pacote', () => {
  const previous = mergeProductQueryFacts({
    interpretation: {
      product_kind: 'food',
      pet_name: 'Thor',
      species: 'dog',
      breed: 'Shih Tzu',
      age_category: 'adulto',
      brand: 'Premier',
      package_preference: 'granel',
    },
    message: 'a granel da Premier',
  })
  const current = mergeProductQueryFacts({
    interpretation: {
      package_preference: 'pacote_pequeno',
      package_kg: 2,
      quantity: 2,
    },
    previousFacts: previous,
    message: 'a 1 mesmo, me vê 2kg',
  })

  assert.equal(current.package_preference, 'granel')
  assert.equal(current.package_kg, null)
  assert.equal(current.quantity, 2)
  assert.equal(productFactsSignature(current), productFactsSignature(previous))
})

test('troca explícita de granel para pacote continua permitida', () => {
  const current = mergeProductQueryFacts({
    interpretation: { package_kg: 2 },
    previousFacts: {
      product_kind: 'food',
      package_preference: 'granel',
      quantity: 3,
    },
    message: 'na verdade quero um pacote de 2kg',
  })

  assert.equal(current.package_preference, 'pacote_pequeno')
  assert.equal(current.package_kg, 2)
  assert.equal(current.quantity, null)
})

test('qualificação de ração usa pet salvo, deriva porte da raça e pergunta fase de vida', () => {
  const initial = mergeProductQueryFacts({
    interpretation: { product_kind: 'food', pet_name: 'Thor', package_preference: 'granel' },
    message: 'quero ração a granel pro Thor',
  })
  const enriched = enrichProductQueryFactsFromSavedPet({
    facts: initial,
    savedPets: [{ name: 'Thor', species: 'dog', breed: 'Shih Tzu' }],
  })
  const reply = buildRationQualificationReply({
    message: 'a granel',
    facts: enriched,
  })

  assert.equal(enriched.species, 'dog')
  assert.equal(enriched.breed, 'Shih Tzu')
  assert.equal(enriched.size, 'pequeno')
  assert.match(reply, /filhote, adulto, sênior ou castrado/i)
  assert.doesNotMatch(reply, /porte/i)
})

test('qualificação de ração não consulta catálogo enquanto faltarem dados essenciais', () => {
  const base = { product_kind: 'food', pet_name: 'Thor' }
  assert.match(buildRationQualificationReply({ message: 'quero ração', facts: base }), /granel/i)
  assert.match(buildRationQualificationReply({
    message: 'a granel',
    facts: { ...base, package_preference: 'granel' },
  }), /cachorro ou gato/i)
  assert.match(buildRationQualificationReply({
    message: 'cachorro',
    facts: { ...base, package_preference: 'granel', species: 'dog' },
  }), /raça ou o porte/i)
  assert.match(buildRationQualificationReply({
    message: 'Shih Tzu',
    facts: {
      ...base,
      package_preference: 'granel',
      species: 'dog',
      breed: 'Shih Tzu',
      size: 'pequeno',
    },
  }), /filhote, adulto, sênior ou castrado/i)
})

test('seleção ordinal usa a opção anterior e não confunde quantidade em kg', () => {
  const candidates = [
    { id: 'adult', name: 'Premier Adulto' },
    { id: 'puppy', name: 'Premier Filhote' },
  ]

  assert.equal(resolveRecentProductCandidate('a 1 mesmo, me vê 2kg', candidates)?.id, 'adult')
  assert.equal(resolveRecentProductCandidate('quero a segunda', candidates)?.id, 'puppy')
  assert.equal(resolveRecentProductCandidate('me vê 2kg', candidates), null)
})

test('porte escrito diretamente pelo cliente não depende da interpretação da LLM', () => {
  assert.equal(mergeProductQueryFacts({
    interpretation: {},
    message: 'quero ração para raças pequenas',
  }).size, 'pequeno')
  assert.equal(mergeProductQueryFacts({
    interpretation: {},
    message: 'quero ração para porte médio',
  }).size, 'medio')
  assert.equal(mergeProductQueryFacts({
    interpretation: {},
    message: 'quero ração para raças grandes',
  }).size, 'grande')
})

test('busca por raça inclui o porte geral e elimina outra raça e outro porte', () => {
  const products = [
    { id: 'shih-1kg', name: 'Premier Shih Tzu 1 KG', category: 'Ração', price: 62.5, stock_quantity: 2, active: true },
    { id: 'lhasa-1kg', name: 'Premier Lhasa Apso 1 KG', category: 'Ração', price: 59.9, stock_quantity: 2, active: true },
    { id: 'small-bulk', name: 'GRANEL BIONATURAL ADULTO RAÇAS PEQUENAS KG', category: 'Ração', price: 18, stock_quantity: 20, active: true },
    { id: 'small-puppy-bulk', name: 'GRANEL BIONATURAL FILHOTE RAÇAS PEQUENAS KG', category: 'Ração', price: 19, stock_quantity: 20, active: true },
    { id: 'small-low-stock', name: 'GRANEL PREMIER ADULTO RAÇAS PEQUENAS KG', category: 'Ração', price: 21.5, stock_quantity: 1, active: true },
    { id: 'large-bulk', name: 'GRANEL BIONATURAL ADULTO RAÇAS GRANDES KG', category: 'Ração', price: 17, stock_quantity: 20, active: true },
  ]
  const ranked = rankCatalogProducts(products, {
    product_kind: 'food',
    species: 'dog',
    breed: 'Shih Tzu',
    size: 'pequeno',
    age_category: 'adulto',
    brand: 'premier',
    package_preference: 'granel',
    quantity: 2,
  }, 'e a granel?')

  assert.deepEqual(ranked.map((item) => item.product.id), ['small-bulk'])
})

test('formatos pequeno e saco maior não se misturam', () => {
  const products = [
    { id: 'small', name: 'Ração Cães Pequenos 2 KG', category: 'Ração', price: 45, stock_quantity: 2, active: true },
    { id: 'large', name: 'Ração Cães Pequenos 15 KG', category: 'Ração', price: 190, stock_quantity: 2, active: true },
    { id: 'bulk', name: 'GRANEL RAÇAS PEQUENAS KG', category: 'Ração', price: 16, stock_quantity: 20, active: true },
  ]

  assert.deepEqual(
    rankCatalogProducts(products, { product_kind: 'food', size: 'pequeno', package_preference: 'pacote_pequeno' }, 'ração')
      .map((item) => item.product.id),
    ['small'],
  )
  assert.deepEqual(
    rankCatalogProducts(products, { product_kind: 'food', size: 'pequeno', package_preference: 'saco_maior' }, 'ração')
      .map((item) => item.product.id),
    ['large'],
  )
  assert.equal(classifyProduct(products[2]).type, 'granel')
})

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
