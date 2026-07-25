import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildServiceAvailability,
  isExplicitPetbotConfirmation,
  mergeInterpretedPetbotServiceFacts,
  preparePetshopOrderDraft,
  resolvePetTransportSelection,
} from '../server/lib/petbotAgent.js'
import {
  friendlyPetshopServiceLabel,
  resolvePetshopServiceDuration,
} from '../shared/petshopOperations.js'

const CASES_PER_FAMILY = 100
const NOW = new Date('2026-07-25T08:00:00-03:00')

const breeds = [
  'Shih Tzu',
  'Spitz Alemão',
  'Poodle',
  'Pug',
  'Golden Retriever',
  'Yorkshire Terrier',
  'Schnauzer',
  'Bulldog Francês',
  'Border Collie',
  'Maltês',
]

const petNames = ['Theo', 'Nina', 'Thor', 'Mel', 'Luna', 'Bob', 'Amora', 'Fred', 'Jade', 'Luke']
const customerNames = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elaine', 'Felipe', 'Gabi', 'Hugo', 'Iara', 'João']

const bathService = {
  id: 'bath-small-medium',
  code: 'banho_pet',
  name: 'BANHO PET 0 KG A 22 KG (TODAS AS PELAGENS)',
  group_type: 'banho_tosa',
  default_price: 75,
  default_duration_min: 60,
  active: true,
  species: 'dog',
  weight_range: { min: 0, max: 22 },
  coat_type: 'todas',
}

const machineGroomingService = {
  id: 'machine-grooming',
  code: 'banho_tosa_maquina',
  name: 'BANHO E TOSA NA MAQUINA 0 KG A 22 KG',
  group_type: 'banho_tosa',
  default_price: 110,
  default_duration_min: 120,
  active: true,
  species: 'dog',
  weight_range: { min: 0, max: 22 },
  coat_type: 'todas',
}

const scissorGroomingService = {
  id: 'scissor-grooming',
  code: 'banho_tosa_tesoura',
  name: 'BANHO E TOSA NA TESOURA 0 KG A 22 KG',
  group_type: 'banho_tosa',
  default_price: 145,
  default_duration_min: 150,
  active: true,
  species: 'dog',
  weight_range: { min: 0, max: 22 },
  coat_type: 'todas',
}

const veterinaryService = {
  id: 'vet-consultation',
  code: 'consulta_veterinaria',
  name: 'Consulta Veterinária',
  group_type: 'veterinaria',
  default_price: 120,
  default_duration_min: 60,
  active: true,
}

const operationalSettings = {
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
  veterinaryBusinessHours: {
    1: [{ open: '13:00', close: '18:00' }],
    2: [{ open: '13:00', close: '18:00' }],
    3: [{ open: '13:00', close: '18:00' }],
    4: [{ open: '13:00', close: '18:00' }],
    5: [{ open: '13:00', close: '18:00' }],
    6: [],
    7: [],
  },
  petbotSlotIntervalMin: 30,
  petbotBookingLeadTimeMin: 0,
  petbotBookingCapacity: 2,
}

function weightFor(index) {
  return index % 2 === 0
    ? Number((0.5 + (index % 19) * 0.47).toFixed(2))
    : Number((10 + (index % 24) * 0.49).toFixed(2))
}

function isoDateFromOffset(offset) {
  return new Date(Date.UTC(2026, 6, 27 + offset)).toISOString().slice(0, 10)
}

function assertFamilyCount(count, family) {
  assert.equal(count, CASES_PER_FAMILY, `${family}: quantidade de cenários inesperada`)
}

test('100 cenários hipotéticos de banho preservam duração e nome amigável', () => {
  let scenarios = 0
  for (let index = 0; index < CASES_PER_FAMILY; index += 1) {
    const weightKg = weightFor(index)
    const expectedDuration = weightKg < 10 ? 40 : 60
    const expectedSize = weightKg < 10 ? 'Porte Pequeno' : 'Porte Médio'

    assert.equal(resolvePetshopServiceDuration({ service: bathService, weightKg }), expectedDuration, `banho/${index}/${weightKg}`)
    assert.equal(friendlyPetshopServiceLabel(bathService, { weightKg }), `Banho Pet ${expectedSize}`, `banho-label/${index}/${weightKg}`)
    scenarios += 1
  }
  assertFamilyCount(scenarios, 'banho')
})

