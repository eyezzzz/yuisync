import assert from 'node:assert/strict'
import test from 'node:test'

import {
  completeLunaTurnTrace,
  createLunaTurnTrace,
} from '../../server/lib/luna/index.js'

test('trace usa identificadores únicos e não persiste a mensagem em texto puro', () => {
  const state = { operation_id: 'op_1', type: 'service_booking', status: 'awaiting_confirmation' }
  const first = createLunaTurnTrace({
    sessionId: 'session_1',
    tenantId: 'tenant_1',
    message: 'sim, confirmo',
    stateBefore: state,
    clock: () => new Date('2026-07-24T12:00:00.000Z'),
  })
  const second = createLunaTurnTrace({
    sessionId: 'session_1',
    tenantId: 'tenant_1',
    message: 'sim, confirmo',
    stateBefore: state,
    clock: () => new Date('2026-07-24T12:00:00.000Z'),
  })

  assert.notEqual(first.trace_id, second.trace_id)
  assert.notEqual(first.turn_id, second.turn_id)
  assert.equal(first.message.length, 13)
  assert.equal(typeof first.message.fingerprint, 'string')
  assert.doesNotMatch(JSON.stringify(first), /sim, confirmo/)
})

test('trace final registra transição, ferramentas e verificador', () => {
  const start = createLunaTurnTrace({
    stateBefore: { type: 'service_booking', status: 'awaiting_confirmation', version: 4 },
    clock: () => new Date('2026-07-24T12:00:00.000Z'),
  })
  const finished = completeLunaTurnTrace(start, {
    stateAfter: { type: 'service_booking', status: 'confirmed', version: 6 },
    semanticEvent: 'CONFIRM_SUCCEEDED',
    toolRuns: [{ name: 'confirm_service_booking', ok: true, duration_ms: 80 }],
    verifier: { ok: true, severity: 'ok', issues: [] },
    outcome: 'saved',
    clock: () => new Date('2026-07-24T12:00:00.125Z'),
  })

  assert.equal(finished.duration_ms, 125)
  assert.equal(finished.state_after.status, 'confirmed')
  assert.equal(finished.semantic_event, 'CONFIRM_SUCCEEDED')
  assert.deepEqual(finished.tools, [{ name: 'confirm_service_booking', ok: true, status: null, duration_ms: 80 }])
})
