import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LUNA_ERROR_CODES,
  RuntimeBudgetError,
  ToolGuardrailError,
  ToolTimeoutError,
  ToolValidationError,
  normalizeLunaError,
} from '../../server/lib/luna/index.js'

test('erros tipados preservam fase, ferramenta e política de recuperação', () => {
  const input = new ToolValidationError('prepare_petshop_service_booking', 'invalid', { phase: 'input' })
  assert.equal(input.code, LUNA_ERROR_CODES.TOOL_INPUT_INVALID)
  assert.equal(input.toolName, 'prepare_petshop_service_booking')
  assert.equal(input.retryable, false)

  const timeout = new ToolTimeoutError('check_petshop_availability', 30000)
  assert.equal(timeout.code, LUNA_ERROR_CODES.TOOL_TIMEOUT)
  assert.equal(timeout.retryable, true)
  assert.equal(timeout.details.timeout_ms, 30000)

  const guardrail = new ToolGuardrailError('unknown', 'blocked')
  assert.equal(guardrail.recoverable, false)

  const budget = new RuntimeBudgetError('limit')
  assert.equal(budget.code, LUNA_ERROR_CODES.RUNTIME_BUDGET_EXCEEDED)
})

test('normalizeLunaError classifica timeout externo sem perder causa', () => {
  const error = Object.assign(new Error('request timed out'), { code: 'ETIMEDOUT' })
  const normalized = normalizeLunaError(error)
  assert.equal(normalized.code, LUNA_ERROR_CODES.TOOL_TIMEOUT)
  assert.equal(normalized.retryable, true)
})
