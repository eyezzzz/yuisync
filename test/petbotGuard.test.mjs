import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getPetbotState,
  markPetbotOrderSaved,
  mergePetbotContext,
  recoverPetbotContextFromHistory,
  renderGuardedPetbotReply,
  runPetbotGuard,
  snapshotPetbotState,
} from '../server/lib/petbotGuard.js'

const settings = { deliveryFee: 10 }

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
]

const appointments = [
  {
    id: 'slot-14',
    service_type: 'Banho',
    scheduled_at: '2026-05-13T14:00:00-03:00',
    status: 'available',
    price: 70,
  },
  {
    id: 'slot-16',
    service_type: 'Banho e tosa',
    scheduled_at: '2026-05-13T16:30:00-03:00',
    status: 'available',
    price: 90,
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

test('produto usa raça como porte, não pede peso e soma taxa de entrega', () => {
  let context = {}
  let result = turn(context, 'Oi, tem ração pra shih tzu adulto?')
  context = result.context
  assert.match(result.reply, /nome/i)

  result = turn(context, 'Rodrigo')
  context = result.context
  assert.doesNotMatch(result.reply, /peso/i)
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
  assert.match(result.reply, /Premier/i)
})

test('produto aceita escolha por marca em frase natural', () => {
  let context = {}
  let result = turn(context, 'Oi, quero ração pra shih tzu adulto')
  context = result.context
  result = turn(context, 'Rodrigo')
  context = result.context

  result = turn(context, 'pode ser premier')
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
  assert.equal(result.action, 'oferecer_upsell')
  assert.equal(result.state.selectedProduct.quantity, 2)
})

test('produto envia foto aprovada quando cliente pede imagem', () => {
  let context = {}
  let result = turn(context, 'Oi, quero racao pra shih tzu adulto')
  context = result.context
  result = turn(context, 'Rodrigo')
  context = result.context

  result = turn(context, 'manda foto da premier')

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
  assert.match(result.reply, /14:00/)
  assert.equal(result.state.petName, 'Thor')
  assert.equal(result.state.breed, 'Golden Retriever')
})

test('agenda cheia nao inventa horario e pode acionar humano', () => {
  let context = {}
  let result = turn(context, 'quero banho pro meu cachorro', { appointments: [] })
  context = result.context
  result = turn(context, 'Ana', { appointments: [] })
  context = result.context
  result = turn(context, 'Thor golden', { appointments: [] })
  context = result.context

  assert.equal(result.action, 'sem_horario')
  assert.match(result.reply, /não achei horário disponível/i)

  result = turn(context, 'sim', { appointments: [] })
  assert.equal(result.needsHuman, true)
  assert.equal(result.action, 'handoff_humano')
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
  assert.match(result.reply, /equipe/i)
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
