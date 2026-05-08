import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, AlertTriangle, BarChart3, Building2, CheckCircle2, CreditCard, Gauge, RefreshCw, Save, ShieldCheck, Sparkles,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthCtx } from '../../context/AuthContext'
import { useModuleCtx } from '../../context/ModuleContext'

const FALLBACK_PLANS = [
  {
    id: 'yui_start',
    name: 'Yui Start',
    subtitle: 'Operacao essencial para petshops em crescimento',
    monthly_price: 197,
    yearly_price: 1970,
    badge: '',
    highlighted: false,
    active: true,
    sort_order: 10,
    limits: {
      users: 1,
      bots: 1,
      ai_enabled: false,
      ai_messages: 0,
      support_cost_brl: 39,
      infra_cost_brl: 24,
      ai_unit_cost_brl: 0,
    },
  },
  {
    id: 'yui_pro',
    name: 'Yui Pro',
    subtitle: 'Fiscal + atendimento integrado para operacao profissional',
    monthly_price: 347,
    yearly_price: 3470,
    badge: 'Mais vendido',
    highlighted: true,
    active: true,
    sort_order: 20,
    limits: {
      users: 3,
      bots: 1,
      ai_enabled: false,
      ai_messages: 0,
      support_cost_brl: 69,
      infra_cost_brl: 31,
      ai_unit_cost_brl: 0,
    },
  },
  {
    id: 'yui_prime_ia',
    name: 'Yui Prime IA',
    subtitle: 'Escala com IA, automacoes e inteligencia operacional',
    monthly_price: 597,
    yearly_price: 5970,
    badge: 'Premium IA',
    highlighted: false,
    active: true,
    sort_order: 30,
    limits: {
      users: 5,
      bots: 2,
      ai_enabled: true,
      ai_messages: 12000,
      support_cost_brl: 119,
      infra_cost_brl: 41,
      ai_unit_cost_brl: 0.02,
    },
  },
  {
    id: 'yui_elite',
    name: 'Yui Elite',
    subtitle: 'Atendimento personalizado com automacoes sob medida',
    monthly_price: 0,
    yearly_price: 0,
    badge: 'Concierge',
    highlighted: false,
    active: true,
    sort_order: 40,
    limits: {
      users: 10,
      bots: 4,
      ai_enabled: true,
      ai_messages: 25000,
      support_cost_brl: 260,
      infra_cost_brl: 90,
      ai_unit_cost_brl: 0.018,
    },
  },
]

const ONBOARDING_STAGES = [
  { id: 'empresa', label: 'Empresa' },
  { id: 'plano', label: 'Plano' },
  { id: 'modulos', label: 'Modulos' },
  { id: 'admin', label: 'Admin inicial' },
  { id: 'operacao', label: 'Operacao' },
  { id: 'fiscal', label: 'Fiscal' },
  { id: 'integracoes', label: 'Integracoes' },
  { id: 'concluido', label: 'Concluido' },
]

const SUBSCRIPTION_STATUSES = [
  { id: 'trialing', label: 'Trial' },
  { id: 'active', label: 'Ativa' },
  { id: 'paused', label: 'Pausada' },
  { id: 'past_due', label: 'Em atraso' },
  { id: 'canceled', label: 'Cancelada' },
]

const ONBOARDING_STATUSES = [
  { id: 'pending', label: 'Pendente' },
  { id: 'in_progress', label: 'Em andamento' },
  { id: 'blocked', label: 'Bloqueado' },
  { id: 'completed', label: 'Concluido' },
]

const PLAN_ONBOARDING_TEMPLATE = {
  yui_start: {
    stage: 'operacao',
    onboarding_status: 'in_progress',
    progress: 35,
    checklist: {
      empresa: true,
      plano: true,
      modulos: true,
      admin: true,
      operacao: false,
      fiscal: false,
      integracoes: false,
    },
  },
  yui_pro: {
    stage: 'fiscal',
    onboarding_status: 'in_progress',
    progress: 55,
    checklist: {
      empresa: true,
      plano: true,
      modulos: true,
      admin: true,
      operacao: true,
      fiscal: false,
      integracoes: false,
    },
  },
  yui_prime_ia: {
    stage: 'integracoes',
    onboarding_status: 'in_progress',
    progress: 72,
    checklist: {
      empresa: true,
      plano: true,
      modulos: true,
      admin: true,
      operacao: true,
      fiscal: true,
      integracoes: false,
    },
  },
  yui_elite: {
    stage: 'integracoes',
    onboarding_status: 'in_progress',
    progress: 80,
    checklist: {
      empresa: true,
      plano: true,
      modulos: true,
      admin: true,
      operacao: true,
      fiscal: true,
      integracoes: false,
    },
  },
}

function toCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toBool(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false
  }
  return fallback
}

function monthStartSaoPaulo() {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  return `${today.slice(0, 7)}-01`
}

function normalizePlanLimits(limits = {}, fallback = {}) {
  return {
    users: Math.max(0, asNumber(limits.users, asNumber(fallback.users, 1))),
    bots: Math.max(0, asNumber(limits.bots, asNumber(fallback.bots, 1))),
    ai_enabled: toBool(limits.ai_enabled, toBool(fallback.ai_enabled, false)),
    ai_messages: Math.max(0, asNumber(limits.ai_messages, asNumber(fallback.ai_messages, 0))),
    support_cost_brl: Math.max(0, asNumber(limits.support_cost_brl, asNumber(fallback.support_cost_brl, 0))),
    infra_cost_brl: Math.max(0, asNumber(limits.infra_cost_brl, asNumber(fallback.infra_cost_brl, 0))),
    ai_unit_cost_brl: Math.max(0, asNumber(limits.ai_unit_cost_brl, asNumber(fallback.ai_unit_cost_brl, 0))),
  }
}

