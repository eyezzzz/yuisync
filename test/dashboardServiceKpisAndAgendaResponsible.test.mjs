import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('dashboard e agenda trocam cards de status por contagens de banhos e tosas', async () => {
  const source = await read('src/modules/petshop/components/DashboardServiceKpiEnhancer.jsx')

  assert.match(source, /dashboardCardByLabel\('Confirmados', 'banhos'\)/)
  assert.match(source, /label: 'Banhos'/)
  assert.match(source, /dashboardCardByLabel\('Em andamento', 'tosas'\)/)
  assert.match(source, /label: 'Tosas'/)
  assert.match(source, /agendaCardByLabel\('Confirmados', 'banhos'\)/)
  assert.match(source, /agendaCardByLabel\('Em andamento', 'tosas'\)/)
  assert.match(source, /selectedAgendaDateKey/)
  assert.match(source, /CANCELLED_STATUSES/)
  assert.match(source, /service_items/)
  assert.match(source, /petshop_services/)
})

test('aprimorador de KPIs esta montado nas rotas Dashboard e Agenda', async () => {
  const source = await read('src/config/modules.jsx')

  assert.match(source, /function DashboardWithServiceKpis/)
  assert.match(source, /function AgendaWithClientHistory/)
  assert.match(source, /AgendaPage \{\.\.\.props\} \/>[\s\S]*DashboardServiceKpiEnhancer/)
  assert.match(source, /dashboard: DashboardWithServiceKpis/)
  assert.match(source, /agenda: AgendaWithClientHistory/)
})

test('cards compactos mantem a linha de responsavel visivel', async () => {
  const source = await read('src/modules/petshop/components/AgendaCardLayoutEnhancer.jsx')

  assert.match(source, /data-yuisync-density='compact'[^}]+yuisync-card-responsible/s)
  assert.match(source, /display: block !important/)
  assert.match(source, /text-overflow: ellipsis !important/)
})
