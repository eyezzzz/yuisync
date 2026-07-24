import assert from 'node:assert/strict'
import test from 'node:test'

import { runOperationScenario } from '../../server/lib/luna/index.js'

test('scenario runner valida resultado parcial e erro esperado', () => {
  const success = runOperationScenario({
    name: 'simple_note',
    initial_state: { type: 'service_booking', status: 'awaiting_confirmation' },
    events: [{ type: 'ADD_NOTE', payload: { text: 'sem perfume' } }],
    expected: { status: 'awaiting_confirmation', notes: [{ text: 'sem perfume' }] },
  })
  assert.equal(success.ok, true)

  const expectedError = runOperationScenario({
    name: 'wrong_kind',
    initial_state: { type: 'service_booking', status: 'awaiting_confirmation' },
    events: [{ type: 'ADD_ITEM', payload: { id: 'product_1', kind: 'product' } }],
    expected_error: 'CATALOG_TYPE_MISMATCH',
  })
  assert.equal(expectedError.ok, true)
})
