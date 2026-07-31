const normalizeText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const transportPattern = /\b(motodog|moto\s*dog|transporte|entrega|delivery|frete|buscar|levar)\b/
const genericBathTosaPattern = /^(banho[_\s-]*tosa|banho e tosa)$/

const itemText = (item = {}) => normalizeText([
  item.code,
  item.value,
  item.name,
  item.label,
  item.service_type,
  item.group_type,
].filter(Boolean).join(' '))

const itemCategory = (item = {}, appointment = {}) => {
  const text = itemText(item)
  const rawType = normalizeText(item.service_type || item.code || item.value || appointment.service_type || '')
  const genericBathTosa = genericBathTosaPattern.test(rawType)

  if (/tesoura/.test(text)) return 'scissor_grooming'
  if (/tosa\s*(?:na\s*)?maquina|maquina|tosa\s*total|tosa\s*completa|groom|trim/.test(text)) return 'machine_grooming'
  if (/\bbanho\b/.test(text)) return 'bath'
  if (/\btosa\b/.test(text) && !/higien/.test(text)) return 'machine_grooming'
  if (/higien/.test(text)) return 'other'
  if (genericBathTosa || normalizeText(item.group_type || appointment.service_group) === 'banho_tosa') return 'bath'
  return 'other'
}

export function hydrateLegacyCommissionAppointment(appointment = {}, services = []) {
  if (Array.isArray(appointment.service_items) && appointment.service_items.length) return appointment

  const rawType = normalizeText(appointment.service_type || '')
  if (!genericBathTosaPattern.test(rawType)) return appointment

  const appointmentPrice = Number(appointment.price || 0)
  const candidates = (services || []).filter((service) => (
    normalizeText(service.group_type) === 'banho_tosa'
    && appointmentPrice > 0
    && Math.abs(Number(service.default_price || 0) - appointmentPrice) < 0.01
  ))
  const categories = new Set(candidates.map((service) => itemCategory(service, appointment)))
  const selected = categories.size === 1 ? candidates[0] : null
  if (!selected) return appointment

  return {
    ...appointment,
    service_items: [{
      code: selected.code,
      name: selected.name,
      service_type: selected.code,
      group_type: selected.group_type || 'banho_tosa',
      unit_price: appointmentPrice,
      source_product_id: selected.source_product_id || null,
      inferred_from_legacy_price: true,
    }],
  }
}

export function hydrateLegacyCommissionAppointments(appointments = [], services = []) {
  return (appointments || []).map((appointment) => hydrateLegacyCommissionAppointment(appointment, services))
}

export function appointmentCommissionLines(appointment = {}) {
  const appointmentGroup = normalizeText(appointment.service_group || '')
  if (appointmentGroup && appointmentGroup !== 'banho_tosa') return []

  const rawItems = Array.isArray(appointment.service_items) && appointment.service_items.length
    ? appointment.service_items
    : [{
      code: appointment.service_type,
      name: appointment.service_type,
      service_type: appointment.service_type,
      group_type: appointment.service_group || 'banho_tosa',
      unit_price: appointment.price,
    }]

  const eligible = rawItems.filter((item) => {
    const group = normalizeText(item?.group_type || appointment.service_group || 'banho_tosa')
    const text = itemText(item)
    if (group && group !== 'banho_tosa') return false
    return !transportPattern.test(text)
  })

  return eligible.map((item) => {
    const category = itemCategory(item, appointment)
    const itemRevenue = Number(item.unit_price ?? item.catalog_price ?? item.price ?? 0)
    const revenue = itemRevenue > 0
      ? itemRevenue
      : eligible.length === 1
        ? Number(appointment.price || 0)
        : 0
    const rate = ['machine_grooming', 'scissor_grooming'].includes(category) ? 0.10 : 0.05
    const rawLabel = item.name || item.label || item.code || item.value || appointment.service_type || 'Servico estetico'
    const legacyGeneric = genericBathTosaPattern.test(normalizeText(item.service_type || item.code || appointment.service_type || ''))
    return {
      appointment_id: appointment.id,
      category,
      code: item.code || item.value || item.service_type || appointment.service_type || '',
      label: legacyGeneric && category === 'bath' ? 'Banho (registro antigo)' : rawLabel,
      revenue: Math.max(0, revenue),
      commission: Math.max(0, revenue) * rate,
      rate,
    }
  })
}

export function appointmentHasCommissionServices(appointment = {}) {
  return appointmentCommissionLines(appointment).length > 0
}

export function commissionHistoryLabel(appointment = {}) {
  const labels = appointmentCommissionLines(appointment).map((line) => line.label).filter(Boolean)
  return [...new Set(labels)].join(' + ') || 'Servico estetico'
}

export function buildCommissionRows(history = [], configuredStaff = []) {
  const rows = new Map()
  const configuredNames = new Map((configuredStaff || []).map((person) => [person.key, person.name]))
  const ensure = (key, name = '') => {
    if (!key) return null
    if (!rows.has(key)) {
      rows.set(key, {
        staff_key: key,
        collaborator_name: name || key,
        service_count: 0,
        bath_count: 0,
        machine_grooming_count: 0,
        scissor_grooming_count: 0,
        grooming_count: 0,
        other_service_count: 0,
        service_revenue: 0,
        bath_revenue: 0,
        grooming_revenue: 0,
        other_service_revenue: 0,
        bath_commission: 0,
        grooming_commission: 0,
        other_service_commission: 0,
        total_commission: 0,
      })
    }
    const current = rows.get(key)
    if (name && !configuredNames.has(key)) current.collaborator_name = name
    return current
  }

  configuredStaff.forEach((person) => ensure(person.key, person.name))

  history.forEach((appointment) => {
    const key = String(appointment.responsible_staff_key || '').trim()
    if (!key) return
    const row = ensure(key, configuredNames.get(key) || appointment.responsible_staff_name || key)
    appointmentCommissionLines(appointment).forEach((line) => {
      row.service_count += 1
      row.service_revenue += line.revenue
      row.total_commission += line.commission
      if (line.category === 'bath') {
        row.bath_count += 1
        row.bath_revenue += line.revenue
        row.bath_commission += line.commission
      } else if (line.category === 'machine_grooming') {
        row.machine_grooming_count += 1
        row.grooming_count += 1
        row.grooming_revenue += line.revenue
        row.grooming_commission += line.commission
      } else if (line.category === 'scissor_grooming') {
        row.scissor_grooming_count += 1
        row.grooming_count += 1
        row.grooming_revenue += line.revenue
        row.grooming_commission += line.commission
      } else {
        row.other_service_count += 1
        row.other_service_revenue += line.revenue
        row.other_service_commission += line.commission
      }
    })
  })

  return [...rows.values()]
    .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => (
      typeof value === 'number' ? [key, Number(value.toFixed(2))] : [key, value]
    ))))
    .sort((left, right) => right.total_commission - left.total_commission
      || String(left.collaborator_name).localeCompare(String(right.collaborator_name), 'pt-BR'))
}
