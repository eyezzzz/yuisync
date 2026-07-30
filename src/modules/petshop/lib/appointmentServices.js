const stripAccents = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const VALID_APPOINTMENT_GROUPS = new Set(['banho_tosa', 'veterinaria'])
const VETERINARY_PATTERN = /\b(vet|veterin|consulta|vacina|clinica|medico|exame|cirurg|ultrassom|castr|retorno|internac|curativo|vermifug|microchip|aplicacao|hemograma|radiograf|raio[ -]?x|coleta|sorolog|odontolog|anestesia|medicacao|eletrocard|ecocard|emergencia|procedimento)\w*/
const TOSA_PATTERN = /\b(tosa|tosagem|tosar|trim|trimming|stripping|acabamento|penteado|corte (?:de|do) pelo)\w*/
const BATH_PATTERN = /\b(banho|lavagem|secagem|secar)\w*/
const GROOMING_COMPLEMENT_PATTERN = /\b(desembolo|desembarac|escovac|hidrat|higien|perfume|spa|unha|unhas|ouvido|orelhas|patas|almofad|dente|dental|pelagem)\w*/

const appointmentServiceText = (service = {}) => stripAccents([
  service.code,
  service.value,
  service.name,
  service.label,
  service.category,
  service.description,
].filter(Boolean).join(' '))

export function normalizeAppointmentServiceText(value = '') {
  return stripAccents(value)
}

export function appointmentServiceKind(service = {}) {
  const text = appointmentServiceText(service)
  const declared = stripAccents(service.group_type || service.groupType || service.service_group || '')
  const hasTosa = TOSA_PATTERN.test(text)
  const hasBath = BATH_PATTERN.test(text)

  if (VETERINARY_PATTERN.test(text)) return 'veterinaria'
  if (hasBath && hasTosa) return 'banho_tosa'
  if (hasTosa) return 'tosa'
  if (hasBath) return 'banho'
  if (GROOMING_COMPLEMENT_PATTERN.test(text)) return 'complemento'
  if (declared === 'veterinaria') return 'veterinaria'
  if (declared === 'banho_tosa') return 'complemento'
  return 'outro'
}

export function classifyAppointmentServiceGroup(service = {}) {
  const kind = appointmentServiceKind(service)
  if (kind === 'veterinaria') return 'veterinaria'
  if (['banho', 'tosa', 'banho_tosa', 'complemento'].includes(kind)) return 'banho_tosa'

  const declared = stripAccents(service.group_type || service.groupType || service.service_group || '')
  if (VALID_APPOINTMENT_GROUPS.has(declared)) return declared
  return 'outro'
}

export function serviceFitsAppointmentGroup(service, group) {
  if (!service || service.active === false) return false
  if (!VALID_APPOINTMENT_GROUPS.has(group)) return false
  return classifyAppointmentServiceGroup(service) === group
}

export function serviceOptionsForAppointmentGroup(services = [], group = 'banho_tosa') {
  return (services || []).filter((service) => serviceFitsAppointmentGroup(service, group))
}

export function appointmentServiceCodes(appointment = {}) {
  const items = Array.isArray(appointment.service_items) ? appointment.service_items : []
  const codes = items
    .map((item) => String(item?.code || item?.service_type || '').trim())
    .filter(Boolean)

  if (codes.length > 0) return [...new Set(codes)]
  return appointment.service_type ? [String(appointment.service_type)] : []
}

export function calculateAppointmentServiceTotals(serviceCodes = [], services = []) {
  const byCode = new Map((services || []).map((service) => [String(service.value || service.code), service]))
  const selected = [...new Set((serviceCodes || []).filter(Boolean))]
    .map((code) => byCode.get(String(code)))
    .filter(Boolean)

  return {
    services: selected,
    price: selected.reduce((sum, service) => sum + Number(service.price ?? service.default_price ?? 0), 0),
    duration: selected.reduce((sum, service) => sum + Math.max(15, Number(service.duration ?? service.default_duration_min ?? 60)), 0),
  }
}

export function appointmentServiceLabel(appointment = {}, services = []) {
  const items = Array.isArray(appointment.service_items) ? appointment.service_items : []
  const itemNames = items.map((item) => String(item?.name || '').trim()).filter(Boolean)
  if (itemNames.length > 0) return itemNames.join(' + ')

  const codes = appointmentServiceCodes(appointment)
  const byCode = new Map((services || []).map((service) => [String(service.value || service.code), service]))
  const names = codes
    .map((code) => byCode.get(String(code))?.label || byCode.get(String(code))?.name || code)
    .filter(Boolean)
  return names.join(' + ') || 'Servico'
}

export function appointmentServiceGroup(appointment = {}, services = []) {
  const items = Array.isArray(appointment?.service_items) ? appointment.service_items : []
  const code = appointment?.service_type || appointment
  const catalogService = (services || []).find((item) => String(item.value || item.code) === String(code))

  const inferred = classifyAppointmentServiceGroup(catalogService || {
    code,
    name: items.map((item) => item?.name || item?.label || item?.service_name).filter(Boolean).join(' '),
    group_type: appointment?.service_group,
  })
  if (VALID_APPOINTMENT_GROUPS.has(inferred)) return inferred

  const itemGroup = items
    .map((item) => classifyAppointmentServiceGroup(item))
    .find((group) => VALID_APPOINTMENT_GROUPS.has(group))
  if (itemGroup) return itemGroup
  if (VALID_APPOINTMENT_GROUPS.has(appointment?.service_group)) return appointment.service_group
  return 'outro'
}
