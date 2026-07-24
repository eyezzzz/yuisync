import assert from 'node:assert/strict'
import test from 'node:test'

import {
  executeLunaConfirmation,
  LUNA_CONFIRMATION_RESULTS,
} from '../../server/lib/luna/confirmation/index.js'
import { createOperationState } from '../../server/lib/luna/operationState.js'

function order(overrides = {}) {
  return {
    order_type: 'banho_tosa',
    scheduled_at: '2026-07-25T14:00:00-03:00',
    total: 55,
    items: [{ service_id: 'bath-small', quantity: 1, unit_price: 55, total: 55 }],
    service_transport_mode: 'cliente_leva',
    ...overrides,
  }
}

function state(overrides = {}) {
  return createOperationState({
    operation_id: 'pending-1',
    type: 'service_booking',
    status: 'awaiting_confirmation',
    items: [{ id: 'bath-small', kind: 'service', quantity: 1, unit_price: 55, total: 55 }],
    schedule: { scheduled_at: '2026-07-25T14:00:00-03:00' },
    totals: { total: 55 },
    required_fields: [],
    persistence: {
      sale_id: null,
      order_id: null,
      appointment_id: null,
    },
    ...overrides,
  })
}

function pending(orderOverrides = {}) {
  return {
    id: 'pending-1',
    order: order(orderOverrides),
    summary: 'Resumo final',
  }
}

function fingerprint(value) {
  return JSON.stringify(value)
}

function successResult(overrides = {}) {
  return {
    sale_id: 'sale-1',
    order_id: 'order-1',
    appointment_id: 'appointment-1',
    total: 55,
    payment_status: 'pending',
    duplicated: false,
    ...overrides,
  }
}

