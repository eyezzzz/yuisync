import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('agenda usa uma unica camada integrada sem observers globais concorrentes', async () => {
  const modules = await read('src/config/modules.jsx')
  const main = await read('src/main.jsx')
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')

  assert.match(modules, /AgendaIntegratedPage/)
  assert.doesNotMatch(modules, /AgendaFinalPage/)
  assert.doesNotMatch(main, /agendaOperationalFixes/)
  assert.match(integrated, /<AgendaPage \/>/)
  assert.match(integrated, /observer\.observe\(pageRoot, \{ childList: true, subtree: true \}\)/)
  assert.doesNotMatch(integrated, /characterData: true/)
})

test('arraste nativo acompanha o cursor, rola a pagina e solta na faixa de dez minutos', async () => {
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')

  assert.match(integrated, /dragstart/)
  assert.match(integrated, /dragover/)
  assert.match(integrated, /drop/)
  assert.match(integrated, /yuisync-agenda-drag-ghost/)
  assert.match(integrated, /autoScrollTick/)
  assert.match(integrated, /window\.scrollBy/)
  assert.match(integrated, /button\[aria-label\^="Agendar as "\]/)
  assert.match(integrated, /update\(appointmentId, \{ scheduled_at: target\.toISOString\(\) \}\)/)
})

test('card possui contraste verde e mantem apenas a impressao integrada', async () => {
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')
  const styles = await read('src/modules/petshop/pages/AgendaIntegratedPage.css')

  assert.match(styles, /#065f46/)
  assert.match(styles, /opacity: 1 !important/)
  assert.match(integrated, /button\.closest\('\[data-yuisync-card-actions\]'\)/)
  assert.match(integrated, /setProperty\('display', 'none', 'important'\)/)
  assert.match(integrated, /data-yuisync-action="print"/)
  assert.match(integrated, /data-yuisync-action="complete"/)
})

test('preco separa servico e transporte sem reduzir o servico legado', async () => {
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')

  assert.match(integrated, /function servicePriceFromItems/)
  assert.match(integrated, /total: Math\.max\(stored, itemService \+ transport\)/)
  assert.match(integrated, /line\('Servico', fmtCurrency\(prices\.service\)\)/)
  assert.match(integrated, /line\('Transporte', fmtCurrency\(prices\.transport\)\)/)
  assert.match(integrated, /fmtCurrency\(prices\.total\)/)
  assert.match(integrated, /priceSpan\.textContent = fmtCurrency\(prices\.total\)/)
})

test('modal fecha seletor e apresenta servico transporte e total', async () => {
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')

  assert.match(integrated, /Servicos encontrados/)
  assert.match(integrated, /dispatchEvent\(new MouseEvent\('mousedown'/)
  assert.match(integrated, /resolvePetshopServiceDuration/)
  assert.match(integrated, /petshop_service_durations/)
  assert.match(integrated, /modalTotal/)
})

test('logo termica fica no proprio recibo sem interceptar window open', async () => {
  const modules = await read('src/config/modules.jsx')
  const settings = await read('src/shared/pages/SettingsIntegratedPage.jsx')
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')
  const migration = await read('supabase/migrations/20260728002000_agenda_transport_duration_receipt_logo.sql')

  assert.match(modules, /SettingsIntegratedPage/)
  assert.match(settings, /Enviar arquivo/)
  assert.match(settings, /receipt_logo_data_url/)
  assert.match(integrated, /class="print-logo"/)
  assert.doesNotMatch(integrated, /patchedAgendaPrintWindow/)
  assert.match(migration, /add column if not exists receipt_logo_data_url text/)
})

test('banco corrige novas gravacoes e reconcilia totais legados MotoDog', async () => {
  const transactionMigration = await read('supabase/migrations/20260728002000_agenda_transport_duration_receipt_logo.sql')
  const reconciliation = await read('supabase/migrations/20260728003000_reconcile_legacy_appointment_totals.sql')

  assert.match(transactionMigration, /v_total_price := round\(v_service_price \+ v_transport_fee, 2\)/)
  assert.match(transactionMigration, /price = v_total_price/)
  assert.match(reconciliation, /abs\(coalesce\(appointment\.price, 0\) - prices\.service_price\) < 0\.01/)
  assert.match(reconciliation, /legacy_totals\.service_price \+ legacy_totals\.transport_fee/)
})
