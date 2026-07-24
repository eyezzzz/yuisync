import { createHash } from 'node:crypto'

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
  return {
    id: text(source.id || source.catalog_id || source.product_id || source.service_id, 120) || null,
    kind: text(source.kind || source.type || source.item_type, 60) || 'unknown',
    name: text(source.name || source.product_name || source.service_name, 240) || null,
    quantity: Math.max(1, finiteNumber(source.quantity, 1)),
    unit_price: Math.max(0, finiteNumber(source.unit_price ?? source.price ?? source.default_price, 0)),
    total: Math.max(0, finiteNumber(source.total, finiteNumber(source.unit_price ?? source.price ?? source.default_price, 0) * Math.max(1, finiteNumber(source.quantity, 1)))),
    metadata: objectValue(source.metadata),
  }
}

function normalizeNotes(notes) {
  const values = Array.isArray(notes) ? notes : (notes ? [notes] : [])
  return values
    .map((note) => text(typeof note === 'object' ? note.text : note, 500))
    .filter(Boolean)
    .map((note) => ({ text: note }))
}

export function createOperationState(input = {}) {
  const source = objectValue(input)
  const type = OPERATION_TYPES.has(source.type) ? source.type : 'unknown'
  const status = OPERATION_STATUSES.has(source.status) ? source.status : 'idle'
  const items = (Array.isArray(source.items) ? source.items : []).map(normalizeItem)
  const subtotal = items.reduce((sum, item) => sum + item.total, 0)
  const totalsSource = objectValue(source.totals)
  const total = Math.max(0, finiteNumber(totalsSource.total, subtotal + finiteNumber(totalsSource.transport, 0)))

  return {
    operation_id: text(source.operation_id || source.operationId, 160) || null,
    tenant_id: text(source.tenant_id || source.tenantId, 160) || null,
    session_id: text(source.session_id || source.sessionId, 160) || null,
    module_id: text(source.module_id || source.moduleId, 80) || 'petshop',
    type,
    status,
    version: Math.max(0, Math.trunc(finiteNumber(source.version, 0))),
    customer: objectValue(source.customer),
    pet: objectValue(source.pet),
    items,
    schedule: objectValue(source.schedule),
    transport: objectValue(source.transport),
    notes: normalizeNotes(source.notes),
    totals: {
      subtotal: Math.max(0, finiteNumber(totalsSource.subtotal, subtotal)),
      transport: Math.max(0, finiteNumber(totalsSource.transport, 0)),
      discounts: Math.max(0, finiteNumber(totalsSource.discounts, 0)),
      total,
    },
    required_fields: Array.isArray(source.required_fields)
      ? source.required_fields.map((field) => text(field, 100)).filter(Boolean)
      : [],
    persistence: objectValue(source.persistence),
    last_error: source.last_error && typeof source.last_error === 'object' ? source.last_error : null,
    rejected_slots: Array.isArray(source.rejected_slots)
      ? source.rejected_slots.map((slot) => text(slot, 80)).filter(Boolean)
      : [],
    ledger: Array.isArray(source.ledger) ? source.ledger.slice(-100) : [],
    metadata: objectValue(source.metadata),
  }
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
