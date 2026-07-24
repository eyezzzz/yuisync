import { LunaError, LUNA_ERROR_CODES } from './errors.js'
import { LUNA_OPERATION_EVENTS, createOperationEvent } from './operationEvents.js'
import { createOperationState } from './operationState.js'

const TERMINAL = new Set(['confirmed', 'cancelled', 'human_handoff'])

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

function assertMutable(state, eventType) {
  if (!TERMINAL.has(state.status)) return
  if (state.status === 'confirmed' && eventType === LUNA_OPERATION_EVENTS.CONFIRM_OPERATION) return
  throw new LunaError(
    LUNA_ERROR_CODES.INVALID_STATE_TRANSITION,
    `Cannot apply ${eventType} while operation is ${state.status}.`,
    { recoverable: false, details: { status: state.status, event: eventType } },
  )
}

function withLedger(state, event, patch = {}, options = {}) {
  const changed = options.changed !== false
  const nextVersion = changed ? state.version + 1 : state.version
  return createOperationState({
    ...state,
    ...patch,
    version: nextVersion,
    ledger: [
      ...state.ledger,
      {
        event: event.type,
        version: nextVersion,
        source: text(event.metadata?.source, 80) || null,
        at: text(event.metadata?.at, 80) || null,
      },
    ].slice(-100),
  })
}

function totalsForItems(items = [], currentTotals = {}) {
  const subtotal = items.reduce((sum, item) => {
    const quantity = Math.max(1, Number(item.quantity || 1) || 1)
    const unitPrice = Math.max(0, Number(item.unit_price ?? item.price ?? 0) || 0)
    const itemTotal = Math.max(0, Number(item.total) || (unitPrice * quantity))
    return sum + itemTotal
  }, 0)
  const transport = Math.max(0, Number(currentTotals.transport || 0) || 0)
  const discounts = Math.max(0, Number(currentTotals.discounts || 0) || 0)
  return {
    subtotal,
    transport,
    discounts,
    total: Math.max(0, subtotal + transport - discounts),
  }
}

function validateItemForState(state, item = {}) {
  const kind = text(item.kind || item.type || item.item_type, 60).toLowerCase()
  const id = text(item.id || item.catalog_id || item.product_id || item.service_id, 120)
  if (!id) {
    throw new LunaError(LUNA_ERROR_CODES.CATALOG_ITEM_NOT_FOUND, 'A catalog-backed item requires an id.', {
      recoverable: true,
      userActionRequired: true,
    })
  }
  if (state.type === 'service_booking' || state.type === 'veterinary_booking') {
    if (!['service', 'additional_service', 'veterinary_service'].includes(kind)) {
      throw new LunaError(LUNA_ERROR_CODES.CATALOG_TYPE_MISMATCH, 'Only service items can be added to a booking.', {
        recoverable: true,
        details: { operation_type: state.type, item_kind: kind },
      })
    }
  }
  if (state.type === 'product_order' && !['product', 'feed'].includes(kind)) {
    throw new LunaError(LUNA_ERROR_CODES.CATALOG_TYPE_MISMATCH, 'Only sellable products can be added to a product order.', {
      recoverable: true,
      details: { operation_type: state.type, item_kind: kind },
    })
  }
}

