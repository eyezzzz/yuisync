import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('agenda operacional nao injeta scripts globais no bootstrap', async () => {
  const main = await read('src/main.jsx')
  const modules = await read('src/config/modules.jsx')

  assert.doesNotMatch(main, /agendaOperationalFixes/)
  assert.match(modules, /AgendaIntegratedPage/)
  assert.doesNotMatch(modules, /AgendaFinalPage/)
})

test('integracao mantem um unico botao card verde e arraste com autoscroll', async () => {
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')
  const styles = await read('src/modules/petshop/pages/AgendaIntegratedPage.css')

  assert.match(integrated, /outer\.style\.pointerEvents = 'none'/)
  assert.match(integrated, /card\.style\.pointerEvents = 'auto'/)
  assert.match(integrated, /data-yuisync-hidden-legacy-print/)
  assert.match(integrated, /dragstart/)
  assert.match(integrated, /dragover/)
  assert.match(integrated, /autoScrollTick/)
  assert.match(integrated, /slotAtPoint/)
  assert.match(styles, /background: linear-gradient/)
  assert.match(styles, /#065f46/)
})
