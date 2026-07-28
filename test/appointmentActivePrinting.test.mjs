import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('agenda permite imprimir agendamentos ativos com cupom compacto', async () => {
  const modules = await read('src/config/modules.jsx')
  const source = await read('src/modules/petshop/pages/AgendaWorkspacePage.jsx')

  assert.match(modules, /AgendaWorkspacePage/)
  assert.match(source, /NON_OPERATIONAL_STATUSES = new Set\(\['cancelado', 'no_show'\]\)/)
  assert.match(source, /FICHA DE AGENDAMENTO/)
  assert.match(source, /FICHA DE ATENDIMENTO/)
  assert.match(source, /Imprimir agenda do dia/)
  assert.match(source, /CONTROLE:/)
  assert.match(source, /printThermalReceipt\(printWindow\)/)
  assert.match(source, /@page \{ margin: 0; \}/)
  assert.match(source, /width: 80mm/)
  assert.match(source, /\.receipt \{ width: 64mm/)
  assert.doesNotMatch(source, /line\('Contato'/)
  assert.doesNotMatch(source, /line\('Transporte'/)
  assert.doesNotMatch(source, /filter\(\(appointment\) => appointment\.status === 'concluido'\)/)
})

test('agenda oferece conclusao rapida e movimentacao em faixas de dez minutos', async () => {
  const source = await read('src/modules/petshop/pages/AgendaWorkspacePage.jsx')

  assert.match(source, /BOARD_SLOT_MINUTES = 10/)
  assert.match(source, /draggable=\{movable && !busy\}/)
  assert.match(source, /text\/yuisync-appointment/)
  assert.match(source, /handleMove\(appointmentId, minute\)/)
  assert.match(source, /scheduled_at: target\.toISOString\(\)/)
  assert.match(source, /updateStatus\(appointmentId, 'concluido'\)/)
  assert.match(source, /> Concluir/)
  assert.match(source, /> Imprimir/)
})
