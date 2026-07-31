import { supabase } from '../../../lib/supabase'
import { applyTenantFilter, runWithTenantFallback } from '../../../lib/tenant'

const normalizeText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const positiveNumber = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

const normalizedPlanServices = (services = []) => (Array.isArray(services) ? services : [])
  .map((service) => ({
    ...service,
    service_type: String(service?.service_type || service?.service_code || '').trim(),
    service_code: String(service?.service_code || service?.service_type || '').trim(),
    qty_per_cycle: Math.max(0, Number(service?.qty_per_cycle || 0)),
  }))
  .filter((service) => service.service_type && service.qty_per_cycle > 0)

const isTransportService = (service = {}) => {
  const text = normalizeText([
    service.service_type,
    service.service_code,
    service.service_name,
    service.group_type,
    service.service_kind,
  ].filter(Boolean).join(' '))
  return service.service_type === 'motodog'
    || service.group_type === 'transport'
    || service.service_kind === 'transport'
    || /motodog|moto dog|transporte|buscar e levar/.test(text)
}

export function configuredPackageTransportFee(settings = {}) {
  const options = Array.isArray(settings?.pet_transport_options) ? settings.pet_transport_options : []
  const roundTrip = options.find((option) => ['buscar_e_levar', 'motodog'].includes(String(option?.id || '')))
  const configured = Number(roundTrip?.fee)
  if (Number.isFinite(configured) && configured >= 0) return configured
  return positiveNumber(settings?.pet_transport_fee, 20)
}

export function buildPackageCommissionAllocation({ plan = {}, catalogServices = [], settings = {} } = {}) {
  const planServices = normalizedPlanServices(plan.services)
  const catalog = new Map((catalogServices || [])
    .map((service) => [String(service?.code || '').trim(), service])
    .filter(([code]) => code))
  const transportFee = configuredPackageTransportFee(settings)
  const transportQuantity = planServices
    .filter(isTransportService)
    .reduce((sum, service) => sum + service.qty_per_cycle, 0)
  const transportTotal = transportQuantity * transportFee
  const packagePrice = positiveNumber(plan.price)
  const servicePool = Math.max(0, packagePrice - transportTotal)
  const serviceEntries = planServices
    .filter((service) => !isTransportService(service))
    .map((service) => {
      const code = service.service_code || service.service_type
      const catalogService = catalog.get(code)
      return {
        ...service,
        code,
        catalog_price: positiveNumber(catalogService?.default_price),
      }
    })
  const totalUnits = serviceEntries.reduce((sum, service) => sum + service.qty_per_cycle, 0)
  const allCatalogPriced = serviceEntries.length > 0 && serviceEntries.every((service) => service.catalog_price > 0)
  const totalCatalogValue = allCatalogPriced
    ? serviceEntries.reduce((sum, service) => sum + service.catalog_price * service.qty_per_cycle, 0)
    : 0
  const unitValues = new Map()

  serviceEntries.forEach((service) => {
    const unitValue = totalCatalogValue > 0
      ? servicePool * service.catalog_price / totalCatalogValue
      : totalUnits > 0
        ? servicePool / totalUnits
        : 0
    const rounded = Number(unitValue.toFixed(2))
    unitValues.set(service.code, rounded)
    unitValues.set(service.service_type, rounded)
  })

  return {
    plan_name: String(plan.name || 'Pacote').trim(),
    package_price: Number(packagePrice.toFixed(2)),
    transport_fee: Number(transportFee.toFixed(2)),
    transport_quantity: transportQuantity,
    transport_total: Number(transportTotal.toFixed(2)),
    service_pool: Number(servicePool.toFixed(2)),
    service_units: totalUnits,
    unit_values: unitValues,
    fallback_unit_value: serviceEntries.length === 1
      ? unitValues.get(serviceEntries[0].code) || 0
      : totalUnits > 0 ? Number((servicePool / totalUnits).toFixed(2)) : 0,
  }
}

const appointmentUsesPackage = (appointment = {}) => Boolean(
  appointment.subscription_id
  && (
    appointment.subscription_benefit_used === true
    || Number(appointment.price || 0) <= 0.005
    || appointment.source === 'package_activation'
  )
)

function allocationValueForItem(allocation, item = {}) {
  if (!allocation) return 0
  const candidates = [item.code, item.service_code, item.service_type, item.value]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  for (const candidate of candidates) {
    if (allocation.unit_values.has(candidate)) return allocation.unit_values.get(candidate)
  }
  return allocation.fallback_unit_value || 0
}

export async function enrichPackageCommissionAppointments({
  appointments = [],
  moduleId = 'petshop',
  tenantId,
  settings = {},
  catalogServices = [],
} = {}) {
  const source = Array.isArray(appointments) ? appointments : []
  const subscriptionIds = [...new Set(source
    .filter(appointmentUsesPackage)
    .map((appointment) => appointment.subscription_id)
    .filter(Boolean))]
  if (!tenantId || !subscriptionIds.length) return source

  const subscriptionResponse = await runWithTenantFallback(tenantId, async (includeTenant) => {
    let query = supabase
      .from('client_subscriptions')
      .select('id,plan_id')
      .eq('module_id', moduleId)
      .in('id', subscriptionIds)
    query = applyTenantFilter(query, tenantId, includeTenant)
    return query
  })
  if (subscriptionResponse.error) throw subscriptionResponse.error

  const subscriptions = subscriptionResponse.data || []
  const planIds = [...new Set(subscriptions.map((subscription) => subscription.plan_id).filter(Boolean))]
  if (!planIds.length) return source

  const planResponse = await runWithTenantFallback(tenantId, async (includeTenant) => {
    let query = supabase
      .from('subscription_plans')
      .select('id,name,price,services')
      .eq('module_id', moduleId)
      .in('id', planIds)
    query = applyTenantFilter(query, tenantId, includeTenant)
    return query
  })
  if (planResponse.error) throw planResponse.error

  const planMap = new Map((planResponse.data || []).map((plan) => [plan.id, plan]))
  const allocationBySubscription = new Map(subscriptions.map((subscription) => {
    const plan = planMap.get(subscription.plan_id)
    return [subscription.id, plan
      ? buildPackageCommissionAllocation({ plan, catalogServices, settings })
      : null]
  }))

  return source.map((appointment) => {
    if (!appointmentUsesPackage(appointment)) return appointment
    const allocation = allocationBySubscription.get(appointment.subscription_id)
    if (!allocation) return appointment
    const items = Array.isArray(appointment.service_items) ? appointment.service_items : []
    const enrichedItems = items.map((item) => ({
      ...item,
      package_covered: true,
      package_plan_name: allocation.plan_name,
      package_unit_price: allocationValueForItem(allocation, item),
      package_service_pool: allocation.service_pool,
      package_transport_total: allocation.transport_total,
    }))
    return {
      ...appointment,
      package_commission: true,
      package_plan_name: allocation.plan_name,
      package_service_pool: allocation.service_pool,
      package_transport_total: allocation.transport_total,
      package_commission_unit_value: enrichedItems.length === 1
        ? Number(enrichedItems[0].package_unit_price || 0)
        : allocation.fallback_unit_value,
      service_items: enrichedItems,
    }
  })
}
