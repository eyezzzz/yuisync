import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('historico usa o mesmo agrupamento da tela e tenta recarregar antes de falhar', async () => {
  const source = await read('src/modules/petshop/components/ClientHistoryGroomingEnhancer.jsx')

  assert.match(source, /groupPetsByTutor/)
  assert.match(source, /groupPetsByTutor\(clients\)/)
  assert.match(source, /groupClients\(await loadClients\(\)\)\.get\(groupKey\)/)
  assert.match(source, /Não foi possível identificar este tutor/)
  assert.doesNotMatch(source, /function clientGroupKey/)
})

test('acoes dos cards permanecem na mesma linha', async () => {
  const main = await read('src/main.jsx')
  const css = await read('src/petshopClientCards.css')

  assert.match(main, /petshopClientCards\.css/)
  assert.match(css, /data-yuisync-client-history/)
  assert.match(css, /data-yuisync-add-pet-action/)
  assert.match(css, /flex-wrap: nowrap/)
  assert.match(css, /white-space: nowrap/)
})

test('enriquecimento resolve pacote pelo cliente quando o snapshot nao traz subscription_id', async () => {
  const source = await read('src/modules/petshop/lib/packageCommissionOperations.js')

  assert.match(source, /unresolvedClientIds/)
  assert.match(source, /loadSubscriptionsByClients/)
  assert.match(source, /subscriptionByClient/)
  assert.match(source, /appointment\.subscription_id \|\| subscription\.id/)
})

test('comissao total usa R$ 2,50 para o banho do pacote, totalizando R$ 20,25', async () => {
  const { buildPackageCommissionAllocation } = await import('../src/modules/petshop/lib/packageCommissionOperations.js')
  const { appointmentCommissionLines } = await import('../src/modules/petshop/lib/teamCommissionSummary.js')

  const allocation = buildPackageCommissionAllocation({
    plan: {
      name: 'Pacote 4 banhos',
      price: 200,
      services: [{ service_type: 'banho_0_10', service_code: 'banho_0_10', qty_per_cycle: 4 }],
    },
    catalogServices: [{ code: 'banho_0_10', default_price: 55 }],
  })

  assert.equal(allocation.unit_values.get('banho_0_10'), 50)

  const appointments = [
    {
      id: 'avulso-banho-55',
      service_group: 'banho_tosa',
      service_items: [{ code: 'banho_0_10', name: 'Banho', group_type: 'banho_tosa', unit_price: 55 }],
    },
    {
      id: 'avulso-tosa-100',
      service_group: 'banho_tosa',
      service_items: [{ code: 'tosa_maquina', name: 'Tosa máquina', group_type: 'banho_tosa', unit_price: 100 }],
    },
    {
      id: 'avulso-banho-100',
      service_group: 'banho_tosa',
      service_items: [{ code: 'banho_grande', name: 'Banho', group_type: 'banho_tosa', unit_price: 100 }],
    },
    {
      id: 'pacote-banho-50',
      service_group: 'banho_tosa',
      subscription_benefit_used: true,
      package_commission: true,
      package_commission_unit_value: 50,
      service_items: [{
        code: 'banho_0_10',
        name: 'Banho',
        group_type: 'banho_tosa',
        unit_price: 0,
        package_covered: true,
        package_unit_price: 50,
      }],
    },
  ]

  const commissions = appointments.flatMap(appointmentCommissionLines).map((line) => line.commission)
  const total = commissions.reduce((sum, value) => sum + value, 0)

  assert.equal(commissions.at(-1), 2.5)
  assert.equal(Number(total.toFixed(2)), 20.25)
  assert.notEqual(Number((total + 0.25).toFixed(2)), 20.25)
})
