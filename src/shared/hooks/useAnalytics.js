import { useState, useCallback } from 'react'
import { supabase, getTimezoneOffset } from '../../lib/supabase'
import { useModuleCtx } from '../../context/ModuleContext'
import { useAuthCtx } from '../../context/AuthContext'
import { applyTenantFilter, runWithTenantFallback } from '../../lib/tenant'

function sumSales(data = []) {
  return data.reduce((acc, row) => acc + (parseFloat(row.total_price) || 0), 0)
}

export function useAnalytics() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { activeModuleId } = useModuleCtx()
  const { activeTenantId } = useAuthCtx()

  const loadSalesBetween = useCallback(async ({ start, end }) => {
    const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let query = supabase
        .from('sales')
        .select('total_price, discount, created_at')
        .eq('module_id', activeModuleId)
        .eq('status', 'concluido')

      query = applyTenantFilter(query, activeTenantId, includeTenant)
      if (start) query = query.gte('created_at', start)
      if (end) query = query.lt('created_at', end)
      return query
    })

    return response.data || []
  }, [activeModuleId, activeTenantId])

  const getOverviewMetrics = useCallback(async () => {
    if (!activeModuleId) return null
    setLoading(true)
    setError(null)

    try {
      const allSales = await loadSalesBetween({})

      const totalRevenue = sumSales(allSales)
      const totalDiscount = allSales.reduce((acc, sale) => acc + (parseFloat(sale.discount) || 0), 0)
      const avgTicket = allSales.length ? totalRevenue / allSales.length : 0

      const now = new Date()
      const tz = getTimezoneOffset()
      const firstDayThisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00${tz}`
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0] + `T00:00:00${tz}`

      const thisMonthSales = await loadSalesBetween({ start: firstDayThisMonth })
      const lastMonthSales = await loadSalesBetween({ start: firstDayLastMonth, end: firstDayThisMonth })

      const thisMonthRevenue = sumSales(thisMonthSales)
      const lastMonthRevenue = sumSales(lastMonthSales)

      let growth = null
      if (lastMonthRevenue > 0) {
        growth = (((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1)
      }

      return {
        totalRevenue,
        totalDiscount,
        avgTicket,
        salesCount: allSales.length,
        growth,
      }
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [activeModuleId, loadSalesBetween])

  const getDynamicRevenueChart = useCallback(async (range = 'mensal') => {
    if (!activeModuleId) return []

    try {
      const tz = getTimezoneOffset()
      const points = []
      const now = new Date()

      if (range === 'diario') {
        for (let i = 6; i >= 0; i -= 1) {
          const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
          const start = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T00:00:00${tz}`
          const endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
          const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}T00:00:00${tz}`
          const rows = await loadSalesBetween({ start, end })
          points.push({
            name: date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase(),
            total: sumSales(rows),
          })
        }
        return points
      }

      if (range === 'semanal') {
        for (let i = 3; i >= 0; i -= 1) {
          const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (i * 7))
          const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - 7)
          const rows = await loadSalesBetween({ start: startDate.toISOString(), end: endDate.toISOString() })
          points.push({ name: `Sem ${4 - i}`, total: sumSales(rows) })
        }
        return points
      }

      for (let i = 5; i >= 0; i -= 1) {
        const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1)
        const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01T00:00:00${tz}`
        const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-01T00:00:00${tz}`
        const rows = await loadSalesBetween({ start, end })
        points.push({
          name: startDate.toLocaleString('pt-BR', { month: 'short' }).toUpperCase(),
          total: sumSales(rows),
        })
      }
      return points
    } catch (e) {
      console.error(e)
      return []
    }
  }, [activeModuleId, loadSalesBetween])

  const getAtRiskCustomers = useCallback(async () => {
    if (!activeModuleId) return []
    try {
      const threshold = new Date()
      threshold.setDate(threshold.getDate() - 30)
      const isoThreshold = threshold.toISOString()

      const clientsResponse = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        let query = supabase
          .from('clients')
          .select('id, name, phone, details')
          .eq('module_id', activeModuleId)
          .eq('active', true)

        query = applyTenantFilter(query, activeTenantId, includeTenant)
        return query
      })

      const customers = clientsResponse.data || []
      const result = []
      for (const customer of customers) {
        const saleResponse = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
          let query = supabase
            .from('sales')
            .select('created_at')
            .eq('module_id', activeModuleId)
            .eq('customer_phone', customer.phone)
            .order('created_at', { ascending: false })
            .limit(1)

          query = applyTenantFilter(query, activeTenantId, includeTenant)
          return query
        })

        const lastDate = saleResponse.data?.[0]?.created_at
        if (!lastDate || lastDate < isoThreshold) {
          result.push({
            id: customer.id,
            pet_name: customer.details?.pet_name || customer.name,
            owner_name: customer.name,
            phone: customer.phone,
            lastSeen: lastDate || 'Nunca',
          })
        }
      }

      return result
        .sort((a, b) => (a.lastSeen === 'Nunca' ? -1 : a.lastSeen > b.lastSeen ? 1 : -1))
        .slice(0, 5)
    } catch {
      return []
    }
  }, [activeModuleId, activeTenantId])

  const getCustomerCount = useCallback(async () => {
    if (!activeModuleId) return 0
    try {
      const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        let query = supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .eq('module_id', activeModuleId)
          .eq('active', true)

        query = applyTenantFilter(query, activeTenantId, includeTenant)
        return query
      })

      return response.count || 0
    } catch {
      return 0
    }
  }, [activeModuleId, activeTenantId])

  const getChatResolutionMetrics = useCallback(async () => {
    if (!activeModuleId) {
      return {
        avgCsat: null,
        csatCount: 0,
        aiResolved: 0,
        humanResolved: 0,
        closedCount: 0,
        blockedReasons: {},
      }
    }

    try {
      const sessionsResponse = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        let query = supabase
          .from('chat_sessions')
          .select('id, status, csat_score, created_at, closed_at')
          .eq('module_id', activeModuleId)
          .order('last_message_at', { ascending: false })
          .limit(500)

        query = applyTenantFilter(query, activeTenantId, includeTenant)
        return query
      })

      if (sessionsResponse.error) throw sessionsResponse.error
      const sessions = sessionsResponse.data || []
      const sessionIds = sessions.map((session) => session.id)
      if (sessionIds.length === 0) {
        return {
          avgCsat: null,
          csatCount: 0,
          aiResolved: 0,
          humanResolved: 0,
          closedCount: 0,
          blockedReasons: {},
        }
      }

      const messagesResponse = await supabase
        .from('chat_messages')
        .select('session_id, role, metadata')
        .in('session_id', sessionIds)

      if (messagesResponse.error) throw messagesResponse.error

      const humanHandled = new Set()
      const assistantHandled = new Set()
      const blockedReasons = {}
      for (const message of messagesResponse.data || []) {
        if (message.role === 'human_agent') humanHandled.add(message.session_id)
        if (message.role === 'assistant') assistantHandled.add(message.session_id)
        const reasons = message.metadata?.petbot_guard?.blocked_reasons
        if (Array.isArray(reasons)) {
          reasons.forEach((reason) => {
            const key = String(reason || '').trim()
            if (key) blockedReasons[key] = (blockedReasons[key] || 0) + 1
          })
        }
      }

      const closedSessions = sessions.filter((session) => (
        session.status === 'closed' || session.csat_score !== null || session.closed_at
      ))
      const ratings = sessions
        .map((session) => Number(session.csat_score))
        .filter((score) => Number.isFinite(score))

      return {
        avgCsat: ratings.length ? ratings.reduce((sum, score) => sum + score, 0) / ratings.length : null,
        csatCount: ratings.length,
        aiResolved: closedSessions.filter((session) => assistantHandled.has(session.id) && !humanHandled.has(session.id)).length,
        humanResolved: closedSessions.filter((session) => humanHandled.has(session.id)).length,
        closedCount: closedSessions.length,
        blockedReasons,
      }
    } catch (e) {
      console.error(e)
      return {
        avgCsat: null,
        csatCount: 0,
        aiResolved: 0,
        humanResolved: 0,
        closedCount: 0,
        blockedReasons: {},
      }
    }
  }, [activeModuleId, activeTenantId])

  return {
    loading,
    error,
    getOverviewMetrics,
    getDynamicRevenueChart,
    getAtRiskCustomers,
    getCustomerCount,
    getChatResolutionMetrics,
  }
}
