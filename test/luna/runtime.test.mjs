import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createLunaAgentRuntime,
  createRuntimeBudget,
} from '../../server/lib/luna/index.js'

test('orçamento limita ferramentas, tokens e custo só quando configurado', () => {
  let now = 0
  const budget = createRuntimeBudget({
    maxDurationMs: 1000,
    maxToolCalls: 1,
    maxTokens: 20,
    estimatedCostPerMillionTokens: 2,
    clock: () => now,
  })
  budget.beforeTool({ name: 'one' })
  budget.afterTool({ durationMs: 25 })
  budget.addTokens({ total_tokens: 10 })
  now = 100
  const snapshot = budget.finish()
  assert.equal(snapshot.usage.tool_calls, 1)
  assert.equal(snapshot.usage.tool_duration_ms, 25)
  assert.equal(snapshot.usage.tokens, 10)
  assert.equal(snapshot.usage.estimated_cost, 0.00002)
  assert.throws(() => budget.beforeTool({ name: 'two' }), /tool_calls budget exceeded/)
})

test('runtime adapta ferramentas atuais sem duplicar seus executores', async () => {
  const calls = []
  const tools = [{
    type: 'function',
    function: {
      name: 'lookup',
      description: 'lookup',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  }]
  const runtime = createLunaAgentRuntime({
    tools,
    executeLegacyTool: async (call) => {
      calls.push(call)
      return { ok: true, status: 'resolved' }
    },
    traceId: 'trace_runtime',
    limits: { maxDurationMs: 5000 },
  })
  const result = await runtime.executeToolCall({
    id: '1', type: 'function', function: { name: 'lookup', arguments: '{"query":"banho"}' },
  })
  runtime.recordValidationRetries(0)
  const completed = runtime.complete({ outcome: 'ok' })
  assert.equal(result.status, 'resolved')
  assert.equal(calls.length, 1)
  assert.equal(completed.tool_runs.length, 1)
  assert.equal(completed.plan.allowed_tools[0], 'lookup')
})


test('runtime registra duração e tokens das chamadas ao modelo', async () => {
  const runtime = createLunaAgentRuntime({
    tools: [],
    executeLegacyTool: async () => ({ ok: true }),
    limits: { maxDurationMs: 5000, estimatedCostPerMillionTokens: 2 },
  })
  const response = await runtime.callModel({}, async () => ({ usage: { total_tokens: 50 } }))
  assert.equal(response.usage.total_tokens, 50)
  const completed = runtime.complete()
  assert.equal(completed.budget.usage.model_calls, 1)
  assert.equal(completed.budget.usage.tokens, 50)
  assert.equal(completed.budget.usage.estimated_cost, 0.0001)
  assert.ok(completed.budget.usage.model_duration_ms >= 0)
})
