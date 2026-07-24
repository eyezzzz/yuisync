import assert from 'node:assert/strict'
import test from 'node:test'

import { verifyOperationTurn } from '../../server/lib/luna/index.js'

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
