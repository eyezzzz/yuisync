import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPetbotConfirmationReply,
  getPetbotState,
  markPetbotOrderSaved,
  mergePetbotContext,
  recoverPetbotContextFromHistory,
  renderGuardedPetbotReply,
  runPetbotGuard,
  snapshotPetbotState,
} from '../server/lib/petbotGuard.js'
import {
  classifyProduct,
  detectCatalogRequest,
  rankCatalogProducts,
} from '../server/lib/petbotCatalog.js'

const settings = { deliveryFee: 10, petTransportFee: 20 }

function dateOffset(days) {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const [year, month, day] = today.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0)).toISOString().slice(0, 10)
}

const appointmentDate = dateOffset(1)
const appointmentAt = (time) => `${appointmentDate}T${time}:00-03:00`

const products = [
  {
    id: 'premier-shih-adulto',
    name: 'Premier Raças Especificas Shih Tzu Salmão Adulto 2,5kg',
    category: 'Ração',
    price: 120,
    stock_quantity: 4,
    image_url: 'https://cdn.example.com/premier-shih-tzu.jpg',
    active: true,
  },
  {
    id: 'petisco-dental',
    name: 'Petisco Dental Cães Pequenos',
    category: 'Petisco',
    price: 15,
    stock_quantity: 10,
    active: true,
  },
  {
    id: 'canister-kibe',
    name: 'CANISTER CÃO KIBE',
    category: 'Petisco',
    price: 10,
    stock_quantity: 10,
    active: true,
  },
  {
    id: 'kitek-sache',
    name: 'KITEKAT CAT SACHE CARNE',
    category: 'Sachê gato',
    price: 4,
    stock_quantity: 20,
    active: true,
  },
  {
    id: 'whiskas-gato-adulto',
    name: 'WHISKAS GATO ADULTO FRANGO 3KG',
    category: 'Ração gato',
    price: 65,
    stock_quantity: 6,
    active: true,
  },
  {
    id: 'quatree-gato-castrado-granel',
    name: 'GRANEL QUATREE LIFE GATOS CASTRADOS',
    category: 'Ração gato',
    price: 18.5,
    stock_quantity: 4,
    active: true,
  },
  {
    id: 'quatree-gato-castrado-15kg',
    name: 'QUATREE LIFE GATOS CASTRADOS 15 KG',
    category: 'Ração gato',
    price: 185,
    stock_quantity: 2,
    active: true,
  },
  {
    id: 'bravecto-8kg',
    name: 'BRAVECTO 4.5 A 10KG',
    category: 'Medicamentos',
    price: 180,
    stock_quantity: 3,
    active: true,
  },
  {
    id: 'areia-gato',
    name: 'AREIA HIGIENICA GATO 4KG',
    category: 'Areia',
    price: 22,
    stock_quantity: 8,
    active: true,
  },
]

const appointments = [
  {
    id: 'slot-14',
    service_type: 'Banho',
    scheduled_at: appointmentAt('14:00'),
    status: 'available',
    price: 70,
  },
  {
    id: 'slot-16',
    service_type: 'Banho e tosa',
    scheduled_at: appointmentAt('16:30'),
    status: 'available',
    price: 90,
  },
]

const granelPremierDog = {
  id: 'granel-premier-rp',
  name: 'GRANEL PREMIER FRANGO RAÇAS PEQUENAS ADULTOS KG',
  category: 'Ração',
  price: 21.5,
  stock_quantity: 20,
  active: true,
}

const mixedAppointments = [
  {
    id: 'slot-bath-14',
    service_type: 'Banho',
    scheduled_at: appointmentAt('14:00'),
    status: 'available',
    price: 70,
  },
  {
    id: 'slot-bath-busy',
    service_type: 'Banho',
    scheduled_at: appointmentAt('10:00'),
    status: 'booked',
    price: 70,
  },
  {
    id: 'slot-groom-16',
    service_type: 'Banho e tosa',
    scheduled_at: appointmentAt('16:30'),
    status: 'available',
    price: 90,
  },
  {
    id: 'slot-vet-15',
    service_type: 'Consulta veterinária',
    scheduled_at: appointmentAt('15:00'),
    status: 'available',
    price: 120,
  },
]

const finalFlowAppointments = [
  ...mixedAppointments,
  {
    id: 'slot-vaccine-17',
    service_type: 'Vacina',
    scheduled_at: appointmentAt('17:00'),
    status: 'available',
    price: 95,
  },
]

function turn(context, message, extra = {}) {
  const result = runPetbotGuard({
    message,
    session: {
      id: 'session-1',
      module_id: 'petshop',
      tenant_id: 'tenant-1',
      customer_phone: '123',
      customer_name: null,
      context,
    },
    customer: { client: null, phone: '123', isKnown: false },
    products,
    appointments,
    settings,
    ...extra,
  })
  return {
    ...result,
    context: mergePetbotContext(context, result.state),
  }
}

function runConversation(messages, extra = {}) {
  let context = {}
  let result = null
  for (const message of messages) {
    result = turn(context, message, extra)
    context = result.context
  }
  return { result, context }
}

function assertConversationSaved(scenario) {
  const { result } = runConversation(scenario.messages, scenario.extra || {})
  assert.equal(result.shouldSaveOrder, true, scenario.name)
  assert.equal(result.action, 'confirmar_salvar')
  assert.equal(result.orderArgs.order_type, scenario.orderType)
  assert.equal(Number(result.orderArgs.total) > 0, true)
  if (scenario.orderType === 'produto') {
    assert.equal(result.orderArgs.payment_method, scenario.payment)
    assert.ok(result.orderArgs.items?.[0]?.product_id, scenario.name)
    if (scenario.fulfillment) assert.equal(result.orderArgs.fulfillment_type, scenario.fulfillment)
  } else {
    assert.equal(result.orderArgs.payment_method, '')
    assert.ok(result.orderArgs.appointment_id, scenario.name)
    assert.ok(result.orderArgs.scheduled_at, scenario.name)
  }

  const saved = markPetbotOrderSaved(result.state, {
    sale_id: `${scenario.id}-sale`,
    order_id: `${scenario.id}-order`,
    appointment_id: result.orderArgs.appointment_id || '',
  })
  assert.equal(saved.saved, true)
  assert.equal(saved.status, 'awaiting_rating')
  assert.equal(saved.awaiting, 'rating')
  assert.equal(saved.lastOrderId, `${scenario.id}-order`)
  if (scenario.orderType !== 'produto') {
    assert.equal(saved.lastAppointmentId, result.orderArgs.appointment_id)
  }

  const rating = turn({ petbot: saved }, scenario.rating || '10', scenario.extra || {})
  assert.equal(rating.shouldSaveRating, true)
  assert.equal(rating.state.status, 'closed')
}

