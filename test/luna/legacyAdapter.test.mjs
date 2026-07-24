import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deriveLegacyOperationEvent,
  operationStateFromLegacyContext,
} from '../../server/lib/luna/index.js'

test('adapter lê o contexto atual sem alterar a infraestrutura de agenda e estoque', () => {
  const state = operationStateFromLegacyContext({
    petbot_agent: {
      version: 3,
      pending_order: {
        id: 'pending_1',
        order: {
          order_type: 'banho_tosa',
          total: 75,
          transport_mode: 'buscar_e_levar',
          transport_price: 20,
          scheduled_at: '2026-07-26T10:00:00-03:00',
          items: [{ id: 'service_1', kind: 'service', name: 'Banho', unit_price: 55 }]
        }
      },
      facts: {
        pet_name: 'Thor',
        species: 'dog',
        weight_kg: 8,
        service_notes: 'sem perfume'
      }
    }
  }, {
    tenantId: 'tenant_1',
    sessionId: 'session_1',
    moduleId: 'petshop'
  })

  assert.equal(state.operation_id, 'pending_1')
  assert.equal(state.type, 'service_booking')
  assert.equal(state.status, 'awaiting_confirmation')
  assert.equal(state.schedule.scheduled_at, '2026-07-26T10:00:00-03:00')
  assert.equal(state.transport.mode, 'buscar_e_levar')
  assert.equal(state.items[0].id, 'service_1')
  assert.deepEqual(state.notes, [{ text: 'sem perfume' }])
})

test('adapter prioriza confirmação explícita no trace legado', () => {
  const event = deriveLegacyOperationEvent({
    message: 'sim, confirmo',
    pendingBefore: { id: 'pending_1' },
    pendingAfter: { id: 'pending_1' },
    turnSemantics: { action: 'correct', target: 'service_transport' },
  })
  assert.equal(event, 'CONFIRM_OPERATION')
})
