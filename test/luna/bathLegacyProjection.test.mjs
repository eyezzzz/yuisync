import assert from 'node:assert/strict'
import test from 'node:test'

import {
  projectBathStateToLegacyFacts,
  projectBathStateToPendingOrder,
  runBathSemanticPreparation,
} from '../../server/lib/luna/bath/index.js'

const pendingOrder = {
  id: 'pending-bath-1',
  confirmation_fingerprint: 'fingerprint-1',
  order: {
    customer_name: 'Fernando',
    pet_name: 'Adalto',
    species: 'dog',
    breed: 'Yorkshire Terrier',
    size: 'pequeno',
    weight_kg: 4,
    weight_label: '4 kg',
    coat_type: 'longo',
    order_type: 'banho_tosa',
    items: [{
      product_id: 'bath-small', service_id: 'service-bath-small', name: 'Banho pequeno', quantity: 1, unit_price: 55, upsell: false,
    }],
    scheduled_at: '2026-07-24T16:00:00-03:00',
    service_product_id: 'bath-small',
    service_type: 'banho_pequeno',
    service_label: 'Banho pequeno',
    duration_min: 60,
    service_transport_mode: 'buscar_e_levar',
    service_transport_label: 'Buscar e levar',
    service_transport_fee: 20,
    service_transport_customer_brings: false,
    service_transport_address: 'Av. dos Andradas, 123',
    service_transport_neighborhood: 'Centro',
    service_transport_city: 'Muriaé',
    service_transport_reference: 'Ao lado da caixa d’água',
    notes: null,
    total: 75,
  },
}

test('projeção canônica permanece compatível com fatos e pendingOrder legados', () => {
  const preparation = runBathSemanticPreparation({
    facts: {
      pet_name: 'Adalto', species: 'dog', breed: 'Yorkshire Terrier', size: 'pequeno', weight_kg: 4,
      weight_label: '4 kg', coat_type: 'longo', service_type: 'banho_pequeno',
      service_date: '2026-07-24', service_preferred_time: '16:00',
      service_transport_mode: 'buscar_e_levar', service_transport_label: 'Buscar e levar',
      service_transport_address: 'Av. dos Andradas, 123', service_transport_neighborhood: 'Centro',
      service_transport_city: 'Muriaé', service_transport_reference: 'Ao lado da caixa d’água',
      service_transport_address_confirmed: true,
    },
    customer: { name: 'Fernando' },
    pendingOrder,
  })

  const facts = projectBathStateToLegacyFacts(preparation.state, {})
  const projectedPending = projectBathStateToPendingOrder(preparation.state, pendingOrder)

  assert.equal(preparation.state.status, 'awaiting_confirmation')
  assert.equal(facts.service_transport_mode, 'buscar_e_levar')
  assert.equal(facts.service_transport_options_requested, false)
  assert.equal(projectedPending.order.scheduled_at, pendingOrder.order.scheduled_at)
  assert.equal(projectedPending.order.total, 75)
  assert.equal(projectedPending.confirmation_fingerprint, 'fingerprint-1')
})
