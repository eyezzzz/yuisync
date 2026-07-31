import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('transporte aparece logo apos o horario e antes dos nomes', async () => {
  const source = await read('src/modules/petshop/components/AgendaCardLayoutEnhancer.jsx')
  assert.match(source, /\.yuisync-card-header[\s\S]*order:\s*1\s*!important/)
  assert.match(source, /\.yuisync-card-transport[\s\S]*order:\s*2\s*!important/)
  assert.match(source, /\.yuisync-card-pet\s*\{\s*order:\s*3\s*!important/)
  assert.match(source, /data-yuisync-motodog='false'[\s\S]*display:\s*block\s*!important/)
  assert.match(source, /\.yuisync-card-transport > p:not\(:first-child\)[\s\S]*display:\s*none\s*!important/)
})

test('refinamento visual e montado somente no modulo petshop', async () => {
  const source = await read('src/router/AppRouter.jsx')
  assert.match(source, /import \{ AgendaCardLayoutEnhancer \}/)
  assert.match(source, /activeModuleId === 'petshop'[\s\S]*<AgendaCardLayoutEnhancer \/>/)
})
