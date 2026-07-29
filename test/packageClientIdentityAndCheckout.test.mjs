import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const agenda = await readFile(new URL('../src/modules/petshop/pages/AgendaPackageReliablePanel.jsx', import.meta.url), 'utf8')
const agendaEntry = await readFile(new URL('../src/modules/petshop/pages/AgendaPackageIntegratedPage.jsx', import.meta.url), 'utf8')
const checkout = await readFile(new URL('../src/modules/petshop/pages/PackageActivationReliablePanel.jsx', import.meta.url), 'utf8')
const orders = await readFile(new URL('../src/modules/petshop/pages/OrdensBanhoTosaIntegratedPage.jsx', import.meta.url), 'utf8')

test('Agenda resolve assinatura pelo client_id antes do texto', () => {
  assert.match(agenda, /activeSubscriptionForResolvedClient/)
  assert.match(agenda, /subscription\.client_id/)
  assert.match(agenda, /exactSubscription\s*\|\|\s*textSubscription/)
})

test('Agenda mantém compatibilidade com status e benefícios legados', () => {
  assert.match(agenda, /\['active', 'ativo', 'ativa'\]/)
  assert.match(agenda, /compatibleLegacyServices/)
  assert.match(agenda, /Plano legado reconhecido/)
  assert.match(agenda, /banho_e_tosa/)
})

test('Agenda usa o painel confiável no fluxo publicado', () => {
  assert.match(agendaEntry, /AgendaPackageReliablePanel/)
  assert.doesNotMatch(agendaEntry, /AgendaPackageNativePanel/)
})

test('Checkout usa a mesma fonte de assinaturas da tela de Planos', () => {
  assert.match(checkout, /useCatalogPlans/)
  assert.match(checkout, /loadSubscriptions\(\)/)
  assert.match(checkout, /pending_payment/)
  assert.match(checkout, /yuisync:subscription-focus/)
})

test('Ordens renderiza o checkout confiável de pacotes', () => {
  assert.match(orders, /PackageActivationReliablePanel/)
  assert.doesNotMatch(orders, /PackageActivationPdvPanel/)
})
