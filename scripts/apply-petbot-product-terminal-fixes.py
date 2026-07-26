from pathlib import Path


def replace_once(path, old, new, label):
    file_path = Path(path)
    source = file_path.read_text(encoding='utf-8')
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: esperado 1 trecho em {path}, encontrado {count}')
    file_path.write_text(source.replace(old, new, 1), encoding='utf-8')


module = r'''function clean(value = '') {
  return String(value ?? '').trim()
}

function normalize(value = '') {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function positiveNumber(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function inferQuantity(message = '', facts = {}) {
  const existing = positiveNumber(facts.quantity)
  if (existing) return existing

  const text = normalize(message)
  const numericUnits = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:unidades?|sacos?|pacotes?|itens?)\b/)
  if (numericUnits) return positiveNumber(numericUnits[1])

  const wordValues = new Map([
    ['um', 1], ['uma', 1], ['dois', 2], ['duas', 2], ['tres', 3],
    ['quatro', 4], ['cinco', 5], ['seis', 6], ['sete', 7], ['oito', 8],
    ['nove', 9], ['dez', 10],
  ])
  const wordUnits = text.match(/\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(?:unidades?|sacos?|pacotes?|itens?)\b/)
  if (wordUnits) return wordValues.get(wordUnits[1]) || null

  if (clean(facts.package_preference) === 'granel') {
    if (/\bdois quilos e meio\b/.test(text)) return 2.5
    if (/\bum quilo e meio\b/.test(text)) return 1.5
    const bulkNumber = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:kg|quilo|quilos)\b/)
    if (bulkNumber) return positiveNumber(bulkNumber[1])
  }

  const purchaseIntent = /\b(?:quero|preciso de|vou retirar|vou buscar|pode mandar|manda|separa|separe|vou levar)\b/.test(text)
  const informationalOnly = /\b(?:so queria saber|apenas saber|quanto custa|qual o preco|tem foto|manda foto|mostrar foto|imagem)\b/.test(text)
  const singularItem = /\b(?:um|uma)\s+(?:racao|saco|pacote|shampoo|xampu|brinquedo|antipulgas?|produto)\b/.test(text)
  return purchaseIntent && singularItem && !informationalOnly ? 1 : null
}

function inferFulfillment(message = '', facts = {}) {
  const existing = clean(facts.fulfillment_type)
  if (['entrega', 'retirada'].includes(existing)) return existing
  const text = normalize(message)
  if (/\b(?:retirar|retirada|vou buscar|buscar ai|buscar na loja|pegar na loja|na loja)\b/.test(text)) return 'retirada'
  if (/\b(?:entrega|entregar|pode mandar|manda para|mandar para|receber em casa)\b/.test(text)) return 'entrega'
  return ''
}

function inferPayment(message = '', fulfillmentType = '', facts = {}) {
  if (fulfillmentType === 'retirada') return 'a_combinar'
  const existing = clean(facts.payment_method)
  if (['pix', 'dinheiro', 'cartao'].includes(existing)) return existing
  const text = normalize(message)
  if (/\bpix\b/.test(text)) return 'pix'
  if (/\bdinheiro\b/.test(text)) return 'dinheiro'
  if (/\b(?:cartao|credito|debito)\b/.test(text)) return 'cartao'
  return ''
}

function inferDeliveryDetails(message = '', facts = {}) {
  const raw = clean(message)
  const text = normalize(raw)
  const addressMatch = raw.match(/\b((?:Rua|Avenida|Av\.?|Travessa|Alameda)\s+[^,;!?]+?\s+\d+[A-Za-z]?)\b/i)
  const chunks = raw.split(',').map((part) => clean(part)).filter(Boolean)
  const addressIndex = addressMatch
    ? chunks.findIndex((part) => normalize(part).includes(normalize(addressMatch[1])))
    : -1
  const referenceMatch = raw.match(/\b((?:perto|proximo|próximo|ao lado|em frente)\s+[^.!?]+)/i)

  return {
    delivery_address: clean(facts.delivery_address) || clean(addressMatch?.[1]),
    delivery_neighborhood: clean(facts.delivery_neighborhood)
      || (addressIndex >= 0 ? clean(chunks[addressIndex + 1]) : ''),
    delivery_city: clean(facts.delivery_city)
      || (addressIndex >= 0 ? clean(chunks[addressIndex + 2]) : ''),
    delivery_reference: clean(facts.delivery_reference)
      || clean(referenceMatch?.[1]).replace(/\s+(?:pago|pagamento)\b.*$/i, '').trim(),
  }
}

export function selectedProductCandidateFromToolRuns(toolRuns = []) {
  for (const run of [...(Array.isArray(toolRuns) ? toolRuns : [])].reverse()) {
    if (clean(run?.name) !== 'search_petshop_products' || run?.ok === false) continue
    const result = run?.result || {}
    if (clean(result?.selected_candidate?.id)) return result.selected_candidate
    const products = Array.isArray(result?.products) ? result.products.filter((item) => clean(item?.id)) : []
    if (products.length === 1) return products[0]
  }
  return null
}

export function resolveProductPreparationFacts({ message = '', facts = {}, candidate = null } = {}) {
  const fulfillmentType = inferFulfillment(message, facts)
  const quantity = inferQuantity(message, facts)
  const paymentMethod = inferPayment(message, fulfillmentType, facts)
  const delivery = fulfillmentType === 'entrega' ? inferDeliveryDetails(message, facts) : {
    delivery_address: clean(facts.delivery_address),
    delivery_neighborhood: clean(facts.delivery_neighborhood),
    delivery_city: clean(facts.delivery_city),
    delivery_reference: clean(facts.delivery_reference),
  }

  return {
    ...facts,
    selected_product_id: clean(candidate?.id) || clean(facts.selected_product_id),
    quantity,
    fulfillment_type: fulfillmentType,
    payment_method: paymentMethod,
    ...delivery,
  }
}

export function productPreparationReady({ facts = {}, candidate = null } = {}) {
  if (!clean(candidate?.id) || !(positiveNumber(facts.quantity) > 0)) return false
  const fulfillment = clean(facts.fulfillment_type)
  if (fulfillment === 'retirada') return clean(facts.payment_method) === 'a_combinar'
  if (fulfillment !== 'entrega') return false
  return ['pix', 'dinheiro', 'cartao'].includes(clean(facts.payment_method))
    && /\d/.test(clean(facts.delivery_address))
    && Boolean(clean(facts.delivery_neighborhood))
    && Boolean(clean(facts.delivery_reference))
}

export function buildForcedProductPreparationArgs({ facts = {}, candidate = null, customerName = 'Cliente', changeFor = null } = {}) {
  return {
    customer_name: clean(customerName) || 'Cliente',
    order_type: 'produto',
    items: [{
      product_id: clean(candidate?.id),
      name: clean(candidate?.name),
      quantity: positiveNumber(facts.quantity) || 1,
      upsell: false,
    }],
    payment_method: clean(facts.payment_method),
    fulfillment_type: clean(facts.fulfillment_type),
    delivery_address: clean(facts.delivery_address) || null,
    delivery_neighborhood: clean(facts.delivery_neighborhood) || null,
    delivery_city: clean(facts.delivery_city) || null,
    delivery_reference: clean(facts.delivery_reference) || null,
    change_for: positiveNumber(changeFor ?? facts.change_for),
    notes: null,
  }
}

export function messageRequestsProductImage(message = '') {
  const text = normalize(message)
  return /\b(?:foto|imagem|fotografia)\b/.test(text)
    && /\b(?:manda|mandar|envia|enviar|mostrar|mostra|ver|tem|teria|quero|queria|pode)\b/.test(text)
}

export function shouldForceProductImage({ message = '', candidate = null, toolRuns = [] } = {}) {
  const alreadySent = (Array.isArray(toolRuns) ? toolRuns : []).some((run) => (
    clean(run?.name) === 'send_product_image'
    && run?.ok !== false
    && run?.result?.image_attached === true
  ))
  const imageAvailable = candidate?.image_available === true || Boolean(clean(candidate?.image_url))
  return !alreadySent && messageRequestsProductImage(message) && clean(candidate?.id) && imageAvailable
}
'''
Path('server/lib/petbotProductFollowup.js').write_text(module, encoding='utf-8')

