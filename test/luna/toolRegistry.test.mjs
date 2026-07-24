import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createLunaToolRegistry,
  defineLunaTool,
  executeRegisteredToolCall,
} from '../../server/lib/luna/index.js'

function toolCall(name, args) {
  return { id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) } }
}

test('registro executa ferramenta validada e produz ToolResult sanitizado', async () => {
  const runs = []
  const registry = createLunaToolRegistry([
    defineLunaTool({
      name: 'lookup',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      outputSchema: { type: 'object' },
      execute: async (args) => ({ ok: true, status: 'resolved', query: args.query }),
    }),
  ])
  const result = await executeRegisteredToolCall({
    registry,
    toolCall: toolCall('lookup', { query: 'banho' }),
    traceId: 'trace_1',
    onRun: (run) => runs.push(run),
  })
  assert.equal(result.status, 'resolved')
  assert.equal(runs.length, 1)
  assert.equal(runs[0].tool_name, 'lookup')
  assert.equal(runs[0].trace_id, 'trace_1')
  assert.equal(runs[0].arguments.query, 'banho')
})

test('registro bloqueia argumentos fora do schema antes do executor legado', async () => {
  let executions = 0
  const registry = createLunaToolRegistry([{
    name: 'confirm',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { confirmation: { type: 'boolean' } },
      required: ['confirmation'],
    },
    outputSchema: { type: 'object' },
    requiresConfirmation: true,
    execute: async () => {
      executions += 1
      return { ok: true }
    },
  }])
  const result = await executeRegisteredToolCall({
    registry,
    toolCall: toolCall('confirm', { confirmation: 'sim' }),
  })
  assert.equal(executions, 0)
  assert.equal(result.ok, false)
  assert.equal(result.error_code, 'TOOL_INPUT_INVALID')
})
