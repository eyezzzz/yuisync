import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isCustomerNamePlaceholder,
  normalizeCustomerDisplayName,
  runBathShadowTurn,
} from '../../server/lib/luna/index.js'

const baseState = {
  type: 'service_booking',
  status: 'selecting_schedule',
  customer: { name: 'Gabriela' },
  pet: { name: 'Toby' },
  transport: { mode: null },
  metadata: { pending_order_type: 'banho_tosa' },
}

test('nome placeholder nunca vira identidade exibível', () => {
  assert.equal(isCustomerNamePlaceholder('nao confirmado'), true)
  assert.equal(isCustomerNamePlaceholder('Não informado'), true)
  assert.equal(normalizeCustomerDisplayName('nao confirmado'), '')
  assert.equal(normalizeCustomerDisplayName('Gabriela'), 'Gabriela')
})

test('shadow de banho fica desligado por padrão', () => {
  const result = runBathShadowTurn({ stateBefore: baseState, stateAfter: baseState })
  assert.equal(result, null)
})

test('shadow detecta escolha automática de modalidade MotoDog sem executar efeitos', () => {
  const result = runBathShadowTurn({
    config: { enabled: true, domains: 'bath', sampleRate: 1 },
    sessionId: 'session-1',
    stateBefore: baseState,
    stateAfter: { ...baseState, transport: { mode: 'buscar_e_levar' } },
    genericTransportRequested: true,
    reply: 'Buscar e levar selecionado por R$ 20,00.',
  })

  assert.equal(result.agreement, false)
  assert.ok(result.differences.some((entry) => entry.code === 'GENERIC_TRANSPORT_AUTO_SELECTED'))
  assert.deepEqual(result.side_effects, { tool_calls: 0, database_writes: 0, external_requests: 0 })
  assert.equal(JSON.stringify(result).includes('Buscar e levar selecionado'), false)
})

test('shadow detecta placeholder, sucesso prematuro e horário não reconhecido', () => {
  const result = runBathShadowTurn({
    config: { enabled: true, domains: 'bath', sampleRate: 1 },
    sessionId: 'session-2',
    stateBefore: baseState,
    stateAfter: {
      ...baseState,
      customer: { name: 'nao confirmado' },
      status: 'collecting_data',
    },
    reply: 'Ótimo, está agendado para hoje.',
    availability: { requested_slot: { available: true, scheduled_at: '2026-07-24T15:00:00-03:00' } },
    currentTurnSelectedSchedule: true,
  })

  const codes = result.differences.map((entry) => entry.code)
  assert.ok(codes.includes('PLACEHOLDER_CUSTOMER_NAME'))
  assert.ok(codes.includes('UNCOMMITTED_SUCCESS_CLAIM'))
  assert.ok(codes.includes('AVAILABLE_SLOT_NOT_ACKNOWLEDGED'))
})


test('shadow detecta referência usada como cidade do MotoDog', () => {
  const result = runBathShadowTurn({
    config: { enabled: true, domains: 'bath', sampleRate: 1 },
    sessionId: 'session-3',
    stateBefore: baseState,
    stateAfter: {
      ...baseState,
      transport: {
        mode: 'buscar_e_levar',
        address: {
          city: 'em frente a mercearia',
          reference: 'em frente a mercearia',
        },
      },
    },
  })
  assert.ok(result.differences.some((entry) => entry.code === 'TRANSPORT_REFERENCE_USED_AS_CITY'))
})
