import { createHash } from 'node:crypto'
import { LUNA_ERROR_CODES, LunaError } from './errors.js'

const OPERATION_TYPES = new Set([
  'unknown',
  'service_booking',
  'veterinary_booking',
  'product_order',
])

const OPERATION_STATUSES = new Set([
  'idle',
  'collecting_data',
  'resolving_catalog',
  'selecting_schedule',
  'preparing_summary',
  'awaiting_confirmation',
  'confirming',
  'confirmed',
  'cancelled',
  'failed',
  'human_handoff',
])

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max)
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeItem(item = {}) {
  const source = objectValue(item)
  const quantity = Math.max(1, finiteNumber(source.quantity, 1))
  const unitPrice = Math.max(0, finiteNumber(source.unit_price ?? source.price ?? source.default_price, 0))
  return {
    id: text(source.id || source.catalog_id || source.product_id || source.service_id, 120) || null,
    kind: text(source.kind || source.type || source.item_type, 60) || 'unknown',
    name: text(source.name || source.product_name || source.service_name, 240) || null,
    quantity,
    unit_price: unitPrice,
    total: Math.max(0, finiteNumber(source.total, unitPrice * quantity)),
    metadata: { ...objectValue(source.metadata) },
  }
}

function normalizeNotes(notes) {
  const values = Array.isArray(notes) ? notes : (notes ? [notes] : [])
  return values
    .map((note) => text(typeof note === 'object' ? note.text : note, 500))
    .filter(Boolean)
    .map((note) => ({ text: note }))
}

function normalizeLedgerEntry(entryInput = {}) {
  const entry = objectValue(entryInput)
  const nextVersion = Math.max(0, Math.trunc(finiteNumber(entry.next_version, entry.version || 0)))
  return {
    event_id: text(entry.event_id || entry.eventId, 180) || null,
    event: text(entry.event || entry.type, 100) || 'UNKNOWN_EVENT',
    previous_version: Math.max(0, Math.trunc(finiteNumber(entry.previous_version, Math.max(0, nextVersion - 1)))),
    version: nextVersion,
    previous_status: text(entry.previous_status, 80) || null,
    next_status: text(entry.next_status, 80) || null,
    changed: entry.changed !== false,
    source: text(entry.source, 80) || null,
    trace_id: text(entry.trace_id || entry.traceId, 180) || null,
    occurred_at: text(entry.occurred_at || entry.at, 80) || null,
  }
}

export function createOperationState(input = {}) {
  const source = objectValue(input)
  const type = OPERATION_TYPES.has(source.type) ? source.type : 'unknown'
  const status = OPERATION_STATUSES.has(source.status) ? source.status : 'idle'
  const items = (Array.isArray(source.items) ? source.items : []).map(normalizeItem)
  const subtotal = items.reduce((sum, item) => sum + item.total, 0)
  const totalsSource = objectValue(source.totals)
  const transport = Math.max(0, finiteNumber(totalsSource.transport, 0))
  const discounts = Math.max(0, finiteNumber(totalsSource.discounts, 0))
  const total = Math.max(0, finiteNumber(totalsSource.total, subtotal + transport - discounts))

  return {
    operation_id: text(source.operation_id || source.operationId, 160) || null,
    tenant_id: text(source.tenant_id || source.tenantId, 160) || null,
    session_id: text(source.session_id || source.sessionId, 160) || null,
    module_id: text(source.module_id || source.moduleId, 80) || 'petshop',
    type,
    status,
    version: Math.max(0, Math.trunc(finiteNumber(source.version, 0))),
    customer: { ...objectValue(source.customer) },
    pet: { ...objectValue(source.pet) },
    items,
    schedule: { ...objectValue(source.schedule) },
    transport: { ...objectValue(source.transport) },
    notes: normalizeNotes(source.notes),
    totals: {
      subtotal: Math.max(0, finiteNumber(totalsSource.subtotal, subtotal)),
      transport,
      discounts,
      total,
    },
    required_fields: Array.isArray(source.required_fields)
      ? source.required_fields.map((field) => text(field, 100)).filter(Boolean)
      : [],
    persistence: { ...objectValue(source.persistence) },
    last_error: source.last_error && typeof source.last_error === 'object'
      ? { ...source.last_error }
      : null,
    rejected_slots: Array.isArray(source.rejected_slots)
      ? source.rejected_slots.map((slot) => text(slot, 80)).filter(Boolean)
      : [],
    ledger: (Array.isArray(source.ledger) ? source.ledger : [])
      .slice(-200)
      .map(normalizeLedgerEntry),
    metadata: { ...objectValue(source.metadata) },
  }
}

