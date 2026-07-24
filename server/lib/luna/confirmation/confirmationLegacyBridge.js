import { LUNA_OPERATION_EVENTS, createOperationEvent } from '../operationEvents.js'
import { reduceOperation } from '../operationReducer.js'
import { createOperationState } from '../operationState.js'
import { LUNA_CONFIRMATION_RESULTS } from './confirmationEvents.js'
import {
  classifyConfirmationValidationFailure,
  requiredPersistenceIdsPresent,
} from './confirmationPolicy.js'
import {
  normalizeCommittedConfirmationResult,
  reconcileConfirmationResult,
} from './confirmationReconciler.js'
import { verifyConfirmationRequest } from './confirmationVerifier.js'

function text(value = '') {
  return String(value ?? '').trim()
}

function confirmationMetadata(state = {}) {
  return state?.metadata?.confirmation || {}
}

function persistedResultFromState(state = {}) {
  return normalizeCommittedConfirmationResult({
    ...state.persistence,
    duplicated: true,
  })
}

function successState(state, result, {
  classification = null,
  reconciled = false,
  idempotencyKey = '',
} = {}) {
  return reduceOperation(state, createOperationEvent(
    LUNA_OPERATION_EVENTS.CONFIRM_SUCCEEDED,
    {
      ...result,
      classification,
      reconciled,
      idempotency_key: idempotencyKey || null,
    },
    { source: 'luna_confirmation_legacy_bridge' },
  ))
}

function failedState(state, classification, reason, recoverable = true) {
  return reduceOperation(state, createOperationEvent(
    LUNA_OPERATION_EVENTS.CONFIRM_FAILED,
    {
      recoverable,
      classification,
      error: {
        code: classification,
        recoverable,
        details: { reason: text(reason) || null },
      },
    },
    { source: 'luna_confirmation_legacy_bridge' },
  ))
}

function ambiguousState(state, idempotencyKey, reason) {
  return reduceOperation(state, createOperationEvent(
    LUNA_OPERATION_EVENTS.CONFIRM_AMBIGUOUS,
    {
      idempotency_key: idempotencyKey,
      classification: LUNA_CONFIRMATION_RESULTS.COMMIT_RESULT_AMBIGUOUS,
      error: {
        code: LUNA_CONFIRMATION_RESULTS.COMMIT_RESULT_AMBIGUOUS,
        recoverable: true,
        details: { reason: text(reason) || null },
      },
    },
    { source: 'luna_confirmation_legacy_bridge' },
  ))
}

async function reconcileOrKeepAmbiguous({
  state,
  pendingOrder,
  idempotencyKey,
  reconcile,
} = {}) {
  const reconciled = await reconcileConfirmationResult({
    lookup: reconcile,
    idempotencyKey,
    state,
  })

  if (reconciled.found) {
    return {
      ok: true,
      status: 'already_committed',
      classification: LUNA_CONFIRMATION_RESULTS.ALREADY_CONFIRMED,
      state: successState(state, reconciled.result, {
        classification: LUNA_CONFIRMATION_RESULTS.ALREADY_CONFIRMED,
        reconciled: true,
        idempotencyKey,
      }),
      pendingOrder: null,
      orderResult: reconciled.result,
      reconciled: true,
    }
  }

  return {
    ok: false,
    status: 'commit_ambiguous',
    classification: LUNA_CONFIRMATION_RESULTS.COMMIT_RESULT_AMBIGUOUS,
    reason: 'commit_result_still_ambiguous',
    state,
    pendingOrder,
    orderResult: null,
    reconciled: false,
  }
}

/**
 * Gives the Luna kernel authority to start a confirmation without duplicating
 * catalog, agenda or RPC logic. The already validated legacy path remains the
 * sole operational executor.
 */
export async function beginLegacyBackedConfirmation({
  state: stateInput = {},
  pendingOrder = null,
  explicitConfirmation = false,
  idempotencyKey = '',
  reconcile,
} = {}) {
  let state = createOperationState(stateInput)

  if (state.status === 'confirmed') {
    return {
      ok: true,
      authorized: false,
      status: 'already_committed',
      classification: LUNA_CONFIRMATION_RESULTS.ALREADY_CONFIRMED,
      state,
      pendingOrder: null,
      orderResult: persistedResultFromState(state),
      reconciled: false,
    }
  }

  const metadata = confirmationMetadata(state)
  if (state.status === 'confirming' && metadata.commit_ambiguous === true) {
    return reconcileOrKeepAmbiguous({
      state,
      pendingOrder,
      idempotencyKey: text(metadata.idempotency_key) || idempotencyKey,
      reconcile,
    })
  }

  const verification = verifyConfirmationRequest({
    state,
    pendingOrder,
    explicitConfirmation,
    idempotencyKey,
  })

  if (!verification.ok) {
    return {
      ok: false,
      authorized: false,
      status: verification.alreadyConfirmed ? 'already_committed' : 'validation_failed',
      classification: verification.classification,
      reason: verification.reason,
      state,
      pendingOrder,
      orderResult: verification.alreadyConfirmed ? persistedResultFromState(state) : null,
    }
  }

  state = reduceOperation(state, createOperationEvent(
    LUNA_OPERATION_EVENTS.CONFIRM_OPERATION,
    { idempotency_key: idempotencyKey },
    { source: 'luna_confirmation_legacy_bridge' },
  ))

  return {
    ok: true,
    authorized: true,
    status: 'authorized',
    classification: null,
    state,
    pendingOrder,
    orderResult: null,
  }
}

