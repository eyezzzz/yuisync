import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('agenda preserva a pagina original e integra as acoes nos cards existentes', async () => {
  const modules = await read('src/config/modules.jsx')
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')

  assert.match(modules, /AgendaIntegratedPage/)
  assert.match(integrated, /<AgendaPage \/>/)
  assert.doesNotMatch(integrated, /Operacao rapida da agenda/i)
  assert.doesNotMatch(integrated, /AgendaWorkspacePage/)
  assert.match(integrated, /data-yuisync-card-actions/)
  assert.match(integrated, /button\[aria-label\^="Agendar as "\]/)
  assert.match(integrated, /text\/yuisync-appointment/)
  assert.match(integrated, /update\(appointmentId, \{ scheduled_at: target\.toISOString\(\) \}\)/)
  assert.match(integrated, /updateStatus\(appointmentId, 'concluido'\)/)
  assert.match(integrated, /Imprimir dia/)
})

test('cupom integrado e compacto e nao imprime contato nem transporte', async () => {
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')

  assert.match(integrated, /\.receipt \{ width: 64mm; max-width: 64mm; margin: 0; \}/)
  assert.match(integrated, /body \{ font-family: Arial, Helvetica, sans-serif; padding: 3mm 0 3mm 2mm; \}/)
  assert.match(integrated, /FICHA DE AGENDAMENTO/)
  assert.match(integrated, /FICHA DE ATENDIMENTO/)
  assert.match(integrated, /CONTROLE:/)
  assert.match(integrated, /printThermalReceipt\(printWindow\)/)
  assert.doesNotMatch(integrated, /line\('Contato'/)
  assert.doesNotMatch(integrated, /line\('Transporte'/)
  assert.doesNotMatch(integrated, /appointmentTransport/)
})
