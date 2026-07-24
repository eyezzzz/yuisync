import assert from 'node:assert/strict'
import test from 'node:test'

import { verifyOperationTurn, verifyToolResult } from '../../server/lib/luna/index.js'

test('verificador detecta resposta de confirmação sem persistência', () => {
  const result = verifyOperationTurn({
    stateBefore: { type: 'service_booking', status: 'awaiting_confirmation' },
    stateAfter: { type: 'service_booking', status: 'awaiting_confirmation' },
    reply: 'Pronto! O agendamento foi confirmado.',
    orderResult: null,
  })

  assert.equal(result.ok, false)
  assert.equal(result.severity, 'error')
  assert.ok(result.issues.some((entry) => entry.code === 'PERSISTENCE_PARTIAL_FAILURE'))
})

test('verificador aprova confirmação respaldada por ids persistidos', () => {
  const result = verifyOperationTurn({
    stateBefore: { type: 'service_booking', status: 'confirming' },
    stateAfter: {
      type: 'service_booking',
      status: 'confirmed',
      persistence: { sale_id: 'sale_1', order_id: 'order_1', appointment_id: 'appointment_1' },
    },
    orderResult: { sale_id: 'sale_1', order_id: 'order_1', appointment_id: 'appointment_1' },
    reply: 'Pronto! O agendamento foi confirmado.',
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.issues, [])
})


test('verificador retorna semântica operacional para cada ferramenta', () => {
  const success = verifyToolResult({
    schema_version: 1,
    tool_name: 'confirm_operation',
    ok: true,
    status: 'committed',
    requires_confirmation: true,
    result: { sale_id: 'sale_1', order_id: 'order_1', appointment_id: 'appointment_1' },
  })

  assert.deepEqual({
    tool_succeeded: success.tool_succeeded,
    state_changed: success.state_changed,
    goal_progressed: success.goal_progressed,
    result_consistent: success.result_consistent,
    requires_retry: success.requires_retry,
    requires_human: success.requires_human,
  }, {
    tool_succeeded: true,
    state_changed: true,
    goal_progressed: true,
    result_consistent: true,
    requires_retry: false,
    requires_human: false,
  })

  const timeout = verifyToolResult({
    schema_version: 1,
    tool_name: 'get_day_schedule',
    ok: false,
    status: 'failed',
    error_code: 'TOOL_TIMEOUT',
    error: { code: 'TOOL_TIMEOUT', retryable: true },
  })

  assert.equal(timeout.tool_succeeded, false)
  assert.equal(timeout.result_consistent, true)
  assert.equal(timeout.requires_retry, true)
  assert.equal(timeout.requires_human, false)
})
