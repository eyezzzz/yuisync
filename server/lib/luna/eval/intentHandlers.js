import { createOperationEvent, LUNA_OPERATION_EVENTS } from '../operationEvents.js'

function clean(value) {
  return String(value ?? '').trim()
}

function apply(env, type, payload = {}, metadata = {}) {
  const baseEventId = clean(metadata.event_id || metadata.eventId)
  return env.applyEvent(createOperationEvent(type, payload, {
    ...metadata,
    event_id: baseEventId ? `${baseEventId}_${type}` : undefined,
    source: metadata.source || 'luna_eval',
  }))
}

function ensureBathService(env, payload = {}) {
  const service = env.findService(payload.service_id || 'svc_bath_small')
  if (!service) {
    const error = Object.assign(new Error('Bath service fixture is unavailable.'), { code: 'CATALOG_ITEM_NOT_FOUND' })
    throw error
  }
  return service
}

export function executeEvalIntent({ intent, payload = {}, env, stepIndex = 0 } = {}) {
  const name = clean(intent)
  const eventMetadata = { event_id: `evt_${env.caseId}_${stepIndex}_${name}` }
  let state = env.getState()

  switch (name) {
    case 'request_bath': {
      const service = ensureBathService(env, payload)
      if (state.status === 'idle') {
        state = apply(env, LUNA_OPERATION_EVENTS.START_OPERATION, {
          operation_id: env.operationId,
          type: 'service_booking',
        }, eventMetadata)
      }
      if (payload.customer_name) state = apply(env, LUNA_OPERATION_EVENTS.SET_CUSTOMER, { name: payload.customer_name }, eventMetadata)
      if (payload.pet_name || payload.breed || payload.weight_kg) {
        state = apply(env, LUNA_OPERATION_EVENTS.SET_PET, {
          name: payload.pet_name || state.pet?.name || null,
          breed: payload.breed || state.pet?.breed || null,
          weight_kg: payload.weight_kg ?? state.pet?.weight_kg ?? null,
          species: payload.species || state.pet?.species || 'dog',
        }, eventMetadata)
      }
      state = apply(env, LUNA_OPERATION_EVENTS.SELECT_SERVICE, {
        service_type: service.id,
        name: service.name,
        operation_type: 'service_booking',
      }, eventMetadata)
      state = apply(env, LUNA_OPERATION_EVENTS.ADD_ITEM, service, eventMetadata)
      return state
    }

    case 'provide_customer':
      return apply(env, LUNA_OPERATION_EVENTS.SET_CUSTOMER, payload, eventMetadata)

    case 'provide_pet':
      return apply(env, LUNA_OPERATION_EVENTS.SET_PET, {
        ...payload,
        name: payload.name || payload.pet_name || null,
        breed: payload.breed || null,
        weight_kg: payload.weight_kg ?? null,
        species: payload.species || 'dog',
      }, eventMetadata)

    case 'choose_time': {
      const scheduledAt = clean(payload.scheduled_at)
      env.recordTool('get_day_schedule', { scheduled_at: scheduledAt }, { available: env.isSlotAvailable(scheduledAt) })
      if (!env.isSlotAvailable(scheduledAt)) {
        return apply(env, LUNA_OPERATION_EVENTS.REJECT_TIME, { scheduled_at: scheduledAt }, eventMetadata)
      }
      return apply(env, LUNA_OPERATION_EVENTS.SELECT_TIME, {
        scheduled_at: scheduledAt,
        duration_min: Number(payload.duration_min || 60),
      }, eventMetadata)
    }

    case 'change_time': {
      const scheduledAt = clean(payload.scheduled_at)
      env.recordTool('get_day_schedule', { scheduled_at: scheduledAt }, { available: env.isSlotAvailable(scheduledAt) })
      if (!env.isSlotAvailable(scheduledAt)) {
        return apply(env, LUNA_OPERATION_EVENTS.REJECT_TIME, { scheduled_at: scheduledAt }, eventMetadata)
      }
      return apply(env, LUNA_OPERATION_EVENTS.SELECT_TIME, {
        scheduled_at: scheduledAt,
        duration_min: Number(payload.duration_min || 60),
      }, eventMetadata)
    }

    case 'customer_brings': {
      const option = env.findTransport('customer_brings')
      return apply(env, LUNA_OPERATION_EVENTS.SET_TRANSPORT, {
        mode: 'customer_brings',
        label: option?.label || 'Cliente leva',
        fee: 0,
        customer_brings: true,
      }, eventMetadata)
    }

    case 'request_motodog': {
      const mode = clean(payload.mode) || 'buscar_e_levar'
      const option = env.findTransport(mode)
      if (!option) {
        const error = Object.assign(new Error(`Transport mode is unavailable: ${mode}`), { code: 'TRANSPORT_OPTION_NOT_FOUND' })
        throw error
      }
      return apply(env, LUNA_OPERATION_EVENTS.SET_TRANSPORT, {
        mode,
        label: option.label,
        fee: option.fee,
        customer_brings: false,
      }, eventMetadata)
    }

    case 'provide_address':
      return apply(env, LUNA_OPERATION_EVENTS.SET_ADDRESS, payload, eventMetadata)

    case 'add_note':
      return apply(env, LUNA_OPERATION_EVENTS.ADD_NOTE, { text: payload.note || payload.text }, eventMetadata)

    case 'add_hydration': {
      const service = ensureBathService(env, { service_id: 'svc_hydration' })
      return apply(env, LUNA_OPERATION_EVENTS.ADD_ITEM, service, eventMetadata)
    }

    case 'informational_question':
      return apply(env, LUNA_OPERATION_EVENTS.INFORMATIONAL_QUERY, { topic: payload.topic || 'service_inclusions' }, eventMetadata)

    case 'request_summary':
      return apply(env, LUNA_OPERATION_EVENTS.REQUEST_CONFIRMATION, {}, eventMetadata)

    case 'confirm': {
      state = env.getState()
      if (state.status === 'confirmed') {
        return apply(env, LUNA_OPERATION_EVENTS.CONFIRM_OPERATION, {
          idempotency_key: payload.idempotency_key || `idem_${env.operationId}`,
        }, eventMetadata)
      }
      state = apply(env, LUNA_OPERATION_EVENTS.CONFIRM_OPERATION, {
        idempotency_key: payload.idempotency_key || `idem_${env.operationId}`,
      }, eventMetadata)
      try {
        const result = env.commitOperation(state, {
          idempotencyKey: payload.idempotency_key || `idem_${env.operationId}`,
        })
        return apply(env, LUNA_OPERATION_EVENTS.CONFIRM_SUCCEEDED, {
          ...result,
          idempotency_key: payload.idempotency_key || `idem_${env.operationId}`,
        }, eventMetadata)
      } catch (error) {
        if (error.code === 'COMMIT_RESULT_AMBIGUOUS') {
          const committed = error.committed_result || {}
          return apply(env, LUNA_OPERATION_EVENTS.CONFIRM_SUCCEEDED, {
            ...committed,
            idempotency_key: payload.idempotency_key || `idem_${env.operationId}`,
            reconciled: true,
          }, eventMetadata)
        }
        const classification = error.code || 'TRANSACTION_FAILED'
        return apply(env, LUNA_OPERATION_EVENTS.CONFIRM_FAILED, {
          recoverable: true,
          classification,
          error: { code: classification, recoverable: true, details: { message: error.message } },
        }, eventMetadata)
      }
    }

    case 'request_human':
      return apply(env, LUNA_OPERATION_EVENTS.REQUEST_HUMAN, { target: payload.target || 'petshop' }, eventMetadata)

    default: {
      const error = Object.assign(new Error(`Unknown deterministic intent: ${name}`), { code: 'UNKNOWN_EVAL_INTENT' })
      throw error
    }
  }
}
