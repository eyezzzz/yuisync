import { createOperationState } from '../operationState.js'
import { isCustomerNamePlaceholder } from '../customerIdentity.js'

function clean(value = '') {
  return String(value ?? '').trim()
}

function normalizeTransportMode(value = '') {
  return clean(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function difference(code, severity, message, expected = null, actual = null) {
  return { code, severity, message, expected, actual }
}

export function compareBathShadowTurn({
  stateBefore = {},
  stateAfter = {},
  reply = '',
  genericTransportRequested = false,
  orderResult = null,
  availability = null,
  currentTurnSelectedSchedule = false,
} = {}) {
  const before = createOperationState(stateBefore)
  const after = createOperationState(stateAfter)
  const differences = []
  const transportMode = normalizeTransportMode(after.transport?.mode)
  const normalizedReply = clean(reply)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (
    genericTransportRequested
    && transportMode
    && transportMode !== 'motodog'
    && !['cliente_leva', 'sem_transporte', 'tutor_leva'].includes(transportMode)
  ) {
    differences.push(difference(
      'GENERIC_TRANSPORT_AUTO_SELECTED',
      'error',
      'A solicitação genérica de MotoDog foi reduzida a uma modalidade paga sem escolha explícita do cliente.',
      'motodog',
      transportMode,
    ))
  }

  const placeholderUsedAsName = /(?:^(?:bom dia|boa tarde|boa noite|ola|oi)|\bcliente\s*:|^(?:pronto|obrigad[oa]))[!,:\s-]{0,8}(?:nao confirmado|nao informado|desconhecido)\b/.test(normalizedReply)
  if (isCustomerNamePlaceholder(after.customer?.name) || placeholderUsedAsName) {
    differences.push(difference(
      'PLACEHOLDER_CUSTOMER_NAME',
      'error',
      'Um placeholder interno foi usado como nome do cliente.',
      'nome confirmado ou ausência de vocativo',
      after.customer?.name || null,
    ))
  }

  const claimsCommitted = /\b(?:esta|ficou|foi)\s+(?:agendad[oa]|confirmad[oa]|reservad[oa])\b/.test(normalizedReply)
    || /\b(?:agendamento|pedido)\b.{0,30}\b(?:confirmado|agendado|reservado|concluido)\b/.test(normalizedReply)
  if (claimsCommitted && !orderResult && after.status !== 'confirmed') {
    differences.push(difference(
      'UNCOMMITTED_SUCCESS_CLAIM',
      'error',
      'A resposta afirmou conclusão antes da persistência transacional.',
      'awaiting_confirmation',
      after.status,
    ))
  }

  const city = clean(after.transport?.address?.city)
  const reference = clean(after.transport?.address?.reference)
  const normalizedCity = city
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (
    city
    && (
      (reference && normalizedCity === reference.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())
      || /\b(?:em frente|ao lado|proximo|perto|mercearia|mercado|igreja|escola|farmacia|posto|esquina)\b/.test(normalizedCity)
    )
  ) {
    differences.push(difference(
      'TRANSPORT_REFERENCE_USED_AS_CITY',
      'error',
      'O ponto de referência do MotoDog foi usado como cidade ou distrito.',
      'cidade ou distrito válido e referência separada',
      city,
    ))
  }

  if (currentTurnSelectedSchedule && availability?.requested_slot?.available === true) {
    const scheduledAt = clean(availability.requested_slot.scheduled_at)
    const timeMatch = scheduledAt.match(/T(\d{2}:\d{2})/)
    const requestedTime = timeMatch?.[1] || ''
    const acknowledged = /\bdisponivel\b/.test(normalizedReply)
      || (requestedTime && normalizedReply.includes(requestedTime))
    if (!acknowledged) {
      differences.push(difference(
        'AVAILABLE_SLOT_NOT_ACKNOWLEDGED',
        'warning',
        'O horário foi validado como livre, mas a resposta avançou sem confirmar isso ao cliente.',
        requestedTime || 'horário disponível',
        null,
      ))
    }
  }

  if (before.status === 'confirmed' && after.status !== 'confirmed') {
    differences.push(difference(
      'CONFIRMED_STATE_REGRESSED',
      'error',
      'Uma operação confirmada voltou para estado não terminal.',
      'confirmed',
      after.status,
    ))
  }

  return differences
}