function pendingOrderFromLegacyResult(pendingOrder, legacyResult = {}) {
  if (!legacyResult?.order) return pendingOrder
  return {
    ...(pendingOrder || {}),
    id: text(legacyResult.pending_order_id) || pendingOrder?.id || null,
    order: legacyResult.order,
    summary: text(legacyResult.summary) || pendingOrder?.summary || '',
    confirmation_fingerprint: text(legacyResult.confirmation_fingerprint)
      || pendingOrder?.confirmation_fingerprint
      || null,
    prepared_at: new Date().toISOString(),
  }
}

function changedClassification(legacyResult = {}) {
  const reason = text(
    legacyResult?.reason
      || legacyResult?.error
      || (Array.isArray(legacyResult?.missing_fields)
        ? legacyResult.missing_fields.join(' ')
        : ''),
  ).toLowerCase()

  if (/slot|horario|horário|agenda|indisponivel|indisponível|ocupado/.test(reason)) {
    return LUNA_CONFIRMATION_RESULTS.SLOT_BECAME_UNAVAILABLE
  }
  return LUNA_CONFIRMATION_RESULTS.COMMERCIAL_CONTRACT_CHANGED
}

/**
 * Records the result produced by the established legacy confirmation path.
 * It deliberately does not rebuild or compare an order: that validation has
 * already happened once, immediately before the same transactional RPC.
 */
export async function completeLegacyBackedConfirmation({
  state: stateInput = {},
  pendingOrder = null,
  legacyResult = {},
  legacyStatus = '',
  idempotencyKey = '',
  reconcile,
} = {}) {
  const state = createOperationState(stateInput)
  const status = text(legacyStatus || legacyResult?.status)

  if (['committed', 'already_committed'].includes(status)) {
    let committed = normalizeCommittedConfirmationResult(legacyResult)

    if (!requiredPersistenceIdsPresent(state.type, committed)) {
      const reconciled = await reconcileConfirmationResult({
        lookup: reconcile,
        idempotencyKey,
        state,
      })
      if (reconciled.found) committed = reconciled.result
      else {
        return {
          ok: false,
          status: 'commit_ambiguous',
          classification: LUNA_CONFIRMATION_RESULTS.COMMIT_RESULT_AMBIGUOUS,
          reason: 'persistence_ids_missing',
          state: ambiguousState(state, idempotencyKey, 'persistence_ids_missing'),
          pendingOrder,
          orderResult: null,
        }
      }
    }

    const duplicated = status === 'already_committed' || committed.duplicated
    return {
      ok: true,
      status: duplicated ? 'already_committed' : 'committed',
      classification: duplicated ? LUNA_CONFIRMATION_RESULTS.ALREADY_CONFIRMED : null,
      state: successState(state, committed, {
        classification: duplicated ? LUNA_CONFIRMATION_RESULTS.ALREADY_CONFIRMED : null,
        idempotencyKey,
      }),
      pendingOrder: null,
      orderResult: committed,
      reconciled: false,
    }
  }

  if (status === 'commit_ambiguous') {
    const nextState = ambiguousState(
      state,
      idempotencyKey,
      legacyResult?.reason || legacyResult?.error || 'legacy_commit_ambiguous',
    )
    return reconcileOrKeepAmbiguous({
      state: nextState,
      pendingOrder,
      idempotencyKey,
      reconcile,
    })
  }

  if (status === 'changed' || legacyResult?.changed === true) {
    const classification = changedClassification(legacyResult)
    const reason = text(legacyResult?.reason) || 'legacy_confirmation_changed'
    return {
      ok: false,
      status: 'changed',
      classification,
      reason,
      summary: text(legacyResult?.summary),
      state: failedState(state, classification, reason),
      pendingOrder: pendingOrderFromLegacyResult(pendingOrder, legacyResult),
      orderResult: null,
    }
  }

  const validationClassification = classifyConfirmationValidationFailure(legacyResult)
  const validationFailure = status === 'validation_failed'
    || validationClassification === LUNA_CONFIRMATION_RESULTS.SLOT_BECAME_UNAVAILABLE
    || validationClassification === LUNA_CONFIRMATION_RESULTS.VALIDATION_FAILED
  const classification = validationFailure
    ? validationClassification
    : LUNA_CONFIRMATION_RESULTS.TRANSACTION_FAILED
  const normalizedStatus = classification === LUNA_CONFIRMATION_RESULTS.SLOT_BECAME_UNAVAILABLE
    ? 'changed'
    : validationFailure
      ? 'validation_failed'
      : 'transaction_failed'
  const reason = text(legacyResult?.reason || legacyResult?.error || status)
    || 'legacy_confirmation_failed'

  return {
    ok: false,
    status: normalizedStatus,
    classification,
    reason,
    summary: text(legacyResult?.summary),
    state: failedState(state, classification, reason),
    pendingOrder: pendingOrderFromLegacyResult(pendingOrder, legacyResult),
    orderResult: null,
  }
}
