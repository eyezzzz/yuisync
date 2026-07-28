import { useCallback } from 'react'

import { useAuthCtx } from '../../../context/AuthContext'
import { useModuleCtx } from '../../../context/ModuleContext'
import { supabase, todayISO } from '../../../lib/supabase'
import { applyTenantFilter, buildTenantPayload, runWithTenantFallback } from '../../../lib/tenant'
import { normalizeCatalogPlanServices } from '../lib/catalogPlanServices'

const BILLING_CYCLE_DAYS = { monthly: 30, quarterly: 90 }
const CLIENT_SELECT = 'id,name,phone,email,address,neighborhood,city,details'
const PLAN_SELECT = 'id,name,price,billing_cycle,services,active'

function addDays(value, days) {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function formatClient(client = {}) {
  const details = client.details || {}
  return {
    id: client.id,
    owner_name: client.name || '',
    phone: client.phone || '',
    email: client.email || '',
    owner_address: client.address || '',
    owner_neighborhood: client.neighborhood || '',
    owner_city: client.city || '',
    details,
    pet_name: details.pet_name || client.name || '',
    species: details.species || 'other',
    breed: details.breed || '',
  }
}

export function useCatalogPlans() {
  const { activeTenantId } = useAuthCtx()
  const { activeModuleId } = useModuleCtx()
  const moduleId = activeModuleId || 'petshop'
  const runScoped = useCallback(
    (runner) => runWithTenantFallback(activeTenantId, runner),
    [activeTenantId],
  )

  const loadPlans = useCallback(async () => {
    const response = await runScoped(async (includeTenant) => {
      let query = supabase
        .from('subscription_plans')
        .select('*')
        .eq('module_id', moduleId)
        .order('price', { ascending: true })
      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return query
    })

    if (response.error) throw response.error
    return (response.data || []).map((plan) => ({
      ...plan,
      services: normalizeCatalogPlanServices(plan.services),
    }))
  }, [activeTenantId, moduleId, runScoped])

  const savePlan = useCallback(async (payload = {}) => {
    if (!activeTenantId) throw new Error('Selecione uma empresa ativa antes de salvar o plano.')
    const name = String(payload.name || '').trim()
    const services = normalizeCatalogPlanServices(payload.services)
      .filter((service) => service.qty_per_cycle > 0)

    if (!name) throw new Error('Informe o nome do plano.')
    if (!services.length) throw new Error('Adicione pelo menos um serviço real ou MotoDog ao plano.')

    const uniqueTypes = new Set(services.map((service) => service.service_type))
    if (uniqueTypes.size !== services.length) throw new Error('O mesmo serviço não pode aparecer duas vezes no plano.')

    const row = {
      module_id: moduleId,
      name,
      price: Math.max(0, Number(payload.price || 0)),
      billing_cycle: payload.billing_cycle || 'monthly',
      services,
      active: payload.active !== false,
      updated_at: new Date().toISOString(),
    }

    const response = await runScoped(async (includeTenant) => {
      const scopedRow = buildTenantPayload(row, activeTenantId, includeTenant)
      let query = payload.id
        ? supabase.from('subscription_plans').update(scopedRow).eq('id', payload.id).eq('module_id', moduleId)
        : supabase.from('subscription_plans').insert(scopedRow)
      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return query.select('*').single()
    })

    if (response.error) throw response.error
    return {
      ...response.data,
      services: normalizeCatalogPlanServices(response.data.services),
    }
  }, [activeTenantId, moduleId, runScoped])

  const loadSubscriptions = useCallback(async () => {
    const response = await runScoped(async (includeTenant) => {
      let query = supabase
        .from('client_subscriptions')
        .select(`*,subscription_plans(${PLAN_SELECT}),clients(${CLIENT_SELECT})`)
        .eq('module_id', moduleId)
        .order('started_at', { ascending: false })
      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return query
    })

    if (response.error) throw response.error
    return (response.data || []).map((subscription) => ({
      ...subscription,
      client: formatClient(subscription.clients || {}),
      subscription_plans: subscription.subscription_plans
        ? {
            ...subscription.subscription_plans,
            services: normalizeCatalogPlanServices(subscription.subscription_plans.services),
          }
        : null,
    }))
  }, [activeTenantId, moduleId, runScoped])

  const saveSubscription = useCallback(async (payload = {}) => {
    if (!activeTenantId) throw new Error('Selecione uma empresa ativa antes de salvar a assinatura.')
    if (!payload.plan_id || !payload.client_id) throw new Error('Selecione o plano e o cliente.')

    const startedAt = payload.started_at || todayISO()
    const cycle = payload.billing_cycle || payload.plan?.billing_cycle || 'monthly'
    const row = {
      module_id: moduleId,
      plan_id: payload.plan_id,
      client_id: payload.client_id,
      status: payload.status || 'active',
      started_at: startedAt,
      next_billing_date: payload.next_billing_date || addDays(startedAt, BILLING_CYCLE_DAYS[cycle] || 30),
      services_used: payload.services_used || {},
      cancelled_at: payload.status === 'cancelled' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }

    const response = await runScoped(async (includeTenant) => {
      const scopedRow = buildTenantPayload(row, activeTenantId, includeTenant)
      let query = payload.id
        ? supabase.from('client_subscriptions').update(scopedRow).eq('id', payload.id).eq('module_id', moduleId)
        : supabase.from('client_subscriptions').insert(scopedRow)
      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return query.select(`*,subscription_plans(${PLAN_SELECT}),clients(${CLIENT_SELECT})`).single()
    })

    if (response.error) throw response.error
    return {
      ...response.data,
      client: formatClient(response.data.clients || {}),
      subscription_plans: response.data.subscription_plans
        ? {
            ...response.data.subscription_plans,
            services: normalizeCatalogPlanServices(response.data.subscription_plans.services),
          }
        : null,
    }
  }, [activeTenantId, moduleId, runScoped])

  return {
    loadPlans,
    savePlan,
    loadSubscriptions,
    saveSubscription,
  }
}