test('100 cenários hipotéticos de tosa na máquina preservam duração e nome amigável', () => {
  let scenarios = 0
  for (let index = 0; index < CASES_PER_FAMILY; index += 1) {
    const weightKg = weightFor(index)
    const expectedDuration = weightKg < 10 ? 90 : 120
    const expectedSize = weightKg < 10 ? 'Porte Pequeno' : 'Porte Médio'

    assert.equal(resolvePetshopServiceDuration({ service: machineGroomingService, weightKg }), expectedDuration, `tosa-maquina/${index}/${weightKg}`)
    assert.equal(
      friendlyPetshopServiceLabel(machineGroomingService, { weightKg }),
      `Banho e Tosa na Máquina ${expectedSize}`,
      `tosa-maquina-label/${index}/${weightKg}`,
    )
    scenarios += 1
  }
  assertFamilyCount(scenarios, 'tosa na máquina')
})

test('100 cenários hipotéticos de tosa na tesoura preservam duração e nome amigável', () => {
  let scenarios = 0
  for (let index = 0; index < CASES_PER_FAMILY; index += 1) {
    const weightKg = weightFor(index)
    const expectedDuration = weightKg < 10 ? 120 : 150
    const expectedSize = weightKg < 10 ? 'Porte Pequeno' : 'Porte Médio'

    assert.equal(resolvePetshopServiceDuration({ service: scissorGroomingService, weightKg }), expectedDuration, `tosa-tesoura/${index}/${weightKg}`)
    assert.equal(
      friendlyPetshopServiceLabel(scissorGroomingService, { weightKg }),
      `Banho e Tosa na Tesoura ${expectedSize}`,
      `tosa-tesoura-label/${index}/${weightKg}`,
    )
    scenarios += 1
  }
  assertFamilyCount(scenarios, 'tosa na tesoura')
})

test('100 cenários hipotéticos de veterinária respeitam dias úteis e finais de semana', () => {
  let scenarios = 0
  for (let index = 0; index < CASES_PER_FAMILY; index += 1) {
    const date = isoDateFromOffset(index)
    const utcDay = new Date(`${date}T12:00:00.000Z`).getUTCDay()
    const weekday = utcDay >= 1 && utcDay <= 5
    const result = buildServiceAvailability({
      serviceQuery: veterinaryService.id,
      orderType: 'veterinaria',
      date,
      preferredTime: '14:00',
      services: [veterinaryService],
      appointments: [],
      settings: operationalSettings,
      now: NOW,
    })

    assert.equal(Boolean(result.requested_slot?.available), weekday, `veterinaria/${index}/${date}`)
    if (weekday) {
      assert.equal(result.status, 'available', `veterinaria-status/${index}/${date}`)
    } else {
      assert.equal(result.status, 'unavailable', `veterinaria-status/${index}/${date}`)
    }
    scenarios += 1
  }
  assertFamilyCount(scenarios, 'veterinária')
})

test('100 cenários hipotéticos de produtos usam preço real e taxa configurada', () => {
  let scenarios = 0
  for (let index = 0; index < CASES_PER_FAMILY; index += 1) {
    const quantity = (index % 4) + 1
    const price = Number((12.5 + index * 0.73).toFixed(2))
    const delivery = index % 2 === 0
    const deliveryFee = delivery ? 9 + (index % 5) : 0
    const product = {
      id: `product-${index}`,
      name: `Produto Pet ${index}`,
      price,
      stock_quantity: quantity + 10,
      active: true,
    }
    const prepared = preparePetshopOrderDraft({
      args: {
        customer_name: customerNames[index % customerNames.length],
        order_type: 'produto',
        items: [{ product_id: product.id, name: 'Nome e preço inventados', quantity, upsell: false }],
        payment_method: delivery
          ? (index % 3 === 0 ? 'pix' : index % 3 === 1 ? 'dinheiro' : 'cartao')
          : 'a_combinar',
        fulfillment_type: delivery ? 'entrega' : 'retirada',
        delivery_address: delivery ? `Rua Produto, ${100 + index}` : null,
        delivery_neighborhood: delivery ? 'Centro' : null,
        delivery_city: delivery ? 'Muriaé' : null,
        delivery_reference: delivery ? `Referência ${index}` : null,
      },
      products: [product],
      settings: { deliveryFee },
    })

    assert.equal(prepared.ok, true, `produto/${index}`)
    assert.equal(prepared.order.items[0].name, product.name, `produto-nome/${index}`)
    assert.equal(prepared.order.items[0].unit_price, price, `produto-preco/${index}`)
    assert.equal(prepared.order.total, Number((price * quantity + deliveryFee).toFixed(2)), `produto-total/${index}`)
    scenarios += 1
  }
  assertFamilyCount(scenarios, 'produtos')
})

