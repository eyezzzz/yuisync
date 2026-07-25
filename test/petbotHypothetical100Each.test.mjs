import assert from 'node:assert/strict'
import test from 'node:test'

import { preparePetshopOrderDraft } from '../server/lib/petbotAgent.js'

const names = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fabio', 'Gabriela', 'Hugo', 'Iara', 'Joao']
const pets = ['Thor', 'Nina', 'Mel', 'Bob', 'Luna', 'Theo', 'Pipoca', 'Amora', 'Fred', 'Belinha']
const breeds = ['Shih Tzu', 'Spitz Alemão', 'Poodle', 'Pug', 'SRD', 'Golden Retriever', 'Yorkshire', 'Schnauzer', 'Border Collie', 'Maltês']
const weights = [2, 4.5, 7, 9.9, 10, 10.1, 12, 15, 21.9, 22]

function scenario(index) {
  return {
    customer: names[index % names.length],
    pet: pets[(index * 3) % pets.length],
    breed: breeds[(index * 7) % breeds.length],
    weight: weights[(index * 9) % weights.length],
    quantity: (index % 4) + 1,
    hour: 8 + (index % 10),
    minute: index % 2 === 0 ? '00' : '30',
  }
}

function scheduledAt(index) {
  const data = scenario(index)
  return `2026-07-${String(27 + (index % 3)).padStart(2, '0')}T${String(data.hour).padStart(2, '0')}:${data.minute}:00-03:00`
}

function serviceArgs(index, orderType, serviceCode) {
  const data = scenario(index)
  return {
    customer_name: data.customer,
    pet_name: data.pet,
    species: 'dog',
    breed: data.breed,
    weight_kg: data.weight,
    size: data.weight <= 10 ? 'pequeno' : 'medio',
    symptom: orderType === 'veterinaria' ? (index % 2 === 0 ? 'coceira' : 'consulta de rotina') : null,
    order_type: orderType,
    items: [],
    appointment_id: `slot-${orderType}-${index}`,
    scheduled_at: null,
    service_code: serviceCode,
    service_type: serviceCode,
    service_transport_mode: 'sem_transporte',
  }
}

function appointment(index, serviceType, price, durationMin) {
  return {
    id: `slot-banho_tosa-${index}`,
    service_type: serviceType,
    scheduled_at: scheduledAt(index),
    price,
    duration_min: durationMin,
    status: 'available',
  }
}

function assertUnavailable(result, label) {
  assert.equal(result.ok, false, label)
  assert.ok(result.missing?.includes('horário disponível'), label)
}

function assertServiceResult({ result, data, slot, price, summaryPattern, label }) {
  assert.equal(result.ok, true, label)
  assert.equal(result.order.customer_name, data.customer, label)
  assert.equal(result.order.pet_name, data.pet, label)
  assert.equal(result.order.total, price, label)
  assert.equal(result.order.appointment_id, slot.id, label)
  assert.match(result.summary, summaryPattern, label)
  assert.doesNotMatch(result.summary, /Pagamento:/i, label)
}

test('100 cenarios hipoteticos de banho aceitam horarios validos e rejeitam encerramento tardio', () => {
  for (let index = 0; index < 100; index += 1) {
    const data = scenario(index)
    const price = 60 + (index % 5) * 7
    const duration = data.weight <= 10 ? 40 : 60
    const args = serviceArgs(index, 'banho_tosa', 'banho')
    const slot = appointment(index, 'banho', price, duration)
    const result = preparePetshopOrderDraft({
      args,
      services: [{ id: 'banho', code: 'banho', name: 'Banho Pet', group_type: 'banho_tosa', default_price: price, default_duration_min: duration, active: true }],
      appointments: [slot],
      now: new Date('2026-07-25T10:00:00-03:00'),
    })

    const label = `banho/${index}`
    if (index % 10 === 9) {
      assertUnavailable(result, label)
      continue
    }
    assertServiceResult({ result, data, slot, price, summaryPattern: /Banho/i, label })
  }
})

test('100 cenarios hipoteticos de tosa aceitam horarios validos e rejeitam encerramento tardio', () => {
  const types = [
    ['tosa_maquina', 'Tosa Máquina', 90, 120],
    ['tosa_tesoura', 'Tosa Tesoura', 120, 150],
  ]

  for (let index = 0; index < 100; index += 1) {
    const data = scenario(index)
    const [code, label, smallDuration, mediumDuration] = types[index % types.length]
    const duration = data.weight <= 10 ? smallDuration : mediumDuration
    const price = 95 + (index % 6) * 9
    const args = serviceArgs(index, 'banho_tosa', code)
    const slot = appointment(index, code, price, duration)
    const result = preparePetshopOrderDraft({
      args,
      services: [{ id: code, code, name: label, group_type: 'banho_tosa', default_price: price, default_duration_min: duration, active: true }],
      appointments: [slot],
      now: new Date('2026-07-25T10:00:00-03:00'),
    })

    const scenarioLabel = `tosa/${index}`
    if (index % 10 === 9) {
      assertUnavailable(result, scenarioLabel)
      continue
    }
    assertServiceResult({ result, data, slot, price, summaryPattern: /Tosa/i, label: scenarioLabel })
  }
})

