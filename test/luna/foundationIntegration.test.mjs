import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const chat = readFileSync(new URL('../../server/lib/chat.js', import.meta.url), 'utf8')
const runtime = readFileSync(new URL('../../server/lib/luna/runtime/agentRuntime.js', import.meta.url), 'utf8')
const tools = readFileSync(new URL('../../server/lib/luna/tools/registeredTools.js', import.meta.url), 'utf8')

test('PR4.5 governa o executor existente sem duplicar integrações operacionais', () => {
  assert.match(chat, /createLunaAgentRuntime\(/)
  assert.match(chat, /const executeLegacyTool = async/)
  assert.match(chat, /lunaRuntime\.executeToolCall\(/)
  assert.match(chat, /createConfirmedPetshopOrderViaRpc\(/)
  assert.match(chat, /loadAppointmentsFresh\(/)
  assert.doesNotMatch(runtime, /supabase|\.from\(|createConfirmedPetshopOrderViaRpc|loadAppointmentsFresh/)
  assert.doesNotMatch(tools, /supabase|\.from\(|createConfirmedPetshopOrderViaRpc|loadAppointmentsFresh/)
})
