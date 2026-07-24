import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LUNA_ERROR_CODES,
  TemporaryOperationStore,
} from '../../server/lib/luna/index.js'

test('store temporário aplica compare-and-swap e eventos idempotentes', () => {
  const store = new TemporaryOperationStore()
  const initial = store.create({ operation_id: 'op_1', type: 'service_booking', status: 'awaiting_confirmation' })
  const event = {
    type: 'ADD_NOTE',
    payload: { text: 'sem perfume' },
    metadata: { event_id: 'event_1' },
  }
  const next = store.apply(initial.operation_id, event, { expectedVersion: 0 })
  const duplicate = store.apply(initial.operation_id, event, { expectedVersion: 1 })
  assert.equal(next.version, 1)
  assert.equal(duplicate.version, 1)
  assert.equal(duplicate.ledger.length, 1)
  assert.throws(
    () => store.apply(initial.operation_id, { type: 'ADD_NOTE', payload: { text: 'outro' } }, { expectedVersion: 0 }),
    (error) => error.code === LUNA_ERROR_CODES.STALE_OPERATION_VERSION,
  )
})
