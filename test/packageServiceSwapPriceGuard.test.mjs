import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

const migrationPath = 'supabase/migrations/20260814205500_fix_package_service_swap_price_guard.sql'

test('troca real de serviço não usa queda de preço como sinal de pacote', async () => {
  const sql = await read(migrationPath)

  assert.match(sql, /v_services_changed := v_requested_service_codes is distinct from v_current_service_codes/)
  assert.match(sql, /v_service_type_changed/)
  assert.match(sql, /if v_services_changed or v_service_type_changed then/)
  assert.match(sql, /v_safe_payload := v_safe_payload - 'price'/)
})

test('guard anterior de pacote é preservado para serviço sem mudança de código', async () => {
  const sql = await read(migrationPath)

  assert.match(sql, /rename to update_petshop_appointment_transaction_package_price_guard/)
  assert.match(sql, /return public\.update_petshop_appointment_transaction_package_price_guard\(/)
  assert.match(sql, /grant execute on function public\.update_petshop_appointment_transaction\(uuid, jsonb\)/)
})

test('proteção original contra pacote exibido mas não reservado continua instalada', async () => {
  const original = await read('supabase/migrations/20260811113000_force_package_recalculation_on_agenda_save.sql')

  assert.match(original, /v_requested_service_price \+ 0\.005 < v_current_service_price/)
  assert.match(original, /O pacote exibido na Agenda nao pode mais ser reservado/)
  assert.match(original, /update_petshop_appointment_transaction_core/)
})
