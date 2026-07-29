import { normalizeCatalogPlanServices } from './catalogPlanServices'

export function normalizeSubscriptionSearch(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function subscriptionSearchText(subscription = {}) {
  const client = subscription.client || subscription.clients || {}
  const details = client.details || {}
  const plan = subscription.subscription_plans || {}
  return normalizeSubscriptionSearch([
    client.owner_name,
    client.name,
    client.pet_name,
    details.pet_name,
    client.phone,
    plan.name,
    subscription.status,
  ].filter(Boolean).join(' '))
}

export function subscriptionMatchesSearch(subscription, query = '') {
  const terms = normalizeSubscriptionSearch(query).split(' ').filter(Boolean)
  if (!terms.length) return true
  const haystack = subscriptionSearchText(subscription)
  return terms.every((term) => haystack.includes(term))
}

export function buildEditableUsage(subscription = {}) {
  const services = normalizeCatalogPlanServices(subscription.subscription_plans?.services || [])
  const current = subscription.services_used && typeof subscription.services_used === 'object'
    ? subscription.services_used
    : {}

  return services.map((service) => {
    const key = service.service_type
    const total = Math.max(0, Math.trunc(Number(service.qty_per_cycle || 0)))
    const used = Math.min(total, Math.max(0, Math.trunc(Number(current[key] || 0))))
    return {
      service_type: key,
      service_name: service.service_name || (key === 'motodog' ? 'MotoDog - buscar e levar' : key),
      total,
      used,
    }
  })
}

export function clampSubscriptionUsage(subscription = {}, requested = {}) {
  const next = {
    ...(subscription.services_used && typeof subscription.services_used === 'object'
      ? subscription.services_used
      : {}),
  }

  buildEditableUsage(subscription).forEach((item) => {
    const raw = Number(requested[item.service_type])
    const value = Number.isFinite(raw) ? Math.trunc(raw) : item.used
    next[item.service_type] = Math.min(item.total, Math.max(0, value))
  })

  return next
}