test('100 cenarios hipoteticos de veterinaria respeitam a jornada de 13h a 18h', () => {
  const validTimeIndexes = new Set([5, 6, 7, 8])

  for (let index = 0; index < 100; index += 1) {
    const data = scenario(index)
    const price = 120 + (index % 4) * 15
    const duration = 30 + (index % 2) * 15
    const args = serviceArgs(index, 'veterinaria', 'consulta_veterinaria')
    const slot = {
      id: `slot-veterinaria-${index}`,
      service_type: 'consulta_veterinaria',
      scheduled_at: scheduledAt(index),
      price,
      duration_min: duration,
      status: 'available',
    }
    const result = preparePetshopOrderDraft({
      args,
      services: [{ id: 'consulta-vet', code: 'consulta_veterinaria', name: 'Consulta Veterinária', group_type: 'veterinaria', default_price: price, default_duration_min: duration, active: true }],
      appointments: [slot],
      now: new Date('2026-07-25T10:00:00-03:00'),
    })

    const label = `vet/${index}`
    if (!validTimeIndexes.has(index % 10)) {
      assertUnavailable(result, label)
      continue
    }
    assertServiceResult({ result, data, slot, price, summaryPattern: /Veterin/i, label })
    assert.doesNotMatch(result.summary, /troco|retirada/i, label)
  }
})

test('100 cenarios hipoteticos de produtos respeitam estoque, entrega e retirada a combinar', () => {
  for (let index = 0; index < 100; index += 1) {
    const data = scenario(index)
    const unitPrice = 8 + (index % 10) * 3.5
    const delivery = index % 2 === 0
    const fee = delivery ? 12 : 0
    const productId = `produto-${index}`
    const paymentMethod = delivery
      ? (index % 3 === 0 ? 'pix' : index % 3 === 1 ? 'cartao' : 'dinheiro')
      : 'a_combinar'

    const result = preparePetshopOrderDraft({
      args: {
        customer_name: data.customer,
        order_type: 'produto',
        items: [{ product_id: productId, name: `Produto ${index}`, quantity: data.quantity, upsell: false }],
        payment_method: paymentMethod,
        fulfillment_type: delivery ? 'entrega' : 'retirada',
        delivery_address: delivery ? `Rua ${index}, ${100 + index}` : null,
        delivery_neighborhood: delivery ? 'Centro' : null,
        delivery_city: delivery ? 'Muriaé' : null,
        delivery_reference: delivery ? 'Portão azul' : null,
      },
      products: [{ id: productId, name: `Produto Real ${index}`, price: unitPrice, stock_quantity: data.quantity + 5, active: true }],
      settings: { deliveryFee: fee },
    })

    const label = `produto/${index}`
    assert.equal(result.ok, true, label)
    assert.equal(result.order.items[0].quantity, data.quantity, label)
    assert.equal(result.order.items[0].unit_price, unitPrice, label)
    assert.equal(result.order.total, unitPrice * data.quantity + fee, label)
    assert.match(result.summary, /Produto Real/i, label)
  }
})

test('100 cenarios hipoteticos de racao preservam SKU, volume e retirada a combinar', () => {
  const flavors = ['Frango', 'Carne', 'Cordeiro', 'Salmão', 'Vegetais']
  const sizes = [1, 2.5, 3, 10, 15]

  for (let index = 0; index < 100; index += 1) {
    const data = scenario(index)
    const flavor = flavors[index % flavors.length]
    const sizeKg = sizes[(index * 3) % sizes.length]
    const unitPrice = 24.9 + (index % 8) * 11
    const productId = `racao-${index}`
    const productName = `Ração Premium ${flavor} ${sizeKg}kg`

    const result = preparePetshopOrderDraft({
      args: {
        customer_name: data.customer,
        order_type: 'produto',
        items: [{ product_id: productId, name: 'Ração solicitada', quantity: data.quantity, upsell: false }],
        payment_method: 'a_combinar',
        fulfillment_type: 'retirada',
      },
      products: [{ id: productId, sku: `RAC-${String(index).padStart(3, '0')}`, name: productName, price: unitPrice, stock_quantity: data.quantity + 10, active: true }],
      settings: { deliveryFee: 0 },
    })

    const label = `racao/${index}`
    assert.equal(result.ok, true, label)
    assert.equal(result.order.items[0].name, productName, label)
    assert.equal(result.order.items[0].unit_price, unitPrice, label)
    assert.equal(result.order.items[0].quantity, data.quantity, label)
    assert.equal(result.order.total, unitPrice * data.quantity, label)
    assert.match(result.summary, new RegExp(`${sizeKg}kg`, 'i'), label)
  }
})
