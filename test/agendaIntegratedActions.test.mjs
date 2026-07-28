import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('agenda integrada usa uma unica implementacao resolvida', async () => {
  const modules = await read('src/config/modules.jsx')
  const integrated = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')
  const resolved = await read('src/modules/petshop/pages/AgendaResolvedPage.jsx')

  assert.match(modules, /AgendaIntegratedPage/)
  assert.match(integrated, /AgendaResolvedPage/)
  assert.match(resolved, /<AgendaPage \/>/)
  assert.doesNotMatch(resolved, /dragstart|dragover|dataTransfer/)
  assert.doesNotMatch(resolved, /characterData: true/)
})

test('mapeamento do card considera status e nao sobrescreve ativo com concluido', async () => {
  const resolved = await read('src/modules/petshop/pages/AgendaResolvedPage.jsx')
  const core = await read('src/modules/petshop/pages/agendaOperationalCore.js')

  assert.match(resolved, /findAgendaCardCandidate/)
  assert.match(resolved, /statusLabel: statusLabel/)
  assert.match(resolved, /const usedCards = new Set\(\)/)
  assert.match(resolved, /left\.status === 'concluido'/)
  assert.match(core, /normalizedStatus/)
})

test('card mostra mover imprimir e concluir para agendamento ativo', async () => {
  const resolved = await read('src/modules/petshop/pages/AgendaResolvedPage.jsx')
  const styles = await read('src/modules/petshop/pages/AgendaResolvedPage.css')

  assert.match(resolved, /data-yuisync-action=\"drag\"/)
  assert.match(resolved, /data-yuisync-action=\"print\"/)
  assert.match(resolved, /data-yuisync-action=\"complete\"/)
  assert.match(resolved, /const signature = `\$\{appointment\.id\}:\$\{movable\}:\$\{canComplete\}`/)
  assert.match(styles, /padding-right: 132px !important/)
  assert.match(styles, /yuisync-resolved-actions/)
})

test('arraste usa ponteiro ghost autoscroll e faixa de dez minutos', async () => {
  const resolved = await read('src/modules/petshop/pages/AgendaResolvedPage.jsx')

  assert.match(resolved, /pointerdown/)
  assert.match(resolved, /pointermove/)
  assert.match(resolved, /pointerup/)
  assert.match(resolved, /yuisync-resolved-drag-ghost/)
  assert.match(resolved, /autoScrollTick/)
  assert.match(resolved, /chooseAgendaSlot/)
  assert.match(resolved, /update\(appointmentId, \{ scheduled_at: target\.toISOString\(\) \}\)/)
})

test('card fica compacto sem endereco e mantem total correto', async () => {
  const resolved = await read('src/modules/petshop/pages/AgendaResolvedPage.jsx')
  const styles = await read('src/modules/petshop/pages/AgendaResolvedPage.css')

  assert.match(resolved, /yuisync-resolved-detail-hidden/)
  assert.match(resolved, /appointmentPriceBreakdown/)
  assert.match(resolved, /priceSpan\.textContent = fmtCurrency\(prices\.total\)/)
  assert.match(styles, /#047857/)
  assert.match(styles, /opacity: 1 !important/)
})

test('cupom preserva logo servico transporte e total', async () => {
  const resolved = await read('src/modules/petshop/pages/AgendaResolvedPage.jsx')
  const settings = await read('src/shared/pages/SettingsIntegratedPage.jsx')

  assert.match(settings, /receipt_logo_data_url/)
  assert.match(resolved, /class=\"print-logo\"/)
  assert.match(resolved, /fmtCurrency\(prices\.service\)/)
  assert.match(resolved, /fmtCurrency\(prices\.transport\)/)
  assert.match(resolved, /fmtCurrency\(prices\.total\)/)
  assert.doesNotMatch(resolved, /line\('Contato'/)
})
