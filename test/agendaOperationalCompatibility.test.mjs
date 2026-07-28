import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('agenda operacional nao injeta scripts globais no bootstrap', async () => {
  const main = await read('src/main.jsx')
  const modules = await read('src/config/modules.jsx')
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')

  assert.doesNotMatch(main, /agendaOperationalFixes/)
  assert.match(modules, /AgendaIntegratedPage/)
  assert.match(integrated, /AgendaStablePage/)
})

test('implementacao estavel usa um observer local e arraste por ponteiro', async () => {
  const stable = await read('src/modules/petshop/pages/AgendaStablePage.jsx')
  const styles = await read('src/modules/petshop/pages/AgendaStablePage.css')

  assert.match(stable, /observer\.observe\(pageRoot, \{ childList: true, subtree: true \}\)/)
  assert.match(stable, /pageRoot\.addEventListener\('pointerdown'/)
  assert.match(stable, /document\.addEventListener\('pointermove'/)
  assert.match(stable, /document\.addEventListener\('pointerup'/)
  assert.doesNotMatch(stable, /dragstart|dragover|dropEffect/)
  assert.match(styles, /background: linear-gradient/)
  assert.match(styles, /#065f46/)
})
