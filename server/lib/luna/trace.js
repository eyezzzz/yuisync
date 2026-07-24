import { createHash, randomUUID } from 'node:crypto'
import { createOperationState, operationStateFingerprint } from './operationState.js'
import { classifyLunaFailure, createFailureSignature } from './tracing/failureCatalog.js'
import { exportRegressionFixtureFromTrace, sanitizeTraceValue } from './tracing/fixtureExporter.js'

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

function normalizedToolRun(run = {}) {
  return {
    name: text(run?.name, 120) || 'unknown',
    ok: run?.ok !== false,
    status: text(run?.status, 100) || null,
    duration_ms: Math.max(0, Number(run?.duration_ms || 0) || 0),
  }
}

function normalizedToolContract(run = {}) {
  return {
    ...normalizedToolRun(run),
    input: sanitizeTraceValue(run?.arguments || run?.input || run?.args || null, { maxDepth: 3, maxArray: 12, maxString: 240 }),
    output: sanitizeTraceValue(run?.result || run?.output || null, { maxDepth: 3, maxArray: 12, maxString: 240 }),
  }
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
    schema_version: 2,
    trace_id: text(traceId, 160) || `luna_${randomUUID()}`,
    turn_id: `turn_${randomUUID()}`,
    operation_id: before.operation_id || null,
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
    tool_contracts: [],
    usage: {
      model: null,
      tokens: 0,
      estimated_cost: null,
      estimated_cost_currency: 'USD',
    },
    runtime_budget: null,
    outcome: 'running',
    verifier: null,
    error: null,
    failure: null,
    regression_fixture: null,
  }
}

export function completeLunaTurnTrace(trace = {}, {
  stateAfter = {},
  semanticEvent = null,
  toolRuns = [],
  outcome = 'ok',
  verifier = null,
  error = null,
  model = null,
  tokensUsed = 0,
  estimatedCost = null,
  runtimeBudget = null,
  runtime = null,
  clock,
} = {}) {
  const after = createOperationState(stateAfter)
  const finishedAt = nowIso(clock)
  const startedAtMs = Date.parse(trace.started_at || finishedAt)
  const finishedAtMs = Date.parse(finishedAt)
  const normalizedError = error && typeof error === 'object'
    ? sanitizeTraceValue(typeof error.toJSON === 'function' ? error.toJSON() : error)
    : (error ? { message: text(error, 500) } : null)
  const normalizedRuntimeBudget = runtimeBudget || runtime?.budget || null
  const runtimeEstimatedCost = Number(normalizedRuntimeBudget?.usage?.estimated_cost)
  const hasExplicitEstimatedCost = estimatedCost !== null
    && estimatedCost !== undefined
    && estimatedCost !== ''
    && Number.isFinite(Number(estimatedCost))
  const resolvedEstimatedCost = hasExplicitEstimatedCost
    ? Number(estimatedCost)
    : (Number.isFinite(runtimeEstimatedCost) ? runtimeEstimatedCost : null)
  const result = {
    ...trace,
    operation_id: after.operation_id || trace.operation_id || null,
    finished_at: finishedAt,
    duration_ms: Math.max(0, finishedAtMs - startedAtMs),
    state_after: {
      status: after.status,
      type: after.type,
      version: after.version,
      fingerprint: operationStateFingerprint(after),
    },
    semantic_event: text(semanticEvent, 100) || null,
    tools: (Array.isArray(toolRuns) ? toolRuns : []).map(normalizedToolRun),
    tool_contracts: (Array.isArray(toolRuns) ? toolRuns : []).map(normalizedToolContract),
    usage: {
      model: text(model, 120) || null,
      tokens: Math.max(0, Number(tokensUsed || 0) || 0),
      estimated_cost: resolvedEstimatedCost,
      estimated_cost_currency: 'USD',
    },
    runtime_budget: sanitizeTraceValue(normalizedRuntimeBudget),
    outcome: text(outcome, 80) || 'ok',
    verifier: verifier && typeof verifier === 'object' ? verifier : null,
    error: normalizedError,
  }
  const failureClass = classifyLunaFailure(error, verifier)
  if (failureClass || verifier?.ok === false || result.outcome === 'error') {
    const primaryTool = result.tools.find((tool) => tool.ok === false)?.name || result.tools.at(-1)?.name || null
    const signature = createFailureSignature({
      failureClass: failureClass || 'VERIFIER_FAILED',
      operationType: after.type,
      state: after.status,
      event: result.semantic_event,
      tool: primaryTool,
      expected: 'consistent_turn',
      actual: verifier?.severity || result.outcome,
    })
    result.incident = {
      failure_class: failureClass || 'VERIFIER_FAILED',
      signature,
      primary_tool: primaryTool,
    }
    result.failure = {
      class: result.incident.failure_class,
      signature,
      primary_tool: primaryTool,
    }
    result.fixture_candidate = exportRegressionFixtureFromTrace(result)
    result.regression_fixture = result.fixture_candidate
  }
  return result
}
