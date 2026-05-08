import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, Check, CreditCard, PawPrint, Plus, RefreshCw, Repeat2, ShieldAlert, X } from 'lucide-react'
import { usePetshopAdvanced, BILLING_CYCLES } from '../hooks/usePetshopAdvanced'
import { useClients } from '../../../shared/hooks/useClients'
import { fmtCurrency } from '../../../lib/supabase'

const PLAN_SERVICE_OPTIONS = [
  { value: 'banho', label: 'Banho' },
  { value: 'tosa', label: 'Tosa' },
  { value: 'banho_e_tosa', label: 'Banho e Tosa' },
  { value: 'consulta', label: 'Consulta' },
  { value: 'vacina', label: 'Vacina' },
  { value: 'motodog', label: 'MotoDog' },
]

function PlanModal({ plan, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    name: plan?.name || '',
    price: plan?.price || 0,
    billing_cycle: plan?.billing_cycle || 'monthly',
    active: plan?.active !== false,
    services: plan?.services?.length
      ? plan.services
      : [{ service_type: 'banho', qty_per_cycle: 4 }],
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))
  const updateService = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      services: prev.services.map((service, serviceIndex) => (
        serviceIndex === index ? { ...service, [key]: value } : service
      )),
    }))
  }

  async function handleSubmit() {
    setSaving(true)
    setError('')

    try {
      await onSave({
        id: plan?.id,
        ...form,
      })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box max-w-2xl">
        <div className="modal-header">
          <h2 className="font-display font-bold text-xl text-text">
            {plan ? 'Editar Plano' : 'Novo Plano'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-text"><X size={18} /></button>
        </div>

        <div className="modal-body space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="inp-label">Nome do plano</label>
              <input className="inp" value={form.name} onChange={(event) => set('name', event.target.value)} />
            </div>
            <div>
              <label className="inp-label">Preco</label>
              <input className="inp" type="number" min="0" step="0.01" value={form.price} onChange={(event) => set('price', event.target.value)} />
            </div>
            <div>
              <label className="inp-label">Ciclo</label>
              <select className="inp" value={form.billing_cycle} onChange={(event) => set('billing_cycle', event.target.value)}>
                {Object.entries(BILLING_CYCLES).map(([value, meta]) => (
                  <option key={value} value={value}>{meta.label}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-3 text-sm text-text mt-7">
              <input type="checkbox" checked={form.active} onChange={(event) => set('active', event.target.checked)} />
              Plano ativo
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="inp-label !mb-0">Servicos inclusos</p>
              <button
                onClick={() => setForm((prev) => ({
                  ...prev,
                  services: [...prev.services, { service_type: 'banho', qty_per_cycle: 1 }],
                }))}
                className="btn btn-secondary btn-sm"
              >
                <Plus size={12} /> Adicionar
              </button>
            </div>

            {form.services.map((service, index) => (
              <div key={`${service.service_type}-${index}`} className="grid grid-cols-[1fr_120px_44px] gap-3">
                <select className="inp" value={service.service_type} onChange={(event) => updateService(index, 'service_type', event.target.value)}>
                  {PLAN_SERVICE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <input
                  className="inp"
                  type="number"
                  min="1"
                  value={service.qty_per_cycle}
                  onChange={(event) => updateService(index, 'qty_per_cycle', Number(event.target.value))}
                />
                <button
                  onClick={() => setForm((prev) => ({
                    ...prev,
                    services: prev.services.filter((_, serviceIndex) => serviceIndex !== index),
                  }))}
                  className="btn btn-danger btn-sm justify-center"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          {error && (
            <p className="text-sm rounded-xl px-4 py-3 bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-2">
              <ShieldAlert size={14} /> {error}
            </p>
          )}

          <div className="flex gap-3">
            <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">Cancelar</button>
            <button onClick={handleSubmit} disabled={saving} className="btn btn-primary flex-1 justify-center">
              {saving ? 'Salvando...' : 'Salvar Plano'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

function SubscriptionModal({ plans, clients, onClose, onSave }) {
  const [form, setForm] = useState({
    plan_id: plans[0]?.id || '',
    client_id: clients[0]?.id || '',
    status: 'active',
    started_at: new Date().toISOString().slice(0, 10),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedPlan = plans.find((plan) => plan.id === form.plan_id)

  async function handleSubmit() {
    setSaving(true)
    setError('')
    try {
      await onSave({
        ...form,
        plan: selectedPlan,
      })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box max-w-xl">
        <div className="modal-header">
          <h2 className="font-display font-bold text-xl text-text">Vincular Assinatura</h2>
          <button onClick={onClose} className="text-muted hover:text-text"><X size={18} /></button>
        </div>

        <div className="modal-body space-y-5">
          <div>
            <label className="inp-label">Plano</label>
            <select className="inp" value={form.plan_id} onChange={(event) => setForm((prev) => ({ ...prev, plan_id: event.target.value }))}>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.name} - {fmtCurrency(plan.price)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="inp-label">Pet / Cliente</label>
            <select className="inp" value={form.client_id} onChange={(event) => setForm((prev) => ({ ...prev, client_id: event.target.value }))}>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.pet_name || client.owner_name} - {client.owner_name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="inp-label">Status</label>
              <select className="inp" value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
                <option value="active">Ativa</option>
                <option value="paused">Pausada</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>
            <div>
              <label className="inp-label">Inicio</label>
              <input className="inp" type="date" value={form.started_at} onChange={(event) => setForm((prev) => ({ ...prev, started_at: event.target.value }))} />
            </div>
          </div>

          {selectedPlan && (
            <div className="rounded-2xl border border-[var(--border)] bg-surface/80 p-4">
              <p className="text-[11px] uppercase tracking-widest text-muted font-bold mb-3">Cobertura do plano</p>
              <div className="space-y-2">
                {selectedPlan.services.map((service) => (
                  <div key={`${selectedPlan.id}-${service.service_type}`} className="flex items-center justify-between text-sm">
                    <span className="text-text">{service.service_type}</span>
                    <span className="text-emerald-400 font-semibold">{service.qty_per_cycle} por ciclo</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3">
            <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">Cancelar</button>
            <button onClick={handleSubmit} disabled={saving} className="btn btn-primary flex-1 justify-center">
              {saving ? 'Salvando...' : 'Salvar Assinatura'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function PlanosPage() {
  const { loadPlans, savePlan, loadClientSubscriptions, saveClientSubscription } = usePetshopAdvanced()
  const { clients, load: loadClients } = useClients()
  const [plans, setPlans] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [planModal, setPlanModal] = useState(null)
  const [subscriptionModal, setSubscriptionModal] = useState(false)
  const [error, setError] = useState('')

  const renewalsToday = subscriptions.filter((subscription) => subscription.next_billing_date === new Date().toISOString().slice(0, 10)).length
  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === 'active').length
  const activeByPlan = useMemo(() => {
    return subscriptions.reduce((acc, subscription) => {
      if (subscription.status !== 'active') return acc
      acc[subscription.plan_id] = (acc[subscription.plan_id] || 0) + 1
      return acc
    }, {})
  }, [subscriptions])

  async function reload() {
    setLoading(true)
    setError('')
    try {
      const [plansData, subscriptionsData] = await Promise.all([
        loadPlans(),
        loadClientSubscriptions(),
      ])
      setPlans(plansData)
      setSubscriptions(subscriptionsData)
    } catch (err) {
      setError(err.message)
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
    await saveClientSubscription(payload)
    await reload()
  }

  return (
    <div className="page animate-fade-up space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <CreditCard size={22} className="text-emerald-400" />
            Planos de Assinatura
          </h1>
          <p className="page-sub">Receita recorrente, uso do ciclo e renovacoes do dia.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => reload()} className="btn btn-secondary">
            <RefreshCw size={15} /> Atualizar
          </button>
          <button onClick={() => setSubscriptionModal(true)} className="btn btn-secondary">
            <Repeat2 size={15} /> Nova assinatura
          </button>
          <button onClick={() => setPlanModal({})} className="btn btn-primary">
            <Plus size={15} /> Novo plano
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-[var(--border)] rounded-xl p-5">
          <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Planos ativos</p>
          <p className="font-display font-bold text-3xl text-emerald-400">{plans.filter((plan) => plan.active).length}</p>
        </div>
        <div className="bg-card border border-[var(--border)] rounded-xl p-5">
          <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Assinaturas vivas</p>
          <p className="font-display font-bold text-3xl text-text">{activeSubscriptions}</p>
        </div>
        <div className="bg-card border border-[var(--border)] rounded-xl p-5">
          <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Renovacao hoje</p>
          <p className="font-display font-bold text-3xl text-amber-400">{renewalsToday}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4">
        <p className="text-sm font-semibold text-text">Visao rapida</p>
        <p className="text-sm text-muted mt-1">
          Quando um cliente estiver com plano ativo, ele aparece destacado logo abaixo e tambem nas abas de Agenda e Clientes & Pets.
        </p>
      </div>

      {error && (
        <p className="text-sm rounded-xl px-4 py-3 bg-red-500/10 text-red-400 border border-red-500/20">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="text-muted text-sm col-span-full">Carregando planos...</div>
        ) : plans.map((plan) => {
          const activeClients = activeByPlan[plan.id] || 0
          const isMotoDog = plan.name?.toLowerCase().includes('motodog') || plan.services.some((service) => service.service_type === 'motodog')
          return (
          <button
            key={plan.id}
            onClick={() => setPlanModal(plan)}
            className={`bg-card border rounded-2xl p-5 text-left transition-all hover:-translate-y-1 ${
              isMotoDog
                ? 'border-sky-400/40 shadow-[0_20px_60px_rgba(14,165,233,0.18)]'
                : 'border-[var(--border)] hover:border-emerald-400/30'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display font-bold text-xl text-text">{plan.name}</p>
                <p className="text-xs text-muted mt-1">{BILLING_CYCLES[plan.billing_cycle]?.label || plan.billing_cycle}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`badge ${plan.active ? 'badge-green' : 'badge-gray'}`}>
                  {plan.active ? 'Ativo' : 'Pausado'}
                </span>
                {isMotoDog && <span className="badge badge-blue">MotoDog</span>}
              </div>
            </div>

            <p className="font-display font-bold text-3xl text-emerald-400 mt-5">{fmtCurrency(plan.price)}</p>
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-surface/80 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Clientes ativos neste plano</p>
              <p className="text-lg font-semibold text-text mt-1">{activeClients}</p>
            </div>

            <div className="mt-5 pt-4 border-t border-[var(--border2)] space-y-2">
              {plan.services.map((service) => (
                <div key={`${plan.id}-${service.service_type}`} className="flex items-center justify-between text-sm">
                  <span className="text-text">{service.service_type}</span>
                  <span className="text-muted">{service.qty_per_cycle}x</span>
                </div>
              ))}
            </div>
          </button>
        )})}
      </div>

      <div className="bg-card border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border2)] flex items-center gap-2">
          <PawPrint size={16} className="text-emerald-400" />
          <h2 className="section-title">Assinantes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Pet / Tutor</th>
                <th>Plano</th>
                <th>Uso no ciclo</th>
                <th>Renovacao</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((subscription) => (
                <tr key={subscription.id} className={subscription.status === 'active' ? 'bg-emerald-500/5' : ''}>
                  <td>
                    <p className="font-semibold text-text">{subscription.client.pet_name || subscription.client.owner_name}</p>
                    <p className="text-xs text-muted">{subscription.client.owner_name}</p>
                  </td>
                  <td>
                    <p className="font-semibold text-text">{subscription.subscription_plans?.name}</p>
                    <p className="text-xs text-muted">{fmtCurrency(subscription.subscription_plans?.price || 0)}</p>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {subscription.usage_summary.map((usage) => (
                        <span key={`${subscription.id}-${usage.service_type}`} className="badge badge-blue">
                          {usage.service_type}: {usage.used}/{usage.total}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <CalendarClock size={14} className="text-amber-400" />
                      <div>
                        <p className="text-sm text-text">{subscription.next_billing_date || '-'}</p>
                        {subscription.next_billing_date === new Date().toISOString().slice(0, 10) && (
                          <span className="badge badge-amber">Renova hoje</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <span className={`badge ${subscription.status === 'active' ? 'badge-green' : subscription.status === 'paused' ? 'badge-gray' : 'badge-red'}`}>
                        {subscription.status}
                      </span>
                      {subscription.status === 'active' && (
                        <span className="badge badge-blue">Plano ativo conosco</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!subscriptions.length && !loading && (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-10">Nenhuma assinatura cadastrada ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {planModal !== null && (
        <PlanModal
          plan={planModal.id ? planModal : null}
          onClose={() => setPlanModal(null)}
          onSave={handleSavePlan}
        />
      )}

      {subscriptionModal && (
        <SubscriptionModal
          plans={plans.filter((plan) => plan.active)}
          clients={clients}
          onClose={() => setSubscriptionModal(false)}
          onSave={handleSaveSubscription}
        />
      )}
    </div>
  )
}
