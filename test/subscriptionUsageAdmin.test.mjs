import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildEditableUsage,
  clampSubscriptionUsage,
  subscriptionMatchesSearch,
} from '../src/modules/petshop/lib/subscriptionUsageAdmin.js'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

const subscription = {
  id: 'subscription-1',
  status: 'active',
  services_used: {
    catalog_banho_pequeno: 1,
    motodog: 2,
    legacy_audit_key: 7,
  },
  client: {
    owner_name: 'Marcos Antônio Freitas Carvalho',
    pet_name: 'Bento',
    phone: '(32) 99999-1000',
  },
  subscription_plans: {
    name: 'Pacote Banho Básico Transporte',
    services: [
      {
        service_type: 'catalog_banho_pequeno',
        service_name: 'BANHO PET PORTE PEQUENO 0 KG A 10 KG',
        service_kind: 'catalog',
        qty_per_cycle: 4,
      },
      {
        service_type: 'motodog',
        service_name: 'MotoDog - buscar e levar',
        service_kind: 'transport',
        qty_per_cycle: 4,
      },
    ],
  },
}

test('pesquisa de assinantes combina tutor e pet por palavras fora de ordem', () => {
  assert.equal(subscriptionMatchesSearch(subscription, 'bento marcos'), true)
  assert.equal(subscriptionMatchesSearch(subscription, 'carvalho antonio'), true)
  assert.equal(subscriptionMatchesSearch(subscription, 'gabriel bento'), false)
})

test('pesquisa de assinantes ignora acentos e também encontra telefone e pacote', () => {
  assert.equal(subscriptionMatchesSearch(subscription, 'basico transporte'), true)
  assert.equal(subscriptionMatchesSearch(subscription, '99999 1000'), true)
  assert.equal(subscriptionMatchesSearch(subscription, 'marcos antonio'), true)
})

test('editor monta consumo atual e limite de cada benefício real', () => {
  assert.deepEqual(buildEditableUsage(subscription), [
    {
      service_type: 'catalog_banho_pequeno',
      service_name: 'BANHO PET PORTE PEQUENO 0 KG A 10 KG',
      total: 4,
      used: 1,
    },
    {
      service_type: 'motodog',
      service_name: 'MotoDog - buscar e levar',
      total: 4,
      used: 2,
    },
  ])
})

test('ajuste manual limita consumo entre zero e a quantidade contratada', () => {
  assert.deepEqual(clampSubscriptionUsage(subscription, {
    catalog_banho_pequeno: 99,
    motodog: -4,
  }), {
    catalog_banho_pequeno: 4,
    motodog: 0,
    legacy_audit_key: 7,
  })
})

test('tela de planos oferece pesquisa e edição manual sem migration adicional', async () => {
  const page = await read('src/modules/petshop/pages/PlanosPaymentIntegratedPage.jsx')
  assert.match(page, /Pesquisar por tutor, pet, telefone ou pacote/)
  assert.match(page, /Editar consumo/)
  assert.match(page, /client_subscriptions/)
  assert.match(page, /services_used/)
  assert.match(page, /Reduzir um consumo libera novamente unidades/)
})
