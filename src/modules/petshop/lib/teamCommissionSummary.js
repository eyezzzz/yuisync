const normalizeText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const transportPattern = /\b(motodog|moto\s*dog|transporte|entrega|delivery|frete|buscar|levar)\b/

const itemText = (item = {}) => normalizeText([
  item.code,
  item.value,
  item.name,
  item.label,
  item.service_type,
  item.group_type,
].filter(Boolean).join(' '))

export function appointmentCommissionLines(appointment = {}) {
  const appointmentGroup = normalizeText(appointment.service_group || '')
  if (appointmentGroup && appointmentGroup !== 'banho_tosa') return []

  const rawItems = Array.isArray(appointment.service_items) && appointment.service_items.length
    ? appointment.service_items
    : [{
      code: appointment.service_type,
      name: appointment.service_type,
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
    const text = itemText(item)
    const category = /tesoura/.test(text)
      ? 'scissor_grooming'
      : /tosa|maquina|total|groom|trim/.test(text)
        ? 'machine_grooming'
        : /banho/.test(text)
          ? 'bath'
          : 'other'
    const itemRevenue = Number(item.unit_price ?? item.catalog_price ?? item.price ?? 0)
    const revenue = itemRevenue > 0
      ? itemRevenue
      : eligible.length === 1
        ? Number(appointment.price || 0)
        : 0
    const rate = ['machine_grooming', 'scissor_grooming'].includes(category) ? 0.10 : 0.05
    return {
      appointment_id: appointment.id,
      category,
      code: item.code || item.value || item.service_type || appointment.service_type || '',
      label: item.name || item.label || item.code || item.value || appointment.service_type || 'Servico estetico',
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
    if (name) current.collaborator_name = name
    return current
  }

  configuredStaff.forEach((person) => ensure(person.key, person.name))

  history.forEach((appointment) => {
    const key = String(appointment.responsible_staff_key || '').trim()
    if (!key) return
    const row = ensure(key, appointment.responsible_staff_name || key)
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
