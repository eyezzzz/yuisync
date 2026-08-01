import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('historico fica visivel na grade de Clientes e Pets', async () => {
  const source = await read('src/modules/petshop/components/ClientHistoryButtonVisibilityFix.jsx')

  assert.match(source, /data-yuisync-add-pet-action/)
  assert.match(source, /yuisyncHistoryGridProxy/)
  assert.match(source, /proxy\.textContent = 'Abrir'/)
  assert.match(source, /MutationObserver/)
})

test('correcao de visibilidade e montada junto do historico', async () => {
  const source = await read('src/config/modules.jsx')

  assert.match(source, /ClientHistoryButtonVisibilityFix/)
  assert.match(source, /<ClientHistoryButtonVisibilityFix \/>/)
  assert.match(source, /<ClientHistoryGroomingEnhancer \/>/)
})
