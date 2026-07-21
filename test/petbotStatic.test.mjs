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
  assert.match(migration, /if v_order_type = 'produto' then[\s\S]*insert into public\.sale_items/)
  assert.match(localChat, /pet_name: cleanText\(args\.pet_name\)/)
  assert.match(webhook, /pet_name: clean\(args\.pet_name\)/)
  assert.match(migration, /insert into public\.pets/)
  assert.match(migration, /pet_id = v_pet_id/)
  assert.match(migration, /then 'banho_e_tosa'/)
  assert.match(migration, /then 'consulta'/)
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

test('ordens mantem cards ativos de hoje e historico concluido em tabela', () => {
  const page = read('src/modules/petshop/pages/OrdensEntregaPage.jsx')
  const hook = read('src/modules/petshop/hooks/usePetshopAdvanced.js')

  assert.match(page, /activeOrders/)
  assert.match(page, /completedOrders/)
  assert.match(page, /CompletedOrdersTable/)
  assert.match(page, /Historico de concluidas/)
  assert.match(page, /\.filter\(\(step\) => step\.id !== 'concluida'\)/)
  assert.match(hook, /excludeStatus/)
  assert.match(hook, /dateField/)
  assert.match(hook, /\.limit\(limit\)/)
})

test('PetBot usa temperatura 0.5 para respostas da LLM', () => {
  const localChat = read('server/lib/chat.js')
  const webhook = read('serverless/whatsappWebhook.ts')

  assert.match(localChat, /DEFAULT_BOT_TEMPERATURE = 0\.5/)
  assert.match(webhook, /temperature: 0\.5/)
  assert.doesNotMatch(webhook, /temperature: 0\.2/)
})

test('PetBot usa LLM como interpretador antes do guardiao', () => {
  const localChat = read('server/lib/chat.js')
  const webhook = read('serverless/whatsappWebhook.ts')
  const ai = read('server/lib/petbotAi.js')

  assert.match(ai, /interpretPetbotMessageWithLlm/)
  assert.match(ai, /redraftPetbotReplyWithLlm/)
  assert.match(localChat, /interpretPetbotMessageWithLlm/)
  assert.match(localChat, /interpretation: llmInterpretation/)
  assert.match(localChat, /redraftPetbotReplyWithLlm/)
  assert.match(webhook, /interpretPetbotMessageWithLlm/)
  assert.match(webhook, /interpretation: llmInterpretation/)
  assert.match(webhook, /redraftPetbotReplyWithLlm/)
})

test('WhatsApp e painel usam o mesmo runtime auditavel do PetBot', () => {
  const localChat = read('server/lib/chat.js')
  const webhook = read('serverless/whatsappWebhook.ts')
  const migration = read('supabase/migrations/20260720005000_petbot_autonomy_foundation.sql')

  assert.match(webhook, /respondToChatMessage\(supabase as any, session\.id, event\.text/)
  assert.match(webhook, /skipUserPersistence: true/)
  assert.match(webhook, /shared_petbot_runtime/)
  assert.match(localChat, /customInstructions/)
  assert.match(localChat, /recordPetbotEvent/)
  assert.match(localChat, /idempotency_key: `petbot:\$\{session\.id\}`/)
  assert.match(migration, /create table if not exists public\.petbot_events/)
  assert.match(migration, /payment_status := 'aguardando_comprovante'/)
  assert.match(migration, /grant execute on function public\.create_petbot_order_transaction\(jsonb\) to service_role/)
})

test('canario impede a criacao automatica fora dos contatos autorizados', () => {
  const localChat = read('server/lib/chat.js')
  const settings = read('src/shared/pages/SettingsPage.jsx')
  const migration = read('supabase/migrations/20260720006000_petbot_canary_controls.sql')

  assert.match(localChat, /function canPetbotCreateOrders/)
  assert.match(localChat, /canary_not_enabled_for_contact/)
  assert.match(localChat, /autonomyAllowlist/)
  assert.match(settings, /Autonomia do PetBot/)
  assert.match(settings, /Contatos autorizados no canario/)
  assert.match(migration, /default 'canary'/)
  assert.match(migration, /\('assist', 'canary', 'enabled'\)/)
})

test('fluxo legado do WhatsApp tem MotoDog, Pix e checklist configuraveis', () => {
  const migration = read('database/petshop_legacy_whatsapp_flow.sql')
  const settings = read('src/shared/pages/SettingsPage.jsx')
  const guard = read('server/lib/petbotGuard.js')

  assert.match(migration, /pet_transport_options/)
  assert.match(migration, /pix_key/)
  assert.match(migration, /payment_status/)
  assert.match(settings, /Opcoes MotoDog/)
  assert.match(settings, /Chave Pix/)
  assert.match(settings, /Mensagens padrao/)
  assert.match(guard, /buildPetbotConfirmationReply/)
  assert.match(guard, /aguardando_comprovante/)
})

test('PetBot exige servico exato por peso/pelo e possui fallback quando RPC nao foi aplicada', () => {
  const localChat = read('server/lib/chat.js')
  const agent = read('server/lib/petbotAgent.js')
  const migration = read('supabase/migrations/20260721002000_petbot_service_catalog_booking_fix.sql')

  assert.match(agent, /peso aproximado do pet/)
  assert.match(agent, /mergeInterpretedPetbotServiceFacts/)
  assert.match(agent, /specialized\.length/)
  assert.match(agent, /validateReply = null/)
  assert.match(localChat, /isMissingPetbotTransactionRpcError/)
  assert.match(localChat, /return createConfirmedPetshopOrder\(supabase, session, settings, args\)/)
  assert.match(localChat, /validatedAppointment\.id[\s\S]*from\('appointments'\)\.insert\(payload\)/)
  assert.match(localChat, /nunca afirme que pagamento antecipado e obrigatorio/i)
  assert.match(localChat, /Fatos estruturados interpretados da conversa/)
  assert.match(localChat, /const initialToolChoice = 'auto'/)
  assert.match(localChat, /validateReply:/)
  assert.doesNotMatch(localChat, /buildNaturalPetbotServiceQuestion/)
  assert.match(migration, /from public\.petshop_services/)
  assert.match(migration, /and code = v_service_type/)
  assert.match(migration, /v_subtotal := v_service\.default_price/)
  assert.match(migration, /insert into public\.appointments/)
})
