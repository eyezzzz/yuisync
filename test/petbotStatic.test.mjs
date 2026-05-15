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

test('configuracao de deploy expoe debounce seguro e modelos de midia', () => {
  const env = read('.env.example')
  assert.match(env, /WHATSAPP_REPLY_DEBOUNCE_MS=0/)
  assert.match(env, /OPENAI_TRANSCRIPTION_MODEL=/)
  assert.match(env, /OPENAI_VISION_MODEL=/)
})
