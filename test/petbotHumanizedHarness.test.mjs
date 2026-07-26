import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildUnknownStoreQuestionReply,
  validatePetbotOperationalReply,
} from '../server/lib/petbotGrounding.js'

test('foto markdown sem tool é rejeitada', () => {
  const result = validatePetbotOperationalReply({
    reply: 'Aqui está a foto: ![produto](https://example.test/foto.jpg)',
    toolRuns: [{ name: 'search_petshop_products', ok: true, result: { products: [] } }],
  })
  assert.equal(result.ok, false)
  assert.match(result.problems.join(' '), /send_product_image/)
})

test('serviço não verificado recebe resposta segura', () => {
  assert.match(buildUnknownStoreQuestionReply({ storeInformation: {} }), /Não tenho essa informação confirmada/)
})
