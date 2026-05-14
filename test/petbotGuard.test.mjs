import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getPetbotState,
  markPetbotOrderSaved,
  mergePetbotContext,
  renderGuardedPetbotReply,
  runPetbotGuard,
} from '../server/lib/petbotGuard.js'

const settings = { deliveryFee: 10 }

const products = [
  {
    id: 'premier-shih-adulto',
    name: 'Premier Raças Especificas Shih Tzu Salmão Adulto 2,5kg',
    category: 'Ração',
    price: 120,
    stock_quantity: 4,
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

test('desconto é recusado sem alterar preço', () => {
  const state = getPetbotState({})
  state.intent = 'produto'
  state.customerName = 'Rafael'
  state.nameConfirmed = true
  state.species = 'dog'
  state.ageCategory = 'adulto'
  const result = turn({ petbot: state }, 'faz desconto?')
  assert.match(result.reply, /Infelizmente não conseguimos aplicar desconto/i)
  assert.doesNotMatch(result.reply, /consigo fazer/i)
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