const finalFlowScenarios = [
  {
    id: 'produto-1',
    type: 'produto',
    name: 'produto shih tzu adulto com entrega',
    orderType: 'produto',
    payment: 'pix',
    fulfillment: 'entrega',
    messages: [
      'ola bom dia',
      'Rodrigo',
      'quero racao pra shih tzu adulto',
      'Premier, qualquer pacote',
      '1',
      'nao',
      'pix entrega',
      'Av. Bernardo Mascarenhas, 1327 ap 303b',
      'Bairro Fabrica, perto da padaria',
      'sim',
    ],
  },
  {
    id: 'produto-2',
    type: 'produto',
    name: 'produto gato adulto com retirada',
    orderType: 'produto',
    payment: 'cartao',
    fulfillment: 'retirada',
    messages: [
      'oi',
      'Camila',
      'quero racao para gato adulto',
      'sem preferencia',
      '1',
      'nao',
      'cartao',
      'retirada',
      'confirmo',
    ],
  },
  {
    id: 'produto-3',
    type: 'produto',
    name: 'produto gato castrado saco 15kg',
    orderType: 'produto',
    payment: 'pix',
    fulfillment: 'retirada',
    messages: [
      'boa tarde',
      'Lara',
      'quero racao para gato castrado',
      'saco de 15kg, sem marca',
      '1',
      'nao',
      'pix',
      'retirada',
      'sim',
    ],
  },
  {
    id: 'produto-4',
    type: 'produto',
    name: 'produto antipulgas com dinheiro e troco',
    orderType: 'produto',
    payment: 'dinheiro',
    fulfillment: 'retirada',
    messages: [
      'oi',
      'Joao',
      'tem antipulgas para cachorro de 8kg?',
      '1',
      'nao',
      'dinheiro',
      'troco para 200',
      'retirada',
      'sim',
    ],
  },
  {
    id: 'produto-5',
    type: 'produto',
    name: 'produto areia higienica sem misturar agenda',
    orderType: 'produto',
    payment: 'pix',
    fulfillment: 'entrega',
    messages: [
      'ola',
      'Denise',
      'tem areia higienica para gato?',
      '1',
      'nao',
      'pix entrega',
      'Rua A, 123',
      'Centro, portao azul',
      'sim',
    ],
  },
  {
    id: 'banho-1',
    type: 'banho_tosa',
    name: 'banho cachorro grande',
    orderType: 'banho_tosa',
    payment: 'pix',
    extra: { appointments: finalFlowAppointments },
    messages: ['oi', 'Ana', 'quero banho para Thor golden', 'sem observacao', 'amanha', 'tarde', '14:00', 'nao', 'sim'],
  },
  {
    id: 'banho-2',
    type: 'banho_tosa',
    name: 'banho e tosa com observacao',
    orderType: 'banho_tosa',
    payment: 'cartao',
    extra: { appointments: finalFlowAppointments },
    messages: ['boa tarde', 'Marcos', 'quero banho e tosa para Nina shih tzu', 'maquina 5', 'sem perfume', 'amanha', 'tarde', '16:30', 'nao', 'sim'],
  },
  {
    id: 'banho-3',
    type: 'banho_tosa',
    name: 'agendamento generico vira banho e tosa',
    orderType: 'banho_tosa',
    payment: 'pix',
    extra: { appointments: finalFlowAppointments },
    messages: ['oi', 'Clara', 'quero agendar', 'banho e tosa', 'Mel poodle', 'maquina 3', 'ela tem alergia ao perfume', 'amanha', 'tarde', '16:30', 'nao', 'sim'],
  },
  {
    id: 'banho-4',
    type: 'banho_tosa',
    name: 'banho com pet bravo e dinheiro',
    orderType: 'banho_tosa',
    payment: 'dinheiro',
    extra: { appointments: finalFlowAppointments },
    messages: ['ola', 'Rafael', 'quero banho para Rex pinscher bravo', 'amanha', 'tarde', '14:00', 'nao', 'sim'],
  },
  {
    id: 'banho-5',
    type: 'banho_tosa',
    name: 'tosa higienica usa agenda de banho e tosa',
    orderType: 'banho_tosa',
    payment: 'pix',
    extra: { appointments: finalFlowAppointments },
    messages: ['oi', 'Bia', 'quero tosa higienica para Toby spitz', 'maquina 7', 'sem observacao', 'amanha', 'tarde', '16:30', 'nao', 'sim'],
  },
  {
    id: 'vet-1',
    type: 'veterinaria',
    name: 'veterinaria cachorro com coceira',
    orderType: 'veterinaria',
    payment: 'pix',
    extra: { appointments: finalFlowAppointments },
    messages: ['oi', 'Paula', 'quero veterinario para Bob cachorro com coceira', 'amanha', 'tarde', '15:00', 'sim'],
  },
  {
    id: 'vet-2',
    type: 'veterinaria',
    name: 'veterinaria gata espirrando',
    orderType: 'veterinaria',
    payment: 'cartao',
    extra: { appointments: finalFlowAppointments },
    messages: ['boa tarde', 'Priscila', 'preciso de consulta para Mia gata espirrando', 'amanha', 'tarde', '15:00', 'sim'],
  },
  {
    id: 'vet-3',
    type: 'veterinaria',
    name: 'veterinaria cachorro mancando com dinheiro',
    orderType: 'veterinaria',
    payment: 'dinheiro',
    extra: { appointments: finalFlowAppointments },
    messages: ['ola', 'Fernanda', 'quero vet para Apollo cachorro mancando', 'amanha', 'tarde', '15h', 'sim'],
  },
  {
    id: 'vet-4',
    type: 'veterinaria',
    name: 'veterinaria vacina anual',
    orderType: 'veterinaria',
    payment: 'pix',
    extra: { appointments: finalFlowAppointments },
    messages: ['oi', 'Nicole', 'quero vacina para Luna gato', 'vacina anual', 'amanha', 'tarde', '17:00', 'sim'],
  },
  {
    id: 'vet-5',
    type: 'veterinaria',
    name: 'veterinaria gato sem comer',
    orderType: 'veterinaria',
    payment: 'cartao',
    extra: { appointments: finalFlowAppointments },
    messages: ['bom dia', 'Bruno', 'preciso de veterinario para Simba gato, nao esta comendo', 'amanha', 'tarde', '15:00', 'sim'],
  },
]

for (const scenario of finalFlowScenarios) {
  test(`fluxo completo salva ${scenario.type}: ${scenario.name}`, () => {
    assertConversationSaved(scenario)
  })
}

test('produto usa raça como porte, não pede peso e soma taxa de entrega', () => {
  let context = {}
  let result = turn(context, 'Oi, tem ração pra shih tzu adulto?')
  context = result.context
  assert.match(result.reply, /nome/i)

  result = turn(context, 'Rodrigo')
  context = result.context
  assert.doesNotMatch(result.reply, /peso/i)
  assert.match(result.reply, /marca/i)

  result = turn(context, 'Premier, pode ser qualquer pacote')
  context = result.context
  assert.match(result.reply, /Premier/i)

  result = turn(context, '1')
  context = result.context
  assert.match(result.reply, /Petisco Dental/i)

  result = turn(context, 'não')
  context = result.context
  assert.match(result.reply, /Pedido em andamento/i)
  assert.match(result.reply, /pagamento/i)

  result = turn(context, 'pix, entrega')
  context = result.context
  assert.match(result.reply, /Cobramos R\$ 10,00 para entregar/i)
  assert.match(result.reply, /rua e número/i)

  result = turn(context, 'Av. Bernardo Mascarenhas, 1327 ap 303b')
  context = result.context
  assert.match(result.reply, /bairro/i)
  assert.match(result.reply, /ponto de referência/i)

  result = turn(context, 'Bairro Fabrica, perto da padaria')
  context = result.context
  assert.match(result.reply, /Taxa de entrega: R\$ 10,00/i)
  assert.match(result.reply, /Total: R\$ 130,00/i)
  assert.match(result.reply, /Confirma para separação/i)

  result = turn(context, 'sim')
  assert.equal(result.shouldSaveOrder, true)
  assert.equal(result.orderArgs.total, 130)
  assert.equal(result.orderArgs.items[0].product_id, 'premier-shih-adulto')
})

test('cliente conhecido pelo telefone nao precisa informar nome de novo', () => {
  const result = runPetbotGuard({
    message: 'quero ração pra shih tzu adulto',
    session: {
      id: 'session-known',
      module_id: 'petshop',
      tenant_id: 'tenant-1',
      customer_phone: '123',
      customer_name: null,
      context: {},
    },
    customer: {
      isKnown: true,
      phone: '123',
      client: { name: 'Marina', details: {} },
    },
    products,
    appointments,
    settings,
  })

  assert.equal(result.state.customerName, 'Marina')
  assert.notEqual(result.action, 'pedir_nome')
  assert.equal(result.action, 'pedir_preferencia_racao')
  assert.match(result.reply, /marca/i)
})

test('endereco incompleto ignora bairro e referencia vindos de interpretacao antiga', () => {
  let context = {}
  let result = turn(context, 'ola bom dia')
  context = result.context
  result = turn(context, 'Hugo, quero racao para shih tzu adulto')
  context = result.context
  result = turn(context, 'Premier, qualquer pacote')
  context = result.context
  result = turn(context, '1')
  context = result.context
  result = turn(context, 'nao')
  context = result.context
  result = turn(context, 'pix entrega')
  context = result.context

  result = turn(JSON.stringify(context), 'Av. Bernardo Mascarenhas, 1327 ap 303b', {
    interpretation: {
      delivery_address: 'Av. Bernardo Mascarenhas, 1327 ap 303b',
      neighborhood: 'ola bom dia',
      reference: 'quero racao para shih tzu adulto',
      confidence: 0.9,
    },
  })

  assert.equal(result.action, 'pedir_endereco')
  assert.match(result.reply, /bairro/i)
  assert.match(result.reply, /ponto de refer/i)
  assert.doesNotMatch(result.reply, /Resumo do pedido/i)
  assert.equal(result.state.fulfillment.address, 'Av. Bernardo Mascarenhas, 1327 ap 303b')
  assert.equal(result.state.fulfillment.neighborhood, '')
  assert.equal(result.state.fulfillment.reference, '')
})

