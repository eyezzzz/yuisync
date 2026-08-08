import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const migrationPath = new URL('../supabase/migrations/20260808153000_repair_stale_consumed_open_appointments.sql', import.meta.url)
const sql = fs.readFileSync(migrationPath, 'utf8')
const preopenMigrationPath = new URL('../supabase/migrations/20260808160000_preopen_consumed_appointment_before_service_edit.sql', import.meta.url)
const preopenSql = fs.readFileSync(preopenMigrationPath, 'utf8')
const orphanMigrationPath = new URL('../supabase/migrations/20260808163500_release_orphan_consumed_open_appointment.sql', import.meta.url)
const orphanSql = fs.readFileSync(orphanMigrationPath, 'utf8')

test('repara beneficio consumido legado antes de recalcular uma edicao aberta', () => {
  assert.match(sql, /repair_petshop_reopened_consumed_appointment/)
  assert.match(sql, /status not in \('concluido', 'completed', 'finalizado'\)/)
  assert.match(sql, /subscription_benefit_status = 'consumed'/)
  assert.match(sql, /perform public\.repair_petshop_reopened_consumed_appointment\(p_appointment_id\)/)
  assert.match(sql, /subscription_benefit_status = 'released'/)
  assert.match(sql, /create or replace function public\.update_petshop_appointment_transaction/)
})

test('nao altera silenciosamente atendimento que ja foi lancado no caixa', () => {
  assert.match(sql, /from public\.sales sale/)
  assert.match(sql, /Estorne o lançamento antes de alterar serviço ou transporte/)
})

test('faz saneamento imediato apenas em atendimentos abertos sem venda', () => {
  assert.match(sql, /appointment\.status not in \('concluido', 'completed', 'finalizado'\)/)
  assert.match(sql, /appointment\.subscription_benefit_status = 'consumed'/)
  assert.match(sql, /not exists \(\s*select 1\s*from public\.sales sale/s)
})

test('reabre status antes de trocar servico quando o save envia tudo na mesma transacao', () => {
  assert.match(preopenSql, /rename to update_petshop_appointment_transaction_core/)
  assert.match(preopenSql, /v_current\.status in \('concluido', 'completed', 'finalizado'\)/)
  assert.match(preopenSql, /v_current\.subscription_benefit_status = 'consumed'/)
  assert.match(preopenSql, /update public\.appointments\s+set status = v_requested_status/s)
  assert.match(preopenSql, /repair_petshop_reopened_consumed_appointment\(p_appointment_id\)/)
  assert.match(preopenSql, /update_petshop_appointment_transaction_core\(\s*p_appointment_id,\s*p_payload/s)
})

test('libera marcador consumed orfao mesmo quando subscription_id ja foi perdido', () => {
  assert.match(orphanSql, /release_orphan_consumed_petshop_appointment/)
  assert.match(orphanSql, /subscription_benefit_status <> 'consumed'/)
  assert.match(orphanSql, /if v_appointment\.subscription_id is not null then/)
  assert.match(orphanSql, /subscription_benefit_used = false/)
  assert.match(orphanSql, /subscription_benefit_status = 'released'/)
  assert.match(orphanSql, /if v_current\.status not in \('concluido', 'completed', 'finalizado'\)[\s\S]*v_current\.subscription_benefit_status = 'consumed'/)
  assert.doesNotMatch(orphanSql, /and v_current\.subscription_id is not null\s*then\s*perform public\.release_orphan_consumed_petshop_appointment/)
})
