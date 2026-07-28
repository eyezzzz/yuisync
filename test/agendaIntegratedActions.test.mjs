import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('agenda preserva a pagina original e integra as acoes nos cards existentes', async () => {
  const modules = await read('src/config/modules.jsx')
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')
  const finalPage = await read('src/modules/petshop/pages/AgendaFinalPage.jsx')

  assert.match(modules, /AgendaFinalPage/)
  assert.match(integrated, /<AgendaPage \/>/)
  assert.match(finalPage, /<AgendaIntegratedPage \/>/)
  assert.doesNotMatch(integrated, /Operacao rapida da agenda/i)
  assert.doesNotMatch(integrated, /AgendaWorkspacePage/)
  assert.match(integrated, /data-yuisync-card-actions/)
  assert.match(integrated, /button\[aria-label\^="Agendar as "\]/)
  assert.match(integrated, /update\(appointmentId, \{ scheduled_at: target\.toISOString\(\) \}\)/)
  assert.match(integrated, /updateStatus\(appointmentId, 'concluido'\)/)
  assert.match(integrated, /data-yuisync-action="complete"/)
  assert.match(integrated, /Imprimir dia/)
})

test('arraste usa ponteiro e atravessa o container absoluto ate a faixa de dez minutos', async () => {
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')
  const finalPage = await read('src/modules/petshop/pages/AgendaFinalPage.jsx')

  assert.match(integrated, /pointerdown/)
  assert.match(integrated, /pointermove/)
  assert.match(integrated, /pointerup/)
  assert.match(integrated, /elementFromPoint/)
  assert.match(finalPage, /outer\.style\.pointerEvents = 'none'/)
  assert.match(finalPage, /card\.style\.pointerEvents = 'auto'/)
})

test('cupom integrado e compacto mostra servico transporte total sem contato', async () => {
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')
  const finalPage = await read('src/modules/petshop/pages/AgendaFinalPage.jsx')

  assert.match(integrated, /\.receipt \{ width: 64mm; max-width: 64mm; margin: 0; \}/)
  assert.match(integrated, /body \{ font-family: Arial, Helvetica, sans-serif; padding: 3mm 0 3mm 2mm; \}/)
  assert.match(integrated, /FICHA DE AGENDAMENTO/)
  assert.match(integrated, /FICHA DE ATENDIMENTO/)
  assert.match(integrated, /line\('Servico', fmtCurrency\(servicePrice\)\)/)
  assert.match(integrated, /line\('Transporte', fmtCurrency\(transportFee\)\)/)
  assert.match(integrated, /<span>TOTAL<\/span>/)
  assert.match(integrated, /CONTROLE:/)
  assert.match(integrated, /printThermalReceipt\(printWindow\)/)
  assert.doesNotMatch(integrated, /line\('Contato'/)
  assert.match(finalPage, /data-yuisync-final-hidden-print/)
})

test('modal fecha seletor apos escolher e exibe duracao e total do tenant', async () => {
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')

  assert.match(integrated, /Servicos encontrados/)
  assert.match(integrated, /dispatchEvent\(new MouseEvent\('mousedown'/)
  assert.match(integrated, /resolvePetshopServiceDuration/)
  assert.match(integrated, /petshop_service_durations/)
  assert.match(integrated, /Servico/)
  assert.match(integrated, /Transporte/)
  assert.match(integrated, /modalTotal/)
})

test('logo termica e configuravel e substitui o cabecalho textual', async () => {
  const modules = await read('src/config/modules.jsx')
  const settings = await read('src/shared/pages/SettingsIntegratedPage.jsx')
  const finalPage = await read('src/modules/petshop/pages/AgendaFinalPage.jsx')
  const migration = await read('supabase/migrations/20260728002000_agenda_transport_duration_receipt_logo.sql')

  assert.match(modules, /SettingsIntegratedPage/)
  assert.match(settings, /Enviar arquivo/)
  assert.match(settings, /Preview da logo termica/)
  assert.match(settings, /receipt_logo_data_url/)
  assert.match(settings, /monochrome/)
  assert.match(finalPage, /applyReceiptLogo/)
  assert.match(finalPage, /data-yuisync-print-logo/)
  assert.match(migration, /add column if not exists receipt_logo_data_url text/)
})

test('banco preserva duracao efetiva e soma tarifa MotoDog ao valor final', async () => {
  const migration = await read('supabase/migrations/20260728002000_agenda_transport_duration_receipt_logo.sql')

  assert.match(migration, /resolve_petshop_transport_fee/)
  assert.match(migration, /pet_transport_options/)
  assert.match(migration, /p_payload->>'duration_min'/)
  assert.match(migration, /v_total_price := round\(v_service_price \+ v_transport_fee, 2\)/)
  assert.match(migration, /'service_price', v_service_price/)
  assert.match(migration, /'transport_fee', v_transport_fee/)
})
