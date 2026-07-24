import { createOperationState } from '../operationState.js'
import { deriveBathEvents } from './bathIntentPolicy.js'
import { buildBathOperationState } from './bathOperationBuilder.js'
import {
  projectBathStateToLegacyFacts,
  projectBathStateToPendingOrder,
} from './bathLegacyProjection.js'

function text(value = '') {
  return String(value ?? '').trim()
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function isBathSemanticPreparationCandidate({
  serviceOrderType = '',
  facts = {},
  pendingOrder = null,
  previousState = null,
} = {}) {
  if (text(serviceOrderType) === 'banho_tosa') return true
  if (text(objectValue(pendingOrder)?.order?.order_type) === 'banho_tosa') return true
  const serviceType = text(objectValue(facts).service_type).toLowerCase()
  return /banho|tosa|escov|desembolo|hidrat|higien/.test(serviceType)
}

export function runBathSemanticPreparation({
  previousState = null,
  facts = {},
  customer = {},
  resolvedService = null,
  pendingOrder = null,
  rejectedSlot = null,
  toolRuns = [],
  turnSemantics = {},
  identifiers = {},
} = {}) {
  const initial = createOperationState({
    ...objectValue(previousState),
    tenant_id: text(identifiers.tenantId || identifiers.tenant_id) || objectValue(previousState).tenant_id || null,
    session_id: text(identifiers.sessionId || identifiers.session_id) || objectValue(previousState).session_id || null,
    module_id: text(identifiers.moduleId || identifiers.module_id) || objectValue(previousState).module_id || 'petshop',
    type: 'service_booking',
    metadata: {
      ...objectValue(objectValue(previousState).metadata),
      domain: 'bath',
      bath: objectValue(objectValue(previousState).metadata?.bath),
    },
  })
  const events = deriveBathEvents({
    facts,
    customer,
    resolvedService,
    pendingOrder,
    rejectedSlot,
    toolRuns,
    turnSemantics,
  })
  const state = buildBathOperationState(initial, events)
  const projectedFacts = projectBathStateToLegacyFacts(state, facts)
  const projectedPendingOrder = projectBathStateToPendingOrder(state, pendingOrder)

  return {
    state,
    events,
    facts: projectedFacts,
    pendingOrder: projectedPendingOrder,
    authority: 'luna_kernel',
    side_effects: {
      agenda_reads: 0,
      catalog_reads: 0,
      database_writes: 0,
      rpc_calls: 0,
    },
  }
}
