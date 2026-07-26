import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildForcedProductPreparationArgs,
  messageRequestsProductImage,
  productPreparationReady,
  resolveProductPreparationFacts,
  selectedProductCandidateFromToolRuns,
  shouldForceProductImage,
} from '../server/lib/petbotProductFollowup.js'

const bag = { id: 'food-bag', name: 'Ração Premium Saco 15 kg', image_available: true }

test('prepara dois sacos com retirada e pagamento a combinar', () => {
  const facts = resolveProductPreparationFacts({
    message: 'Quero dois sacos de ração de 15 kg e vou buscar aí na loja.',
    facts: {},
    candidate: bag,
  })
  assert.equal(facts.quantity, 2)
  assert.equal(facts.fulfillment_type, 'retirada')
  assert.equal(facts.payment_method, 'a_combinar')
  assert.equal(productPreparationReady({ facts, candidate: bag }), true)
  assert.equal(buildForcedProductPreparationArgs({ facts, candidate: bag }).items[0].quantity, 2)
})

test('prepara entrega singular com endereço e Pix', () => {
  const facts = resolveProductPreparationFacts({
    message: 'Pode mandar uma ração na Rua das Flores 120, Centro, Muriaé, perto da praça? Pago no pix.',
    facts: {},
    candidate: bag,
  })
  assert.equal(facts.quantity, 1)
  assert.equal(facts.fulfillment_type, 'entrega')
  assert.equal(facts.payment_method, 'pix')
  assert.equal(facts.delivery_address, 'Rua das Flores 120')
  assert.equal(facts.delivery_neighborhood, 'Centro')
  assert.match(facts.delivery_reference, /perto da praça/i)
  assert.equal(productPreparationReady({ facts, candidate: bag }), true)
})

test('retirada de um shampoo infere quantidade um', () => {
  const candidate = { id: 'shampoo', name: 'Shampoo Neutro 500 ml' }
  const facts = resolveProductPreparationFacts({
    message: 'Vou retirar um shampoo e pago quando chegar aí.',
    facts: {},
    candidate,
  })
  assert.equal(facts.quantity, 1)
  assert.equal(productPreparationReady({ facts, candidate }), true)
})

test('ração a granel sem retirada ou entrega permanece incompleta', () => {
  const candidate = { id: 'bulk', name: 'Ração a Granel' }
  const facts = resolveProductPreparationFacts({
    message: 'Tem ração a granel? Queria só dois quilos e meio pra testar.',
    facts: { package_preference: 'granel' },
    candidate,
  })
  assert.equal(facts.quantity, 2.5)
  assert.equal(productPreparationReady({ facts, candidate }), false)
})

test('pedido de foto encadeia send_product_image uma única vez', () => {
  const runs = [{ name: 'search_petshop_products', ok: true, result: { products: [bag] } }]
  assert.equal(selectedProductCandidateFromToolRuns(runs).id, bag.id)
  assert.equal(messageRequestsProductImage('Pode mandar a foto desse produto?'), true)
  assert.equal(shouldForceProductImage({ message: 'Pode mandar a foto?', candidate: bag, toolRuns: runs }), true)
  assert.equal(shouldForceProductImage({
    message: 'Pode mandar a foto?',
    candidate: bag,
    toolRuns: [...runs, { name: 'send_product_image', ok: true, result: { image_attached: true } }],
  }), false)
})
