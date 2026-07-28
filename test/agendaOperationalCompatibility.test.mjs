import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('agenda operacional nao injeta scripts globais no bootstrap', async () => {
  const main = await read('src/main.jsx')
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')

  assert.doesNotMatch(main, /agendaOperationalFixes/)
  assert.match(integrated, /AgendaResolvedPage/)
  assert.doesNotMatch(integrated, /AgendaStablePage/)
})

test('implementacao resolvida mantem um unico observer e uma unica barra de acoes', async () => {
  const resolved = await read('src/modules/petshop/pages/AgendaResolvedPage.jsx')
  const styles = await read('src/modules/petshop/pages/AgendaResolvedPage.css')

  assert.match(resolved, /new MutationObserver\(scheduleSync\)/)
  assert.match(resolved, /observer\.observe\(pageRoot, \{ childList: true, subtree: true \}\)/)
  assert.match(resolved, /data-yuisync-resolved-actions/)
  assert.match(resolved, /yuisync-resolved-native-print-hidden/)
  assert.match(styles, /yuisync-resolved-actions/)
})

test('agendamento ativo recebe mover imprimir e concluir', async () => {
  const resolved = await read('src/modules/petshop/pages/AgendaResolvedPage.jsx')

  assert.match(resolved, /const movable = appointment\.status !== 'concluido'/)
  assert.match(resolved, /const canComplete = appointment\.status !== 'concluido'/)
  assert.match(resolved, /data-yuisync-action=\"drag\"/)
  assert.match(resolved, /data-yuisync-action=\"print\"/)
  assert.match(resolved, /data-yuisync-action=\"complete\"/)
})
