import { createOperationState, validateOperationState } from './operationState.js'
import { LUNA_ERROR_CODES } from './errors.js'

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max)
}

function issue(code, severity, message, details = {}) {
  return { code, severity, message, details }
}

const RETRYABLE_ERROR_CODES = new Set([
  LUNA_ERROR_CODES.TOOL_TIMEOUT,
  LUNA_ERROR_CODES.TRANSACTION_FAILED,
])

const HUMAN_ERROR_CODES = new Set([
  LUNA_ERROR_CODES.HUMAN_HANDOFF_REQUIRED,
  LUNA_ERROR_CODES.RUNTIME_BUDGET_EXCEEDED,
])

const NO_PROGRESS_STATUSES = new Set([
  'failed',
  'error',
  'invalid',
  'not_found',
  'no_change',
  'cancelled',
])

const STATE_CHANGE_STATUSES = new Set([
  'prepared',
  'updated',
  'created',
  'committed',
  'already_committed',
  'confirmed',
  'reconciled',
])

function resultSemantics(toolResult, issues) {
  const result = toolResult?.result && typeof toolResult.result === 'object'
    ? toolResult.result
    : {}
  const status = text(toolResult?.status || result?.status, 100).toLowerCase()
  const errorCode = text(
    toolResult?.error_code
      || toolResult?.error?.code
      || result?.error_code
      || result?.error?.code,
    120,
  )
  const resultConsistent = !issues.some((entry) => entry.severity === 'error')
  const toolSucceeded = toolResult?.ok !== false && resultConsistent
  const explicitStateChanged = result?.state_changed ?? result?.changed
  const hasPersistenceEvidence = Boolean(
    result?.sale_id
      || result?.order_id
      || result?.appointment_id
      || result?.commit_id
      || result?.persistence?.sale_id
      || result?.persistence?.order_id
      || result?.persistence?.appointment_id
      || result?.persistence?.commit_id,
  )
  const stateChanged = explicitStateChanged == null
    ? Boolean(toolSucceeded && (hasPersistenceEvidence || STATE_CHANGE_STATUSES.has(status)))
    : Boolean(explicitStateChanged)
  const goalProgressed = result?.goal_progressed == null
    ? Boolean(toolSucceeded && !NO_PROGRESS_STATUSES.has(status))
    : Boolean(result.goal_progressed)
  const requiresRetry = Boolean(
    toolResult?.error?.retryable
      || result?.error?.retryable
      || RETRYABLE_ERROR_CODES.has(errorCode),
  )
  const requiresHuman = Boolean(
    toolResult?.error?.requires_human
      || result?.error?.requires_human
      || result?.requires_human
      || HUMAN_ERROR_CODES.has(errorCode),
  )
  return {
    tool_succeeded: toolSucceeded,
    state_changed: stateChanged,
    goal_progressed: goalProgressed,
    result_consistent: resultConsistent,
    requires_retry: requiresRetry,
    requires_human: requiresHuman,
  }
}

function operationStateChanged(before, after) {
  if (before.version !== after.version || before.status !== after.status || before.type !== after.type) return true
  return JSON.stringify({
    customer: before.customer,
    pet: before.pet,
    items: before.items,
    schedule: before.schedule,
    transport: before.transport,
    totals: before.totals,
    persistence: before.persistence,
  }) !== JSON.stringify({
    customer: after.customer,
    pet: after.pet,
    items: after.items,
    schedule: after.schedule,
    transport: after.transport,
    totals: after.totals,
    persistence: after.persistence,
  })
}

export function verifyToolResult(toolResult = {}) {
  const issues = []
  const toolName = text(toolResult?.tool_name || toolResult?.name, 120) || 'unknown'
  if (!toolResult || typeof toolResult !== 'object' || Array.isArray(toolResult)) {
    issues.push(issue(LUNA_ERROR_CODES.TOOL_OUTPUT_INVALID, 'error', 'Tool result must be an object.', { tool_name: toolName }))
  } else {
    if (toolResult.schema_version && toolResult.schema_version !== 1) {
      issues.push(issue(LUNA_ERROR_CODES.TOOL_OUTPUT_INVALID, 'warning', 'Tool result schema version is unknown.', {
        tool_name: toolName,
        schema_version: toolResult.schema_version,
      }))
    }
    if (toolResult.ok === false && !toolResult.error && !toolResult.result?.error && !toolResult.result?.error_code) {
      issues.push(issue(LUNA_ERROR_CODES.TOOL_OUTPUT_INVALID, 'warning', 'Failed tool result has no structured error.', {
        tool_name: toolName,
      }))
    }
    if (toolResult.requires_confirmation === true && toolResult.ok !== false) {
      const result = toolResult.result || toolResult
      const status = text(result?.status, 100)
      if (['committed', 'already_committed'].includes(status)) {
        const hasIds = Boolean(result?.appointment_id && (result?.sale_id || result?.order_id))
        if (!hasIds) {
          issues.push(issue(
            LUNA_ERROR_CODES.PERSISTENCE_PARTIAL_FAILURE,
            'error',
            'Confirmed tool result is missing persistence ids.',
            { tool_name: toolName, status },
          ))
        }
      }
    }
  }
  const semantics = resultSemantics(toolResult, issues)
  return {
    ok: semantics.result_consistent,
    severity: issues.some((entry) => entry.severity === 'error')
      ? 'error'
      : (issues.length ? 'warning' : 'ok'),
    issues,
    ...semantics,
  }
}

