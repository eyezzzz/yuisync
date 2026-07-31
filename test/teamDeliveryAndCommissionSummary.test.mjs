import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('cliente e modal exibem todos os pets do tutor', async () => {
  const petsPage = await read('src/modules/petshop/pages/PetsPage.jsx')
  assert.match(petsPage, /Pets deste cliente/)
  assert.match(petsPage, /groupPetsByTutor/)
  assert.match(petsPage, /tutorPets/)
})

test('comissoes separam banho, tipos de tosa, pacote e excluem MotoDog', async () => {
  const page = await read('src/modules/petshop/pages/EquipePage.jsx')
  const summary = await read('src/modules/petshop/lib/teamCommissionSummary.js')
  assert.match(page, /Tosa maquina\/total/)
  assert.match(page, /Tosa tesoura/)
  assert.match(page, /<th>Pacote<\/th>/)
  assert.match(page, /Imprimir resumo geral/)
  assert.match(page, /Zerar fechamento/)
  assert.match(page, /Editar nome da esteticista/)
  assert.match(page, /PETSHOP_COMMISSION_RESET_TEMPLATE_KEY/)
  assert.match(summary, /motodog/)
  assert.match(summary, /transportPattern/)
  assert.match(summary, /bath_count/)
  assert.match(summary, /package_count/)
})

test('motoboys operacionais sao configurados sem login e usados em agenda e vendas', async () => {
  const operations = await read('shared/petshopOperations.js')
  const settings = await read('src/shared/pages/SettingsPage.jsx')
  const agenda = await read('src/modules/petshop/pages/AgendaPage.jsx')
  const sales = await read('src/modules/petshop/pages/VendasPage.jsx')
  assert.match(operations, /DEFAULT_PETSHOP_DELIVERY_STAFF/)
  assert.match(settings, /Equipe operacional de entregas/)
  assert.match(settings, /sem login/i)
  assert.match(agenda, /Motoboy responsavel/)
  assert.match(sales, /Motoboy da entrega/)
})

test('infraestrutura persiste responsavel manual e valor integral das entregas', async () => {
  const migration = await read('supabase/migrations/20260731120000_petshop_delivery_staff_and_totals.sql')
  const delivery = await read('src/modules/petshop/lib/deliveryOperations.js')
  assert.match(migration, /delivery_staff_key/)
  assert.match(migration, /assigned_staff_key/)
  assert.match(migration, /delivery_value/)
  assert.match(delivery, /loadDeliveryTeamSnapshot/)
  assert.match(delivery, /assignSaleDeliveryStaff/)
})

test('registros antigos genericos nao viram tosa automaticamente', async () => {
  const { appointmentCommissionLines, buildCommissionRows } = await import('../src/modules/petshop/lib/teamCommissionSummary.js')
  const appointment = {
    id: 'legacy-bath',
    service_type: 'banho_tosa',
    service_group: 'banho_tosa',
    service_items: [],
    price: 45,
    responsible_staff_key: 'esteticista-1',
    responsible_staff_name: 'Esteticista 1',
  }
  const lines = appointmentCommissionLines(appointment)
  assert.equal(lines[0].category, 'bath')
  assert.equal(lines[0].commission, 2.25)

  const rows = buildCommissionRows([appointment], [{ key: 'esteticista-1', name: 'Luana', active: true }])
  assert.equal(rows[0].collaborator_name, 'Luana')
  assert.equal(rows[0].bath_count, 1)
  assert.equal(rows[0].machine_grooming_count, 0)
})

test('banho com tosa higienica continua classificado como banho', async () => {
  const { appointmentCommissionLines } = await import('../src/modules/petshop/lib/teamCommissionSummary.js')
  const [line] = appointmentCommissionLines({
    id: 'bath-hygiene',
    service_group: 'banho_tosa',
    service_items: [{ name: 'Banho com tosa higienica', group_type: 'banho_tosa', unit_price: 50 }],
  })
  assert.equal(line.category, 'bath')
  assert.equal(line.rate, 0.05)
})

test('pacote de 280 com 80 de MotoDog gera quatro banhos de 50 e comissao de 2,50', async () => {
  const { buildPackageCommissionAllocation } = await import('../src/modules/petshop/lib/packageCommissionOperations.js')
  const { appointmentCommissionLines, buildCommissionRows } = await import('../src/modules/petshop/lib/teamCommissionSummary.js')
  const allocation = buildPackageCommissionAllocation({
    plan: {
      name: 'Pacote banho com MotoDog',
      price: 280,
      services: [
        { service_type: 'banho_0_10', service_code: 'banho_0_10', qty_per_cycle: 4 },
        { service_type: 'motodog', qty_per_cycle: 4, group_type: 'transport' },
      ],
    },
    catalogServices: [{ code: 'banho_0_10', default_price: 55 }],
    settings: { pet_transport_fee: 20 },
  })
  assert.equal(allocation.transport_total, 80)
  assert.equal(allocation.service_pool, 200)
  assert.equal(allocation.unit_values.get('banho_0_10'), 50)

  const appointment = {
    id: 'package-bath',
    service_group: 'banho_tosa',
    subscription_id: 'subscription-1',
    subscription_benefit_used: true,
    package_commission: true,
    package_plan_name: 'Pacote banho com MotoDog',
    package_commission_unit_value: 50,
    service_items: [{
      code: 'banho_0_10',
      name: 'Banho pequeno',
      group_type: 'banho_tosa',
      unit_price: 0,
      package_covered: true,
      package_unit_price: 50,
    }],
    responsible_staff_key: 'esteticista-1',
    responsible_staff_name: 'Luana',
  }
  const [line] = appointmentCommissionLines(appointment)
  assert.equal(line.revenue, 50)
  assert.equal(line.commission, 2.5)
  assert.equal(line.package_covered, true)

  const [row] = buildCommissionRows([appointment], [{ key: 'esteticista-1', name: 'Luana', active: true }])
  assert.equal(row.package_count, 1)
  assert.equal(row.package_revenue, 50)
  assert.equal(row.package_commission, 2.5)
  assert.equal(row.bath_count, 0)
})

test('relatorios do petshop possuem aba de servicos, graficos e comparacao financeira', async () => {
  const page = await read('src/modules/petshop/pages/PetshopReportsPage.jsx')
  const modules = await read('src/config/modules.jsx')
  assert.match(page, /Servicos & Comissoes/)
  assert.match(page, /Quantidade por origem/)
  assert.match(page, /Producao por esteticista/)
  assert.match(page, /Receita x comissao/)
  assert.match(page, /Pacotes executados/)
  assert.match(modules, /PetshopReportsPage/)
  assert.match(modules, /relatorios: PetshopReportsPage/)
})

test('migration replica no banco a base liquida dos pacotes', async () => {
  const migration = await read('supabase/migrations/20260731204500_petshop_package_net_commissions.sql')
  assert.match(migration, /petshop_package_service_unit_value/)
  assert.match(migration, /v_service_pool := greatest\(0, v_plan_price/)
  assert.match(migration, /v_transport_qty/)
  assert.match(migration, /package_count/)
  assert.match(migration, /package_commission/)
})
