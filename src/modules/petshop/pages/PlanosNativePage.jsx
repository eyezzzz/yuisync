import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bike,
  CalendarClock,
  CreditCard,
  PackageCheck,
  PawPrint,
  PencilLine,
  Plus,
  RefreshCw,
  Repeat2,
  Save,
  Search,
  ShieldAlert,
  Trash2,
  UserRoundSearch,
  X,
} from 'lucide-react'

import { useAuthCtx } from '../../../context/AuthContext'
import { useModuleCtx } from '../../../context/ModuleContext'
import { fmtCurrency, supabase } from '../../../lib/supabase'
import { applyTenantFilter, runWithTenantFallback } from '../../../lib/tenant'
import { useClients } from '../../../shared/hooks/useClients'
import { useCatalogPlans } from '../hooks/useCatalogPlans'
import { usePetshopAdvanced, BILLING_CYCLES } from '../hooks/usePetshopAdvanced'
import {
  MOTODOG_PLAN_SERVICE,
  buildCatalogUsageSummary,
  catalogServiceMap,
  isRealCatalogPlanService,
  normalizeCatalogPlanServices,
  planEntryForCatalogService,
  planServiceLabel,
} from '../lib/catalogPlanServices'
import { buildEditableUsage, clampSubscriptionUsage } from '../lib/subscriptionUsageAdmin'

const STATUS_META = {
  active: { label: 'Ativa', badge: 'badge-green' },
  paused: { label: 'Pausada', badge: 'badge-gray' },
  cancelled: { label: 'Cancelada', badge: 'badge-red' },
  pending_payment: { label: 'Aguardando pagamento', badge: 'badge-amber' },
}

