import { createOperationState } from '../operationState.js'

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function positiveNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function firstServiceItem(items = []) {
  return (Array.isArray(items) ? items : []).find((item) => item?.kind === 'service') || null
}

export function projectBathStateToLegacyFacts(stateInput = {}, legacyFacts = {}) {
  const state = createOperationState(stateInput)
  const facts = objectValue(legacyFacts)
  const bath = objectValue(state.metadata?.bath)
  const address = objectValue(state.transport?.address)
  const note = text(state.notes?.[0]?.text, 500) || null

  return {
    ...facts,
    pet_name: text(state.pet?.name, 160) || null,
    pet_name_explicit: Boolean(text(state.pet?.name)),
    species: text(state.pet?.species, 80) || null,
    species_explicit: Boolean(text(state.pet?.species)),
    breed: text(state.pet?.breed, 180) || null,
    breed_explicit: Boolean(text(state.pet?.breed)),
    size: text(state.pet?.size, 80) || null,
    size_explicit: Boolean(text(state.pet?.size)),
    weight_kg: positiveNumber(state.pet?.weight_kg),
    weight_label: text(state.pet?.weight_label, 80)
      || (positiveNumber(state.pet?.weight_kg) ? `${positiveNumber(state.pet?.weight_kg)} kg` : null),
    weight_explicit: Boolean(positiveNumber(state.pet?.weight_kg)),
    coat_type: text(state.pet?.coat_type, 80) || null,
    service_type: text(bath.service_type, 200) || facts.service_type || null,
    service_date: text(state.schedule?.date, 40) || facts.service_date || null,
    service_preferred_time: text(state.schedule?.time, 40) || facts.service_preferred_time || null,
    service_time_preference: text(state.schedule?.period, 80)
      || text(state.schedule?.time, 40)
      || facts.service_time_preference
      || null,
    service_notes: note,
    service_notes_resolved: bath.service_notes_resolved === true || facts.service_notes_resolved === true,
    service_notes_explicit: bath.service_notes_resolved === true || facts.service_notes_explicit === true,
    service_transport_mode: text(state.transport?.mode, 120) || null,
    service_transport_mode_explicit: Boolean(text(state.transport?.mode)),
    service_transport_options_requested: state.transport?.options_requested === true && !text(state.transport?.mode),
    service_transport_label: text(state.transport?.label, 180) || null,
    service_transport_address: text(address.street, 240) || null,
    service_transport_neighborhood: text(address.neighborhood, 160) || null,
    service_transport_city: text(address.city, 160) || null,
    service_transport_reference: text(address.reference, 240) || null,
    service_transport_address_confirmed: state.transport?.address_confirmed === true,
    service_transport_address_from_profile: state.transport?.address_from_profile === true,
  }
}

export function projectBathStateToPendingOrder(stateInput = {}, pendingOrderInput = null) {
  const pending = objectValue(pendingOrderInput)
  const order = objectValue(pending.order)
  if (!pending.id || !Object.keys(order).length) return pendingOrderInput

  const state = createOperationState(stateInput)
  const bath = objectValue(state.metadata?.bath)
  const address = objectValue(state.transport?.address)
  const serviceItem = firstServiceItem(state.items)
  const additionalItems = state.items.filter((item) => item.kind === 'additional_service')

  return {
    ...pending,
    order: {
      ...order,
      customer_name: text(state.customer?.name, 200) || order.customer_name,
      pet_name: text(state.pet?.name, 160) || order.pet_name,
      species: text(state.pet?.species, 80) || order.species,
      breed: text(state.pet?.breed, 180) || order.breed,
      size: text(state.pet?.size, 80) || order.size,
      weight_kg: positiveNumber(state.pet?.weight_kg) || order.weight_kg,
      weight_label: text(state.pet?.weight_label, 80) || order.weight_label,
      coat_type: text(state.pet?.coat_type, 80) || order.coat_type,
      service_type: text(bath.service_type, 200) || order.service_type,
      service_label: text(bath.service_label, 240) || order.service_label,
      service_product_id: text(bath.service_id, 160) || order.service_product_id,
      scheduled_at: text(state.schedule?.scheduled_at, 120) || order.scheduled_at,
      appointment_id: text(state.schedule?.appointment_id, 160) || order.appointment_id,
      duration_min: positiveNumber(state.schedule?.duration_min)
        || positiveNumber(bath.duration_min)
        || order.duration_min,
      service_transport_mode: text(state.transport?.mode, 120) || order.service_transport_mode,
      service_transport_label: text(state.transport?.label, 180) || order.service_transport_label,
      service_transport_fee: Number(state.transport?.fee ?? order.service_transport_fee ?? 0),
      service_transport_customer_brings: state.transport?.customer_brings_pet === true,
      service_transport_address: text(address.street, 240) || order.service_transport_address,
      service_transport_neighborhood: text(address.neighborhood, 160) || order.service_transport_neighborhood,
      service_transport_city: text(address.city, 160) || order.service_transport_city,
      service_transport_reference: text(address.reference, 240) || order.service_transport_reference,
      notes: text(state.notes?.[0]?.text, 500) || order.notes || null,
      items: serviceItem
        ? [
          {
            ...(Array.isArray(order.items) ? order.items[0] : {}),
            product_id: serviceItem.metadata?.product_id || order.items?.[0]?.product_id || serviceItem.id,
            service_id: serviceItem.metadata?.service_id || order.items?.[0]?.service_id || serviceItem.id,
            name: serviceItem.name || order.items?.[0]?.name,
            quantity: serviceItem.quantity || 1,
            unit_price: Number(serviceItem.unit_price || order.items?.[0]?.unit_price || 0),
            upsell: false,
          },
          ...additionalItems.map((item) => ({
            product_id: item.metadata?.product_id || item.id,
            service_id: item.metadata?.service_id || item.id,
            name: item.name,
            quantity: item.quantity || 1,
            unit_price: Number(item.unit_price || 0),
            upsell: true,
          })),
        ]
        : order.items,
      total: Number(state.totals?.total || order.total || 0),
    },
  }
}
