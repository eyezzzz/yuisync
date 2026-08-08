import { useCallback, useState } from 'react'
import { useAuthCtx } from '../../context/AuthContext'
import { useModuleCtx } from '../../context/ModuleContext'
import { nextApi, nextFeature } from '../../lib/nextApi'
import { useSales as useLegacySales } from './useLegacySales'

const readNext = nextFeature('sales', 'read')
const writeNext = nextFeature('sales', 'write')
const nextEnabled = readNext && writeNext

const pad = (value) => String(value).padStart(2, '0')
const dateISO = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const dayBoundary = (date, end = false) => {
  if (!date) return undefined
  const value = new Date(`${date}T${end ? '23:59:59.999' : '00:00:00.000'}`)
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString()
}
const isCompleted = (status) => ['concluido', 'completed', 'paid'].includes(String(status || '').toLowerCase())
const fmtCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))

const fromNext = (sale) => {
  if (!sale) return sale
  const payments = Array.isArray(sale.payments) ? sale.payments : []
  const primaryPayment = payments[0] || null
  const splits = primaryPayment?.splits || []
  return {
    id: sale.id,
    client_id: sale.clientId || null,
    pet_id: sale.clientId || null,
    customer_name: sale.customerName || 'Balcao',
    customer_phone: sale.customerPhone || null,
    subtotal: Number(sale.subtotal || 0),
    subtotal_price: Number(sale.subtotal || 0),
    discount: Number(sale.discount || 0),
    total: Number(sale.total || 0),
    total_price: Number(sale.total || 0),
    status: sale.status,
    source: sale.source,
    fulfillment_type: sale.fulfillmentType || 'balcao',
    notes: sale.notes || null,
    payment_method: primaryPayment?.method || null,
    payment_splits: splits.map((split) => ({ method: split.method, amount: Number(split.amount || 0) })),
    sale_items: (sale.items || []).map((item) => ({
      id: item.id,
      product_id: item.productId || null,
      service_id: item.serviceId || null,
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unitPrice || 0),
      subtotal: Number(item.subtotal || 0),
      upsell: item.upsell === true,
      description: item.description,
      products: item.productId ? { id: item.productId, name: item.description } : null,
    })),
    payments,
    clients: sale.clientId ? { id: sale.clientId, name: sale.customerName, phone: sale.customerPhone } : null,
    created_at: sale.createdAt,
  }
}

const requestFilters = (filters = {}) => {
  const query = { limit: String(filters.limit || 100) }
  const from = dayBoundary(filters.startDate || filters.date)
  const to = dayBoundary(filters.endDate || filters.date, true)
  if (from) query.from = from
  if (to) query.to = to
  if (filters.status) query.status = filters.status
  if (filters.client_id) query.clientId = filters.client_id
  return query
}

const salePayload = (saleData = {}, cartItems = []) => {
  const subtotal = cartItems.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0), 0)
  const discount = Number(saleData.discount || 0)
  const total = Math.max(0, subtotal - discount)
  const paymentSplits = Array.isArray(saleData.payment_splits)
    ? saleData.payment_splits.filter((item) => Number(item?.amount || 0) > 0)
    : []
  const payment = saleData.payment_method || paymentSplits.length
    ? {
      method: paymentSplits.length > 1 ? 'multiplo' : saleData.payment_method || paymentSplits[0]?.method || 'outros',
      amount: total,
      status: 'pago',
      splits: paymentSplits.map((item) => ({ method: item.method || 'outros', amount: Number(item.amount || 0) })),
    }
    : undefined
  return {
    clientId: saleData.client_id || saleData.pet_id || null,
    customerName: saleData.customer_name || 'Balcao',
    customerPhone: saleData.customer_phone || null,
    discount,
    status: saleData.status || 'concluido',
    source: saleData.source || 'pdv',
    fulfillmentType: saleData.fulfillment_type || 'balcao',
    notes: saleData.notes || null,
    payment,
    items: cartItems.map((item) => ({
      productId: item.product_id || null,
      serviceId: item.service_id || null,
      description: item.description || item.name || null,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unit_price || 0),
      upsell: item.upsell === true,
    })),
  }
}

