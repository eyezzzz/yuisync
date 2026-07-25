const SETS = Object.freeze({
  request_bath: [
    'Quero marcar um banho para {pet_name}.',
    'Gostaria de agendar banho para {pet_name}.',
    'Tem como reservar um banho para {pet_name}?',
  ],
  provide_pet: [
    '{pet_name} é {breed} e pesa {weight_kg} kg.',
    'O pet chama {pet_name}, é da raça {breed}, com {weight_kg} kg.',
    'Nome: {pet_name}. Raça: {breed}. Peso: {weight_kg} kg.',
  ],
  choose_time: [
    'Pode ser em {scheduled_at}.',
    'Quero o horário {scheduled_at}.',
    'Reserva para {scheduled_at}, por favor.',
  ],
  customer_brings: [
    'Eu vou levar.',
    'Levo o pet até a loja.',
    'Não precisa buscar, eu mesmo levo.',
  ],
  request_motodog: [
    'Vocês buscam?',
    'Quero usar o MotoDog.',
    'Pode buscar e levar o pet?',
  ],
  provide_address: [
    'O endereço é {street}, {number}, {district}, {city}, referência {reference}.',
    '{street}, {number} - {district} - {city}. Fica perto de {reference}.',
  ],
  add_note: [
    '{note}.',
    'Anota também: {note}.',
    'Tenho uma observação: {note}.',
  ],
  informational_question: [
    'O banho inclui tosa higiênica?',
    'Só uma dúvida: tem tosa higiênica no banho?',
  ],
  request_summary: [
    'Pode preparar o resumo.',
    'Me mostra como ficou antes de confirmar.',
  ],
  confirm: [
    'sim',
    'confirmo',
    'pode confirmar',
    'isso mesmo',
    'fecha assim',
  ],
  change_time: [
    'Troca para {scheduled_at}.',
    'Prefiro {scheduled_at}.',
  ],
})

function text(value) {
  return String(value ?? '')
}

export function interpolatePhrase(template, payload = {}) {
  return text(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = payload?.[key]
    return value === null || value === undefined ? `{${key}}` : text(value)
  })
}

export function getParaphraseSet(name) {
  return [...(SETS[String(name || '').trim()] || [])]
}

export function resolveStepPhrases(step = {}) {
  const explicit = Array.isArray(step.phrases) ? step.phrases.filter(Boolean) : []
  const templates = explicit.length
    ? explicit
    : getParaphraseSet(step.paraphrase_set || step.user_intent)
  if (!templates.length) return [step.user_intent || step.event || step.tool || step.id || 'step']
  return [...new Set(templates.map((entry) => interpolatePhrase(entry, step.payload)).filter(Boolean))]
}

export const LUNA_EVAL_PARAPHRASE_SETS = SETS
