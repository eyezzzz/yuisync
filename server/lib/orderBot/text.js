export const ORDER_STATES = Object.freeze({
  idle: 'idle',
  browsingProducts: 'browsing_products',
  awaitingProductSelection: 'awaiting_product_selection',
  awaitingQuantity: 'awaiting_quantity',
  cartReviewPartial: 'cart_review_partial',
  awaitingMoreItemsDecision: 'awaiting_more_items_decision',
  awaitingFulfillmentType: 'awaiting_fulfillment_type',
  awaitingCustomerName: 'awaiting_customer_name',
  awaitingAddress: 'awaiting_address',
  awaitingAddressReference: 'awaiting_address_reference',
  awaitingPaymentMethod: 'awaiting_payment_method',
  awaitingChangeInfo: 'awaiting_change_info',
  finalReview: 'final_review',
  awaitingSatisfaction: 'awaiting_satisfaction',
  confirmed: 'confirmed',
  handoffOrException: 'handoff_or_exception',
})

const NUMBER_WORDS = new Map([
  ['um', 1],
  ['uma', 1],
  ['dois', 2],
  ['duas', 2],
  ['tres', 3],
  ['quatro', 4],
  ['cinco', 5],
  ['seis', 6],
  ['sete', 7],
  ['oito', 8],
  ['nove', 9],
  ['dez', 10],
])

export function clean(value = '') {
  return String(value || '').trim()
}

