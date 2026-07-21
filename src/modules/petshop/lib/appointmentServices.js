const stripAccents = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const VETERINARY_PATTERN = /\b(vet|veterin|consulta|vacina|clinica|medico|exame|cirurg|ultrassom|castr|retorno|internac|curativo|vermifug|microchip|aplicacao)\w*/
const GROOMING_PATTERN = /\b(banho|tosa|desembolo|escovac|hidrat|higien|groom|perfume|spa|trim|unha|unhas|ouvido|orelhas)\w*/

export function normalizeAppointmentServiceText(value = '') {
  return stripAccents(value)
}

export function classifyAppointmentServiceGroup(service = {}) {
  const declared = stripAccents(service.group_type || service.groupType || '')
  const text = stripAccents([
    service.code,
    service.value,
    service.name,
    service.label,
    service.category,
  ].filter(Boolean).join(' '))

  if (VETERINARY_PATTERN.test(text)) return 'veterinaria'
  if (GROOMING_PATTERN.test(text)) return 'banho_tosa'
  if (declared === 'veterinaria' || declared === 'banho_tosa') return declared
  return 'outro'
}

export function serviceFitsAppointmentGroup(service, group) {
  if (!service || service.active === false) return false
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
  if (appointment?.service_group === 'veterinaria' || appointment?.service_group === 'banho_tosa') {
    return appointment.service_group
  }

  const items = Array.isArray(appointment?.service_items) ? appointment.service_items : []
  const itemGroup = items.find((item) => ['veterinaria', 'banho_tosa'].includes(item?.group_type))?.group_type
  if (itemGroup) return itemGroup

  const code = appointment?.service_type || appointment
  const service = (services || []).find((item) => String(item.value || item.code) === String(code))
  return classifyAppointmentServiceGroup(service || { code })
}
