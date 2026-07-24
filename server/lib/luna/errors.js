export const LUNA_ERROR_CODES = Object.freeze({
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  INVALID_OPERATION_STATE: 'INVALID_OPERATION_STATE',
  CATALOG_TYPE_MISMATCH: 'CATALOG_TYPE_MISMATCH',
  CATALOG_ITEM_NOT_FOUND: 'CATALOG_ITEM_NOT_FOUND',
  SLOT_UNAVAILABLE: 'SLOT_UNAVAILABLE',
  SLOT_OUTSIDE_BOOKING_HOURS: 'SLOT_OUTSIDE_BOOKING_HOURS',
  STALE_OPERATION_VERSION: 'STALE_OPERATION_VERSION',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  TOTAL_MISMATCH: 'TOTAL_MISMATCH',
  PERSISTENCE_PARTIAL_FAILURE: 'PERSISTENCE_PARTIAL_FAILURE',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  SLOT_BECAME_UNAVAILABLE: 'SLOT_BECAME_UNAVAILABLE',
  COMMERCIAL_CONTRACT_CHANGED: 'COMMERCIAL_CONTRACT_CHANGED',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  COMMIT_RESULT_AMBIGUOUS: 'COMMIT_RESULT_AMBIGUOUS',
  ALREADY_CONFIRMED: 'ALREADY_CONFIRMED',
  TOOL_TIMEOUT: 'TOOL_TIMEOUT',
  TOOL_FAILED: 'TOOL_FAILED',
})

export class LunaError extends Error {
  constructor(code, message, options = {}) {
    super(message)
    this.name = 'LunaError'
    this.code = code || LUNA_ERROR_CODES.TOOL_FAILED
    this.recoverable = options.recoverable !== false
    this.retryable = Boolean(options.retryable)
    this.userActionRequired = Boolean(options.userActionRequired)
    this.details = options.details && typeof options.details === 'object' ? options.details : {}
    if (options.cause) this.cause = options.cause
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      retryable: this.retryable,
      user_action_required: this.userActionRequired,
      details: this.details,
    }
  }
}

export function normalizeLunaError(error, fallbackCode = LUNA_ERROR_CODES.TOOL_FAILED) {
  if (error instanceof LunaError) return error
  const message = error instanceof Error ? error.message : String(error || 'Unknown Luna error')
  return new LunaError(fallbackCode, message, {
    recoverable: true,
    retryable: false,
    cause: error instanceof Error ? error : undefined,
  })
}