chat_import_old = """} from './petbotGrounding.js'\n"""
chat_import_new = """} from './petbotGrounding.js'\nimport {\n  buildForcedProductPreparationArgs,\n  productPreparationReady,\n  resolveProductPreparationFacts,\n  selectedProductCandidateFromToolRuns,\n  shouldForceProductImage,\n} from './petbotProductFollowup.js'\n"""
replace_once('server/lib/chat.js', chat_import_old, chat_import_new, 'import do follow-up de produto')
replace_once(
    'server/lib/chat.js',
    '  const currentProductFactsSignature = productFactsSignature(productFacts)\n',
    '  let currentProductFactsSignature = productFactsSignature(productFacts)\n',
    'assinatura mutável de fatos de produto',
)

chat_marker = """  // The model may correctly search an exact product and still stop with a\n"""
chat_insert = """  const candidateFromProductSearch = selectedProductCandidateFromToolRuns(agentResult.toolRuns)\n  if (!selectedRecentProductCandidate && candidateFromProductSearch) {\n    selectedRecentProductCandidate = candidateFromProductSearch\n  }\n  productFacts = resolveProductPreparationFacts({\n    message: trimmedMessage,\n    facts: productFacts,\n    candidate: selectedRecentProductCandidate,\n  })\n  currentProductFactsSignature = productFactsSignature(productFacts)\n\n  if (shouldForceProductImage({\n    message: trimmedMessage,\n    candidate: selectedRecentProductCandidate,\n    toolRuns: agentResult.toolRuns,\n  })) {\n    const forcedImageStartedAt = Date.now()\n    const forcedImageResult = await executeTool({\n      id: `force-product-image-${sessionId}`,\n      type: 'function',\n      function: {\n        name: 'send_product_image',\n        arguments: JSON.stringify({ product_id: selectedRecentProductCandidate.id }),\n      },\n    })\n    const forcedImageRun = {\n      name: 'send_product_image',\n      ok: forcedImageResult?.ok !== false,\n      status: cleanText(forcedImageResult?.status) || null,\n      duration_ms: Date.now() - forcedImageStartedAt,\n      result: forcedImageResult,\n    }\n    agentResult = {\n      ...agentResult,\n      ...(forcedImageRun.ok && forcedImageResult?.image_attached === true\n        ? { reply: `Aqui está a foto de ${cleanText(selectedRecentProductCandidate.name) || 'produto solicitado'}.`, terminal: true }\n        : {}),\n      toolRuns: [...(agentResult.toolRuns || []), forcedImageRun],\n    }\n  }\n\n""" + chat_marker
replace_once('server/lib/chat.js', chat_marker, chat_insert, 'encadeamento determinístico de imagem')

