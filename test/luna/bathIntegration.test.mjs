import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const chat = readFileSync(new URL('../../server/lib/chat.js', import.meta.url), 'utf8')
const runtime = readFileSync(new URL('../../server/lib/luna/bath/bathRuntime.js', import.meta.url), 'utf8')

test('chat usa kernel de banho sem criar uma segunda infraestrutura operacional', () => {
  assert.match(chat, /runBathSemanticPreparation\(/)
  assert.match(chat, /luna_bath_state: bathKernelState/)
  assert.match(chat, /loadAppointmentsFresh\(/)
  assert.match(chat, /createConfirmedPetshopOrderViaRpc\(/)
  assert.doesNotMatch(runtime, /supabase|\.from\(|fetch\(|loadAppointmentsFresh|createConfirmedPetshopOrderViaRpc/)
})