const salesMixFor = (rows) => {
  const mix = new Map()
  const add = (label, amount) => mix.set(label, (mix.get(label) || 0) + Number(amount || 0))
  rows.forEach((sale) => {
    const source = String(sale.source || '').toLowerCase()
    if (source === 'whatsapp') return add('WhatsApp', sale.total_price)
    const labels = (sale.sale_items || []).map((item) => String(item.description || item.products?.name || '').toLowerCase())
    if (labels.some((label) => /banho|tosa|groom/.test(label))) return add('Banho/Tosa', sale.total_price)
    if (labels.some((label) => /veterin|consulta|vacina/.test(label))) return add('Veterinaria', sale.total_price)
    if (!source || source === 'pdv') return add('PDV', sale.total_price)
    add(source.toUpperCase(), sale.total_price)
  })
  return Array.from(mix.entries()).map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5)
}

export function useSales() {
  const legacy = useLegacySales()
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dailyRevenue, setDailyRevenue] = useState(0)
  const [monthRevenue, setMonthRevenue] = useState(0)
  const { activeTenantId } = useAuthCtx()
  const { activeModuleId } = useModuleCtx()

  const fetchSales = useCallback(async (filters = {}) => {
    const rows = await nextApi.sales.list(activeTenantId, activeModuleId, requestFilters(filters))
    return (rows || []).map(fromNext)
  }, [activeTenantId, activeModuleId])

  const load = useCallback(async (filters = {}) => {
    if (!nextEnabled) return legacy.load(filters)
    if (!activeTenantId || !activeModuleId) return []
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchSales(filters)
      setSales(rows)
      return rows
    } catch (cause) {
      setError(cause.message)
      throw cause
    } finally {
      setLoading(false)
    }
  }, [legacy.load, activeTenantId, activeModuleId, fetchSales])

  const loadMetrics = useCallback(async () => {
    if (!nextEnabled) return legacy.loadMetrics()
    const today = dateISO()
    const firstDay = `${today.slice(0, 8)}01`
    const rows = await fetchSales({ startDate: firstDay, endDate: today, limit: 500 })
    const completed = rows.filter((sale) => isCompleted(sale.status))
    const daily = completed.filter((sale) => sale.created_at?.startsWith(today)).reduce((sum, sale) => sum + Number(sale.total_price || 0), 0)
    const month = completed.reduce((sum, sale) => sum + Number(sale.total_price || 0), 0)
    setDailyRevenue(daily)
    setMonthRevenue(month)
    return { faturamento_hoje: daily, faturamento_mes: month }
  }, [legacy.loadMetrics, fetchSales])

  const createSale = useCallback(async (saleData, cartItems) => {
    if (!nextEnabled) return legacy.createSale(saleData, cartItems)
    if (!cartItems?.length) throw new Error('Carrinho vazio')
    if (!activeTenantId || !activeModuleId) throw new Error('Selecione uma empresa ativa antes de salvar a venda.')
    const row = fromNext(await nextApi.sales.create(activeTenantId, activeModuleId, salePayload(saleData, cartItems), saleData.idempotency_key || crypto.randomUUID()))
    setSales((current) => [row, ...current.filter((item) => item.id !== row.id)])
    await loadMetrics()
    return row
  }, [legacy.createSale, activeTenantId, activeModuleId, loadMetrics])

  const issueSaleFiscal = useCallback(async (saleId) => {
    if (!nextEnabled) return legacy.issueSaleFiscal(saleId)
    throw new Error('Emissao fiscal ainda nao foi habilitada no runtime Next. A venda permanece registrada sem disparar efeito fiscal legado.')
  }, [legacy.issueSaleFiscal])

  const getDailyStats = useCallback(async (date = dateISO()) => {
    if (!nextEnabled) return legacy.getDailyStats(date)
    const rows = (await fetchSales({ date, limit: 500 })).filter((sale) => isCompleted(sale.status))
    return {
      revenue: rows.reduce((sum, sale) => sum + Number(sale.total_price || 0), 0),
      count: rows.length,
      upsells: rows.flatMap((sale) => sale.sale_items || []).filter((item) => item.upsell).length,
      salesMix: salesMixFor(rows),
    }
  }, [legacy.getDailyStats, fetchSales])

  return nextEnabled ? {
    sales,
    loading,
    error,
    dailyRevenue,
    monthRevenue,
    load,
    loadMetrics,
    createSale,
    issueSaleFiscal,
    getDailyStats,
    fmtCurrency,
  } : legacy
}
