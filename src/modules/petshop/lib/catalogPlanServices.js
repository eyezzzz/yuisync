const LEGACY_LABELS = {
  banho: 'Banho',
  tosa: 'Tosa',
  banho_e_tosa: 'Banho e Tosa',
  consulta: 'Consulta',
  vacina: 'Vacina',
  motodog: 'MotoDog - buscar e levar',
}

export const MOTODOG_PLAN_SERVICE = {
  service_type: 'motodog',
  service_code: null,
  service_name: 'MotoDog - buscar e levar',
  service_kind: 'transport',
  transport_mode: 'buscar_e_levar',
  group_type: 'transport',
  qty_per_cycle: 1,
}

export function normalizePlanText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeCatalogPlanService(service = {}) {
  const serviceType = String(service.service_type || service.service_code || '').trim()
  if (!serviceType) return null

  const serviceKind = service.service_kind
    || service.kind
    || (serviceType === 'motodog' ? 'transport' : 'catalog')
  const serviceCode = service.service_code
    || (serviceKind === 'catalog' ? serviceType : null)
  const serviceName = String(
    service.service_name
    || service.label
    || LEGACY_LABELS[serviceType]
    || serviceType,
  ).trim()

  return {
    service_type: serviceType,
    service_code: serviceCode,
    service_name: serviceName,
    service_kind: serviceKind,
    transport_mode: service.transport_mode || (serviceType === 'motodog' ? 'buscar_e_levar' : null),
    group_type: service.group_type || (serviceType === 'motodog' ? 'transport' : null),
    qty_per_cycle: Math.max(0, Number(service.qty_per_cycle || 0)),
  }
}

export function normalizeCatalogPlanServices(services = []) {
  const normalized = (Array.isArray(services) ? services : [])
    .map(normalizeCatalogPlanService)
    .filter(Boolean)

  const unique = new Map()
  normalized.forEach((service) => {
    const current = unique.get(service.service_type)
    if (!current || service.qty_per_cycle > current.qty_per_cycle) {
      unique.set(service.service_type, service)
    }
  })
  return [...unique.values()]
}

export function catalogServiceMap(catalogServices = []) {
  return new Map((Array.isArray(catalogServices) ? catalogServices : [])
    .map((service) => [String(service.code || service.value || '').trim(), service])
    .filter(([code]) => code))
}

export function planServiceLabel(service, catalogServices = []) {
  const normalized = normalizeCatalogPlanService(service)
  if (!normalized) return 'Serviço não informado'
  const catalog = catalogServiceMap(catalogServices).get(normalized.service_code || normalized.service_type)
  return String(catalog?.name || catalog?.label || normalized.service_name || normalized.service_type).trim()
}

export function isRealCatalogPlanService(service, catalogServices = []) {
  const normalized = normalizeCatalogPlanService(service)
  if (!normalized || normalized.service_kind !== 'catalog') return false
  return catalogServiceMap(catalogServices).has(normalized.service_code || normalized.service_type)
}

export function buildCatalogUsageSummary(subscription = {}, catalogServices = []) {
  const services = normalizeCatalogPlanServices(subscription.subscription_plans?.services || subscription.services)
  const usage = subscription.services_used && typeof subscription.services_used === 'object'
    ? subscription.services_used
    : {}
  const reservations = subscription.services_reserved && typeof subscription.services_reserved === 'object'
    ? subscription.services_reserved
    : {}
  const catalog = catalogServiceMap(catalogServices)

  return services.map((service) => {
    const used = Math.max(0, Number(usage[service.service_type] || 0))
    const reserved = Math.max(0, Number(reservations[service.service_type] || 0))
    const total = Math.max(0, Number(service.qty_per_cycle || 0))
    const catalogService = catalog.get(service.service_code || service.service_type) || null
    return {
      ...service,
      label: String(catalogService?.name || catalogService?.label || service.service_name || service.service_type).trim(),
      catalog_service: catalogService,
      used,
      reserved,
      total,
      remaining: Math.max(0, total - used - reserved),
    }
  })
}

