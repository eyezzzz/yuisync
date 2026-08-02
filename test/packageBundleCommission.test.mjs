import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPackageCommissionAllocation,
  buildPackageCommissionItems,
} from '../src/modules/petshop/lib/packageCommissionOperations.js'
import {
  appointmentCommissionLines,
  buildCommissionRows,
} from '../src/modules/petshop/lib/teamCommissionSummary.js'

test('pacote preserva escovacao em 10, desconta somente banhos e exclui MotoDog', () => {
  const allocation = buildPackageCommissionAllocation({
    plan: {
      name: 'Pacote completo',
      price: 320,
      services: [
        { service_type: 'banho_0_10', service_code: 'banho_0_10', qty_per_cycle: 4 },
        { service_type: 'escovacao', service_code: 'escovacao', qty_per_cycle: 4 },
        { service_type: 'motodog', qty_per_cycle: 4, group_type: 'transport' },
      ],
    },
    catalogServices: [
      { code: 'banho_0_10', name: 'Banho pequeno', group_type: 'banho_tosa', default_price: 55 },
      { code: 'escovacao', name: 'Escovacao', group_type: 'banho_tosa', default_price: 10 },
    ],
    settings: { pet_transport_fee: 20 },
  })

  assert.equal(allocation.transport_total, 80)
  assert.equal(allocation.service_pool, 240)
  assert.equal(allocation.unit_values.get('banho_0_10'), 50)
  assert.equal(allocation.unit_values.get('escovacao'), 10)

  const items = buildPackageCommissionItems({
    allocation,
    items: [{
      code: 'banho_0_10',
      name: 'Banho pequeno',
      group_type: 'banho_tosa',
      unit_price: 0,
      benefit_used: true,
    }],
  })

  assert.equal(items.length, 2)
  assert.equal(items.find((item) => item.code === 'banho_0_10').package_unit_price, 50)
  assert.equal(items.find((item) => item.code === 'escovacao').package_unit_price, 10)
  assert.equal(items.some((item) => /motodog/i.test(item.code || '')), false)

  const appointment = {
    id: 'package-bath-brush',
    service_group: 'banho_tosa',
    package_commission: true,
    subscription_benefit_used: true,
    service_items: items,
    responsible_staff_key: 'esteticista-1',
    responsible_staff_name: 'Estefanea',
  }
  const lines = appointmentCommissionLines(appointment)

  assert.deepEqual(lines.map((line) => line.revenue), [50, 10])
  assert.equal(Number(lines.reduce((sum, line) => sum + line.commission, 0).toFixed(2)), 3)

  const [row] = buildCommissionRows(
    [appointment],
    [{ key: 'esteticista-1', name: 'Estefanea' }],
  )
  assert.equal(row.package_count, 1)
  assert.equal(row.package_revenue, 60)
  assert.equal(row.package_commission, 3)
})
