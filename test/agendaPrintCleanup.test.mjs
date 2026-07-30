import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const resolvedSource = fs.readFileSync('src/modules/petshop/pages/AgendaResolvedPage.jsx', 'utf8')
const agendaSource = fs.readFileSync('src/modules/petshop/pages/AgendaPage.jsx', 'utf8')
const enhancementsSource = fs.readFileSync('src/modules/petshop/pages/AgendaBookingEnhancements.jsx', 'utf8')

const resolvedAppointmentBlock = resolvedSource.slice(
  resolvedSource.indexOf('const printAppointment = useCallback'),
  resolvedSource.indexOf('const printDay = useCallback'),
)
const resolvedReceiptShell = resolvedSource.slice(
  resolvedSource.indexOf('function receiptShell'),
  resolvedSource.indexOf('function findScrollableAncestor'),
)
const nativeReceiptBlock = agendaSource.slice(
  agendaSource.indexOf('function ReceiptModal'),
  agendaSource.indexOf('// ── Modal de Agendamento'),
)

test('ficha operacional nao imprime valores, endereco ou checklist', () => {
  assert.equal(resolvedAppointmentBlock.includes('fmtCurrency('), false)
  assert.equal(resolvedAppointmentBlock.includes('prices.'), false)
  assert.equal(resolvedAppointmentBlock.includes('CONTROLE:'), false)
  assert.equal(resolvedAppointmentBlock.includes('checklist'), false)
  assert.equal(resolvedAppointmentBlock.includes("line('Endereco'"), false)
})

test('modal nativo usa a mesma ficha limpa', () => {
  assert.equal(nativeReceiptBlock.includes('fmtCurrency('), false)
  assert.equal(nativeReceiptBlock.includes('VALOR'), false)
  assert.equal(nativeReceiptBlock.includes('TOTAL'), false)
  assert.equal(nativeReceiptBlock.includes('Endereco completo'), false)
  assert.equal(nativeReceiptBlock.includes("row('Transporte'"), false)
  assert.equal(nativeReceiptBlock.includes('transportAddress'), false)
  assert.equal(nativeReceiptBlock.includes('store_address'), false)
})

test('todos os caminhos restauram e aguardam a logo', () => {
  assert.match(resolvedReceiptShell, /quatro-patas-logo-mono\.png/)
  assert.match(nativeReceiptBlock, /quatro-patas-logo-mono\.png/)
  assert.match(resolvedReceiptShell, /image\.addEventListener\('load'/)
  assert.match(nativeReceiptBlock, /image\.addEventListener\('load'/)
  assert.match(resolvedReceiptShell, /window\.setTimeout\(printWhenReady, 1500\)/)
  assert.match(nativeReceiptBlock, /window\.setTimeout\(printWhenReady, 1500\)/)
})

test('tipografia foi ampliada nos dois modelos', () => {
  assert.match(resolvedReceiptShell, /\.line \{[^}]*font-size: 11px/)
  assert.match(resolvedReceiptShell, /\.line strong \{[^}]*font-size: 10px/)
  assert.match(nativeReceiptBlock, /\.row \{[^}]*font-size: 10\.5px/)
  assert.match(nativeReceiptBlock, /\.label \{[^}]*font-size: 9\.5px/)
})

test('botao diario chama diretamente a ficha limpa', () => {
  assert.match(resolvedSource, /data-yuisync-action="print"/)
  assert.match(resolvedSource, /action\.dataset\.yuisyncAction === 'print'\) printAppointment\(appointment\)/)
})

test('integracao de pacote nao intercepta mais o clique de imprimir', () => {
  assert.equal(enhancementsSource.includes('printLatestAppointment'), false)
  assert.equal(enhancementsSource.includes('data-yuisync-action="print"'), false)
  assert.equal(enhancementsSource.includes('printThermalReceipt'), false)
})


test('rotulos termicos permanecem curtos e sem quebra desnecessaria', () => {
  assert.match(resolvedAppointmentBlock, /line\('Raca'/)
  assert.match(resolvedAppointmentBlock, /line\('Resp\.'/)
  assert.match(resolvedAppointmentBlock, /line\('Obs\.'/)
  assert.doesNotMatch(resolvedAppointmentBlock, /Raca\/especie|Responsavel|Observacoes/)
  assert.match(nativeReceiptBlock, /row\('Raca'/)
  assert.match(nativeReceiptBlock, /row\('Resp\.'/)
  assert.match(nativeReceiptBlock, /row\('Obs\.'/)
})


test('impressao usa largura termica centralizada sem folga lateral', () => {
  assert.ok(resolvedReceiptShell.includes('body { font-family: Arial, Helvetica, sans-serif; padding: 3mm 2mm; }'))
  assert.ok(resolvedReceiptShell.includes('.receipt { width: 72mm; max-width: 72mm; margin: 0 auto; }'))
  assert.ok(resolvedReceiptShell.includes('font-size: 13.5px'))
  assert.ok(resolvedReceiptShell.includes('font-size: 11px'))
  assert.ok(resolvedReceiptShell.includes('font-size: 10px; text-transform: uppercase'))
})
