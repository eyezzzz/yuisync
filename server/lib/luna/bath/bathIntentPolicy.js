import { LUNA_BATH_EVENTS, createBathEvent } from './bathEvents.js'

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

function numberOrNull(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function compactObject(source = {}) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== null && value !== undefined && value !== ''))
}

function pendingOrderValue(pendingOrder = null) {
  return objectValue(objectValue(pendingOrder).order)
}

function rejectedSlotFromRuns(toolRuns = [], explicitRejectedSlot = null) {
  if (explicitRejectedSlot && typeof explicitRejectedSlot === 'object') return explicitRejectedSlot
  for (const run of Array.isArray(toolRuns) ? toolRuns : []) {
    const requested = run?.result?.requested_slot
    if (requested && requested.available === false) return requested
  }
  return null
}

export function deriveBathEvents({
  facts = {},
  customer = {},
  resolvedService = null,
  pendingOrder = null,
  rejectedSlot = null,
  toolRuns = [],
  turnSemantics = {},
} = {}) {
  const source = objectValue(facts)
  const order = pendingOrderValue(pendingOrder)
  const events = [createBathEvent(LUNA_BATH_EVENTS.START, {
    pending_order_active: Boolean(objectValue(pendingOrder).id),
  }, { source: 'bath_intent_policy' })]

  const customerPayload = compactObject({
    id: text(customer?.id || customer?.client_id, 160) || null,
    name: text(customer?.name || customer?.customer_name, 200) || null,
    phone: text(customer?.phone || customer?.customer_phone, 80) || null,
  })
  if (Object.keys(customerPayload).length) {
    events.push(createBathEvent(LUNA_BATH_EVENTS.SET_CUSTOMER, customerPayload, { source: 'structured_customer' }))
  }

  const petPayload = compactObject({
    name: text(source.pet_name || order.pet_name, 160) || null,
    species: text(source.species || order.species, 80) || null,
    breed: text(source.breed || order.breed, 180) || null,
    size: text(source.size || order.size, 80) || null,
    weight_kg: numberOrNull(source.weight_kg || order.weight_kg),
    weight_label: text(source.weight_label || order.weight_label, 80) || null,
    coat_type: text(source.coat_type || order.coat_type, 80) || null,
  })
  if (Object.keys(petPayload).length) {
    events.push(createBathEvent(LUNA_BATH_EVENTS.SET_PET, petPayload, { source: 'structured_service_facts' }))
  }

  const service = objectValue(resolvedService)
  const servicePayload = compactObject({
    id: text(order.service_product_id || service.source_product_id || service.id, 160) || null,
    service_id: text(service.id || order.service_product_id, 160) || null,
    code: text(order.service_type || service.code || source.service_type, 160) || null,
    name: text(order.service_label || service.name, 240) || null,
    duration_min: numberOrNull(order.duration_min || service.default_duration_min),
    unit_price: numberOrNull(order.regular_service_price || service.default_price || order.items?.[0]?.unit_price),
    kind: 'service',
  })
  if (servicePayload.code || servicePayload.id || servicePayload.name) {
    events.push(createBathEvent(LUNA_BATH_EVENTS.SET_SERVICE, servicePayload, { source: order.service_type ? 'pending_order' : 'catalog_resolution' }))
  }

  const schedulePayload = compactObject({
    date: text(source.service_date, 40) || null,
    time: text(source.service_preferred_time || source.service_time_preference, 40) || null,
    period: text(source.service_time_preference, 80) || null,
    scheduled_at: text(order.scheduled_at, 120) || null,
    appointment_id: text(order.appointment_id, 160) || null,
    duration_min: numberOrNull(order.duration_min || service.default_duration_min),
  })
  if (schedulePayload.date || schedulePayload.time || schedulePayload.scheduled_at) {
    events.push(createBathEvent(LUNA_BATH_EVENTS.SET_SCHEDULE, schedulePayload, { source: 'structured_schedule' }))
  }

  const rejected = rejectedSlotFromRuns(toolRuns, rejectedSlot)
  if (rejected) {
    events.push(createBathEvent(LUNA_BATH_EVENTS.REJECT_SCHEDULE, {
      scheduled_at: text(rejected.scheduled_at, 120) || null,
      date: text(source.service_date, 40) || null,
      time: text(rejected.time || source.service_preferred_time || source.service_time_preference, 40) || null,
    }, { source: 'fresh_agenda' }))
  }

  const transportMode = text(source.service_transport_mode || order.service_transport_mode, 120)
  if (transportMode) {
    events.push(createBathEvent(LUNA_BATH_EVENTS.SELECT_TRANSPORT_MODE, {
      mode: transportMode,
      label: text(source.service_transport_label || order.service_transport_label, 180) || null,
      fee: Number(order.service_transport_fee || 0) || 0,
      customer_brings_pet: transportMode === 'cliente_leva' || order.service_transport_customer_brings === true,
    }, { source: text(turnSemantics?.transport_intent, 80) || 'structured_transport' }))
  } else if (source.service_transport_options_requested === true) {
    events.push(createBathEvent(LUNA_BATH_EVENTS.REQUEST_TRANSPORT_OPTIONS, {}, {
      source: text(turnSemantics?.transport_intent, 80) || 'structured_transport',
    }))
  }

  const addressPayload = compactObject({
    street: text(source.service_transport_address || order.service_transport_address, 240) || null,
    neighborhood: text(source.service_transport_neighborhood || order.service_transport_neighborhood, 160) || null,
    city: text(source.service_transport_city || order.service_transport_city, 160) || null,
    reference: text(source.service_transport_reference || order.service_transport_reference, 240) || null,
    confirmed: source.service_transport_address_confirmed === true || Boolean(order.service_transport_address),
    from_profile: source.service_transport_address_from_profile === true,
  })
  if (Object.values(addressPayload).some(Boolean)) {
    events.push(createBathEvent(LUNA_BATH_EVENTS.SET_TRANSPORT_ADDRESS, addressPayload, { source: 'structured_address' }))
  }

  if (source.service_notes_resolved === true || text(source.service_notes || order.notes)) {
    events.push(createBathEvent(LUNA_BATH_EVENTS.SET_NOTES, {
      text: text(source.service_notes || order.notes, 500) || null,
      resolved: true,
    }, { source: 'structured_service_notes' }))
  }

  if (objectValue(pendingOrder).id && Object.keys(order).length) {
    events.push(createBathEvent(LUNA_BATH_EVENTS.HYDRATE_PENDING_ORDER, {
      pending_order_id: text(pendingOrder.id, 160),
      confirmation_fingerprint: text(pendingOrder.confirmation_fingerprint, 160) || null,
      order,
    }, { source: 'validated_legacy_preparation' }))
  }

  return events
}
