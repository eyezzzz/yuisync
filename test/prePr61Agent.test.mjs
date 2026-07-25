import assert from 'node:assert/strict'
import test from 'node:test'

import { buildServiceAvailability } from '../server/lib/petbotAgent.js'

const bath = {
  id: 'bath-small',
  code: 'banho_pet_porte_pequeno',
  name: 'BANHO PET PORTE PEQUENO 0 KG A 10 KG (TODAS AS PELAGENS)',
  group_type: 'banho_tosa',
  default_price: 55,
  default_duration_min: 60,
  active: true,
  species: 'dog',
  weight_range: { min: 0, max: 22 },
  coat_type: 'todas',
}

const veterinaryConsultation = {
  id: 'vet-consultation',
  code: 'consulta_veterinaria',
  name: 'Consulta Veterinária',
  group_type: 'veterinaria',
  default_price: 120,
  default_duration_min: 60,
  active: true,
}

const commonSettings = {
  petbotTimezone: 'America/Sao_Paulo',
  storeBusinessHours: {
    1: [{ open: '08:00', close: '18:00' }],
    2: [{ open: '08:00', close: '18:00' }],
    3: [{ open: '08:00', close: '18:00' }],
    4: [{ open: '08:00', close: '18:00' }],
    5: [{ open: '08:00', close: '18:00' }],
    6: [{ open: '08:00', close: '18:00' }],
    7: [{ open: '08:00', close: '18:00' }],
  },
  petbotBusinessHours: {
    1: [{ open: '08:00', close: '17:00' }],
    2: [{ open: '08:00', close: '17:00' }],
    3: [{ open: '08:00', close: '17:00' }],
    4: [{ open: '08:00', close: '17:00' }],
    5: [{ open: '08:00', close: '17:00' }],
    6: [{ open: '08:00', close: '17:00' }],
    7: [{ open: '08:00', close: '17:00' }],
  },
  petbotSlotIntervalMin: 30,
  petbotBookingLeadTimeMin: 0,
}

function availability({ weightKg = 8, date = '2026-07-27', preferredTime = '08:00', appointments = [], settings = commonSettings } = {}) {
  return buildServiceAvailability({
    serviceQuery: bath.id,
    orderType: 'banho_tosa',
    species: 'dog',
    breed: 'Shih Tzu',
    weightKg,
    coatType: 'longo',
    date,
    preferredTime,
    services: [bath],
    appointments,
    settings,
    now: new Date('2026-07-25T08:00:00-03:00'),
  })
}

test('PetBot applies configured operational durations by weight', () => {
  const small = availability({ weightKg: 8 })
  assert.equal(small.available_slots.find((slot) => slot.time === '08:00')?.duration_min, 40)

  const medium = availability({ weightKg: 10 })
  assert.equal(medium.available_slots.find((slot) => slot.time === '08:00')?.duration_min, 60)
})

test('default grooming capacity exposes two simultaneous appointments', () => {
  const oneUsed = availability({
    appointments: [{ scheduled_at: '2026-07-27T08:00:00-03:00', duration_min: 40, status: 'confirmado' }],
  })
  assert.equal(oneUsed.requested_slot.available, true)
  assert.equal(oneUsed.available_slots.find((slot) => slot.time === '08:00')?.capacity_remaining, 1)

  const full = availability({
    appointments: [
      { scheduled_at: '2026-07-27T08:00:00-03:00', duration_min: 40, status: 'confirmado' },
      { scheduled_at: '2026-07-27T08:00:00-03:00', duration_min: 40, status: 'agendado' },
    ],
  })
  assert.equal(full.requested_slot.available, false)
  assert.equal(full.day_schedule.find((slot) => slot.time === '08:00')?.status, 'ocupado')
})

test('veterinary schedule is independent and closed on weekends', () => {
  const settings = {
    ...commonSettings,
    veterinaryBusinessHours: {
      1: [{ open: '13:00', close: '18:00' }],
      2: [{ open: '13:00', close: '18:00' }],
      3: [{ open: '13:00', close: '18:00' }],
      4: [{ open: '13:00', close: '18:00' }],
      5: [{ open: '13:00', close: '18:00' }],
      6: [],
      7: [],
    },
  }
  const saturday = buildServiceAvailability({
    serviceQuery: veterinaryConsultation.id,
    orderType: 'veterinaria',
    date: '2026-08-01',
    preferredTime: '13:00',
    services: [veterinaryConsultation],
    appointments: [],
    settings,
    now: new Date('2026-07-25T08:00:00-03:00'),
  })
  assert.equal(saturday.status, 'unavailable')
  assert.equal(saturday.requested_slot.available, false)

  const monday = buildServiceAvailability({
    serviceQuery: veterinaryConsultation.id,
    orderType: 'veterinaria',
    date: '2026-07-27',
    preferredTime: '13:00',
    services: [veterinaryConsultation],
    appointments: [],
    settings,
    now: new Date('2026-07-25T08:00:00-03:00'),
  })
  assert.equal(monday.requested_slot.available, true)
})