function buildPlanDraft(plan) {
  const normalizedLimits = normalizePlanLimits(plan?.limits || {}, {})
  return {
    monthly_price: String(plan?.monthly_price || 0),
    yearly_price: String(plan?.yearly_price || 0),
    highlighted: Boolean(plan?.highlighted),
    active: plan?.active !== false,
    users: String(normalizedLimits.users),
    bots: String(normalizedLimits.bots),
    ai_enabled: Boolean(normalizedLimits.ai_enabled),
    ai_messages: String(normalizedLimits.ai_messages),
    support_cost_brl: String(normalizedLimits.support_cost_brl),
    infra_cost_brl: String(normalizedLimits.infra_cost_brl),
    ai_unit_cost_brl: String(normalizedLimits.ai_unit_cost_brl),
  }
}

function isCommercialSchemaError(error) {
  const message = String(error?.message || '').toLowerCase()
  if (!message) return false
  return (
    (message.includes('platform_plan_catalog')
      || message.includes('tenant_subscriptions')
      || message.includes('tenant_onboarding'))
    && (message.includes('does not exist')
      || message.includes('schema cache')
      || message.includes('relation'))
  )
}

function isGovernanceSchemaError(error) {
  const message = String(error?.message || '').toLowerCase()
  if (!message) return false
  return (
    message.includes('tenant_ai_usage_monthly')
    || message.includes('tenant_governance_alerts')
    || message.includes('yui_refresh_governance_alerts')
  )
}

function buildDefaultChecklist() {
  return {
    empresa: false,
    plano: false,
    modulos: false,
    admin: false,
    operacao: false,
    fiscal: false,
    integracoes: false,
  }
}

function normalizeTenantDraft(tenantId, plansById, subscription, onboarding, profileId) {
  const defaultPlanId = plansById['yui_start'] ? 'yui_start' : Object.keys(plansById)[0]
  const stage = onboarding?.stage || 'empresa'
  const progress = Number(onboarding?.progress || 5)
  const onboardingStatus = onboarding?.status || (progress >= 100 ? 'completed' : progress <= 5 ? 'pending' : 'in_progress')

  return {
    tenant_id: tenantId,
    module_id: 'petshop',
    plan_id: subscription?.plan_id || defaultPlanId || 'yui_start',
    status: subscription?.status || 'trialing',
    billing_cycle: subscription?.billing_cycle || 'monthly',
    auto_charge_enabled: Boolean(subscription?.auto_charge_enabled),
    payment_provider: subscription?.payment_provider || '',
    provider_customer_id: subscription?.provider_customer_id || '',
    provider_subscription_id: subscription?.provider_subscription_id || '',
    notes: subscription?.notes || '',
    stage,
    progress,
    onboarding_status: onboardingStatus,
    checklist: onboarding?.checklist || buildDefaultChecklist(),
    updated_by: profileId || null,
  }
}

