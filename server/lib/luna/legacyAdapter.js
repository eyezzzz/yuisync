import { createOperationState } from './operationState.js'
import { LUNA_OPERATION_EVENTS } from './operationEvents.js'

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function parseContext(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(String(value || '{}'))
    return objectValue(parsed)
  } catch {
    return {}
  }
}

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max)
}

function orderTypeToOperationType(value = '') {
  const normalized = text(value, 120).toLowerCase()
  if (/veterin|consulta|vacina|exame/.test(normalized)) return 'veterinary_booking'
  if (/banho|tosa|servico|escov|desembolo|hidrat/.test(normalized)) return 'service_booking'
  if (/produto|racao|feed|order|pedido/.test(normalized)) return 'product_order'
  return 'unknown'
}

function legacyItems(order = {}) {
  const source = objectValue(order)
  const items = Array.isArray(source.items) ? source.items : []
  const additions = Array.isArray(source.additional_services) ? source.additional_services : []
  return [
    ...items.map((item) => ({ ...item, kind: item.kind || item.type || 'product' })),
    ...additions.map((item) => ({ ...item, kind: item.kind || 'additional_service' })),
  ]
}

export function operationStateFromLegacyContext(contextValue, identifiers = {}) {
  const context = parseContext(contextValue)
  const agent = objectValue(context.petbot_agent)
  const pending = objectValue(agent.pending_order)
  const order = objectValue(pending.order)
  const facts = objectValue(agent.facts)
  const hasCommittedIds = Boolean(context.last_sale_id || context.last_order_id || context.last_appointment_id)
  const operationType = orderTypeToOperationType(order.order_type || pending.order_type || facts.service_type)
  let status = 'collecting_data'
  if (agent.needs_human) status = 'human_handoff'
  else if (hasCommittedIds && !pending.id) status = 'confirmed'
  else if (pending.id) status = 'awaiting_confirmation'
  else if (facts.service_date || facts.service_time_preference) status = 'selecting_schedule'

  return createOperationState({
    operation_id: pending.id || agent.operation_id || null,
    tenant_id: identifiers.tenantId || identifiers.tenant_id || null,
    session_id: identifiers.sessionId || identifiers.session_id || null,
    module_id: identifiers.moduleId || identifiers.module_id || 'petshop',
    type: operationType,
    status,
    version: Number(agent.operation_version || agent.version || 0),
    customer: {
      id: identifiers.customerId || null,
      name: identifiers.customerName || null,
    },
    pet: {
      name: facts.pet_name || null,
      species: facts.species || null,
      breed: facts.breed || null,
      weight_kg: facts.weight_kg || null,
      size: facts.size || null,
      coat_type: facts.coat_type || null,
    },
    items: legacyItems(order),
    schedule: {
      scheduled_at: order.scheduled_at || null,
      date: facts.service_date || null,
      time: facts.service_time_preference || facts.service_preferred_time || null,
    },
    transport: {
      mode: order.transport_mode || facts.service_transport_mode || null,
      price: order.transport_price || 0,
      address: {
        street: facts.service_transport_address || null,
        neighborhood: facts.service_transport_neighborhood || null,
        city: facts.service_transport_city || null,
        reference: facts.service_transport_reference || null,
      },
    },
    notes: facts.service_notes ? [facts.service_notes] : [],
    totals: {
      subtotal: order.subtotal || order.total || pending.total || 0,
      transport: order.transport_price || 0,
      total: order.total || pending.total || context.last_total || 0,
    },
    persistence: {
      sale_id: context.last_sale_id || null,
      order_id: context.last_order_id || null,
      appointment_id: context.last_appointment_id || null,
      commit_id: context.last_commit_id || null,
    },
    last_error: agent.last_error || null,
    metadata: {
      engine_version: agent.engine_version || null,
      legacy_intent: identifiers.intent || null,
      pending_order_type: order.order_type || pending.order_type || null,
    },
  })
}

export function deriveLegacyOperationEvent({
  message = '',
  turnSemantics = {},
  orderResult = null,
  needsHuman = false,
  pendingBefore = null,
  pendingAfter = null,
  toolRuns = [],
} = {}) {
  if (orderResult) return LUNA_OPERATION_EVENTS.CONFIRM_SUCCEEDED
  if (needsHuman) return LUNA_OPERATION_EVENTS.REQUEST_HUMAN
  const action = text(turnSemantics?.action, 80).toLowerCase()
  const target = text(turnSemantics?.target, 100).toLowerCase()
  if (turnSemantics?.confirms_pending_order || (pendingBefore && /\b(?:sim|confirmo|pode confirmar|fecha assim)\b/i.test(message))) {
    return LUNA_OPERATION_EVENTS.CONFIRM_OPERATION
  }
  if (target === 'service_notes' && ['correct', 'inform', 'select'].includes(action)) return LUNA_OPERATION_EVENTS.ADD_NOTE
  if (target.includes('transport')) return LUNA_OPERATION_EVENTS.SET_TRANSPORT
  if (target.includes('appointment_time') || target.includes('service_time')) return LUNA_OPERATION_EVENTS.SELECT_TIME
  if (pendingBefore && !pendingAfter) return LUNA_OPERATION_EVENTS.CANCEL_OPERATION
  const lastTool = Array.isArray(toolRuns) ? toolRuns.at(-1)?.name : ''
  if (/prepare_.*service|prepare_petshop_service/.test(lastTool || '')) return LUNA_OPERATION_EVENTS.REQUEST_CONFIRMATION
  return LUNA_OPERATION_EVENTS.INFORMATIONAL_QUERY
}
