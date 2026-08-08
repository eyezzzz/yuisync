import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const hook = fs.readFileSync(new URL('../src/shared/hooks/useSales.js', import.meta.url), 'utf8')
const vendasPage = fs.readFileSync(new URL('../src/modules/petshop/pages/VendasPage.jsx', import.meta.url), 'utf8')

test('consultas datadas continuam concluidas por padrao fora do historico de auditoria', () => {
  assert.match(hook, /export function resolveSalesLoadStatus\(filters = \{\}\)/)
  assert.match(hook, /return filters\.date \? 'concluido' : null/)
  assert.match(hook, /const requestedStatus = resolveSalesLoadStatus\(filters\)/)
})

test('status null permite consultar todos os estados para auditoria', () => {
  assert.match(hook, /Object\.prototype\.hasOwnProperty\.call\(filters, 'status'\)/)
  assert.match(hook, /return filters\.status \|\| null/)
})

test('historico do PDV carrega concluidas e canceladas conforme filtro visual', () => {
  assert.match(vendasPage, /historyStatusFilter, setHistoryStatusFilter/)
  assert.match(vendasPage, /status: historyStatusFilter === 'all' \? null : historyStatusFilter/)
  assert.match(vendasPage, /<option value=\"all\">Todas<\/option>/)
  assert.match(vendasPage, /<option value=\"cancelado\">Canceladas<\/option>/)
})

test('venda cancelada permanece visivel, identificada e sem emissao fiscal', () => {
  assert.match(vendasPage, /<th>Status<\/th>/)
  assert.match(vendasPage, /const cancelled = s\.status === 'cancelado'/)
  assert.match(vendasPage, /'CANCELADA'/)
  assert.match(vendasPage, /line-through/)
  assert.match(vendasPage, /disabled=\{cancelled \|\| issuingFiscalSaleId === s\.id\}/)
})

test('modal de auditoria diferencia venda cancelada e bloqueia nova emissao', () => {
  assert.match(vendasPage, /status: saleRow\?\.status \|\| 'concluido'/)
  assert.match(vendasPage, /const isCancelled = sale\?\.status === 'cancelado'/)
  assert.match(vendasPage, /Venda Cancelada/)
  assert.match(vendasPage, /Nova emissão fiscal bloqueada/)
  assert.match(vendasPage, /disabled=\{issuingFiscal \|\| isFiscalAuthorized \|\| isCancelled\}/)
})