export function verifyOperationTurn({
  stateBefore = {},
  stateAfter = {},
  orderResult = null,
  reply = '',
  toolRuns = [],
  toolResults = [],
} = {}) {
  const before = createOperationState(stateBefore)
  const after = createOperationState(stateAfter)
  const issues = []
  const result = orderResult && typeof orderResult === 'object' ? orderResult : {}
  const replyText = text(reply, 8000).toLowerCase()
  const claimsConfirmation = /\b(?:confirmad[oa]|agendad[oa]|pedido conclu[ií]do|pronto[,!])\b/.test(replyText)
  const claimsAvailability = /\b(?:est[aá]\s+dispon[ií]vel|hor[aá]rio\s+dispon[ií]vel|sim,?\s+\d{1,2}:\d{2}\s+est[aá]\s+dispon[ií]vel)\b/.test(replyText)
  const persistence = {
    sale_id: result.sale_id || after.persistence.sale_id || null,
    order_id: result.order_id || after.persistence.order_id || null,
    appointment_id: result.appointment_id || after.persistence.appointment_id || null,
    commit_id: result.commit_id || after.persistence.commit_id || null,
  }

  const stateValidation = validateOperationState(after)
  issues.push(...stateValidation.issues)

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

  const normalizedToolRuns = Array.isArray(toolRuns) ? toolRuns : []
  const failedTools = normalizedToolRuns.filter((run) => run?.ok === false)
  if (failedTools.length) {
    issues.push(issue(
      LUNA_ERROR_CODES.TOOL_FAILED,
      'warning',
      'One or more tools failed during the turn.',
      { tools: failedTools.map((run) => run?.name || run?.tool_name || 'unknown') },
    ))
  }

  const structuredResults = Array.isArray(toolResults) && toolResults.length
    ? toolResults
    : normalizedToolRuns.map((run) => run?.tool_result || run).filter(Boolean)
  const toolVerifications = []
  for (const toolResult of structuredResults) {
    const verified = verifyToolResult(toolResult)
    toolVerifications.push(verified)
    issues.push(...verified.issues)
  }

  if (claimsAvailability) {
    const hasAvailabilityEvidence = normalizedToolRuns.some((run) => (
      run?.name === 'check_petshop_availability'
      && run?.ok !== false
      && ['available', 'resolved'].includes(text(run?.status || run?.result?.status, 100))
    ))
    if (!hasAvailabilityEvidence && !after.schedule?.scheduled_at) {
      issues.push(issue(
        LUNA_ERROR_CODES.VERIFICATION_FAILED,
        'warning',
        'Reply claims availability without schedule evidence in this turn.',
      ))
    }
  }

  const severity = issues.some((entry) => entry.severity === 'error')
    ? 'error'
    : (issues.length ? 'warning' : 'ok')
  const stateChanged = operationStateChanged(before, after)
  const resultConsistent = severity !== 'error'
  const toolSucceeded = toolVerifications.length
    ? toolVerifications.every((entry) => entry.tool_succeeded)
    : failedTools.length === 0
  const goalProgressed = Boolean(
    resultConsistent
      && (stateChanged
        || after.status === 'confirmed'
        || toolVerifications.some((entry) => entry.goal_progressed)),
  )
  return {
    ok: resultConsistent,
    severity,
    issues,
    tool_succeeded: toolSucceeded,
    state_changed: stateChanged,
    goal_progressed: goalProgressed,
    result_consistent: resultConsistent,
    requires_retry: toolVerifications.some((entry) => entry.requires_retry),
    requires_human: toolVerifications.some((entry) => entry.requires_human),
  }
}
