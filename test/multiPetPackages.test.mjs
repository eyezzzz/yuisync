import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  activeSubscriptionsForClient,
  buildCombinedCatalogUsageSummary,
} from '../src/modules/petshop/lib/catalogPlanServices.js'
import {
  groupPetsByTutor,
  tutorIdentityKey,
} from '../src/shared/lib/petTutorGroups.js'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('agrupa pets ativos pelo grupo explícito, CPF ou telefone do tutor', () => {
  const pets = [
    { id: 'pet-1', owner_name: 'Ana', owner_cpf: '111.222.333-44', phone: '31999990000', pet_name: 'Mel' },
    { id: 'pet-2', owner_name: 'Ana', owner_cpf: '11122233344', phone: '31999990000', pet_name: 'Thor' },
    { id: 'pet-3', owner_name: 'Bia', phone: '31888880000', pet_name: 'Luna' },
  ]

  const groups = groupPetsByTutor(pets)
  assert.equal(groups.length, 2)
  assert.deepEqual(groups[0].pets.map((pet) => pet.pet_name), ['Mel', 'Thor'])
  assert.equal(tutorIdentityKey({ id: 'a', tutor_group_id: 'family-1' }), 'group:family-1')
})

test('ordena pacotes ativos do pet pelo ciclo que vence primeiro', () => {
  const subscriptions = [
    {
      id: 'newer',
      client_id: 'pet-1',
      status: 'active',
      next_billing_date: '2026-09-01',
      started_at: '2026-08-01',
      subscription_plans: { active: true, name: 'Banhos' },
    },
    {
      id: 'older',
      client_id: 'pet-1',
      status: 'active',
      next_billing_date: '2026-08-01',
      started_at: '2026-07-01',
      subscription_plans: { active: true, name: 'Banhos' },
    },
  ]

  assert.deepEqual(
    activeSubscriptionsForClient(subscriptions, 'pet-1').map((item) => item.id),
    ['older', 'newer'],
  )
})

test('soma saldos de compras iguais sem fundir os registros', () => {
  const plan = {
    active: true,
    name: 'Pacote 4 banhos',
    services: [{
      service_type: 'banho_pequeno',
      service_code: 'banho_pequeno',
      service_name: 'Banho pequeno',
      service_kind: 'catalog',
      group_type: 'banho_tosa',
      qty_per_cycle: 4,
    }],
  }
  const subscriptions = [
    {
      id: 'package-1',
      client_id: 'pet-1',
      status: 'active',
      services_used: { banho_pequeno: 4 },
      subscription_plans: plan,
    },
    {
      id: 'package-2',
      client_id: 'pet-1',
      status: 'active',
      services_used: { banho_pequeno: 0 },
      subscription_plans: plan,
    },
  ]
  const catalog = [{
    code: 'banho_pequeno',
    name: 'Banho pequeno',
    group_type: 'banho_tosa',
  }]

  assert.deepEqual(buildCombinedCatalogUsageSummary(subscriptions, catalog), [{
    service_type: 'banho_pequeno',
    service_code: 'banho_pequeno',
    service_name: 'Banho pequeno',
    service_kind: 'catalog',
    transport_mode: null,
    group_type: 'banho_tosa',
    qty_per_cycle: 4,
    label: 'Banho pequeno',
    catalog_service: catalog[0],
    used: 4,
    total: 8,
    remaining: 4,
    subscription_count: 2,
    subscription_ids: ['package-1', 'package-2'],
    plan_names: ['Pacote 4 banhos'],
  }])
})

test('fluxos manuais exigem pet apenas quando o tutor possui mais de um', async () => {
  const agenda = await read('src/modules/petshop/pages/AgendaPage.jsx')
  const plans = await read('src/modules/petshop/pages/PlanosNativePage.jsx')
  const pets = await read('src/modules/petshop/pages/PetsPage.jsx')
  const migration = await read('supabase/migrations/20260730190000_petshop_multi_pet_packages.sql')

  assert.match(agenda, /groupPetsByTutor/)
  assert.match(agenda, /Escolha o pet para este agendamento/)
  assert.match(plans, /Escolha qual pet receberá o pacote/)
  assert.match(pets, /Adicionar pet/)
  assert.match(migration, /reserve_petshop_client_subscription_benefit/)
  assert.match(migration, /next_billing_date asc nulls last/)
})
