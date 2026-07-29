import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  PackageCheck,
  RefreshCw,
  Smartphone,
} from 'lucide-react'

import { useAuthCtx } from '../../../context/AuthContext'
import { useModuleCtx } from '../../../context/ModuleContext'
import { fmtCurrency, supabase } from '../../../lib/supabase'
import { useCatalogPlans } from '../hooks/useCatalogPlans'
import { normalizeCatalogPlanServices } from '../lib/catalogPlanServices'

const PAYMENT_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro', icon: Banknote },
  { value: 'debito', label: 'Débito', icon: CreditCard },
  { value: 'credito', label: 'Crédito', icon: CreditCard },
  { value: 'pix', label: 'Pix', icon: Smartphone },
]

const splitTotal = (splits = []) => splits.reduce(
  (sum, item) => sum + Math.max(0, Number(item.amount || 0)),
  0,
)

function planServiceLabel(service = {}) {
  return service.service_name
    || service.name
    || (service.service_type === 'motodog' ? 'MotoDog — buscar e levar' : service.service_type)
    || 'Serviço'
}

function normalizeSubscription(subscription = {}) {
  return {
    ...subscription,
    plan: {
      ...(subscription.subscription_plans || {}),
      services: normalizeCatalogPlanServices(subscription.subscription_plans?.services),
    },
    client: subscription.client || {},
  }
}

