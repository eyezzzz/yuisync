import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  isGroomingAppointment,
  isTosaCatalogService,
  matchActivePackageSubscription,
  packageCatalogEntries,
} from '../src/modules/petshop/lib/appointmentPackageUi.js'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

const activeSubscription = {
  id: 'subscription-1',
  status: 'active',
  started_at: '2026-07-01',
  subscription_plans: { active: true, name: 'Pacote Banho Basico' },
  client: {
    owner_name: 'Marcos Antonio Freitas Carvalho',
    pet_name: 'Bento',
    phone: '(32) 99999-1000',
  },
}

test('pacote ativo encontra nome composto mesmo com primeiro e ultimo nome visiveis', () => {
  const matched = matchActivePackageSubscription(
    [activeSubscription],
    'Marcos Carvalho · Bento',
  )
  assert.equal(matched?.id, 'subscription-1')
})

test('assinatura aguardando pagamento nao aparece como pacote ativo na agenda', () => {
  const matched = matchActivePackageSubscription(
    [{ ...activeSubscription, status: 'pending_payment' }],
    'Marcos Carvalho · Bento',
  )
  assert.equal(matched, null)
})

test('servicos de tosa cadastrados sao reconhecidos pela agenda', () => {
  assert.equal(isTosaCatalogService({ name: 'TOSA HIGIENICA PORTE PEQUENO' }), true)
  assert.equal(isTosaCatalogService({ name: 'BANHO PET PORTE PEQUENO' }), false)
})

test('agendamento legado de tosa entra no fechamento Banho & Tosa', () => {
  assert.equal(isGroomingAppointment({
    service_group: null,
    service_type: 'catalog_tosa_higienica',
    service_items: [{ name: 'Tosa higienica', group_type: 'banho_tosa' }],
  }), true)
})

test('pacote prioriza somente servicos reais do grupo atual', () => {
  const entries = packageCatalogEntries([
    { service_type: 'banho-real', service_kind: 'catalog', group_type: 'banho_tosa', catalog_service: { group_type: 'banho_tosa' }, remaining: 3 },
    { service_type: 'consulta-real', service_kind: 'catalog', group_type: 'veterinaria', catalog_service: { group_type: 'veterinaria' }, remaining: 1 },
    { service_type: 'motodog', service_kind: 'transport', remaining: 2 },
  ], 'banho_tosa')
  assert.deepEqual(entries.map((entry) => entry.service_type), ['banho-real'])
})

test('agenda nao monta mais observador ou portal para completar o seletor', async () => {
  const agenda = await read('src/modules/petshop/pages/AgendaPage.jsx')
  const integration = await read('src/modules/petshop/pages/AgendaPackageIntegratedPage.jsx')
  assert.match(agenda, /serviceOptionsForAppointmentGroup/)
  assert.match(agenda, /role="listbox" aria-label="Servicos encontrados"/)
  assert.doesNotMatch(agenda, /\.slice\(0, 12\)/)
  assert.doesNotMatch(integration, /AgendaBookingEnhancements|AgendaPackageNativePanel|createPortal|MutationObserver/)
})

test('modal nativo mostra pacote prioritario e todos os servicos reais', async () => {
  const agenda = await read('src/modules/petshop/pages/AgendaPage.jsx')
  assert.match(agenda, /Pacote ativo · prioridade/)
  assert.match(agenda, /availableServiceOptions/)
  assert.match(agenda, /Buscar e adicionar servico|Buscar servico para adicionar/i)
  assert.doesNotMatch(agenda, /\.slice\(0, 12\)/)
})

test('ordens possui aba Banho & Tosa e fechamento transacional idempotente', async () => {
  const orders = await read('src/modules/petshop/pages/OrdensBanhoTosaIntegratedPage.jsx')
  const panel = await read('src/modules/petshop/pages/BanhoTosaPdvPanel.jsx')
  const migration = await read('supabase/migrations/20260729093000_petshop_appointment_pdv_checkout.sql')

  assert.match(orders, /Banho & Tosa/)
  assert.match(panel, /checkout_petshop_appointment_transaction/)
  assert.match(panel, /Conferir pagamento e lancar no caixa/)
  assert.match(panel, /Nenhuma cobranca adicional e nenhuma nova receita/)
  assert.match(migration, /sales_tenant_appointment_unique/)
  assert.match(migration, /'agenda'/)
  assert.match(migration, /appointment_id/)
  assert.doesNotMatch(migration, /update public\.products\s+set stock_quantity/i)
})

test('pacote e vendido antes de liberar saldo e abre o pagamento no nome do cliente', async () => {
  const hook = await read('src/modules/petshop/hooks/useCatalogPlans.js')
  const integration = await read('src/modules/petshop/pages/PlanosNativePage.jsx')
  const packagePanel = await read('src/modules/petshop/pages/PackageActivationPdvPanel.jsx')
  const migration = await read('supabase/migrations/20260729092950_petshop_subscription_checkout.sql')

  assert.match(hook, /pending_payment/)
  assert.match(hook, /yuisync:subscription-pending-payment/)
  assert.match(integration, /Continuar para pagamento/)
  assert.match(integration, /setPage\?\.\('ordens'\)/)
  assert.match(packagePanel, /Receber e ativar pacote/)
  assert.match(packagePanel, /checkout_petshop_subscription_transaction/)
  assert.match(migration, /sales_tenant_subscription_unique/)
  assert.match(migration, /source,[\s\S]*'assinatura'/)
  assert.match(migration, /set status = 'active'/)
  assert.match(migration, /services_used = '\{\}'::jsonb/)
})
