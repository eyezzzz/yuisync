import { createOperationState } from '../operationState.js'
import { LUNA_BATH_EVENTS, createBathEvent } from './bathEvents.js'

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function compactPatch(source = {}) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== null && value !== undefined && value !== ''))
}

function canonicalItem(item = {}, fallbackKind = 'service') {
  const source = objectValue(item)
  const quantity = Math.max(1, finiteNumber(source.quantity, 1))
  const unitPrice = Math.max(0, finiteNumber(source.unit_price ?? source.price ?? source.default_price, 0))
  return {
    id: text(source.id || source.product_id || source.service_id || source.catalog_id, 160) || null,
    kind: text(source.kind || source.type || source.item_type, 80) || fallbackKind,
    name: text(source.name || source.service_label || source.product_name, 240) || null,
    quantity,
    unit_price: unitPrice,
    total: Math.max(0, finiteNumber(source.total, unitPrice * quantity)),
    metadata: {
      product_id: text(source.product_id, 160) || null,
      service_id: text(source.service_id, 160) || null,
      upsell: source.upsell === true,
      duration_min: Math.max(0, finiteNumber(source.duration_min, 0)),
    },
  }
}

function appendLedger(state, event) {
  return [
    ...(Array.isArray(state.ledger) ? state.ledger : []),
    {
      event: event.type,
      version: Number(state.version || 0) + 1,
      source: text(event.metadata?.source, 100) || null,
      at: text(event.metadata?.at, 80) || null,
    },
  ].slice(-100)
}

function requiredFieldsForBath(state = {}) {
  const required = []
  if (!text(state.customer?.name)) required.push('customer.name')
  if (!text(state.pet?.name)) required.push('pet.name')
  if (!text(state.pet?.species)) required.push('pet.species')
  if (!text(state.pet?.breed)) required.push('pet.breed')
  if (!(Number(state.pet?.weight_kg || 0) > 0)) required.push('pet.weight_kg')
  if (!text(state.metadata?.bath?.service_type) && !(state.items || []).some((item) => item.kind === 'service')) {
    required.push('service')
  }
  if (!text(state.schedule?.date) && !text(state.schedule?.scheduled_at)) required.push('schedule.date')
  if (!text(state.schedule?.time) && !text(state.schedule?.scheduled_at)) required.push('schedule.time')
  if (!text(state.transport?.mode)) required.push('transport.mode')
  if (text(state.transport?.mode) && state.transport?.customer_brings_pet !== true) {
    if (!text(state.transport?.address?.street)) required.push('transport.address.street')
    if (!text(state.transport?.address?.neighborhood)) required.push('transport.address.neighborhood')
    if (!text(state.transport?.address?.city)) required.push('transport.address.city_or_district')
    if (!text(state.transport?.address?.reference)) required.push('transport.address.reference')
  }
  return required
}

function deriveStatus(state = {}, pendingOrderId = '') {
  if (text(pendingOrderId)) return 'awaiting_confirmation'
  const required = requiredFieldsForBath(state)
  const hasPetBasics = !required.some((field) => ['pet.name', 'pet.species', 'pet.breed', 'pet.weight_kg'].includes(field))
  const hasService = !required.includes('service')
  const hasSchedule = !required.includes('schedule.date') && !required.includes('schedule.time')
  const hasTransport = !required.some((field) => field.startsWith('transport.'))
  if (hasPetBasics && hasService && hasSchedule && hasTransport) return 'preparing_summary'
  if (hasPetBasics && hasService && (state.schedule?.date || state.schedule?.time || state.schedule?.scheduled_at)) {
    return 'selecting_schedule'
  }
  return 'collecting_data'
}

function totalsFromItems(items = [], transportFee = 0, fallbackTotal = 0) {
  const subtotal = items.reduce((sum, item) => sum + Math.max(0, finiteNumber(item.total, 0)), 0)
  const transport = Math.max(0, finiteNumber(transportFee, 0))
  return {
    subtotal,
    transport,
    discounts: 0,
    total: Math.max(0, finiteNumber(fallbackTotal, subtotal + transport)),
  }
}

