export function normalizeAppointmentUiText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function significantTokens(value = '') {
  return normalizeAppointmentUiText(value)
    .split(' ')
    .filter((token) => token.length >= 2)
}

function subscriptionClient(subscription = {}) {
  const client = subscription.client || subscription.clients || {}
  const details = client.details || {}
  return {
    ownerName: client.owner_name || client.name || '',
    petName: client.pet_name || details.pet_name || '',
    phone: client.phone || '',
    breed: client.breed || details.breed || '',
  }
}

export function matchActivePackageSubscription(subscriptions = [], visibleClientText = '') {
  const text = normalizeAppointmentUiText(visibleClientText)
  const visibleTokens = new Set(significantTokens(visibleClientText))
  const visibleDigits = String(visibleClientText || '').replace(/\D/g, '')

  return (Array.isArray(subscriptions) ? subscriptions : [])
    .filter((subscription) => subscription?.status === 'active')
    .filter((subscription) => subscription?.subscription_plans?.active !== false)
    .map((subscription) => {
      const client = subscriptionClient(subscription)
      const owner = normalizeAppointmentUiText(client.ownerName)
      const pet = normalizeAppointmentUiText(client.petName)
      const breed = normalizeAppointmentUiText(client.breed)
      const phone = String(client.phone || '').replace(/\D/g, '')
      const ownerTokens = significantTokens(client.ownerName)
      const petTokens = significantTokens(client.petName)
      const ownerMatches = ownerTokens.filter((token) => visibleTokens.has(token)).length
      const petMatches = petTokens.filter((token) => visibleTokens.has(token)).length

      let score = 0
      if (phone && visibleDigits && (visibleDigits.includes(phone) || phone.includes(visibleDigits))) score += 100
      if (owner && text.includes(owner)) score += 70
      if (pet && text.includes(pet)) score += 45
      if (ownerTokens.length && ownerMatches === ownerTokens.length) score += 55
      else score += ownerMatches * 12
      if (petTokens.length && petMatches === petTokens.length) score += 35
      else score += petMatches * 9
      if (breed && text.includes(breed)) score += 5

      return { subscription, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return new Date(right.subscription.started_at || 0) - new Date(left.subscription.started_at || 0)
    })[0]?.subscription || null
}

export function isTosaCatalogService(service = {}) {
  const text = normalizeAppointmentUiText([
    service.name,
    service.label,
    service.code,
    service.category,
    service.description,
  ].filter(Boolean).join(' '))
  return /\btosa\b|tosagem|trim|groom|higienica/.test(text)
}

export function isGroomingAppointment(appointment = {}) {
  if (appointment.service_group === 'banho_tosa') return true
  const items = Array.isArray(appointment.service_items) ? appointment.service_items : []
  const text = normalizeAppointmentUiText([
    appointment.service_type,
    ...items.flatMap((item) => [item?.code, item?.name, item?.label, item?.group_type]),
  ].filter(Boolean).join(' '))
  return /banho|tosa|groom|escov|hidrat|higien|desembolo|unha|ouvido|orelha/.test(text)
}

export function appointmentServiceNames(appointment = {}) {
  const items = Array.isArray(appointment.service_items) ? appointment.service_items : []
  const names = items
    .map((item) => String(item?.name || item?.label || item?.service_name || item?.code || '').trim())
    .filter(Boolean)
  return names.length ? names : [String(appointment.service_type || 'Servico').trim()]
}

export function appointmentHasTransportBenefit(appointment = {}) {
  const items = Array.isArray(appointment.service_items) ? appointment.service_items : []
  return items.some((item) => item?.transport_benefit_used === true)
}

export function packageCatalogEntries(usage = [], serviceGroup = 'banho_tosa') {
  return (Array.isArray(usage) ? usage : [])
    .filter((item) => item?.service_kind === 'catalog')
    .filter((item) => item?.catalog_service)
    .filter((item) => (item.catalog_service.group_type || item.group_type) === serviceGroup)
}
