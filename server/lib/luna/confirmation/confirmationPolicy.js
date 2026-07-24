import { LUNA_CONFIRMATION_RESULTS } from './confirmationEvents.js'

function text(value = '') {
  return String(value ?? '').trim()
}

function normalizedText(value = '') {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function normalizedToken(value = '') {
  return normalizedText(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function money(value) {
  const parsed = number(value)
  return parsed === null ? null : Math.round(parsed * 100) / 100
}

function scheduledAt(order = {}) {
  const raw = text(
    order?.scheduled_at
      || order?.schedule?.scheduled_at
      || order?.appointment?.scheduled_at,
  )
  if (!raw) return ''
  const milliseconds = Date.parse(raw)
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : raw
}

function total(order = {}) {
  return money(order?.total ?? order?.totals?.total)
}

function semanticItemId(item = {}, order = {}) {
  return text(
    item?.service_id
      || item?.product_id
      || item?.catalog_id
      || item?.variant_id
      || order?.service_product_id
      || item?.id,
  )
}

function itemContract(order = {}) {
  return (Array.isArray(order?.items) ? order.items : [])
    .map((item) => {
      const quantity = number(item?.quantity) ?? 1
      const unitPrice = money(item?.unit_price ?? item?.price) ?? 0
      return {
        id: semanticItemId(item, order),
        quantity,
        unit_price: unitPrice,
        total: money(item?.total) ?? money(quantity * unitPrice) ?? 0,
      }
    })
    .sort((left, right) => (
      left.id.localeCompare(right.id)
      || left.unit_price - right.unit_price
      || left.quantity - right.quantity
      || left.total - right.total
    ))
}

function canonicalTransportMode(order = {}, transport = {}) {
  const raw = normalizedToken(
    order?.service_transport_mode
      || order?.transport_mode
      || transport?.mode,
  )

  if (
    order?.service_transport_customer_brings === true
    || transport?.customer_brings === true
    || [
      'cliente_leva',
      'cliente_levara',
      'tutor_leva',
      'tutor_levara',
      'sem_transporte',
      'por_conta_propria',
    ].includes(raw)
  ) {
    return 'cliente_leva'
  }

  if (['buscar_e_levar', 'busca_e_leva', 'ida_e_volta'].includes(raw)) {
    return 'buscar_e_levar'
  }
  if (['somente_buscar', 'so_buscar', 'apenas_buscar'].includes(raw)) {
    return 'somente_buscar'
  }
  if (['somente_levar', 'so_levar', 'apenas_levar'].includes(raw)) {
    return 'somente_levar'
  }

  return raw
}

function transportContract(order = {}) {
  const transport = order?.transport || {}
  const mode = canonicalTransportMode(order, transport)
  const usesMotodog = Boolean(mode && mode !== 'cliente_leva')

  return {
    mode,
    fee: money(
      order?.service_transport_fee
        ?? order?.transport_fee
        ?? transport?.fee,
    ) ?? 0,
    address: usesMotodog
      ? normalizedText(order?.service_transport_address || transport?.address)
      : '',
    neighborhood: usesMotodog
      ? normalizedText(order?.service_transport_neighborhood || transport?.neighborhood)
      : '',
    city: usesMotodog
      ? normalizedText(order?.service_transport_city || transport?.city)
      : '',
    reference: usesMotodog
      ? normalizedText(order?.service_transport_reference || transport?.reference)
      : '',
  }
}

/**
 * Snapshot only of fields that materially change the confirmation shown to the
 * customer. Catalog/agenda rehydration may populate aliases, derived pet data,
 * line totals, subscription metadata and operational IDs without changing the
 * approved service, time, transport or amount.
 */
export function buildConfirmationContract(order = {}) {
  const items = itemContract(order)
  return {
    order_type: normalizedToken(order?.order_type),
    customer: normalizedText(order?.customer_name),
    pet_name: normalizedText(order?.pet_name),
    service: {
      product_id: text(order?.service_product_id) || items[0]?.id || '',
      notes: normalizedText(order?.notes),
    },
    scheduled_at: scheduledAt(order),
    items,
    transport: transportContract(order),
    total: total(order),
  }
}

function collectContractChanges(previous, current, path = '', changes = []) {
  if (Object.is(previous, current)) return changes

  if (Array.isArray(previous) || Array.isArray(current)) {
    if (!Array.isArray(previous) || !Array.isArray(current)) {
      changes.push(path || 'contract')
      return changes
    }
    if (previous.length !== current.length) changes.push(`${path}.length`)
    const length = Math.max(previous.length, current.length)
    for (let index = 0; index < length; index += 1) {
      collectContractChanges(previous[index], current[index], `${path}[${index}]`, changes)
    }
    return changes
  }

  const previousObject = previous && typeof previous === 'object'
  const currentObject = current && typeof current === 'object'
  if (previousObject || currentObject) {
    if (!previousObject || !currentObject) {
      changes.push(path || 'contract')
      return changes
    }
    const keys = [...new Set([...Object.keys(previous), ...Object.keys(current)])].sort()
    for (const key of keys) {
      collectContractChanges(
        previous[key],
        current[key],
        path ? `${path}.${key}` : key,
        changes,
      )
    }
    return changes
  }

  changes.push(path || 'contract')
  return changes
}

export function diffConfirmationContracts(previousOrder = {}, currentOrder = {}) {
  return collectContractChanges(
    buildConfirmationContract(previousOrder),
    buildConfirmationContract(currentOrder),
  )
}

export function confirmationContractsEqual(previousOrder = {}, currentOrder = {}) {
  return diffConfirmationContracts(previousOrder, currentOrder).length === 0
}

export function buildConfirmationIdempotencyKey(sessionId, pendingOrderId) {
  const session = text(sessionId)
  const pending = text(pendingOrderId)
  return session && pending ? `${session}:${pending}` : ''
}

export function classifyConfirmationContractChange(previousOrder = {}, currentOrder = {}) {
  if (scheduledAt(previousOrder) !== scheduledAt(currentOrder)) {
    return LUNA_CONFIRMATION_RESULTS.SLOT_BECAME_UNAVAILABLE
  }

  return LUNA_CONFIRMATION_RESULTS.COMMERCIAL_CONTRACT_CHANGED
}

export function classifyConfirmationValidationFailure(result = {}) {
  if (result?.classification) return result.classification

  const reason = text(result?.reason || result?.code || result?.message).toLowerCase()
  if (/slot|horario|horário|agenda|indisponivel|indisponível|ocupado/.test(reason)) {
    return LUNA_CONFIRMATION_RESULTS.SLOT_BECAME_UNAVAILABLE
  }
  return LUNA_CONFIRMATION_RESULTS.VALIDATION_FAILED
}

export function isCommitResultAmbiguous(error) {
  if (error?.commitResultAmbiguous === true || error?.commit_result_ambiguous === true) return true

  const code = text(error?.code).toUpperCase()
  if (['ETIMEDOUT', 'ECONNRESET', 'ECONNABORTED', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) {
    return true
  }

  const message = text(error?.message || error).toLowerCase()
  return /timeout|timed out|network|fetch failed|connection reset|aborted|gateway|\b502\b|\b503\b|\b504\b/.test(message)
}

export function requiredPersistenceIdsPresent(operationType, result = {}) {
  const saleId = text(result?.sale_id)
  const orderId = text(result?.order_id)
  const appointmentId = text(result?.appointment_id)

  if (operationType === 'product_order') return Boolean(saleId || orderId)
  return Boolean(appointmentId && (saleId || orderId))
}
