import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const migrationPath = new URL('../supabase/migrations/20260808122000_reopen_completed_appointments_and_sync_service_duration.sql', import.meta.url)
const sql = fs.readFileSync(migrationPath, 'utf8')

test('reopening a consumed package appointment reverses the benefit instead of leaving it locked', () => {
  assert.match(sql, /reverse_petshop_consumed_subscription_benefit/)
  assert.match(sql, /old\.status in \('concluido', 'completed', 'finalizado'\)/)
  assert.match(sql, /new\.status not in \('concluido', 'completed', 'finalizado'\)/)
  assert.match(sql, /subscription_benefit_status := 'reserved'/)
  assert.match(sql, /subscription_benefit_status := 'released'/)
})

test('reopening an appointment already posted to cash remains protected', () => {
  assert.match(sql, /from public\.sales sale/)
  assert.match(sql, /Estorne o lançamento antes de reabrir o agendamento/)
})

test('legacy reopened appointments with consumed package state are repaired without touching sales', () => {
  assert.match(sql, /appointment\.status not in \('concluido', 'completed', 'finalizado'\)/)
  assert.match(sql, /appointment\.subscription_benefit_status = 'consumed'/)
  assert.match(sql, /not exists \(\s*select 1\s*from public\.sales sale/s)
})

test('product service duration is backfilled and kept synchronized with the operational catalog', () => {
  assert.match(sql, /petshop_product_service_duration/)
  assert.match(sql, /'duration_min'/)
  assert.match(sql, /'service_duration_min'/)
  assert.match(sql, /update public\.petshop_services service[\s\S]*from public\.products product/)
  assert.match(sql, /zz_sync_petshop_service_duration_from_product/)
})