test('cliente que segue sem desconto sai do loop e avanca para pagamento', () => {
  let context = {}
  let result = turn(context, 'ola')
  context = result.context
  result = turn(context, 'Rafael, quero racao Golden para cachorro pequeno adulto saco 15kg')
  context = result.context
  result = turn(context, '1')
  context = result.context

  result = turn(context, 'faz desconto?')
  context = result.context
  assert.equal(result.action, 'recusar_desconto')
  assert.match(result.reply, /Infelizmente/i)

  result = turn(context, 'nao, pode seguir sem desconto')
  assert.equal(result.action, 'pedir_pagamento')
  assert.match(result.reply, /Pedido em andamento/i)
  assert.match(result.reply, /Qual forma prefere/i)
})

test('produto aceita escolha por marca em frase natural', () => {
  let context = {}
  let result = turn(context, 'Oi, quero ração pra shih tzu adulto')
  context = result.context
  result = turn(context, 'Rodrigo')
  context = result.context

  result = turn(context, 'pode ser premier')
  context = result.context
  assert.equal(result.action, 'oferecer_produtos')
  assert.match(result.reply, /Premier/i)

  result = turn(context, 'pode ser a premier')
  assert.equal(result.action, 'oferecer_upsell')
  assert.match(result.reply, /Premier/i)
})

test('produto preserva quantidade quando cliente escolhe em frase natural', () => {
  let context = {}
  let result = turn(context, 'Oi, quero ração pra shih tzu adulto')
  context = result.context
  result = turn(context, 'Rodrigo')
  context = result.context

  result = turn(context, 'vou querer 2 sacos da premier')
  context = result.context
  assert.equal(result.action, 'oferecer_produtos')

  result = turn(context, 'pode ser a premier')
  assert.equal(result.action, 'oferecer_upsell')
  assert.equal(result.state.selectedProduct.quantity, 2)
})

test('produto granel entende kg como quantidade e recalcula total', () => {
  const baseState = {
    customerName: 'Hugo Souza',
    nameConfirmed: true,
    intent: 'produto',
    productKind: 'food',
    petName: '',
    species: 'dog',
    breed: 'Shih Tzu',
    size: 'pequeno',
    ageCategory: 'adulto',
    selectedProduct: {
      product_id: granelPremierDog.id,
      name: granelPremierDog.name,
      category: granelPremierDog.category,
      quantity: 1,
      unit_price: granelPremierDog.price,
      stock_quantity: granelPremierDog.stock_quantity,
      upsell: false,
    },
    upsell: {
      offered: true,
      resolved: false,
      accepted: false,
      declined: false,
      item: {
        product_id: 'petisco-dental',
        name: 'Petisco Dental Cães Pequenos',
        category: 'Petisco',
        quantity: 1,
        unit_price: 15,
        stock_quantity: 10,
        upsell: true,
      },
    },
    awaiting: 'upsell',
  }
  let context = mergePetbotContext({}, baseState)

  let result = turn(context, 'nao, somente a ração', { products: [granelPremierDog, ...products] })
  context = result.context
  assert.equal(result.state.selectedProduct.quantity, 1)
  assert.match(result.reply, /R\$ 21,50/)

  result = turn(context, 'dinheiro, eu quero 2 kg', { products: [granelPremierDog, ...products] })
  context = result.context
  assert.equal(result.action, 'pedir_troco')
  assert.equal(result.state.selectedProduct.quantity, 2)
  assert.equal(result.state.totals.subtotal, 43)

  result = turn(context, 'troco pra 50', { products: [granelPremierDog, ...products] })
  assert.equal(result.action, 'pedir_entrega_retirada')
  assert.match(result.reply, /entrega ou retirada/i)
  assert.doesNotMatch(result.reply, /vamos prosseguir/i)
})

test('produto mantem granel quando cliente informa kg como quantidade antes da escolha', () => {
  const premierClinical2kg = {
    id: 'premier-clinical-2kg',
    name: 'PREMIER NUTRICAO CLINICA CAES RENAL 2 KG',
    category: 'Racao',
    price: 113,
    stock_quantity: 5,
    active: true,
  }
  let context = {}
  let result = turn(context, 'boa tarde', { products: [granelPremierDog, premierClinical2kg, ...products] })
  context = result.context
  result = turn(context, 'Renato, quero racao a granel para cachorro pequeno adulto', { products: [granelPremierDog, premierClinical2kg, ...products] })
  context = result.context
  assert.equal(result.action, 'oferecer_produtos')

  result = turn(context, 'Premier, quero 2kg', { products: [granelPremierDog, premierClinical2kg, ...products] })
  context = result.context
  assert.equal(result.action, 'oferecer_upsell')
  assert.equal(result.state.selectedProduct.product_id, granelPremierDog.id)
  assert.equal(result.state.selectedProduct.quantity, 2)
  assert.match(result.reply, /2kg de GRANEL PREMIER/i)
  assert.doesNotMatch(result.reply, /CLINICA/i)
})

test('produto mantem quantidade granel pendente quando cliente escolhe por numero depois', () => {
  let context = {}
  let result = turn(context, 'bom dia', { products: [granelPremierDog, ...products] })
  context = result.context
  result = turn(context, 'Denise, quero racao a granel para cachorro pequeno adulto', { products: [granelPremierDog, ...products] })
  context = result.context
  assert.equal(result.action, 'oferecer_produtos')

  result = turn(context, 'quero 3kg', {
    products: [granelPremierDog, ...products],
    interpretation: { package_preference: '3kg' },
  })
  context = result.context
  assert.equal(result.state.pendingQuantity, 3)
  assert.equal(result.state.packagePreference, 'granel')

  result = turn(context, '1', { products: [granelPremierDog, ...products] })
  context = result.context
  assert.equal(result.action, 'oferecer_upsell')
  assert.equal(result.state.selectedProduct.product_id, granelPremierDog.id)
  assert.equal(result.state.selectedProduct.quantity, 3)
  assert.match(result.reply, /3kg de GRANEL PREMIER/i)

  result = turn(context, 'nao', { products: [granelPremierDog, ...products] })
  assert.match(result.reply, /Total parcial: R\$ 64,50/i)
})

test('produto granel entende meio kg sem trocar categoria', () => {
  let context = {}
  let result = turn(context, 'bom dia', { products: [granelPremierDog, ...products] })
  context = result.context
  result = turn(context, 'Denise, quero racao a granel para cachorro pequeno adulto', { products: [granelPremierDog, ...products] })
  context = result.context
  result = turn(context, 'quero meio kg da premier', { products: [granelPremierDog, ...products] })

  assert.equal(result.action, 'oferecer_upsell')
  assert.equal(result.state.selectedProduct.product_id, granelPremierDog.id)
  assert.equal(result.state.selectedProduct.quantity, 0.5)
  assert.match(result.reply, /0,5kg de GRANEL PREMIER/i)
  assert.doesNotMatch(result.reply, /antipulga|areia/i)
})

test('catalogo classifica granel e petisco sem misturar categoria', () => {
  const bulk = classifyProduct(granelPremierDog)
  const snack = classifyProduct(products.find((product) => product.id === 'petisco-dental'))
  const request = detectCatalogRequest('quero racao a granel premier para cachorro adulto')
  const ranked = rankCatalogProducts([products[1], granelPremierDog], {
    productKind: 'food',
    species: 'dog',
    ageCategory: 'adulto',
    size: 'pequeno',
    packagePreference: 'granel',
  }, 'quero racao a granel premier para cachorro adulto')

  assert.equal(bulk.type, 'granel')
  assert.equal(snack.type, 'petisco')
  assert.equal(request.type, 'granel')
  assert.equal(ranked[0].product.id, granelPremierDog.id)
})

test('catalogo prioriza produto por ean quando cliente informa codigo', () => {
  const productByCode = {
    id: 'premier-ean-15kg',
    name: 'PREMIER FORMULA CAES ADULTO FRANGO RACAS PEQUENAS 15 KG',
    category: 'Racao',
    barcode: '7891234567890',
    price: 304.5,
    stock_quantity: 2,
    active: true,
  }
  const similarProduct = {
    id: 'premier-ean-1kg',
    name: 'PREMIER FORMULA CAES ADULTO FRANGO RACAS PEQUENAS 1 KG',
    category: 'Racao',
    barcode: '1111111111111',
    price: 58.5,
    stock_quantity: 8,
    active: true,
  }

  const ranked = rankCatalogProducts([similarProduct, productByCode], {
    productKind: 'food',
    species: 'dog',
    ageCategory: 'adulto',
    size: 'pequeno',
  }, 'quero o codigo 7891234567890')

  assert.equal(ranked[0].product.id, productByCode.id)
})

