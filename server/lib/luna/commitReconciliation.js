function text(value = '') {
  return String(value ?? '').trim()
}

function object(value = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function recoverCommittedResultFromContext({
  context = {},
  pendingOrder = null,
  sessionId = '',
} = {}) {
  const parsed = object(context)
  const expectedKey = pendingOrder?.id && text(sessionId)
    ? `${text(sessionId)}:${text(pendingOrder.id)}`
    : ''
  if (!expectedKey || text(parsed.last_petbot_idempotency_key) !== expectedKey) return null

  const saleId = text(parsed.last_sale_id)
  const orderId = text(parsed.last_order_id)
  const appointmentId = text(parsed.last_appointment_id)
  if (!saleId && !orderId && !appointmentId) return null

  return {
    status: 'already_committed',
    sale_id: saleId || null,
    order_id: orderId || null,
    appointment_id: appointmentId || null,
    total: Number(parsed.last_total || pendingOrder?.order?.total || 0),
    payment_status: text(parsed.last_payment_status) || null,
    duplicated: true,
  }
}
