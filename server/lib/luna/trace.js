import { createHash, randomUUID } from 'node:crypto'
import { createOperationState, operationStateFingerprint } from './operationState.js'

function text(value, max = 400) {
  return String(value ?? '').trim().slice(0, max)
}

function nowIso(clock) {
  const value = typeof clock === 'function' ? clock() : new Date()
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function messageFingerprint(message = '') {
  const normalized = text(message, 4000).replace(/\s+/g, ' ')
  return createHash('sha256').update(normalized).digest('hex').slice(0, 24)
}

export function createLunaTurnTrace({
  traceId,
  sessionId,
  tenantId,
  moduleId = 'petshop',
  message = '',
  stateBefore = {},
  clock,
} = {}) {
  const before = createOperationState(stateBefore)
  return {
    trace_id: text(traceId, 160) || `luna_${randomUUID()}`,
    turn_id: `turn_${randomUUID()}`,
    session_id: text(sessionId, 160) || null,
    tenant_id: text(tenantId, 160) || null,
    module_id: text(moduleId, 80) || 'petshop',
    started_at: nowIso(clock),
    finished_at: null,
    duration_ms: 0,
    message: {
      fingerprint: messageFingerprint(message),
      length: String(message || '').length,
    },
    state_before: {
      status: before.status,
      type: before.type,
      version: before.version,
      fingerprint: operationStateFingerprint(before),
    },
    state_after: null,
    semantic_event: null,
    tools: [],
    outcome: 'running',
    verifier: null,
    error: null,
  }
}

export function completeLunaTurnTrace(trace = {}, {
  stateAfter = {},
  semanticEvent = null,
  toolRuns = [],
  outcome = 'ok',
  verifier = null,
  error = null,
  clock,
} = {}) {
  const after = createOperationState(stateAfter)
  const finishedAt = nowIso(clock)
  const startedAtMs = Date.parse(trace.started_at || finishedAt)
  const finishedAtMs = Date.parse(finishedAt)
  return {
    ...trace,
    finished_at: finishedAt,
    duration_ms: Math.max(0, finishedAtMs - startedAtMs),
    state_after: {
      status: after.status,
      type: after.type,
      version: after.version,
      fingerprint: operationStateFingerprint(after),
    },
    semantic_event: text(semanticEvent, 100) || null,
    tools: (Array.isArray(toolRuns) ? toolRuns : []).map((run) => ({
      name: text(run?.name, 120) || 'unknown',
      ok: run?.ok !== false,
      status: text(run?.status, 100) || null,
      duration_ms: Math.max(0, Number(run?.duration_ms || 0) || 0),
    })),
    outcome: text(outcome, 80) || 'ok',
    verifier: verifier && typeof verifier === 'object' ? verifier : null,
    error: error && typeof error === 'object'
      ? error
      : (error ? { message: text(error, 500) } : null),
  }
}
