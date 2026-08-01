import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('resumo geral de comissoes usa o mesmo fluxo termico seguro da agenda', async () => {
  const source = await read('src/modules/petshop/components/DashboardAgendaLabelsEnhancer.jsx')

  assert.match(source, /import \{ printThermalReceipt \} from '\.\.\/\.\.\/\.\.\/lib\/thermalPrint'/)
  assert.match(source, /window\.open\('', '_blank'\)/)
  assert.match(source, /printThermalReceipt\(printWindow\)/)
  assert.match(source, /@page \{ margin: 0; \}/)
  assert.match(source, /width: 80mm/)
  assert.match(source, /width: 64mm; max-width: 64mm/)
  assert.doesNotMatch(source, /size: 80mm auto/)
  assert.doesNotMatch(source, /A4 landscape/)
})

test('clique do resumo geral nao alcanca o impressor antigo', async () => {
  const source = await read('src/modules/petshop/components/DashboardAgendaLabelsEnhancer.jsx')

  assert.match(source, /normalizeText\(button\.textContent\) !== 'imprimir resumo geral'/)
  assert.match(source, /event\.preventDefault\(\)/)
  assert.match(source, /event\.stopPropagation\(\)/)
  assert.match(source, /event\.stopImmediatePropagation\(\)/)
  assert.match(source, /document\.addEventListener\('click', interceptCommissionPrint, true\)/)
  assert.match(source, /document\.removeEventListener\('click', interceptCommissionPrint, true\)/)
})
