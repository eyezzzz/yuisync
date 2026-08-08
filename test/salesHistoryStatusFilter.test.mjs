import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const hook = fs.readFileSync(new URL('../src/shared/hooks/useSales.js', import.meta.url), 'utf8')
const vendasPage = fs.readFileSync(new URL('../src/modules/petshop/pages/VendasPage.jsx', import.meta.url), 'utf8')

test('consultas de vendas por data mostram apenas vendas concluidas por padrao', () => {
  assert.match(hook, /export function resolveSalesLoadStatus\(filters = \{\}\)/)
  assert.match(hook, /return filters\.date \? 'concluido' : null/)
  assert.match(hook, /const requestedStatus = resolveSalesLoadStatus\(filters\)/)
  assert.match(hook, /if \(requestedStatus\) query = query\.eq\('status', requestedStatus\)/)
})

test('consulta explicita ainda pode acessar canceladas ou todos os status para auditoria', () => {
  assert.match(hook, /Object\.prototype\.hasOwnProperty\.call\(filters, 'status'\)/)
  assert.match(hook, /return filters\.status \|\| null/)
})

test('historico do PDV continua usando consulta datada e herda o filtro seguro', () => {
  assert.match(vendasPage, /loadSales\(\{ date: historyDate \}\)/)
  assert.match(vendasPage, /loadSales\(\{ date: todayISO\(\) \}\)/)
})