export function reduceOperation(currentState = {}, eventInput = {}) {
  const state = createOperationState(currentState)
  const event = createOperationEvent(eventInput.type, eventInput.payload, eventInput.metadata)
  assertMutable(state, event.type)

  switch (event.type) {
    case LUNA_OPERATION_EVENTS.START_OPERATION:
      return withLedger(state, event, {
        operation_id: text(event.payload.operation_id || event.payload.operationId, 160) || state.operation_id,
        type: event.payload.type || state.type,
        status: 'collecting_data',
        last_error: null,
      })

    case LUNA_OPERATION_EVENTS.SET_CUSTOMER:
      return withLedger(state, event, { customer: { ...state.customer, ...event.payload } })

    case LUNA_OPERATION_EVENTS.SET_PET:
      return withLedger(state, event, { pet: { ...state.pet, ...event.payload } })

    case LUNA_OPERATION_EVENTS.SELECT_SERVICE:
      return withLedger(state, event, {
        type: event.payload.operation_type || (event.payload.veterinary ? 'veterinary_booking' : 'service_booking'),
        status: 'selecting_schedule',
        metadata: {
          ...state.metadata,
          service_type: text(event.payload.service_type || event.payload.name, 240) || null,
          service_modality: text(event.payload.modality, 120) || state.metadata.service_modality || null,
        },
      })

    case LUNA_OPERATION_EVENTS.SELECT_PRODUCT:
      return withLedger(state, event, { type: 'product_order', status: 'preparing_summary' })

    case LUNA_OPERATION_EVENTS.SELECT_TIME: {
      const scheduledAt = text(event.payload.scheduled_at || event.payload.datetime || event.payload.time, 100)
      if (!scheduledAt) {
        throw new LunaError(LUNA_ERROR_CODES.MISSING_REQUIRED_FIELD, 'SELECT_TIME requires scheduled_at.', {
          recoverable: true,
          userActionRequired: true,
          details: { field: 'scheduled_at' },
        })
      }
      if (state.rejected_slots.includes(scheduledAt)) {
        throw new LunaError(LUNA_ERROR_CODES.SLOT_UNAVAILABLE, 'The selected slot was already rejected as unavailable.', {
          recoverable: true,
          userActionRequired: true,
          details: { scheduled_at: scheduledAt },
        })
      }
      return withLedger(state, event, {
        schedule: { ...state.schedule, ...event.payload, scheduled_at: scheduledAt },
        status: 'preparing_summary',
        last_error: null,
      })
    }

    case LUNA_OPERATION_EVENTS.REJECT_TIME: {
      const scheduledAt = text(event.payload.scheduled_at || state.schedule.scheduled_at, 100)
      return withLedger(state, event, {
        schedule: scheduledAt === state.schedule.scheduled_at ? {} : state.schedule,
        rejected_slots: [...new Set([...state.rejected_slots, scheduledAt].filter(Boolean))],
        status: 'selecting_schedule',
        last_error: {
          code: LUNA_ERROR_CODES.SLOT_UNAVAILABLE,
          recoverable: true,
          details: { scheduled_at: scheduledAt },
        },
      })
    }

    case LUNA_OPERATION_EVENTS.SET_TRANSPORT:
      return withLedger(state, event, { transport: { ...state.transport, ...event.payload } })

    case LUNA_OPERATION_EVENTS.SET_ADDRESS:
      return withLedger(state, event, {
        transport: { ...state.transport, address: { ...(state.transport.address || {}), ...event.payload } },
      })

    case LUNA_OPERATION_EVENTS.ADD_NOTE: {
      const note = text(event.payload.text || event.payload.note, 500)
      if (!note) {
        throw new LunaError(LUNA_ERROR_CODES.MISSING_REQUIRED_FIELD, 'ADD_NOTE requires text.', {
          recoverable: true,
          userActionRequired: true,
          details: { field: 'text' },
        })
      }
      return withLedger(state, event, {
        notes: [...state.notes, { text: note }],
        status: state.status === 'awaiting_confirmation' ? 'awaiting_confirmation' : state.status,
        last_error: null,
      })
    }

    case LUNA_OPERATION_EVENTS.ADD_ITEM: {
      validateItemForState(state, event.payload)
      const itemId = text(event.payload.id || event.payload.catalog_id || event.payload.product_id || event.payload.service_id, 120)
      const withoutExisting = state.items.filter((item) => item.id !== itemId)
      const items = [...withoutExisting, { ...event.payload, id: itemId }]
      return withLedger(state, event, {
        items,
        totals: totalsForItems(items, state.totals),
        status: state.status === 'awaiting_confirmation' ? 'awaiting_confirmation' : 'preparing_summary',
        last_error: null,
      })
    }

    case LUNA_OPERATION_EVENTS.REMOVE_ITEM: {
      const itemId = text(event.payload.id || event.payload.catalog_id, 120)
      const items = state.items.filter((item) => item.id !== itemId)
      return withLedger(state, event, {
        items,
        totals: totalsForItems(items, state.totals),
      })
    }

    case LUNA_OPERATION_EVENTS.INFORMATIONAL_QUERY:
      return withLedger(state, event, {}, { changed: false })

    case LUNA_OPERATION_EVENTS.REQUEST_CONFIRMATION:
      return withLedger(state, event, { status: 'awaiting_confirmation', last_error: null })

    case LUNA_OPERATION_EVENTS.CONFIRM_OPERATION:
      if (state.status === 'confirmed') {
        return withLedger(state, event, {
          metadata: { ...state.metadata, duplicate_confirmation_ignored: true },
        }, { changed: false })
      }
      if (state.status !== 'awaiting_confirmation') {
        throw new LunaError(LUNA_ERROR_CODES.INVALID_STATE_TRANSITION, 'Operation is not ready for confirmation.', {
          recoverable: true,
          userActionRequired: true,
          details: { status: state.status },
        })
      }
      return withLedger(state, event, {
      status: 'confirming',
      last_error: null,
      metadata: {
        ...state.metadata,
        confirmation: {
          ...(state.metadata.confirmation || {}),
          idempotency_key: text(event.payload.idempotency_key, 240) || null,
          commit_ambiguous: false,
        },
      },
    })

    case LUNA_OPERATION_EVENTS.CONFIRM_AMBIGUOUS:
    return withLedger(state, event, {
      status: 'confirming',
      last_error: event.payload.error || {
        code: LUNA_ERROR_CODES.COMMIT_RESULT_AMBIGUOUS,
        recoverable: true,
      },
      metadata: {
        ...state.metadata,
        confirmation: {
          ...(state.metadata.confirmation || {}),
          idempotency_key: text(event.payload.idempotency_key, 240)
            || state.metadata.confirmation?.idempotency_key
            || null,
          classification: text(event.payload.classification, 120)
            || LUNA_ERROR_CODES.COMMIT_RESULT_AMBIGUOUS,
          commit_ambiguous: true,
        },
      },
    })
  case LUNA_OPERATION_EVENTS.CONFIRM_SUCCEEDED: {
      const persistence = {
        ...state.persistence,
        sale_id: text(event.payload.sale_id, 160) || state.persistence.sale_id || null,
        order_id: text(event.payload.order_id, 160) || state.persistence.order_id || null,
        appointment_id: text(event.payload.appointment_id, 160) || state.persistence.appointment_id || null,
        commit_id: text(event.payload.commit_id, 160) || state.persistence.commit_id || null,
      }
      const hasPrimaryId = state.type === 'product_order'
        ? Boolean(persistence.sale_id || persistence.order_id)
        : Boolean(persistence.appointment_id && (persistence.sale_id || persistence.order_id))
      if (!hasPrimaryId) {
        throw new LunaError(LUNA_ERROR_CODES.PERSISTENCE_PARTIAL_FAILURE, 'Confirmation succeeded without the required persistence ids.', {
          recoverable: false,
          details: { operation_type: state.type, persistence },
        })
      }
      return withLedger(state, event, {
      status: 'confirmed',
      persistence,
      last_error: null,
      metadata: {
        ...state.metadata,
        ...(state.metadata.bath ? {
          bath: { ...state.metadata.bath, pending_order_active: false },
        } : {}),
        confirmation: {
          ...(state.metadata.confirmation || {}),
          idempotency_key: text(event.payload.idempotency_key, 240)
            || state.metadata.confirmation?.idempotency_key
            || null,
          classification: text(event.payload.classification, 120) || null,
          reconciled: event.payload.reconciled === true,
          commit_ambiguous: false,
        },
      },
    })
    }

    case LUNA_OPERATION_EVENTS.CONFIRM_FAILED:
    return withLedger(state, event, {
      status: event.payload.recoverable === false ? 'failed' : 'awaiting_confirmation',
      last_error: event.payload.error || {
        code: LUNA_ERROR_CODES.TOOL_FAILED,
        recoverable: event.payload.recoverable !== false,
      },
      metadata: {
        ...state.metadata,
        confirmation: {
          ...(state.metadata.confirmation || {}),
          classification: text(event.payload.classification, 120)
            || text(event.payload.error?.code, 120)
            || null,
          commit_ambiguous: false,
        },
      },
    })
  case LUNA_OPERATION_EVENTS.CANCEL_OPERATION:
      return withLedger(state, event, { status: 'cancelled', last_error: null })

    case LUNA_OPERATION_EVENTS.REQUEST_HUMAN:
      return withLedger(state, event, {
        status: 'human_handoff',
        metadata: { ...state.metadata, handoff_target: text(event.payload.target, 120) || null },
      })

    case LUNA_OPERATION_EVENTS.RESET_FAILURE:
      if (state.status !== 'failed') {
        throw new LunaError(LUNA_ERROR_CODES.INVALID_STATE_TRANSITION, 'Only failed operations can be reset.', {
          recoverable: false,
          details: { status: state.status },
        })
      }
      return withLedger(state, event, { status: 'collecting_data', last_error: null })

    default:
      return state
  }
}
