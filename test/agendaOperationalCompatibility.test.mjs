import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('camada operacional da agenda e carregada no bootstrap', async () => {
  const main = await read('src/main.jsx')
  assert.match(main, /import '\.\/agendaOperationalFixes'/)
})

test('camada operacional mantem um unico botao, card verde e arraste nativo', async () => {
  const fixes = await read('src/agendaOperationalFixes.js')

  assert.match(fixes, /positioningWrapper\.style\.pointerEvents = 'none'/)
  assert.match(fixes, /card\.style\.pointerEvents = 'auto'/)
  assert.match(fixes, /keepSinglePrintButton/)
  assert.match(fixes, /yuisyncDuplicatePrint/)
  assert.match(fixes, /background-color: #065f46 !important/)
  assert.match(fixes, /contentButton\.draggable = movable/)
  assert.match(fixes, /text\/yuisync-appointment/)
  assert.match(fixes, /slotForVerticalPoint/)
  assert.match(fixes, /dispatchPointer\('pointerup'/)
  assert.match(fixes, /MutationObserver/)
})
