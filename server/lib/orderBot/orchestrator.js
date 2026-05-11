import {
  ORDER_STATES,
  clean,
  detectSignals,
  extractSlots,
  normalizeText,
  parseRating,
} from './text.js'
import {
  addItem,
  createEmptyOrderSession,
  getMissingSlots,
  orderSessionMetadata,
  readOrderSessionFromMessages,
  recalculateTotals,
  replaceLastItem,
  setAddress,
  setAddressReference,
  setChangeInfo,
  setCustomerName,
  setFulfillmentType,
  setPaymentMethod,
  setSuggestedProducts,
  stateForMissingSlot,
} from './session.js'
import { loadCatalog, matchProduct, suggestProducts } from './catalog.js'
import { interpretMessageWithOpenAi, mergeSemanticSlots } from './semantic.js'
import {
  askForMissingSlot,
  buildAmbiguousProductReply,
  buildConfirmedReply,
  buildFinalSummary,
  buildPartialSummary,
  buildProductOptions,
  buildSatisfactionThanks,
} from './responses.js'
import { confirmOrder, saveSatisfactionScore } from './persistence.js'

function applyExtractedSlots(orderSession, slots) {
  let next = orderSession
  if (slots.customerName) next = setCustomerName(next, slots.customerName)
  if (slots.fulfillmentType) next = setFulfillmentType(next, slots.fulfillmentType)
  if (slots.address) next = setAddress(next, slots.address)
  if (slots.addressReference) next = setAddressReference(next, slots.addressReference)
  if (slots.paymentMethod) next = setPaymentMethod(next, slots.paymentMethod)
  if (slots.changeFor !== null && slots.changeFor !== undefined) next = setChangeInfo(next, slots.changeFor)
  return recalculateTotals(next)
}

function withNextMissingSlot(orderSession) {
  const missing = getMissingSlots(orderSession)
  if (!missing.length) {
    return {
      orderSession: {
        ...orderSession,
        currentState: ORDER_STATES.finalReview,
      },
      reply: buildFinalSummary(orderSession),
      intent: 'final_review',
    }
  }

  const question = askForMissingSlot(orderSession, missing[0])
  return {
    orderSession: {
      ...orderSession,
      currentState: question.state,
    },
    reply: question.reply,
    intent: `awaiting_${missing[0]}`,
  }
}

function hasActiveOrder(orderSession) {
  return orderSession.items.length > 0 && orderSession.currentState !== ORDER_STATES.confirmed
}

function isNewProductRequestAfterConfirmation(orderSession, slots) {
  return orderSession.currentState === ORDER_STATES.confirmed && slots.signals.productSearch
}

function isFinalNegative(message) {
  return /^(nao|não|n|negativo)$/i.test(clean(message)) || /\b(nao confirma|não confirma|corrigir|alterar|mudar)\b/i.test(normalizeText(message))
}

function applyStateAfterSpontaneousSlot(orderSession, slots) {
  if (orderSession.currentState === ORDER_STATES.awaitingFulfillmentType && slots.fulfillmentType) {
    return withNextMissingSlot(orderSession)
  }
  if (orderSession.currentState === ORDER_STATES.awaitingCustomerName && slots.customerName) {
    return withNextMissingSlot(orderSession)
  }
  if (orderSession.currentState === ORDER_STATES.awaitingAddress && slots.address) {
    return withNextMissingSlot(orderSession)
  }
  if (orderSession.currentState === ORDER_STATES.awaitingPaymentMethod && slots.paymentMethod) {
    return withNextMissingSlot(orderSession)
  }
  if (orderSession.currentState === ORDER_STATES.awaitingChangeInfo) {
    if (slots.changeFor !== null && slots.changeFor !== undefined) return withNextMissingSlot(orderSession)
    if (/\b(nao|não|sem troco|nao precisa|não precisa)\b/.test(normalizeText(slots.rawMessage || ''))) {
      return withNextMissingSlot(setChangeInfo(orderSession, 0))
    }
  }
  return null
}

