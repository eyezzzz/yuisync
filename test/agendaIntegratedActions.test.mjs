import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('agenda integrada delega para uma unica implementacao estavel', async () => {
  const modules = await read('src/config/modules.jsx')
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')
  const stable = await read('src/modules/petshop/pages/AgendaStablePage.jsx')

  assert.match(modules, /AgendaIntegratedPage/)
  assert.match(integrated, /AgendaStablePage/)
  assert.match(stable, /<AgendaPage \/>/)
  assert.doesNotMatch(stable, /dragstart|dragover|dataTransfer/)
  assert.doesNotMatch(stable, /characterData: true/)
})

test('arraste usa ponteiro, ghost, autoscroll e atualizacao transacional', async () => {
  const stable = await read('src/modules/petshop/pages/AgendaStablePage.jsx')
  const core = await read('src/modules/petshop/pages/agendaOperationalCore.js')

  assert.match(stable, /pointerdown/)
  assert.match(stable, /pointermove/)
  assert.match(stable, /pointerup/)
  assert.match(stable, /yuisync-agenda-drag-ghost/)
  assert.match(stable, /autoScrollTick/)
  assert.match(stable, /window\.scrollBy/)
  assert.match(stable, /update\(appointmentId, \{ scheduled_at: target\.toISOString\(\) \}\)/)
  assert.match(core, /chooseAgendaSlot/)
  assert.match(core, /slotTimeFromAria/)
})

test('card verde compacto possui somente uma acao de impressao', async () => {
  const stable = await read('src/modules/petshop/pages/AgendaStablePage.jsx')
  const styles = await read('src/modules/petshop/pages/AgendaStablePage.css')

  assert.match(styles, /#047857/)
  assert.match(styles, /#065f46/)
  assert.match(styles, /opacity: 1 !important/)
  assert.match(styles, /yuisync-native-print-hidden/)
  assert.match(stable, /data-yuisync-action=\"print\"/)
  assert.match(stable, /data-yuisync-action=\"complete\"/)
  assert.match(stable, /data-yuisync-action=\"drag\"/)
  assert.match(stable, /button\.closest\('\[data-yuisync-actions\]'\)/)
  assert.match(stable, /yuisync-card-detail-hidden/)
})

test('preco preserva servico e soma transporte no card e no cupom', async () => {
  const stable = await read('src/modules/petshop/pages/AgendaStablePage.jsx')
  const core = await read('src/modules/petshop/pages/agendaOperationalCore.js')

  assert.match(core, /total: Math\.max\(stored, itemService \+ transport\)/)
  assert.match(stable, /fmtCurrency\(prices\.service\)/)
  assert.match(stable, /fmtCurrency\(prices\.transport\)/)
  assert.match(stable, /fmtCurrency\(prices\.total\)/)
  assert.match(stable, /priceSpan\.textContent = fmtCurrency\(prices\.total\)/)
})

test('modal fecha seletor e apresenta servico transporte e total', async () => {
  const stable = await read('src/modules/petshop/pages/AgendaStablePage.jsx')

  assert.match(stable, /Servicos encontrados/)
  assert.match(stable, /dispatchEvent\(new MouseEvent\('mousedown'/)
  assert.match(stable, /resolvePetshopServiceDuration/)
  assert.match(stable, /petshop_service_durations/)
  assert.match(stable, /data-yuisync-modal-total/)
})

test('logo termica e cabecalho compacto permanecem no recibo', async () => {
  const stable = await read('src/modules/petshop/pages/AgendaStablePage.jsx')
  const settings = await read('src/shared/pages/SettingsIntegratedPage.jsx')

  assert.match(settings, /receipt_logo_data_url/)
  assert.match(stable, /class=\"print-logo\"/)
  assert.match(stable, /\.receipt \{ width: 64mm; max-width: 64mm; margin: 0; \}/)
  assert.doesNotMatch(stable, /line\('Contato'/)
})
