import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('camada operacional da agenda e carregada no bootstrap', async () => {
  const main = await read('src/main.jsx')
  assert.match(main, /import '\.\/agendaOperationalFixes'/)
})

test('camada operacional libera a faixa de horario e oculta impressao legada', async () => {
  const fixes = await read('src/agendaOperationalFixes.js')

  assert.match(fixes, /positioningWrapper\.style\.pointerEvents = 'none'/)
  assert.match(fixes, /card\.style\.pointerEvents = 'auto'/)
  assert.match(fixes, /button\.dataset\.yuisyncAction === 'print'/)
  assert.match(fixes, /description\.includes\('imprimir'\)/)
  assert.match(fixes, /setProperty\('display', 'none', 'important'\)/)
  assert.match(fixes, /MutationObserver/)
})
