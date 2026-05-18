import { useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useModuleCtx } from '../../context/ModuleContext'
import { useAuthCtx } from '../../context/AuthContext'
import { applyTenantFilter, buildTenantPayload, runWithTenantFallback } from '../../lib/tenant'

const BASE_SELECT = `
  id, name, category, description, price, cost_price, stock_quantity,
  min_stock, species_target, image_url, active, created_at, updated_at, 
  barcode, upsell_link_id
`
const PRODUCT_PAGE_SIZE = 1000
const EMPTY_PRODUCT_SUMMARY = {
  totalProducts: 0,
  totalValue: 0,
  criticalCount: 0,
  outCount: 0,
  categories: [],
}

function isPerformanceRpcMissing(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('function') && (
    message.includes('search_petshop_products')
    || message.includes('get_petshop_product_summary')
    || message.includes('does not exist')
    || message.includes('schema cache')
  )
}

async function fetchAllProductPages(buildQuery) {
  const rows = []

  for (let from = 0; ; from += PRODUCT_PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PRODUCT_PAGE_SIZE - 1)
    if (error) return { data: null, error }

    rows.push(...(data || []))
    if (!data || data.length < PRODUCT_PAGE_SIZE) break
  }

  return { data: rows, error: null }
}

function stockStatusOf(product) {
  if (Number(product.stock_quantity || 0) === 0) return 'esgotado'
  if (Number(product.stock_quantity || 0) <= Number(product.min_stock || 0)) return 'critico'
  return 'ok'
}

function applyStatusFilter(rows, status) {
  if (!status) return rows
  return rows.filter((product) => stockStatusOf(product) === status)
}

function mapRpcProducts(rows = []) {
  return rows.map(({ total_count, ...product }) => product)
}