function shouldTryProductMatch(orderSession, slots) {
  return slots.signals.productSearch
    || slots.signals.contextualConfirm
    || slots.signals.wantsMoreItems
    || orderSession.currentState === ORDER_STATES.awaitingProductSelection
    || orderSession.currentState === ORDER_STATES.browsingProducts
}

function maybeResetConfirmedOrder(orderSession, seed, slots) {
  if (!isNewProductRequestAfterConfirmation(orderSession, slots)) return orderSession
  return createEmptyOrderSession({
    customerPhone: seed.customerPhone,
    customerName: orderSession.customerName || seed.customerName,
  })
}

function buildResult({ orderSession, reply, intent, extraMetadata = {} }) {
  return {
    reply,
    orderSession,
    intent,
    metadata: {
      ...orderSessionMetadata(orderSession),
      intent,
      ...extraMetadata,
    },
  }
}

/**
 * @param {{
 *   supabase: any,
 *   chatSession: any,
 *   message: string,
 *   recentMessages?: any[]
 * }} params
 */
export async function runOrderBotTurn({
  supabase,
  chatSession,
  message,
  recentMessages = [],
}) {
  const trimmedMessage = clean(message)
  const seed = {
    customerPhone: chatSession.customer_phone || '',
    customerName: chatSession.customer_name && !/^cliente whatsapp$/i.test(chatSession.customer_name)
      ? chatSession.customer_name
      : '',
  }

  let orderSession = readOrderSessionFromMessages(recentMessages, seed)

  if (orderSession.currentState === ORDER_STATES.awaitingSatisfaction) {
    const rating = parseRating(trimmedMessage)
    if (rating === null) {
      return buildResult({
        orderSession,
        reply: 'Pode me responder com uma nota de 0 a 10 para este atendimento?',
        intent: 'awaiting_satisfaction',
      })
    }

    await saveSatisfactionScore(supabase, chatSession, rating)
    orderSession = {
      ...orderSession,
      currentState: ORDER_STATES.confirmed,
      satisfactionScore: rating,
    }

    return buildResult({
      orderSession,
      reply: buildSatisfactionThanks(rating),
      intent: 'satisfaction_collected',
      extraMetadata: { csat_score: rating },
    })
  }

  const initialSignals = detectSignals(trimmedMessage, orderSession.currentState)
  if (initialSignals.reset) {
    orderSession = createEmptyOrderSession(seed)
    return buildResult({
      orderSession,
      reply: 'Tudo bem, zerei o pedido em andamento. O que voce gostaria de pedir agora?',
      intent: 'order_reset',
    })
  }

  const rawSlots = extractSlots(trimmedMessage, orderSession.currentState)
  const semantic = await interpretMessageWithOpenAi({ message: trimmedMessage, orderSession, rawSlots })
  const slots = { ...mergeSemanticSlots(rawSlots, semantic), rawMessage: trimmedMessage }
  orderSession = maybeResetConfirmedOrder(orderSession, seed, slots)
  orderSession = applyExtractedSlots(orderSession, slots)

  const catalog = await loadCatalog(supabase, {
    tenantId: chatSession.tenant_id,
    moduleId: chatSession.module_id,
  })

  if (orderSession.currentState === ORDER_STATES.finalReview) {
    if (slots.signals.finalConfirm && !isFinalNegative(trimmedMessage)) {
      const confirmation = await confirmOrder(supabase, chatSession, orderSession)
      orderSession = {
        ...orderSession,
        confirmedSaleId: confirmation.saleId,
        currentState: ORDER_STATES.awaitingSatisfaction,
      }
      return buildResult({
        orderSession,
        reply: buildConfirmedReply(orderSession),
        intent: 'awaiting_satisfaction',
        extraMetadata: { sale_id: confirmation.saleId },
      })
    }

    if (isFinalNegative(trimmedMessage) || slots.signals.correction) {
      const next = withNextMissingSlot({
        ...orderSession,
        currentState: ORDER_STATES.awaitingFulfillmentType,
      })
      return buildResult({
        orderSession: next.orderSession,
        reply: 'Sem problema. O que voce quer alterar no pedido?',
        intent: 'order_correction_requested',
      })
    }
  }

  const spontaneousSlotResult = applyStateAfterSpontaneousSlot(orderSession, slots)
  if (spontaneousSlotResult && hasActiveOrder(orderSession)) {
    return buildResult(spontaneousSlotResult)
  }

  if (
    slots.signals.denyOrEndItems
    && orderSession.items.length
    && [ORDER_STATES.awaitingMoreItemsDecision, ORDER_STATES.cartReviewPartial].includes(orderSession.currentState)
  ) {
    const next = withNextMissingSlot(orderSession)
    return buildResult(next)
  }

  if (
    orderSession.currentState === ORDER_STATES.awaitingMoreItemsDecision
    && slots.signals.contextualConfirm
    && !slots.signals.productSearch
    && !slots.signals.wantsMoreItems
    && !slots.productQuery
  ) {
    return buildResult({
      orderSession: {
        ...orderSession,
        currentState: ORDER_STATES.browsingProducts,
      },
      reply: 'Claro. O que mais voce quer adicionar?',
      intent: 'awaiting_additional_item',
    })
  }

  if (shouldTryProductMatch(orderSession, slots)) {
    const quantity = slots.quantity || 1
    const productMessage = slots.productQuery ? `${trimmedMessage} ${slots.productQuery}` : trimmedMessage
    const match = matchProduct({ message: productMessage, catalog, orderSession, slots })

    if (match.product && match.confidence >= 0.68) {
      orderSession = slots.signals.correction && orderSession.items.length
        ? replaceLastItem(orderSession, match.product, quantity, match)
        : addItem(orderSession, match.product, quantity, match)

      if (slots.signals.denyOrEndItems) {
        const next = withNextMissingSlot(orderSession)
        return buildResult(next)
      }

      return buildResult({
        orderSession,
        reply: buildPartialSummary(orderSession),
        intent: 'cart_item_added',
      })
    }

    const suggestions = match.candidates.length ? match.candidates : suggestProducts(productMessage, catalog, orderSession)
    if (suggestions.length) {
      orderSession = setSuggestedProducts(orderSession, suggestions)
      return buildResult({
        orderSession,
        reply: match.product && match.confidence > 0
          ? buildAmbiguousProductReply(suggestions)
          : buildProductOptions(suggestions),
        intent: 'awaiting_product_selection',
      })
    }
  }

  if (slots.signals.denyOrEndItems && orderSession.items.length) {
    const next = withNextMissingSlot(orderSession)
    return buildResult(next)
  }

  if (orderSession.currentState === ORDER_STATES.awaitingMoreItemsDecision) {
    if (slots.signals.wantsMoreItems || slots.signals.productSearch) {
      orderSession = {
        ...orderSession,
        currentState: ORDER_STATES.browsingProducts,
      }
      return buildResult({
        orderSession,
        reply: 'Claro. O que mais voce quer adicionar?',
        intent: 'awaiting_additional_item',
      })
    }

    const next = withNextMissingSlot(orderSession)
    return buildResult(next)
  }

  if (orderSession.items.length) {
    const next = withNextMissingSlot(orderSession)
    return buildResult(next)
  }

  if (slots.signals.supportQuestion) {
    orderSession = {
      ...orderSession,
      currentState: ORDER_STATES.idle,
    }
    return buildResult({
      orderSession,
      reply: 'Consigo te ajudar por aqui com produtos e pedidos. Me diga o que voce esta procurando que eu consulto o catalogo para voce.',
      intent: 'support_to_order_bridge',
    })
  }

  orderSession = {
    ...orderSession,
    currentState: ORDER_STATES.idle,
  }
  return buildResult({
    orderSession,
    reply: 'Oi! Posso te ajudar a montar um pedido. O que voce gostaria de comprar hoje?',
    intent: 'idle',
  })
}
