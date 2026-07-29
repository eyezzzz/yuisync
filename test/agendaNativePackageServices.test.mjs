import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  activeSubscriptionForClient,
  buildCatalogUsageSummary,
} from '../src/modules/petshop/lib/catalogPlanServices.js'
import { classifyAppointmentServiceGroup } from '../src/modules/petshop/lib/appointmentServices.js'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('agenda resolve pacote ativo pelo id real do cliente', () => {
  const subscription = {
    id: 'sub-1',
    client_id: 'client-1',
    status: 'active',
    started_at: '2026-07-29',
    services_used: { banho_pequeno: 1 },
    subscription_plans: {
      active: true,
      name: 'Pacote Banho Basico',
      services: [{
        service_type: 'banho_pequeno',
        service_code: 'banho_pequeno',
        service_name: 'Banho pequeno',
        service_kind: 'catalog',
        group_type: 'banho_tosa',
        qty_per_cycle: 4,
      }],
    },
  }

  assert.equal(activeSubscriptionForClient([subscription], 'client-1')?.id, 'sub-1')
  const usage = buildCatalogUsageSummary(subscription, [{
    value: 'banho_pequeno',
    label: 'Banho pequeno',
    group_type: 'banho_tosa',
  }])
  assert.equal(usage[0].remaining, 3)
  assert.equal(usage[0].catalog_service?.value, 'banho_pequeno')
})

test('tosa cadastrada como outro continua classificada para banho e tosa', () => {
  assert.equal(classifyAppointmentServiceGroup({
    code: 'tosa_higienica_pequeno',
    name: 'Tosa higienica porte pequeno',
    group_type: 'outro',
    active: true,
  }), 'banho_tosa')
})

test('modal real renderiza pacote nativamente e nao limita tosas a 12 itens', async () => {
  const agenda = await read('src/modules/petshop/pages/AgendaPage.jsx')
  const integration = await read('src/modules/petshop/pages/AgendaPackageIntegratedPage.jsx')

  assert.match(agenda, /useCatalogPlans/)
  assert.match(agenda, /activeSubscriptionForClient\(subscriptions, form\.pet_id\)/)
  assert.match(agenda, /data-yuisync-native-package-panel/)
  assert.match(agenda, /Agenda nativa v1/)
  assert.match(agenda, /Pacote · R\$ 0,00/)
  assert.match(agenda, /setServicePickerOpen\(false\)/)
  assert.doesNotMatch(agenda, /\.slice\(0, 12\)/)
  assert.doesNotMatch(integration, /AgendaPackageInlinePanel/)
})