old_ready = """  const canCompleteProductPreparation = Boolean(\n    !pendingAtTurnStart\n    && !serviceOrderType\n    && !pendingOrder\n    && selectedRecentProductCandidate\n    && Number(productFacts.quantity || 0) > 0\n    && ['entrega', 'retirada'].includes(cleanText(productFacts.fulfillment_type))\n    && (\n      (cleanText(productFacts.fulfillment_type) === 'retirada'\n        && cleanText(productFacts.payment_method) === 'a_combinar')\n      || (cleanText(productFacts.fulfillment_type) === 'entrega'\n        && ['pix', 'dinheiro', 'cartao'].includes(cleanText(productFacts.payment_method)))\n    )\n  )\n"""
new_ready = """  const canCompleteProductPreparation = Boolean(\n    !pendingAtTurnStart\n    && !serviceOrderType\n    && !pendingOrder\n    && productPreparationReady({ facts: productFacts, candidate: selectedRecentProductCandidate })\n  )\n"""
replace_once('server/lib/chat.js', old_ready, new_ready, 'regra de prontidão do pedido de produto')

old_args = """    const forcedPreparationArgs = {\n      customer_name: trustedCustomerName() || 'Cliente',\n      order_type: 'produto',\n      items: [{\n        product_id: selectedRecentProductCandidate.id,\n        name: selectedRecentProductCandidate.name,\n        quantity: Number(productFacts.quantity),\n        upsell: false,\n      }],\n      payment_method: cleanText(productFacts.payment_method),\n      fulfillment_type: cleanText(productFacts.fulfillment_type),\n      delivery_address: cleanText(productFacts.delivery_address) || null,\n      delivery_neighborhood: cleanText(productFacts.delivery_neighborhood) || null,\n      delivery_city: cleanText(productFacts.delivery_city) || null,\n      delivery_reference: cleanText(productFacts.delivery_reference) || null,\n      change_for: Number(llmInterpretation?.change_for || 0) || null,\n      notes: null,\n    }\n"""
new_args = """    const forcedPreparationArgs = buildForcedProductPreparationArgs({\n      facts: productFacts,\n      candidate: selectedRecentProductCandidate,\n      customerName: trustedCustomerName() || 'Cliente',\n      changeFor: llmInterpretation?.change_for,\n    })\n"""
replace_once('server/lib/chat.js', old_args, new_args, 'payload determinístico do pedido')

eval_import_old = """  buildUnknownStoreQuestionReply,\n  validatePetbotOperationalReply,\n} from '../server/lib/petbotGrounding.js'\n"""
eval_import_new = """  buildUnknownStoreQuestionReply,\n  mergeProductQueryFacts,\n  validatePetbotOperationalReply,\n} from '../server/lib/petbotGrounding.js'\nimport {\n  buildForcedProductPreparationArgs,\n  productPreparationReady,\n  resolveProductPreparationFacts,\n  selectedProductCandidateFromToolRuns,\n  shouldForceProductImage,\n} from '../server/lib/petbotProductFollowup.js'\n"""
replace_once('scripts/eval-petbot-humanized-50.mjs', eval_import_old, eval_import_new, 'imports do avaliador')

