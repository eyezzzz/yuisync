import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const migrationPath = new URL('../supabase/migrations/20260808153000_repair_stale_consumed_open_appointments.sql', import.meta.url)
const sql = fs.readFileSync(migrationPath, 'utf8')

test('repara beneficio consumido legado antes de recalcular uma edicao aberta', () => {
  assert.match(sql, /repair_petshop_reopened_consumed_appointment/)
  assert.match(sql, /status not in \('concluido', 'completed', 'finalizado'\)/)
  assert.match(sql, /subscription_benefit_status = 'consumed'/)
  assert.match(sql, /perform public\.repair_petshop_reopened_consumed_appointment\(p_appointment_id\)/)
  assert.match(sql, /subscription_benefit_status = 'released'/)
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
