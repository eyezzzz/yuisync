import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('equipe permite atribuir apenas servicos concluidos ainda sem responsavel', async () => {
  const [page, core] = await Promise.all([
    readFile(new URL('../src/modules/petshop/pages/EquipePage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/petshop/hooks/usePetshopAdvancedCore.js', import.meta.url), 'utf8'),
  ])
  assert.ok(page.includes('assignPendingServiceResponsible'))
  assert.ok(page.includes('Responsavel manual do servico'))
  assert.ok(page.includes('Selecionar responsavel'))
  assert.ok(core.includes('assignPendingServiceResponsible'))
  assert.ok(core.includes(".eq('status', 'concluido')"))
  assert.ok(core.includes(".is('responsible_staff_key', null)"))
  assert.ok(core.includes('responsible_staff_name: staffName'))
  assert.ok(core.includes('ja possui responsavel'))
})
