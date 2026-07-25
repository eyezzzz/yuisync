import { createHash } from 'node:crypto'
import { createTemporaryOperationStore } from '../testing/temporaryOperationStore.js'
import { resolveEvalFixtures } from './fixtureCatalog.js'

function shortId(prefix, value) {
  return `${prefix}_${createHash('sha256').update(String(value)).digest('hex').slice(0, 16)}`
}

function clean(value) {
  return String(value ?? '').trim()
}

function clone(value) {
  return structuredClone(value)
}

export function createDeterministicEvalEnvironment({ caseId, initialState = {}, fixtures = {} } = {}) {
  const resolved = resolveEvalFixtures(fixtures)
  const operationId = clean(initialState.operation_id) || `op_${caseId}`
  const store = createTemporaryOperationStore([{ ...initialState, operation_id: operationId }])
  const available = new Set(resolved.schedule?.available || [])
  const occupied = new Set(resolved.schedule?.occupied || [])
  const commits = new Map()
  const toolCalls = new Map()
  const transcript = []
  const stepResults = []
  const faults = { ...(resolved.faults || {}) }

  function recordTool(name, input = {}, output = null, error = null) {
    const count = (toolCalls.get(name) || 0) + 1
    toolCalls.set(name, count)
    const row = {
      name,
      call_index: count,
      input: clone(input),
      output: output === undefined ? null : clone(output),
      error: error ? { code: error.code || 'TOOL_FAILED', message: error.message || String(error) } : null,
    }
    stepResults.push(row)
    return row
  }

  function findService(id = 'svc_bath_small') {
    return resolved.catalog?.services?.find((entry) => entry.id === id && entry.active !== false) || null
  }

  function findTransport(mode = 'customer_brings') {
    return resolved.catalog?.transport?.find((entry) => entry.mode === mode && entry.active !== false) || null
  }

  function isSlotAvailable(scheduledAt) {
    return available.has(clean(scheduledAt)) && !occupied.has(clean(scheduledAt))
  }

  function occupySlot(scheduledAt) {
    const slot = clean(scheduledAt)
    if (slot) occupied.add(slot)
  }

  function commitOperation(state, { idempotencyKey } = {}) {
    const key = clean(idempotencyKey) || `idem_${operationId}`
    if (commits.has(key)) {
      const existing = commits.get(key)
      recordTool('confirm_operation', { idempotency_key: key }, { ...existing, duplicated: true })
      return { ...existing, duplicated: true }
    }
    const scheduledAt = clean(state.schedule?.scheduled_at)
    if (faults.occupy_before_confirm) occupySlot(scheduledAt)
    if (!isSlotAvailable(scheduledAt)) {
      const error = Object.assign(new Error('Selected slot is unavailable.'), { code: 'SLOT_BECAME_UNAVAILABLE' })
      recordTool('confirm_operation', { idempotency_key: key }, null, error)
      throw error
    }
    if (faults.transaction_failure) {
      const error = Object.assign(new Error('Deterministic transaction failure.'), { code: 'TRANSACTION_FAILED' })
      recordTool('confirm_operation', { idempotency_key: key }, null, error)
      throw error
    }
    const result = {
      sale_id: shortId('sale', `${caseId}:${key}`),
      order_id: shortId('order', `${caseId}:${key}`),
      appointment_id: shortId('appointment', `${caseId}:${key}`),
      commit_id: shortId('commit', `${caseId}:${key}`),
      duplicated: false,
    }
    commits.set(key, result)
    occupySlot(scheduledAt)
    recordTool('confirm_operation', { idempotency_key: key }, result)
    if (faults.ambiguous_after_commit) {
      const error = Object.assign(new Error('Commit result is ambiguous after persistence.'), {
        code: 'COMMIT_RESULT_AMBIGUOUS',
        committed_result: result,
      })
      throw error
    }
    return result
  }

  return {
    caseId,
    operationId,
    clock: clone(resolved.clock || {}),
    catalog: clone(resolved.catalog || {}),
    faults,
    store,
    transcript,
    stepResults,
    recordTool,
    findService,
    findTransport,
    isSlotAvailable,
    occupySlot,
    commitOperation,
    getState: () => store.get(operationId),
    applyEvent(event, options = {}) {
      const current = store.get(operationId)
      return store.apply(operationId, event, {
        expectedVersion: options.expectedVersion ?? current?.version ?? null,
      })
    },
    toolCallCount(name) { return toolCalls.get(name) || 0 },
    snapshot() {
      return {
        clock: clone(resolved.clock || {}),
        available_slots: [...available].sort(),
        occupied_slots: [...occupied].sort(),
        tool_calls: Object.fromEntries(toolCalls),
        commits: [...commits.entries()].map(([key, value]) => ({ idempotency_key: key, ...clone(value) })),
      }
    },
  }
}
