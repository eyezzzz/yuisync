import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PETSHOP_OPERATIONAL_STAFF,
  DEFAULT_VETERINARY_BUSINESS_HOURS,
  friendlyPetshopServiceLabel,
  normalizeOperationalStaff,
  resolvePetshopServiceDuration,
} from '../shared/petshopOperations.js'

test('veterinary schedule is weekdays 13:00-18:00 and closed on weekends', () => {
  for (const weekday of [1, 2, 3, 4, 5]) {
    assert.deepEqual(DEFAULT_VETERINARY_BUSINESS_HOURS[weekday], [{ open: '13:00', close: '18:00' }])
  }
  assert.deepEqual(DEFAULT_VETERINARY_BUSINESS_HOURS[6], [])
  assert.deepEqual(DEFAULT_VETERINARY_BUSINESS_HOURS[7], [])
})

test('service durations follow the operational weight matrix', () => {
  const cases = [
    ['banho', 8, 40],
    ['tosa maquina total', 8, 90],
    ['tosa tesoura', 8, 120],
    ['banho', 10, 60],
    ['tosa maquina total', 10, 120],
    ['tosa tesoura', 10, 150],
  ]
  for (const [name, weightKg, expected] of cases) {
    assert.equal(resolvePetshopServiceDuration({ service: name, weightKg, fallbackMin: 999 }), expected)
  }
})

test('customer-facing labels hide catalog classification details', () => {
  assert.equal(
    friendlyPetshopServiceLabel('BANHO PET PORTE PEQUENO 0 KG A 10 KG (TODAS AS PELAGENS)', { weightKg: 8 }),
    'Banho Pet Porte Pequeno',
  )
  assert.equal(
    friendlyPetshopServiceLabel('TOSA TESOURA 0 KG A 10 KG (PELO LONGO)', { weightKg: 8 }),
    'Banho e Tosa na Tesoura Porte Pequeno',
  )
})

test('operational staff is independent from authenticated profiles and expandable to four', () => {
  const staff = normalizeOperationalStaff([
    ...DEFAULT_PETSHOP_OPERATIONAL_STAFF,
    { key: 'esteticista-3', name: 'Ana', active: true },
    { key: 'esteticista-4', name: 'Bia', active: false },
    { key: 'esteticista-5', name: 'Excedente', active: true },
  ])
  assert.equal(staff.length, 4)
  assert.deepEqual(staff.map((person) => person.key), ['esteticista-1', 'esteticista-2', 'esteticista-3', 'esteticista-4'])
})