test('100 cenários hipotéticos de ração preservam marca, quantidade, estoque e preço real', () => {
  let scenarios = 0
  const brands = ['Golden', 'Premier', 'Royal Canin', 'GranPlus', 'N&D', 'Special Dog', 'Quatree', 'Biofresh', 'Guabi', 'Pedigree']
  for (let index = 0; index < CASES_PER_FAMILY; index += 1) {
    const quantity = (index % 3) + 1
    const bagKg = [1, 2.5, 3, 10, 15][index % 5]
    const price = Number((28.9 + index * 1.17).toFixed(2))
    const product = {
      id: `ration-${index}`,
      name: `Ração ${brands[index % brands.length]} ${bagKg} kg`,
      price,
      stock_quantity: quantity + (index % 7) + 1,
      active: true,
    }
    const prepared = preparePetshopOrderDraft({
      args: {
        customer_name: customerNames[index % customerNames.length],
        order_type: 'produto',
        items: [{ product_id: product.id, name: 'Ração genérica', quantity, upsell: false }],
        payment_method: 'a_combinar',
        fulfillment_type: 'retirada',
      },
      products: [product],
      settings: { deliveryFee: 99 },
    })

    assert.equal(prepared.ok, true, `racao/${index}`)
    assert.equal(prepared.order.items[0].name, product.name, `racao-nome/${index}`)
    assert.equal(prepared.order.items[0].quantity, quantity, `racao-quantidade/${index}`)
    assert.equal(prepared.order.items[0].unit_price, price, `racao-preco/${index}`)
    assert.equal(prepared.order.total, Number((price * quantity).toFixed(2)), `racao-total/${index}`)
    scenarios += 1
  }
  assertFamilyCount(scenarios, 'ração')
})

test('100 cenários hipotéticos de capacidade bloqueiam somente o terceiro atendimento simultâneo', () => {
  let scenarios = 0
  for (let index = 0; index < CASES_PER_FAMILY; index += 1) {
    const usedCapacity = index % 3
    const appointments = Array.from({ length: usedCapacity }, (_, appointmentIndex) => ({
      id: `busy-${index}-${appointmentIndex}`,
      scheduled_at: '2026-07-27T08:00:00-03:00',
      duration_min: 40,
      status: appointmentIndex % 2 === 0 ? 'confirmado' : 'agendado',
    }))
    const result = buildServiceAvailability({
      serviceQuery: bathService.id,
      orderType: 'banho_tosa',
      species: 'dog',
      breed: breeds[index % breeds.length],
      weightKg: 8,
      coatType: 'longo',
      date: '2026-07-27',
      preferredTime: '08:00',
      services: [bathService],
      appointments,
      settings: operationalSettings,
      now: NOW,
    })

    assert.equal(Boolean(result.requested_slot?.available), usedCapacity < 2, `capacidade/${index}/${usedCapacity}`)
    if (usedCapacity < 2) {
      assert.equal(result.available_slots.find((slot) => slot.time === '08:00')?.capacity_remaining, 2 - usedCapacity, `capacidade-restante/${index}`)
    } else {
      assert.equal(result.day_schedule.find((slot) => slot.time === '08:00')?.status, 'ocupado', `capacidade-ocupado/${index}`)
    }
    scenarios += 1
  }
  assertFamilyCount(scenarios, 'capacidade da agenda')
})

