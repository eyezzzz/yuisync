import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  MANUAL_SLOT_CAPACITY,
  appointmentOccupiesManualSlot,
  appointmentTransportAddress,
  appointmentTransportLabel,
  operationalCommissionRate,
} from '../src/modules/petshop/lib/appointmentOperational.js'

test('agenda manual expoe exatamente duas vagas operacionais', () => {
  assert.equal(MANUAL_SLOT_CAPACITY, 2)
  assert.equal(appointmentOccupiesManualSlot({ status: 'agendado' }), true)
  assert.equal(appointmentOccupiesManualSlot({ status: 'concluido' }), false)
  assert.equal(appointmentOccupiesManualSlot({ status: 'cancelado' }), false)
})

test('transporte da ficha diferencia cliente e MotoDog', () => {
  assert.equal(appointmentTransportLabel('cliente_leva'), 'Cliente traz e busca')
  assert.match(appointmentTransportLabel('buscar_e_levar'), /MotoDog/)
  assert.equal(appointmentTransportAddress({ motodog: { address: 'Rua A, 10', neighborhood: 'Centro', city: 'Muriae' } }), 'Rua A, 10 - Centro - Muriae')
})

test('comissao operacional usa 10 por cento para tosa e 5 para outros esteticos', () => {
  assert.equal(operationalCommissionRate({ code: 'tosa_tesoura', group_type: 'banho_tosa' }), 10)
  assert.equal(operationalCommissionRate({ name: 'Banho Pet', group_type: 'banho_tosa' }), 5)
  assert.equal(operationalCommissionRate({ name: 'Escovacao Dental', group_type: 'banho_tosa' }), 5)
  assert.equal(operationalCommissionRate({ name: 'Consulta Veterinaria', group_type: 'veterinaria' }), 0)
})

test('infraestrutura conecta capacidade, transporte e responsible_staff_key', async () => {
  const [migration, agenda, appointments, advanced, commissions] = await Promise.all([
    readFile(new URL('../supabase/migrations/20260727001000_agenda_capacity_operational_commissions.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/shared/hooks/useAppointments.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/petshop/hooks/usePetshopAdvanced.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/petshop/pages/EquipePage.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(migration, /petbot_booking_capacity = 2/)
  assert.match(migration, /responsible_staff_key/)
  assert.ok(migration.includes('calculate_petshop_operational_commissions'))
  assert.ok(migration.includes('book_petshop_appointment_transaction'))
  assert.ok(migration.includes('responsible_staff_key, responsible_staff_name'))
  assert.ok(migration.includes('transport_mode, transport_label, transport_address'))
  assert.doesNotMatch(migration, /as \$\n/)
  assert.doesNotMatch(migration, /\n\$;\n/)
  assert.match(migration, /create or replace function public\.book_petshop_appointment_transaction[\s\S]*?as \$\$/)
  assert.match(migration, /create or replace function public\.update_petshop_appointment_transaction[\s\S]*?as \$\$/)
  assert.ok(migration.includes('revenue * 0.10'))
  assert.ok(migration.includes('revenue * 0.05'))
  assert.ok(agenda.includes('Vaga {laneIndex + 1} disponivel'))
  assert.match(agenda, /appointmentHourSlotKeys/)
  assert.match(agenda, /appointmentHourSlotKeys\(appt\)\.forEach/)
  assert.match(agenda, /fmtInterval\(appt\)/)
  assert.match(agenda, /fmtInterval\(a\)/)
  assert.match(agenda, /FICHA DE ATENDIMENTO/)
  assert.match(agenda, /Responsavel/)
  assert.match(appointments, /transport_reference/)
  assert.match(advanced, /calculate_petshop_operational_commissions/)
  assert.match(advanced, /getDateBounds\(startDate\)\.start/)
  assert.match(advanced, /getDateBounds\(endDate\)\.end/)
  assert.doesNotMatch(advanced, /\$\{startDate\}T00:00:00\.000Z/)
  assert.ok(advanced.includes(".is('responsible_staff_key', null)"))
  assert.match(commissions, /Tosa 10%/)
  assert.match(commissions, /Outros 5%/)
})
