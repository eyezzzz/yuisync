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
  buildProductTriageReply,
  buildProductOptions,
  buildSatisfactionThanks,
  buildWelcomeReply,
} from './responses.js'
import { confirmOrder, saveSatisfactionScore } from './persistence.js'

const PRODUCT_TRIAGE_NOTE_PREFIX = 'product_triage_kind:'

const GENERIC_RATION_TERMS = new Set([
  'racao',
  'racoes',
  'comida',
  'alimento',
  'oi',
  'ola',
  'opa',
  'bom',
  'boa',
  'dia',
  'tarde',
  'noite',
  'quero',
  'queria',
  'preciso',
  'comprar',
  'para',
  'pra',
  'pro',
  'uma',
  'um',
  'cachorro',
  'cachorra',
  'cao',
  'caes',
  'gato',
  'gata',
  'gatos',
  'filhote',
  'adulto',
  'senior',
  'porte',
  'pequeno',
  'medio',
  'grande',
  'mini',
  'shih',
  'tzu',
  'yorkshire',
  'poodle',
  'pinscher',
  'srd',
  'vira',
  'lata',
])

const GENERIC_PRODUCT_TERMS = new Set([
  'quero',
  'queria',
  'preciso',
  'comprar',
  'oi',
  'ola',
  'opa',
  'bom',
  'boa',
  'dia',
  'tarde',
  'noite',
  'para',
  'pra',
  'pro',
  'uma',
  'um',
  'produto',
  'produtos',
  'algum',
  'alguma',
  'cachorro',
  'cachorra',
  'cao',
  'caes',
  'gato',
  'gata',
  'gatos',
  'pet',
  'porte',
  'tamanho',
  'pequeno',
  'medio',
  'grande',
])

function simpleTerms(message) {
  return normalizeText(message)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
}

function hasPackageSize(message) {
  return /\b\d+(?:[,.]\d+)?\s*(?:kg|kilo|kilos|g|gr|gramas|ml|l|litro|litros)\b/.test(normalizeText(message))
}

function hasKnownRationSpecific(message) {
  return /\b(golden|premier|royal|canin|granplus|quatree|magnus|pedigree|whiskas|special|dog|chow|cat|chow|proplan|hills|nd|formula|puppy|junior|light|castrado|indoor|urinary|renal|gastro)\b/.test(normalizeText(message))
}

function specificTermCount(message, genericTerms) {
  return simpleTerms(message)
    .filter((term) => term.length >= 3 && !genericTerms.has(term))
    .length
}

function isGreetingOnly(message) {
  const text = normalizeText(message).replace(/\s+/g, ' ').trim()
  if (!text || text.length > 80) return false

  const withoutGreeting = text
    .replace(/\b(oi|ola|opa|bom dia|boa tarde|boa noite|bom|boa|tudo bem|td bem|e ai)\b/g, '')
    .replace(/[,\s]+/g, ' ')
    .trim()

  return withoutGreeting.length === 0
}

function getProductTriageKind(message, orderSession, slots) {
  if (!slots.signals.productSearch) return null
  if (slots.signals.contextualConfirm || slots.signals.correction) return null
  if (orderSession.currentState === ORDER_STATES.awaitingProductSelection && orderSession.lastSuggestedProducts?.length) {
    return null
  }

  const text = normalizeText(message)

  if (/\b(racao|racoes|comida|alimento)\b/.test(text)) {
    if (hasPackageSize(text) || hasKnownRationSpecific(text) || specificTermCount(text, GENERIC_RATION_TERMS) >= 2) return null
    return 'ration'
  }

  if (/\b(petisco|petiscos|bifinho|ossinho|snack|sache)\b/.test(text)) {
    if (specificTermCount(text, new Set([...GENERIC_PRODUCT_TERMS, 'petisco', 'petiscos', 'snack'])) >= 2) return null
    return 'snack'
  }

  if (/\b(brinquedo|brinquedos)\b/.test(text)) {
    if (specificTermCount(text, new Set([...GENERIC_PRODUCT_TERMS, 'brinquedo', 'brinquedos'])) >= 2) return null
    return 'toy'
  }

  if (/\b(shampoo|higiene|tapete|areia|odor|eliminador)\b/.test(text)) {
    if (specificTermCount(text, new Set([...GENERIC_PRODUCT_TERMS, 'higiene'])) >= 2) return null
    return 'hygiene'
  }

  if (/\b(coleira|guia|cama|comedouro|bebedouro|acessorio|acessorios)\b/.test(text)) {
    if (hasPackageSize(text) || specificTermCount(text, new Set([...GENERIC_PRODUCT_TERMS, 'acessorio', 'acessorios'])) >= 2) return null
    return 'accessory'
  }

  if (/^(quero|queria|preciso|tem|voces tem|vcs tem)\b/.test(text) && specificTermCount(text, GENERIC_PRODUCT_TERMS) < 2) {
    return 'generic'
  }

  return null
}

