import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Agenda envia o valor liquido calculado pelo pacote junto dos servicos', async () => {
  const agenda = await read('src/modules/petshop/pages/AgendaPage.jsx')

  assert.match(agenda, /packageAdjustedPrice/)
  assert.match(agenda, /packageServiceCodes\.has\(String\(service\.value\)\) \? 0/)
  assert.match(agenda, /services: form\.service_codes\.map\(\(code\) => \(\{ code \}\)\)/)
  assert.match(agenda, /price: serviceTotals\.price/)
})

test('RPC força nova resolução quando modal mostra pacote mas snapshot ainda é avulso', async () => {
  const migration = await read('supabase/migrations/20260811113000_force_package_recalculation_on_agenda_save.sql')

  assert.match(migration, /v_requested_service_price \+ 0\.005 < v_current_service_price/)
  assert.match(migration, /not coalesce\(v_current\.subscription_benefit_used, false\)/)
  assert.match(migration, /set service_items = '\[\]'::jsonb/)
  assert.match(migration, /update_petshop_appointment_transaction_core/)
})

test('falha de reserva nao converte pacote silenciosamente em atendimento avulso', async () => {
  const migration = await read('supabase/migrations/20260811113000_force_package_recalculation_on_agenda_save.sql')

  assert.match(migration, /if not coalesce\(v_after\.subscription_benefit_used, false\)/)
  assert.match(migration, /v_after\.subscription_id is null/)
  assert.match(migration, /O pacote exibido na Agenda nao pode mais ser reservado/)
})
