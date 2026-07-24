import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  beginLegacyBackedConfirmation,
  completeLegacyBackedConfirmation,
  diffConfirmationContracts,
  LUNA_CONFIRMATION_RESULTS,
} from '../../server/lib/luna/confirmation/index.js'
import { createOperationState } from '../../server/lib/luna/operationState.js'

function state(overrides = {}) {
  return createOperationState({
    operation_id: 'pending-1',
    type: 'service_booking',
    status: 'awaiting_confirmation',
    items: [{ id: 'bath-small', kind: 'service', quantity: 1, unit_price: 55, total: 55 }],
    schedule: { scheduled_at: '2026-07-25T16:00:00-03:00' },
    totals: { total: 55 },
    required_fields: [],
    persistence: { sale_id: null, order_id: null, appointment_id: null },
    ...overrides,
  })
}

function pending(overrides = {}) {
  return {
    id: 'pending-1',
    order: {
      order_type: 'banho_tosa',
      scheduled_at: '2026-07-25T16:00:00-03:00',
      total: 55,
      ...overrides,
    },
    summary: 'Resumo final',
    confirmation_fingerprint: 'approved-contract',
  }
}

function success(overrides = {}) {
  return {
    ok: true,
    status: 'committed',
    sale_id: 'sale-1',
    order_id: 'order-1',
    appointment_id: 'appointment-1',
    total: 55,
    payment_status: 'pending',
    ...overrides,
  }
}

test('kernel autoriza sem executar agenda, catálogo ou RPC', async () => {
  const result = await beginLegacyBackedConfirmation({
    state: state(),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
  })

  assert.equal(result.ok, true)
  assert.equal(result.authorized, true)
  assert.equal(result.status, 'authorized')
  assert.equal(result.state.status, 'confirming')
})

test('resultado do caminho legado grava os três ids no estado canônico', async () => {
  const started = await beginLegacyBackedConfirmation({
    state: state(),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
  })
  const result = await completeLegacyBackedConfirmation({
    state: started.state,
    pendingOrder: pending(),
    legacyStatus: 'committed',
    legacyResult: success(),
    idempotencyKey: 'session-1:pending-1',
  })

  assert.equal(result.ok, true)
  assert.equal(result.state.status, 'confirmed')
  assert.equal(result.state.persistence.sale_id, 'sale-1')
  assert.equal(result.state.persistence.order_id, 'order-1')
  assert.equal(result.state.persistence.appointment_id, 'appointment-1')
})

test('alteração real detectada pelo legado preserva o novo resumo e o pedido', async () => {
  const started = await beginLegacyBackedConfirmation({
    state: state(),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
  })
  const refreshedOrder = { ...pending().order, scheduled_at: '2026-07-25T16:30:00-03:00' }
  const result = await completeLegacyBackedConfirmation({
    state: started.state,
    pendingOrder: pending(),
    legacyStatus: 'changed',
    legacyResult: {
      ok: false,
      status: 'changed',
      reason: 'slot_became_unavailable',
      pending_order_id: 'pending-2',
      order: refreshedOrder,
      summary: 'Novo resumo para 16:30',
    },
    idempotencyKey: 'session-1:pending-1',
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 'changed')
  assert.equal(result.classification, LUNA_CONFIRMATION_RESULTS.SLOT_BECAME_UNAVAILABLE)
  assert.equal(result.state.status, 'awaiting_confirmation')
  assert.equal(result.pendingOrder.id, 'pending-2')
  assert.equal(result.summary, 'Novo resumo para 16:30')
})

test('estado confirmado bloqueia outra execução do caminho legado', async () => {
  const result = await beginLegacyBackedConfirmation({
    state: state({
      status: 'confirmed',
      persistence: {
        sale_id: 'sale-1',
        order_id: 'order-1',
        appointment_id: 'appointment-1',
      },
    }),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
  })

  assert.equal(result.ok, true)
  assert.equal(result.authorized, false)
  assert.equal(result.status, 'already_committed')
  assert.equal(result.orderResult.appointment_id, 'appointment-1')
})

test('ids ausentes após commit entram em resultado ambíguo sem nova transação', async () => {
  const started = await beginLegacyBackedConfirmation({
    state: state(),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
  })
  const result = await completeLegacyBackedConfirmation({
    state: started.state,
    pendingOrder: pending(),
    legacyStatus: 'committed',
    legacyResult: { status: 'committed', total: 55 },
    idempotencyKey: 'session-1:pending-1',
    reconcile: async () => null,
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 'commit_ambiguous')
  assert.equal(result.state.status, 'confirming')
  assert.equal(result.state.metadata.confirmation.commit_ambiguous, true)
})

test('contrato ignora reidratação derivada e preserva mudanças materiais', () => {
  const prepared = {
    order_type: 'banho_tosa',
    customer_name: 'Gabriel',
    pet_name: 'Thor',
    service_product_id: 'bath-small',
    service_grooming_detail: 'banho',
    scheduled_at: '2026-07-25T16:00:00-03:00',
    service_transport_mode: 'cliente_leva',
    service_transport_customer_brings: false,
    items: [{
      service_id: 'bath-small',
      quantity: 1,
      unit_price: 55,
    }],
    total: 55,
  }
  const refreshed = {
    ...prepared,
    appointment_id: 'slot-derived',
    duration_min: 60,
    service_label: 'BANHO PET PORTE PEQUENO',
    service_grooming_detail: null,
    service_transport_customer_brings: true,
    items: [{
      ...prepared.items[0],
      name: 'BANHO PET PORTE PEQUENO',
      total: 55,
    }],
  }

  assert.deepEqual(diffConfirmationContracts(prepared, refreshed), [])
  assert.deepEqual(
    diffConfirmationContracts(prepared, {
      ...refreshed,
      scheduled_at: '2026-07-25T16:30:00-03:00',
    }),
    ['scheduled_at'],
  )
  assert.ok(
    diffConfirmationContracts(prepared, {
      ...refreshed,
      total: 75,
    }).includes('total'),
  )
  assert.ok(
    diffConfirmationContracts(prepared, {
      ...refreshed,
      service_transport_mode: 'buscar_e_levar',
      service_transport_fee: 20,
    }).some((path) => path.startsWith('transport.')),
  )
})

test('chat usa uma única revalidação: kernel envolve o caminho legado', () => {
  const chat = readFileSync(new URL('../../server/lib/chat.js', import.meta.url), 'utf8')
  const bridge = readFileSync(new URL('../../server/lib/luna/confirmation/confirmationLegacyBridge.js', import.meta.url), 'utf8')

  assert.match(chat, /beginLegacyBackedConfirmation\(/)
  assert.match(chat, /completeLegacyBackedConfirmation\(/)
  assert.match(chat, /diffConfirmationContracts\(/)
  assert.doesNotMatch(chat, /buildPetshopConfirmationFingerprint\(pendingAtTurnStart\.order\)/)
  assert.doesNotMatch(chat, /const kernelConfirmation = await executeLunaConfirmation\(/)
  assert.match(chat, /createConfirmedPetshopOrderViaRpc\(/)
  assert.doesNotMatch(bridge, /preparePetshopOrderDraft|loadAppointmentsFresh|refreshServiceCatalog|createConfirmedPetshopOrderViaRpc/)
})
