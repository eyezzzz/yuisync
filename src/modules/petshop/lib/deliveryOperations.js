import { supabase } from '../../../lib/supabase'
import { applyTenantFilter, buildTenantPayload, runWithTenantFallback } from '../../../lib/tenant'
import {
  normalizeDeliveryStaff,
  PETSHOP_DELIVERY_STAFF_TEMPLATE_KEY,
} from '../../../../shared/petshopOperations'

const motodogModes = new Set(['motodog', 'buscar_e_levar', 'buscar_e_levar_fora_muriae', 'somente_buscar', 'somente_levar'])

const dateStart = (value) => `${value}T00:00:00.000Z`
const dateEnd = (value) => `${value}T23:59:59.999Z`

export function deliveryStaffFromSettings(settings = {}) {
  return normalizeDeliveryStaff(
    settings.petshop_delivery_staff
    || settings.message_templates?.[PETSHOP_DELIVERY_STAFF_TEMPLATE_KEY],
  )
}

export function appointmentDeliveryValue(appointment = {}, settings = {}) {
  const mode = appointment.transport_mode || appointment.motodog?.mode || ''
  const options = Array.isArray(settings.pet_transport_options) ? settings.pet_transport_options : []
  const option = options.find((item) => item?.id === mode)
  const configured = Number(option?.fee)
  if (Number.isFinite(configured) && configured >= 0) return configured
  const fallback = Number(settings.pet_transport_fee ?? 20)
  return Number.isFinite(fallback) ? Math.max(0, fallback) : 20
}

async function loadClientMap(moduleId, tenantId, clientIds = []) {
  const ids = [...new Set(clientIds.filter(Boolean))]
  if (!ids.length) return new Map()
  const response = await runWithTenantFallback(tenantId, async (includeTenant) => {
    let query = supabase
      .from('clients')
      .select('id,name,phone,details')
      .eq('module_id', moduleId)
      .in('id', ids)
    query = applyTenantFilter(query, tenantId, includeTenant)
    return query
  })
  if (response.error) throw response.error
  return new Map((response.data || []).map((client) => [client.id, client]))
}

async function loadSaleMap(moduleId, tenantId, saleIds = []) {
  const ids = [...new Set(saleIds.filter(Boolean))]
  if (!ids.length) return new Map()
  const response = await runWithTenantFallback(tenantId, async (includeTenant) => {
    let query = supabase
      .from('sales')
      .select('id,client_id,customer_name,customer_phone,delivery_fee,total_price,fulfillment_type,status,created_at')
      .eq('module_id', moduleId)
      .in('id', ids)
    query = applyTenantFilter(query, tenantId, includeTenant)
    return query
  })
  if (response.error) throw response.error
  return new Map((response.data || []).map((sale) => [sale.id, sale]))
}

function inRange(value, startDate, endDate) {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time)
    && time >= new Date(dateStart(startDate)).getTime()
    && time <= new Date(dateEnd(endDate)).getTime()
}

