import assert from 'node:assert/strict'
import test from 'node:test'

import { runBathSemanticPreparation } from '../../server/lib/luna/bath/index.js'

test('kernel prepara banho em vários turnos sem efeitos externos', () => {
  let state = null

  let result = runBathSemanticPreparation({
    previousState: state,
    customer: { name: 'Fernando' },
    facts: {
      pet_name: 'Adalto', species: 'dog', breed: 'Yorkshire Terrier', weight_kg: 4,
      weight_label: '4 kg', service_type: 'banho', service_date: '2026-07-24', service_preferred_time: '16:00',
    },
  })
  state = result.state
  assert.equal(state.pet.name, 'Adalto')
  assert.equal(result.side_effects.agenda_reads, 0)

  result = runBathSemanticPreparation({
    previousState: state,
    customer: { name: 'Fernando' },
    facts: {
      ...result.facts,
      service_transport_options_requested: true,
    },
    turnSemantics: { transport_intent: 'request_options' },
  })
  state = result.state
  assert.equal(state.transport.options_requested, true)
  assert.equal(state.transport.mode, null)

  result = runBathSemanticPreparation({
    previousState: state,
    customer: { name: 'Fernando' },
    facts: {
      ...result.facts,
      service_transport_options_requested: false,
      service_transport_mode: 'buscar_e_levar',
      service_transport_label: 'Buscar e levar',
      service_transport_address: 'Av. dos Andradas, 123',
      service_transport_neighborhood: 'Centro',
      service_transport_city: 'Muriaé',
      service_transport_reference: 'Ao lado da caixa d’água',
      service_transport_address_confirmed: true,
    },
    turnSemantics: { transport_intent: 'select_option' },
  })

  assert.equal(result.state.transport.mode, 'buscar_e_levar')
  assert.equal(result.state.transport.options_requested, false)
  assert.equal(result.state.transport.address.city, 'Muriaé')
  assert.equal(result.facts.service_transport_mode, 'buscar_e_levar')
  assert.equal(result.authority, 'luna_kernel')
})