test('catalogo usa tokens como formula e embalagem para ordenar racao', () => {
  const formula15kg = {
    id: 'premier-formula-rp-15kg',
    name: 'PREMIER FORMULA CAES ADULTO FRANGO RACAS PEQUENAS 15 KG',
    category: 'Racao',
    price: 304.5,
    stock_quantity: 3,
    active: true,
  }
  const lhasa1kg = {
    id: 'premier-lhasa-1kg',
    name: 'PREMIER RACAS ESPECIFICAS CAES ADULTO LHASA APSO 1 KG',
    category: 'Racao',
    price: 51.9,
    stock_quantity: 5,
    active: true,
  }

  const ranked = rankCatalogProducts([lhasa1kg, formula15kg], {
    productKind: 'food',
    species: 'dog',
    ageCategory: 'adulto',
    size: 'pequeno',
    brand: 'premier',
    packageKg: 15,
  }, 'e pra shih tzu, formula saco 15kg')

  assert.equal(ranked[0].product.id, formula15kg.id)
})

test('catalogo bloqueia alternativa fora de categoria quando pedido e racao', () => {
  const ranked = rankCatalogProducts([
    products.find((product) => product.id === 'petisco-dental'),
    products.find((product) => product.id === 'bravecto-8kg'),
    products.find((product) => product.id === 'areia-gato'),
  ], {
    productKind: 'food',
    species: 'dog',
    ageCategory: 'adulto',
  }, 'quero racao para cachorro adulto')

  assert.equal(ranked.length, 0)
})

test('produto granel recalcula subtotal quando cliente muda quantidade depois do resumo parcial', () => {
  let context = {}
  let result = turn(context, 'bom dia', { products: [granelPremierDog, ...products] })
  context = result.context
  result = turn(context, 'Hugo, quero racao a granel para cachorro pequeno adulto', { products: [granelPremierDog, ...products] })
  context = result.context
  result = turn(context, 'quero 2kg da premier', { products: [granelPremierDog, ...products] })
  context = result.context
  result = turn(context, 'nao', { products: [granelPremierDog, ...products] })
  context = result.context
  assert.match(result.reply, /Total parcial: R\$ 43,00/i)

  result = turn(context, 'na verdade quero 4kg', { products: [granelPremierDog, ...products] })

  assert.equal(result.state.selectedProduct.quantity, 4)
  assert.equal(result.state.totals.subtotal, 86)
  assert.equal(result.state.totals.total, 86)
  assert.match(result.reply, /Qual forma prefere/i)
})

test('produto granel com entrega salva total com quantidade e taxa', () => {
  const { result } = runConversation([
    'bom dia',
    'Hugo, quero racao a granel para cachorro pequeno adulto',
    'quero 2kg da premier',
    'nao',
    'pix',
    'entrega',
    'Rua A, 123, Centro, perto da padaria',
    'sim',
  ], { products: [granelPremierDog, ...products] })

  assert.equal(result.shouldSaveOrder, true)
  assert.equal(result.orderArgs.items[0].product_id, granelPremierDog.id)
  assert.equal(result.orderArgs.items[0].quantity, 2)
  assert.equal(result.orderArgs.delivery_fee, 10)
  assert.equal(result.orderArgs.total, 53)
})

test('confirmacao simples antes do resumo final nao salva pedido', () => {
  const state = getPetbotState({})
  state.intent = 'produto'
  state.customerName = 'Carlos'
  state.nameConfirmed = true
  state.species = 'dog'
  state.size = 'pequeno'
  state.ageCategory = 'adulto'
  state.selectedProduct = {
    product_id: granelPremierDog.id,
    name: granelPremierDog.name,
    category: granelPremierDog.category,
    quantity: 1,
    unit_price: granelPremierDog.price,
    stock_quantity: granelPremierDog.stock_quantity,
  }
  state.upsell = { offered: true, resolved: true, accepted: false, declined: true, item: null }
  state.partialSummaryShown = true
  state.awaiting = 'payment'

  const result = turn({ petbot: state }, 'sim', { products: [granelPremierDog, ...products] })

  assert.notEqual(result.shouldSaveOrder, true)
  assert.notEqual(result.action, 'confirmar_salvar')
  assert.match(result.reply, /Qual forma prefere/i)
})

test('banho pede data antes de consultar agenda', () => {
  let context = {}
  let result = turn(context, 'oi', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'Ana', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'quero banho para Toby shih tzu', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'sem observacao', { appointments: mixedAppointments })

  assert.equal(result.action, 'pedir_dia_agendamento')
  assert.equal(result.state.awaiting, 'service_date')
  assert.match(result.reply, /qual dia/i)
  assert.doesNotMatch(result.reply, /14:00|16:30|R\$/)
})

test('veterinaria recusa horario fora da agenda e mostra alternativa real', () => {
  let context = {}
  let result = turn(context, 'boa tarde', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'Paula', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'preciso de veterinario para Luna gata espirrando', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'amanha', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, '16h', { appointments: mixedAppointments })

  assert.equal(result.action, 'oferecer_horarios')
  assert.equal(result.state.selectedSlot, null)
  assert.match(result.reply, /15:00/)
  assert.doesNotMatch(result.reply, /Pedido em andamento/i)
})

test('bloqueio de marca sem estoque tambem registra motivo sem_estoque', () => {
  let context = {}
  let result = turn(context, 'Oi, tem racao pra shih tzu adulto?')
  context = result.context
  result = turn(context, 'Rodrigo')
  context = result.context
  result = turn(context, 'quero royal 15kg')

  assert.match(result.state.blockedReasons.join(','), /marca_sem_estoque/)
  assert.match(result.state.blockedReasons.join(','), /sem_estoque/)
})

test('produto ignora quantidade inventada pela LLM em recusa de upsell', () => {
  let context = {}
  let result = turn(context, 'bom dia', { products: [granelPremierDog, ...products] })
  context = result.context
  result = turn(context, 'Denise, quero racao a granel para cachorro pequeno adulto', { products: [granelPremierDog, ...products] })
  context = result.context
  result = turn(context, 'quero 3kg', { products: [granelPremierDog, ...products] })
  context = result.context
  result = turn(context, '1', { products: [granelPremierDog, ...products] })
  context = result.context
  assert.equal(result.state.selectedProduct.quantity, 3)

  result = turn(context, 'nao', {
    products: [granelPremierDog, ...products],
    interpretation: {
      quantity: 1,
      package_kg: 1,
      negation: true,
    },
  })

  assert.equal(result.state.selectedProduct.quantity, 3)
  assert.match(result.reply, /3kg GRANEL PREMIER/i)
  assert.match(result.reply, /Total parcial: R\$ 64,50/i)
})

test('produto granel filtra opcao sem estoque suficiente para kg pedido', () => {
  const lowStockBulk = {
    id: 'granel-premier-low-stock',
    name: 'GRANEL PREMIER FRANGO RACAS PEQUENAS ADULTOS KG PROMO',
    category: 'Racao',
    price: 9,
    stock_quantity: 1,
    active: true,
  }

  let context = {}
  let result = turn(context, 'bom dia', { products: [lowStockBulk, granelPremierDog, ...products] })
  context = result.context
  result = turn(context, 'Denise, quero racao a granel para cachorro pequeno adulto', { products: [lowStockBulk, granelPremierDog, ...products] })
  context = result.context
  result = turn(context, 'quero 3kg', { products: [lowStockBulk, granelPremierDog, ...products] })

  assert.equal(result.action, 'oferecer_produtos')
  assert.equal(result.state.pendingQuantity, 3)
  assert.ok(result.state.productOptions.every((product) => product.product_id !== lowStockBulk.id))
  assert.ok(result.state.productOptions.some((product) => product.product_id === granelPremierDog.id))
})