function applyBathEvent(currentState = {}, eventInput = {}) {
  const state = createOperationState(currentState)
  const event = createBathEvent(eventInput.type, eventInput.payload, eventInput.metadata)
  const payload = objectValue(event.payload)
  let next = state

  switch (event.type) {
    case LUNA_BATH_EVENTS.START:
      next = createOperationState({
        ...state,
        type: 'service_booking',
        status: state.status === 'idle' ? 'collecting_data' : state.status,
        metadata: {
          ...state.metadata,
          domain: 'bath',
          bath: {
            ...objectValue(state.metadata?.bath),
            pending_order_active: payload.pending_order_active === true,
          },
        },
      })
      break

    case LUNA_BATH_EVENTS.SET_CUSTOMER:
      next = createOperationState({ ...state, customer: { ...state.customer, ...compactPatch(payload) } })
      break

    case LUNA_BATH_EVENTS.SET_PET:
      next = createOperationState({ ...state, pet: { ...state.pet, ...compactPatch(payload) } })
      break

    case LUNA_BATH_EVENTS.SET_SERVICE: {
      const service = compactPatch(payload)
      let items = state.items
      if (service.id || service.service_id) {
        const item = canonicalItem({
          id: service.id || service.service_id,
          service_id: service.service_id || service.id,
          kind: 'service',
          name: service.name,
          quantity: 1,
          unit_price: service.unit_price,
          duration_min: service.duration_min,
        })
        items = [item, ...state.items.filter((current) => current.kind !== 'service')]
      }
      next = createOperationState({
        ...state,
        items,
        metadata: {
          ...state.metadata,
          bath: {
            ...objectValue(state.metadata?.bath),
            service_type: text(service.code || service.name, 200) || null,
            service_id: text(service.service_id || service.id, 160) || null,
            service_label: text(service.name, 240) || null,
            duration_min: Math.max(0, finiteNumber(service.duration_min, 0)) || null,
          },
        },
      })
      break
    }

    case LUNA_BATH_EVENTS.SET_SCHEDULE:
      next = createOperationState({
        ...state,
        schedule: {
          ...state.schedule,
          ...compactPatch(payload),
        },
      })
      break

    case LUNA_BATH_EVENTS.REJECT_SCHEDULE: {
      const rejectedKey = text(payload.scheduled_at || [payload.date, payload.time].filter(Boolean).join('T'), 120)
      const currentKey = text(state.schedule?.scheduled_at || [state.schedule?.date, state.schedule?.time].filter(Boolean).join('T'), 120)
      const schedule = rejectedKey && currentKey && rejectedKey === currentKey
        ? { ...state.schedule, scheduled_at: null, appointment_id: null, time: null }
        : state.schedule
      next = createOperationState({
        ...state,
        schedule,
        rejected_slots: [...new Set([...(state.rejected_slots || []), rejectedKey].filter(Boolean))],
      })
      break
    }

    case LUNA_BATH_EVENTS.REQUEST_TRANSPORT_OPTIONS:
      next = createOperationState({
        ...state,
        transport: {
          ...state.transport,
          mode: state.transport?.mode || null,
          options_requested: state.transport?.mode ? false : true,
        },
      })
      break

    case LUNA_BATH_EVENTS.SELECT_TRANSPORT_MODE:
      next = createOperationState({
        ...state,
        transport: {
          ...state.transport,
          mode: text(payload.mode, 120) || null,
          label: text(payload.label, 180) || state.transport?.label || null,
          fee: Math.max(0, finiteNumber(payload.fee, state.transport?.fee || 0)),
          customer_brings_pet: payload.customer_brings_pet === true || text(payload.mode) === 'cliente_leva',
          options_requested: false,
        },
      })
      break

    case LUNA_BATH_EVENTS.SET_TRANSPORT_ADDRESS:
      next = createOperationState({
        ...state,
        transport: {
          ...state.transport,
          address: {
            ...objectValue(state.transport?.address),
            ...compactPatch({
              street: payload.street,
              neighborhood: payload.neighborhood,
              city: payload.city,
              reference: payload.reference,
            }),
          },
          address_confirmed: payload.confirmed === true || state.transport?.address_confirmed === true,
          address_from_profile: payload.from_profile === true,
        },
      })
      break

    case LUNA_BATH_EVENTS.SET_NOTES:
      next = createOperationState({
        ...state,
        notes: text(payload.text, 500) ? [{ text: text(payload.text, 500) }] : [],
        metadata: {
          ...state.metadata,
          bath: {
            ...objectValue(state.metadata?.bath),
            service_notes_resolved: payload.resolved === true,
          },
        },
      })
      break

    case LUNA_BATH_EVENTS.HYDRATE_PENDING_ORDER: {
      const order = objectValue(payload.order)
      const orderItems = Array.isArray(order.items) && order.items.length
        ? order.items.map((item) => canonicalItem(item, item?.upsell ? 'additional_service' : 'service'))
        : (Array.isArray(order.additional_services)
          ? order.additional_services.map((item) => canonicalItem(item, 'additional_service'))
          : [])
      const uniqueOrderItems = [...new Map(orderItems.map((item, index) => [
        item.id || `${item.kind}:${item.name || index}`,
        item,
      ])).values()]
      const items = uniqueOrderItems.length ? uniqueOrderItems : state.items
      const transportFee = Math.max(0, finiteNumber(order.service_transport_fee, state.transport?.fee || 0))
      next = createOperationState({
        ...state,
        operation_id: text(payload.pending_order_id, 160) || state.operation_id,
        customer: {
          ...state.customer,
          name: text(order.customer_name, 200) || state.customer?.name || null,
        },
        pet: {
          ...state.pet,
          ...compactPatch({
            name: order.pet_name,
            species: order.species,
            breed: order.breed,
            size: order.size,
            weight_kg: Number(order.weight_kg || 0) || null,
            weight_label: order.weight_label,
            coat_type: order.coat_type,
          }),
        },
        items,
        schedule: {
          ...state.schedule,
          ...compactPatch({
            scheduled_at: order.scheduled_at,
            appointment_id: order.appointment_id,
            duration_min: Number(order.duration_min || 0) || null,
          }),
        },
        transport: {
          ...state.transport,
          ...compactPatch({
            mode: order.service_transport_mode,
            label: order.service_transport_label,
            fee: transportFee,
            customer_brings_pet: order.service_transport_customer_brings === true,
          }),
          options_requested: false,
          address: {
            ...objectValue(state.transport?.address),
            ...compactPatch({
              street: order.service_transport_address,
              neighborhood: order.service_transport_neighborhood,
              city: order.service_transport_city,
              reference: order.service_transport_reference,
            }),
          },
          address_confirmed: Boolean(order.service_transport_address) || state.transport?.address_confirmed === true,
        },
        notes: text(order.notes, 500) ? [{ text: text(order.notes, 500) }] : state.notes,
        totals: totalsFromItems(items, transportFee, order.total),
        metadata: {
          ...state.metadata,
          bath: {
            ...objectValue(state.metadata?.bath),
            service_type: text(order.service_type, 200) || state.metadata?.bath?.service_type || null,
            service_id: text(order.service_product_id, 160) || state.metadata?.bath?.service_id || null,
            service_label: text(order.service_label, 240) || state.metadata?.bath?.service_label || null,
            duration_min: Number(order.duration_min || 0) || state.metadata?.bath?.duration_min || null,
            confirmation_fingerprint: text(payload.confirmation_fingerprint, 160) || null,
            pending_order_projected: true,
            pending_order_active: true,
          },
        },
      })
      break
    }

    default:
      next = state
  }

  const pendingOrderId = next.metadata?.bath?.pending_order_active === true
    ? text(next.operation_id, 160)
    : ''
  const requiredFields = requiredFieldsForBath(next)
  const status = deriveStatus(next, pendingOrderId)
  return createOperationState({
    ...next,
    status,
    required_fields: requiredFields,
    version: Number(state.version || 0) + 1,
    ledger: appendLedger(state, event),
    metadata: {
      ...next.metadata,
      domain: 'bath',
      bath: {
        ...objectValue(next.metadata?.bath),
        preparation_authority: 'luna_kernel',
      },
    },
  })
}

export function buildBathOperationState(previousState = {}, events = []) {
  let state = createOperationState({
    ...previousState,
    type: 'service_booking',
    metadata: {
      ...objectValue(previousState?.metadata),
      domain: 'bath',
      bath: objectValue(previousState?.metadata?.bath),
    },
  })
  for (const event of Array.isArray(events) ? events : []) {
    state = applyBathEvent(state, event)
  }
  return state
}

export { requiredFieldsForBath }
