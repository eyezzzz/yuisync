import { createOperationState } from '../operationState.js'
import { LUNA_CONFIRMATION_RESULTS } from './confirmationEvents.js'

function text(value = '') {
  return String(value ?? '').trim()
}

export function verifyConfirmationRequest({
  state: stateInput = {},
  pendingOrder = null,
  explicitConfirmation = false,
  idempotencyKey = '',
} = {}) {
  const state = createOperationState(stateInput)

  if (state.status === 'confirmed') {
    return {
      ok: false,
      alreadyConfirmed: true,
      classification: LUNA_CONFIRMATION_RESULTS.ALREADY_CONFIRMED,
      reason: 'operation_already_confirmed',
      state,
    }
  }

  if (!explicitConfirmation) {
    return {
      ok: false,
      classification: LUNA_CONFIRMATION_RESULTS.VALIDATION_FAILED,
      reason: 'explicit_confirmation_required',
      state,
    }
  }

  if (!pendingOrder?.id || !pendingOrder?.order) {
    return {
      ok: false,
      classification: LUNA_CONFIRMATION_RESULTS.VALIDATION_FAILED,
      reason: 'pending_order_required',
      state,
    }
  }

  if (state.status !== 'awaiting_confirmation') {
    return {
      ok: false,
      classification: LUNA_CONFIRMATION_RESULTS.VALIDATION_FAILED,
      reason: 'operation_not_awaiting_confirmation',
      details: { status: state.status },
      state,
    }
  }

  if (state.operation_id && text(state.operation_id) !== text(pendingOrder.id)) {
    return {
      ok: false,
      classification: LUNA_CONFIRMATION_RESULTS.VALIDATION_FAILED,
      reason: 'pending_order_operation_mismatch',
      state,
    }
  }

  if (state.required_fields.length) {
    return {
      ok: false,
      classification: LUNA_CONFIRMATION_RESULTS.VALIDATION_FAILED,
      reason: 'operation_has_missing_required_fields',
      details: { required_fields: state.required_fields },
      state,
    }
  }

  if (!text(idempotencyKey)) {
    return {
      ok: false,
      classification: LUNA_CONFIRMATION_RESULTS.VALIDATION_FAILED,
      reason: 'idempotency_key_required',
      state,
    }
  }

  return { ok: true, state }
}
