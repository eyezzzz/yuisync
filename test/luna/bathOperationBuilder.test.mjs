import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LUNA_BATH_EVENTS,
  buildBathOperationState,
  createBathEvent,
} from '../../server/lib/luna/bath/index.js'

test('builder preserva estado resolvido e remove horário rejeitado pela agenda fresca', () => {
  const state = buildBathOperationState({}, [
    createBathEvent(LUNA_BATH_EVENTS.START),
    createBathEvent(LUNA_BATH_EVENTS.SET_PET, {
      name: 'Adalto', species: 'dog', breed: 'Yorkshire Terrier', weight_kg: 4,
    }),
    createBathEvent(LUNA_BATH_EVENTS.SET_SERVICE, {
      id: 'bath-small', code: 'banho_pequeno', name: 'Banho pequeno', unit_price: 55,
    }),
    createBathEvent(LUNA_BATH_EVENTS.SET_SCHEDULE, {
      date: '2026-07-24', time: '14:00', scheduled_at: '2026-07-24T14:00:00-03:00',
    }),
    createBathEvent(LUNA_BATH_EVENTS.REJECT_SCHEDULE, {
      scheduled_at: '2026-07-24T14:00:00-03:00', time: '14:00',
    }),
  ])

  assert.equal(state.pet.name, 'Adalto')
  assert.equal(state.metadata.bath.service_type, 'banho_pequeno')
  assert.equal(state.schedule.time, null)
  assert.equal(state.schedule.scheduled_at, null)
  assert.deepEqual(state.rejected_slots, ['2026-07-24T14:00:00-03:00'])
})

test('pedido de opções e escolha da modalidade são estados diferentes', () => {
  const optionsState = buildBathOperationState({}, [
    createBathEvent(LUNA_BATH_EVENTS.START),
    createBathEvent(LUNA_BATH_EVENTS.REQUEST_TRANSPORT_OPTIONS),
  ])
  assert.equal(optionsState.transport.options_requested, true)
  assert.equal(optionsState.transport.mode, null)

  const selectedState = buildBathOperationState(optionsState, [
    createBathEvent(LUNA_BATH_EVENTS.START),
    createBathEvent(LUNA_BATH_EVENTS.SELECT_TRANSPORT_MODE, {
      mode: 'buscar_e_levar', label: 'Buscar e levar', fee: 20,
    }),
  ])
  assert.equal(selectedState.transport.options_requested, false)
  assert.equal(selectedState.transport.mode, 'buscar_e_levar')
  assert.equal(selectedState.transport.fee, 20)
})
