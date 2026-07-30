import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  activeSubscriptionForClient,
  buildCatalogUsageSummary,
} from '../src/modules/petshop/lib/catalogPlanServices.js'
import {
  appointmentServiceGroup,
  appointmentServiceKind,
  classifyAppointmentServiceGroup,
  serviceOptionsForAppointmentGroup,
} from '../src/modules/petshop/lib/appointmentServices.js'
import { serviceIcon } from '../src/modules/petshop/lib/petshopTeam.js'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

const namedComponent = (component) => component?.displayName || component?.name || ''

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

test('variacoes de tosa vencem classificacao legada incorreta', () => {
  const cases = [
    'Tosa higienica porte pequeno',
    'Tosagem na tesoura',
    'Tosar na maquina',
    'Trimming e acabamento',
    'Banho e tosa completa',
  ]

  cases.forEach((name) => {
    const service = { code: name, name, group_type: 'veterinaria', active: true }
    assert.equal(classifyAppointmentServiceGroup(service), 'banho_tosa')
    assert.ok(['tosa', 'banho_tosa'].includes(appointmentServiceKind(service)))
  })
})

test('todos os servicos reais de tosa permanecem no seletor nativo', () => {
  const services = [
    { code: 'banho', name: 'Banho pequeno', group_type: 'banho_tosa', active: true },
    ...Array.from({ length: 24 }, (_, index) => ({
      code: `tosa_${index + 1}`,
      name: `Tosa especial ${index + 1}`,
      group_type: index % 2 ? 'outro' : 'veterinaria',
      active: true,
    })),
  ]

  const options = serviceOptionsForAppointmentGroup(services, 'banho_tosa')
  assert.equal(options.length, 25)
  assert.equal(options.filter((service) => appointmentServiceKind(service) === 'tosa').length, 24)
})

test('agendamento antigo de tosa entra na aba banho e tosa mesmo com grupo errado', () => {
  assert.equal(appointmentServiceGroup({
    service_group: 'veterinaria',
    service_type: 'catalog_tosa_higienica',
    service_items: [{ name: 'Tosa higienica', group_type: 'veterinaria' }],
  }, []), 'banho_tosa')
})

test('icone diferencia tosa de banho usando nome e codigo reais', () => {
  assert.equal(namedComponent(serviceIcon({ name: 'Tosa na tesoura', icon: 'droplets' })), 'Scissors')
  assert.equal(namedComponent(serviceIcon({ name: 'Banho porte pequeno', icon: 'paw' })), 'Droplets')
})

test('agenda usa somente o modal React nativo para selecionar servicos', async () => {
  const agenda = await read('src/modules/petshop/pages/AgendaPage.jsx')
  const integration = await read('src/modules/petshop/pages/AgendaPackageIntegratedPage.jsx')

  assert.match(agenda, /serviceOptionsForAppointmentGroup/)
  assert.match(agenda, /availableServiceOptions/)
  assert.match(agenda, /role="listbox" aria-label="Servicos encontrados"/)
  assert.doesNotMatch(agenda, /\.slice\(0, 12\)/)
  assert.doesNotMatch(integration, /AgendaBookingEnhancements|AgendaPackageNativePanel|createPortal|MutationObserver/)
  assert.match(integration, /AgendaIntegratedPage setPage=\{setPage\}/)
})