test('produto racao nao troca por medicamento quando granel nao tem kg suficiente', () => {
  const lowStockBulk = {
    id: 'granel-gato-low-stock',
    name: 'GRANEL ORIGENS GATO CASTRADO SALMAO',
    category: 'Racao gato',
    price: 16.5,
    stock_quantity: 1,
    active: true,
  }
  const advocate = {
    id: 'advocate-gatos',
    name: 'ADVOCATE GATOS ATE 4KG',
    category: 'Antipulgas',
    price: 74,
    stock_quantity: 20,
    active: true,
  }
  const filezitos = {
    id: 'filezitos-dog',
    name: 'FILEZITOS PEDIGREE SABOR CARNE 60 GR',
    category: 'Petisco',
    price: 7.9,
    stock_quantity: 20,
    active: true,
  }

  let context = {}
  let result = turn(context, 'bom dia', { products: [lowStockBulk, advocate, filezitos] })
  context = result.context
  result = turn(context, 'Denise, quero racao a granel para gato castrado', { products: [lowStockBulk, advocate, filezitos] })
  context = result.context
  result = turn(context, 'quero 3kg', { products: [lowStockBulk, advocate, filezitos] })

  assert.equal(result.action, 'sem_estoque')
  assert.doesNotMatch(result.reply, /ADVOCATE/i)
  assert.doesNotMatch(result.reply, /FILEZITOS/i)
})

test('redraft ruim nao remove pergunta obrigatoria de entrega/retirada', () => {
  const result = runPetbotGuard({
    message: 'troco pra 50',
    session: {
      id: 'session-1',
      module_id: 'petshop',
      tenant_id: 'tenant-1',
      customer_phone: '123',
      customer_name: null,
      context: mergePetbotContext({}, {
        customerName: 'Hugo Souza',
        nameConfirmed: true,
        intent: 'produto',
        species: 'dog',
        selectedProduct: {
          product_id: granelPremierDog.id,
          name: granelPremierDog.name,
          category: granelPremierDog.category,
          quantity: 2,
          unit_price: granelPremierDog.price,
          stock_quantity: granelPremierDog.stock_quantity,
        },
        upsell: { offered: true, resolved: true, accepted: false, declined: true, item: null },
        payment: { method: 'dinheiro', changeFor: null, changeAsked: true },
        partialSummaryShown: true,
        awaiting: 'change_for',
      }),
    },
    customer: { client: null, phone: '123', isKnown: false },
    products: [granelPremierDog, ...products],
    appointments,
    settings,
  })

  const rendered = renderGuardedPetbotReply('Entendi. Vamos prosseguir com o pedido!', result.guardDirective)
  assert.equal(result.action, 'pedir_entrega_retirada')
  assert.equal(rendered.validation.ok, false)
  assert.match(rendered.reply, /entrega ou retirada/i)
})

test('produto envia foto aprovada quando cliente pede imagem', () => {
  let context = {}
  let result = turn(context, 'Oi, quero racao pra shih tzu adulto')
  context = result.context
  result = turn(context, 'Rodrigo')
  context = result.context

  result = turn(context, 'manda foto da premier')
  context = result.context
  assert.equal(result.action, 'oferecer_produtos')

  result = turn(context, 'pode ser a premier')
  context = result.context
  result = turn(context, 'manda foto')
  assert.equal(result.action, 'enviar_foto_produto')
  assert.equal(result.mediaMessages?.[0]?.type, 'image')
  assert.equal(result.mediaMessages?.[0]?.imageUrl, 'https://cdn.example.com/premier-shih-tzu.jpg')
  assert.match(result.reply, /foto/i)
  assert.match(result.reply, /Premier/i)
})

test('produto sem foto aprovada nao inventa imagem', () => {
  const state = getPetbotState({})
  state.intent = 'produto'
  state.customerName = 'Carlos'
  state.nameConfirmed = true
  state.species = 'dog'
  state.size = 'medio'
  state.productOptions = [{
    product_id: 'canister-kibe',
    name: 'CANISTER CAO KIBE',
    category: 'Petisco',
    quantity: 1,
    unit_price: 10,
    stock_quantity: 10,
  }]
  state.selectedProduct = state.productOptions[0]

  const result = turn({ petbot: state }, 'manda foto')

  assert.equal(result.action, 'foto_produto_ausente')
  assert.match(result.state.blockedReasons.join(','), /foto_produto_ausente/)
  assert.equal(result.mediaMessages, undefined)
})

test('marca indisponivel mostra alternativas e registra bloqueio', () => {
  let context = {}
  let result = turn(context, 'Tem Royal Canin pra shih tzu adulto?')
  context = result.context
  result = turn(context, 'Lara')

  assert.match(result.reply, /alternativas/i)
  assert.match(result.state.blockedReasons.join(','), /marca_sem_estoque/)
  assert.match(result.reply, /Premier/i)
})

test('desconto é recusado sem alterar preço', () => {
  const state = getPetbotState({})
  state.intent = 'produto'
  state.customerName = 'Rafael'
  state.nameConfirmed = true
  state.species = 'dog'
  state.ageCategory = 'adulto'
  state.productOptions = [
    {
      product_id: 'premier-shih-adulto',
      name: 'Premier Raças Especificas Shih Tzu Salmão Adulto 2,5kg',
      category: 'Ração',
      quantity: 1,
      unit_price: 120,
      stock_quantity: 4,
    },
    {
      product_id: 'economica',
      name: 'Ração Econômica Cães Adultos 10kg',
      category: 'Ração',
      quantity: 1,
      unit_price: 90,
      stock_quantity: 5,
    },
  ]
  const result = turn({ petbot: state }, 'faz desconto?')
  assert.match(result.reply, /Infelizmente não conseguimos aplicar desconto/i)
  assert.doesNotMatch(result.reply, /consigo fazer/i)
  assert.match(result.reply, /Ração Econômica/i)
  assert.doesNotMatch(result.reply, /Petisco Dental/i)
})

test('guardiao bloqueia desconto concedido em rascunho da LLM', () => {
  const state = getPetbotState({})
  state.intent = 'produto'
  state.customerName = 'Rafael'
  state.nameConfirmed = true
  state.species = 'dog'
  state.ageCategory = 'adulto'
  state.productOptions = [{
    product_id: 'premier-shih-adulto',
    name: 'Premier Raças Especificas Shih Tzu Salmão Adulto 2,5kg',
    category: 'Ração',
    quantity: 1,
    unit_price: 120,
    stock_quantity: 4,
  }]
  const result = turn({ petbot: state }, 'faz desconto?')
  const rendered = renderGuardedPetbotReply('Consigo fazer por R$ 100,00 pra você.', result.guardDirective)

  assert.equal(rendered.validation.ok, false)
  assert.match(rendered.validation.problems.join(','), /desconto_concedido/)
  assert.equal(rendered.reply, result.reply)
})

test('banho mostra múltiplos horários reais com preço', () => {
  let context = {}
  let result = turn(context, 'Quero banho pro meu cachorro')
  context = result.context
  assert.match(result.reply, /nome/i)

  result = turn(context, 'Ana')
  context = result.context
  assert.match(result.reply, /nome do pet/i)

  result = turn(context, 'Thor, Golden')
  context = result.context
  assert.match(result.reply, /observa/i)

  result = turn(context, 'sem observacao')
  context = result.context
  assert.match(result.reply, /qual dia/i)

  result = turn(context, 'amanha')
  context = result.context
  assert.match(result.reply, /prefer/i)

  result = turn(context, 'tarde')
  assert.match(result.reply, /14:00/)
  assert.match(result.reply, /16:30/)
  assert.match(result.reply, /R\$ 70,00/)
})

test('banho entende nome e raça sem vírgula', () => {
  let context = {}
  let result = turn(context, 'Quero banho pro meu cachorro')
  context = result.context
  result = turn(context, 'Ana')
  context = result.context

  result = turn(context, 'Thor golden')
  context = result.context
  result = turn(context, 'sem observacao')
  context = result.context
  result = turn(context, 'amanha de tarde')
  assert.match(result.reply, /14:00/)
  assert.equal(result.state.petName, 'Thor')
  assert.equal(result.state.breed, 'Golden Retriever')
})

test('banho extrai nome quando cliente informa pet e porte em frase natural', () => {
  let context = {}
  let result = turn(context, 'oi')
  context = result.context
  result = turn(context, 'Leticia')
  context = result.context

  result = turn(context, 'quero banho para o Thor cachorro médio')
  context = result.context
  result = turn(context, 'sem observacao')
  context = result.context
  result = turn(context, 'amanha de tarde')
  assert.match(result.reply, /14:00/)
  assert.equal(result.state.petName, 'Thor')
  assert.equal(result.state.species, 'dog')
  assert.equal(result.state.size, 'medio')
})

