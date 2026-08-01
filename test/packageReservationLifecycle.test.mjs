import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildCatalogUsageSummary,
  buildCombinedCatalogUsageSummary,
} from '../src/modules/petshop/lib/catalogPlanServices.js'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

const plan = {
  services: [{
    service_type: 'banho_0_10',
    service_code: 'banho_0_10',
    service_name: 'Banho Pet Porte Pequeno 0 kg a 10 kg',
    service_kind: 'catalog',
    group_type: 'banho_tosa',
    qty_per_cycle: 4,
  }],
}

const catalog = [{
  code: 'banho_0_10',
  name: 'Banho Pet Porte Pequeno 0 kg a 10 kg',
  group_type: 'banho_tosa',
}]

test('reserva futura nao aparece como consumo realizado', () => {
  const usage = buildCatalogUsageSummary({
    subscription_plans: plan,
    services_used: { banho_0_10: 3 },
    services_reserved: { banho_0_10: 1 },
  }, catalog)

  assert.equal(usage[0].used, 3)
  assert.equal(usage[0].reserved, 1)
  assert.equal(usage[0].total, 4)
  assert.equal(usage[0].remaining, 0)
})

test('saldos combinados preservam consumido e reservado separadamente', () => {
  const usage = buildCombinedCatalogUsageSummary([
    {
      id: 'sub-1',
      subscription_plans: { ...plan, name: 'Pacote 1' },
      services_used: { banho_0_10: 2 },
      services_reserved: { banho_0_10: 1 },
    },
    {
      id: 'sub-2',
      subscription_plans: { ...plan, name: 'Pacote 2' },
      services_used: { banho_0_10: 1 },
      services_reserved: {},
    },
  ], catalog)

  assert.equal(usage[0].used, 3)
  assert.equal(usage[0].reserved, 1)
  assert.equal(usage[0].total, 8)
  assert.equal(usage[0].remaining, 4)
})

test('migration separa reserva, consumo, cancelamento e remarcacao', async () => {
  const sql = await read('supabase/migrations/20260801103000_petshop_package_reservation_lifecycle_all_services.sql')

  assert.match(sql, /add column if not exists services_reserved jsonb/)
  assert.match(sql, /v_used \+ v_reserved >= v_limit/)
  assert.match(sql, /v_action = 'consume'/)
  assert.match(sql, /v_reserved := v_reserved - 1/)
  assert.match(sql, /consume_petshop_subscription_benefit/)
  assert.match(sql, /new\.status in \('concluido', 'completed', 'finalizado'\)/)
  assert.match(sql, /new\.status in \('cancelado', 'no_show'\)/)
  assert.match(sql, /restore_petshop_appointment_benefits/)
  assert.match(sql, /accounting', 'reserved_ledger'/)
})

test('recorrencia inclui todos os servicos aplicaveis em cada semana', async () => {
  const sql = await read('supabase/migrations/20260801103000_petshop_package_reservation_lifecycle_all_services.sql')

  assert.match(sql, /jsonb_agg\(jsonb_build_object\(/)
  assert.match(sql, /'subscription_id', new\.id/)
  assert.match(sql, /qty_per_cycle[\s\S]*end > v_index/)
  assert.match(sql, /'services', v_week_services/)
  assert.match(sql, /for v_item in select \* from jsonb_array_elements\(v_week_services\)/)
  assert.match(sql, /repair_petshop_package_recurring_appointment/)
})

test('fechamento legado consome diretamente em vez de criar nova reserva', async () => {
  const sql = await read('supabase/migrations/20260801103100_petshop_package_completion_consumption.sql')

  assert.match(sql, /consume_petshop_subscription_benefit/)
  assert.doesNotMatch(sql, /reserve_petshop_subscription_benefit/)
})

test('banho principal sobe ao topo para buscas iniciadas por b, ba ou banho', async () => {
  const source = await read('src/modules/petshop/components/DashboardAgendaLabelsEnhancer.jsx')

  assert.match(source, /'banho'\.startsWith\(query\) \|\| query\.startsWith\('banho'\)/)
  assert.match(source, /label\.includes\('banho pet porte pequeno'\)/)
  assert.match(source, /label\.includes\('0 kg a 10 kg'\)/)
  assert.match(source, /listbox\.insertBefore\(primaryBath, listbox\.firstElementChild\)/)
})
