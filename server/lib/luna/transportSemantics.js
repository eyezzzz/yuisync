export const LUNA_TRANSPORT_INTENTS = Object.freeze({
  REQUEST_OPTIONS: 'request_options',
  SELECT_MODE: 'select_mode',
  SELECT_OPTION: 'select_option',
})

function text(value = '') {
  return String(value ?? '').trim()
}

export function resolveTransportModeFromSemantics({ semantics = {}, options = [] } = {}) {
  const intent = text(semantics?.transport_intent)
  if (intent === LUNA_TRANSPORT_INTENTS.REQUEST_OPTIONS) return 'motodog'

  if (intent === LUNA_TRANSPORT_INTENTS.SELECT_MODE) {
    const mode = text(semantics?.service_transport_mode)
    return mode && mode !== 'motodog' ? mode : ''
  }

  if (intent === LUNA_TRANSPORT_INTENTS.SELECT_OPTION) {
    const optionIndex = Number(semantics?.service_transport_option_index || 0)
    const selected = Number.isInteger(optionIndex) && optionIndex > 0
      ? (Array.isArray(options) ? options : [])[optionIndex - 1]
      : null
    return text(selected?.id)
  }

  return ''
}
