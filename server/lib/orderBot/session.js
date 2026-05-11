import { ORDER_STATES } from './text.js'

const ORDER_SESSION_METADATA_KEY = 'petshop_order_session'

export function createEmptyOrderSession(seed = {}) {
  return {
    version: 1,
    customerPhone: seed.customerPhone || '',
    customerName: seed.customerName || '',
    items: [],
    lastSuggestedProducts: [],
    lastFocusedProduct: null,
    fulfillmentType: null,
    address: {
      raw: '',
      street: '',
      number: '',
      district: '',
      complement: '',
      reference: '',
    },
    payment: {
      method: null,
      changeNeeded: null,
      changeFor: null,
    },
    totals: {
      subtotal: 0,
      deliveryFee: 0,
      total: 0,
    },
    notes: [],
    currentState: ORDER_STATES.idle,
    confirmedSaleId: null,
    updatedAt: new Date().toISOString(),
  }
}

export function readOrderSessionFromMessages(messages = [], seed = {}) {
  for (const message of [...messages].reverse()) {
    const metadata = message?.metadata || {}
    const snapshot = metadata[ORDER_SESSION_METADATA_KEY] || metadata.order_session
    if (snapshot?.version === 1) {
      return hydrateOrderSession(snapshot, seed)
    }
  }

  return createEmptyOrderSession(seed)
}

export function orderSessionMetadata(orderSession) {
  return {
    [ORDER_SESSION_METADATA_KEY]: sanitizeOrderSession(orderSession),
    bot_engine: 'petshop_order_state_machine_v1',
  }
}

export function hydrateOrderSession(snapshot = {}, seed = {}) {
  const empty = createEmptyOrderSession(seed)
  return recalculateTotals({
    ...empty,
    ...snapshot,
    customerPhone: snapshot.customerPhone || seed.customerPhone || '',
    customerName: snapshot.customerName || seed.customerName || '',
    items: Array.isArray(snapshot.items) ? snapshot.items : [],
    lastSuggestedProducts: Array.isArray(snapshot.lastSuggestedProducts) ? snapshot.lastSuggestedProducts : [],
    address: { ...empty.address, ...(snapshot.address || {}) },
    payment: { ...empty.payment, ...(snapshot.payment || {}) },
    totals: { ...empty.totals, ...(snapshot.totals || {}) },
    notes: Array.isArray(snapshot.notes) ? snapshot.notes : [],
  })
}

export function sanitizeOrderSession(orderSession) {
  return JSON.parse(JSON.stringify({
    ...orderSession,
    updatedAt: new Date().toISOString(),
  }))
}

export function recalculateTotals(orderSession) {
  const subtotal = (orderSession.items || []).reduce((sum, item) => sum + Number(item.totalPrice || 0), 0)
  const deliveryFee = Number(orderSession.totals?.deliveryFee || 0)
  return {
    ...orderSession,
    totals: {
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
    },
  }
}

export function setSuggestedProducts(orderSession, products = []) {
  const slimProducts = products.slice(0, 6).map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category || '',
    price: Number(product.price || 0),
    stock_quantity: Number(product.stock_quantity || 0),
  }))

  return {
    ...orderSession,
    lastSuggestedProducts: slimProducts,
    lastFocusedProduct: slimProducts[0] || orderSession.lastFocusedProduct,
    currentState: ORDER_STATES.awaitingProductSelection,
  }
}

