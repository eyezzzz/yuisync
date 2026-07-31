import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('dashboard resolve codigo interno pelo catalogo e padroniza especie', async () => {
  const enhancer = await read('src/modules/petshop/components/DashboardAgendaLabelsEnhancer.jsx')
  const router = await read('src/router/AppRouter.jsx')

  assert.match(enhancer, /from\('petshop_services'\)/)
  assert.match(enhancer, /\.select\('id,code,name'\)/)
  assert.match(enhancer, /\^catalog_/)
  assert.match(enhancer, /Serviço agendado/)
  assert.match(enhancer, /dog: 'CÃO'/)
  assert.match(enhancer, /cat: 'GATO'/)
  assert.match(enhancer, /agenda de hoje/)
  assert.match(router, /DashboardAgendaLabelsEnhancer/)
  assert.match(router, /<DashboardAgendaLabelsEnhancer \/>/)
})
