function clean(value = '') {
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
