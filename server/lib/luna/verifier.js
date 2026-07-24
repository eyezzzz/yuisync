import { createOperationState } from './operationState.js'
import { LUNA_ERROR_CODES } from './errors.js'

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max)
}

function issue(code, severity, message, details = {}) {
  return { code, severity, message, details }
}

export function verifyOperationTurn({
  stateBefore = {},
  stateAfter = {},
  orderResult = null,
  reply = '',
  toolRuns = [],
} = {}) {
  const before = createOperationState(stateBefore)
  const after = createOperationState(stateAfter)
  const issues = []
  const result = orderResult && typeof orderResult === 'object' ? orderResult : {}
  const replyText = text(reply, 8000).toLowerCase()
  const claimsConfirmation = /\b(?:confirmad[oa]|agendad[oa]|pedido conclu[ií]do|pronto[,!])\b/.test(replyText)
  const persistence = {
    sale_id: result.sale_id || after.persistence.sale_id || null,
    order_id: result.order_id || after.persistence.order_id || null,
    appointment_id: result.appointment_id || after.persistence.appointment_id || null,
    commit_id: result.commit_id || after.persistence.commit_id || null,
  }

  if (after.status === 'confirmed') {
    const hasRequiredIds = after.type === 'product_order'
      ? Boolean(persistence.sale_id || persistence.order_id)
      : Boolean(persistence.appointment_id && (persistence.sale_id || persistence.order_id))
    if (!hasRequiredIds) {
      issues.push(issue(
        LUNA_ERROR_CODES.PERSISTENCE_PARTIAL_FAILURE,
        'error',
        'Operation is marked confirmed without the required persisted ids.',
        { operation_type: after.type, persistence },
      ))
    }
  }

  if (claimsConfirmation && !orderResult && after.status !== 'confirmed') {
    issues.push(issue(
      LUNA_ERROR_CODES.PERSISTENCE_PARTIAL_FAILURE,
      'error',
      'Reply claims success while the operation is not confirmed.',
      { before_status: before.status, after_status: after.status },
    ))
  }

  const failedTools = (Array.isArray(toolRuns) ? toolRuns : []).filter((run) => run?.ok === false)
  if (failedTools.length) {
    issues.push(issue(
      LUNA_ERROR_CODES.TOOL_FAILED,
      'warning',
      'One or more tools failed during the turn.',
      { tools: failedTools.map((run) => run?.name || 'unknown') },
    ))
  }

  if (after.totals.total < 0 || after.totals.subtotal < 0) {
    issues.push(issue(LUNA_ERROR_CODES.TOTAL_MISMATCH, 'error', 'Operation totals cannot be negative.'))
  }

  const severity = issues.some((entry) => entry.severity === 'error')
    ? 'error'
    : (issues.length ? 'warning' : 'ok')
  return {
    ok: severity !== 'error',
    severity,
    issues,
  }
}
