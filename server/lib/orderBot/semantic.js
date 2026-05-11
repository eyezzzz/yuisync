import { clean, normalizeText } from './text.js'

const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_TIMEOUT_MS = 4500

function readEnv(name) {
  return typeof process !== 'undefined' ? process.env?.[name] : undefined
}

function safeJsonParse(value) {
  try {
    return JSON.parse(String(value || '').trim())
  } catch {
    return null
  }
}

function toBoolean(value) {
  return value === true ? true : value === false ? false : null
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeFulfillment(value) {
  const text = normalizeText(value)
  if (text === 'entrega' || text === 'delivery') return 'entrega'
  if (text === 'retirada' || text === 'balcao' || text === 'loja') return 'retirada'
  return null
}

function normalizePayment(value) {
  const text = normalizeText(value)
  if (text === 'pix') return 'pix'
  if (text === 'cartao' || text === 'credito' || text === 'debito') return 'cartao'
  if (text === 'dinheiro') return 'dinheiro'
  return null
}

function normalizeSemanticResult(payload) {
  if (!payload || typeof payload !== 'object') return null

  const slots = payload.slots && typeof payload.slots === 'object' ? payload.slots : {}
  const signals = payload.signals && typeof payload.signals === 'object' ? payload.signals : {}
  const confidence = Math.max(0, Math.min(1, Number(payload.confidence || 0)))

  return {
    confidence,
    productQuery: clean(slots.productQuery || payload.productQuery),
    quantity: toNumber(slots.quantity),
    fulfillmentType: normalizeFulfillment(slots.fulfillmentType),
    paymentMethod: normalizePayment(slots.paymentMethod),
    changeFor: toNumber(slots.changeFor),
    customerName: clean(slots.customerName),
    addressRaw: clean(slots.addressRaw),
    addressReference: clean(slots.addressReference),
    signals: {
      productSearch: toBoolean(signals.productSearch),
      contextualConfirm: toBoolean(signals.contextualConfirm),
      denyOrEndItems: toBoolean(signals.denyOrEndItems),
      wantsMoreItems: toBoolean(signals.wantsMoreItems),
      correction: toBoolean(signals.correction),
      finalConfirm: toBoolean(signals.finalConfirm),
      supportQuestion: toBoolean(signals.supportQuestion),
    },
  }
}

function shouldUseOpenAiInterpreter(message, orderSession, rawSlots) {
  if (!readEnv('OPENAI_API_KEY')) return false
  if (!clean(message)) return false
  if (rawSlots.signals.reset) return false
  if (rawSlots.address || rawSlots.paymentMethod || rawSlots.fulfillmentType) return false

  const wordCount = normalizeText(message).split(/\s+/).filter(Boolean).length
  return orderSession.items.length > 0
    || orderSession.lastSuggestedProducts?.length > 0
    || wordCount >= 3
}

export async function interpretMessageWithOpenAi({ message, orderSession, rawSlots }) {
  if (!shouldUseOpenAiInterpreter(message, orderSession, rawSlots)) return null

  const apiKey = readEnv('OPENAI_API_KEY')
  const model = clean(readEnv('OPENAI_MODEL')) || clean(readEnv('OPENAI_CHAT_MODEL')) || DEFAULT_MODEL
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Number(readEnv('OPENAI_INTENT_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS))

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 320,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'Voce interpreta mensagens de WhatsApp para um bot transacional de petshop.',
              'Responda somente JSON valido, sem markdown.',
              'Nao invente produto, preco ou disponibilidade. Apenas extraia intencao e slots do texto/contexto.',
              'Campos permitidos: confidence, productQuery, slots, signals.',
              'signals: productSearch, contextualConfirm, denyOrEndItems, wantsMoreItems, correction, finalConfirm, supportQuestion.',
              'slots: productQuery, quantity, fulfillmentType(entrega|retirada), paymentMethod(pix|cartao|dinheiro), changeFor, customerName, addressRaw, addressReference.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              currentState: orderSession.currentState,
              hasItems: orderSession.items.length > 0,
              lastFocusedProduct: orderSession.lastFocusedProduct?.name || null,
              lastSuggestedProducts: (orderSession.lastSuggestedProducts || []).slice(0, 5).map((product) => product.name),
              message,
            }),
          },
        ],
      }),
    })

    if (!response.ok) return null
    const payload = await response.json().catch(() => null)
    const content = payload?.choices?.[0]?.message?.content
    return normalizeSemanticResult(safeJsonParse(content))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function mergeSemanticSlots(rawSlots, semantic) {
  if (!semantic || semantic.confidence < 0.55) return rawSlots

  const address = !rawSlots.address && semantic.addressRaw
    ? {
      raw: semantic.addressRaw,
      street: semantic.addressRaw,
      number: '',
      district: '',
      complement: '',
      reference: semantic.addressReference || '',
    }
    : rawSlots.address

  const signals = { ...rawSlots.signals }
  for (const [key, value] of Object.entries(semantic.signals || {})) {
    if (value === true) signals[key] = true
  }

  if (semantic.productQuery) signals.productSearch = true

  return {
    ...rawSlots,
    productQuery: semantic.productQuery || rawSlots.productQuery || '',
    quantity: rawSlots.quantity || semantic.quantity,
    fulfillmentType: rawSlots.fulfillmentType || semantic.fulfillmentType,
    paymentMethod: rawSlots.paymentMethod || semantic.paymentMethod,
    changeFor: rawSlots.changeFor ?? semantic.changeFor,
    customerName: rawSlots.customerName || semantic.customerName || null,
    address,
    addressReference: rawSlots.addressReference || semantic.addressReference || '',
    signals,
  }
}
