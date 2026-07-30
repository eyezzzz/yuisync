import { useMemo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Ban,
  Bike,
  CalendarClock,
  CheckCircle2,
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
  X,
} from 'lucide-react'

import { useAuthCtx } from '../../../context/AuthContext'
import { useModuleCtx } from '../../../context/ModuleContext'
import { fmtCurrency, supabase } from '../../../lib/supabase'
import { applyTenantFilter, runWithTenantFallback } from '../../../lib/tenant'
import { useClients } from '../../../shared/hooks/useClients'
import { groupPetsByTutor } from '../../../shared/lib/petTutorGroups'
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
import {
  buildEditableUsage,
  clampSubscriptionUsage,
  normalizeSubscriptionSearch,
  subscriptionMatchesSearch,
} from '../lib/subscriptionUsageAdmin'

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

function clientSearchText(client = {}) {
  return normalizeSubscriptionSearch([
    client.owner_name,
    client.pet_name,
    client.phone,
    client.email,
    client.breed,
  ].filter(Boolean).join(' '))
}

function clientMatches(client, query) {
  const terms = normalizeSubscriptionSearch(query).split(' ').filter(Boolean)
  if (!terms.length) return true
  const haystack = clientSearchText(client)
  return terms.every((term) => haystack.includes(term))
}

