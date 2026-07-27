const clean = (value = '') => String(value ?? '').trim()

const normalize = (value = '') => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()

export const MANUAL_SLOT_CAPACITY = 2

const NON_BLOCKING_STATUSES = new Set(['cancelado', 'cancelled', 'no_show'])

export function appointmentOccupiesManualSlot(appointment = {}) {
  return !NON_BLOCKING_STATUSES.has(normalize(appointment?.status))
}

export function isMotodogTransportMode(mode = '') {
  return ['buscar_e_levar', 'somente_buscar', 'somente_levar', 'motodog'].includes(normalize(mode))
}

export function appointmentTransportLabel(mode = '') {
  const normalized = normalize(mode)
  if (normalized === 'cliente_leva') return 'Cliente traz e busca'
  if (normalized === 'buscar_e_levar') return 'MotoDog — buscar e levar'
  if (normalized === 'somente_buscar') return 'MotoDog — somente buscar'
  if (normalized === 'somente_levar') return 'MotoDog — somente levar'
  if (normalized === 'motodog') return 'MotoDog'
  return 'Não informado'
}

export function appointmentTransportAddress(appointment = {}) {
  const motodog = appointment?.motodog || {}
  return [
    motodog.address,
    motodog.neighborhood,
    motodog.city,
  ].map(clean).filter(Boolean).join(' - ')
}

export function operationalCommissionRate(service = {}) {
  const group = normalize(service?.group_type || service?.service_group)
  if (group && group !== 'banho_tosa') return 0

  const text = normalize([
    service?.code,
    service?.name,
    service?.label,
    service?.service_type,
  ].filter(Boolean).join(' '))

  if (!text) return 0
  if (/(?:tosa|tesoura|maquina|groom|trim)/.test(text)) return 10
  return 5
}