export async function loadDeliveryTeamSnapshot({
  moduleId = 'petshop',
  tenantId,
  startDate,
  endDate,
  settings = {},
} = {}) {
  if (!tenantId) throw new Error('Selecione uma empresa ativa para carregar as entregas.')

  const appointmentResponse = await runWithTenantFallback(tenantId, async (includeTenant) => {
    let query = supabase
      .from('appointments')
      .select(`
        id,client_id,scheduled_at,status,transport_mode,transport_label,
        delivery_staff_key,delivery_staff_name
      `)
      .eq('module_id', moduleId)
      .eq('status', 'concluido')
      .in('transport_mode', [...motodogModes])
      .gte('scheduled_at', dateStart(startDate))
      .lte('scheduled_at', dateEnd(endDate))
      .order('scheduled_at', { ascending: false })
    query = applyTenantFilter(query, tenantId, includeTenant)
    return query
  })
  if (appointmentResponse.error) throw appointmentResponse.error

  const orderResponse = await runWithTenantFallback(tenantId, async (includeTenant) => {
    let query = supabase
      .from('service_delivery_orders')
      .select(`
        id,sale_id,client_id,status,source,order_type,scheduled_for,created_at,updated_at,
        transport_mode,transport_label,assigned_staff_key,assigned_staff_name,delivery_value
      `)
      .eq('module_id', moduleId)
      .eq('order_type', 'entrega')
      .order('created_at', { ascending: false })
      .limit(1000)
    query = applyTenantFilter(query, tenantId, includeTenant)
    return query
  })
  if (orderResponse.error) throw orderResponse.error

  const orders = (orderResponse.data || []).filter((order) => (
    order.status === 'concluida'
    && inRange(order.updated_at || order.scheduled_for || order.created_at, startDate, endDate)
  ))
  const clientMap = await loadClientMap(moduleId, tenantId, [
    ...(appointmentResponse.data || []).map((item) => item.client_id),
    ...orders.map((item) => item.client_id),
  ])
  const saleMap = await loadSaleMap(moduleId, tenantId, orders.map((item) => item.sale_id))

  const appointmentRows = (appointmentResponse.data || []).map((appointment) => {
    const client = clientMap.get(appointment.client_id) || {}
    return {
      id: `appointment:${appointment.id}`,
      record_type: 'appointment',
      appointment_id: appointment.id,
      sale_id: null,
      order_id: null,
      occurred_at: appointment.scheduled_at,
      client_name: client.name || 'Cliente',
      pet_name: client.details?.pet_name || '',
      source_label: 'Agendamento MotoDog',
      delivery_value: appointmentDeliveryValue(appointment, settings),
      staff_key: appointment.delivery_staff_key || '',
      staff_name: appointment.delivery_staff_name || '',
      status: appointment.status,
    }
  })

  const saleRows = orders.map((order) => {
    const sale = saleMap.get(order.sale_id) || {}
    const client = clientMap.get(order.client_id || sale.client_id) || {}
    const configuredValue = Number(order.delivery_value)
    const saleFee = Number(sale.delivery_fee)
    return {
      id: `sale:${order.id}`,
      record_type: 'sale',
      appointment_id: null,
      sale_id: order.sale_id,
      order_id: order.id,
      occurred_at: order.updated_at || order.scheduled_for || order.created_at || sale.created_at,
      client_name: sale.customer_name || client.name || 'Cliente',
      pet_name: client.details?.pet_name || '',
      source_label: 'Venda com entrega',
      delivery_value: Number.isFinite(configuredValue) && configuredValue > 0
        ? configuredValue
        : Number.isFinite(saleFee) ? Math.max(0, saleFee) : Number(settings.delivery_fee || 8),
      staff_key: order.assigned_staff_key || '',
      staff_name: order.assigned_staff_name || '',
      status: order.status,
    }
  })

  return [...appointmentRows, ...saleRows]
    .sort((left, right) => new Date(right.occurred_at || 0) - new Date(left.occurred_at || 0))
}

export async function assignAppointmentDeliveryStaff({
  moduleId = 'petshop',
  tenantId,
  appointmentId,
  staff,
} = {}) {
  if (!tenantId || !appointmentId) throw new Error('Agendamento de entrega invalido.')
  const response = await runWithTenantFallback(tenantId, async (includeTenant) => {
    let query = supabase
      .from('appointments')
      .update({
        delivery_staff_key: staff?.key || null,
        delivery_staff_name: staff?.name || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)
      .eq('module_id', moduleId)
    query = applyTenantFilter(query, tenantId, includeTenant)
    return query
  })
  if (response.error) throw response.error
}

export async function assignSaleDeliveryStaff({
  moduleId = 'petshop',
  tenantId,
  saleId,
  staff,
  deliveryValue = 0,
} = {}) {
  if (!tenantId || !saleId) throw new Error('Venda de entrega invalida.')

  const updateResponse = await runWithTenantFallback(tenantId, async (includeTenant) => {
    let query = supabase
      .from('service_delivery_orders')
      .update({
        assigned_staff_key: staff?.key || null,
        assigned_staff_name: staff?.name || null,
        delivery_value: Math.max(0, Number(deliveryValue || 0)),
        updated_at: new Date().toISOString(),
      })
      .eq('sale_id', saleId)
      .eq('module_id', moduleId)
    query = applyTenantFilter(query, tenantId, includeTenant)
    return query.select('id').maybeSingle()
  })
  if (updateResponse.error) throw updateResponse.error
  if (updateResponse.data?.id) return updateResponse.data

  const saleResponse = await runWithTenantFallback(tenantId, async (includeTenant) => {
    let query = supabase
      .from('sales')
      .select('id,client_id,customer_phone,created_at')
      .eq('id', saleId)
      .eq('module_id', moduleId)
      .single()
    query = applyTenantFilter(query, tenantId, includeTenant)
    return query
  })
  if (saleResponse.error) throw saleResponse.error

  const payload = buildTenantPayload({
    module_id: moduleId,
    sale_id: saleId,
    client_id: saleResponse.data.client_id || null,
    assigned_staff_key: staff?.key || null,
    assigned_staff_name: staff?.name || null,
    delivery_value: Math.max(0, Number(deliveryValue || 0)),
    source: 'sale',
    order_type: 'entrega',
    status: 'pendente',
    contact_phone: saleResponse.data.customer_phone || null,
    created_at: saleResponse.data.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, tenantId, true)

  const insertResponse = await supabase
    .from('service_delivery_orders')
    .insert(payload)
    .select('id')
    .single()
  if (insertResponse.error) throw insertResponse.error
  return insertResponse.data
}