test('confirmação explícita executa uma única transação', async () => {
  let commits = 0
  const result = await executeLunaConfirmation({
    state: state(),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
    fingerprint,
    revalidate: async () => ({ ok: true, order: order() }),
    commit: async () => {
      commits += 1
      return successResult()
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 'committed')
  assert.equal(commits, 1)
})

test('texto sem confirmação explícita não executa transação', async () => {
  let commits = 0
  const result = await executeLunaConfirmation({
    state: state(),
    pendingOrder: pending(),
    explicitConfirmation: false,
    idempotencyKey: 'session-1:pending-1',
    fingerprint,
    revalidate: async () => ({ ok: true, order: order() }),
    commit: async () => { commits += 1 },
  })

  assert.equal(result.ok, false)
  assert.equal(result.classification, LUNA_CONFIRMATION_RESULTS.VALIDATION_FAILED)
  assert.equal(commits, 0)
})

test('estado incompleto bloqueia confirmação', async () => {
  let commits = 0
  const result = await executeLunaConfirmation({
    state: state({ required_fields: ['transport.mode'] }),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
    fingerprint,
    revalidate: async () => ({ ok: true, order: order() }),
    commit: async () => { commits += 1 },
  })

  assert.equal(result.ok, false)
  assert.equal(result.classification, LUNA_CONFIRMATION_RESULTS.VALIDATION_FAILED)
  assert.equal(commits, 0)
})

test('horário alterado exige novo resumo sem executar transação', async () => {
  let commits = 0
  const refreshed = order({ scheduled_at: '2026-07-25T15:00:00-03:00' })
  const result = await executeLunaConfirmation({
    state: state(),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
    fingerprint,
    revalidate: async () => ({
      ok: true,
      order: refreshed,
      summary: 'Novo resumo para 15:00',
      pendingOrder: { id: 'pending-2', order: refreshed, summary: 'Novo resumo para 15:00' },
    }),
    commit: async () => { commits += 1 },
  })

  assert.equal(result.status, 'changed')
  assert.equal(result.classification, LUNA_CONFIRMATION_RESULTS.SLOT_BECAME_UNAVAILABLE)
  assert.equal(result.summary, 'Novo resumo para 15:00')
  assert.equal(commits, 0)
})

test('preço alterado exige novo resumo sem executar transação', async () => {
  let commits = 0
  const refreshed = order({ total: 60, items: [{ service_id: 'bath-small', quantity: 1, unit_price: 60, total: 60 }] })
  const result = await executeLunaConfirmation({
    state: state(),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
    fingerprint,
    revalidate: async () => ({ ok: true, order: refreshed, summary: 'Novo resumo R$ 60' }),
    commit: async () => { commits += 1 },
  })

  assert.equal(result.status, 'changed')
  assert.equal(result.classification, LUNA_CONFIRMATION_RESULTS.COMMERCIAL_CONTRACT_CHANGED)
  assert.equal(commits, 0)
})

test('sucesso grava venda, pedido e agendamento no estado', async () => {
  const result = await executeLunaConfirmation({
    state: state(),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
    fingerprint,
    revalidate: async () => ({ ok: true, order: order() }),
    commit: async () => successResult(),
  })

  assert.equal(result.state.status, 'confirmed')
  assert.equal(result.state.persistence.sale_id, 'sale-1')
  assert.equal(result.state.persistence.order_id, 'order-1')
  assert.equal(result.state.persistence.appointment_id, 'appointment-1')
})

test('confirmação repetida não chama a transação novamente', async () => {
  let commits = 0
  const result = await executeLunaConfirmation({
    state: state({
      status: 'confirmed',
      persistence: successResult(),
    }),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
    fingerprint,
    revalidate: async () => ({ ok: true, order: order() }),
    commit: async () => { commits += 1 },
  })

  assert.equal(result.status, 'already_committed')
  assert.equal(result.classification, LUNA_CONFIRMATION_RESULTS.ALREADY_CONFIRMED)
  assert.equal(commits, 0)
})

test('falha anterior ao commit preserva o pedido preparado', async () => {
  let commits = 0
  const result = await executeLunaConfirmation({
    state: state(),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
    fingerprint,
    revalidate: async () => ({ ok: false, reason: 'validation failed' }),
    commit: async () => { commits += 1 },
  })

  assert.equal(result.status, 'validation_failed')
  assert.equal(result.pendingOrder.id, 'pending-1')
  assert.equal(result.state.status, 'awaiting_confirmation')
  assert.equal(commits, 0)
})

test('falha posterior ao commit é reconciliada pelos ids persistidos', async () => {
  let commits = 0
  const ambiguous = Object.assign(new Error('network timeout after commit'), {
    commitResultAmbiguous: true,
  })
  const result = await executeLunaConfirmation({
    state: state(),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
    fingerprint,
    revalidate: async () => ({ ok: true, order: order() }),
    commit: async () => {
      commits += 1
      throw ambiguous
    },
    reconcile: async () => successResult({ duplicated: true }),
  })

  assert.equal(commits, 1)
  assert.equal(result.ok, true)
  assert.equal(result.status, 'already_committed')
  assert.equal(result.state.status, 'confirmed')
})

test('resultado ambíguo bloqueia nova transação até reconciliar', async () => {
  let commits = 0
  const ambiguous = Object.assign(new Error('network timeout'), {
    commitResultAmbiguous: true,
  })
  const first = await executeLunaConfirmation({
    state: state(),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
    fingerprint,
    revalidate: async () => ({ ok: true, order: order() }),
    commit: async () => {
      commits += 1
      throw ambiguous
    },
    reconcile: async () => null,
  })

  const second = await executeLunaConfirmation({
    state: first.state,
    pendingOrder: first.pendingOrder,
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
    fingerprint,
    revalidate: async () => ({ ok: true, order: order() }),
    commit: async () => { commits += 1 },
    reconcile: async () => null,
  })

  assert.equal(first.status, 'commit_ambiguous')
  assert.equal(second.status, 'commit_ambiguous')
  assert.equal(second.classification, LUNA_CONFIRMATION_RESULTS.COMMIT_RESULT_AMBIGUOUS)
  assert.equal(commits, 1)
})

test('reidratação de campos derivados não invalida o contrato confirmado', async () => {
  let commits = 0
  const refreshed = order({
    appointment_id: 'slot-generated-on-refresh',
    duration_min: 75,
    service_label: 'BANHO PET PORTE PEQUENO 0 KG A 10 KG',
    size: 'medio',
    coat_type: 'longo',
  })
  const result = await executeLunaConfirmation({
    state: state(),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
    fingerprint,
    revalidate: async () => ({ ok: true, order: refreshed }),
    commit: async () => {
      commits += 1
      return successResult()
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 'committed')
  assert.equal(commits, 1)
})

test('o mesmo instante com outra representação ISO mantém o contrato', async () => {
  let commits = 0
  const refreshed = order({ scheduled_at: '2026-07-25T17:00:00.000Z' })
  const result = await executeLunaConfirmation({
    state: state(),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
    fingerprint,
    revalidate: async () => ({ ok: true, order: refreshed }),
    commit: async () => {
      commits += 1
      return successResult()
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 'committed')
  assert.equal(commits, 1)
})

test('cliente leva permanece igual após hidratar flag e aliases de transporte', async () => {
  let commits = 0
  const refreshed = order({
    service_transport_mode: 'sem transporte',
    service_transport_customer_brings: true,
    service_transport_address: 'Rua ignorada, 10',
    transport: {
      mode: 'tutor_leva',
      customer_brings: true,
      address: 'Outra rua ignorada, 20',
    },
  })
  const result = await executeLunaConfirmation({
    state: state(),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
    fingerprint,
    revalidate: async () => ({ ok: true, order: refreshed }),
    commit: async () => {
      commits += 1
      return successResult()
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 'committed')
  assert.equal(commits, 1)
})

test('hidratação de total da linha e id operacional não altera o item confirmado', async () => {
  let commits = 0
  const pendingWithoutDerivedTotal = pending({
    items: [{ service_id: 'bath-small', quantity: 1, unit_price: 55 }],
  })
  const refreshed = order({
    items: [{
      id: 'operational-line-id',
      service_id: 'bath-small',
      quantity: 1,
      unit_price: 55,
      total: 55,
    }],
  })
  const result = await executeLunaConfirmation({
    state: state(),
    pendingOrder: pendingWithoutDerivedTotal,
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
    fingerprint,
    revalidate: async () => ({ ok: true, order: refreshed }),
    commit: async () => {
      commits += 1
      return successResult()
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 'committed')
  assert.equal(commits, 1)
})

test('metadados derivados de pet, serviço e assinatura não mudam o contrato', async () => {
  let commits = 0
  const refreshed = order({
    species: 'cachorro',
    breed: 'Lhasa Apso',
    weight_kg: 8,
    service_type: 'banho',
    service_kind: 'grooming',
    regular_service_price: 55,
    subscription_benefit: {
      subscription_id: 'subscription-loaded-on-refresh',
      service_type: 'banho',
    },
  })
  const result = await executeLunaConfirmation({
    state: state(),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
    fingerprint,
    revalidate: async () => ({ ok: true, order: refreshed }),
    commit: async () => {
      commits += 1
      return successResult()
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 'committed')
  assert.equal(commits, 1)
})

test('mudança real informa os campos divergentes sem executar transação', async () => {
  let commits = 0
  const refreshed = order({
    total: 60,
    items: [{ service_id: 'bath-small', quantity: 1, unit_price: 60, total: 60 }],
  })
  const result = await executeLunaConfirmation({
    state: state(),
    pendingOrder: pending(),
    explicitConfirmation: true,
    idempotencyKey: 'session-1:pending-1',
    fingerprint,
    revalidate: async () => ({ ok: true, order: refreshed }),
    commit: async () => { commits += 1 },
  })

  assert.equal(result.status, 'changed')
  assert.equal(result.classification, LUNA_CONFIRMATION_RESULTS.COMMERCIAL_CONTRACT_CHANGED)
  assert.ok(result.contract_changes.includes('total'))
  assert.ok(result.contract_changes.includes('items[0].unit_price'))
  assert.match(result.reason, /confirmation_contract_changed:/)
  assert.equal(commits, 0)
})
