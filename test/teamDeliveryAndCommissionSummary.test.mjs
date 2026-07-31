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

test('comissoes separam banho, tipos de tosa e excluem MotoDog', async () => {
  const page = await read('src/modules/petshop/pages/EquipePage.jsx')
  const summary = await read('src/modules/petshop/lib/teamCommissionSummary.js')
  assert.match(page, /Tosa maquina\/total/)
  assert.match(page, /Tosa tesoura/)
  assert.match(page, /Imprimir resumo geral/)
  assert.match(page, /Zerar fechamento/)
  assert.match(page, /Editar nome da esteticista/)
  assert.match(page, /PETSHOP_COMMISSION_RESET_TEMPLATE_KEY/)
  assert.match(summary, /motodog/)
  assert.match(summary, /transportPattern/)
  assert.match(summary, /bath_count/)
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
