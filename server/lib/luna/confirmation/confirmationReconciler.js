import { requiredPersistenceIdsPresent } from './confirmationPolicy.js'

export function normalizeCommittedConfirmationResult(result = {}) {
  return {
    ...result,
    sale_id: result?.sale_id || null,
    order_id: result?.order_id || null,
    appointment_id: result?.appointment_id || null,
    commit_id: result?.commit_id || result?.order_id || result?.sale_id || null,
    duplicated: Boolean(result?.duplicated),
  }
}

export async function reconcileConfirmationResult({
  lookup,
  idempotencyKey,
  state,
} = {}) {
  if (typeof lookup !== 'function') return { found: false, result: null }

  const result = await lookup({ idempotencyKey, state })
  if (!result || !requiredPersistenceIdsPresent(state?.type, result)) {
    return { found: false, result: null }
  }

  return {
    found: true,
    result: normalizeCommittedConfirmationResult(result),
  }
}
