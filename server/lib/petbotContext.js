function clean(value = '') {
  return String(value ?? '').trim()
}

function parseObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function lastStructuredSnapshot(history = []) {
  for (let index = (history || []).length - 1; index >= 0; index -= 1) {
    const metadata = parseObject(history[index]?.metadata)
    if (metadata.petbot_agent && typeof metadata.petbot_agent === 'object') {
      return { petbot_agent: metadata.petbot_agent }
    }
    if (metadata.petbot_state && typeof metadata.petbot_state === 'object') {
      return { petbot: metadata.petbot_state }
    }
  }
  return {}
}

/**
 * Recovers only structured state already persisted by a previous runtime.
 * Customer messages are deliberately not reparsed with regex here: semantic
 * interpretation belongs to the LLM layer and operational validation belongs
 * to the backend tools.
 */
export function recoverPetbotContextFromHistory(context = {}, session = {}, history = []) {
  const incoming = parseObject(context)
  if (incoming.petbot_agent || incoming.petbot) return incoming

  const snapshot = lastStructuredSnapshot(history)
  const customerName = clean(session.customer_name)
  const intent = clean(session.intent)
  if (!Object.keys(snapshot).length && !customerName && !intent) return incoming

  return {
    ...incoming,
    ...snapshot,
    petbot_agent: {
      ...(snapshot.petbot_agent || {}),
      ...(customerName || intent ? {
        recovered_session: {
          customer_name: customerName || null,
          intent: intent || null,
        },
      } : {}),
    },
  }
}

/**
 * Builds a broad retrieval query from structured state. It does not decide the
 * conversation or infer missing facts.
 */
export function buildPetbotSearchText(message = '', context = {}) {
  const parsed = parseObject(context)
  const agent = parseObject(parsed.petbot_agent)
  const facts = parseObject(agent.facts || agent.explicit_facts)
  const legacy = parseObject(parsed.petbot)
  const selectedProduct = parseObject(legacy.selectedProduct)
  const productOptions = Array.isArray(legacy.productOptions) ? legacy.productOptions : []

  return [
    message,
    facts.intent,
    facts.species,
    facts.breed,
    facts.weight_label,
    facts.coat_type,
    legacy.intent,
    legacy.species,
    legacy.size,
    legacy.breed,
    legacy.ageCategory,
    legacy.brand,
    legacy.packagePreference,
    legacy.packageKg ? `${legacy.packageKg}kg` : '',
    legacy.serviceType,
    legacy.serviceNotes,
    legacy.serviceGroomingDetail,
    legacy.serviceDate,
    legacy.serviceTimePreference,
    legacy.servicePreferredTime,
    selectedProduct.name,
    ...productOptions.slice(0, 3).map((item) => clean(item?.name)),
  ].filter(Boolean).join(' ')
}
