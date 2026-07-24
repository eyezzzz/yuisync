import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const chat = readFileSync(new URL('../server/lib/chat.js', import.meta.url), 'utf8')
const agent = readFileSync(new URL('../server/lib/petbotAgent.js', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../src/shared/pages/SettingsPage.jsx', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260724010000_store_and_booking_hours.sql', import.meta.url), 'utf8')

test('horário ocupado gera agenda do dia e bloqueia reutilização do mesmo instante', () => {
  assert.match(chat, /Agenda de \$\{dateLabel\}/)
  assert.match(chat, /rejected_occupied_slot/)
  assert.match(agent, /day_schedule: daySchedule/)
})

test('funcionamento da loja e janela de agendamento são configurações separadas', () => {
  assert.match(settings, /store_business_hours/)
  assert.match(settings, /Último horário/)
  assert.match(migration, /add column if not exists store_business_hours jsonb/)
  assert.match(migration, /v_setting_store_hours/)
})

test('pergunta informativa não é tratada como observação do serviço', () => {
  assert.match(chat, /isPetshopServiceKnowledgeQuestion/)
  assert.match(chat, /informationalServiceQuestion/)
})

test('adicionais são estruturados, recalculados e persistidos no agendamento', () => {
  assert.match(agent, /additional_services: additionalServices/)
  assert.match(chat, /additional_services: Array\.isArray\(args\.additional_services\)/)
  assert.match(migration, /service_items = v_service_items/)
  assert.match(migration, /v_subtotal := v_subtotal \+ v_additional_total/)
})

test('modalidade específica de tosa e itens físicos são protegidos', () => {
  assert.match(agent, /mergePetbotServiceType/)
  assert.match(agent, /previousIsSpecificGrooming/)
  assert.match(agent, /isClearlyPhysicalCatalogItem/)
  assert.doesNotMatch(migration, /store_period->>''|nullif\(v_item->>[^']+,[ ]*\)/)
})
