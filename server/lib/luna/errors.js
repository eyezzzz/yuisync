export const LUNA_ERROR_CODES = Object.freeze({
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  INVALID_OPERATION_STATE: 'INVALID_OPERATION_STATE',
  CATALOG_TYPE_MISMATCH: 'CATALOG_TYPE_MISMATCH',
  CATALOG_ITEM_NOT_FOUND: 'CATALOG_ITEM_NOT_FOUND',
  SLOT_UNAVAILABLE: 'SLOT_UNAVAILABLE',
  SLOT_OUTSIDE_BOOKING_HOURS: 'SLOT_OUTSIDE_BOOKING_HOURS',
  STALE_OPERATION_VERSION: 'STALE_OPERATION_VERSION',
  DUPLICATE_OPERATION_EVENT: 'DUPLICATE_OPERATION_EVENT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  TOTAL_MISMATCH: 'TOTAL_MISMATCH',
  PERSISTENCE_PARTIAL_FAILURE: 'PERSISTENCE_PARTIAL_FAILURE',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  SLOT_BECAME_UNAVAILABLE: 'SLOT_BECAME_UNAVAILABLE',
  COMMERCIAL_CONTRACT_CHANGED: 'COMMERCIAL_CONTRACT_CHANGED',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  COMMIT_RESULT_AMBIGUOUS: 'COMMIT_RESULT_AMBIGUOUS',
  ALREADY_CONFIRMED: 'ALREADY_CONFIRMED',
  TOOL_NOT_REGISTERED: 'TOOL_NOT_REGISTERED',
  TOOL_INPUT_INVALID: 'TOOL_INPUT_INVALID',
  TOOL_OUTPUT_INVALID: 'TOOL_OUTPUT_INVALID',
  TOOL_GUARDRAIL_BLOCKED: 'TOOL_GUARDRAIL_BLOCKED',
  TOOL_TIMEOUT: 'TOOL_TIMEOUT',
  TOOL_FAILED: 'TOOL_FAILED',
  RUNTIME_BUDGET_EXCEEDED: 'RUNTIME_BUDGET_EXCEEDED',
  HUMAN_HANDOFF_REQUIRED: 'HUMAN_HANDOFF_REQUIRED',
})

export class LunaError extends Error {
  constructor(code, message, options = {}) {
    super(message)
    this.name = 'LunaError'
    this.code = code || LUNA_ERROR_CODES.TOOL_FAILED
    this.recoverable = options.recoverable !== false
    this.retryable = Boolean(options.retryable)
    this.userActionRequired = Boolean(options.userActionRequired)
    this.requiresHuman = Boolean(options.requiresHuman)
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
      requires_human: this.requiresHuman,
      details: this.details,
    }
  }
}

export class ToolValidationError extends LunaError {
  constructor(toolName, message, options = {}) {
    const phase = options.phase === 'output' || options.output ? 'output' : 'input'
    super(
      phase === 'output' ? LUNA_ERROR_CODES.TOOL_OUTPUT_INVALID : LUNA_ERROR_CODES.TOOL_INPUT_INVALID,
      message || `Invalid ${phase} for ${toolName || '<unknown>'}.`,
      {
        ...options,
        recoverable: options.recoverable !== false,
        retryable: false,
        userActionRequired: phase === 'input' && options.userActionRequired !== false,
        details: { ...(options.details || {}), tool: toolName || null, phase },
      },
    )
    this.name = 'ToolValidationError'
    this.toolName = toolName || null
    this.phase = phase
  }
}

export class ToolTimeoutError extends LunaError {
  constructor(toolName, timeoutMs, options = {}) {
    super(LUNA_ERROR_CODES.TOOL_TIMEOUT, `Tool ${toolName || '<unknown>'} timed out after ${timeoutMs}ms.`, {
      ...options,
      recoverable: true,
      retryable: true,
      details: { ...(options.details || {}), tool: toolName || null, timeout_ms: timeoutMs },
    })
    this.name = 'ToolTimeoutError'
    this.toolName = toolName || null
  }
}

export class ToolGuardrailError extends LunaError {
  constructor(toolName, message, options = {}) {
    super(LUNA_ERROR_CODES.TOOL_GUARDRAIL_BLOCKED, message || `Tool guardrail blocked ${toolName || '<unknown>'}.`, {
      ...options,
      recoverable: false,
      retryable: false,
      details: { ...(options.details || {}), tool: toolName || null },
    })
    this.name = 'ToolGuardrailError'
    this.toolName = toolName || null
  }
}

export class ToolTransactionError extends LunaError {
  constructor(toolName, message, options = {}) {
    super(options.ambiguous ? LUNA_ERROR_CODES.COMMIT_RESULT_AMBIGUOUS : LUNA_ERROR_CODES.TRANSACTION_FAILED, message, {
      ...options,
      recoverable: options.recoverable !== false,
      retryable: options.ambiguous ? false : Boolean(options.retryable),
      details: { ...(options.details || {}), tool: toolName || null },
    })
    this.name = 'ToolTransactionError'
    this.toolName = toolName || null
  }
}

export class RuntimeBudgetError extends LunaError {
  constructor(limit, options = {}) {
    super(LUNA_ERROR_CODES.RUNTIME_BUDGET_EXCEEDED, `${limit || 'runtime'} budget exceeded.`, {
      ...options,
      recoverable: true,
      retryable: false,
      details: { ...(options.details || {}), limit: limit || null },
    })
    this.name = 'RuntimeBudgetError'
  }
}

export function normalizeLunaError(error, fallbackCode = LUNA_ERROR_CODES.TOOL_FAILED) {
  if (error instanceof LunaError) return error
  const message = error instanceof Error ? error.message : String(error || 'Unknown Luna error')
  const externalCode = String(error?.code || '').toUpperCase()
  if (externalCode === 'ETIMEDOUT' || externalCode === 'ESOCKETTIMEDOUT' || /timed?\s*out|timeout/i.test(message)) {
    return new ToolTimeoutError(error?.toolName || 'external', Number(error?.timeoutMs || 0), { cause: error })
  }
  return new LunaError(fallbackCode, message, {
    recoverable: true,
    retryable: false,
    cause: error instanceof Error ? error : undefined,
  })
}
