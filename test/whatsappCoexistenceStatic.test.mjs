import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const webhookApi = await readFile(new URL('../api/webhook.ts', import.meta.url), 'utf8')
const coexistenceHandler = await readFile(new URL('../serverless/whatsappCoexistenceWebhook.ts', import.meta.url), 'utf8')
const migration = await readFile(
  new URL('../supabase/migrations/20260727010000_whatsapp_coexistence_history.sql', import.meta.url),
  'utf8',
)

test('eventos de coexistência são roteados antes do webhook conversacional', () => {
  const coexistenceRoute = webhookApi.indexOf('isWhatsappCoexistencePayload(body)')
  const regularRoute = webhookApi.indexOf("import('../serverless/whatsappWebhook.js')")
  assert.ok(coexistenceRoute >= 0)
  assert.ok(regularRoute > coexistenceRoute)
})

test('histórico nunca é encaminhado ao runtime da Luna', () => {
  assert.match(coexistenceHandler, /should_reply:\s*false/)
  assert.match(coexistenceHandler, /luna_status:\s*'pending_anonymization'/)
  assert.doesNotMatch(coexistenceHandler, /respondToChatMessage/)
  assert.doesNotMatch(coexistenceHandler, /sendWhatsappText/)
})

test('payloads de coexistência exigem assinatura da Meta', () => {
  assert.match(coexistenceHandler, /x-hub-signature-256/)
  assert.match(coexistenceHandler, /timingSafeEqual/)
  assert.match(coexistenceHandler, /WHATSAPP_APP_SECRET/)
})

test('banco reforça deduplicação e bloqueio de resposta histórica', () => {
  assert.match(migration, /unique \(tenant_id, external_message_id\)/)
  assert.match(migration, /should_reply boolean not null default false/)
  assert.match(migration, /historical boolean not null default true/)
  assert.match(migration, /enable row level security/)
})
