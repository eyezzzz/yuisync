import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const tabs = await readFile(new URL('../src/modules/petshop/pages/PlanosCheckoutIntegratedPage.jsx', import.meta.url), 'utf8')
const checkout = await readFile(new URL('../supabase/migrations/20260729092950_petshop_subscription_checkout.sql', import.meta.url), 'utf8')
const sourceFix = await readFile(new URL('../supabase/migrations/20260729121500_sales_subscription_source.sql', import.meta.url), 'utf8')

test('Planos possui aba dedicada de pagamentos', () => {
  assert.match(tabs, /Planos e assinantes/)
  assert.match(tabs, /Pagamentos/)
  assert.match(tabs, /activeTab === 'planos'/)
  assert.match(tabs, /PackageActivationReliablePanel/)
})

test('Nova assinatura abre automaticamente a aba Pagamentos', () => {
  assert.match(tabs, /nextPage === 'ordens'/)
  assert.match(tabs, /setActiveTab\('pagamentos'\)/)
  assert.match(tabs, /yuisync:subscription-pending-payment/)
})

test('Checkout financeiro grava a venda com origem assinatura', () => {
  assert.match(checkout, /'assinatura'/)
  assert.match(checkout, /checkout_petshop_subscription_transaction/)
  assert.match(checkout, /insert into public\.sales/)
})

test('Migration libera canais financeiros sem remover validacao de origem', () => {
  assert.match(sourceFix, /drop constraint if exists sales_source_check/)
  assert.match(sourceFix, /add constraint sales_source_check/)
  assert.match(sourceFix, /char_length\(btrim\(source\)\) between 1 and 64/)
  assert.match(sourceFix, /agenda ou assinatura/)
})