test('veterinaria extrai nome, especie e sintoma em frase natural', () => {
  const vetAppointments = [{
    id: 'slot-vet',
    service_type: 'Consulta veterinária',
    scheduled_at: appointmentAt('15:00'),
    status: 'available',
    price: 120,
  }]
  let context = {}
  let result = turn(context, 'boa tarde', { appointments: vetAppointments })
  context = result.context
  result = turn(context, 'Fernanda', { appointments: vetAppointments })
  context = result.context

  result = turn(context, 'quero veterinário para Totó cachorro pequeno com coceira', { appointments: vetAppointments })
  context = result.context
  result = turn(context, 'amanha de tarde', { appointments: vetAppointments })
  assert.match(result.reply, /15:00/)
  assert.equal(result.state.petName, 'Totó')
  assert.equal(result.state.species, 'dog')
  assert.match(result.state.symptom, /coceira/i)
})

test('agenda vazia nao cria horario virtual em producao', () => {
  let context = {}
  let result = turn(context, 'quero banho pro meu cachorro', { appointments: [] })
  context = result.context
  result = turn(context, 'Ana', { appointments: [] })
  context = result.context
  result = turn(context, 'Thor golden', { appointments: [] })
  context = result.context
  result = turn(context, 'sem observacao', { appointments: [] })
  context = result.context
  result = turn(context, 'amanha', { appointments: [] })
  context = result.context
  result = turn(context, '16h', { appointments: [] })

  assert.equal(result.action, 'sem_horario')
  assert.match(result.reply, /não achei horário disponível|nao achei horario disponivel/i)
  assert.equal(result.state.selectedSlot, null)
})

test('banho nao aceita pagamento como resposta ao transporte', () => {
  let context = {}
  let result = turn(context, 'quero banho pro meu cachorro', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'Roberta', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'Toby shih tzu', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'sem perfume', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'amanha', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, '14:00', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, '1', { appointments: mixedAppointments })
  context = result.context
  assert.equal(result.action, 'perguntar_transporte_pet')

  result = turn(context, 'pix', { appointments: mixedAppointments })
  assert.equal(result.action, 'perguntar_transporte_pet')
  assert.match(result.reply, /transporte/i)
})

test('banho com transporte aceito soma taxa e salva endereco de busca', () => {
  let context = {}
  let result = turn(context, 'quero banho pro meu cachorro', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'Roberta', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'Toby shih tzu', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'sem perfume', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'amanha', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, '14:00', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, '1', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'buscar e levar', { appointments: mixedAppointments })
  context = result.context
  assert.equal(result.action, 'pedir_endereco_transporte_pet')

  result = turn(context, 'Av. Bernardo Mascarenhas, 1327 ap 303b', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'Bairro Fabrica, perto da padaria', { appointments: mixedAppointments })
  context = result.context
  assert.equal(result.action, 'resumo_final')
  assert.match(result.reply, /Transporte: R\$ 20,00/i)
  assert.equal(result.state.totals.total, 90)

  result = turn(context, 'sim', { appointments: mixedAppointments })
  assert.equal(result.shouldSaveOrder, true)
  assert.equal(result.orderArgs.service_transport_fee, 20)
  assert.equal(result.orderArgs.service_transport_mode, 'buscar_e_levar')
  assert.match(result.orderArgs.service_transport_address, /Bernardo Mascarenhas/i)
})

test('banho com somente buscar usa opcao MotoDog de 15 reais', () => {
  let context = {}
  let result = turn(context, 'quero banho pro meu cachorro', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'Roberta', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'Toby shih tzu', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'sem perfume', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'amanha', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, '14:00', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, '1', { appointments: mixedAppointments })
  context = result.context
  assert.match(result.reply, /Buscar e levar|Somente buscar|Somente levar/i)

  result = turn(context, 'somente buscar', { appointments: mixedAppointments })
  context = result.context
  assert.equal(result.action, 'pedir_endereco_transporte_pet')
  assert.equal(result.state.serviceTransport.mode, 'somente_buscar')
  assert.equal(result.state.serviceTransport.fee, 15)
})

test('confirmacao pix pede comprovante e cadastro complementar', () => {
  const saved = markPetbotOrderSaved({
    ...getPetbotState({}),
    intent: 'produto',
    payment: { method: 'pix' },
    registrationChecklist: {
      requested: false,
      completed: false,
      missing: ['CPF do tutor', 'CEP da rua'],
    },
  }, { sale_id: 'sale-1', order_id: 'order-1', total: 120 })

  const reply = buildPetbotConfirmationReply(saved, { pixKey: 'pix@loja.com', pixHolderName: 'Quatro Patas' })
  assert.equal(saved.paymentProof.status, 'aguardando_comprovante')
  assert.match(reply, /pix@loja\.com/i)
  assert.match(reply, /comprovante/i)
  assert.match(reply, /CPF do tutor/i)
  assert.match(reply, /De 0 a 10/i)
})

test('veterinaria salva sem pagamento depois do horario real', () => {
  let context = {}
  let result = turn(context, 'quero veterinario para Totto cachorro pequeno com coceira', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'Fernanda', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'amanha', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, '15:00', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, '1', { appointments: mixedAppointments })
  context = result.context
  assert.equal(result.action, 'resumo_final')
  assert.match(result.reply, /Confirma o agendamento/i)
  assert.doesNotMatch(result.reply, /pagamento/i)

  result = turn(context, 'sim', { appointments: mixedAppointments })
  assert.equal(result.shouldSaveOrder, true)
  assert.equal(result.orderArgs.payment_method, '')
})

test('banho ou tosa para gato chama humano', () => {
  let context = {}
  let result = turn(context, 'quero banho para minha gata persa')
  context = result.context
  result = turn(context, 'Clara')
  assert.equal(result.action, 'handoff_humano')
  assert.equal(result.needsHuman, true)
  assert.match(result.reply, /gato|gata|equipe/i)
})

test('gato filhote nao recebe upsell adulto', () => {
  const kittenProducts = [
    {
      id: 'special-cat-kitten',
      name: 'SPECIAL CAT ULTRA GATO FILHOTE SALMAO 10,1 KG',
      category: 'Ração gato',
      price: 162.9,
      stock_quantity: 3,
      active: true,
    },
    {
      id: 'kitekat-adulto',
      name: 'KITEKAT CAT SACHE ADULTO CARNE 70 G',
      category: 'Sachê gato',
      price: 2.99,
      stock_quantity: 20,
      active: true,
    },
  ]
  let context = {}
  let result = turn(context, 'oi', { products: kittenProducts })
  context = result.context
  result = turn(context, 'Denilson, quero ração para gato filhote', { products: kittenProducts })
  context = result.context
  result = turn(context, 'sem preferencia de marca, qualquer pacote', { products: kittenProducts })
  context = result.context
  result = turn(context, '1', { products: kittenProducts })

  assert.notEqual(result.action, 'oferecer_upsell')
  assert.doesNotMatch(result.reply, /KITEKAT/i)
  assert.match(result.reply, /Pagamento|pix|dinheiro|cartão|cartao/i)
})

test('contestacao de upsell incompativel vira recusa sem insistir', () => {
  const state = getPetbotState({
    petbot: {
      customerName: 'Denilson',
      nameConfirmed: true,
      intent: 'produto',
      species: 'cat',
      ageCategory: 'filhote',
      selectedProduct: {
        product_id: 'special-cat-kitten',
        name: 'SPECIAL CAT ULTRA GATO FILHOTE SALMAO 10,1 KG',
        category: 'Ração gato',
        quantity: 1,
        unit_price: 162.9,
        stock_quantity: 3,
      },
      upsell: {
        offered: true,
        resolved: false,
        accepted: false,
        declined: false,
        item: {
          product_id: 'kitekat-adulto',
          name: 'KITEKAT CAT SACHE ADULTO CARNE 70 G',
          category: 'Sachê gato',
          quantity: 1,
          unit_price: 2.99,
          stock_quantity: 20,
          upsell: true,
        },
      },
      awaiting: 'upsell',
    },
  })

  const result = turn({ petbot: state }, 'mas meu gato é filhote, esse sachê é adulto')
  assert.equal(result.state.upsell.declined, true)
  assert.equal(result.state.upsell.resolved, true)
  assert.match(result.reply, /Pedido em andamento/i)
  assert.doesNotMatch(result.reply, /Quer adicionar/i)
})

