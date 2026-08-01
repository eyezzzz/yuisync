import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('dashboard troca cards de status por contagens de banhos e tosas', async () => {
  const source = await read('src/modules/petshop/components/DashboardServiceKpiEnhancer.jsx')

  assert.match(source, /cardByLabel\('Confirmados'\)/)
  assert.match(source, /label: 'Banhos'/)
  assert.match(source, /cardByLabel\('Em andamento'\)/)
  assert.match(source, /label: 'Tosas'/)
  assert.match(source, /CANCELLED_STATUSES/)
  assert.match(source, /service_items/)
  assert.match(source, /petshop_services/)
})

test('dashboard carrega o aprimorador apenas na rota correspondente', async () => {
  const source = await read('src/config/modules.jsx')

  assert.match(source, /DashboardServiceKpiEnhancer/)
  assert.match(source, /DashboardWithServiceKpis/)
  assert.match(source, /dashboard: getPageComponent\(DashboardWithServiceKpis\)/)
})

test('cards compactos mantem a linha de responsavel visivel', async () => {
  const source = await read('src/modules/petshop/components/AgendaCardLayoutEnhancer.jsx')

  assert.match(source, /data-yuisync-density='compact'[^}]+yuisync-card-responsible/s)
  assert.match(source, /display: block !important/)
  assert.match(source, /text-overflow: ellipsis !important/)
})
