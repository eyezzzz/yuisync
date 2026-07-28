import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bike,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  PackageCheck,
  PawPrint,
  Plus,
  RefreshCw,
  Repeat2,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'

import { fmtCurrency } from '../../../lib/supabase'
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
    const fallback = existing.length
      ? existing
      : [planEntryForCatalogService(catalogServices[0], 4)].filter(Boolean)
    return {
      name: plan?.name || '',
      price: plan?.price || 0,
      billing_cycle: plan?.billing_cycle || 'monthly',
      active: plan?.active !== false,
      services: fallback,
    }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const updateServiceType = (index, serviceType) => {
    setForm((current) => ({
      ...current,
      services: current.services.map((service, serviceIndex) => {
        if (serviceIndex !== index) return service
        const qty = Math.max(1, Number(service.qty_per_cycle || 1))
        if (serviceType === 'motodog') return { ...MOTODOG_PLAN_SERVICE, qty_per_cycle: qty }
        return planEntryForCatalogService(catalog.get(serviceType), qty) || service
      }),
    }))
  }

  const updateQuantity = (index, quantity) => {
    setForm((current) => ({
      ...current,
      services: current.services.map((service, serviceIndex) => (
        serviceIndex === index
          ? { ...service, qty_per_cycle: Math.max(1, Number(quantity || 1)) }
          : service
      )),
    }))
  }

  const addService = () => {
    setForm((current) => {
      const entry = nextAvailableEntry(current.services, catalogServices)
      if (!entry) return current
      return { ...current, services: [...current.services, entry] }
    })
  }

  async function submit() {
    const services = enrichPlanServices(form.services, catalogServices)
    const legacy = services.filter((service) => (
      service.service_kind === 'catalog'
      && !isRealCatalogPlanService(service, catalogServices)
    ))
    if (!form.name.trim()) return setError('Informe o nome de identificação do pacote.')
    if (!services.length) return setError('Adicione pelo menos um serviço real ou MotoDog.')
    if (legacy.length) return setError('Associe todos os itens legados a serviços reais do catálogo antes de salvar.')
    if (new Set(services.map((service) => service.service_type)).size !== services.length) {
      return setError('O mesmo serviço não pode aparecer duas vezes no pacote.')
    }

    setSaving(true)
    setError('')
    try {
      await onSave({ id: plan?.id, ...form, services })
      onClose()
    } catch (submitError) {
      setError(submitError.message || 'Não foi possível salvar o plano.')
    } finally {
      setSaving(false)
    }
  }

  const allUsed = form.services.length >= catalogServices.length + 1

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box max-w-3xl">
        <div className="modal-header">
          <div>
            <h2 className="font-display font-bold text-xl text-text">{plan ? 'Editar pacote' : 'Novo pacote'}</h2>
            <p className="mt-1 text-sm text-muted">Selecione exatamente os serviços reais que serão abatidos na agenda.</p>
          </div>
          <button type="button" aria-label="Fechar plano" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>

        <div className="modal-body space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="inp-label">Nome de identificação</label>
              <input className="inp" placeholder="Ex.: Pacote Banho Básico" value={form.name} onChange={(event) => set('name', event.target.value)}/>
            </div>
            <div>
              <label className="inp-label">Preço do pacote</label>
              <input className="inp" type="number" min="0" step="0.01" value={form.price} onChange={(event) => set('price', event.target.value)}/>
            </div>
            <div>
              <label className="inp-label">Ciclo</label>
              <select className="inp" value={form.billing_cycle} onChange={(event) => set('billing_cycle', event.target.value)}>
                {Object.entries(BILLING_CYCLES).map(([value, metadata]) => (
                  <option key={value} value={value}>{metadata.label}</option>
                ))}
              </select>
            </div>
            <label className="mt-7 flex items-center gap-3 text-sm text-text">
              <input type="checkbox" checked={form.active} onChange={(event) => set('active', event.target.checked)}/>
              Pacote ativo
            </label>
          </div>

          <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-text">Serviços incluídos</p>
                <p className="mt-1 text-xs text-muted">A quantidade será reservada ao salvar o agendamento e consumida ao concluir.</p>
              </div>
              <button type="button" disabled={allUsed} onClick={addService} className="btn btn-secondary btn-sm">
                <Plus size={13}/> Adicionar serviço
              </button>
            </div>

            <div className="space-y-3">
              {form.services.map((service, index) => {
                const isLegacy = service.service_kind === 'catalog' && !catalog.has(service.service_type)
                const selectedCatalog = catalog.get(service.service_type)
                return (
                  <div key={`${service.service_type}-${index}`} className={`rounded-xl border p-3 ${isLegacy ? 'border-amber-500/35 bg-amber-500/8' : 'border-[var(--border2)] bg-surface/70'}`}>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_120px_44px]">
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted">Serviço real</label>
                        <select className="inp" value={service.service_type} onChange={(event) => updateServiceType(index, event.target.value)}>
                          {isLegacy && <option value={service.service_type}>Legado: {service.service_name || service.service_type}</option>}
                          <optgroup label="Catálogo de serviços">
                            {catalogServices.map((catalogService) => (
                              <option key={catalogService.code} value={catalogService.code}>
                                {catalogService.name} · {fmtCurrency(catalogService.default_price || 0)}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Transporte">
                            <option value="motodog">MotoDog - buscar e levar</option>
                          </optgroup>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted">Por ciclo</label>
                        <input className="inp" type="number" min="1" value={service.qty_per_cycle} onChange={(event) => updateQuantity(index, event.target.value)}/>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remover ${service.service_name || service.service_type}`}
                        title="Remover serviço"
                        onClick={() => setForm((current) => ({ ...current, services: current.services.filter((_, serviceIndex) => serviceIndex !== index) }))}
                        className="btn btn-danger btn-sm mt-5 justify-center"
                      >
                        <Trash2 size={13}/>
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      {service.service_type === 'motodog' ? (
                        <span className="badge badge-blue"><Bike size={10}/> Transporte separado do banho</span>
                      ) : selectedCatalog ? (
                        <>
                          <span className="badge badge-green">Código real: {selectedCatalog.code}</span>
                          <span className="badge badge-gray">{selectedCatalog.group_type === 'veterinaria' ? 'Veterinária' : 'Banho/Tosa'}</span>
                        </>
                      ) : (
                        <span className="badge badge-amber">Item legado: selecione um serviço real</span>
                      )}
                    </div>
                  </div>
                )
              })}
              {!form.services.length && (
                <div className="rounded-xl border border-dashed border-[var(--border2)] px-4 py-8 text-center text-sm text-muted">
                  Adicione os serviços que compõem este pacote.
                </div>
              )}
            </div>
          </section>

          {error && (
            <p className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <ShieldAlert size={14}/> {error}
            </p>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1 justify-center">Cancelar</button>
            <button type="button" onClick={submit} disabled={saving} className="btn btn-primary flex-1 justify-center">
              {saving ? 'Salvando...' : 'Salvar pacote'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function SubscriptionModal({ plans, clients, catalogServices, onClose, onSave }) {
  const [form, setForm] = useState({
    plan_id: plans[0]?.id || '',
    client_id: clients[0]?.id || '',
    status: 'active',
    started_at: new Date().toISOString().slice(0, 10),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const selectedPlan = plans.find((plan) => plan.id === form.plan_id)

  async function submit() {
    setSaving(true)
    setError('')
    try {
      await onSave({ ...form, plan: selectedPlan, billing_cycle: selectedPlan?.billing_cycle })
      onClose()
    } catch (submitError) {
      setError(submitError.message || 'Não foi possível salvar a assinatura.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box max-w-xl">
        <div className="modal-header">
          <h2 className="font-display font-bold text-xl text-text">Vincular pacote ao cliente</h2>
          <button type="button" aria-label="Fechar assinatura" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>
        <div className="modal-body space-y-5">
          <div>
            <label className="inp-label">Pacote</label>
            <select className="inp" value={form.plan_id} onChange={(event) => setForm((current) => ({ ...current, plan_id: event.target.value }))}>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} - {fmtCurrency(plan.price)}</option>)}
            </select>
          </div>
          <div>
            <label className="inp-label">Cliente / pet</label>
            <select className="inp" value={form.client_id} onChange={(event) => setForm((current) => ({ ...current, client_id: event.target.value }))}>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.pet_name || client.owner_name} - {client.owner_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="inp-label">Status</label>
              <select className="inp" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                <option value="active">Ativa</option>
                <option value="paused">Pausada</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>
            <div>
              <label className="inp-label">Início</label>
              <input className="inp" type="date" value={form.started_at} onChange={(event) => setForm((current) => ({ ...current, started_at: event.target.value }))}/>
            </div>
          </div>

          {selectedPlan && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">Cobertura real do pacote</p>
              <div className="mt-3 space-y-2">
                {selectedPlan.services.map((service) => (
                  <div key={service.service_type} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-text">{planServiceLabel(service, catalogServices)}</span>
                    <span className="shrink-0 font-semibold text-emerald-400">{service.qty_per_cycle}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1 justify-center">Cancelar</button>
            <button type="button" onClick={submit} disabled={saving} className="btn btn-primary flex-1 justify-center">{saving ? 'Salvando...' : 'Salvar assinatura'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function PlanosCatalogPage() {
  const { clients, load: loadClients } = useClients()
  const { loadPetshopServices } = usePetshopAdvanced()
  const { loadPlans, savePlan, loadSubscriptions, saveSubscription } = useCatalogPlans()
  const [plans, setPlans] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [catalogServices, setCatalogServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [planModal, setPlanModal] = useState(null)
  const [subscriptionModal, setSubscriptionModal] = useState(false)
  const [error, setError] = useState('')

  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === 'active')
  const renewalsToday = subscriptions.filter((subscription) => subscription.next_billing_date === new Date().toISOString().slice(0, 10)).length
  const activeByPlan = useMemo(() => activeSubscriptions.reduce((map, subscription) => {
    map[subscription.plan_id] = (map[subscription.plan_id] || 0) + 1
    return map
  }, {}), [activeSubscriptions])

  async function reload() {
    setLoading(true)
    setError('')
    try {
      const [planRows, subscriptionRows, catalogRows] = await Promise.all([
        loadPlans(),
        loadSubscriptions(),
        loadPetshopServices(),
      ])
      setCatalogServices(catalogRows)
      setPlans(planRows.map((plan) => ({ ...plan, services: enrichPlanServices(plan.services, catalogRows) })))
      setSubscriptions(subscriptionRows)
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar os pacotes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadClients()
    reload()
  }, [])

  async function handleSavePlan(payload) {
    await savePlan(payload)
    await reload()
  }

  async function handleSaveSubscription(payload) {
    await saveSubscription(payload)
    await reload()
  }

  return (
    <div className="page animate-fade-up space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><CreditCard size={22} className="text-emerald-400"/> Planos de Assinatura</h1>
          <p className="page-sub">Pacotes vinculados aos serviços reais do catálogo e destacados automaticamente na agenda.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={reload} className="btn btn-secondary"><RefreshCw size={15}/> Atualizar</button>
          <button type="button" onClick={() => setSubscriptionModal(true)} className="btn btn-secondary"><Repeat2 size={15}/> Nova assinatura</button>
          <button type="button" onClick={() => setPlanModal({})} className="btn btn-primary"><Plus size={15}/> Novo pacote</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-card p-5"><p className="text-xs font-bold uppercase tracking-widest text-muted">Pacotes ativos</p><p className="mt-2 font-display text-3xl font-bold text-emerald-400">{plans.filter((plan) => plan.active).length}</p></div>
        <div className="rounded-xl border border-[var(--border)] bg-card p-5"><p className="text-xs font-bold uppercase tracking-widest text-muted">Assinaturas ativas</p><p className="mt-2 font-display text-3xl font-bold text-text">{activeSubscriptions.length}</p></div>
        <div className="rounded-xl border border-[var(--border)] bg-card p-5"><p className="text-xs font-bold uppercase tracking-widest text-muted">Renovação hoje</p><p className="mt-2 font-display text-3xl font-bold text-amber-400">{renewalsToday}</p></div>
      </div>

      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-text"><PackageCheck size={16} className="text-emerald-400"/> Novo fluxo de pacote</p>
        <p className="mt-1 text-sm text-muted">Na agenda, o pacote ativo aparece primeiro pelo nome. O serviço real fica em R$ 0,00, é reservado ao confirmar e devolvido em cancelamento ou no-show.</p>
      </div>

      {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full py-12 text-center text-sm text-muted">Carregando pacotes...</div>
        ) : plans.map((plan) => {
          const hasMotoDog = plan.services.some((service) => service.service_type === 'motodog')
          const hasLegacy = plan.services.some((service) => service.service_kind === 'catalog' && !isRealCatalogPlanService(service, catalogServices))
          return (
            <button key={plan.id} type="button" onClick={() => setPlanModal(plan)} className={`rounded-2xl border bg-card p-5 text-left transition-all hover:-translate-y-1 ${hasLegacy ? 'border-amber-500/35' : hasMotoDog ? 'border-sky-400/35' : 'border-[var(--border)] hover:border-emerald-400/30'}`}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-display text-xl font-bold text-text">{plan.name}</p><p className="mt-1 text-xs text-muted">{BILLING_CYCLES[plan.billing_cycle]?.label || plan.billing_cycle}</p></div>
                <div className="flex flex-col items-end gap-2"><span className={`badge ${plan.active ? 'badge-green' : 'badge-gray'}`}>{plan.active ? 'Ativo' : 'Pausado'}</span>{hasLegacy && <span className="badge badge-amber">Revisar legado</span>}</div>
              </div>
              <p className="mt-5 font-display text-3xl font-bold text-emerald-400">{fmtCurrency(plan.price)}</p>
              <div className="mt-4 rounded-xl border border-[var(--border)] bg-surface/80 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-widest text-muted">Clientes ativos</p><p className="mt-1 text-lg font-semibold text-text">{activeByPlan[plan.id] || 0}</p></div>
              <div className="mt-5 space-y-2 border-t border-[var(--border2)] pt-4">
                {plan.services.map((service) => (
                  <div key={`${plan.id}-${service.service_type}`} className="flex items-start justify-between gap-3 text-sm"><span className="text-text">{planServiceLabel(service, catalogServices)}</span><span className="shrink-0 text-muted">{service.qty_per_cycle}x</span></div>
                ))}
              </div>
            </button>
          )
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-card">
        <div className="flex items-center gap-2 border-b border-[var(--border2)] px-5 py-4"><PawPrint size={16} className="text-emerald-400"/><h2 className="section-title">Assinantes</h2></div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Pet / Tutor</th><th>Pacote</th><th>Uso no ciclo</th><th>Renovação</th><th>Status</th></tr></thead>
            <tbody>
              {subscriptions.map((subscription) => {
                const usage = buildCatalogUsageSummary(subscription, catalogServices)
                return (
                  <tr key={subscription.id} className={subscription.status === 'active' ? 'bg-emerald-500/5' : ''}>
                    <td><p className="font-semibold text-text">{subscription.client?.pet_name || subscription.client?.owner_name}</p><p className="text-xs text-muted">{subscription.client?.owner_name}</p></td>
                    <td><p className="font-semibold text-text">{subscription.subscription_plans?.name || '-'}</p><p className="text-xs text-muted">{fmtCurrency(subscription.subscription_plans?.price || 0)}</p></td>
                    <td><div className="flex max-w-xl flex-wrap gap-2">{usage.map((item) => <span key={`${subscription.id}-${item.service_type}`} className={`badge ${item.remaining > 0 ? 'badge-blue' : 'badge-gray'}`}>{item.label}: {item.used}/{item.total}</span>)}</div></td>
                    <td><div className="flex items-center gap-2"><CalendarClock size={14} className="text-amber-400"/><span className="text-sm text-text">{subscription.next_billing_date || '-'}</span></div></td>
                    <td><span className={`badge ${subscription.status === 'active' ? 'badge-green' : subscription.status === 'paused' ? 'badge-gray' : 'badge-red'}`}>{subscription.status}</span></td>
                  </tr>
                )
              })}
              {!subscriptions.length && !loading && <tr><td colSpan={5} className="py-10 text-center text-muted">Nenhuma assinatura cadastrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {planModal !== null && <PlanModal plan={planModal.id ? planModal : null} catalogServices={catalogServices} onClose={() => setPlanModal(null)} onSave={handleSavePlan}/>} 
      {subscriptionModal && <SubscriptionModal plans={plans.filter((plan) => plan.active)} clients={clients} catalogServices={catalogServices} onClose={() => setSubscriptionModal(false)} onSave={handleSaveSubscription}/>} 
    </div>
  )
}
