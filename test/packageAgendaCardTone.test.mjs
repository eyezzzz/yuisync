import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const enhancer = fs.readFileSync(
  new URL('../src/modules/petshop/components/AgendaCardLayoutEnhancer.jsx', import.meta.url),
  'utf8',
)
const integratedPage = fs.readFileSync(
  new URL('../src/modules/petshop/pages/AgendaIntegratedPage.jsx', import.meta.url),
  'utf8',
)

test('card de pacote usa os dados persistidos do agendamento em vez do preço exibido', () => {
  assert.match(enhancer, /export function appointmentUsesPackage\(appointment = \{\}\)/)
  assert.match(enhancer, /subscription_benefit_status/)
  assert.match(enhancer, /subscription_benefit_used === true/)
  assert.match(enhancer, /item\?\.benefit_used === true/)
  assert.match(enhancer, /subscription_id/)
})

test('cards da agenda recebem marcador explícito de pacote e rótulo PACOTE', () => {
  assert.match(enhancer, /card\.dataset\.yuisyncPackage = String\(usesPackage\)/)
  assert.match(enhancer, /card\.dataset\.yuisyncCardKind = 'package'/)
  assert.match(enhancer, /priceNode\.textContent = 'PACOTE · R\$ 0,00'/)
  assert.match(enhancer, /\.select\('id, subscription_id, subscription_benefit_used, subscription_benefit_status, service_items'\)/)
})

test('tema visual de pacote continua amarelo e âmbar', () => {
  assert.match(integratedPage, /data-yuisync-card-kind='package'/)
  assert.match(integratedPage, /rgba\(253, 224, 71, 0\.95\)/)
  assert.match(integratedPage, /#92400e/)
  assert.match(integratedPage, /#b45309/)
})

test('marcador é reavaliado após sincronização de agendamentos', () => {
  assert.match(enhancer, /window\.addEventListener\('yuisync:appointments-sync', handleAppointmentSync\)/)
  assert.match(enhancer, /schedule\(\{ force: true \}\)/)
})
