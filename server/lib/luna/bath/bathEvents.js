export const LUNA_BATH_EVENTS = Object.freeze({
  START: 'BATH_START',
  SET_CUSTOMER: 'BATH_SET_CUSTOMER',
  SET_PET: 'BATH_SET_PET',
  SET_SERVICE: 'BATH_SET_SERVICE',
  SET_SCHEDULE: 'BATH_SET_SCHEDULE',
  REJECT_SCHEDULE: 'BATH_REJECT_SCHEDULE',
  REQUEST_TRANSPORT_OPTIONS: 'BATH_REQUEST_TRANSPORT_OPTIONS',
  SELECT_TRANSPORT_MODE: 'BATH_SELECT_TRANSPORT_MODE',
  SET_TRANSPORT_ADDRESS: 'BATH_SET_TRANSPORT_ADDRESS',
  SET_NOTES: 'BATH_SET_NOTES',
  HYDRATE_PENDING_ORDER: 'BATH_HYDRATE_PENDING_ORDER',
})

const VALUES = new Set(Object.values(LUNA_BATH_EVENTS))

export function createBathEvent(type, payload = {}, metadata = {}) {
  const normalized = String(type || '').trim()
  if (!VALUES.has(normalized)) throw new TypeError(`Unknown Luna bath event: ${normalized || '<empty>'}`)
  return {
    type: normalized,
    payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {},
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
  }
}
