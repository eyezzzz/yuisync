export const LUNA_OPERATION_EVENTS = Object.freeze({
  START_OPERATION: 'START_OPERATION',
  SET_CUSTOMER: 'SET_CUSTOMER',
  SET_PET: 'SET_PET',
  SELECT_SERVICE: 'SELECT_SERVICE',
  SELECT_PRODUCT: 'SELECT_PRODUCT',
  SELECT_TIME: 'SELECT_TIME',
  REJECT_TIME: 'REJECT_TIME',
  SET_TRANSPORT: 'SET_TRANSPORT',
  SET_ADDRESS: 'SET_ADDRESS',
  ADD_NOTE: 'ADD_NOTE',
  ADD_ITEM: 'ADD_ITEM',
  REMOVE_ITEM: 'REMOVE_ITEM',
  INFORMATIONAL_QUERY: 'INFORMATIONAL_QUERY',
  REQUEST_CONFIRMATION: 'REQUEST_CONFIRMATION',
  CONFIRM_OPERATION: 'CONFIRM_OPERATION',
  CONFIRM_SUCCEEDED: 'CONFIRM_SUCCEEDED',
  CONFIRM_FAILED: 'CONFIRM_FAILED',
  CANCEL_OPERATION: 'CANCEL_OPERATION',
  REQUEST_HUMAN: 'REQUEST_HUMAN',
  RESET_FAILURE: 'RESET_FAILURE',
})

const VALUES = new Set(Object.values(LUNA_OPERATION_EVENTS))

export function isLunaOperationEvent(value) {
  return VALUES.has(String(value || '').trim())
}

export function createOperationEvent(type, payload = {}, metadata = {}) {
  const normalizedType = String(type || '').trim()
  if (!isLunaOperationEvent(normalizedType)) {
    throw new TypeError(`Unknown Luna operation event: ${normalizedType || '<empty>'}`)
  }
  return {
    type: normalizedType,
    payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {},
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
  }
}
