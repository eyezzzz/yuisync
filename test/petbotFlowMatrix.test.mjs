import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPetbotOperationalPreflight,
  mergeInterpretedPetbotServiceFacts,
} from '../server/lib/petbotAgent.js'

const services = [
  {
    id: 'cat-small', code: 'banho_gato', name: 'BANHO GATO (TODAS AS PELAGENS)',
    group_type: 'banho_tosa', default_price: 110, default_duration_min: 60,
    active: true, catalog_source: 'products', source_product_id: 'cat-small-product', species: 'cat',
    weight_range: { min: 0, max: 10 }, coat_type: 'todas', all_breeds: true,
  },
  {
    id: 'dog-small', code: 'banho_pet_pequeno',
    name: 'BANHO PET PORTE PEQUENO 0 KG A 10 KG (TODAS AS PELAGENS)',
    group_type: 'banho_tosa', default_price: 72, default_duration_min: 60,
    active: true, catalog_source: 'products', source_product_id: 'dog-small-product', species: 'dog',
    weight_range: { min: 0, max: 10 }, coat_type: 'todas', all_breeds: true,
  },
]

const coatLabels = {
  curto: 'PELO CURTO',
  medio: 'PELO MEDIO',
  longo: 'PELO LONGO',
  duplo: 'PELO DUPLO',
}

for (const [min, max, rangeCode] of [[10.1, 22, 'medio'], [22.1, 40, 'grande']]) {
  for (const coat of Object.keys(coatLabels)) {
    services.push({
      id: `dog-${rangeCode}-${coat}`,
      code: `banho_pet_${rangeCode}_${coat}`,
      name: `BANHO PET ${min} KG A ${max} KG (${coatLabels[coat]})`,
      group_type: 'banho_tosa', default_price: rangeCode === 'medio' ? 100 : 140,
      default_duration_min: 60, active: true, catalog_source: 'products',
      source_product_id: `dog-${rangeCode}-${coat}-product`, species: 'dog',
      weight_range: { min, max }, coat_type: coat, all_breeds: false,
    })
  }
}

const breeds = [
  ['Shih Tzu', 'longo'],
  ['Spitz Alemão', 'duplo'],
  ['Poodle', 'medio'],
  ['Pug', 'curto'],
  ['Golden Retriever', 'duplo'],
  ['Yorkshire Terrier', 'longo'],
  ['Schnauzer', 'medio'],
  ['Bulldog Francês', 'curto'],
  ['Border Collie', 'duplo'],
  ['Maltês', 'longo'],
]
const weights = [2, 5, 8, 10, 11, 15, 21, 25, 35, 40]
const dates = ['hoje', 'amanhã', 'depois de amanhã', '24/07', 'sexta']
const now = new Date('2026-07-22T12:00:00.000Z')
const settings = {
  timezone: 'America/Sao_Paulo',
  businessHours: {
    1: [{ open: '08:00', close: '18:00' }],
    2: [{ open: '08:00', close: '18:00' }],
    3: [{ open: '08:00', close: '18:00' }],
    4: [{ open: '08:00', close: '18:00' }],
    5: [{ open: '08:00', close: '18:00' }],
    6: [{ open: '08:00', close: '18:00' }],
    7: [{ open: '08:00', close: '18:00' }],
  },
  slotIntervalMin: 30,
  bookingLeadMinutes: 0,
  bookingCapacity: 1,
}

test('matriz de 500 fluxos resolve catalogo e agenda sem servico felino nem pergunta de pelagem', () => {
  let scenarios = 0
  for (const [breed, expectedCoat] of breeds) {
    for (const weight of weights) {
      for (const date of dates) {
        const facts = mergeInterpretedPetbotServiceFacts({
          interpretation: {
            pet_name: 'Thor', breed, weight_kg: weight,
            service_type: 'banho', service_date: date,
          },
        })
        const result = buildPetbotOperationalPreflight({
          facts,
          orderType: 'banho_tosa',
          services,
          appointments: [],
          settings,
          now,
        })

        assert.equal(result.resolution.status, 'resolved', `${breed}/${weight}/${date}`)
        assert.equal(result.resolvedService.species, 'dog', `${breed}/${weight}/${date}`)
        assert.notEqual(result.resolvedService.id, 'cat-small', `${breed}/${weight}/${date}`)
        assert.match(result.facts.service_date, /^2026-07-\d{2}$/)
        assert.equal(result.availability.status, 'available', `${breed}/${weight}/${date}`)
        assert.ok(result.availability.available_slots.length > 0, `${breed}/${weight}/${date}`)
        assert.equal((result.resolution.missing_fields || []).includes('coat_type'), false)
        assert.equal((result.resolution.missing_fields || []).includes('breed'), false)

        if (weight <= 10) {
          assert.equal(result.resolvedService.id, 'dog-small', `${breed}/${weight}/${date}`)
        } else {
          assert.match(result.resolvedService.id, new RegExp(`-${expectedCoat}$`), `${breed}/${weight}/${date}`)
        }
        scenarios += 1
      }
    }
  }
  assert.equal(scenarios, 500)
})

test('matriz de 100 transições preserva raça e peso entre turnos sem pedir confirmação novamente', () => {
  let scenarios = 0
  for (const [breed] of breeds) {
    for (const weight of weights) {
      const first = mergeInterpretedPetbotServiceFacts({
        interpretation: { pet_name: 'Nina', breed, weight_kg: weight },
      })
      const second = mergeInterpretedPetbotServiceFacts({
        interpretation: { service_date: 'hoje', service_preferred_time: '13h' },
        previousFacts: first,
      })
      assert.equal(second.breed, breed)
      assert.equal(second.weight_kg, weight)
      assert.equal(second.pet_name, 'Nina')
      scenarios += 1
    }
  }
  assert.equal(scenarios, 100)
})
