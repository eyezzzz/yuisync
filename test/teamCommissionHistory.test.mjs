import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('comissoes exibem historico detalhado por responsavel e permitem impressao', async () => {
  const [page, core] = await Promise.all([
    readFile(new URL('../src/modules/petshop/pages/EquipePage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/petshop/hooks/usePetshopAdvancedCore.js', import.meta.url), 'utf8'),
  ])
  assert.ok(core.includes(".not('responsible_staff_key', 'is', null)"))
  assert.ok(core.includes('serviceHistory'))
  assert.ok(page.includes('CommissionHistoryModal'))
  assert.ok(page.includes('Visualizar e imprimir historico'))
  assert.ok(page.includes('Tutor'))
  assert.ok(page.includes('Pet'))
  assert.ok(page.includes('Servico'))
  assert.ok(page.includes('Total conferido'))
  assert.ok(page.includes('printWindow.print()'))
})