function setProductTriageContext(orderSession, kind) {
  return {
    ...orderSession,
    notes: [
      ...(orderSession.notes || []).filter((note) => !String(note).startsWith(PRODUCT_TRIAGE_NOTE_PREFIX)),
      `${PRODUCT_TRIAGE_NOTE_PREFIX}${kind}`,
    ],
  }
}

function clearProductTriageContext(orderSession) {
  return {
    ...orderSession,
    notes: (orderSession.notes || []).filter((note) => !String(note).startsWith(PRODUCT_TRIAGE_NOTE_PREFIX)),
  }
}

function getProductTriageContext(orderSession) {
  const note = (orderSession.notes || []).find((item) => String(item).startsWith(PRODUCT_TRIAGE_NOTE_PREFIX))
  return note ? String(note).slice(PRODUCT_TRIAGE_NOTE_PREFIX.length) : ''
}

function productKindKeyword(kind) {
  return ({
    ration: 'racao',
    snack: 'petisco',
    toy: 'brinquedo',
    hygiene: 'higiene',
    accessory: 'acessorio',
  })[kind] || ''
}

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

function buildProductTriageResult(orderSession, kind) {
  return buildResult({
    orderSession: setProductTriageContext({
      ...orderSession,
      currentState: ORDER_STATES.browsingProducts,
    }, kind),
    reply: buildProductTriageReply(kind),
    intent: `product_triage_${kind}`,
  })
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

  if (isGreetingOnly(trimmedMessage) && !hasActiveOrder(orderSession)) {
    orderSession = {
      ...orderSession,
      currentState: ORDER_STATES.idle,
    }
    return buildResult({
      orderSession,
      reply: buildWelcomeReply(),
      intent: 'welcome',
    })
  }

  const rawSlots = extractSlots(trimmedMessage, orderSession.currentState)
  orderSession = maybeResetConfirmedOrder(orderSession, seed, rawSlots)
  const earlyTriageKind = getProductTriageKind(trimmedMessage, orderSession, { ...rawSlots, rawMessage: trimmedMessage })
  if (earlyTriageKind) return buildProductTriageResult(orderSession, earlyTriageKind)

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

  const triageKind = getProductTriageKind(trimmedMessage, orderSession, slots)
  if (triageKind) {
    return buildProductTriageResult(orderSession, triageKind)
  }

  if (shouldTryProductMatch(orderSession, slots)) {
    const quantity = slots.quantity || 1
    const triageContext = productKindKeyword(getProductTriageContext(orderSession))
    const productMessage = [triageContext, trimmedMessage, slots.productQuery]
      .filter(Boolean)
      .join(' ')
    const match = matchProduct({ message: productMessage, catalog, orderSession, slots })

    if (match.product && match.confidence >= 0.68) {
      orderSession = slots.signals.correction && orderSession.items.length
        ? replaceLastItem(orderSession, match.product, quantity, match)
        : addItem(orderSession, match.product, quantity, match)
      orderSession = clearProductTriageContext(orderSession)

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
    reply: buildWelcomeReply(),
    intent: 'idle',
  })
}
