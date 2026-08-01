import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('troca de servico recalcula a duracao total sem sobrescrever ao apenas abrir', async () => {
  const source = await read('src/modules/petshop/components/DashboardAgendaLabelsEnhancer.jsx')

  assert.match(source, /const agendaDurationState = new WeakMap\(\)/)
  assert.match(source, /selectedAgendaServiceSignature/)
  assert.match(source, /if \(previous === undefined\)/)
  assert.match(source, /if \(previous === signature\) return/)
  assert.match(source, /reduce\(\(sum, row\) => sum \+ durationFromSelectedServiceRow\(row\), 0\)/)
  assert.match(source, /setReactInputValue\(durationInput, nextValue\)/)
  assert.match(source, /enhanceAgendaDurationAfterServiceChange\(\)/)
})
