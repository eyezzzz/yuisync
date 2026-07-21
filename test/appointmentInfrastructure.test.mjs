import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  appointmentServiceLabel,
  calculateAppointmentServiceTotals,
  classifyAppointmentServiceGroup,
  serviceOptionsForAppointmentGroup,
} from '../src/modules/petshop/lib/appointmentServices.js'

const services = [
  { value: 'banho', label: 'Banho', price: 60, duration: 60, group_type: 'banho_tosa', active: true },
  { value: 'escovacao', label: 'Escovacao', price: 40, duration: 30, group_type: 'banho_tosa', active: true },
  { value: 'consulta', label: 'Consulta Veterinaria', price: 120, duration: 40, group_type: 'veterinaria', active: true },
  { value: 'contabilidade', label: 'Consultoria Contabil', price: 300, duration: 60, group_type: 'outro', active: true },
]

test('agenda separa banho/tosa, veterinaria e servicos sem classificacao', () => {
  assert.equal(classifyAppointmentServiceGroup(services[0]), 'banho_tosa')
  assert.equal(classifyAppointmentServiceGroup(services[2]), 'veterinaria')
  assert.equal(classifyAppointmentServiceGroup(services[3]), 'outro')

  assert.deepEqual(serviceOptionsForAppointmentGroup(services, 'banho_tosa').map((item) => item.value), ['banho', 'escovacao'])
  assert.deepEqual(serviceOptionsForAppointmentGroup(services, 'veterinaria').map((item) => item.value), ['consulta'])
})

test('multiplos servicos somam exatamente preco e duracao do catalogo', () => {
  const total = calculateAppointmentServiceTotals(['banho', 'escovacao'], services)
  assert.equal(total.price, 100)
  assert.equal(total.duration, 90)
  assert.deepEqual(total.services.map((item) => item.value), ['banho', 'escovacao'])
})

test('rotulo do agendamento usa os snapshots historicos dos servicos', () => {
  assert.equal(appointmentServiceLabel({
    service_type: 'banho',
    service_items: [
      { code: 'banho', name: 'Banho' },
      { code: 'escovacao', name: 'Escovacao' },
    ],
  }, services), 'Banho + Escovacao')
})

test('migracao corrige origem manual, taxa de entrega e contrato multisservico', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260721008000_infra_appointments_delivery_multiservice.sql', import.meta.url), 'utf8')
  assert.match(sql, /drop constraint if exists appointments_source_check/i)
  assert.match(sql, /source set default 'manual'/i)
  assert.match(sql, /add column if not exists service_items jsonb/i)
  assert.match(sql, /resolve_petshop_appointment_services/i)
  assert.match(sql, /update_petshop_appointment_transaction/i)
  assert.match(sql, /add column if not exists delivery_fee numeric/i)
  assert.match(sql, /coalesce\(delivery_fee, 8\)/i)
  assert.match(sql, /v_total := greatest\(0, round\(v_subtotal - v_requested_discount, 2\)\) \+ v_delivery_fee/i)
})

test('tela da agenda permite mais de um servico e envia origem manual', () => {
  const source = readFileSync(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8')
  assert.match(source, /service_codes/)
  assert.match(source, /toggleService/)
  assert.match(source, /Selecione um ou mais servicos/)
  assert.match(source, /source: 'manual'/)
  assert.match(source, /serviceTotals\.price/)
})

test('checkout exibe e persiste taxa de entrega', () => {
  const page = readFileSync(new URL('../src/modules/petshop/pages/VendasPage.jsx', import.meta.url), 'utf8')
  const server = readFileSync(new URL('../server/lib/checkout.js', import.meta.url), 'utf8')
  const settings = readFileSync(new URL('../src/shared/pages/SettingsPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /delivery_fee \?\? 8/)
  assert.match(page, /Taxa de entrega/)
  assert.match(server, /delivery_fee/)
  assert.match(settings, /delivery_fee: '8\.00'/)
})
