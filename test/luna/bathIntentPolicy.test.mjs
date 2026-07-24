import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LUNA_BATH_EVENTS,
  deriveBathEvents,
} from '../../server/lib/luna/bath/index.js'

test('política de banho transforma fatos estruturados em eventos sem selecionar transporte por pergunta', () => {
  const events = deriveBathEvents({
    facts: {
      pet_name: 'Adalto',
      species: 'dog',
      breed: 'Yorkshire Terrier',
      weight_kg: 4,
      service_type: 'banho',
      service_date: '2026-07-24',
      service_preferred_time: '16:00',
      service_transport_options_requested: true,
    },
    customer: { name: 'Fernando' },
    turnSemantics: { transport_intent: 'request_options' },
  })

  assert.equal(events.some((event) => event.type === LUNA_BATH_EVENTS.REQUEST_TRANSPORT_OPTIONS), true)
  assert.equal(events.some((event) => event.type === LUNA_BATH_EVENTS.SELECT_TRANSPORT_MODE), false)
})

test('modalidade estruturada gera seleção explícita e suprime pedido de opções', () => {
  const events = deriveBathEvents({
    facts: {
      service_type: 'banho',
      service_transport_mode: 'buscar_e_levar',
      service_transport_label: 'Buscar e levar',
      service_transport_options_requested: true,
    },
    turnSemantics: { transport_intent: 'select_option' },
  })

  const selection = events.find((event) => event.type === LUNA_BATH_EVENTS.SELECT_TRANSPORT_MODE)
  assert.equal(selection?.payload?.mode, 'buscar_e_levar')
  assert.equal(events.some((event) => event.type === LUNA_BATH_EVENTS.REQUEST_TRANSPORT_OPTIONS), false)
})
