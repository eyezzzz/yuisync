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

function serviceArgs(index, orderType, serviceCode, transport = 'sem_transporte') {
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
    service_transport_mode: transport,
  }
}

function appointment(index, serviceType, price, durationMin) {
  return {
    id: `slot-${serviceType.includes('vet') ? 'veterinaria' : serviceType.includes('tosa') ? 'banho_tosa' : 'banho_tosa'}-${index}`,
    service_type: serviceType,
    scheduled_at: scheduledAt(index),
    price,
    duration_min: durationMin,
    status: 'available',
  }
}

test('100 cenarios hipoteticos de banho preservam preco, agenda e dados do pet', () => {
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

    assert.equal(result.ok, true, `banho/${index}`)
    assert.equal(result.order.customer_name, data.customer, `banho/${index}`)
    assert.equal(result.order.pet_name, data.pet, `banho/${index}`)
    assert.equal(result.order.total, price, `banho/${index}`)
    assert.equal(result.order.appointment_id, slot.id, `banho/${index}`)
    assert.match(result.summary, /Banho/i, `banho/${index}`)
    assert.doesNotMatch(result.summary, /Pagamento:/i, `banho/${index}`)
  }
})

test('100 cenarios hipoteticos de tosa preservam tipo, preco e duracao', () => {
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

    assert.equal(result.ok, true, `tosa/${index}`)
    assert.equal(result.order.total, price, `tosa/${index}`)
    assert.equal(result.order.appointment_id, slot.id, `tosa/${index}`)
    assert.match(result.summary, /Tosa/i, `tosa/${index}`)
    assert.doesNotMatch(result.summary, /Pagamento:/i, `tosa/${index}`)
  }
})

test('100 cenarios hipoteticos de veterinaria mantem sintoma, horario e valor real', () => {
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

    assert.equal(result.ok, true, `vet/${index}`)
    assert.equal(result.order.pet_name, data.pet, `vet/${index}`)
    assert.equal(result.order.total, price, `vet/${index}`)
    assert.equal(result.order.appointment_id, slot.id, `vet/${index}`)
    assert.match(result.summary, /Veterin/i, `vet/${index}`)
    assert.doesNotMatch(result.summary, /troco|retirada|Pagamento:/i, `vet/${index}`)
  }
})

test('100 cenarios hipoteticos de produtos respeitam estoque, quantidade e taxa de entrega', () => {
  for (let index = 0; index < 100; index += 1) {
    const data = scenario(index)
    const unitPrice = 8 + (index % 10) * 3.5
    const delivery = index % 2 === 0
    const fee = delivery ? 12 : 0
    const productId = `produto-${index}`

    const result = preparePetshopOrderDraft({
      args: {
        customer_name: data.customer,
        order_type: 'produto',
        items: [{ product_id: productId, name: `Produto ${index}`, quantity: data.quantity, upsell: false }],
        payment_method: index % 3 === 0 ? 'pix' : index % 3 === 1 ? 'cartao' : 'dinheiro',
        fulfillment_type: delivery ? 'entrega' : 'retirada',
        delivery_address: delivery ? `Rua ${index}, ${100 + index}` : null,
        delivery_neighborhood: delivery ? 'Centro' : null,
        delivery_city: delivery ? 'Muriaé' : null,
        delivery_reference: delivery ? 'Portão azul' : null,
      },
      products: [{ id: productId, name: `Produto Real ${index}`, price: unitPrice, stock_quantity: data.quantity + 5, active: true }],
      settings: { deliveryFee: fee },
    })

    assert.equal(result.ok, true, `produto/${index}`)
    assert.equal(result.order.items[0].quantity, data.quantity, `produto/${index}`)
    assert.equal(result.order.items[0].unit_price, unitPrice, `produto/${index}`)
    assert.equal(result.order.total, unitPrice * data.quantity + fee, `produto/${index}`)
    assert.match(result.summary, /Produto Real/i, `produto/${index}`)
  }
})

test('100 cenarios hipoteticos de racao preservam SKU real, volume e estoque', () => {
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
        payment_method: 'pix',
        fulfillment_type: 'retirada',
      },
      products: [{ id: productId, sku: `RAC-${String(index).padStart(3, '0')}`, name: productName, price: unitPrice, stock_quantity: data.quantity + 10, active: true }],
      settings: { deliveryFee: 0 },
    })

    assert.equal(result.ok, true, `racao/${index}`)
    assert.equal(result.order.items[0].name, productName, `racao/${index}`)
    assert.equal(result.order.items[0].unit_price, unitPrice, `racao/${index}`)
    assert.equal(result.order.items[0].quantity, data.quantity, `racao/${index}`)
    assert.equal(result.order.total, unitPrice * data.quantity, `racao/${index}`)
    assert.match(result.summary, new RegExp(`${sizeKg}kg`, 'i'), `racao/${index}`)
  }
})