export function validateOperationState(stateInput = {}) {
  const state = createOperationState(stateInput)
  const issues = []
  const add = (code, message, details = {}, severity = 'error') => {
    issues.push({ code, message, details, severity })
  }

  if (state.version < 0 || !Number.isInteger(state.version)) {
    add(LUNA_ERROR_CODES.INVALID_OPERATION_STATE, 'Operation version must be a non-negative integer.')
  }
  if (state.totals.total < 0 || state.totals.subtotal < 0 || state.totals.transport < 0) {
    add(LUNA_ERROR_CODES.TOTAL_MISMATCH, 'Operation totals cannot be negative.')
  }
  const calculatedTotal = Math.max(0, state.totals.subtotal + state.totals.transport - state.totals.discounts)
  if (Math.abs(calculatedTotal - state.totals.total) > 0.01) {
    add(
      LUNA_ERROR_CODES.TOTAL_MISMATCH,
      'Operation total differs from subtotal, transport and discounts.',
      { calculated_total: calculatedTotal, stored_total: state.totals.total },
      'warning',
    )
  }
  if (state.schedule.scheduled_at && state.rejected_slots.includes(String(state.schedule.scheduled_at))) {
    add(LUNA_ERROR_CODES.SLOT_UNAVAILABLE, 'Selected schedule is present in rejected slots.', {
      scheduled_at: state.schedule.scheduled_at,
    })
  }
  if (state.status === 'confirmed') {
    const hasIds = state.type === 'product_order'
      ? Boolean(state.persistence.sale_id || state.persistence.order_id)
      : Boolean(state.persistence.appointment_id && (state.persistence.sale_id || state.persistence.order_id))
    if (!hasIds) {
      add(LUNA_ERROR_CODES.PERSISTENCE_PARTIAL_FAILURE, 'Confirmed operation is missing required persistence ids.', {
        operation_type: state.type,
        persistence: state.persistence,
      })
    }
  }

  const seenEventIds = new Set()
  let previousLedgerVersion = -1
  for (const entry of state.ledger) {
    if (entry.event_id) {
      if (seenEventIds.has(entry.event_id)) {
        add(LUNA_ERROR_CODES.DUPLICATE_OPERATION_EVENT, 'Operation ledger contains a duplicate event id.', {
          event_id: entry.event_id,
        })
      }
      seenEventIds.add(entry.event_id)
    }
    if (entry.version < previousLedgerVersion) {
      add(LUNA_ERROR_CODES.INVALID_OPERATION_STATE, 'Operation ledger versions are not monotonic.')
    }
    if (entry.version > state.version) {
      add(LUNA_ERROR_CODES.INVALID_OPERATION_STATE, 'Operation ledger version is ahead of state version.', {
        ledger_version: entry.version,
        state_version: state.version,
      })
    }
    previousLedgerVersion = entry.version
  }

  return {
    ok: !issues.some((entry) => entry.severity === 'error'),
    severity: issues.some((entry) => entry.severity === 'error')
      ? 'error'
      : (issues.length ? 'warning' : 'ok'),
    issues,
    state,
  }
}

export function assertOperationState(stateInput = {}) {
  const validation = validateOperationState(stateInput)
  const error = validation.issues.find((entry) => entry.severity === 'error')
  if (error) {
    throw new LunaError(error.code, error.message, {
      recoverable: false,
      details: error.details,
    })
  }
  return validation.state
}

export function isTerminalOperationState(state = {}) {
  return ['confirmed', 'cancelled', 'human_handoff'].includes(createOperationState(state).status)
}

export function operationStateFingerprint(state = {}) {
  const normalized = createOperationState(state)
  const canonical = JSON.stringify({
    operation_id: normalized.operation_id,
    type: normalized.type,
    status: normalized.status,
    version: normalized.version,
    item_ids: normalized.items.map((item) => item.id || item.name),
    schedule: normalized.schedule,
    transport: normalized.transport,
    notes: normalized.notes,
    totals: normalized.totals,
    persistence: normalized.persistence,
  })
  return createHash('sha256').update(canonical).digest('hex').slice(0, 24)
}

export const LUNA_OPERATION_TYPES = Object.freeze([...OPERATION_TYPES])
export const LUNA_OPERATION_STATUSES = Object.freeze([...OPERATION_STATUSES])
