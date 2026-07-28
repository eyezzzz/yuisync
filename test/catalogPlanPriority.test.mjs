import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildCatalogUsageSummary,
  matchActiveSubscriptionByText,
  normalizeCatalogPlanServices,
  planEntryForCatalogService,
} from '../src/modules/petshop/lib/catalogPlanServices.js'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

const catalogService = {
  code: 'catalog_banho_pequeno_0_10',
  name: 'BANHO PET PORTE PEQUENO 0 a 10kg todas as pelagens',
  group_type: 'banho_tosa',
  default_price: 55,
}

test('plano preserva código, nome e grupo do serviço real', () => {
  const entry = planEntryForCatalogService(catalogService, 4)
  assert.deepEqual(entry, {
    service_type: 'catalog_banho_pequeno_0_10',
    service_code: 'catalog_banho_pequeno_0_10',
    service_name: 'BANHO PET PORTE PEQUENO 0 a 10kg todas as pelagens',
    service_kind: 'catalog',
    transport_mode: null,
    group_type: 'banho_tosa',
    qty_per_cycle: 4,
  })
})

test('uso do pacote é calculado pelo código real e MotoDog separado', () => {
  const subscription = {
    services_used: {
      catalog_banho_pequeno_0_10: 1,
      motodog: 2,
    },
    subscription_plans: {
      services: [
        planEntryForCatalogService(catalogService, 4),
        { service_type: 'motodog', service_name: 'MotoDog - buscar e levar', service_kind: 'transport', qty_per_cycle: 4 },
      ],
    },
  }

  const summary = buildCatalogUsageSummary(subscription, [catalogService])
  assert.equal(summary[0].label, catalogService.name)
  assert.equal(summary[0].remaining, 3)
  assert.equal(summary[1].service_type, 'motodog')
  assert.equal(summary[1].remaining, 2)
})

test('cliente selecionado na agenda encontra a assinatura ativa pelo texto visual', () => {
  const subscription = {
    id: 'subscription-1',
    client_id: 'client-1',
    status: 'active',
    started_at: '2026-07-01',
    subscription_plans: { active: true, name: 'Pacote Banho Básico', services: [] },
    client: {
      id: 'client-1',
      owner_name: 'Marcos Antonio de Carvalho',
      pet_name: 'Thor',
      phone: '(11) 99999-1234',
      breed: 'Shih-tzu',
    },
  }

  assert.equal(
    matchActiveSubscriptionByText([subscription], 'Marcos Antonio de Carvalho Thor Shih-tzu (11) 99999-1234')?.id,
    'subscription-1',
  )
})

test('normalização mantém planos legados compatíveis até serem editados', () => {
  assert.deepEqual(normalizeCatalogPlanServices([
    { service_type: 'banho', qty_per_cycle: 4 },
  ]), [{
    service_type: 'banho',
    service_code: 'banho',
    service_name: 'Banho',
    service_kind: 'catalog',
    transport_mode: null,
    group_type: null,
    qty_per_cycle: 4,
  }])
})

test('agenda e editor usam pacote prioritário com serviços reais', async () => {
  const priority = await read('src/modules/petshop/pages/AgendaPackagePriority.jsx')
  const plans = await read('src/modules/petshop/pages/PlanosCatalogPage.jsx')
  const modules = await read('src/config/modules.jsx')
  const migration = await read('supabase/migrations/20260728004000_petshop_plan_appointment_benefits.sql')

  assert.match(priority, /Pacote ativo · prioridade/)
  assert.match(priority, /Serviços inclusos aparecem primeiro/)
  assert.match(priority, /R\$ 0,00/)
  assert.match(priority, /Esgotado neste ciclo/)
  assert.match(plans, /Serviço real/)
  assert.match(plans, /service_code/)
  assert.match(plans, /MotoDog - buscar e levar/)
  assert.match(modules, /AgendaPackageIntegratedPage/)
  assert.match(modules, /PlanosCatalogPage/)
  assert.match(migration, /array\[v_service\.code, v_generic_key\]/)
})
