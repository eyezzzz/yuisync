import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('estagio preserva horario e detecta qualquer semana recorrente de hoje', async () => {
  const sql = await read('supabase/migrations/20260801102950_petshop_package_today_recovery_stage.sql')

  assert.match(sql, /original_first_appointment_at timestamptz not null/)
  assert.match(sql, /today_appointment_at timestamptz not null/)
  assert.match(sql, /scheduled_at::date = current_date/)
  assert.match(sql, /join lateral/)
  assert.match(sql, /date_trunc\('day', stage\.today_appointment_at\)/)
  assert.match(sql, /interval '23 hours 59 minutes 59 seconds'/)
  assert.doesNotMatch(sql, /subscription\.first_appointment_at::date = current_date/)
  assert.match(sql, /subscription_benefit_status = 'reserved'/)
})

test('restauracao devolve exatamente o horario original e remove tabela temporaria', async () => {
  const sql = await read('supabase/migrations/20260801103500_petshop_package_today_recovery_restore.sql')

  assert.match(sql, /first_appointment_at = stage\.original_first_appointment_at/)
  assert.match(sql, /drop table if exists public\._yuisync_package_today_recovery_stage/)
  assert.match(sql, /to_regclass\('public\._yuisync_package_today_recovery_stage'\)/)
})
