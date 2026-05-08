import { useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useModuleCtx } from '../../context/ModuleContext'
import { useProducts } from './useProducts'
import { useAuthCtx } from '../../context/AuthContext'
import { applyTenantFilter, buildTenantPayload, runWithTenantFallback } from '../../lib/tenant'

function isFiscalAutomationMissingError(error) {
  const message = String(error?.message || '').toLowerCase()
  if (!message) return false
  return (
    message.includes('fiscal_policy_versions')
    || message.includes('tenant_fiscal_profiles')
    || message.includes('fiscal_audit_logs')
    || message.includes('sync_all_tenant_fiscal_profiles')
  ) && (
    message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('relation')
    || message.includes('function')
  )
}

function isFiscalPolicyVersionConflict(error) {
  const message = String(error?.message || '').toLowerCase()
  if (!message) return false
  return (
    message.includes('duplicate key')
    || message.includes('unique constraint')
    || message.includes('fiscal_policy_versions_module_id_version_label_key')
    || message.includes('23505')
  )
}

function buildFiscalVersionLabel() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `${yyyy}.${mm}.${dd}-${hh}${min}${ss}`
}

export function useFinance() {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [xmlResult, setXmlResult] = useState(null)
  const { activeModuleId }      = useModuleCtx()
  const { activeTenantId, profile } = useAuthCtx()
  const { syncProductFromXml }  = useProducts()

  // 1. Carregar faturas do módulo ativo
  const loadInvoices = useCallback(async (filters = {}) => {
    if (!activeModuleId) return
    setLoading(true); setError(null)
    try {
      const { data, error: err } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        let q = supabase
          .from('invoices')
          .select('*')
          .eq('module_id', activeModuleId)
          .order('created_at', { ascending: false })

        q = applyTenantFilter(q, activeTenantId, includeTenant)
        if (filters.status) q = q.eq('status', filters.status)
        if (filters.due_date) q = q.eq('due_date', filters.due_date)
        if (filters.customer) q = q.ilike('customer_phone', `%${filters.customer}%`)
        return q
      })

      if (err) throw err
      setInvoices(data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [activeModuleId, activeTenantId])

  // 2. Criar nova fatura (PDV ou recorrência)
  const createInvoice = useCallback(async (payload) => {
    if (!activeModuleId) throw new Error('Módulo não identificado')
    const { data, error: err } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      const insertPayload = buildTenantPayload({
        ...payload,
        module_id: activeModuleId,
        status: payload.status || 'pending',
      }, activeTenantId, includeTenant)

      return supabase
        .from('invoices')
        .insert(insertPayload)
        .select()
        .single()
    })
    
    if (err) throw err
    return data
  }, [activeModuleId, activeTenantId])

  // 3. Importar Nota Fiscal XML (NF-e / NFC-e) usando DOMParser Nativo (Mais leve/estável)
  const importXmlInvoice = useCallback(async (file) => {
    setLoading(true); setError(null)
    try {
      const fileName = String(file?.name || '').toLowerCase()
      if (!file || !fileName.endsWith('.xml')) {
        throw new Error('Selecione um arquivo XML valido para importar.')
      }

      const text = await file.text()
      const parser = new DOMParser()
      const xmlDoc = parser.parseFromString(text, "text/xml")
      if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
        throw new Error('Nao foi possivel ler o XML. Verifique se o arquivo nao esta corrompido.')
      }
      
      const getVal = (tagName) => xmlDoc.getElementsByTagName(tagName)[0]?.textContent || ""
      const infNFe = xmlDoc.getElementsByTagName("infNFe")[0]
      const nfeKey = infNFe?.getAttribute("Id")?.replace("NFe", "") || "CHAVE-NAO-LOCALIZADA"

      const emitName = getVal("xNome")
      const totalVal = getVal("vNF") || getVal("vProd") || 0

      // Mapeamento dos itens da nota com códigos de barras (EAN)
      const itens = Array.from(xmlDoc.getElementsByTagName("det")).map(d => ({
        name: d.getElementsByTagName("xProd")[0]?.textContent || "Item Desconhecido",
        barcode: d.getElementsByTagName("cEAN")[0]?.textContent || null,
        qnt:  d.getElementsByTagName("qCom")[0]?.textContent || 0,
        val:  d.getElementsByTagName("vUnCom")[0]?.textContent || 0,
        total: d.getElementsByTagName("vProd")[0]?.textContent || 0
      }))

      const nfData = {
        nfe_key: nfeKey,
        emit_name: emitName,
        emit_cnpj: getVal("CNPJ"),
        issue_date: getVal("dhEmi") || new Date().toISOString(),
        total_val: totalVal,
        itens
      }

      if (!nfData.emit_name && !nfData.total_val) {
        throw new Error("Erro ao ler dados básicos da nota. Verifique se o arquivo é um XML de NF-e válido.")
      }

      // 🔄 SINCRONIZAÇÃO DE ESTOQUE AUTOMÁTICA
      // Processamos cada item da nota para atualizar o estoque do PetShop
      const syncPromises = itens.map(item => syncProductFromXml(item))
      await Promise.all(syncPromises)

      // Criar a fatura financeira
      const savedInvoice = await createInvoice({
        amount: parseFloat(nfData.total_val),
        status: 'paid',
        due_date: nfData.issue_date.split('T')[0],
        notes: emitName,
        customer_phone: 'NFe Entrada',
        invoice_nfe_url: nfeKey
      })

      setInvoices(prev => [savedInvoice, ...prev])
      setXmlResult(nfData)
      return nfData
    } catch (e) {
      console.error("Erro no processamento do XML:", e)
      setError(e.message || 'Falha ao processar arquivo XML.')
      throw new Error(e.message || 'Falha ao processar arquivo XML.')
    } finally {
      setLoading(false)
    }
  }, [activeModuleId, syncProductFromXml, createInvoice])

  // 4. Atualizar status (Pagamento, Cancelamento)
  const updateStatus = useCallback(async (id, status, extra = {}) => {
    const payload = { 
      status, 
      updated_at: new Date().toISOString(),
      ...(status === 'paid' ? { paid_at: new Date().toISOString() } : {}),
      ...extra 
    }

    const { data, error: err } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let q = supabase
        .from('invoices')
        .update(payload)
        .eq('id', id)
        .select()
        .single()
      q = applyTenantFilter(q, activeTenantId, includeTenant)
      return q
    })

    if (err) throw err
    setInvoices(prev => prev.map(inv => inv.id === id ? data : inv))
    return data
  }, [activeTenantId])

  const deleteInvoice = useCallback(async (id) => {
    const { error: err } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let q = supabase.from('invoices').delete().eq('id', id)
      q = applyTenantFilter(q, activeTenantId, includeTenant)
      return q
    })
    if (err) throw err
    setInvoices(prev => prev.filter(inv => inv.id !== id))
  }, [activeTenantId])

  // 5. Configurações de Faturamento
  const getBillingSettings = useCallback(async () => {
    if (!activeModuleId) return null
    const { data } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let q = supabase
        .from('billing_settings')
        .select('*')
        .eq('module_id', activeModuleId)
        .single()
      q = applyTenantFilter(q, activeTenantId, includeTenant)
      return q
    })
    return data
  }, [activeModuleId, activeTenantId])

  const saveBillingSettings = useCallback(async (payload) => {
    const { data, error: err } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      const row = buildTenantPayload({ ...payload, module_id: activeModuleId }, activeTenantId, includeTenant)
      const conflict = includeTenant ? 'tenant_id,module_id' : 'module_id'
      return supabase
        .from('billing_settings')
        .upsert(row, { onConflict: conflict })
        .select()
        .single()
    })
    if (err) throw err
    return data
  }, [activeModuleId, activeTenantId])

  // 6. Status da automacao fiscal por tenant (petshop)
  const getFiscalAutomationStatus = useCallback(async () => {
    if (!activeModuleId || activeModuleId !== 'petshop') return null

    try {
      const [tenantProfileResponse, activePolicyResponse] = await Promise.all([
        runWithTenantFallback(activeTenantId, async (includeTenant) => {
          let query = supabase
            .from('tenant_fiscal_profiles')
            .select(`
              tenant_id, module_id, policy_version_id, mode, auto_update, nfe_environment, fiscal_regime,
              issue_series, next_invoice_number, emit_nfce, emit_nfe, emit_nfse, settings, updated_at,
              fiscal_policy_versions ( id, version_label, status, effective_from, notes, rules )
            `)
            .eq('module_id', activeModuleId)
            .limit(1)
            .maybeSingle()

          query = applyTenantFilter(query, activeTenantId, includeTenant)
          return query
        }),
        supabase
          .from('fiscal_policy_versions')
          .select('id, module_id, version_label, status, effective_from, notes, rules, created_at')
          .eq('module_id', activeModuleId)
          .eq('status', 'active')
          .order('effective_from', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (tenantProfileResponse.error) throw tenantProfileResponse.error
      if (activePolicyResponse.error) throw activePolicyResponse.error

      const tenantProfile = tenantProfileResponse.data || null
      const activePolicy = activePolicyResponse.data || null

      return {
        enabled: true,
        tenantProfile,
        activePolicy,
      }
    } catch (e) {
      if (isFiscalAutomationMissingError(e)) {
        return {
          enabled: false,
          reason: 'Automacao fiscal ainda nao foi habilitada no banco.',
        }
      }
      throw e
    }
  }, [activeModuleId, activeTenantId])

  // 7. Publicar nova versao fiscal global (admin global)
  const publishGlobalFiscalPolicyVersion = useCallback(async ({ rules, notes = '' } = {}) => {
    if (activeModuleId !== 'petshop') {
      throw new Error('Publicacao fiscal disponivel apenas no modulo petshop.')
    }

    if (profile?.role !== 'admin') {
      throw new Error('Somente Admin Global pode publicar versoes fiscais.')
    }

    const label = buildFiscalVersionLabel()
    const payload = {
      module_id: 'petshop',
      version_label: label,
      status: 'active',
      effective_from: new Date().toISOString(),
      rules: rules || {
        country: 'BR',
        invoices: {
          require_due_date: true,
          allow_zero_value: false,
          require_customer_reference: true,
        },
        nfe: {
          required_for_b2b: true,
          environments: ['homologacao', 'producao'],
        },
        compliance: {
          default_audit_level: 'warning',
        },
      },
      notes: notes || `Atualizacao fiscal global ${label}`,
      created_by: profile?.id || null,
      updated_at: new Date().toISOString(),
    }

    try {
      const { data, error: publishError } = await supabase
        .from('fiscal_policy_versions')
        .insert(payload)
        .select('*')
        .single()

      if (publishError) throw publishError
      return data
    } catch (e) {
      if (isFiscalPolicyVersionConflict(e)) {
        const { data: activeVersion, error: activeError } = await supabase
          .from('fiscal_policy_versions')
          .select('*')
          .eq('module_id', 'petshop')
          .eq('status', 'active')
          .order('effective_from', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (activeError) throw activeError

        if (activeVersion) {
          return {
            ...activeVersion,
            alreadyUpToDate: true,
          }
        }
      }

      if (isFiscalAutomationMissingError(e)) {
        throw new Error('Automacao fiscal nao habilitada no banco. Rode o SQL petshop_fiscal_automation.sql.')
      }
      throw e
    }
  }, [activeModuleId, profile?.id, profile?.role])

  // 8. Sincronizar politica fiscal para todos os tenants (admin global)
  const syncGlobalFiscalPolicies = useCallback(async () => {
    if (activeModuleId !== 'petshop') {
      throw new Error('Sincronizacao fiscal disponivel apenas no modulo petshop.')
    }

    if (profile?.role !== 'admin') {
      throw new Error('Somente Admin Global pode sincronizar politicas globais.')
    }

    try {
      const { data, error: syncError } = await supabase.rpc('sync_all_tenant_fiscal_profiles', {
        p_module_id: 'petshop',
      })

      if (syncError) throw syncError
      return Number(data || 0)
    } catch (e) {
      if (isFiscalAutomationMissingError(e)) {
        throw new Error('Automacao fiscal nao habilitada no banco. Rode o SQL petshop_fiscal_automation.sql.')
      }
      throw e
    }
  }, [activeModuleId, profile?.role])

  // 9. Auditoria fiscal rapida nas faturas do tenant atual
  const runFiscalAudit = useCallback(async () => {
    if (activeModuleId !== 'petshop') {
      throw new Error('Auditoria fiscal disponivel apenas no modulo petshop.')
    }

    const { data: docs, error: docsError } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let query = supabase
        .from('invoices')
        .select('id, module_id, status, amount, due_date, customer_phone, notes, invoice_nfe_url, created_at')
        .eq('module_id', activeModuleId)
        .order('created_at', { ascending: false })
        .limit(300)

      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return query
    })

    if (docsError) throw docsError

    const rows = []
    for (const invoice of docs || []) {
      if (!invoice.due_date) {
        rows.push({
          module_id: activeModuleId,
          invoice_id: invoice.id,
          severity: 'warning',
          code: 'invoice_missing_due_date',
          message: 'Fatura sem data de vencimento.',
          details: { invoice_id: invoice.id },
        })
      }

      if (Number(invoice.amount || 0) <= 0) {
        rows.push({
          module_id: activeModuleId,
          invoice_id: invoice.id,
          severity: 'error',
          code: 'invoice_non_positive_amount',
          message: 'Fatura com valor igual ou inferior a zero.',
          details: { invoice_id: invoice.id, amount: invoice.amount },
        })
      }

      if (invoice.status === 'paid' && !invoice.invoice_nfe_url) {
        rows.push({
          module_id: activeModuleId,
          invoice_id: invoice.id,
          severity: 'warning',
          code: 'paid_invoice_without_nfe_key',
          message: 'Fatura paga sem chave/documento fiscal vinculado.',
          details: { invoice_id: invoice.id },
        })
      }
    }

    if (rows.length === 0) {
      return { inserted: 0, findings: [] }
    }

    const saveResponse = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      const payload = rows.map((row) => buildTenantPayload({
        ...row,
        created_by: profile?.id || null,
      }, activeTenantId, includeTenant))

      return supabase
        .from('fiscal_audit_logs')
        .insert(payload)
        .select('*')
    })

    if (saveResponse.error) {
      if (isFiscalAutomationMissingError(saveResponse.error)) {
        throw new Error('Automacao fiscal nao habilitada no banco. Rode o SQL petshop_fiscal_automation.sql.')
      }
      throw saveResponse.error
    }

    return {
      inserted: (saveResponse.data || []).length,
      findings: saveResponse.data || [],
    }
  }, [activeModuleId, activeTenantId, profile?.id])

  // 10. Ler historico de auditoria fiscal
  const loadFiscalAuditLogs = useCallback(async (limit = 100) => {
    if (activeModuleId !== 'petshop') return []

    const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let query = supabase
        .from('fiscal_audit_logs')
        .select('id, tenant_id, module_id, invoice_id, severity, code, message, details, created_by, created_at')
        .eq('module_id', activeModuleId)
        .order('created_at', { ascending: false })
        .limit(limit)

      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return query
    })

    if (response.error) {
      if (isFiscalAutomationMissingError(response.error)) return []
      throw response.error
    }

    return response.data || []
  }, [activeModuleId, activeTenantId])

  return { 
    invoices, loading, error, xmlResult,
    loadInvoices, createInvoice, updateStatus, deleteInvoice,
    importXmlInvoice, getBillingSettings, saveBillingSettings,
    getFiscalAutomationStatus,
    publishGlobalFiscalPolicyVersion,
    syncGlobalFiscalPolicies,
    runFiscalAudit,
    loadFiscalAuditLogs,
  }
}
