import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('estagio preserva horario e impede que hoje seja contado como legado na 1030', async () => {
  const sql = await read('supabase/migrations/20260801102950_petshop_package_today_recovery_stage.sql')

  assert.match(sql, /original_first_appointment_at timestamptz not null/)
  assert.match(sql, /first_appointment_at::date = current_date/)
  assert.match(sql, /scheduled_at::date = current_date/)
  assert.match(sql, /current_date \+ time '23:59:59'/)
  assert.match(sql, /subscription_benefit_status = 'reserved'/)
})

test('restauracao devolve exatamente o horario original e remove tabela temporaria', async () => {
  const sql = await read('supabase/migrations/20260801103500_petshop_package_today_recovery_restore.sql')

  assert.match(sql, /first_appointment_at = stage\.original_first_appointment_at/)
  assert.match(sql, /drop table if exists public\._yuisync_package_today_recovery_stage/)
  assert.match(sql, /to_regclass\('public\._yuisync_package_today_recovery_stage'\)/)
})
