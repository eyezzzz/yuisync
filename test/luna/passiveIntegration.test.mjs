import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const chat = readFileSync(new URL('../../server/lib/chat.js', import.meta.url), 'utf8')
const legacyAdapter = readFileSync(new URL('../../server/lib/luna/legacyAdapter.js', import.meta.url), 'utf8')

test('foundation observa o fluxo atual sem substituir conexões de agenda, estoque e transação', () => {
  assert.match(chat, /loadAppointmentsFresh\(/)
  assert.match(chat, /createConfirmedPetshopOrderViaRpc\(/)
  assert.match(chat, /loadProductsByIds\(/)
  assert.match(chat, /operationStateFromLegacyContext\(sessionForAgent\.context/)
  assert.match(chat, /luna_trace: lunaTrace/)
  assert.doesNotMatch(legacyAdapter, /supabase|\.from\(|fetch\(/)
})
