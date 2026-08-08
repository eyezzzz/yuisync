import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const groomingCash = fs.readFileSync(new URL('../src/modules/petshop/pages/BanhoTosaPdvPanel.jsx', import.meta.url), 'utf8')
const cashPage = fs.readFileSync(new URL('../src/modules/petshop/pages/CaixaPage.jsx', import.meta.url), 'utf8')

test('fechamento de banho e tosa atualiza quando a agenda muda', () => {
  assert.match(groomingCash, /yuisync:appointments-sync/)
  assert.match(groomingCash, /addEventListener\(APPOINTMENT_SYNC_EVENT, refreshFinancialState\)/)
  assert.match(groomingCash, /\.eq\('status', 'concluido'\)/)
})

test('controle de caixa recarrega quando um agendamento e reaberto', () => {
  assert.match(cashPage, /yuisync:appointments-sync/)
  assert.match(cashPage, /addEventListener\(APPOINTMENT_SYNC_EVENT, refreshCash\)/)
  assert.match(cashPage, /visibilitychange/)
})
