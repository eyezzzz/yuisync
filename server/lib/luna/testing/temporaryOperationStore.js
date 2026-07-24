import { LunaError, LUNA_ERROR_CODES } from '../errors.js'
import { createOperationState } from '../operationState.js'
import { reduceOperation } from '../operationReducer.js'

function clone(value) { return structuredClone(value) }

export class TemporaryOperationStore {
  #states = new Map()
  create(input = {}) {
    const state = createOperationState(input)
    if (!state.operation_id) throw new TypeError('operation_id is required.')
    this.#states.set(state.operation_id, state)
    return clone(state)
  }
  get(operationId) {
    const state = this.#states.get(String(operationId || ''))
    return state ? clone(state) : null
  }
  apply(operationId, event, { expectedVersion = null } = {}) {
    const current = this.#states.get(String(operationId || ''))
    if (!current) throw new Error(`Operation not found: ${operationId}`)
    if (expectedVersion !== null && Number(expectedVersion) !== current.version) {
      throw new LunaError(LUNA_ERROR_CODES.STALE_OPERATION_VERSION, 'Operation version is stale.', {
        recoverable: true,
        retryable: true,
        details: { expected_version: Number(expectedVersion), actual_version: current.version },
      })
    }
    const next = reduceOperation(current, {
      ...event,
      metadata: { ...(event?.metadata || {}), expected_version: current.version },
    })
    this.#states.set(current.operation_id, next)
    return clone(next)
  }
  list() { return [...this.#states.values()].map(clone) }
  clear() { this.#states.clear() }
}

export function createTemporaryOperationStore(initial = []) {
  const store = new TemporaryOperationStore()
  for (const state of initial) store.create(state)
  return store
}
