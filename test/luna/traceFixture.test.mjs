import assert from 'node:assert/strict'
import test from 'node:test'

import {
  completeLunaTurnTrace,
  createLunaTurnTrace,
  traceToRegressionFixture,
} from '../../server/lib/luna/index.js'

test('trace de falha cria assinatura e fixture candidata sem dados pessoais', () => {
  const start = createLunaTurnTrace({
    sessionId: 'session_1',
    tenantId: 'tenant_1',
    message: 'Meu nome é Gabriel e moro na Rua A',
    stateBefore: {
      operation_id: 'op_1',
      type: 'service_booking',
      status: 'awaiting_confirmation',
      customer: { name: 'Gabriel', phone: '31999999999' },
      pet: { name: 'Thor' },
      transport: { address: { street: 'Rua A' } },
    },
    clock: () => new Date('2026-07-24T12:00:00Z'),
  })
  const trace = completeLunaTurnTrace(start, {
    stateAfter: {
      operation_id: 'op_1',
      type: 'service_booking',
      status: 'awaiting_confirmation',
      customer: { name: 'Gabriel', phone: '31999999999' },
      pet: { name: 'Thor' },
    },
    semanticEvent: 'CONFIRM_OPERATION',
    verifier: {
      ok: false,
      severity: 'error',
      issues: [{ code: 'PERSISTENCE_PARTIAL_FAILURE', severity: 'error' }],
    },
    outcome: 'error',
    clock: () => new Date('2026-07-24T12:00:01Z'),
  })
  const serialized = JSON.stringify(trace)
  assert.doesNotMatch(serialized, /Gabriel|31999999999|Rua A|Thor/)
  assert.equal(typeof trace.incident.signature, 'string')
  assert.equal(trace.fixture_candidate.source.trace_id, trace.trace_id)
  const fixture = traceToRegressionFixture(trace)
  assert.equal(fixture.replayable, false)
})


test('trace usa custo estimado do orçamento do runtime', () => {
  const started = createLunaTurnTrace({
    traceId: 'trace_cost',
    message: 'mensagem',
    stateBefore: { type: 'service_booking', status: 'collecting_data' },
  })
  const completed = completeLunaTurnTrace(started, {
    stateAfter: { type: 'service_booking', status: 'collecting_data' },
    model: 'model-test',
    tokensUsed: 50,
    runtime: {
      budget: {
        usage: { estimated_cost: 0.0001, model_calls: 1, model_duration_ms: 12 },
      },
    },
  })
  assert.equal(completed.usage.model, 'model-test')
  assert.equal(completed.usage.tokens, 50)
  assert.equal(completed.usage.estimated_cost, 0.0001)
  assert.equal(completed.runtime_budget.usage.model_calls, 1)
})