export function normalizeText(value = '') {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function tokenize(value = '') {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
}

export function formatMoney(value = 0) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`
}

export function parseMoney(value = '') {
  const text = normalizeText(value)
  const explicit = text.match(/(?:r\$|rs|\bpara\b|\btroco\b)\s*(\d{1,5})(?:[,.](\d{1,2}))?/)
  const generic = text.match(/\b(\d{1,5})(?:[,.](\d{1,2}))?\b/)
  const match = explicit || generic
  if (!match) return null

  const integer = Number(match[1])
  const cents = match[2] ? Number(match[2].padEnd(2, '0')) / 100 : 0
  const amount = integer + cents
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

export function parseQuantity(value = '') {
  const text = normalizeText(value)
  const numeric = text.match(/\b(\d{1,2})(?:\s*(?:x|un|unid|unidade|unidades|pacote|pacotes))?\b/)
  if (numeric) {
    const qty = Number(numeric[1])
    return Number.isFinite(qty) && qty > 0 ? qty : null
  }

  for (const [word, qty] of NUMBER_WORDS.entries()) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return qty
  }

  return null
}

export function parseRating(value = '') {
  const text = normalizeText(value)
  const match = text.match(/\b(10|[0-9])\b/)
  if (!match) return null
  const rating = Number(match[1])
  return Number.isInteger(rating) && rating >= 0 && rating <= 10 ? rating : null
}

export function detectSignals(message = '', state = ORDER_STATES.idle) {
  const text = normalizeText(message)
  const compact = text.replace(/\s+/g, ' ')

  const isShortNo = /^(nao|n|no|negativo)$/.test(compact)
  const isShortYes = /^(sim|s|ok|okay|blz|beleza|isso|pode|confirmo|fechado)$/.test(compact)
  const hasYesSignal = /\b(sim|ok|okay|blz|beleza|isso|pode|confirmo|fechado)\b/.test(compact)

  return {
    reset: /\b(cancelar pedido|cancelar tudo|zerar|zera|limpar pedido|recomecar|recomeçar|novo pedido)\b/.test(compact),
    productSearch: /\b(racao|petisco|bifinho|brinquedo|shampoo|coleira|guia|areia|tapete|comprar|quero|queria|preciso|tem|produto|produtos|preco|estoque)\b/.test(compact),
    contextualConfirm: isShortYes
      || (state === ORDER_STATES.awaitingProductSelection && hasYesSignal)
      || /\b(pode ser|esse mesmo|essa mesma|esse|essa|isso mesmo|manda esse|manda essa|vou levar|fechou|perfeito)\b/.test(compact),
    finalConfirm: isShortYes || /\b(pode confirmar|confirmado|confirma|confirmar pedido|pode fechar|fecha o pedido)\b/.test(compact),
    denyOrEndItems: (
      (state === ORDER_STATES.awaitingMoreItemsDecision && (isShortNo || /\bnao precisa\b/.test(compact)))
      || /\b(somente|so isso|só isso|apenas isso|e isso|é isso|por enquanto|mais nada|nao quero mais nada|nao precisa de mais nada|so esse|só esse|so essa|só essa)\b/.test(compact)
    ),
    wantsMoreItems: /\b(mais|tambem|também|adicionar|inclui|coloca|quero outro|quero outra|e um|e uma)\b/.test(compact),
    correction: /\b(na verdade|trocar|troca|alterar|mudar|corrigir|corrige|mudei|em vez|ao inves)\b/.test(compact),
    supportQuestion: /\?/.test(message) || /\b(horario|funciona|abre|fecha|banho|tosa|vacina|consulta|veterinario|duvida|duvida)\b/.test(compact),
  }
}

export function extractFulfillmentType(message = '') {
  const text = normalizeText(message)
  if (/\b(entrega|delivery|entregar|mandar|manda|receber em casa)\b/.test(text)) return 'entrega'
  if (/\b(retirada|retirar|buscar|busco|pegar|loja|balcao|balcão)\b/.test(text)) return 'retirada'
  return null
}

export function extractPayment(message = '') {
  const text = normalizeText(message)
  if (/\b(pix)\b/.test(text)) return { method: 'pix' }
  if (/\b(cartao|cartao de credito|cartao de debito|credito|debito|maquininha)\b/.test(text)) return { method: 'cartao' }
  if (/\b(dinheiro|cash|especie)\b/.test(text)) {
    const changeFor = extractChangeFor(message)
    return {
      method: 'dinheiro',
      changeNeeded: changeFor ? true : null,
      changeFor,
    }
  }
  return null
}

export function extractChangeFor(message = '') {
  const text = normalizeText(message)
  if (/\b(sem troco|nao precisa de troco|nao precisa|troco nao)\b/.test(text)) return 0
  if (!/\b(troco|para|pra)\b/.test(text)) return null
  return parseMoney(text)
}

export function extractCustomerName(message = '') {
  const text = clean(message)
  const normalized = normalizeText(text)
  const match = normalized.match(/\b(meu nome e|me chamo|sou|aqui e|nome e)\s+([a-z ]{2,60})/)
  if (!match) return null

  const rawName = text.slice(normalized.indexOf(match[2])).trim()
  const firstChunk = rawName
    .split(/[,.;\n]/)[0]
    .replace(/\b(entrega|retirada|pix|cartao|dinheiro)\b.*$/i, '')
    .trim()

  return firstChunk.length >= 2 ? firstChunk : null
}

export function extractAddress(message = '') {
  const text = clean(message)
  const normalized = normalizeText(text)
  const hasStreetSignal = /\b(rua|r\.|avenida|av\.|travessa|alameda|estrada|rodovia|praca|praça|quadra|q\.|lote|lt\.|numero|n\.|nº)\b/.test(normalized)
  const hasNumber = /\b\d{1,6}[a-z]?\b/i.test(text)
  const hasReference = /\b(perto|proximo|próximo|em frente|ao lado|referencia|referência|esquina|praça|praca|mercado|igreja)\b/.test(normalized)

  if (!hasStreetSignal && !(hasNumber && /,/.test(text))) return null

  const parts = text.split(',').map((part) => part.trim()).filter(Boolean)
  const numberMatch = text.match(/\b(?:n(?:umero)?\.?|nº)?\s*(\d{1,6}[a-z]?)\b/i)

  return {
    raw: text,
    street: parts[0] || text,
    number: numberMatch?.[1] || '',
    district: parts[2] || parts[1] || '',
    complement: parts.length > 3 ? parts.slice(3).join(', ') : '',
    reference: hasReference ? text : '',
  }
}

export function extractReference(message = '') {
  const text = clean(message)
  const normalized = normalizeText(text)
  if (!/\b(perto|proximo|próximo|em frente|ao lado|referencia|referência|esquina|praça|praca|mercado|igreja)\b/.test(normalized)) {
    return null
  }
  return text
}

export function extractSlots(message = '', state = ORDER_STATES.idle) {
  const payment = extractPayment(message)
  const changeFor = extractChangeFor(message)
  return {
    quantity: parseQuantity(message),
    fulfillmentType: extractFulfillmentType(message),
    paymentMethod: payment?.method || null,
    changeNeeded: payment?.method === 'dinheiro' ? payment.changeNeeded : null,
    changeFor: payment?.changeFor ?? changeFor,
    customerName: extractCustomerName(message),
    address: extractAddress(message),
    addressReference: extractReference(message),
    signals: detectSignals(message, state),
  }
}
