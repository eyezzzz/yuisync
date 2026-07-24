import { LUNA_CONFIRMATION_RESULTS } from './confirmationEvents.js'

function text(value = '') {
  return String(value ?? '').trim()
}

function normalizedText(value = '') {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function scheduledAt(order = {}) {
  const raw = text(
    order?.scheduled_at
      || order?.schedule?.scheduled_at
      || order?.appointment?.scheduled_at,
  )
  if (!raw) return ''
  const milliseconds = Date.parse(raw)
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : raw
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
    .sort((left, right) => (
      left.id.localeCompare(right.id)
      || left.unit_price - right.unit_price
      || left.quantity - right.quantity
    ))
}

function transportContract(order = {}) {
  const transport = order?.transport || {}
  return {
    mode: normalizedText(
      order?.service_transport_mode
        || order?.transport_mode
        || transport?.mode,
    ),
    fee: number(
      order?.service_transport_fee
        ?? order?.transport_fee
        ?? transport?.fee,
    ) ?? 0,
    customer_brings: Boolean(
      order?.service_transport_customer_brings
        ?? transport?.customer_brings,
    ),
    address: normalizedText(order?.service_transport_address || transport?.address),
    neighborhood: normalizedText(
      order?.service_transport_neighborhood || transport?.neighborhood,
    ),
    city: normalizedText(order?.service_transport_city || transport?.city),
    reference: normalizedText(order?.service_transport_reference || transport?.reference),
  }
}

function subscriptionContract(order = {}) {
  const benefit = order?.subscription_benefit || {}
  return {
    subscription_id: text(benefit?.subscription_id),
    service_type: normalizedText(benefit?.service_type),
  }
}

/**
 * Snapshot only of customer-confirmed and commercial fields.
 *
 * Operational rehydration can legitimately change appointment_id, duration,
 * catalog labels and derived pet metadata without changing what the customer
 * approved. Those volatile fields must not block the transaction.
 */
export function buildConfirmationContract(order = {}) {
  return {
    order_type: normalizedText(order?.order_type),
    customer: normalizedText(order?.customer_name),
    pet: {
      name: normalizedText(order?.pet_name),
      species: normalizedText(order?.species),
      breed: normalizedText(order?.breed),
      weight_kg: number(order?.weight_kg),
    },
    service: {
      product_id: text(order?.service_product_id),
      type: normalizedText(order?.service_type),
      kind: normalizedText(order?.service_kind),
      grooming_detail: normalizedText(order?.service_grooming_detail),
      notes: normalizedText(order?.notes),
      regular_price: number(order?.regular_service_price),
    },
    scheduled_at: scheduledAt(order),
    items: itemContract(order),
    transport: transportContract(order),
    subscription: subscriptionContract(order),
    total: total(order),
  }
}

export function confirmationContractsEqual(previousOrder = {}, currentOrder = {}) {
  return JSON.stringify(buildConfirmationContract(previousOrder))
    === JSON.stringify(buildConfirmationContract(currentOrder))
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