export function addItem(orderSession, product, quantity = 1, match = {}) {
  const qty = Math.max(1, Number(quantity || 1))
  const unitPrice = Number(product.price || 0)
  const existingIndex = orderSession.items.findIndex((item) => item.productId === product.id && !item.variant)
  const nextItems = [...orderSession.items]

  if (existingIndex >= 0) {
    const current = nextItems[existingIndex]
    const nextQty = Number(current.quantity || 0) + qty
    nextItems[existingIndex] = {
      ...current,
      quantity: nextQty,
      totalPrice: nextQty * Number(current.unitPrice || unitPrice),
      sourceMatchConfidence: Math.max(Number(current.sourceMatchConfidence || 0), Number(match.confidence || 0)),
      sourceMatchReason: match.reason || current.sourceMatchReason || 'contextual_match',
    }
  } else {
    nextItems.push({
      productId: product.id,
      productName: product.name,
      variant: product.variant || null,
      quantity: qty,
      unitPrice,
      totalPrice: qty * unitPrice,
      sourceMatchConfidence: Number(match.confidence || 0),
      sourceMatchReason: match.reason || 'catalog_match',
    })
  }

  return recalculateTotals({
    ...orderSession,
    items: nextItems,
    lastFocusedProduct: {
      id: product.id,
      name: product.name,
      category: product.category || '',
      price: unitPrice,
      stock_quantity: Number(product.stock_quantity || 0),
    },
    currentState: ORDER_STATES.awaitingMoreItemsDecision,
    confirmedSaleId: null,
  })
}

export function replaceLastItem(orderSession, product, quantity = 1, match = {}) {
  const next = {
    ...orderSession,
    items: orderSession.items.slice(0, -1),
  }
  return addItem(next, product, quantity, { ...match, reason: match.reason || 'replacement' })
}

export function setFulfillmentType(orderSession, fulfillmentType) {
  return {
    ...orderSession,
    fulfillmentType,
    currentState: fulfillmentType === 'entrega' ? ORDER_STATES.awaitingAddress : ORDER_STATES.awaitingCustomerName,
  }
}

export function setCustomerName(orderSession, customerName) {
  return customerName ? { ...orderSession, customerName } : orderSession
}

export function setAddress(orderSession, address) {
  if (!address?.raw) return orderSession
  return {
    ...orderSession,
    address: {
      ...orderSession.address,
      ...address,
      reference: address.reference || orderSession.address.reference || '',
    },
  }
}

export function setAddressReference(orderSession, reference) {
  if (!reference) return orderSession
  return {
    ...orderSession,
    address: {
      ...orderSession.address,
      reference,
    },
  }
}

export function setPaymentMethod(orderSession, method) {
  if (!method) return orderSession
  return {
    ...orderSession,
    payment: {
      ...orderSession.payment,
      method,
      changeNeeded: method === 'dinheiro' ? orderSession.payment.changeNeeded : false,
      changeFor: method === 'dinheiro' ? orderSession.payment.changeFor : null,
    },
  }
}

export function setChangeInfo(orderSession, changeFor) {
  if (changeFor === null || changeFor === undefined) return orderSession
  return {
    ...orderSession,
    payment: {
      ...orderSession.payment,
      changeNeeded: Number(changeFor) > 0,
      changeFor: Number(changeFor) > 0 ? Number(changeFor) : null,
    },
  }
}

export function getMissingSlots(orderSession) {
  if (!orderSession.items.length) return ['items']
  if (!orderSession.fulfillmentType) return ['fulfillmentType']
  if (orderSession.fulfillmentType === 'entrega' && !orderSession.address.raw) return ['address']
  if (!orderSession.customerName) return ['customerName']
  if (!orderSession.payment.method) return ['paymentMethod']
  if (orderSession.payment.method === 'dinheiro' && orderSession.payment.changeNeeded === null) return ['changeInfo']
  return []
}

export function stateForMissingSlot(slot) {
  return ({
    items: ORDER_STATES.browsingProducts,
    fulfillmentType: ORDER_STATES.awaitingFulfillmentType,
    customerName: ORDER_STATES.awaitingCustomerName,
    address: ORDER_STATES.awaitingAddress,
    paymentMethod: ORDER_STATES.awaitingPaymentMethod,
    changeInfo: ORDER_STATES.awaitingChangeInfo,
  })[slot] || ORDER_STATES.finalReview
}
