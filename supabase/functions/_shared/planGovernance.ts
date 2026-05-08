import { getAdminSupabase } from './supabaseClient.ts'

const TZ = 'America/Sao_Paulo'

type PlanLimits = {
  ai_enabled?: boolean
  ai_messages?: number
}

type CompanyScope = {
  id: string
  name: string
  tenant_id: string | null
  module_id: string
}

export type PlanGovernanceResult = {
  allowed: boolean
  reason:
    | 'ok'
    | 'company_not_found'
    | 'missing_subscription'
    | 'missing_plan'
    | 'ai_disabled'
    | 'quota_reached'
    | 'quota_unavailable'
  message: string
  plan_id?: string | null
  plan_name?: string | null
  used?: number
  limit?: number
  remaining?: number
  period_month?: string
}

type ConsumeQuotaResponse = {
  allowed?: boolean
  reason?: string
  used?: number
  limit?: number
  remaining?: number
  period_month?: string
}

function toMonthStartSaoPaulo(): string {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: TZ })
  return `${today.slice(0, 7)}-01`
}

function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === '1' || normalized === 'yes'
  }
  return false
}

function toInt(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback
}

async function loadCompanyScope(companyId: string): Promise<CompanyScope | null> {
  const supabase = getAdminSupabase()
  const response = await supabase
    .from('companies')
    .select('id,name,tenant_id,module_id')
    .eq('id', companyId)
    .maybeSingle()

  if (response.error || !response.data) return null

  return {
    id: response.data.id,
    name: response.data.name || 'Empresa',
    tenant_id: response.data.tenant_id || null,
    module_id: response.data.module_id || 'petshop',
  }
}

export async function enforcePlanGovernanceForAi(companyId: string): Promise<PlanGovernanceResult> {
  const scope = await loadCompanyScope(companyId)
  if (!scope) {
    return {
      allowed: false,
      reason: 'company_not_found',
      message: 'Empresa alvo da IA nao foi encontrada.',
    }
  }

  if (!scope.tenant_id) {
    return {
      allowed: true,
      reason: 'ok',
      message: 'Empresa sem tenant vinculado. Governanca de plano foi ignorada para ambiente de bootstrap.',
      plan_id: null,
      plan_name: 'Bootstrap',
    }
  }

  const supabase = getAdminSupabase()

  const subscriptionResponse = await supabase
    .from('tenant_subscriptions')
    .select('plan_id,status')
    .eq('tenant_id', scope.tenant_id)
    .eq('module_id', scope.module_id)
    .in('status', ['active', 'trialing'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (subscriptionResponse.error || !subscriptionResponse.data?.plan_id) {
    return {
      allowed: false,
      reason: 'missing_subscription',
      message: 'Este negocio nao possui assinatura ativa para IA. Ative um plano compatível no Comercial.',
    }
  }

  const planId = subscriptionResponse.data.plan_id

  const planResponse = await supabase
    .from('platform_plan_catalog')
    .select('id,name,limits,active')
    .eq('id', planId)
    .maybeSingle()

  if (planResponse.error || !planResponse.data) {
    return {
      allowed: false,
      reason: 'missing_plan',
      message: 'Plano vinculado nao foi encontrado no catalogo da plataforma.',
      plan_id: planId,
    }
  }

  const planName = planResponse.data.name || planId
  const limits = (planResponse.data.limits || {}) as PlanLimits
  const aiLimit = toInt(limits.ai_messages, 0)
  const aiEnabled = toBool(limits.ai_enabled) && aiLimit > 0

  if (!aiEnabled) {
    return {
      allowed: false,
      reason: 'ai_disabled',
      message: `O plano ${planName} nao inclui IA. Faça upgrade para um plano com IA para liberar respostas automáticas.`,
      plan_id: planId,
      plan_name: planName,
      used: 0,
      limit: aiLimit,
      remaining: 0,
    }
  }

  const periodMonth = toMonthStartSaoPaulo()

  const quotaResponse = await supabase.rpc('yui_consume_ai_quota', {
    p_tenant_id: scope.tenant_id,
    p_module_id: scope.module_id,
    p_plan_id: planId,
    p_period_month: periodMonth,
    p_increment: 1,
    p_messages_limit: aiLimit,
    p_company_id: scope.id,
  })

  if (quotaResponse.error) {
    return {
      allowed: false,
      reason: 'quota_unavailable',
      message: 'Governanca de IA ainda nao foi ativada no banco. Rode o SQL de governanca para liberar controle de cota.',
      plan_id: planId,
      plan_name: planName,
      limit: aiLimit,
      remaining: aiLimit,
    }
  }

  const quota = (quotaResponse.data || {}) as ConsumeQuotaResponse
  const allowed = Boolean(quota.allowed)
  const used = toInt(quota.used, 0)
  const limit = toInt(quota.limit, aiLimit)
  const remaining = toInt(quota.remaining, Math.max(0, limit - used))

  if (!allowed) {
    return {
      allowed: false,
      reason: 'quota_reached',
      message: `Limite mensal de IA atingido para o plano ${planName}. Uso atual: ${used}/${limit}.`,
      plan_id: planId,
      plan_name: planName,
      used,
      limit,
      remaining,
      period_month: quota.period_month || periodMonth,
    }
  }

  return {
    allowed: true,
    reason: 'ok',
    message: 'Consumo de IA autorizado.',
    plan_id: planId,
    plan_name: planName,
    used,
    limit,
    remaining,
    period_month: quota.period_month || periodMonth,
  }
}