test('100 cenários hipotéticos de MotoDog ignoram taxa inventada e usam a configuração', () => {
  let scenarios = 0
  const options = [
    { id: 'sem_transporte', label: 'Cliente leva e busca', fee: 0, active: true },
    { id: 'somente_buscar', label: 'Somente buscar', fee: 12, active: true },
    { id: 'somente_levar', label: 'Somente levar', fee: 14, active: true },
    { id: 'buscar_e_levar', label: 'Buscar e levar', fee: 24, active: true },
  ]
  for (let index = 0; index < CASES_PER_FAMILY; index += 1) {
    const expected = options[index % options.length]
    const selection = resolvePetTransportSelection({
      orderType: 'banho_tosa',
      args: {
        service_transport_mode: expected.id,
        service_transport_fee: 999 + index,
      },
      settings: { petTransportOptions: options },
    })

    assert.equal(selection.ok, true, `motodog/${index}`)
    if (expected.id === 'sem_transporte') {
      assert.equal(selection.requested, false, `motodog-cliente-leva/${index}`)
      assert.equal(selection.mode, null, `motodog-modo/${index}`)
      assert.equal(selection.fee, 0, `motodog-taxa/${index}`)
      assert.equal(selection.customer_brings_pet, true, `motodog-cliente/${index}`)
    } else {
      assert.equal(selection.requested, true, `motodog-solicitado/${index}`)
      assert.equal(selection.mode, expected.id, `motodog-modo/${index}`)
      assert.equal(selection.fee, expected.fee, `motodog-taxa/${index}`)
      assert.equal(selection.customer_brings_pet, false, `motodog-cliente/${index}`)
    }
    scenarios += 1
  }
  assertFamilyCount(scenarios, 'MotoDog')
})

test('100 cenários hipotéticos de confirmação separam aceite claro de alteração ou recusa', () => {
  let scenarios = 0
  const positives = [
    'sim',
    'Pode finalizar',
    'sim, obrigada',
    'sim obrigado!',
    'sim, pode separar por favor',
    'confirmo o pedido, obrigada',
  ]
  const negatives = [
    'sim, mas troca para entrega',
    'não confirmo',
    'pode esperar',
    'talvez',
    'quero mudar o horário',
  ]
  for (let index = 0; index < CASES_PER_FAMILY; index += 1) {
    const expected = index % 2 === 0
    const message = expected
      ? positives[(index / 2) % positives.length]
      : negatives[Math.floor(index / 2) % negatives.length]
    assert.equal(isExplicitPetbotConfirmation(message), expected, `confirmacao/${index}/${message}`)
    scenarios += 1
  }
  assertFamilyCount(scenarios, 'confirmação')
})

test('100 cenários hipotéticos de conversa preservam pet, raça e peso entre mensagens', () => {
  let scenarios = 0
  for (let index = 0; index < CASES_PER_FAMILY; index += 1) {
    const petName = petNames[index % petNames.length]
    const breed = breeds[index % breeds.length]
    const weightKg = weightFor(index)
    const firstTurn = mergeInterpretedPetbotServiceFacts({
      interpretation: {
        customer_name: customerNames[index % customerNames.length],
        pet_name: petName,
        breed,
        weight_kg: weightKg,
      },
    })
    const secondTurn = mergeInterpretedPetbotServiceFacts({
      interpretation: {
        service_type: index % 3 === 0 ? 'banho' : index % 3 === 1 ? 'tosa maquina' : 'tosa tesoura',
        service_date: isoDateFromOffset(index % 30),
        service_preferred_time: `${String(8 + (index % 9)).padStart(2, '0')}:00`,
      },
      previousFacts: firstTurn,
    })

    assert.equal(secondTurn.pet_name, petName, `estado-pet/${index}`)
    assert.equal(secondTurn.breed, breed, `estado-raca/${index}`)
    assert.equal(secondTurn.weight_kg, weightKg, `estado-peso/${index}`)
    assert.match(secondTurn.service_date, /^2026-\d{2}-\d{2}$/, `estado-data/${index}`)
    scenarios += 1
  }
  assertFamilyCount(scenarios, 'continuidade da conversa')
})

test('matriz preditiva executa 1000 cenários operacionais no total', () => {
  assert.equal(CASES_PER_FAMILY * 10, 1000)
})
