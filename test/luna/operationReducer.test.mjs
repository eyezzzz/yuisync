import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LUNA_ERROR_CODES,
  LUNA_OPERATION_EVENTS,
  LunaError,
  createOperationState,
  reduceOperation,
} from '../../server/lib/luna/index.js'

test('observação antes da confirmação atualiza o estado sem cancelar a operação', () => {
  const initial = createOperationState({
    operation_id: 'op_note',
    type: 'service_booking',
    status: 'awaiting_confirmation',
    version: 3,
  })

  const next = reduceOperation(initial, {
    type: LUNA_OPERATION_EVENTS.ADD_NOTE,
    payload: { text: 'sem perfume' },
  })

  assert.equal(next.status, 'awaiting_confirmation')
  assert.equal(next.version, 4)
  assert.deepEqual(next.notes, [{ text: 'sem perfume' }])
})

test('horário rejeitado sai do estado e não pode ser selecionado novamente', () => {
  const selected = reduceOperation({
    operation_id: 'op_slot',
    type: 'service_booking',
    status: 'selecting_schedule',
  }, {
    type: LUNA_OPERATION_EVENTS.SELECT_TIME,
    payload: { scheduled_at: '2026-07-26T10:00:00-03:00' },
  })
  const rejected = reduceOperation(selected, {
    type: LUNA_OPERATION_EVENTS.REJECT_TIME,
    payload: { scheduled_at: '2026-07-26T10:00:00-03:00' },
  })

  assert.equal(rejected.status, 'selecting_schedule')
  assert.deepEqual(rejected.schedule, {})
  assert.deepEqual(rejected.rejected_slots, ['2026-07-26T10:00:00-03:00'])
  assert.throws(() => reduceOperation(rejected, {
    type: LUNA_OPERATION_EVENTS.SELECT_TIME,
    payload: { scheduled_at: '2026-07-26T10:00:00-03:00' },
  }), (error) => error instanceof LunaError && error.code === LUNA_ERROR_CODES.SLOT_UNAVAILABLE)
})

test('produto físico não pode entrar em operação de serviço', () => {
  assert.throws(() => reduceOperation({
    operation_id: 'op_catalog',
    type: 'service_booking',
    status: 'awaiting_confirmation',
  }, {
    type: LUNA_OPERATION_EVENTS.ADD_ITEM,
    payload: { id: 'machine_1', kind: 'product', name: 'Máquina de tosa' },
  }), (error) => error instanceof LunaError && error.code === LUNA_ERROR_CODES.CATALOG_TYPE_MISMATCH)
})

test('confirmação só conclui com ids persistidos', () => {
  const confirming = reduceOperation({
    operation_id: 'op_confirm',
    type: 'service_booking',
    status: 'awaiting_confirmation',
  }, { type: LUNA_OPERATION_EVENTS.CONFIRM_OPERATION })

  assert.equal(confirming.status, 'confirming')
  assert.throws(() => reduceOperation(confirming, {
    type: LUNA_OPERATION_EVENTS.CONFIRM_SUCCEEDED,
    payload: { sale_id: 'sale_1' },
  }), (error) => error instanceof LunaError && error.code === LUNA_ERROR_CODES.PERSISTENCE_PARTIAL_FAILURE)

  const confirmed = reduceOperation(confirming, {
    type: LUNA_OPERATION_EVENTS.CONFIRM_SUCCEEDED,
    payload: { sale_id: 'sale_1', order_id: 'order_1', appointment_id: 'appointment_1' },
  })
  assert.equal(confirmed.status, 'confirmed')
  assert.equal(confirmed.persistence.appointment_id, 'appointment_1')
})

test('confirmação repetida é idempotente', () => {
  const initial = createOperationState({
    operation_id: 'op_done',
    type: 'service_booking',
    status: 'confirmed',
    version: 7,
    persistence: { sale_id: 'sale_1', appointment_id: 'appointment_1' },
  })
  const next = reduceOperation(initial, { type: LUNA_OPERATION_EVENTS.CONFIRM_OPERATION })
  assert.equal(next.status, 'confirmed')
  assert.equal(next.version, 7)
  assert.equal(next.metadata.duplicate_confirmation_ignored, true)
})

test('reducer rejeita versão obsoleta antes de aplicar evento', () => {
  assert.throws(() => reduceOperation({
    operation_id: 'op_version',
    type: 'service_booking',
    status: 'awaiting_confirmation',
    version: 4,
  }, {
    type: LUNA_OPERATION_EVENTS.ADD_NOTE,
    payload: { text: 'sem perfume' },
    metadata: { expected_version: 3 },
  }), (error) => error instanceof LunaError && error.code === LUNA_ERROR_CODES.STALE_OPERATION_VERSION)
})

test('reducer ignora repetição do mesmo event_id e mantém ledger auditável', () => {
  const event = {
    type: LUNA_OPERATION_EVENTS.ADD_NOTE,
    payload: { text: 'sem perfume' },
    metadata: { event_id: 'evt_same', trace_id: 'trace_1', source: 'test' },
  }
  const first = reduceOperation({
    operation_id: 'op_event',
    type: 'service_booking',
    status: 'awaiting_confirmation',
  }, event)
  const duplicate = reduceOperation(first, event)

  assert.equal(duplicate.version, 1)
  assert.equal(duplicate.ledger.length, 1)
  assert.deepEqual(duplicate.ledger[0], {
    event_id: 'evt_same',
    event: 'ADD_NOTE',
    previous_version: 0,
    version: 1,
    previous_status: 'awaiting_confirmation',
    next_status: 'awaiting_confirmation',
    changed: true,
    source: 'test',
    trace_id: 'trace_1',
    occurred_at: duplicate.ledger[0].occurred_at,
  })
})
