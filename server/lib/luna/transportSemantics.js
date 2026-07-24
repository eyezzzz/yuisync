export const LUNA_TRANSPORT_INTENTS = Object.freeze({
  REQUEST_OPTIONS: 'request_options',
  SELECT_MODE: 'select_mode',
  SELECT_OPTION: 'select_option',
})

function text(value = '') {
  return String(value ?? '').trim()
}

function normalize(value = '') {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function optionAt(options = [], index = 0) {
  const normalizedIndex = Number(index || 0)
  if (!Number.isInteger(normalizedIndex) || normalizedIndex < 1) return null
  return (Array.isArray(options) ? options : [])[normalizedIndex - 1] || null
}

/**
 * Generic ordinal parser used only when the conversation state says that a
 * numbered option list is awaiting a reply. It is intentionally independent
 * from MotoDog labels so the same language contract can be reused elsewhere.
 */
export function inferSemanticOptionIndex(message = '', optionCount = 0) {
  const answer = normalize(message)
  const count = Math.max(0, Number(optionCount || 0))
  if (!answer || count < 1) return null

  const numeric = answer.match(/^(?:opcao\s*)?(\d{1,2})$/)
  if (numeric) {
    const index = Number(numeric[1])
    return index >= 1 && index <= count ? index : null
  }

  const ordinalMap = new Map([
    ['primeira', 1],
    ['primeiro', 1],
    ['a primeira', 1],
    ['o primeiro', 1],
    ['primeira opcao', 1],
    ['primeiro opcao', 1],
    ['opcao primeira', 1],
    ['opcao primeiro', 1],
    ['segunda', 2],
    ['segundo', 2],
    ['a segunda', 2],
    ['o segundo', 2],
    ['segunda opcao', 2],
    ['segundo opcao', 2],
    ['opcao segunda', 2],
    ['opcao segundo', 2],
    ['terceira', 3],
    ['terceiro', 3],
    ['a terceira', 3],
    ['o terceiro', 3],
    ['terceira opcao', 3],
    ['terceiro opcao', 3],
    ['opcao terceira', 3],
    ['opcao terceiro', 3],
  ])
  const mapped = ordinalMap.get(answer)
  if (mapped && mapped <= count) return mapped

  if (/^(?:ultima|ultimo|a ultima|o ultimo|ultima opcao|ultimo opcao)$/.test(answer)) {
    return count
  }
  if (count % 2 === 1 && /^(?:do meio|a do meio|opcao do meio)$/.test(answer)) {
    return Math.ceil(count / 2)
  }
  return null
}

export function resolveTransportModeFromSemantics({ semantics = {}, options = [] } = {}) {
  const intent = text(semantics?.transport_intent)

  // Asking to see transport options is not a commercial selection. Keep it
  // separate from service_transport_mode so it can never override a later
  // explicit choice.
  if (intent === LUNA_TRANSPORT_INTENTS.REQUEST_OPTIONS) return ''

  if (intent === LUNA_TRANSPORT_INTENTS.SELECT_MODE) {
    const mode = text(semantics?.service_transport_mode)
    return mode && mode !== 'motodog' ? mode : ''
  }

  if (intent === LUNA_TRANSPORT_INTENTS.SELECT_OPTION) {
    return text(optionAt(options, semantics?.service_transport_option_index)?.id)
  }

  return ''
}

/**
 * Reconciles the LLM semantic act with deterministic evidence from the turn.
 * A concrete selection always wins over a generic request to list options.
 */
export function resolveTransportDecision({
  semantics = {},
  options = [],
  message = '',
  optionsPending = false,
  explicitMode = '',
} = {}) {
  const configuredOptions = Array.isArray(options) ? options : []
  const explicit = text(explicitMode)
  const explicitSelection = explicit && explicit !== 'motodog' ? explicit : ''
  const fallbackOptionIndex = optionsPending
    ? inferSemanticOptionIndex(message, configuredOptions.length)
    : null
  const fallbackSelection = text(optionAt(configuredOptions, fallbackOptionIndex)?.id)

  // Deterministic evidence from the actual customer message has priority over
  // a contradictory model classification. A generic pickup question can
  // never become a paid mode, while a concrete name or ordinal can never be
  // downgraded back into "show options".
  if (explicitSelection || fallbackSelection) {
    return {
      handled: true,
      intent: fallbackSelection
        ? LUNA_TRANSPORT_INTENTS.SELECT_OPTION
        : LUNA_TRANSPORT_INTENTS.SELECT_MODE,
      mode: explicitSelection || fallbackSelection,
      optionIndex: fallbackOptionIndex,
      requestOptions: false,
    }
  }

  if (explicit === 'motodog') {
    return {
      handled: true,
      intent: LUNA_TRANSPORT_INTENTS.REQUEST_OPTIONS,
      mode: '',
      optionIndex: null,
      requestOptions: true,
    }
  }

  const semanticSelection = resolveTransportModeFromSemantics({
    semantics,
    options: configuredOptions,
  })
  if (semanticSelection) {
    const semanticIntent = text(semantics?.transport_intent)
    return {
      handled: true,
      intent: semanticIntent === LUNA_TRANSPORT_INTENTS.SELECT_OPTION
        ? LUNA_TRANSPORT_INTENTS.SELECT_OPTION
        : LUNA_TRANSPORT_INTENTS.SELECT_MODE,
      mode: semanticSelection,
      optionIndex: semanticIntent === LUNA_TRANSPORT_INTENTS.SELECT_OPTION
        ? Number(semantics?.service_transport_option_index || 0) || null
        : null,
      requestOptions: false,
    }
  }

  const requestOptions = text(semantics?.transport_intent) === LUNA_TRANSPORT_INTENTS.REQUEST_OPTIONS
  return {
    handled: requestOptions,
    intent: requestOptions ? LUNA_TRANSPORT_INTENTS.REQUEST_OPTIONS : '',
    mode: '',
    optionIndex: null,
    requestOptions,
  }
}
