import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PETBOT_AGENT_TOOLS,
  isExplicitPetbotConfirmation,
  preparePetshopOrderDraft,
  runPetbotAgent,
} from '../server/lib/petbotAgent.js'

test('detecta confirmação explícita sem aceitar texto ambíguo', () => {
  assert.equal(isExplicitPetbotConfirmation('sim'), true)
  assert.equal(isExplicitPetbotConfirmation('Pode finalizar'), true)
  assert.equal(isExplicitPetbotConfirmation('sim, mas troca para entrega'), false)
  assert.equal(isExplicitPetbotConfirmation('talvez'), false)
})

test('prepara pedido usando preço real do estoque', () => {
  const prepared = preparePetshopOrderDraft({
    args: {
      customer_name: 'Ana',
      order_type: 'produto',
      items: [{ product_id: 'p1', name: 'Preço inventado', quantity: 2, upsell: false }],
      payment_method: 'pix',
      fulfillment_type: 'entrega',
      delivery_address: 'Rua A, 10',
      delivery_neighborhood: 'Centro',
      delivery_city: 'São Paulo',
      delivery_reference: 'Portão azul',
    },
    products: [{ id: 'p1', name: 'Ração Real', price: 25, stock_quantity: 5, active: true }],
    settings: { deliveryFee: 10 },
  })

  assert.equal(prepared.ok, true)
  assert.equal(prepared.order.items[0].name, 'Ração Real')
  assert.equal(prepared.order.items[0].unit_price, 25)
  assert.equal(prepared.order.total, 60)
  assert.match(prepared.summary, /R\$\s?60,00/)
})

test('recusa pedido com produto inexistente ou dados incompletos', () => {
  const prepared = preparePetshopOrderDraft({
    args: {
      customer_name: 'Ana',
      order_type: 'produto',
      items: [{ product_id: 'fake', name: 'Produto', quantity: 1, upsell: false }],
      payment_method: null,
      fulfillment_type: null,
    },
    products: [],
  })

  assert.equal(prepared.ok, false)
  assert.ok(prepared.missing.some((item) => item.includes('produto real')))
  assert.ok(prepared.missing.includes('forma de pagamento'))
  assert.ok(prepared.missing.includes('entrega ou retirada'))
})

test('prepara serviço somente com horário disponível e preço real', () => {
  const prepared = preparePetshopOrderDraft({
    args: {
      customer_name: 'Bruno',
      pet_name: 'Thor',
      species: 'dog',
      size: 'medio',
      breed: null,
      symptom: null,
      order_type: 'banho_tosa',
      items: [],
      appointment_id: 'a1',
      scheduled_at: null,
      service_type: 'Banho',
      service_transport_fee: 15,
    },
    appointments: [{
      id: 'a1',
      service_type: 'Banho',
      scheduled_at: '2026-07-25T14:00:00-03:00',
      price: 80,
      duration_min: 60,
      status: 'available',
    }],
  })

  assert.equal(prepared.ok, true)
  assert.equal(prepared.order.total, 95)
  assert.equal(prepared.order.appointment_id, 'a1')
})

test('executa loop de ferramenta e devolve resposta final do agente', async () => {
  const requests = []
  let call = 0
  const result = await runPetbotAgent({
    model: 'gpt-4o-mini',
    systemPrompt: 'Atenda o cliente.',
    history: [],
    message: 'Meu nome é Ana',
    tools: [],
    callModel: async (request) => {
      requests.push(request)
      call += 1
      if (call === 1) {
        return {
          usage: { total_tokens: 10 },
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'update_customer_profile',
                  arguments: JSON.stringify({ customer_name: 'Ana' }),
                },
              }],
            },
          }],
        }
      }
      return {
        usage: { total_tokens: 8 },
        choices: [{ message: { content: 'Prazer, Ana! Como posso ajudar?' } }],
      }
    },
    executeTool: async () => ({ ok: true }),
  })

  assert.equal(result.reply, 'Prazer, Ana! Como posso ajudar?')
  assert.equal(result.tokensUsed, 18)
  assert.equal(result.toolRuns.length, 1)
  assert.equal(requests[0].parallel_tool_calls, false)
  assert.equal(requests[1].messages.at(-1).role, 'tool')
})


test('schemas das ferramentas usam modo estrito compatível', () => {
  for (const tool of PETBOT_AGENT_TOOLS) {
    assert.equal(tool.function.strict, true)
    const schema = tool.function.parameters
    assert.equal(schema.additionalProperties, false)
    assert.deepEqual(new Set(schema.required), new Set(Object.keys(schema.properties)))

    const itemSchema = schema.properties.items?.items
    if (itemSchema) {
      assert.equal(itemSchema.additionalProperties, false)
      assert.deepEqual(new Set(itemSchema.required), new Set(Object.keys(itemSchema.properties)))
    }
  }
})

test('runtime tenta o agente antes do guardião legado', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../server/lib/chat.js', import.meta.url), 'utf8'))
  const agentIndex = source.indexOf('return await respondWithPetbotAgent')
  const guardIndex = source.indexOf('let guard = runPetbotGuard', agentIndex)
  assert.ok(agentIndex > 0)
  assert.ok(guardIndex > agentIndex)
  assert.match(source, /pendingAtTurnStart/)
  assert.match(source, /isExplicitPetbotConfirmation\(trimmedMessage\)/)
})