export function activeSubscriptionsForClient(subscriptions = [], clientId = '') {
  if (!clientId) return []
  const value = String(clientId)
  return (Array.isArray(subscriptions) ? subscriptions : [])
    .filter((subscription) => String(subscription.client_id || subscription.client?.id || '') === value)
    .filter((subscription) => subscription.status === 'active' && subscription.subscription_plans?.active !== false)
    .sort((left, right) => {
      const leftBilling = new Date(left.next_billing_date || '9999-12-31').getTime()
      const rightBilling = new Date(right.next_billing_date || '9999-12-31').getTime()
      if (leftBilling !== rightBilling) return leftBilling - rightBilling
      const leftStart = new Date(left.started_at || 0).getTime()
      const rightStart = new Date(right.started_at || 0).getTime()
      return leftStart - rightStart
    })
}

export function buildCombinedCatalogUsageSummary(subscriptions = [], catalogServices = []) {
  const combined = new Map()

  for (const subscription of Array.isArray(subscriptions) ? subscriptions : []) {
    for (const item of buildCatalogUsageSummary(subscription, catalogServices)) {
      const key = String(item.service_type || item.service_code || '')
      if (!key) continue
      const current = combined.get(key) || {
        ...item,
        used: 0,
        reserved: 0,
        total: 0,
        remaining: 0,
        subscription_count: 0,
        subscription_ids: [],
        plan_names: [],
      }
      current.used += Number(item.used || 0)
      current.reserved += Number(item.reserved || 0)
      current.total += Number(item.total || 0)
      current.remaining += Number(item.remaining || 0)
      current.subscription_count += 1
      current.subscription_ids.push(subscription.id)
      const planName = String(subscription.subscription_plans?.name || '').trim()
      if (planName && !current.plan_names.includes(planName)) current.plan_names.push(planName)
      combined.set(key, current)
    }
  }

  return [...combined.values()]
}

export function activeSubscriptionForClient(subscriptions = [], clientId = '') {
  if (!clientId) return null
  return (Array.isArray(subscriptions) ? subscriptions : [])
    .filter((subscription) => String(subscription.client_id || subscription.client?.id || '') === String(clientId))
    .filter((subscription) => subscription.status === 'active' && subscription.subscription_plans?.active !== false)
    .sort((left, right) => new Date(right.started_at || 0) - new Date(left.started_at || 0))[0] || null
}

function subscriptionClient(subscription = {}) {
  const client = subscription.client || subscription.clients || {}
  const details = client.details || {}
  return {
    id: subscription.client_id || client.id || '',
    owner_name: client.owner_name || client.name || '',
    pet_name: client.pet_name || details.pet_name || '',
    phone: client.phone || '',
    breed: client.breed || details.breed || '',
    species: client.species || details.species || '',
  }
}

export function matchActiveSubscriptionByText(subscriptions = [], text = '') {
  const normalizedText = normalizePlanText(text)
  const digits = String(text || '').replace(/\D/g, '')
  if (!normalizedText && !digits) return null

  const ranked = (Array.isArray(subscriptions) ? subscriptions : [])
    .filter((subscription) => subscription.status === 'active' && subscription.subscription_plans?.active !== false)
    .map((subscription) => {
      const client = subscriptionClient(subscription)
      let score = 0
      const owner = normalizePlanText(client.owner_name)
      const pet = normalizePlanText(client.pet_name)
      const breed = normalizePlanText(client.breed || client.species)
      const phone = String(client.phone || '').replace(/\D/g, '')

      if (phone && digits && digits.includes(phone)) score += 8
      if (owner && normalizedText.includes(owner)) score += 5
      if (pet && normalizedText.includes(pet)) score += 3
      if (breed && normalizedText.includes(breed)) score += 1
      return { subscription, score }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)

  return ranked[0]?.subscription || null
}

export function planEntryForCatalogService(service = {}, qtyPerCycle = 1) {
  const code = String(service.code || service.value || '').trim()
  if (!code) return null
  return normalizeCatalogPlanService({
    service_type: code,
    service_code: code,
    service_name: service.name || service.label || code,
    service_kind: 'catalog',
    group_type: service.group_type || null,
    qty_per_cycle: qtyPerCycle,
  })
}