export function useProducts() {
  const [products, setProducts]   = useState([])
  const [productTotal, setProductTotal] = useState(0)
  const [productSummary, setProductSummary] = useState(EMPTY_PRODUCT_SUMMARY)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const { activeModuleId } = useModuleCtx()
  const { activeTenantId } = useAuthCtx()

  const searchProducts = useCallback(async (filters = {}) => {
    if (!activeModuleId) return { data: [], total: 0 }

    const page = Math.max(1, Number(filters.page || 1))
    const pageSize = Math.min(Math.max(Number(filters.pageSize || 50), 1), 200)
    const offset = (page - 1) * pageSize

    const { data, error: err } = await supabase.rpc('search_petshop_products', {
      p_tenant_id: activeTenantId || null,
      p_module_id: activeModuleId,
      p_search: filters.search || null,
      p_category: filters.category || null,
      p_status: filters.status || null,
      p_active_only: filters.activeOnly !== false,
      p_limit: pageSize,
      p_offset: offset,
    })

    if (err) throw err

    const rows = data || []
    return {
      data: mapRpcProducts(rows),
      total: Number(rows[0]?.total_count || 0),
    }
  }, [activeModuleId, activeTenantId])

  const load = useCallback(async (filters = {}) => {
    if (!activeModuleId) return
    setLoading(true); setError(null)
    try {
      if (filters.paginated) {
        try {
          const result = await searchProducts(filters)
          setProducts(result.data)
          setProductTotal(result.total)
          return result
        } catch (rpcError) {
          if (!isPerformanceRpcMissing(rpcError)) throw rpcError
          console.warn('RPC de produtos nao aplicada; usando fallback legado.', rpcError)
        }
      }

      const { data, error: err } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        return fetchAllProductPages(() => {
          let q = supabase.from('products').select(BASE_SELECT).eq('module_id', activeModuleId).order('name')
          q = applyTenantFilter(q, activeTenantId, includeTenant)
          if (filters.category) q = q.eq('category', filters.category)
          if (filters.species) q = q.eq('species_target', filters.species)
          if (filters.activeOnly !== false) q = q.eq('active', true)
          if (filters.search) q = q.or(`name.ilike.%${filters.search}%,barcode.ilike.%${filters.search}%,category.ilike.%${filters.search}%`)
          return q
        })
      })

      if (err) throw err
      let rows = applyStatusFilter(data || [], filters.status)
      const total = rows.length

      if (filters.paginated) {
        const page = Math.max(1, Number(filters.page || 1))
        const pageSize = Math.min(Math.max(Number(filters.pageSize || 50), 1), 200)
        const from = (page - 1) * pageSize
        rows = rows.slice(from, from + pageSize)
      }

      setProducts(rows)
      setProductTotal(total)
      return { data: rows, total }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [activeModuleId, activeTenantId, searchProducts])

  const getProductSummary = useCallback(async () => {
    if (!activeModuleId) return EMPTY_PRODUCT_SUMMARY

    try {
      const { data, error: err } = await supabase.rpc('get_petshop_product_summary', {
        p_tenant_id: activeTenantId || null,
        p_module_id: activeModuleId,
      })

      if (err) throw err
      const summary = {
        totalProducts: Number(data?.totalProducts || 0),
        totalValue: Number(data?.totalValue || 0),
        criticalCount: Number(data?.criticalCount || 0),
        outCount: Number(data?.outCount || 0),
        categories: Array.isArray(data?.categories) ? data.categories : [],
      }
      setProductSummary(summary)
      return summary
    } catch (rpcError) {
      if (!isPerformanceRpcMissing(rpcError)) throw rpcError
      console.warn('RPC de resumo de produtos nao aplicada; usando fallback legado.', rpcError)
    }

    const { data, error: err } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      return fetchAllProductPages(() => {
        let q = supabase
          .from('products')
          .select(BASE_SELECT)
          .eq('module_id', activeModuleId)
        q = applyTenantFilter(q, activeTenantId, includeTenant)
        return q
      })
    })

    if (err) throw err
    const rows = data || []
    const summary = {
      totalProducts: rows.length,
      totalValue: rows.reduce((sum, product) => sum + Number(product.price || 0) * Number(product.stock_quantity || 0), 0),
      criticalCount: rows.filter((product) => stockStatusOf(product) === 'critico').length,
      outCount: rows.filter((product) => stockStatusOf(product) === 'esgotado').length,
      categories: [...new Set(rows.map((product) => product.category).filter(Boolean))].sort(),
    }
    setProductSummary(summary)
    return summary
  }, [activeModuleId, activeTenantId])

  const getById = useCallback(async (id) => {
    const { data } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let q = supabase
        .from('products')
        .select(BASE_SELECT)
        .eq('id', id)
        .eq('module_id', activeModuleId)
        .single()
      q = applyTenantFilter(q, activeTenantId, includeTenant)
      return q
    })

    return data
  }, [activeModuleId, activeTenantId])

  // Novo: Buscar produto por código de barras
  const getByBarcode = useCallback(async (barcode) => {
    if (!barcode) return null
    const { data } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let q = supabase
        .from('products')
        .select(BASE_SELECT)
        .eq('barcode', barcode)
        .eq('module_id', activeModuleId)
        .single()
      q = applyTenantFilter(q, activeTenantId, includeTenant)
      return q
    })

    return data
  }, [activeModuleId, activeTenantId])

  const create = useCallback(async (payload) => {
    const { data, error } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      const insertPayload = buildTenantPayload({ ...payload, module_id: activeModuleId }, activeTenantId, includeTenant)
      return supabase
        .from('products')
        .insert(insertPayload)
        .select(BASE_SELECT)
        .single()
    })

    if (error) throw error
    setProducts(prev => [data, ...prev])
    return data
  }, [activeModuleId, activeTenantId])

  const update = useCallback(async (id, payload) => {
    const payloadClean = { ...payload }
    if (payloadClean.upsell_product) delete payloadClean.upsell_product

    const { data, error } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let q = supabase
        .from('products')
        .update(payloadClean)
        .eq('id', id)
        .eq('module_id', activeModuleId)
        .select(BASE_SELECT)
        .single()
      q = applyTenantFilter(q, activeTenantId, includeTenant)
      return q
    })

    if (error) throw error
    setProducts(prev => prev.map(p => p.id === id ? data : p))
    return data
  }, [activeModuleId, activeTenantId])

  // Novo: Processar entrada de mercadoria via XML (Sincronização sugerida)
  const syncProductFromXml = useCallback(async (item) => {
    if (!activeModuleId) return null
    
    // 1. Tentar encontrar por código de barras (EAN)
    let product = null
    if (item.barcode && item.barcode !== 'SEM GTIN') {
      product = await getByBarcode(item.barcode)
    }

    // 2. Se não achou por código, tenta pelo nome exato (fallback)
    if (!product) {
      const { data } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        let q = supabase
          .from('products')
          .select(BASE_SELECT)
          .eq('name', item.name)
          .eq('module_id', activeModuleId)
          .single()
        q = applyTenantFilter(q, activeTenantId, includeTenant)
        return q
      })
      product = data
    }

    if (product) {
      // PRODUTO JÁ EXISTE: Aumentar estoque e atualizar custo
      const newQty = (product.stock_quantity || 0) + parseFloat(item.qnt)
      
      // Atualizamos o custo se o novo for diferente
      const newCost = parseFloat(item.val)
      
      return await update(product.id, { 
        stock_quantity: newQty,
        cost_price: newCost,
        updated_at: new Date().toISOString()
      })
    } else {
      // PRODUTO NOVO: Criar no banco
      return await create({
        name: item.name,
        barcode: item.barcode !== 'SEM GTIN' ? item.barcode : null,
        stock_quantity: parseFloat(item.qnt),
        cost_price: parseFloat(item.val),
        price: parseFloat(item.val) * 1.5, // Sugestão de margem de 50% inicial
        category: 'Importação XML',
        active: true,
        min_stock: 1
      })
    }
  }, [activeModuleId, getByBarcode, update, create])

  const adjustStock = useCallback(async (id, delta) => {
    const { data: current } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let q = supabase
        .from('products')
        .select('stock_quantity')
        .eq('id', id)
        .eq('module_id', activeModuleId)
        .single()
      q = applyTenantFilter(q, activeTenantId, includeTenant)
      return q
    })

    const newQty = Math.max(0, (current?.stock_quantity || 0) + delta)
    return update(id, { stock_quantity: newQty })
  }, [activeModuleId, activeTenantId, update])

  const remove = useCallback(async (id) => {
    const { error } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let q = supabase
        .from('products')
        .update({ active: false })
        .eq('id', id)
        .eq('module_id', activeModuleId)
      q = applyTenantFilter(q, activeTenantId, includeTenant)
      return q
    })

    if (error) throw error
    setProducts(prev => prev.filter(p => p.id !== id))
  }, [activeModuleId, activeTenantId])

  const getCriticalStock = useCallback(async () => {
    if (!activeModuleId) return []
    try {
      try {
        const [emptyResult, criticalResult] = await Promise.all([
          searchProducts({ activeOnly: true, status: 'esgotado', pageSize: 50 }),
          searchProducts({ activeOnly: true, status: 'critico', pageSize: 50 }),
        ])
        return [...emptyResult.data, ...criticalResult.data]
          .sort((a, b) => Number(a.stock_quantity || 0) - Number(b.stock_quantity || 0))
          .slice(0, 50)
      } catch (rpcError) {
        if (!isPerformanceRpcMissing(rpcError)) throw rpcError
      }

      const { data, error } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        return fetchAllProductPages(() => {
          let q = supabase
            .from('products')
            .select(BASE_SELECT)
            .eq('module_id', activeModuleId)
            .eq('active', true)
            .order('name')
          q = applyTenantFilter(q, activeTenantId, includeTenant)
          return q
        })
      })

      if (error) throw error
      return (data || []).filter(p => p.stock_quantity <= p.min_stock)
    } catch (e) {
      console.error('Error fetching critical stock:', e)
      return []
    }
  }, [activeModuleId, activeTenantId, searchProducts])

  const stockStatus = stockStatusOf

  return {
    products, productTotal, productSummary, loading, error,
    load, getById, getByBarcode, create, update, adjustStock, remove,
    syncProductFromXml, stockStatus, getCriticalStock, getProductSummary, searchProducts
  }
}
