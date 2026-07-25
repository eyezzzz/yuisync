import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('server and dashboard persist and sort authoritative chat turn versions', async () => {
  const [chatServer, chatHook] = await Promise.all([
    read('server/lib/chat.js'),
    read('src/shared/hooks/useChat.js'),
  ])
  assert.match(chatServer, /dashboard_turn_version: assistantDashboardTurnVersion\(options\)/)
  assert.match(chatServer, /assistantMetadata\?\.dashboard_turn_version/)
  assert.match(chatHook, /message\.metadata\?\.dashboard_turn_version/)
  assert.match(chatHook, /if \(leftVersion > 0 && rightVersion > 0\)/)
  assert.match(chatHook, /CHAT_ROLE_ORDER/)
})

test('pricing disputes hand off without debating the amount', async () => {
  const chatServer = await read('server/lib/chat.js')
  assert.match(chatServer, /detectPetbotPricingConcern/)
  assert.match(chatServer, /Dúvida ou contestação sobre precificação/)
  assert.match(chatServer, /vou chamar um atendente/)
})

test('agenda uses operational responsible fields instead of login profiles', async () => {
  const [agenda, appointments, migration] = await Promise.all([
    read('src/modules/petshop/pages/AgendaPage.jsx'),
    read('src/shared/hooks/useAppointments.js'),
    read('supabase/migrations/20260725002000_petshop_pr61_operational_scheduling.sql'),
  ])
  assert.match(agenda, /responsible_staff_key/)
  assert.match(agenda, /petshop_operational_staff/)
  assert.match(appointments, /responsible_staff_name/)
  assert.match(migration, /não representa login ou profile/)
})
