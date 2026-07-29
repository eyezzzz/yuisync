import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const agenda = await readFile(new URL('../src/modules/petshop/pages/AgendaPackageInlinePanel.jsx', import.meta.url), 'utf8')
const agendaEntry = await readFile(new URL('../src/modules/petshop/pages/AgendaPackageIntegratedPage.jsx', import.meta.url), 'utf8')
const checkout = await readFile(new URL('../src/modules/petshop/pages/PackageActivationReliablePanel.jsx', import.meta.url), 'utf8')
const plansCheckout = await readFile(new URL('../src/modules/petshop/pages/PlanosCheckoutIntegratedPage.jsx', import.meta.url), 'utf8')
const modules = await readFile(new URL('../src/config/modules.jsx', import.meta.url), 'utf8')
const orders = await readFile(new URL('../src/modules/petshop/pages/OrdensBanhoTosaIntegratedPage.jsx', import.meta.url), 'utf8')

test('Agenda resolve assinatura pelo client_id antes do texto', () => {
  assert.match(agenda, /subscriptionForClient/)
  assert.match(agenda, /subscription\.client_id/)
  assert.match(agenda, /exactSubscription\s*\|\|\s*textSubscription/)
})

test('Agenda mantém compatibilidade com status e benefícios legados', () => {
  assert.match(agenda, /\['active', 'ativo', 'ativa'\]/)
  assert.match(agenda, /compatibleLegacyServices/)
  assert.match(agenda, /Plano legado reconhecido/)
  assert.match(agenda, /banho_e_tosa/)
})

test('Pacote aparece dentro do bloco nativo de seleção de serviços', () => {
  assert.match(agenda, /data-yuisync-inline-package-root/)
  assert.match(agenda, /label\.insertAdjacentElement\('afterend', root\)/)
  assert.match(agenda, /Pacote ativo · prioridade/)
  assert.match(agendaEntry, /AgendaPackageInlinePanel/)
  assert.doesNotMatch(agendaEntry, /AgendaPackageReliablePanel/)
})

test('Checkout finaliza pagamento e ativa pacote pela transação financeira', () => {
  assert.match(checkout, /checkout_petshop_subscription_transaction/)
  assert.match(checkout, /payment_method/)
  assert.match(checkout, /payment_splits/)
  assert.match(checkout, /Confirmar e ativar pacote/)
})

test('Pagamento do pacote permanece dentro da tela de Planos', () => {
  assert.match(plansCheckout, /PackageActivationReliablePanel/)
  assert.match(plansCheckout, /nextPage === 'ordens'/)
  assert.match(plansCheckout, /yuisync:subscription-pending-payment/)
  assert.match(modules, /PlanosCheckoutIntegratedPage/)
})

test('Ordens mantém o PDV de atendimentos Banho e Tosa', () => {
  assert.match(orders, /PackageActivationReliablePanel/)
  assert.doesNotMatch(orders, /PackageActivationPdvPanel/)
})