test('banho e tosa usa agenda certa e salva observacao operacional', () => {
  let context = {}
  let result = turn(context, 'oi', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'Ana', { appointments: mixedAppointments })
  context = result.context

  result = turn(context, 'quero banho e tosa para Thor golden, ele morde e tem nos no pelo', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'maquina 5', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'amanha de tarde', { appointments: mixedAppointments })
  context = result.context
  assert.match(result.reply, /16:30/)
  assert.match(result.reply, /R\$ 90,00/)
  assert.doesNotMatch(result.reply, /14:00/)
  assert.doesNotMatch(result.reply, /15:00/)

  result = turn(context, '16:30', { appointments: mixedAppointments })
  context = result.context
  assert.match(result.reply, /Pedido em andamento/i)
  assert.match(result.reply, /Observa/i)
  assert.match(result.reply, /morde/i)

  result = turn(context, 'nao', { appointments: mixedAppointments })
  context = result.context
  assert.match(result.reply, /Confirma o agendamento/i)

  result = turn(context, 'sim', { appointments: mixedAppointments })
  assert.equal(result.shouldSaveOrder, true)
  assert.match(result.orderArgs.notes, /Observa/)
  assert.match(result.orderArgs.notes, /morde/)
  assert.equal(result.orderArgs.appointment_id, 'slot-groom-16')
})

test('veterinaria com erro de digitacao usa somente agenda veterinaria', () => {
  let context = {}
  let result = turn(context, 'boa tarde', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'Paula', { appointments: mixedAppointments })
  context = result.context

  result = turn(context, 'preciso de vetrinario para Bob cachorro vomitando', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'amanha de tarde', { appointments: mixedAppointments })
  assert.equal(result.state.intent, 'veterinaria')
  assert.match(result.reply, /15:00/)
  assert.match(result.reply, /R\$ 120,00/)
  assert.doesNotMatch(result.reply, /14:00/)
  assert.doesNotMatch(result.reply, /16:30/)
})

test('horario de outro servico ou ocupado nao e aceito em banho', () => {
  let context = {}
  let result = turn(context, 'oi', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'Bia', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'quero banho para Rex cachorro pequeno', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'sem observacao', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'amanha de tarde', { appointments: mixedAppointments })
  context = result.context
  assert.match(result.reply, /14:00/)
  assert.doesNotMatch(result.reply, /10:00/)
  assert.doesNotMatch(result.reply, /15:00/)

  result = turn(context, '15h', { appointments: mixedAppointments })
  assert.equal(result.state.selectedSlot, null)
  assert.equal(result.action, 'oferecer_horarios')
  assert.doesNotMatch(result.reply, /Pedido em andamento/i)
})

test('pedido generico de agendamento pergunta tipo de servico antes da agenda', () => {
  let context = {}
  let result = turn(context, 'oi', { appointments: mixedAppointments })
  context = result.context
  result = turn(context, 'Clara', { appointments: mixedAppointments })
  context = result.context

  result = turn(context, 'quero agendar', { appointments: mixedAppointments })
  assert.equal(result.action, 'pedir_tipo_servico')
  assert.match(result.reply, /banho, tosa ou banho e tosa/i)
})

test('estoque vazio nao inventa produto e pode acionar humano', () => {
  let context = {}
  let result = turn(context, 'quero ração pra cachorro adulto', { products: [] })
  context = result.context
  result = turn(context, 'Bruno', { products: [] })
  context = result.context

  assert.equal(result.action, 'sem_estoque')
  assert.match(result.reply, /não encontrei produto disponível/i)

  result = turn(context, 'sim', { products: [] })
  assert.equal(result.needsHuman, true)
  assert.equal(result.action, 'handoff_humano')
})

test('avaliação fecha o atendimento depois de pedido salvo', () => {
  const saved = markPetbotOrderSaved(getPetbotState({}), { sale_id: 'sale-1' })
  const result = turn({ petbot: saved }, '10')
  assert.equal(result.shouldSaveRating, true)
  assert.equal(result.rating, 10)
  assert.match(result.reply, /Obrigado/i)
})

test('guardiao bloqueia rascunho da LLM que pula a acao autorizada', () => {
  const result = turn({}, 'Oi, bom dia')
  assert.equal(result.action, 'pedir_nome')
  assert.equal(result.guardDirective.allowLlmRedraft, true)

  const rendered = renderGuardedPetbotReply('Tenho Premier por R$ 120,00. Quer fechar?', result.guardDirective)
  assert.equal(rendered.validation.ok, false)
  assert.deepEqual(rendered.validation.problems.sort(), ['preco_nao_autorizado', 'pulou_nome'].sort())
  assert.equal(rendered.reply, result.reply)
})

test('cumprimento comum pede nome com saudacao natural', () => {
  const result = turn({}, 'ola bom dia')
  assert.equal(result.action, 'pedir_nome')
  assert.match(result.reply, /^Bom dia!/)
  assert.doesNotMatch(result.reply, /Claro/)
})

test('nome com intencao na mesma frase e interjeicao nao suja cadastro', () => {
  let context = {}
  let result = turn(context, 'oi')
  context = result.context

  result = turn(context, 'guilerme quero comprar racao')
  context = result.context
  assert.equal(result.state.customerName, 'Guilerme')
  assert.equal(result.action, 'pedir_especie')
  assert.doesNotMatch(result.reply, /nome/i)

  result = turn(context, 'ue guilerme')
  assert.equal(result.state.customerName, 'Guilerme')
  assert.notEqual(result.state.customerName, 'Ue Guilerme')
})

test('racao por raca sem idade pede adulto ou filhote antes de buscar estoque', () => {
  let context = {}
  let result = turn(context, 'ola bom dia')
  context = result.context

  result = turn(context, 'joberson')
  context = result.context

  result = turn(context, 'quero uma ração para meu shih tzu')
  assert.equal(result.action, 'pedir_categoria_pet')
  assert.match(result.reply, /adulto ou filhote/i)
  assert.doesNotMatch(result.reply, /não encontrei produto disponível/i)
})

test('racao com grafia shi tzu entende cachorro pequeno e nao pede especie', () => {
  let context = {}
  let result = turn(context, 'boa tarde')
  context = result.context

  result = turn(context, 'Robertao, quero uma racao para shi tzu adulto')
  assert.equal(result.state.customerName, 'Robertao')
  assert.equal(result.state.species, 'dog')
  assert.equal(result.state.breed, 'Shih Tzu')
  assert.equal(result.state.size, 'pequeno')
  assert.notEqual(result.action, 'pedir_especie')
  assert.doesNotMatch(result.reply, /cachorro ou gato/i)
})

test('guardiao usa interpretacao da LLM antes de decidir proxima acao', () => {
  const result = runPetbotGuard({
    message: 'Robertao, quero uma racao para shi tzu adulto',
    session: {
      id: 'session-1',
      module_id: 'petshop',
      tenant_id: 'tenant-1',
      customer_phone: '123',
      customer_name: null,
      context: {},
    },
    customer: { client: null, phone: '123', isKnown: false },
    products,
    appointments,
    settings,
    interpretation: {
      customer_name: 'Robertao',
      intent: 'produto',
      species: 'dog',
      breed: 'Shih Tzu',
      size: 'pequeno',
      age_category: 'adulto',
      product_kind: 'food',
      confidence: 0.94,
    },
  })

  assert.equal(result.state.customerName, 'Robertao')
  assert.equal(result.state.intent, 'produto')
  assert.equal(result.state.species, 'dog')
  assert.equal(result.state.breed, 'Shih Tzu')
  assert.notEqual(result.action, 'pedir_nome')
  assert.notEqual(result.action, 'pedir_especie')
})

test('racao pergunta marca e embalagem antes de listar quando faltam filtros', () => {
  let context = {}
  let result = turn(context, 'oi')
  context = result.context
  result = turn(context, 'Camila')
  context = result.context

  result = turn(context, 'quero ração para gato adulto')
  context = result.context
  assert.equal(result.action, 'pedir_preferencia_racao')
  assert.match(result.reply, /marca/i)
  assert.match(result.reply, /granel|1kg|saco/i)

  result = turn(context, 'sem preferencia, pode ser qualquer pacote')
  assert.equal(result.state.species, 'cat')
  assert.match(result.reply, /WHISKAS/i)
  assert.doesNotMatch(result.reply, /KITEKAT|SACH/i)
  assert.doesNotMatch(result.reply, /CÃES|CÃO|CACHORRO|PREMIER/i)
})

test('areia higienica e produto, nao fluxo misto de agendamento', () => {
  let context = {}
  let result = turn(context, 'boa tarde')
  context = result.context
  result = turn(context, 'Denise')
  context = result.context

  result = turn(context, 'tem areia higiênica para gato?')
  assert.equal(result.state.intent, 'produto')
  assert.notEqual(result.state.intent, 'multi')
  assert.match(result.reply, /AREIA HIGIENICA/i)
})