export default function CommercialPage() {
  const { profile, tenants: scopedTenants = [] } = useAuthCtx()
  const { activeModule } = useModuleCtx()
  const [loading, setLoading] = useState(true)
  const [savingPlans, setSavingPlans] = useState(false)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [plans, setPlans] = useState(FALLBACK_PLANS)
  const [planDrafts, setPlanDrafts] = useState({})
  const [tenants, setTenants] = useState([])
  const [subscriptionMap, setSubscriptionMap] = useState({})
  const [onboardingMap, setOnboardingMap] = useState({})
  const [tenantDrafts, setTenantDrafts] = useState({})
  const [savingTenant, setSavingTenant] = useState('')
  const [aiUsageMap, setAiUsageMap] = useState({})
  const [governanceAlerts, setGovernanceAlerts] = useState([])
  const [governanceSchemaMissing, setGovernanceSchemaMissing] = useState(false)
  const [refreshingGovernance, setRefreshingGovernance] = useState(false)
  const [currentPeriodMonth, setCurrentPeriodMonth] = useState(monthStartSaoPaulo())

  const isGlobalAdmin = profile?.role === 'admin'

  const plansById = useMemo(() => {
    const map = {}
    for (const plan of plans) map[plan.id] = plan
    return map
  }, [plans])

  const tenantRows = useMemo(() => (
    tenants.map((tenant) => {
      const subscription = subscriptionMap[tenant.id] || null
      const onboarding = onboardingMap[tenant.id] || null
      const usage = aiUsageMap[tenant.id] || null
      return { tenant, subscription, onboarding, usage }
    })
  ), [tenants, subscriptionMap, onboardingMap, aiUsageMap])

  const commercialSummary = useMemo(() => {
    const rows = Object.values(subscriptionMap || {}).filter((item) => ['active', 'trialing'].includes(item?.status))
    let mrr = 0
    let estimatedCost = 0
    let aiMessagesUsed = 0

    for (const subscription of rows) {
      const monthlyRevenue = subscription?.billing_cycle === 'yearly'
        ? asNumber(subscription?.contracted_price, 0) / 12
        : asNumber(subscription?.contracted_price, 0)
      mrr += monthlyRevenue

      const plan = plansById[subscription.plan_id]
      const limits = normalizePlanLimits(plan?.limits || {}, {})
      const usage = aiUsageMap[subscription.tenant_id]
      const used = asNumber(usage?.messages_used, 0)
      aiMessagesUsed += used

      const aiCost = limits.ai_enabled ? used * asNumber(limits.ai_unit_cost_brl, 0) : 0
      const fixedCost = asNumber(limits.support_cost_brl, 0) + asNumber(limits.infra_cost_brl, 0)
      estimatedCost += fixedCost + aiCost
    }

    const grossMargin = mrr - estimatedCost
    const marginPct = mrr > 0 ? (grossMargin / mrr) * 100 : 0
    const openAlerts = governanceAlerts.filter((alert) => alert.status === 'open').length
    const criticalAlerts = governanceAlerts.filter((alert) => ['critical', 'high'].includes(String(alert.severity || '').toLowerCase())).length

    return {
      activeSubscriptions: rows.length,
      mrr,
      estimatedCost,
      grossMargin,
      marginPct,
      aiMessagesUsed,
      openAlerts,
      criticalAlerts,
    }
  }, [subscriptionMap, plansById, aiUsageMap, governanceAlerts])

  const loadData = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    setError('')
    setMsg({ type: '', text: '' })

    try {
      const [
        plansResponse,
        subscriptionsResponse,
        onboardingResponse,
        tenantsResponse,
      ] = await Promise.all([
        supabase
          .from('platform_plan_catalog')
          .select('id,name,subtitle,monthly_price,yearly_price,currency,features,limits,badge,highlighted,active,sort_order')
          .order('sort_order', { ascending: true })
          .order('monthly_price', { ascending: true }),
        supabase
          .from('tenant_subscriptions')
          .select('tenant_id,module_id,plan_id,status,billing_cycle,contracted_price,currency,auto_charge_enabled,payment_provider,provider_customer_id,provider_subscription_id,notes,next_billing_at,trial_ends_at,updated_at')
          .eq('module_id', 'petshop'),
        supabase
          .from('tenant_onboarding')
          .select('tenant_id,module_id,status,stage,progress,checklist,started_at,completed_at,updated_at')
          .eq('module_id', 'petshop'),
        isGlobalAdmin
          ? supabase.from('tenants').select('id,name,slug,active,created_at').order('created_at', { ascending: true })
          : Promise.resolve({ data: scopedTenants, error: null }),
      ])

      const maybeErrors = [plansResponse.error, subscriptionsResponse.error, onboardingResponse.error, tenantsResponse.error]
      const firstError = maybeErrors.find(Boolean)

      if (firstError) {
        if (isCommercialSchemaError(firstError)) {
          setSchemaMissing(true)
          setPlans(FALLBACK_PLANS)
          setPlanDrafts(Object.fromEntries(FALLBACK_PLANS.map((plan) => [plan.id, buildPlanDraft(plan)])))
          const localTenants = (scopedTenants || []).map((tenant) => ({
            id: tenant.id,
            name: tenant.name || 'Cliente sem nome',
            slug: tenant.slug || '',
            active: true,
          }))
          setTenants(localTenants)
          setSubscriptionMap({})
          setOnboardingMap({})
          setTenantDrafts({})
          setAiUsageMap({})
          setGovernanceAlerts([])
          return
        }
        throw firstError
      }

      setSchemaMissing(false)

      const nextPlans = (plansResponse.data || []).length > 0 ? plansResponse.data : FALLBACK_PLANS
      setPlans(nextPlans)
      setPlanDrafts(Object.fromEntries(nextPlans.map((plan) => [plan.id, buildPlanDraft(plan)])))

      const nextTenants = (tenantsResponse.data || []).map((tenant) => ({
        id: tenant.id,
        name: tenant.name || 'Cliente sem nome',
        slug: tenant.slug || '',
        active: tenant.active !== false,
      }))
      setTenants(nextTenants)

      const nextSubscriptionMap = {}
      for (const item of subscriptionsResponse.data || []) {
        if (!item?.tenant_id) continue
        nextSubscriptionMap[item.tenant_id] = item
      }
      setSubscriptionMap(nextSubscriptionMap)

      const nextOnboardingMap = {}
      for (const item of onboardingResponse.data || []) {
        if (!item?.tenant_id) continue
        nextOnboardingMap[item.tenant_id] = item
      }
      setOnboardingMap(nextOnboardingMap)

      const monthStart = monthStartSaoPaulo()
      setCurrentPeriodMonth(monthStart)

      try {
        const [usageResponse, alertsResponse] = await Promise.all([
          supabase
            .from('tenant_ai_usage_monthly')
            .select('tenant_id,module_id,period_month,plan_id,messages_used,messages_limit,updated_at')
            .eq('module_id', 'petshop')
            .eq('period_month', monthStart),
          supabase
            .from('tenant_governance_alerts')
            .select('id,tenant_id,module_id,alert_type,severity,status,title,description,payload,created_at,updated_at')
            .eq('module_id', 'petshop')
            .eq('status', 'open')
            .order('updated_at', { ascending: false })
            .limit(50),
        ])

        if (usageResponse.error) throw usageResponse.error
        if (alertsResponse.error) throw alertsResponse.error

        const nextUsageMap = {}
        for (const row of usageResponse.data || []) {
          if (!row?.tenant_id) continue
          nextUsageMap[row.tenant_id] = row
        }
        setAiUsageMap(nextUsageMap)
        setGovernanceAlerts(alertsResponse.data || [])
        setGovernanceSchemaMissing(false)
      } catch (governanceError) {
        if (isGovernanceSchemaError(governanceError)) {
          setGovernanceSchemaMissing(true)
          setAiUsageMap({})
          setGovernanceAlerts([])
        } else {
          throw governanceError
        }
      }

      const plansMap = Object.fromEntries(nextPlans.map((plan) => [plan.id, plan]))
      const nextDrafts = {}
      for (const tenant of nextTenants) {
        nextDrafts[tenant.id] = normalizeTenantDraft(
          tenant.id,
          plansMap,
          nextSubscriptionMap[tenant.id],
          nextOnboardingMap[tenant.id],
          profile.id,
        )
      }
      setTenantDrafts(nextDrafts)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar comercial.')
    } finally {
      setLoading(false)
    }
  }, [isGlobalAdmin, profile?.id, scopedTenants])

  useEffect(() => {
    loadData()
  }, [loadData])

  function setPlanField(planId, field, value) {
    setPlanDrafts((prev) => ({
      ...prev,
      [planId]: { ...(prev[planId] || {}), [field]: value },
    }))
  }

  function setTenantField(tenantId, field, value) {
    setTenantDrafts((prev) => ({
      ...prev,
      [tenantId]: { ...(prev[tenantId] || {}), [field]: value },
    }))
  }

  function applyPlanTemplateToTenant(tenantId, planId) {
    const template = PLAN_ONBOARDING_TEMPLATE[planId] || PLAN_ONBOARDING_TEMPLATE.yui_start
    setTenantDrafts((prev) => {
      const current = prev[tenantId] || {}
      return {
        ...prev,
        [tenantId]: {
          ...current,
          stage: template.stage,
          onboarding_status: template.onboarding_status,
          progress: template.progress,
          checklist: {
            ...buildDefaultChecklist(),
            ...(template.checklist || {}),
          },
          notes: current.notes || `Template ${planId} aplicado para acelerar onboarding operacional.`,
        },
      }
    })
  }

  async function refreshGovernanceAudit() {
    if (schemaMissing) return
    setRefreshingGovernance(true)
    setError('')
    setMsg({ type: '', text: '' })

    try {
      const { error: rpcError, data } = await supabase.rpc('yui_refresh_governance_alerts', {
        p_module_id: 'petshop',
      })
      if (rpcError) throw rpcError

      await loadData()
      setMsg({
        type: 'success',
        text: `Auditoria de governanca concluida. Alertas abertos: ${Number(data?.open_alerts || 0)}.`,
      })
    } catch (auditError) {
      if (isGovernanceSchemaError(auditError)) {
        setGovernanceSchemaMissing(true)
        setError('Estrutura de governanca/alertas ainda nao foi criada. Rode o SQL de governanca.')
      } else {
        setError(auditError instanceof Error ? auditError.message : 'Falha ao recalcular alertas de governanca.')
      }
    } finally {
      setRefreshingGovernance(false)
    }
  }

  async function savePlans() {
    if (!isGlobalAdmin || schemaMissing) return
    setSavingPlans(true)
    setError('')
    setMsg({ type: '', text: '' })

    try {
      const rows = plans.map((plan) => {
        const draft = planDrafts[plan.id] || {}
        const mergedLimits = normalizePlanLimits({
          ...(plan.limits || {}),
          users: asNumber(draft.users, asNumber(plan?.limits?.users, 0)),
          bots: asNumber(draft.bots, asNumber(plan?.limits?.bots, 0)),
          ai_enabled: Boolean(draft.ai_enabled),
          ai_messages: asNumber(draft.ai_messages, asNumber(plan?.limits?.ai_messages, 0)),
          support_cost_brl: asNumber(draft.support_cost_brl, asNumber(plan?.limits?.support_cost_brl, 0)),
          infra_cost_brl: asNumber(draft.infra_cost_brl, asNumber(plan?.limits?.infra_cost_brl, 0)),
          ai_unit_cost_brl: asNumber(draft.ai_unit_cost_brl, asNumber(plan?.limits?.ai_unit_cost_brl, 0)),
        }, plan.limits || {})

        return {
          id: plan.id,
          name: plan.name,
          subtitle: plan.subtitle || '',
          monthly_price: asNumber(draft.monthly_price, plan.monthly_price || 0),
          yearly_price: asNumber(draft.yearly_price, plan.yearly_price || 0),
          currency: plan.currency || 'BRL',
          badge: plan.badge || null,
          highlighted: Boolean(draft.highlighted),
          active: Boolean(draft.active),
          sort_order: plan.sort_order || 0,
          features: plan.features || [],
          limits: mergedLimits,
          updated_at: new Date().toISOString(),
        }
      })

      const { error: saveError } = await supabase
        .from('platform_plan_catalog')
        .upsert(rows, { onConflict: 'id' })

      if (saveError) throw saveError
      setMsg({ type: 'success', text: 'Catalogo de planos atualizado.' })
      await loadData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar os planos.')
    } finally {
      setSavingPlans(false)
    }
  }

  async function saveTenant(tenantId) {
    if (schemaMissing) return
    const draft = tenantDrafts[tenantId]
    if (!draft) return

    setSavingTenant(tenantId)
    setError('')
    setMsg({ type: '', text: '' })

    try {
      const selectedPlan = plansById[draft.plan_id]
      const contractedPrice = draft.billing_cycle === 'yearly'
        ? asNumber(selectedPlan?.yearly_price, selectedPlan?.monthly_price || 0)
        : asNumber(selectedPlan?.monthly_price, 0)

      const subscriptionPayload = {
        tenant_id: tenantId,
        module_id: 'petshop',
        plan_id: draft.plan_id,
        status: draft.status,
        billing_cycle: draft.billing_cycle,
        contracted_price: contractedPrice,
        currency: 'BRL',
        auto_charge_enabled: Boolean(draft.auto_charge_enabled),
        payment_provider: draft.payment_provider || null,
        provider_customer_id: (draft.provider_customer_id || '').trim() || null,
        provider_subscription_id: (draft.provider_subscription_id || '').trim() || null,
        notes: (draft.notes || '').trim() || null,
        managed_by: profile?.id || null,
        updated_at: new Date().toISOString(),
      }

      const onboardingStatus = draft.progress >= 100 ? 'completed' : draft.onboarding_status
      const onboardingStage = draft.progress >= 100 ? 'concluido' : draft.stage
      const onboardingPayload = {
        tenant_id: tenantId,
        module_id: 'petshop',
        status: onboardingStatus,
        stage: onboardingStage,
        progress: Math.max(0, Math.min(100, asNumber(draft.progress, 5))),
        checklist: draft.checklist || buildDefaultChecklist(),
        updated_by: profile?.id || null,
        completed_at: draft.progress >= 100 ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }

      const [subscriptionResponse, onboardingResponse] = await Promise.all([
        supabase
          .from('tenant_subscriptions')
          .upsert(subscriptionPayload, { onConflict: 'tenant_id,module_id' }),
        supabase
          .from('tenant_onboarding')
          .upsert(onboardingPayload, { onConflict: 'tenant_id,module_id' }),
      ])

      if (subscriptionResponse.error) throw subscriptionResponse.error
      if (onboardingResponse.error) throw onboardingResponse.error

      setMsg({ type: 'success', text: 'Assinatura e onboarding atualizados.' })
      await loadData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar este negocio.')
    } finally {
      setSavingTenant('')
    }
  }

  if (loading) {
    return (
      <div className="page flex items-center justify-center py-20 text-muted">
        <RefreshCw size={18} className="animate-spin mr-2 text-[var(--primary)]" />
        Carregando comercial...
      </div>
    )
  }

  return (
    <div className="page animate-fade-up max-w-7xl mx-auto pb-20 space-y-7">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Sparkles size={22} className={activeModule?.theme?.textPrimary} />
            Comercial & Onboarding
          </h1>
          <p className="page-sub">
            Caminho de venda pronto para escalar: catalogo de planos, assinatura por negocio e governanca de custo/margem.
          </p>
        </div>
        <button onClick={loadData} className="btn btn-secondary gap-2">
          <RefreshCw size={14} />
          Atualizar painel
        </button>
      </div>

      {schemaMissing && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Estrutura comercial ainda nao existe no banco. Rode o SQL <span className="font-bold">database/commercial_onboarding_foundation.sql</span>.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {msg.text && (
        <div className={`rounded-2xl border px-4 py-3 text-sm flex items-center gap-2 ${
          msg.type === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : 'border-blue-500/30 bg-blue-500/10 text-blue-200'
        }`}>
          <CheckCircle2 size={15} />
          {msg.text}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-muted">Resumo financeiro do mes ({currentPeriodMonth})</p>
          <button
            onClick={refreshGovernanceAudit}
            disabled={refreshingGovernance || schemaMissing}
            className="btn btn-secondary gap-2"
          >
            {refreshingGovernance ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            Rodar auditoria de governanca
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-3xl border border-white/10 bg-card p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted font-black mb-2">MRR estimado</p>
            <p className="font-display text-3xl font-bold text-text">{toCurrency(commercialSummary.mrr)}</p>
            <p className="text-xs text-muted mt-2 flex items-center gap-2">
              <CreditCard size={12} className="text-cyan-300" />
              {commercialSummary.activeSubscriptions} contratos ativos/trial
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-card p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted font-black mb-2">Custo operacional</p>
            <p className="font-display text-3xl font-bold text-text">{toCurrency(commercialSummary.estimatedCost)}</p>
            <p className="text-xs text-muted mt-2 flex items-center gap-2">
              <BarChart3 size={12} className="text-amber-300" />
              IA usada no mes: {commercialSummary.aiMessagesUsed} msg
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-card p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted font-black mb-2">Margem estimada</p>
            <p className={`font-display text-3xl font-bold ${commercialSummary.grossMargin >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {toCurrency(commercialSummary.grossMargin)}
            </p>
            <p className="text-xs text-muted mt-2 flex items-center gap-2">
              <Gauge size={12} className="text-emerald-300" />
              {commercialSummary.marginPct.toFixed(1)}% sobre receita do mes
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-card p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted font-black mb-2">Alertas abertos</p>
            <p className="font-display text-3xl font-bold text-text">{commercialSummary.openAlerts}</p>
            <p className="text-xs text-muted mt-2 flex items-center gap-2">
              <AlertTriangle size={12} className="text-red-300" />
              Criticos/alto risco: {commercialSummary.criticalAlerts}
            </p>
          </div>
        </div>

        {governanceSchemaMissing && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Estrutura de governanca/alertas ainda nao existe. Rode o SQL <span className="font-bold">database/governance_ops_alerts.sql</span> e depois atualize.
          </div>
        )}

        {!governanceSchemaMissing && (
          <div className="rounded-3xl border border-white/10 bg-card p-5 space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-muted font-black">Prioridades operacionais</p>
            {governanceAlerts.length === 0 && (
              <p className="text-sm text-muted">Nenhum alerta aberto no momento.</p>
            )}
            {governanceAlerts.slice(0, 8).map((alert) => (
              <div key={alert.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-text">{alert.title}</p>
                  <span className={`badge ${String(alert.severity || '').toLowerCase() === 'critical' ? 'badge-red' : String(alert.severity || '').toLowerCase() === 'warning' ? 'badge-amber' : 'badge-blue'}`}>
                    {String(alert.severity || '').toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-muted mt-1">{alert.description}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-muted">Catalogo de planos (PetShop CRM)</p>
          {isGlobalAdmin && (
            <button
              onClick={savePlans}
              disabled={savingPlans || schemaMissing}
              className="btn btn-primary gap-2"
            >
              {savingPlans ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar precos
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-muted">
          Regras sugeridas de governanca: <span className="text-text font-semibold">Start/Pro sem IA</span>, Prime/Elite com cota mensal e custo operacional estimado para leitura de margem.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const draft = planDrafts[plan.id] || {}
            const limits = normalizePlanLimits({
              ...(plan.limits || {}),
              users: asNumber(draft.users, asNumber(plan?.limits?.users, 0)),
              bots: asNumber(draft.bots, asNumber(plan?.limits?.bots, 0)),
              ai_enabled: Boolean(draft.ai_enabled),
              ai_messages: asNumber(draft.ai_messages, asNumber(plan?.limits?.ai_messages, 0)),
              support_cost_brl: asNumber(draft.support_cost_brl, asNumber(plan?.limits?.support_cost_brl, 0)),
              infra_cost_brl: asNumber(draft.infra_cost_brl, asNumber(plan?.limits?.infra_cost_brl, 0)),
              ai_unit_cost_brl: asNumber(draft.ai_unit_cost_brl, asNumber(plan?.limits?.ai_unit_cost_brl, 0)),
            }, plan.limits || {})
            const monthlyPrice = asNumber(draft.monthly_price, plan.monthly_price || 0)
            const aiEstimatedCost = limits.ai_enabled ? Number(limits.ai_messages || 0) * Number(limits.ai_unit_cost_brl || 0) : 0
            const operationalCost = Number(limits.support_cost_brl || 0) + Number(limits.infra_cost_brl || 0) + aiEstimatedCost
            const grossMargin = monthlyPrice - operationalCost
            const grossMarginPct = monthlyPrice > 0 ? (grossMargin / monthlyPrice) * 100 : 0

            return (
              <div
                key={plan.id}
                className={`rounded-3xl border p-5 ${
                  draft.highlighted
                    ? 'border-[var(--primary)] bg-[var(--primary-bg-light)]'
                    : 'border-white/10 bg-card'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="font-display font-bold text-xl text-text">{plan.name}</p>
                  {plan.badge && <span className="badge badge-blue">{plan.badge}</span>}
                </div>
                <p className="text-sm text-muted mb-5 min-h-[44px]">{plan.subtitle}</p>

                <div className="space-y-3">
                  <div>
                    <label className="inp-label">Mensal (R$)</label>
                    <input
                      className="inp"
                      disabled={!isGlobalAdmin || schemaMissing}
                      value={draft.monthly_price ?? ''}
                      onChange={(event) => setPlanField(plan.id, 'monthly_price', event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="inp-label">Anual (R$)</label>
                    <input
                      className="inp"
                      disabled={!isGlobalAdmin || schemaMissing}
                      value={draft.yearly_price ?? ''}
                      onChange={(event) => setPlanField(plan.id, 'yearly_price', event.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="inp-label">Equipe inclusa</label>
                    <input
                      className="inp"
                      disabled={!isGlobalAdmin || schemaMissing}
                      type="number"
                      min="0"
                      value={draft.users ?? ''}
                      onChange={(event) => setPlanField(plan.id, 'users', event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="inp-label">Bots inclusos</label>
                    <input
                      className="inp"
                      disabled={!isGlobalAdmin || schemaMissing}
                      type="number"
                      min="0"
                      value={draft.bots ?? ''}
                      onChange={(event) => setPlanField(plan.id, 'bots', event.target.value)}
                    />
                  </div>
                  <div className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-xs text-muted space-y-2">
                    <label className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-text">IA habilitada no plano</span>
                      <input
                        type="checkbox"
                        disabled={!isGlobalAdmin || schemaMissing}
                        checked={Boolean(draft.ai_enabled)}
                        onChange={(event) => {
                          const checked = event.target.checked
                          setPlanField(plan.id, 'ai_enabled', checked)
                          if (!checked) setPlanField(plan.id, 'ai_messages', '0')
                        }}
                      />
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="inp-label">Mensagens IA / mes</label>
                        <input
                          className="inp"
                          disabled={!isGlobalAdmin || schemaMissing || !draft.ai_enabled}
                          type="number"
                          min="0"
                          value={draft.ai_messages ?? ''}
                          onChange={(event) => setPlanField(plan.id, 'ai_messages', event.target.value)}
                        />
                      </div>
                      <div>
                        <label className="inp-label">Custo unitario IA (R$)</label>
                        <input
                          className="inp"
                          disabled={!isGlobalAdmin || schemaMissing || !draft.ai_enabled}
                          type="number"
                          min="0"
                          step="0.001"
                          value={draft.ai_unit_cost_brl ?? ''}
                          onChange={(event) => setPlanField(plan.id, 'ai_unit_cost_brl', event.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="inp-label">Custo suporte (R$)</label>
                    <input
                      className="inp"
                      disabled={!isGlobalAdmin || schemaMissing}
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.support_cost_brl ?? ''}
                      onChange={(event) => setPlanField(plan.id, 'support_cost_brl', event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="inp-label">Custo infra (R$)</label>
                    <input
                      className="inp"
                      disabled={!isGlobalAdmin || schemaMissing}
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.infra_cost_brl ?? ''}
                      onChange={(event) => setPlanField(plan.id, 'infra_cost_brl', event.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-xs space-y-2">
                  <p className="text-muted">
                    Preco mensal: <span className="text-text font-semibold">{toCurrency(monthlyPrice)}</span>
                  </p>
                  <p className="text-muted">
                    Custo operacional estimado: <span className="text-text font-semibold">{toCurrency(operationalCost)}</span>
                  </p>
                  <p className={grossMargin >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                    Margem estimada: <span className="font-semibold">{toCurrency(grossMargin)}</span>
                    {' '}
                    ({grossMarginPct.toFixed(1)}%)
                  </p>
                  <p className="text-muted">
                    IA: {limits.ai_enabled ? `${Number(limits.ai_messages || 0)} msg/mes` : 'desabilitada neste plano'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="space-y-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-muted">Onboarding e assinatura por negocio</p>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {tenantRows.map(({ tenant, subscription, onboarding, usage }) => {
            const draft = tenantDrafts[tenant.id]
            if (!draft) return null

            const selectedPlan = plansById[draft.plan_id]
            const previewPrice = draft.billing_cycle === 'yearly'
              ? asNumber(selectedPlan?.yearly_price, selectedPlan?.monthly_price || 0)
              : asNumber(selectedPlan?.monthly_price, 0)
            const usageLimit = asNumber(usage?.messages_limit, asNumber(selectedPlan?.limits?.ai_messages, 0))
            const usageUsed = asNumber(usage?.messages_used, 0)
            const usagePct = usageLimit > 0 ? (usageUsed / usageLimit) * 100 : 0
            const quotaBadge = usagePct >= 100 ? 'badge-red' : usagePct >= 80 ? 'badge-amber' : 'badge-green'

            return (
              <div key={tenant.id} className="bg-card border border-white/10 rounded-3xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-text flex items-center gap-2">
                      <Building2 size={15} className="text-[var(--primary)]" />
                      {tenant.name}
                    </p>
                    <p className="text-xs text-muted">{tenant.slug || tenant.id}</p>
                  </div>
                  <span className={`badge ${tenant.active ? 'badge-green' : 'badge-gray'}`}>
                    {tenant.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="inp-label">Plano</label>
                    <select
                      className="inp"
                      disabled={schemaMissing}
                      value={draft.plan_id}
                      onChange={(event) => {
                        const nextPlanId = event.target.value
                        setTenantField(tenant.id, 'plan_id', nextPlanId)
                        applyPlanTemplateToTenant(tenant.id, nextPlanId)
                      }}
                    >
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>{plan.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="inp-label">Status da assinatura</label>
                    <select
                      className="inp"
                      disabled={schemaMissing}
                      value={draft.status}
                      onChange={(event) => setTenantField(tenant.id, 'status', event.target.value)}
                    >
                      {SUBSCRIPTION_STATUSES.map((status) => (
                        <option key={status.id} value={status.id}>{status.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="inp-label">Ciclo de cobranca</label>
                    <select
                      className="inp"
                      disabled={schemaMissing}
                      value={draft.billing_cycle}
                      onChange={(event) => setTenantField(tenant.id, 'billing_cycle', event.target.value)}
                    >
                      <option value="monthly">Mensal</option>
                      <option value="yearly">Anual</option>
                    </select>
                  </div>
                  <div>
                    <label className="inp-label">Gateway (preparacao)</label>
                    <select
                      className="inp"
                      disabled={schemaMissing}
                      value={draft.payment_provider}
                      onChange={(event) => setTenantField(tenant.id, 'payment_provider', event.target.value)}
                    >
                      <option value="">Manual</option>
                      <option value="asaas">Asaas</option>
                      <option value="stripe">Stripe</option>
                      <option value="iugu">Iugu</option>
                      <option value="mercadopago">Mercado Pago</option>
                    </select>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-muted space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-text font-semibold">
                      Limites do plano: equipe {asNumber(selectedPlan?.limits?.users, 0)} | bots {asNumber(selectedPlan?.limits?.bots, 0)} | IA {toBool(selectedPlan?.limits?.ai_enabled, false) ? `${asNumber(selectedPlan?.limits?.ai_messages, 0)} msg/mes` : 'desabilitada'}
                    </p>
                    <button
                      onClick={() => applyPlanTemplateToTenant(tenant.id, draft.plan_id)}
                      className="btn btn-secondary btn-sm"
                      disabled={schemaMissing}
                    >
                      Aplicar template do plano
                    </button>
                  </div>
                  <p>
                    Custos base: suporte {toCurrency(asNumber(selectedPlan?.limits?.support_cost_brl, 0))} + infra {toCurrency(asNumber(selectedPlan?.limits?.infra_cost_brl, 0))}.
                  </p>
                </div>

                <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-text">Cobranca automatica</p>
                    <p className="text-xs text-muted">Quando habilitar o gateway, esse tenant ja esta pronto para auto-charge.</p>
                  </div>
                  <input
                    type="checkbox"
                    disabled={schemaMissing}
                    checked={Boolean(draft.auto_charge_enabled)}
                    onChange={(event) => setTenantField(tenant.id, 'auto_charge_enabled', event.target.checked)}
                  />
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="inp-label">Provider customer id</label>
                    <input
                      className="inp"
                      disabled={schemaMissing}
                      value={draft.provider_customer_id}
                      onChange={(event) => setTenantField(tenant.id, 'provider_customer_id', event.target.value)}
                      placeholder="cus_xxx / cli_xxx"
                    />
                  </div>
                  <div>
                    <label className="inp-label">Provider subscription id</label>
                    <input
                      className="inp"
                      disabled={schemaMissing}
                      value={draft.provider_subscription_id}
                      onChange={(event) => setTenantField(tenant.id, 'provider_subscription_id', event.target.value)}
                      placeholder="sub_xxx / ass_xxx"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="inp-label">Etapa onboarding</label>
                    <select
                      className="inp"
                      disabled={schemaMissing}
                      value={draft.stage}
                      onChange={(event) => setTenantField(tenant.id, 'stage', event.target.value)}
                    >
                      {ONBOARDING_STAGES.map((stage) => (
                        <option key={stage.id} value={stage.id}>{stage.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="inp-label">Status onboarding</label>
                    <select
                      className="inp"
                      disabled={schemaMissing}
                      value={draft.onboarding_status}
                      onChange={(event) => setTenantField(tenant.id, 'onboarding_status', event.target.value)}
                    >
                      {ONBOARDING_STATUSES.map((status) => (
                        <option key={status.id} value={status.id}>{status.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="inp-label">Progresso (%)</label>
                    <input
                      className="inp"
                      type="number"
                      min="0"
                      max="100"
                      disabled={schemaMissing}
                      value={draft.progress}
                      onChange={(event) => setTenantField(tenant.id, 'progress', asNumber(event.target.value, 0))}
                    />
                  </div>
                </div>

                <div>
                  <label className="inp-label">Observacoes internas</label>
                  <input
                    className="inp"
                    disabled={schemaMissing}
                    value={draft.notes}
                    onChange={(event) => setTenantField(tenant.id, 'notes', event.target.value)}
                    placeholder="Ex: aguardando certificado fiscal / aguardando assinatura do contrato"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs text-muted space-y-1">
                    <p className="flex items-center gap-2">
                      <CreditCard size={12} className="text-[var(--primary)]" />
                      Preco atual: <span className="font-semibold text-text">{toCurrency(previewPrice)}</span>
                    </p>
                    <p>
                      Ultima assinatura: {subscription?.updated_at ? new Date(subscription.updated_at).toLocaleString('pt-BR') : 'nao registrada'}
                    </p>
                    <p>
                      Ultimo onboarding: {onboarding?.updated_at ? new Date(onboarding.updated_at).toLocaleString('pt-BR') : 'nao registrado'}
                    </p>
                    <p className="flex items-center gap-2">
                      <Gauge size={12} className="text-cyan-300" />
                      IA no mes ({currentPeriodMonth}):{' '}
                      <span className="font-semibold text-text">
                        {usageUsed}/{usageLimit || 0}
                      </span>
                      <span className={`badge ${quotaBadge}`}>{usagePct.toFixed(0)}%</span>
                    </p>
                  </div>

                  <button
                    onClick={() => saveTenant(tenant.id)}
                    disabled={schemaMissing || savingTenant === tenant.id}
                    className="btn btn-primary gap-2"
                  >
                    {savingTenant === tenant.id ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                    Salvar negocio
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {tenantRows.length === 0 && (
          <div className="bg-card border border-white/10 rounded-3xl p-8 text-sm text-muted">
            Nenhum negocio encontrado para gerenciar.
          </div>
        )}
      </section>

      <section className="bg-card border border-white/10 rounded-3xl p-5 space-y-3">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-muted">Preparacao para auto-cobranca</p>
        <p className="text-sm text-muted">
          O banco ja ficou pronto para integrar gateway sem refatoracao: provider, customer id, subscription id e modo auto-charge por negocio.
          Quando voce fechar o provedor, a conexao entra direto nessa estrutura.
        </p>
        <div className="text-xs text-muted flex items-center gap-2">
          <ShieldCheck size={14} className="text-emerald-400" />
          Nenhuma credencial de gateway e gravada no frontend; apenas referencias de assinatura por tenant.
        </div>
        {schemaMissing && (
          <div className="text-xs text-amber-300 flex items-center gap-2">
            <AlertCircle size={14} />
            Execute o SQL de foundation para habilitar persistencia real.
          </div>
        )}
      </section>
    </div>
  )
}