function normalize(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchesWords(text, query) {
  const haystack = normalize(text)
  const words = normalize(query).split(' ').filter(Boolean)
  return words.every((word) => haystack.includes(word))
}

function enrichPlanServices(services, catalogServices) {
  const catalog = catalogServiceMap(catalogServices)
  return normalizeCatalogPlanServices(services).map((service) => {
    const realService = catalog.get(service.service_code || service.service_type)
    if (!realService) return service
    return {
      ...service,
      service_type: realService.code,
      service_code: realService.code,
      service_name: realService.name,
      service_kind: 'catalog',
      group_type: realService.group_type || service.group_type,
    }
  })
}

function nextAvailableEntry(currentServices, catalogServices) {
  const used = new Set(currentServices.map((service) => service.service_type))
  const firstCatalog = catalogServices.find((service) => !used.has(service.code))
  if (firstCatalog) return planEntryForCatalogService(firstCatalog, 1)
  if (!used.has('motodog')) return { ...MOTODOG_PLAN_SERVICE }
  return null
}

function PlanModal({ plan, catalogServices, onClose, onSave }) {
  const catalog = useMemo(() => catalogServiceMap(catalogServices), [catalogServices])
  const [form, setForm] = useState(() => {
    const existing = enrichPlanServices(plan?.services || [], catalogServices)
    return {
      name: plan?.name || '',
      price: plan?.price || 0,
      billing_cycle: plan?.billing_cycle || 'monthly',
      active: plan?.active !== false,
      services: existing.length ? existing : [planEntryForCatalogService(catalogServices[0], 4)].filter(Boolean),
    }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const updateServiceType = (index, serviceType) => {
    setForm((current) => ({
      ...current,
      services: current.services.map((service, serviceIndex) => {
        if (serviceIndex !== index) return service
        const quantity = Math.max(1, Number(service.qty_per_cycle || 1))
        if (serviceType === 'motodog') return { ...MOTODOG_PLAN_SERVICE, qty_per_cycle: quantity }
        return planEntryForCatalogService(catalog.get(serviceType), quantity) || service
      }),
    }))
  }

  const addService = () => {
    setForm((current) => {
      const entry = nextAvailableEntry(current.services, catalogServices)
      return entry ? { ...current, services: [...current.services, entry] } : current
    })
  }

  async function submit() {
    const services = enrichPlanServices(form.services, catalogServices)
    const invalid = services.filter((service) => service.service_kind === 'catalog' && !isRealCatalogPlanService(service, catalogServices))
    if (!form.name.trim()) return setError('Informe o nome de identificação do pacote.')
    if (!services.length) return setError('Adicione pelo menos um serviço real ou MotoDog.')
    if (invalid.length) return setError('Associe todos os itens a serviços reais do catálogo.')
    if (new Set(services.map((service) => service.service_type)).size !== services.length) return setError('O mesmo serviço não pode aparecer duas vezes.')

    setSaving(true)
    setError('')
    try {
      await onSave({ id: plan?.id, ...form, services })
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Não foi possível salvar o pacote.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box max-w-3xl">
        <div className="modal-header">
          <div>
            <h2 className="font-display text-xl font-bold text-text">{plan ? 'Editar pacote' : 'Novo pacote'}</h2>
            <p className="mt-1 text-sm text-muted">Defina os serviços reais que serão consumidos na Agenda.</p>
          </div>
          <button type="button" aria-label="Fechar plano" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>
        <div className="modal-body space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="inp-label">Nome de identificação</label><input className="inp" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}/></div>
            <div><label className="inp-label">Preço do pacote</label><input className="inp" type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}/></div>
            <div><label className="inp-label">Ciclo</label><select className="inp" value={form.billing_cycle} onChange={(event) => setForm((current) => ({ ...current, billing_cycle: event.target.value }))}>{Object.entries(BILLING_CYCLES).map(([value, metadata]) => <option key={value} value={value}>{metadata.label}</option>)}</select></div>
            <label className="mt-7 flex items-center gap-3 text-sm text-text"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}/> Pacote disponível para venda</label>
          </div>

          <section className="rounded-2xl border border-[var(--border)] bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div><p className="font-bold text-text">Serviços incluídos</p><p className="mt-1 text-xs text-muted">Cada item usa o código real do catálogo.</p></div>
              <button type="button" onClick={addService} className="btn btn-secondary btn-sm"><Plus size={13}/> Adicionar serviço</button>
            </div>
            <div className="mt-4 space-y-3">
              {form.services.map((service, index) => {
                const legacy = service.service_kind === 'catalog' && !catalog.has(service.service_type)
                return (
                  <div key={`${service.service_type}-${index}`} className={`grid gap-3 rounded-xl border p-3 md:grid-cols-[minmax(0,1fr)_120px_42px] ${legacy ? 'border-amber-500/35 bg-amber-500/8' : 'border-[var(--border2)] bg-surface/70'}`}>
                    <div><label className="inp-label">Serviço real</label><select className="inp" value={service.service_type} onChange={(event) => updateServiceType(index, event.target.value)}>{legacy && <option value={service.service_type}>Legado: {service.service_name}</option>}<optgroup label="Catálogo">{catalogServices.map((item) => <option key={item.code} value={item.code}>{item.name} · {fmtCurrency(item.default_price || 0)}</option>)}</optgroup><optgroup label="Transporte"><option value="motodog">MotoDog - buscar e levar</option></optgroup></select></div>
                    <div><label className="inp-label">Por ciclo</label><input className="inp" type="number" min="1" value={service.qty_per_cycle} onChange={(event) => setForm((current) => ({ ...current, services: current.services.map((item, itemIndex) => itemIndex === index ? { ...item, qty_per_cycle: Math.max(1, Number(event.target.value || 1)) } : item) }))}/></div>
                    <button type="button" aria-label="Remover serviço" onClick={() => setForm((current) => ({ ...current, services: current.services.filter((_, itemIndex) => itemIndex !== index) }))} className="btn btn-danger btn-sm mt-6 justify-center"><Trash2 size={13}/></button>
                  </div>
                )
              })}
            </div>
          </section>

          {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}
          <div className="flex gap-3"><button type="button" onClick={onClose} className="btn btn-secondary flex-1 justify-center">Cancelar</button><button type="button" disabled={saving} onClick={submit} className="btn btn-primary flex-1 justify-center">{saving ? 'Salvando...' : 'Salvar pacote'}</button></div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ClientPicker({ clients, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = clients.find((client) => String(client.id) === String(value))
  const filtered = useMemo(() => clients
    .filter((client) => matchesWords([client.pet_name, client.owner_name, client.phone, client.email].filter(Boolean).join(' '), search))
    .slice(0, 30), [clients, search])

  return (
    <div className="relative">
      <label className="inp-label">Cliente / pet</label>
      <button type="button" onClick={() => setOpen((current) => !current)} className="inp flex min-h-12 w-full items-center justify-between gap-3 text-left">
        <span className="min-w-0"><span className="block truncate font-semibold text-text">{selected ? (selected.pet_name || selected.owner_name) : 'Pesquisar cliente ou pet'}</span>{selected && <span className="block truncate text-xs text-muted">{selected.owner_name}{selected.phone ? ` · ${selected.phone}` : ''}</span>}</span>
        <UserRoundSearch size={17} className="shrink-0 text-muted"/>
      </button>
      {open && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-[var(--border2)] bg-surface shadow-2xl">
          <div className="relative border-b border-[var(--border2)] p-2"><Search size={14} className="absolute left-5 top-1/2 -translate-y-1/2 text-muted"/><input autoFocus className="inp pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Digite tutor, pet ou telefone..."/></div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.map((client) => <button key={client.id} type="button" onClick={() => { onChange(client.id); setOpen(false); setSearch('') }} className="block w-full border-b border-[var(--border2)] px-4 py-3 text-left last:border-b-0 hover:bg-white/5"><span className="block font-semibold text-text">{client.pet_name || client.owner_name}</span><span className="block text-xs text-muted">{client.owner_name}{client.phone ? ` · ${client.phone}` : ''}</span></button>)}
            {!filtered.length && <p className="px-4 py-6 text-center text-sm text-muted">Nenhum cliente encontrado.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function SubscriptionSaleModal({ plans, clients, catalogServices, onClose, onSave }) {
  const [form, setForm] = useState({ plan_id: plans[0]?.id || '', client_id: '', started_at: new Date().toISOString().slice(0, 10) })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const selectedPlan = plans.find((plan) => plan.id === form.plan_id)

  async function submit() {
    if (!form.client_id) return setError('Selecione o cliente ou pet.')
    setSaving(true)
    setError('')
    try {
      await onSave({ ...form, status: 'active', plan: selectedPlan, billing_cycle: selectedPlan?.billing_cycle })
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Não foi possível iniciar a venda do pacote.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box max-w-xl">
        <div className="modal-header"><div><h2 className="font-display text-xl font-bold text-text">Vender pacote ao cliente</h2><p className="mt-1 text-sm text-muted">Os benefícios só serão liberados depois do pagamento.</p></div><button type="button" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button></div>
        <div className="modal-body space-y-5">
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">Ao continuar, o pacote irá para <strong>Ordens / Entrega → Banho & Tosa</strong> como aguardando pagamento.</div>
          <div><label className="inp-label">Pacote</label><select className="inp" value={form.plan_id} onChange={(event) => setForm((current) => ({ ...current, plan_id: event.target.value }))}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} - {fmtCurrency(plan.price)}</option>)}</select></div>
          <ClientPicker clients={clients} value={form.client_id} onChange={(clientId) => setForm((current) => ({ ...current, client_id: clientId }))}/>
          <div><label className="inp-label">Data da venda</label><input className="inp" type="date" value={form.started_at} onChange={(event) => setForm((current) => ({ ...current, started_at: event.target.value }))}/></div>
          {selectedPlan && <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4"><p className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">Cobertura do pacote</p><div className="mt-3 space-y-2">{selectedPlan.services.map((service) => <div key={service.service_type} className="flex justify-between gap-3 text-sm"><span className="text-text">{planServiceLabel(service, catalogServices)}</span><strong className="text-emerald-400">{service.qty_per_cycle}x</strong></div>)}</div><div className="mt-4 flex justify-between border-t border-emerald-500/20 pt-3"><span className="font-semibold text-text">Valor para pagamento</span><strong className="text-lg text-emerald-400">{fmtCurrency(selectedPlan.price)}</strong></div></div>}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3"><button type="button" onClick={onClose} className="btn btn-secondary flex-1 justify-center">Cancelar</button><button type="button" disabled={saving} onClick={submit} className="btn btn-primary flex-1 justify-center">{saving ? 'Preparando...' : 'Continuar para pagamento'}</button></div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function UsageEditModal({ subscription, onClose, onSave }) {
  const items = useMemo(() => buildEditableUsage(subscription), [subscription])
  const [values, setValues] = useState(() => Object.fromEntries(items.map((item) => [item.service_type, item.used])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setSaving(true)
    setError('')
    try {
      await onSave(subscription, values)
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Não foi possível salvar o consumo.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box max-w-xl">
        <div className="modal-header"><div><h2 className="font-display text-xl font-bold text-text">Editar consumo do pacote</h2><p className="mt-1 text-sm text-muted">{subscription.client?.pet_name || subscription.client?.owner_name} · {subscription.subscription_plans?.name}</p></div><button type="button" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button></div>
        <div className="modal-body space-y-4">
          <p className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"><ShieldAlert size={16} className="mt-0.5 shrink-0"/> Reduzir o consumo libera saldo novamente. O histórico dos agendamentos não será apagado.</p>
          {items.map((item) => <div key={item.service_type} className="grid grid-cols-[minmax(0,1fr)_120px] items-end gap-3 rounded-xl border border-[var(--border2)] bg-surface/70 p-4"><div><p className="font-semibold text-text">{item.service_name}</p><p className="mt-1 text-xs text-muted">Limite: {item.total} por ciclo</p></div><div><label className="inp-label">Utilizados</label><input className="inp" type="number" min="0" max={item.total} value={values[item.service_type] ?? 0} onChange={(event) => setValues((current) => ({ ...current, [item.service_type]: event.target.value }))}/></div></div>)}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3"><button type="button" onClick={onClose} className="btn btn-secondary flex-1 justify-center">Cancelar</button><button type="button" disabled={saving || !items.length} onClick={submit} className="btn btn-primary flex-1 justify-center"><Save size={15}/> {saving ? 'Salvando...' : 'Salvar consumo'}</button></div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function CancelSubscriptionModal({ subscription, onClose, onConfirm }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit() {
    setSaving(true)
    setError('')
    try { await onConfirm(subscription); onClose() } catch (submitError) { setError(submitError?.message || 'Não foi possível cancelar a assinatura.') } finally { setSaving(false) }
  }
  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && onClose()}><div className="modal-box max-w-md"><div className="modal-header"><h2 className="font-display text-xl font-bold text-text">Cancelar assinatura</h2><button type="button" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button></div><div className="modal-body space-y-4"><p className="text-sm text-text">Cancelar <strong>{subscription.subscription_plans?.name}</strong> de <strong>{subscription.client?.pet_name || subscription.client?.owner_name}</strong>?</p><p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">O pacote deixará de aparecer na Agenda e não poderá reservar novos benefícios.</p>{error && <p className="text-sm text-red-400">{error}</p>}<div className="flex gap-3"><button type="button" onClick={onClose} className="btn btn-secondary flex-1 justify-center">Voltar</button><button type="button" disabled={saving} onClick={submit} className="btn btn-danger flex-1 justify-center">{saving ? 'Cancelando...' : 'Confirmar cancelamento'}</button></div></div></div></div>,
    document.body,
  )
}

export default function PlanosNativePage({ setPage }) {
  const { activeTenantId } = useAuthCtx()
  const { activeModuleId } = useModuleCtx()
  const moduleId = activeModuleId || 'petshop'
  const { clients, load: loadClients } = useClients()
  const { loadPetshopServices } = usePetshopAdvanced()
  const { loadPlans, savePlan, loadSubscriptions, saveSubscription } = useCatalogPlans()
  const [plans, setPlans] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [catalogServices, setCatalogServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [planModal, setPlanModal] = useState(null)
  const [saleModal, setSaleModal] = useState(false)
  const [editingUsage, setEditingUsage] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const runScoped = useCallback((runner) => runWithTenantFallback(activeTenantId, runner), [activeTenantId])

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [planRows, subscriptionRows, serviceRows] = await Promise.all([loadPlans(), loadSubscriptions(), loadPetshopServices()])
      setCatalogServices(serviceRows || [])
      setPlans((planRows || []).map((plan) => ({ ...plan, services: enrichPlanServices(plan.services, serviceRows || []) })))
      setSubscriptions(subscriptionRows || [])
    } catch (loadError) {
      setError(loadError?.message || 'Não foi possível carregar os planos.')
    } finally {
      setLoading(false)
    }
  }, [loadPetshopServices, loadPlans, loadSubscriptions])

  useEffect(() => { void loadClients(); void reload() }, [loadClients, reload])

  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === 'active')
  const activeByPlan = useMemo(() => activeSubscriptions.reduce((map, subscription) => ({ ...map, [subscription.plan_id]: (map[subscription.plan_id] || 0) + 1 }), {}), [activeSubscriptions])
  const filteredSubscriptions = useMemo(() => subscriptions.filter((subscription) => matchesWords([
    subscription.client?.pet_name,
    subscription.client?.owner_name,
    subscription.client?.phone,
    subscription.subscription_plans?.name,
  ].filter(Boolean).join(' '), search)), [search, subscriptions])

  async function handleSale(payload) {
    const subscription = await saveSubscription(payload)
    await reload()
    window.sessionStorage.setItem('yuisync:orders-tab', 'banho_tosa')
    if (subscription?.id) window.sessionStorage.setItem('yuisync:subscription-focus', subscription.id)
    setPage?.('ordens')
  }

  async function saveUsage(subscription, requested) {
    if (!activeTenantId) throw new Error('Selecione uma empresa ativa.')
    const servicesUsed = clampSubscriptionUsage(subscription, requested)
    const response = await runScoped(async (includeTenant) => {
      let query = supabase.from('client_subscriptions').update({ services_used: servicesUsed, updated_at: new Date().toISOString() }).eq('id', subscription.id).eq('module_id', moduleId)
      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return query.select('id').single()
    })
    if (response.error) throw response.error
    await reload()
  }

  async function cancelSubscription(subscription) {
    await saveSubscription({
      id: subscription.id,
      plan_id: subscription.plan_id,
      client_id: subscription.client_id,
      status: 'cancelled',
      started_at: subscription.started_at,
      next_billing_date: subscription.next_billing_date,
      services_used: subscription.services_used || {},
      billing_cycle: subscription.subscription_plans?.billing_cycle,
      plan: subscription.subscription_plans,
    })
    await reload()
  }

  return (
    <div className="page animate-fade-up space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="page-title flex items-center gap-2"><CreditCard size={22} className="text-emerald-400"/> Planos de Assinatura</h1><p className="page-sub">Venda, ativação, consumo e cancelamento no mesmo fluxo.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={reload} className="btn btn-secondary"><RefreshCw size={15}/> Atualizar</button><button type="button" onClick={() => setSaleModal(true)} className="btn btn-secondary"><Repeat2 size={15}/> Vender pacote</button><button type="button" onClick={() => setPlanModal({})} className="btn btn-primary"><Plus size={15}/> Novo pacote</button></div></div>

      <div className="grid gap-4 md:grid-cols-3"><div className="rounded-xl border border-[var(--border)] bg-card p-5"><p className="text-xs font-bold uppercase tracking-widest text-muted">Pacotes ativos</p><p className="mt-2 font-display text-3xl font-bold text-emerald-400">{plans.filter((plan) => plan.active).length}</p></div><div className="rounded-xl border border-[var(--border)] bg-card p-5"><p className="text-xs font-bold uppercase tracking-widest text-muted">Assinaturas ativas</p><p className="mt-2 font-display text-3xl font-bold text-text">{activeSubscriptions.length}</p></div><div className="rounded-xl border border-[var(--border)] bg-card p-5"><p className="text-xs font-bold uppercase tracking-widest text-muted">Aguardando pagamento</p><p className="mt-2 font-display text-3xl font-bold text-amber-400">{subscriptions.filter((subscription) => subscription.status === 'pending_payment').length}</p></div></div>

      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4"><p className="flex items-center gap-2 font-semibold text-text"><PackageCheck size={16} className="text-emerald-400"/> Pacote vendido antes do consumo</p><p className="mt-1 text-sm text-muted">A venda entra no caixa primeiro; a Agenda depois apenas reserva e consome os benefícios.</p></div>
      {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-3">{loading ? <p className="col-span-full py-10 text-center text-muted">Carregando pacotes...</p> : plans.map((plan) => <button key={plan.id} type="button" onClick={() => setPlanModal(plan)} className="rounded-2xl border border-[var(--border)] bg-card p-5 text-left transition-all hover:-translate-y-1 hover:border-emerald-400/30"><div className="flex justify-between gap-3"><div><p className="font-display text-xl font-bold text-text">{plan.name}</p><p className="mt-1 text-xs text-muted">{BILLING_CYCLES[plan.billing_cycle]?.label || plan.billing_cycle}</p></div><span className={`badge ${plan.active ? 'badge-green' : 'badge-gray'}`}>{plan.active ? 'Ativo' : 'Pausado'}</span></div><p className="mt-5 font-display text-3xl font-bold text-emerald-400">{fmtCurrency(plan.price)}</p><div className="mt-4 rounded-xl border border-[var(--border)] bg-surface/80 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-widest text-muted">Clientes ativos</p><p className="mt-1 text-lg font-semibold text-text">{activeByPlan[plan.id] || 0}</p></div><div className="mt-5 space-y-2 border-t border-[var(--border2)] pt-4">{plan.services.map((service) => <div key={service.service_type} className="flex justify-between gap-3 text-sm"><span className="text-text">{planServiceLabel(service, catalogServices)}</span><span className="text-muted">{service.qty_per_cycle}x</span></div>)}</div></button>)}</div>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border2)] px-5 py-4"><div className="flex items-center gap-2"><PawPrint size={16} className="text-emerald-400"/><h2 className="section-title">Assinantes</h2></div><label className="relative min-w-[260px] flex-1 md:max-w-lg"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"/><input className="inp pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar tutor, pet, telefone ou pacote..."/></label></div>
        <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Pet / Tutor</th><th>Pacote</th><th>Uso no ciclo</th><th>Renovação</th><th>Status</th><th>Ações</th></tr></thead><tbody>{filteredSubscriptions.map((subscription) => { const usage = buildCatalogUsageSummary(subscription, catalogServices); const status = STATUS_META[subscription.status] || { label: subscription.status, badge: 'badge-gray' }; const editable = ['active', 'paused'].includes(subscription.status); return <tr key={subscription.id} className={subscription.status === 'active' ? 'bg-emerald-500/5' : ''}><td><p className="font-semibold text-text">{subscription.client?.pet_name || subscription.client?.owner_name}</p><p className="text-xs text-muted">{subscription.client?.owner_name}</p></td><td><p className="font-semibold text-text">{subscription.subscription_plans?.name || '-'}</p><p className="text-xs text-muted">{fmtCurrency(subscription.subscription_plans?.price || 0)}</p></td><td><div className="flex max-w-xl flex-wrap gap-2">{usage.map((item) => <span key={item.service_type} className={`badge ${item.remaining > 0 ? 'badge-blue' : 'badge-gray'}`}>{item.label}: {item.used}/{item.total}</span>)}</div></td><td><div className="flex items-center gap-2"><CalendarClock size={14} className="text-amber-400"/><span className="text-sm text-text">{subscription.next_billing_date || '-'}</span></div></td><td><span className={`badge ${status.badge}`}>{status.label}</span></td><td><div className="flex flex-wrap gap-2"><button type="button" disabled={!editable} onClick={() => setEditingUsage(subscription)} className="btn btn-secondary btn-sm whitespace-nowrap"><PencilLine size={13}/> Editar consumo</button>{subscription.status !== 'cancelled' && <button type="button" onClick={() => setCancelling(subscription)} className="btn btn-danger btn-sm whitespace-nowrap"><X size={13}/> Cancelar</button>}</div></td></tr> })}{!filteredSubscriptions.length && <tr><td colSpan={6} className="py-10 text-center text-muted">{search ? 'Nenhum assinante encontrado.' : 'Nenhuma assinatura cadastrada.'}</td></tr>}</tbody></table></div>
      </section>

      {planModal !== null && <PlanModal plan={planModal.id ? planModal : null} catalogServices={catalogServices} onClose={() => setPlanModal(null)} onSave={async (payload) => { await savePlan(payload); await reload() }}/>} 
      {saleModal && <SubscriptionSaleModal plans={plans.filter((plan) => plan.active)} clients={clients} catalogServices={catalogServices} onClose={() => setSaleModal(false)} onSave={handleSale}/>} 
      {editingUsage && <UsageEditModal subscription={editingUsage} onClose={() => setEditingUsage(null)} onSave={saveUsage}/>} 
      {cancelling && <CancelSubscriptionModal subscription={cancelling} onClose={() => setCancelling(null)} onConfirm={cancelSubscription}/>} 
    </div>
  )
}