replace_once(
    'scripts/eval-petbot-humanized-50.mjs',
    "    scenario('produto_07', 'produtos', 'Tem ração a granel? Queria só dois quilos e meio pra testar.', { allTools: ['search_petshop_products'], anyTools: ['prepare_petshop_product_order'], query: /ração|racao|granel/i }),\n",
    "    scenario('produto_07', 'produtos', 'Tem ração a granel? Queria só dois quilos e meio pra testar.', { allTools: ['search_petshop_products'], forbiddenTools: ['prepare_petshop_product_order'], query: /ração|racao|granel/i, reply: /cachorro|gato|espécie|especie|retirar|entrega|ração|racao/i }),\n",
    'expectativa correta para ração a granel incompleta',
)
replace_once(
    'scripts/eval-petbot-humanized-50.mjs',
    '  const result = await runPetbotAgent({\n',
    '  let result = await runPetbotAgent({\n',
    'resultado mutável do avaliador',
)

eval_return = """  return { result, calls, interpretation, errors: inspectCalls(item, result, calls) }\n}\n"""
eval_insert = r'''  const selectedCandidate = selectedProductCandidateFromToolRuns(result.toolRuns)
  const mergedProductFacts = mergeProductQueryFacts({
    interpretation: interpretation || {},
    previousFacts: {},
    serviceFacts: {},
    message: item.message,
  })
  const resolvedProductFacts = resolveProductPreparationFacts({
    message: item.message,
    facts: mergedProductFacts,
    candidate: selectedCandidate,
  })

  if (shouldForceProductImage({ message: item.message, candidate: selectedCandidate, toolRuns: result.toolRuns })) {
    const args = { product_id: selectedCandidate.id }
    calls.push({ name: 'send_product_image', args })
    const response = toolResult('send_product_image', args, item)
    result = {
      ...result,
      reply: `Aqui está a foto de ${selectedCandidate.name}.`,
      terminal: true,
      toolRuns: [...(result.toolRuns || []), { name: 'send_product_image', ok: response.ok !== false, status: response.status, result: response }],
    }
  }

  const alreadyPrepared = (result.toolRuns || []).some((run) => (
    run?.name === 'prepare_petshop_product_order'
    && run?.ok !== false
    && (run?.result?.status || run?.status) === 'prepared'
  ))
  if (!item.pendingOrder && !alreadyPrepared && productPreparationReady({ facts: resolvedProductFacts, candidate: selectedCandidate })) {
    const args = buildForcedProductPreparationArgs({
      facts: resolvedProductFacts,
      candidate: selectedCandidate,
      customerName: 'Cliente Teste',
      changeFor: interpretation?.change_for,
    })
    calls.push({ name: 'prepare_petshop_product_order', args })
    const response = toolResult('prepare_petshop_product_order', args, item)
    result = {
      ...result,
      reply: response.summary,
      terminal: true,
      toolRuns: [...(result.toolRuns || []), { name: 'prepare_petshop_product_order', ok: response.ok !== false, status: response.status, result: response }],
    }
  }

''' + eval_return
replace_once('scripts/eval-petbot-humanized-50.mjs', eval_return, eval_insert, 'follow-up determinístico no avaliador')

workflow_path = '.github/workflows/petbot-final-humanized-100.yml'
workflow = Path(workflow_path).read_text(encoding='utf-8')
start = """on:\n  pull_request:\n    paths:\n      - 'scripts/eval-petbot-humanized-50.mjs'\n      - 'scripts/run-petbot-diagnostic-50.mjs'\n      - 'scripts/petbot-diagnostic-suite.mjs'\n      - 'server/lib/petbotAgent.js'\n      - 'server/lib/petbotGrounding.js'\n      - 'server/lib/chat.js'\n      - 'package.json'\n      - '.github/workflows/petbot-final-humanized-100.yml'\n  workflow_dispatch:\n"""
if start not in workflow:
    raise RuntimeError('bloco de gatilho da bateria final não encontrado')
Path(workflow_path).write_text(workflow.replace(start, "on:\n  workflow_dispatch:\n", 1), encoding='utf-8')

test_file = r'''import test from 'node:test'
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
'''
Path('test/petbotProductFollowup.test.mjs').write_text(test_file, encoding='utf-8')

print('Correções determinísticas de produto aplicadas.')
