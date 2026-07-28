import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { appointmentPriceBreakdown } from '../src/modules/petshop/pages/agendaOperationalCore.js'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const transportOptions = [
  { id: 'buscar_e_levar', label: 'Buscar e levar', fee: 20, active: true },
]

test('pacote pode abater banho e MotoDog sem recolocar tarifa no preview', () => {
  const bothCovered = appointmentPriceBreakdown({
    price: 0,
    transport_mode: 'buscar_e_levar',
    service_items: [{ code: 'banho_pequeno', unit_price: 0, catalog_price: 55, benefit_used: true }],
  }, transportOptions)

  assert.deepEqual(bothCovered, { service: 0, transport: 0, total: 0 })
})

test('pacote pode cobrir somente banho ou somente MotoDog', () => {
  const bathCovered = appointmentPriceBreakdown({
    price: 20,
    transport_mode: 'buscar_e_levar',
    service_items: [{ code: 'banho_pequeno', unit_price: 0, catalog_price: 55, benefit_used: true }],
  }, transportOptions)
  assert.deepEqual(bathCovered, { service: 0, transport: 20, total: 20 })

  const transportCovered = appointmentPriceBreakdown({
    price: 55,
    transport_mode: 'buscar_e_levar',
    service_items: [{ code: 'banho_pequeno', unit_price: 55, catalog_price: 55, benefit_used: false }],
  }, transportOptions)
  assert.deepEqual(transportCovered, { service: 55, transport: 0, total: 55 })
})

test('migration reserva, consome e devolve beneficios de banho e MotoDog', async () => {
  const migration = await read('supabase/migrations/20260728004000_petshop_plan_appointment_benefits.sql')

  assert.match(migration, /petshop_plan_service_key/)
  assert.match(migration, /array\[v_service\.code, v_generic_key\]/)
  assert.match(migration, /array\['motodog'\]/)
  assert.match(migration, /transport_mode[^\n]*buscar_e_levar|buscar_e_levar/)
  assert.match(migration, /subscription_benefit_status[^\n]*reserved/)
  assert.match(migration, /'consumed'/)
  assert.match(migration, /'released'/)
  assert.match(migration, /release_petshop_subscription_benefit/)
})

test('migration corrige o upsert legado de pets antes da policy RLS', async () => {
  const migration = await read('supabase/migrations/20260728004000_petshop_plan_appointment_benefits.sql')

  assert.match(migration, /fill_pet_tenant_from_client/)
  assert.match(migration, /before insert or update of id, module_id, tenant_id/)
  assert.match(migration, /new\.tenant_id is null/)
  assert.match(migration, /client\.id = new\.id/)
})

test('agenda troca R$ 0,00 por PACOTE BANHO no card diario', async () => {
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')

  assert.match(integrated, /applyPackageLabels/)
  assert.match(integrated, /PACOTE BANHO/)
  assert.match(integrated, /yuisync-package-label/)
  assert.match(integrated, /text\.includes\('banho'\)/)
})