function statusMeta(status) {
  return {
    active: { label: 'Ativo', cls: 'badge-green' },
    paused: { label: 'Pausado', cls: 'badge-gray' },
    cancelled: { label: 'Cancelado', cls: 'badge-red' },
    pending_payment: { label: 'Aguardando pagamento', cls: 'badge-amber' },
  }[status] || { label: status || 'Indefinido', cls: 'badge-gray' }
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

  function updateServiceType(index, serviceType) {
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

  function updateQuantity(index, quantity) {
    setForm((current) => ({
      ...current,
      services: current.services.map((service, serviceIndex) => (
        serviceIndex === index
          ? { ...service, qty_per_cycle: Math.max(1, Number(quantity || 1)) }
          : service
      )),
    }))
  }

  function addService() {
    setForm((current) => {
      const entry = nextAvailableEntry(current.services, catalogServices)
      return entry ? { ...current, services: [...current.services, entry] } : current
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
            <p className="mt-1 text-sm text-muted">Selecione os serviços reais que serão consumidos na Agenda.</p>
          </div>
          <button type="button" aria-label="Fechar pacote" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>

        <div className="modal-body space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="inp-label">Nome de identificação</label>
              <input className="inp" value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Ex.: Pacote Banho Básico"/>
            </div>
            <div>
              <label className="inp-label">Preço do pacote</label>
              <input className="inp" type="number" min="0" step="0.01" value={form.price} onChange={(event) => set('price', event.target.value)}/>
            </div>
            <div>
              <label className="inp-label">Ciclo</label>
              <select className="inp" value={form.billing_cycle} onChange={(event) => set('billing_cycle', event.target.value)}>
                {Object.entries(BILLING_CYCLES).map(([value, metadata]) => <option key={value} value={value}>{metadata.label}</option>)}
              </select>
            </div>
            <label className="mt-7 flex items-center gap-3 text-sm text-text">
              <input type="checkbox" checked={form.active} onChange={(event) => set('active', event.target.checked)}/>
              Pacote disponível para novas vendas
            </label>
          </div>

          <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-text">Serviços incluídos</p>
                <p className="mt-1 text-xs text-muted">Cada item usa o código real do catálogo e possui um limite por ciclo.</p>
              </div>
              <button type="button" onClick={addService} className="btn btn-secondary btn-sm"><Plus size={13}/> Adicionar serviço</button>
            </div>

            <div className="space-y-3">
              {form.services.map((service, index) => {
                const legacy = service.service_kind === 'catalog' && !catalog.has(service.service_type)
                return (
                  <div key={`${service.service_type}-${index}`} className={`rounded-xl border p-3 ${legacy ? 'border-amber-500/35 bg-amber-500/8' : 'border-[var(--border2)] bg-surface/70'}`}>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_120px_44px]">
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted">Serviço real</label>
                        <select className="inp" value={service.service_type} onChange={(event) => updateServiceType(index, event.target.value)}>
                          {legacy && <option value={service.service_type}>Legado: {service.service_name || service.service_type}</option>}
                          <optgroup label="Catálogo de serviços">
                            {catalogServices.map((catalogService) => (
                              <option key={catalogService.code} value={catalogService.code}>{catalogService.name} · {fmtCurrency(catalogService.default_price || 0)}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Transporte"><option value="motodog">MotoDog - buscar e levar</option></optgroup>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted">Por ciclo</label>
                        <input className="inp" type="number" min="1" step="1" value={service.qty_per_cycle} onChange={(event) => updateQuantity(index, event.target.value)}/>
                      </div>
                      <button type="button" title="Remover serviço" onClick={() => setForm((current) => ({ ...current, services: current.services.filter((_, itemIndex) => itemIndex !== index) }))} className="btn btn-danger btn-sm mt-5 justify-center"><Trash2 size={13}/></button>
                    </div>
                    {legacy && <p className="mt-2 text-xs text-amber-300">Item legado: selecione um serviço real antes de salvar.</p>}
                  </div>
                )
              })}
            </div>
          </section>

          {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1 justify-center">Cancelar</button>
            <button type="button" onClick={submit} disabled={saving} className="btn btn-primary flex-1 justify-center"><Save size={15}/> {saving ? 'Salvando...' : 'Salvar pacote'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ClientPicker({ clients, selectedId, onSelect, onManagePets }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pendingTutorPets, setPendingTutorPets] = useState([])
  const selected = clients.find((client) => client.id === selectedId)
  const results = useMemo(() => groupPetsByTutor(clients)
    .filter((group) => group.pets.some((client) => clientMatches(client, search)))
    .slice(0, 20), [clients, search])

  const selectTutor = (group) => {
    if (group.pets.length === 1) {
      onSelect(group.pets[0].id)
      setOpen(false)
      setSearch('')
      return
    }
    setPendingTutorPets(group.pets)
    setSearch('')
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inp-label mb-0">Pet que receberá o pacote</label>
        {onManagePets && <button type="button" onClick={onManagePets} className="btn btn-ghost btn-sm"><PawPrint size={13}/> Gerenciar clientes e pets</button>}
      </div>
      <p className="mb-2 mt-1 text-xs text-muted">Cada venda fica vinculada ao pet escolhido, mesmo quando o tutor possui vários pets.</p>
      {!open && selected ? (
        <button type="button" onClick={() => { setPendingTutorPets([]); setOpen(true) }} className="w-full rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-left">
          <span className="block font-bold text-text">{selected.pet_name || 'Pet não informado'}</span>
          <span className="mt-1 block text-xs text-muted">{selected.owner_name || 'Tutor não informado'}{selected.phone ? ` · ${selected.phone}` : ''}</span>
        </button>
      ) : !open ? (
        <button type="button" onClick={() => { setPendingTutorPets([]); setOpen(true) }} className="btn btn-secondary w-full justify-center"><Search size={14}/> Pesquisar tutor ou pet</button>
      ) : (
        <div className="rounded-xl border border-[var(--border2)] bg-surface p-3 shadow-xl">
          {pendingTutorPets.length > 1 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-text">Escolha qual pet receberá o pacote</p>
                  <p className="text-xs text-muted">{pendingTutorPets[0]?.owner_name} possui {pendingTutorPets.length} pets ativos.</p>
                </div>
                <button type="button" onClick={() => setPendingTutorPets([])} className="btn btn-ghost btn-sm">Voltar</button>
              </div>
              {pendingTutorPets.map((pet) => (
                <button key={pet.id} type="button" onClick={() => { onSelect(pet.id); setOpen(false); setPendingTutorPets([]) }} className="w-full rounded-xl border border-[var(--border2)] px-3 py-2.5 text-left hover:bg-emerald-500/10">
                  <span className="block text-sm font-bold text-text">{pet.pet_name || 'Pet não informado'}</span>
                  <span className="block text-xs text-muted">{pet.breed || pet.species || 'Espécie não informada'}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"/>
                <input autoFocus className="inp pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Digite tutor, pet ou telefone..."/>
              </div>
              <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-[var(--border2)]">
                {results.map((group) => (
                  <button key={group.key} type="button" onClick={() => selectTutor(group)} className="flex w-full items-center justify-between gap-3 border-b border-[var(--border2)] px-3 py-2.5 text-left last:border-0 hover:bg-white/5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-text">{group.owner_name || 'Tutor não informado'}</span>
                      <span className="block truncate text-xs text-muted">{group.pets.length === 1 ? group.pets[0].pet_name || 'Pet não informado' : `${group.pets.length} pets: ${group.pets.map((pet) => pet.pet_name).filter(Boolean).join(', ')}`}</span>
                    </span>
                    {group.pets.length > 1 ? <span className="text-[10px] font-bold text-emerald-400">Escolher pet</span> : selectedId === group.pets[0]?.id && <CheckCircle2 size={15} className="shrink-0 text-emerald-400"/>}
                  </button>
                ))}
                {!results.length && <p className="px-3 py-4 text-center text-sm text-muted">Nenhum cliente encontrado.</p>}
              </div>
            </>
          )}
          <button type="button" onClick={() => { setOpen(false); setSearch(''); setPendingTutorPets([]) }} className="btn btn-ghost btn-sm mt-2 w-full justify-center">Fechar busca</button>
        </div>
      )}
    </div>
  )
}

function SubscriptionModal({ plans, clients, catalogServices, onClose, onSave, onManagePets }) {
  const [form, setForm] = useState({
    plan_id: plans[0]?.id || '',
    client_id: '',
    status: 'active',
    started_at: new Date().toISOString().slice(0, 10),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const selectedPlan = plans.find((plan) => plan.id === form.plan_id)

  async function submit() {
    if (!form.client_id) return setError('Selecione o pet que receberá o pacote.')
    setSaving(true)
    setError('')
    try {
      await onSave({ ...form, plan: selectedPlan, billing_cycle: selectedPlan?.billing_cycle })
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
        <div className="modal-header">
          <div>
            <h2 className="font-display text-xl font-bold text-text">Vender pacote ao cliente</h2>
            <p className="mt-1 text-sm text-muted">A assinatura só ficará ativa depois da confirmação do pagamento.</p>
          </div>
          <button type="button" aria-label="Fechar assinatura" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>

        <div className="modal-body space-y-5">
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Ao continuar, o pacote irá para Ordens / Entrega → Banho & Tosa. Os benefícios serão liberados somente após o recebimento no caixa.
          </div>
          <div>
            <label className="inp-label">Pacote</label>
            <select className="inp" value={form.plan_id} onChange={(event) => setForm((current) => ({ ...current, plan_id: event.target.value }))}>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} - {fmtCurrency(plan.price)}</option>)}
            </select>
          </div>
          <ClientPicker clients={clients} selectedId={form.client_id} onSelect={(clientId) => setForm((current) => ({ ...current, client_id: clientId }))} onManagePets={onManagePets}/>
          <div>
            <label className="inp-label">Início previsto do ciclo</label>
            <input className="inp" type="date" value={form.started_at} onChange={(event) => setForm((current) => ({ ...current, started_at: event.target.value }))}/>
          </div>

          {selectedPlan && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">Cobertura do pacote</p>
                <strong className="text-emerald-300">{fmtCurrency(selectedPlan.price)}</strong>
              </div>
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
            <button type="button" onClick={submit} disabled={saving || !plans.length} className="btn btn-primary flex-1 justify-center"><CreditCard size={15}/> {saving ? 'Preparando...' : 'Continuar para pagamento'}</button>
          </div>
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
        <div className="modal-header">
          <div>
            <h2 className="font-display text-xl font-bold text-text">Editar consumo do pacote</h2>
            <p className="mt-1 text-sm text-muted">{subscription.client?.pet_name || subscription.client?.owner_name} · {subscription.subscription_plans?.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>
        <div className="modal-body space-y-4">
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <p className="flex items-start gap-2"><ShieldAlert size={16} className="mt-0.5 shrink-0"/> Reduzir o consumo libera saldo para novos agendamentos. O histórico dos atendimentos não é apagado.</p>
          </div>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.service_type} className="grid grid-cols-[minmax(0,1fr)_120px] items-end gap-3 rounded-xl border border-[var(--border2)] bg-surface/70 p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-text">{item.service_name}</p>
                  <p className="mt-1 text-xs text-muted">Limite contratado: {item.total} por ciclo</p>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted">Utilizados</label>
                  <input className="inp" type="number" min="0" max={item.total} step="1" value={values[item.service_type] ?? 0} onChange={(event) => setValues((current) => ({ ...current, [item.service_type]: event.target.value }))}/>
                </div>
              </div>
            ))}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1 justify-center">Cancelar</button>
            <button type="button" disabled={saving || !items.length} onClick={submit} className="btn btn-primary flex-1 justify-center"><Save size={15}/> {saving ? 'Salvando...' : 'Salvar consumo'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function CancelSubscriptionModal({ subscription, onClose, onConfirm }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setSaving(true)
    setError('')
    try {
      await onConfirm(subscription)
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Não foi possível cancelar a assinatura.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box max-w-md">
        <div className="modal-header">
          <h2 className="font-display text-xl font-bold text-text">Cancelar assinatura</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>
        <div className="modal-body space-y-4">
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            O pacote de <strong>{subscription.client?.pet_name || subscription.client?.owner_name}</strong> deixará de aparecer na Agenda. O histórico e os consumos atuais serão preservados.
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1 justify-center">Voltar</button>
            <button type="button" disabled={saving} onClick={confirm} className="btn btn-danger flex-1 justify-center"><Ban size={15}/> {saving ? 'Cancelando...' : 'Confirmar cancelamento'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function PlanosNativePage({ setPage }) {
  const { activeTenantId } = useAuthCtx()
  const { activeModuleId } = useModuleCtx()
  const { clients, load: loadClients } = useClients()
  const { loadPetshopServices } = usePetshopAdvanced()
  const { loadPlans, savePlan, loadSubscriptions, saveSubscription } = useCatalogPlans()
  const moduleId = activeModuleId || 'petshop'
  const [plans, setPlans] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [catalogServices, setCatalogServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [planModal, setPlanModal] = useState(null)
  const [subscriptionModal, setSubscriptionModal] = useState(false)
  const [editingUsage, setEditingUsage] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const runScoped = useMemo(() => (runner) => runWithTenantFallback(activeTenantId, runner), [activeTenantId])

  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === 'active')
  const activeByPlan = useMemo(() => activeSubscriptions.reduce((map, subscription) => {
    map[subscription.plan_id] = (map[subscription.plan_id] || 0) + 1
    return map
  }, {}), [activeSubscriptions])
  const filteredSubscriptions = useMemo(
    () => subscriptions.filter((subscription) => subscriptionMatchesSearch(subscription, search)),
    [subscriptions, search],
  )
  const renewalsToday = subscriptions.filter((subscription) => subscription.next_billing_date === new Date().toISOString().slice(0, 10)).length

  async function reload() {
    setLoading(true)
    setError('')
    try {
      const [planRows, subscriptionRows, catalogRows] = await Promise.all([
        loadPlans(),
        loadSubscriptions(),
        loadPetshopServices(),
      ])
      setCatalogServices(catalogRows || [])
      setPlans((planRows || []).map((plan) => ({ ...plan, services: enrichPlanServices(plan.services, catalogRows || []) })))
      setSubscriptions(subscriptionRows || [])
    } catch (loadError) {
      setError(loadError?.message || 'Não foi possível carregar os pacotes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadClients()
    void reload()
  }, [])

  async function handleSavePlan(payload) {
    await savePlan(payload)
    await reload()
  }

  async function handleSaveSubscription(payload) {
    const subscription = await saveSubscription(payload)
    await reload()
    if (subscription?.status === 'pending_payment') {
      window.sessionStorage.setItem('yuisync:orders-tab', 'banho_tosa')
      window.sessionStorage.setItem('yuisync:subscription-focus', subscription.id)
      setPage?.('ordens')
    }
  }

  async function saveUsage(subscription, requested) {
    if (!activeTenantId) throw new Error('Selecione uma empresa ativa antes de editar o consumo.')
    const servicesUsed = clampSubscriptionUsage(subscription, requested)
    const response = await runScoped(async (includeTenant) => {
      let query = supabase
        .from('client_subscriptions')
        .update({ services_used: servicesUsed, updated_at: new Date().toISOString() })
        .eq('id', subscription.id)
        .eq('module_id', moduleId)
      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return query.select('id,services_used').single()
    })
    if (response.error) throw response.error
    await reload()
  }

  async function cancelSubscription(subscription) {
    if (!activeTenantId) throw new Error('Selecione uma empresa ativa antes de cancelar.')
    const response = await runScoped(async (includeTenant) => {
      let query = supabase
        .from('client_subscriptions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', subscription.id)
        .eq('module_id', moduleId)
      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return query.select('id,status').single()
    })
    if (response.error) throw response.error
    await reload()
  }

  return (
    <div className="page animate-fade-up space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><CreditCard size={22} className="text-emerald-400"/> Planos de Assinatura</h1>
          <p className="page-sub">Venda, ativação, consumo e cancelamento dos pacotes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={reload} className="btn btn-secondary"><RefreshCw size={15}/> Atualizar</button>
          <button type="button" onClick={() => setPage?.('pets')} className="btn btn-secondary"><PawPrint size={15}/> Clientes & Pets</button>
          <button type="button" onClick={() => setSubscriptionModal(true)} className="btn btn-secondary"><Repeat2 size={15}/> Vender pacote</button>
          <button type="button" onClick={() => setPlanModal({})} className="btn btn-primary"><Plus size={15}/> Novo pacote</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-card p-5"><p className="text-xs font-bold uppercase tracking-widest text-muted">Pacotes ativos</p><p className="mt-2 font-display text-3xl font-bold text-emerald-400">{plans.filter((plan) => plan.active).length}</p></div>
        <div className="rounded-xl border border-[var(--border)] bg-card p-5"><p className="text-xs font-bold uppercase tracking-widest text-muted">Assinaturas ativas</p><p className="mt-2 font-display text-3xl font-bold text-text">{activeSubscriptions.length}</p></div>
        <div className="rounded-xl border border-[var(--border)] bg-card p-5"><p className="text-xs font-bold uppercase tracking-widest text-muted">Renovação hoje</p><p className="mt-2 font-display text-3xl font-bold text-amber-400">{renewalsToday}</p></div>
      </div>

      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-text"><PackageCheck size={16} className="text-emerald-400"/> Fluxo financeiro do pacote</p>
        <p className="mt-1 text-sm text-muted">A assinatura aguarda pagamento; após o recebimento, o pacote fica disponível na Agenda e os atendimentos apenas consomem o saldo.</p>
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
                {plan.services.map((service) => <div key={`${plan.id}-${service.service_type}`} className="flex items-start justify-between gap-3 text-sm"><span className="text-text">{planServiceLabel(service, catalogServices)}</span><span className="shrink-0 text-muted">{service.qty_per_cycle}x</span></div>)}
              </div>
            </button>
          )
        })}
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border2)] px-5 py-4">
          <div className="flex items-center gap-2"><PawPrint size={16} className="text-emerald-400"/><h2 className="section-title">Assinantes</h2></div>
          <span className="text-xs font-semibold text-muted">{filteredSubscriptions.length} de {subscriptions.length}</span>
        </div>
        <div className="border-b border-[var(--border2)] px-5 py-3">
          <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"/>
            <input className="inp pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar por tutor, pet, telefone ou pacote..." aria-label="Pesquisar assinantes"/>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl min-w-[1100px]">
            <thead><tr><th>Pet / Tutor</th><th>Pacote</th><th>Uso no ciclo</th><th>Renovação</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              {filteredSubscriptions.map((subscription) => {
                const usage = buildCatalogUsageSummary(subscription, catalogServices)
                const meta = statusMeta(subscription.status)
                const editable = ['active', 'paused'].includes(subscription.status)
                const cancellable = !['cancelled'].includes(subscription.status)
                return (
                  <tr key={subscription.id} className={subscription.status === 'active' ? 'bg-emerald-500/5' : ''}>
                    <td><p className="font-semibold text-text">{subscription.client?.pet_name || subscription.client?.owner_name}</p><p className="text-xs text-muted">{subscription.client?.owner_name}</p></td>
                    <td><p className="font-semibold text-text">{subscription.subscription_plans?.name || '-'}</p><p className="text-xs text-muted">{fmtCurrency(subscription.subscription_plans?.price || 0)}</p></td>
                    <td><div className="flex max-w-xl flex-wrap gap-2">{usage.map((item) => <span key={`${subscription.id}-${item.service_type}`} className={`badge ${item.remaining > 0 ? 'badge-blue' : 'badge-gray'}`}>{item.label}: {item.used}/{item.total}</span>)}</div></td>
                    <td><div className="flex items-center gap-2"><CalendarClock size={14} className="text-amber-400"/><span className="text-sm text-text">{subscription.next_billing_date || '-'}</span></div></td>
                    <td><span className={`badge ${meta.cls}`}>{meta.label}</span></td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={!editable} onClick={() => setEditingUsage(subscription)} className="btn btn-secondary btn-sm whitespace-nowrap" title={editable ? 'Editar consumo do ciclo' : 'Disponível após ativação'}><PencilLine size={13}/> Editar consumo</button>
                        <button type="button" disabled={!cancellable} onClick={() => setCancelling(subscription)} className="btn btn-danger btn-sm whitespace-nowrap"><Ban size={13}/> Cancelar</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!filteredSubscriptions.length && !loading && <tr><td colSpan={6} className="py-10 text-center text-muted">Nenhum assinante encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {planModal !== null && <PlanModal plan={planModal.id ? planModal : null} catalogServices={catalogServices} onClose={() => setPlanModal(null)} onSave={handleSavePlan}/>} 
      {subscriptionModal && <SubscriptionModal plans={plans.filter((plan) => plan.active)} clients={clients} catalogServices={catalogServices} onClose={() => setSubscriptionModal(false)} onSave={handleSaveSubscription} onManagePets={() => { setSubscriptionModal(false); setPage?.('pets') }}/>} 
      {editingUsage && <UsageEditModal subscription={editingUsage} onClose={() => setEditingUsage(null)} onSave={saveUsage}/>} 
      {cancelling && <CancelSubscriptionModal subscription={cancelling} onClose={() => setCancelling(null)} onConfirm={cancelSubscription}/>} 
    </div>
  )
}