function ActivationCard({
  subscription,
  active,
  saving,
  error,
  paymentMethod,
  splitEnabled,
  splits,
  onOpen,
  onClose,
  onPaymentMethod,
  onSplitEnabled,
  onSplitChange,
  onConfirm,
}) {
  const total = Math.max(0, Number(subscription.plan.price || 0))
  const zeroTotal = total <= 0.005

  return (
    <article data-yuisync-subscription-checkout-id={subscription.id} className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-black text-text"><PackageCheck size={17} className="text-amber-400"/>{subscription.plan.name || 'Pacote'}</p>
          <p className="mt-1 text-sm font-semibold text-text">{subscription.client.pet_name || subscription.client.owner_name || 'Pet'} · Tutor: {subscription.client.owner_name || 'Cliente'}</p>
          <p className="text-xs text-muted">{subscription.client.phone || subscription.client.breed || 'Cliente sem contato informado'}</p>
        </div>
        <div className="text-right"><span className="badge badge-amber">Aguardando pagamento</span><p className="mt-2 font-display text-2xl font-black text-emerald-400">{fmtCurrency(total)}</p></div>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border2)] bg-white/[0.03] p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted">Benefícios liberados após o pagamento</p>
        <div className="mt-2 space-y-1.5">
          {subscription.plan.services.map((service) => <div key={service.service_type} className="flex items-start justify-between gap-3 text-sm"><span className="text-text">{planServiceLabel(service)}</span><strong className="shrink-0 text-emerald-400">{Number(service.qty_per_cycle || 0)}x</strong></div>)}
          {!subscription.plan.services.length && <p className="text-xs text-amber-200">Este plano ainda usa benefícios legados. O pagamento pode ser confirmado normalmente e o saldo antigo será preservado.</p>}
        </div>
      </div>

      {active ? (
        <div className="mt-4 space-y-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
          {!zeroTotal && (
            <>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted">Forma de pagamento do pacote</p>
                <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                  {PAYMENT_METHODS.map((method) => {
                    const Icon = method.icon
                    const selected = !splitEnabled && paymentMethod === method.value
                    return <button key={method.value} type="button" onClick={() => onPaymentMethod(method.value)} className={`rounded-xl border px-3 py-3 text-left text-xs font-bold transition-colors ${selected ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300' : 'border-[var(--border2)] bg-white/[0.03] text-muted hover:text-text'}`}><Icon size={15} className="mb-2"/>{method.label}</button>
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-text"><input type="checkbox" checked={splitEnabled} onChange={(event) => onSplitEnabled(event.target.checked)}/> Dividir pagamento em duas formas</label>
              {splitEnabled && (
                <div className="grid gap-3 md:grid-cols-2">
                  {splits.map((split, index) => <div key={index} className="grid grid-cols-[1fr_120px] gap-2"><select className="inp" value={split.method} onChange={(event) => onSplitChange(index, 'method', event.target.value)}>{PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select><input className="inp" type="number" min="0" step="0.01" value={split.amount} onChange={(event) => onSplitChange(index, 'amount', event.target.value)} placeholder="0,00"/></div>)}
                  <p className="text-xs text-muted md:col-span-2">Informado: {fmtCurrency(splitTotal(splits))} · Pacote: {fmtCurrency(total)}</p>
                </div>
              )}
            </>
          )}
          {zeroTotal && <p className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">Pacote de cortesia. A confirmação ativa os benefícios sem gerar cobrança.</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2"><button type="button" onClick={onClose} className="btn btn-secondary flex-1 justify-center">Cancelar</button><button type="button" onClick={onConfirm} disabled={saving} className="btn btn-primary flex-1 justify-center"><CheckCircle2 size={15}/>{saving ? 'Ativando...' : zeroTotal ? 'Ativar cortesia' : 'Confirmar e ativar pacote'}</button></div>
        </div>
      ) : (
        <button type="button" onClick={onOpen} className="btn btn-primary mt-4 w-full justify-center"><CreditCard size={15}/> Receber e ativar pacote</button>
      )}
    </article>
  )
}

export default function PackageActivationReliablePanel({ onChanged }) {
  const { activeTenantId } = useAuthCtx()
  const { activeModuleId } = useModuleCtx()
  const { loadSubscriptions } = useCatalogPlans()
  const moduleId = activeModuleId || 'petshop'
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('dinheiro')
  const [splitEnabled, setSplitEnabled] = useState(false)
  const [splits, setSplits] = useState([{ method: 'dinheiro', amount: '' }, { method: 'pix', amount: '' }])
  const [saving, setSaving] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')

  const focusId = typeof window === 'undefined' ? '' : window.sessionStorage.getItem('yuisync:subscription-focus') || ''

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const rows = await loadSubscriptions()
      const pending = (rows || [])
        .filter((subscription) => subscription.status === 'pending_payment')
        .map(normalizeSubscription)
        .sort((left, right) => {
          if (String(left.id) === String(focusId)) return -1
          if (String(right.id) === String(focusId)) return 1
          return new Date(left.created_at || 0) - new Date(right.created_at || 0)
        })
      setSubscriptions(pending)
      if (focusId && !pending.some((subscription) => String(subscription.id) === String(focusId))) {
        setLoadError('O pacote recém-criado não está mais como “Aguardando pagamento”. Atualize Planos para conferir o status da assinatura.')
      }
    } catch (error) {
      setSubscriptions([])
      setLoadError(error?.message || 'Não foi possível carregar os pacotes aguardando pagamento.')
    } finally {
      setLoading(false)
    }
  }, [focusId, loadSubscriptions])

  useEffect(() => { void reload() }, [reload])

  useEffect(() => {
    if (!focusId || loading) return
    const node = document.querySelector(`[data-yuisync-subscription-checkout-id="${focusId}"]`)
    node?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }, [focusId, loading, subscriptions])

  const pendingTotal = useMemo(() => subscriptions.reduce((sum, subscription) => sum + Number(subscription.plan.price || 0), 0), [subscriptions])

  function open(subscription) {
    const total = Math.max(0, Number(subscription.plan.price || 0))
    setActiveId(subscription.id)
    setPaymentMethod('dinheiro')
    setSplitEnabled(false)
    setCheckoutError('')
    setSplits([{ method: 'dinheiro', amount: total > 0 ? total.toFixed(2) : '' }, { method: 'pix', amount: '' }])
  }

  function updateSplit(index, key, value) {
    setSplits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item))
  }

  async function confirm(subscription) {
    if (!activeTenantId) return setCheckoutError('Selecione uma empresa ativa antes de receber o pacote.')
    const total = Math.max(0, Number(subscription.plan.price || 0))
    setSaving(true)
    setCheckoutError('')
    try {
      const paymentSplits = splitEnabled
        ? splits.filter((item) => Number(item.amount || 0) > 0).map((item, index) => ({ method: item.method, amount: Number(item.amount), position: index + 1 }))
        : []
      if (total > 0.005 && splitEnabled && Math.abs(splitTotal(paymentSplits) - total) > 0.01) throw new Error('Os pagamentos divididos precisam fechar exatamente o preço do pacote.')

      const response = await supabase.rpc('checkout_petshop_subscription_transaction', {
        p_payload: {
          tenant_id: activeTenantId,
          module_id: moduleId,
          subscription_id: subscription.id,
          payment_method: total <= 0.005 ? 'cortesia' : paymentMethod,
          payment_splits: paymentSplits,
          notes: 'Ativação confirmada em Ordens / Banho & Tosa',
        },
      })
      if (response.error) throw response.error

      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('yuisync:subscription-focus')
        window.sessionStorage.removeItem('yuisync:orders-tab')
      }
      setActiveId(null)
      await reload()
      await onChanged?.()
    } catch (error) {
      const message = String(error?.message || '')
      setCheckoutError(message.includes('checkout_petshop_subscription_transaction')
        ? 'A migration de checkout do pacote não foi encontrada no banco.'
        : message || 'Não foi possível ativar o pacote.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4 border-b border-[var(--border)] pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-lg font-black text-text"><PackageCheck size={18} className="text-amber-400"/> Pacotes aguardando pagamento</h3><p className="mt-1 text-sm text-muted">Carregado pela mesma fonte da tela de Planos. O saldo só é liberado após a confirmação.</p></div>
        <div className="flex items-center gap-3"><div className="text-right"><p className="text-[10px] font-black uppercase tracking-widest text-muted">A receber</p><p className="font-display text-xl font-black text-amber-400">{fmtCurrency(pendingTotal)}</p></div><button type="button" onClick={() => void reload()} className="btn btn-secondary btn-icon" title="Atualizar pacotes"><RefreshCw size={15}/></button></div>
      </div>

      {loadError && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{loadError}</p>}
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted"><RefreshCw size={15} className="animate-spin"/> Carregando pacotes...</div>
      ) : subscriptions.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {subscriptions.map((subscription) => <ActivationCard key={subscription.id} subscription={subscription} active={activeId === subscription.id} saving={saving && activeId === subscription.id} error={activeId === subscription.id ? checkoutError : ''} paymentMethod={paymentMethod} splitEnabled={splitEnabled} splits={splits} onOpen={() => open(subscription)} onClose={() => { setActiveId(null); setCheckoutError('') }} onPaymentMethod={setPaymentMethod} onSplitEnabled={setSplitEnabled} onSplitChange={updateSplit} onConfirm={() => void confirm(subscription)}/>)}
        </div>
      ) : !loadError ? (
        <div className="rounded-xl border border-dashed border-[var(--border2)] px-4 py-6 text-center text-sm text-muted">Nenhum pacote aguardando pagamento.</div>
      ) : null}
    </section>
  )
}
