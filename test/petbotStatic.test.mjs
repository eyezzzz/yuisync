import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('webhook da Vercel nao usa debounce bloqueante por padrao', () => {
  const webhook = read('serverless/whatsappWebhook.ts')
  assert.match(webhook, /DEFAULT_WHATSAPP_REPLY_DEBOUNCE_MS = 0/)
  assert.match(webhook, /MAX_BLOCKING_WHATSAPP_REPLY_DEBOUNCE_MS = 1_500/)
})

test('lista de chats nao recarrega em todo insert global de mensagens', () => {
  const hook = read('src/shared/hooks/useChat.js')
  const sessionsSubscription = hook.slice(hook.indexOf("channel('chat-sessions-list')"))
  assert.doesNotMatch(sessionsSubscription, /table:\s*'chat_messages'/)
})

test('pedido PetBot usa RPC transacional no backend local e serverless', () => {
  const localChat = read('server/lib/chat.js')
  const webhook = read('serverless/whatsappWebhook.ts')
  const migration = read('database/petbot_order_transaction_rpc.sql')

  assert.match(localChat, /createConfirmedPetshopOrderViaRpc/)
  assert.match(webhook, /createConfirmedPetshopOrderViaRpc/)
  assert.match(migration, /create_petbot_order_transaction/)
})

test('resposta do PetBot so e salva depois do estado da sessao persistir', () => {
  const localChat = read('server/lib/chat.js')
  const webhook = read('serverless/whatsappWebhook.ts')

  const localPersistIndex = localChat.indexOf('const { data: updatedSession')
  const localReplyIndex = localChat.indexOf('const { data: savedReply', localPersistIndex)
  assert.ok(localPersistIndex > -1)
  assert.ok(localReplyIndex > -1)
  assert.ok(localPersistIndex < localReplyIndex)
  assert.match(localChat, /customer_name: state\.customerName/)
  assert.match(localChat, /hasPetbotState\(updatedSession\.context\)/)
  assert.match(localChat, /recoverPetbotContextFromHistory/)
  assert.match(localChat, /petbot_state: snapshotPetbotState\(state\)/)

  const webhookPersistIndex = webhook.indexOf('const sessionUpdate = await supabase')
  const webhookReplyIndex = webhook.indexOf('const savedReply = await saveAssistantMessage')
  assert.ok(webhookPersistIndex > -1)
  assert.ok(webhookReplyIndex > -1)
  assert.ok(webhookPersistIndex < webhookReplyIndex)
  assert.match(webhook, /customer_name: state\.customerName/)
  assert.match(webhook, /hasPetbotState\(sessionUpdate\.data\.context\)/)
  assert.match(webhook, /recoverPetbotContextFromHistory/)
  assert.match(webhook, /petbot_state: snapshotPetbotState\(state\)/)
})

test('configuracao de deploy expoe debounce seguro e modelos de midia', () => {
  const env = read('.env.example')
  assert.match(env, /WHATSAPP_REPLY_DEBOUNCE_MS=0/)
  assert.match(env, /OPENAI_TRANSCRIPTION_MODEL=/)
  assert.match(env, /OPENAI_VISION_MODEL=/)
})

test('agenda separa banho/tosa e veterinaria em abas', () => {
  const agenda = read('src/modules/petshop/pages/AgendaPage.jsx')
  const appointments = read('src/shared/hooks/useAppointments.js')

  assert.match(agenda, /AGENDA_TABS/)
  assert.match(agenda, /Banho\/Tosa/)
  assert.match(agenda, /Veterinária/)
  assert.match(agenda, /getAppointmentServiceGroup/)
  assert.match(appointments, /banho\.\*tosa/)
  assert.match(appointments, /vet\|consulta\|clinica\|medico/)
})
