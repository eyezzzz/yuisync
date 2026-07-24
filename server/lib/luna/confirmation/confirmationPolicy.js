import { LUNA_CONFIRMATION_RESULTS } from './confirmationEvents.js'

function text(value = '') {
  return String(value ?? '').trim()
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function scheduledAt(order = {}) {
  return text(
    order?.scheduled_at
      || order?.schedule?.scheduled_at
      || order?.appointment?.scheduled_at,
  )
}

function total(order = {}) {
  return number(order?.total ?? order?.totals?.total)
}

function itemContract(order = {}) {
  return (Array.isArray(order?.items) ? order.items : [])
    .map((item) => ({
      id: text(item?.id || item?.catalog_id || item?.product_id || item?.service_id),
      quantity: number(item?.quantity) ?? 1,
      unit_price: number(item?.unit_price ?? item?.price) ?? 0,
      total: number(item?.total) ?? null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

function transportContract(order = {}) {
  const transport = order?.transport || {}
  return {
    mode: text(
      order?.service_transport_mode
        || order?.transport_mode
        || transport?.mode,
    ),
    fee: number(
      order?.service_transport_fee
        ?? order?.transport_fee
        ?? transport?.fee,
    ) ?? 0,
  }
}

export function buildConfirmationIdempotencyKey(sessionId, pendingOrderId) {
  const session = text(sessionId)
  const pending = text(pendingOrderId)
  return session && pending ? `${session}:${pending}` : ''
}

export function classifyConfirmationContractChange(previousOrder = {}, currentOrder = {}) {
  if (scheduledAt(previousOrder) !== scheduledAt(currentOrder)) {
    return LUNA_CONFIRMATION_RESULTS.SLOT_BECAME_UNAVAILABLE
  }

  if (
    total(previousOrder) !== total(currentOrder)
    || JSON.stringify(itemContract(previousOrder)) !== JSON.stringify(itemContract(currentOrder))
    || JSON.stringify(transportContract(previousOrder)) !== JSON.stringify(transportContract(currentOrder))
  ) {
    return LUNA_CONFIRMATION_RESULTS.COMMERCIAL_CONTRACT_CHANGED
  }

  return LUNA_CONFIRMATION_RESULTS.COMMERCIAL_CONTRACT_CHANGED
}

export function classifyConfirmationValidationFailure(result = {}) {
  if (result?.classification) return result.classification

  const reason = text(result?.reason || result?.code || result?.message).toLowerCase()
  if (/slot|horario|horário|agenda|indisponivel|indisponível|ocupado/.test(reason)) {
    return LUNA_CONFIRMATION_RESULTS.SLOT_BECAME_UNAVAILABLE
  }
  return LUNA_CONFIRMATION_RESULTS.VALIDATION_FAILED
}

export function isCommitResultAmbiguous(error) {
  if (error?.commitResultAmbiguous === true || error?.commit_result_ambiguous === true) return true

  const code = text(error?.code).toUpperCase()
  if (['ETIMEDOUT', 'ECONNRESET', 'ECONNABORTED', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) {
    return true
  }

  const message = text(error?.message || error).toLowerCase()
  return /timeout|timed out|network|fetch failed|connection reset|aborted|gateway|\b502\b|\b503\b|\b504\b/.test(message)
}

export function requiredPersistenceIdsPresent(operationType, result = {}) {
  const saleId = text(result?.sale_id)
  const orderId = text(result?.order_id)
  const appointmentId = text(result?.appointment_id)

  if (operationType === 'product_order') return Boolean(saleId || orderId)
  return Boolean(appointmentId && (saleId || orderId))
}
