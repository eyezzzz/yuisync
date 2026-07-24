import { LUNA_ERROR_CODES, normalizeLunaError } from '../errors.js'

const RECOVERY_BY_CODE = Object.freeze({
  [LUNA_ERROR_CODES.SLOT_UNAVAILABLE]: { action: 'refresh_schedule', retry: false, userActionRequired: true },
  [LUNA_ERROR_CODES.SLOT_BECAME_UNAVAILABLE]: { action: 'refresh_schedule', retry: false, userActionRequired: true },
  [LUNA_ERROR_CODES.COMMERCIAL_CONTRACT_CHANGED]: { action: 'present_new_summary', retry: false, userActionRequired: true },
  [LUNA_ERROR_CODES.COMMIT_RESULT_AMBIGUOUS]: { action: 'reconcile_commit', retry: false, userActionRequired: false },
  [LUNA_ERROR_CODES.TOOL_TIMEOUT]: { action: 'retry_safely', retry: true, userActionRequired: false },
  [LUNA_ERROR_CODES.TOOL_INPUT_INVALID]: { action: 'request_missing_data', retry: false, userActionRequired: true },
  [LUNA_ERROR_CODES.MISSING_REQUIRED_FIELD]: { action: 'request_missing_data', retry: false, userActionRequired: true },
  [LUNA_ERROR_CODES.RUNTIME_BUDGET_EXCEEDED]: { action: 'handoff', retry: false, userActionRequired: false, requiresHuman: true },
  [LUNA_ERROR_CODES.HUMAN_HANDOFF_REQUIRED]: { action: 'handoff', retry: false, userActionRequired: false, requiresHuman: true },
  [LUNA_ERROR_CODES.TRANSACTION_FAILED]: { action: 'retry_safely', retry: true, userActionRequired: false },
  [LUNA_ERROR_CODES.VALIDATION_FAILED]: { action: 'request_missing_data', retry: false, userActionRequired: true },
})

export function buildRuntimeRecoveryDecision(errorInput) {
  const error = normalizeLunaError(errorInput)
  const policy = RECOVERY_BY_CODE[error.code] || {
    action: error.requiresHuman ? 'handoff' : (error.retryable ? 'retry_safely' : 'preserve_state'),
    retry: Boolean(error.retryable),
    userActionRequired: Boolean(error.userActionRequired),
    requiresHuman: Boolean(error.requiresHuman),
  }
  return {
    error: error.toJSON(),
    action: policy.action,
    retry: policy.retry,
    user_action_required: policy.userActionRequired,
    requires_human: policy.requiresHuman || false,
    preserve_operation: !['cancel', 'discard'].includes(policy.action),
  }
}
