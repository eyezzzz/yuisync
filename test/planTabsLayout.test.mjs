import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(
  new URL('../src/modules/petshop/pages/PlanosCheckoutIntegratedPage.jsx', import.meta.url),
  'utf8',
)

test('abas de Planos compartilham um unico wrapper de pagina', () => {
  const pageWrappers = source.match(/className="page(?:\s|\")/g) || []
  assert.equal(pageWrappers.length, 1)
  assert.match(source, /data-yuisync-plan-shell/)
  assert.match(source, /data-yuisync-plan-native-content/)
  assert.match(source, /data-yuisync-plans-checkout-section/)
})

test('pagina nativa incorporada nao cria outro viewport interno', () => {
  assert.match(source, /\[data-yuisync-plan-native-content\] > \.page/)
  assert.match(source, /height: auto !important/)
  assert.match(source, /overflow: visible !important/)
  assert.match(source, /padding: 0 !important/)
})
