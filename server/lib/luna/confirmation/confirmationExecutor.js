import { LUNA_OPERATION_EVENTS, createOperationEvent } from '../operationEvents.js'
import { reduceOperation } from '../operationReducer.js'
import { createOperationState } from '../operationState.js'
import { LUNA_CONFIRMATION_RESULTS } from './confirmationEvents.js'
import {
  classifyConfirmationContractChange,
  classifyConfirmationValidationFailure,
  confirmationContractsEqual,
  isCommitResultAmbiguous,
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

function successState(state, result, metadata = {}) {
  return reduceOperation(state, createOperationEvent(
    LUNA_OPERATION_EVENTS.CONFIRM_SUCCEEDED,
    {
      ...result,
      classification: metadata.classification || null,
      reconciled: Boolean(metadata.reconciled),
      idempotency_key: metadata.idempotencyKey || null,
    },
    { source: 'luna_confirmation_kernel' },
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
    { source: 'luna_confirmation_kernel' },
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
    { source: 'luna_confirmation_kernel' },
  ))
}

function persistedResultFromState(state) {
  return normalizeCommittedConfirmationResult({
    ...state.persistence,
    duplicated: true,
  })
}

async function reconcileOrKeepAmbiguous({ state, pendingOrder, idempotencyKey, reconcile }) {
  const reconciled = await reconcileConfirmationResult({
    lookup: reconcile,
    idempotencyKey,
    state,
  })

  if (reconciled.found) {
    const nextState = successState(state, reconciled.result, {
      classification: LUNA_CONFIRMATION_RESULTS.ALREADY_CONFIRMED,
      reconciled: true,
      idempotencyKey,
    })
    return {
      ok: true,
      status: 'already_committed',
      classification: LUNA_CONFIRMATION_RESULTS.ALREADY_CONFIRMED,
      state: nextState,
      pendingOrder: null,
      orderResult: reconciled.result,
      reconciled: true,
    }
  }

  return {
    ok: false,
    status: 'commit_ambiguous',
    classification: LUNA_CONFIRMATION_RESULTS.COMMIT_RESULT_AMBIGUOUS,
    state,
    pendingOrder,
    orderResult: null,
    reconciled: false,
  }
}

export async function executeLunaConfirmation({
  state: stateInput = {},
  pendingOrder = null,
  explicitConfirmation = false,
  idempotencyKey = '',
  fingerprint,
  revalidate,
  commit,
  reconcile,
} = {}) {
  let state = createOperationState(stateInput)

  if (state.status === 'confirmed') {
    return {
      ok: true,
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
    { source: 'luna_confirmation_kernel' },
  ))

  let refreshed
  try {
    refreshed = await revalidate({ pendingOrder, state, idempotencyKey })
  } catch (error) {
    const classification = classifyConfirmationValidationFailure(error)
    return {
      ok: false,
      status: 'validation_failed',
      classification,
      reason: error?.message || String(error),
      state: failedState(state, classification, error?.message || error),
      pendingOrder,
      orderResult: null,
    }
  }

  if (!refreshed?.ok || !refreshed?.order) {
    const classification = classifyConfirmationValidationFailure(refreshed)
    return {
      ok: false,
      status: classification === LUNA_CONFIRMATION_RESULTS.SLOT_BECAME_UNAVAILABLE
        ? 'changed'
        : 'validation_failed',
      classification,
      reason: refreshed?.reason || 'revalidation_failed',
      summary: refreshed?.summary || '',
      state: failedState(state, classification, refreshed?.reason),
      pendingOrder: refreshed?.pendingOrder || pendingOrder,
      orderResult: null,
    }
  }

  const expectedFingerprint = typeof fingerprint === 'function'
    ? fingerprint(pendingOrder.order)
    : JSON.stringify(pendingOrder.order)
  const refreshedFingerprint = typeof fingerprint === 'function'
    ? fingerprint(refreshed.order)
    : JSON.stringify(refreshed.order)

  if (!confirmationContractsEqual(pendingOrder.order, refreshed.order)) {
    const classification = classifyConfirmationContractChange(
      pendingOrder.order,
      refreshed.order,
    )
    const nextPendingOrder = refreshed.pendingOrder || {
      ...pendingOrder,
      order: refreshed.order,
      summary: refreshed.summary || pendingOrder.summary || '',
      confirmation_fingerprint: refreshedFingerprint,
    }
    return {
      ok: false,
      status: 'changed',
      classification,
      reason: 'confirmation_contract_changed',
      summary: refreshed.summary || '',
      state: failedState(state, classification, 'confirmation_contract_changed'),
      pendingOrder: nextPendingOrder,
      orderResult: null,
    }
  }

  let committed
  try {
    committed = normalizeCommittedConfirmationResult(await commit({
      order: refreshed.order,
      pendingOrder,
      state,
      idempotencyKey,
    }))
  } catch (error) {
    if (!isCommitResultAmbiguous(error)) {
      return {
        ok: false,
        status: 'transaction_failed',
        classification: LUNA_CONFIRMATION_RESULTS.TRANSACTION_FAILED,
        reason: error?.message || String(error),
        state: failedState(
          state,
          LUNA_CONFIRMATION_RESULTS.TRANSACTION_FAILED,
          error?.message || error,
        ),
        pendingOrder,
        orderResult: null,
      }
    }

    const reconciled = await reconcileConfirmationResult({
      lookup: reconcile,
      idempotencyKey,
      state,
    })
    if (reconciled.found) {
      const nextState = successState(state, reconciled.result, {
        classification: LUNA_CONFIRMATION_RESULTS.ALREADY_CONFIRMED,
        reconciled: true,
        idempotencyKey,
      })
      return {
        ok: true,
        status: 'already_committed',
        classification: LUNA_CONFIRMATION_RESULTS.ALREADY_CONFIRMED,
        state: nextState,
        pendingOrder: null,
        orderResult: reconciled.result,
        reconciled: true,
      }
    }

    const nextState = ambiguousState(state, idempotencyKey, error?.message || error)
    return {
      ok: false,
      status: 'commit_ambiguous',
      classification: LUNA_CONFIRMATION_RESULTS.COMMIT_RESULT_AMBIGUOUS,
      reason: error?.message || String(error),
      state: nextState,
      pendingOrder,
      orderResult: null,
      reconciled: false,
    }
  }

  if (!requiredPersistenceIdsPresent(state.type, committed)) {
    const reconciled = await reconcileConfirmationResult({
      lookup: reconcile,
      idempotencyKey,
      state,
    })
    if (reconciled.found) committed = reconciled.result
    else {
      const nextState = ambiguousState(state, idempotencyKey, 'persistence_ids_missing')
      return {
        ok: false,
        status: 'commit_ambiguous',
        classification: LUNA_CONFIRMATION_RESULTS.COMMIT_RESULT_AMBIGUOUS,
        reason: 'persistence_ids_missing',
        state: nextState,
        pendingOrder,
        orderResult: null,
      }
    }
  }

  const nextState = successState(state, committed, {
    idempotencyKey,
    classification: committed.duplicated
      ? LUNA_CONFIRMATION_RESULTS.ALREADY_CONFIRMED
      : null,
  })

  return {
    ok: true,
    status: committed.duplicated ? 'already_committed' : 'committed',
    classification: committed.duplicated
      ? LUNA_CONFIRMATION_RESULTS.ALREADY_CONFIRMED
      : null,
    state: nextState,
    pendingOrder: null,
    orderResult: committed,
    reconciled: false,
  }
}