test('antipulgas com peso prioriza medicamento real e nao item aleatorio', () => {
  let context = {}
  let result = turn(context, 'oi')
  context = result.context
  result = turn(context, 'João')
  context = result.context

  result = turn(context, 'tem antipulgas para cachorro de 8kg?')
  assert.equal(result.state.intent, 'produto')
  assert.match(result.reply, /BRAVECTO/i)
  assert.doesNotMatch(result.reply, /CANISTER/i)
})

test('racao de gato adulto nao oferece produto de cachorro', () => {
  let context = {}
  let result = turn(context, 'oi')
  context = result.context
  result = turn(context, 'Camila')
  context = result.context

  result = turn(context, 'quero ração para gato adulto')
  context = result.context
  result = turn(context, 'sem preferencia')
  assert.equal(result.state.species, 'cat')
  assert.match(result.reply, /WHISKAS/i)
  assert.doesNotMatch(result.reply, /KITEKAT|SACH/i)
  assert.doesNotMatch(result.reply, /CÃES|CÃO|CACHORRO|PREMIER/i)
})

test('pedido de saco 15kg refaz ranking por embalagem e nao muda porte do gato', () => {
  let context = {}
  let result = turn(context, 'oi')
  context = result.context
  result = turn(context, 'Guilerme')
  context = result.context
  result = turn(context, 'quero racao para gato castrado')
  context = result.context

  result = turn(context, 'tem saco de 15kg?')
  assert.equal(result.state.species, 'cat')
  assert.equal(result.state.size, '')
  assert.match(result.reply, /15 KG/i)
  assert.ok(result.state.productOptions[0].name.includes('15 KG'))
})

test('racao com marca e embalagem ausente oferece alternativa proxima', () => {
  let context = {}
  let result = turn(context, 'Oi, tem ração pra shih tzu adulto?')
  context = result.context
  result = turn(context, 'Rodrigo')
  context = result.context

  result = turn(context, 'quero royal 15kg')
  assert.equal(result.state.brand, 'royal')
  assert.equal(result.state.packageKg, 15)
  assert.match(result.reply, /15kg/i)
  assert.match(result.reply, /alternativas|exatamente/i)
})

test('desconto antes de escolher produto nao sugere item aleatorio', () => {
  let context = {}
  let result = turn(context, 'oi')
  context = result.context
  result = turn(context, 'Rafael')
  context = result.context
  result = turn(context, 'quero ração golden')
  context = result.context

  result = turn(context, 'faz desconto?')
  assert.match(result.reply, /Infelizmente não conseguimos aplicar desconto/i)
  assert.doesNotMatch(result.reply, /DENTAL|Petisco|BONE/i)
  assert.match(result.reply, /adulto ou filhote/i)
})

test('upsell de cachorro nao oferece sache de gato', () => {
  let context = {}
  let result = turn(context, 'Oi, quero ração pra cachorro pequeno adulto')
  context = result.context
  result = turn(context, 'Bruno')
  context = result.context

  result = turn(context, 'sem preferencia')
  context = result.context
  result = turn(context, '1')
  assert.equal(result.action, 'oferecer_upsell')
  assert.match(result.reply, /Petisco Dental/i)
  assert.doesNotMatch(result.reply, /KITEKAT/i)
})

test('guardiao usa contexto persistido para nao pedir nome de novo', () => {
  let context = {}
  let result = turn(context, 'ola bom dia')
  context = result.context

  result = turn(context, 'gabriel, quero uma racao')
  context = result.context
  assert.equal(result.state.customerName, 'Gabriel')
  assert.equal(result.state.nameConfirmed, true)
  assert.equal(result.state.intent, 'produto')

  result = turn(context, 'e um shih tzu adulto')
  assert.equal(result.state.customerName, 'Gabriel')
  assert.equal(result.state.nameConfirmed, true)
  assert.equal(result.state.breed, 'Shih Tzu')
  assert.equal(result.state.ageCategory, 'adulto')
  assert.doesNotMatch(result.reply, /nome/i)
})

test('guardiao recupera memoria pelo historico quando context.petbot vier vazio', () => {
  const recovered = recoverPetbotContextFromHistory({}, {
    customer_name: 'Gabriel',
    intent: 'produto',
  }, [
    { role: 'user', content: 'ola bom dia', metadata: {} },
    { role: 'assistant', content: 'Bom dia! Qual seu nome, por favor?', metadata: {} },
    { role: 'user', content: 'gabriel, quero uma racao', metadata: {} },
    { role: 'assistant', content: 'Ele é filhote, adulto ou qual porte/raça?', metadata: {} },
    { role: 'user', content: 'filhote, spitz alemao', metadata: {} },
  ])
  const state = getPetbotState(recovered)

  assert.equal(state.customerName, 'Gabriel')
  assert.equal(state.nameConfirmed, true)
  assert.equal(state.intent, 'produto')
  assert.equal(state.breed, 'Spitz')
  assert.equal(state.size, 'pequeno')
  assert.equal(state.ageCategory, 'filhote')
})

test('snapshot do estado permite recuperar selecoes e checkout', () => {
  const state = getPetbotState({})
  state.intent = 'produto'
  state.customerName = 'Bianca'
  state.nameConfirmed = true
  state.species = 'dog'
  state.size = 'pequeno'
  state.selectedProduct = {
    product_id: 'premier-shih-adulto',
    name: 'Premier Shih Tzu Adulto',
    quantity: 1,
    unit_price: 120,
  }
  state.payment.method = 'pix'

  const recovered = recoverPetbotContextFromHistory({}, {}, [
    { role: 'assistant', content: 'Pedido em andamento', metadata: { petbot_state: snapshotPetbotState(state) } },
  ])
  const next = getPetbotState(recovered)

  assert.equal(next.customerName, 'Bianca')
  assert.equal(next.intent, 'produto')
  assert.equal(next.selectedProduct.product_id, 'premier-shih-adulto')
  assert.equal(next.payment.method, 'pix')
})

test('guardiao nao permite redigir resumo parcial com LLM', () => {
  let context = {}
  let result = turn(context, 'Oi, tem ração pra shih tzu adulto?')
  context = result.context
  result = turn(context, 'Rodrigo')
  context = result.context
  result = turn(context, 'sem preferencia')
  context = result.context
  result = turn(context, '1')
  context = result.context
  result = turn(context, 'não')

  assert.equal(result.action, 'pedir_pagamento')
  assert.equal(result.guardDirective.allowLlmRedraft, false)
})

test('mudanca de produto para veterinaria limpa selecao anterior', () => {
  let context = {}
  let result = turn(context, 'quero ração pra shih tzu adulto')
  context = result.context
  result = turn(context, 'Igor')
  context = result.context
  result = turn(context, 'sem preferencia')
  context = result.context
  result = turn(context, '1')
  context = result.context

  assert.ok(result.state.selectedProduct)

  result = turn(context, 'na verdade quero veterinario')
  assert.equal(result.state.intent, 'veterinaria')
  assert.equal(result.state.selectedProduct, null)
  assert.equal(result.state.upsell.offered, false)
})

test('pedido por humano para o bot e marca atendimento humano', () => {
  const result = turn({}, 'quero falar com um atendente')
  assert.equal(result.needsHuman, true)
  assert.equal(result.action, 'handoff_humano')
  assert.equal(result.state.status, 'human_requested')
  assert.match(result.reply, /atendente/i)
})

test('sintoma veterinario sensivel nao segue venda automatica', () => {
  const result = turn({}, 'meu cachorro comeu veneno agora')
  assert.equal(result.needsHuman, true)
  assert.equal(result.action, 'handoff_humano')
  assert.equal(result.state.intent, 'veterinaria')
  assert.match(result.state.blockedReasons.join(','), /veterinaria_sensivel/)
})

test('nao salva pedido quando cliente recusa resumo final', () => {
  const state = getPetbotState({})
  state.intent = 'produto'
  state.customerName = 'Carlos'
  state.nameConfirmed = true
  state.species = 'dog'
  state.size = 'pequeno'
  state.selectedProduct = {
    product_id: 'premier-shih-adulto',
    name: 'Premier Raças Especificas Shih Tzu Salmão Adulto 2,5kg',
    category: 'Ração',
    quantity: 1,
    unit_price: 120,
    stock_quantity: 4,
  }
  state.payment.method = 'pix'
  state.fulfillment.type = 'retirada'
  state.finalSummaryShown = true

  const result = turn({ petbot: state }, 'nao')
  assert.notEqual(result.shouldSaveOrder, true)
  assert.equal(result.action, 'cancelar')
  assert.equal(result.state.status, 'cancelado')
})
