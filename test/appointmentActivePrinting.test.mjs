import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('agenda permite imprimir agendamentos ativos e a agenda completa do dia', async () => {
  const modules = await read('src/config/modules.jsx')
  const source = await read('src/modules/petshop/pages/AgendaWorkspacePage.jsx')

  assert.match(modules, /AgendaWorkspacePage/)
  assert.match(source, /NON_OPERATIONAL_STATUSES = new Set\(\['cancelado', 'no_show'\]\)/)
  assert.match(source, /FICHA DE AGENDAMENTO/)
  assert.match(source, /FICHA DE ATENDIMENTO/)
  assert.match(source, /Imprimir agenda do dia/)
  assert.match(source, /CONTROLE INTERNO/)
  assert.match(source, /printThermalReceipt\(printWindow\)/)
  assert.match(source, /@page \{ margin: 0; \}/)
  assert.match(source, /width: 80mm/)
  assert.doesNotMatch(source, /filter\(\(appointment\) => appointment\.status === 'concluido'\)/)
})
