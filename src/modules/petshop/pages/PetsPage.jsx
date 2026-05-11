import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Calendar as CalendarIcon, Cat, Dog, Fish, Grid, List as ListIcon, PawPrint, Phone, Plus, RefreshCw, Search, Trash2, Upload, Weight, X } from 'lucide-react'
import { useClients } from '../../../shared/hooks/useClients'
import { useAppointments } from '../../../shared/hooks/useAppointments'
import { usePetshopAdvanced } from '../hooks/usePetshopAdvanced'
import { useModuleCtx } from '../../../context/ModuleContext'
import { useAuthCtx } from '../../../context/AuthContext'
import { fmtCurrency, fmtDate } from '../../../lib/supabase'
import { importLegacyRows } from '../../../lib/api'
import { parseLegacyClients } from '../../../shared/lib/legacyImport'

const SPECIES = [
  { value: 'dog', label: 'Cao', icon: Dog },
  { value: 'cat', label: 'Gato', icon: Cat },
  { value: 'bird', label: 'Ave', icon: PawPrint },
  { value: 'rabbit', label: 'Coelho', icon: PawPrint },
  { value: 'fish', label: 'Peixe', icon: Fish },
  { value: 'other', label: 'Outro', icon: PawPrint },
]

const EMPTY_FORM = {
  owner_name: '', owner_cpf: '', phone: '', email: '', owner_address: '', owner_neighborhood: '', owner_city: '',
  pet_name: '', species: 'dog', breed: '', birth_date: '', weight_kg: '', color: '', notes: '',
}

const PLAN_LABELS = { active: 'Ativo', paused: 'Pausado', cancelled: 'Encerrado' }

function digits(value) { return String(value || '').replace(/\D/g, '') }
function normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() }
function formatPhone(value) { const d = digits(value); if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return value || '-' }
function formatCpf(value) { const d = digits(value); if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`; return value || '-' }
function getPlanTone(status) { return status === 'active' ? 'badge-green' : status === 'paused' ? 'badge-amber' : 'badge-gray' }
function getServiceLabel(type) { return ({ banho: 'Banho', tosa: 'Tosa', banho_e_tosa: 'Banho e tosa', consulta: 'Consulta', vacina: 'Vacina', motodog: 'MotoDog' }[type] || type) }

function PetModal({ pet, plans, subscription, onClose, onSave }) {
  const [form, setForm] = useState({
    ...(pet ? { ...EMPTY_FORM, ...pet } : EMPTY_FORM),
    plan_id: subscription?.status === 'cancelled' ? '' : (subscription?.plan_id || ''),
    subscription_status: subscription?.status === 'paused' ? 'paused' : 'active',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!form.owner_name.trim()) return setError('Informe o nome do tutor.')
    if (!form.phone.trim()) return setError('Informe o telefone.')
    setSaving(true)
    setError('')
    try {
      await onSave({
        petPayload: {
          owner_name: form.owner_name.trim(), owner_cpf: formatCpf(form.owner_cpf), phone: formatPhone(form.phone), email: form.email.trim(),
          owner_address: form.owner_address.trim(), owner_neighborhood: form.owner_neighborhood.trim(), owner_city: form.owner_city.trim(),
          pet_name: form.pet_name.trim(), species: form.species, breed: form.breed.trim(), birth_date: form.birth_date || null,
          weight_kg: form.weight_kg ? Number(form.weight_kg) : null, color: form.color.trim(), notes: form.notes.trim(),
        },
        planId: form.plan_id || null,
        subscriptionStatus: form.subscription_status,
      })
      onClose()
    } catch (err) {
      setError(err.message || 'Nao foi possivel salvar.')
    } finally {
      setSaving(false)
    }
  }

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-3xl">
        <div className="modal-header">
          <div>
            <h2 className="font-display font-bold text-xl text-text">{pet?.id ? 'Editar cliente e pet' : 'Novo cliente e pet'}</h2>
            <p className="text-sm text-muted mt-1">Essa tela agora conversa direto com a aba de planos.</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text"><X size={18} /></button>
        </div>
        <div className="modal-body space-y-5">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-[var(--border)] bg-card p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2"><label className="inp-label">Tutor</label><input className="inp" value={form.owner_name} onChange={(e) => setField('owner_name', e.target.value)} /></div>
              <div><label className="inp-label">Telefone</label><input className="inp" value={form.phone} onChange={(e) => setField('phone', e.target.value)} /></div>
              <div><label className="inp-label">CPF</label><input className="inp" value={form.owner_cpf} onChange={(e) => setField('owner_cpf', e.target.value)} /></div>
              <div className="md:col-span-2"><label className="inp-label">Email</label><input className="inp" value={form.email} onChange={(e) => setField('email', e.target.value)} /></div>
              <div className="md:col-span-2"><label className="inp-label">Endereco</label><input className="inp" value={form.owner_address} onChange={(e) => setField('owner_address', e.target.value)} /></div>
              <div><label className="inp-label">Bairro</label><input className="inp" value={form.owner_neighborhood} onChange={(e) => setField('owner_neighborhood', e.target.value)} /></div>
              <div><label className="inp-label">Cidade</label><input className="inp" value={form.owner_city} onChange={(e) => setField('owner_city', e.target.value)} /></div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-card p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2"><label className="inp-label">Pet</label><input className="inp" value={form.pet_name} onChange={(e) => setField('pet_name', e.target.value)} /></div>
              <div><label className="inp-label">Especie</label><select className="inp" value={form.species} onChange={(e) => setField('species', e.target.value)}>{SPECIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
              <div><label className="inp-label">Raca</label><input className="inp" value={form.breed} onChange={(e) => setField('breed', e.target.value)} /></div>
              <div><label className="inp-label">Nascimento</label><input className="inp" type="date" value={form.birth_date || ''} onChange={(e) => setField('birth_date', e.target.value)} /></div>
              <div><label className="inp-label">Peso</label><input className="inp" type="number" min="0" step="0.1" value={form.weight_kg || ''} onChange={(e) => setField('weight_kg', e.target.value)} /></div>
              <div><label className="inp-label">Cor</label><input className="inp" value={form.color} onChange={(e) => setField('color', e.target.value)} /></div>
              <div className="md:col-span-2"><label className="inp-label">Plano atual</label><select className="inp" value={form.plan_id} onChange={(e) => setField('plan_id', e.target.value)}><option value="">Sem plano ativo</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} - {fmtCurrency(plan.price)}</option>)}</select></div>
              {form.plan_id && <div className="md:col-span-2"><label className="inp-label">Status do plano</label><select className="inp" value={form.subscription_status} onChange={(e) => setField('subscription_status', e.target.value)}><option value="active">Ativo</option><option value="paused">Pausado</option></select></div>}
              <div className="md:col-span-2"><label className="inp-label">Observacoes</label><textarea className="inp h-24 resize-none p-4" value={form.notes} onChange={(e) => setField('notes', e.target.value)} /></div>
            </div>
          </div>
          {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-center gap-2"><AlertCircle size={14} /> {error}</div>}
          <div className="flex gap-3"><button onClick={onClose} className="btn btn-secondary flex-1 justify-center">Cancelar</button><button onClick={submit} disabled={saving} className="btn btn-primary flex-1 justify-center">{saving ? 'Salvando...' : 'Salvar cadastro'}</button></div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function PetDrawer({ pet, subscription, onClose, onEdit, speciesIcon, serviceLabel, statusBadge }) {
  const { appointments, load } = useAppointments()
  useEffect(() => { if (pet?.id) load({ date: '' }) }, [pet?.id])
  if (!pet) return null
  const Icon = speciesIcon(pet.species)
  const recentAppointments = appointments.filter((item) => item.pets?.id === pet.id).slice(0, 8)

  return createPortal(
    <div className="fixed inset-0 z-50 flex theme-petshop-modal">
      <div className="flex-1 bg-black/50 backdrop-blur-[8px]" onClick={onClose} />
      <div className="w-full max-w-lg bg-surface border-l border-[var(--border2)] flex flex-col overflow-hidden shadow-card">
        <div className="modal-header">
          <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center"><Icon size={22} /></div><div><h2 className="font-display font-bold text-lg text-text">{pet.owner_name}</h2><p className="text-sm text-muted">{pet.pet_name || 'Pet sem nome'}{pet.breed ? ` - ${pet.breed}` : ''}</p></div></div>
          <div className="flex items-center gap-2"><button onClick={() => onEdit(pet)} className="btn btn-secondary btn-sm">Editar</button><button onClick={onClose} className="text-muted hover:text-text"><X size={18} /></button></div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="rounded-2xl border border-[var(--border)] bg-card p-5 grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-[10px] uppercase tracking-widest text-muted font-bold">Tutor</p><p className="text-text font-semibold mt-1">{pet.owner_name || '-'}</p></div>
            <div><p className="text-[10px] uppercase tracking-widest text-muted font-bold">Pet</p><p className="text-text font-semibold mt-1">{pet.pet_name || '-'}</p></div>
            <div><p className="text-[10px] uppercase tracking-widest text-muted font-bold">Telefone</p><p className="text-text font-semibold mt-1">{formatPhone(pet.phone)}</p></div>
            <div><p className="text-[10px] uppercase tracking-widest text-muted font-bold">CPF</p><p className="text-text font-semibold mt-1">{formatCpf(pet.owner_cpf)}</p></div>
            <div><p className="text-[10px] uppercase tracking-widest text-muted font-bold">Nascimento</p><p className="text-text font-semibold mt-1">{fmtDate(pet.birth_date) || '-'}</p></div>
            <div><p className="text-[10px] uppercase tracking-widest text-muted font-bold">Peso</p><p className="text-text font-semibold mt-1">{pet.weight_kg ? `${pet.weight_kg} kg` : '-'}</p></div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-3"><p className="text-xs uppercase tracking-widest text-muted font-bold">Plano vinculado</p>{subscription && <span className={`badge ${getPlanTone(subscription.status)}`}>{PLAN_LABELS[subscription.status] || 'Plano'}</span>}</div>
            {subscription ? (
              <>
                <div className="flex items-center justify-between text-sm"><span className="text-muted">Plano</span><span className="font-semibold text-text">{subscription.subscription_plans?.name || '-'}</span></div>
                <div className="flex items-center justify-between text-sm"><span className="text-muted">Proxima cobranca</span><span className="font-semibold text-text">{subscription.next_billing_date || '-'}</span></div>
                <div className="space-y-2 pt-2">{(subscription.usage_summary || []).map((usage) => <div key={`${subscription.id}-${usage.service_type}`} className="rounded-xl border border-[var(--border)] bg-surface/70 px-4 py-3"><div className="flex items-center justify-between gap-3 text-sm"><span className="text-text">{getServiceLabel(usage.service_type)}</span><span className="text-emerald-500 font-semibold">{usage.remaining} restantes</span></div><p className="text-xs text-muted mt-1">{usage.used}/{usage.total} usados neste ciclo</p></div>)}</div>
              </>
            ) : <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-5 text-sm text-muted">Este cliente ainda nao tem plano ativo.</div>}
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-card p-5 space-y-3">
            <p className="text-xs uppercase tracking-widest text-muted font-bold">Ultimos atendimentos</p>
            {recentAppointments.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-5 text-sm text-muted">Nenhum atendimento encontrado para este pet.</div> : <div className="space-y-2">{recentAppointments.map((item) => { const badge = statusBadge(item.status); return <div key={item.id} className="rounded-xl border border-[var(--border)] bg-surface/70 px-4 py-3 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-text">{serviceLabel(item.service_type)}</p><p className="text-xs text-muted mt-1">{fmtDate(item.scheduled_at) || '-'}</p></div><div className="text-right"><span className={`badge ${badge.cls}`}>{badge.label}</span><p className="text-xs text-emerald-500 font-semibold mt-1">{fmtCurrency(item.price || 0)}</p></div></div> })}</div>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function chunkRows(rows, size = 250) {
  const chunks = []
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size))
  return chunks
}

function LegacyClientsImportModal({ onClose, moduleId, tenantId, onDone }) {
  const [file, setFile] = useState(null)
  const [summary, setSummary] = useState(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  async function executeImport() {
    if (!file) return
    setImporting(true)
    setError('')
    setProgress(0)
    try {
      const parsed = await parseLegacyClients(file)
      const totals = { created: 0, updated: 0, skipped: parsed.skipped }
      const chunks = chunkRows(parsed.rows)
      for (const [index, rows] of chunks.entries()) {
        const result = await importLegacyRows({ kind: 'clients', rows, moduleId, tenantId })
        totals.created += Number(result.created || 0)
        totals.updated += Number(result.updated || 0)
        totals.skipped += Number(result.skipped || 0)
        setProgress(Math.round(((index + 1) / chunks.length) * 100))
      }
      setSummary(totals)
      await onDone?.()
    } catch (err) {
      setError(err?.message || 'Erro ao importar clientes legados.')
    } finally {
      setImporting(false)
    }
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(e) => !importing && e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-lg">
        <div className="modal-header">
          <h2 className="font-display font-bold text-xl text-text">Import Legado de Clientes</h2>
          {!importing && <button onClick={onClose} className="text-muted hover:text-text"><X size={18} /></button>}
        </div>
        <div className="modal-body space-y-4">
          <p className="text-sm text-muted">Importacao isolada para admin global. Aceita o XLS de clientes do sistema antigo.</p>
          <label className="flex items-center justify-between gap-3 border border-[var(--border)] rounded-xl p-4 cursor-pointer hover:bg-white/5 transition-colors">
            <div><p className="text-sm font-semibold text-text">Clientes GABRIEL.xls</p><p className="text-xs text-muted">{file ? file.name : 'Clientes legado (.xls/.xlsx)'}</p></div>
            <Upload size={18} className="text-emerald-500" />
            <input type="file" accept=".xls,.xlsx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          {importing && <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden"><div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${progress}%` }} /></div>}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {summary && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-text">Clientes: {summary.created} criados, {summary.updated} atualizados, {summary.skipped} ignorados.</div>}
          <div className="flex gap-3"><button disabled={importing} onClick={onClose} className="btn btn-secondary flex-1 justify-center">Fechar</button><button disabled={importing || !file} onClick={executeImport} className="btn btn-primary flex-1 justify-center"><Upload size={14} /> {importing ? `${progress}%` : 'Importar Clientes'}</button></div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function PetsPage() {
  const { clients: pets, loading, load, create, update, remove, speciesIcon, age } = useClients()
  const { serviceLabel, statusBadge } = useAppointments()
  const { loadPlans, loadClientSubscriptions, saveClientSubscription } = usePetshopAdvanced()
  const { activeModuleId } = useModuleCtx()
  const auth = useAuthCtx()
  const isGlobalAdmin = auth?.profile?.role === 'admin'
  const [search, setSearch] = useState('')
  const [speciesFilter, setSpeciesFilter] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [view, setView] = useState('grid')
  const [modalPet, setModalPet] = useState(null)
  const [drawerPet, setDrawerPet] = useState(null)
  const [legacyImportModal, setLegacyImportModal] = useState(false)
  const [plans, setPlans] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [pageError, setPageError] = useState('')

  const isPetModule = activeModuleId === 'petshop'

  async function reloadAll() {
    try {
      setPageError('')
      await Promise.all([load(), loadPlans().then(setPlans), loadClientSubscriptions().then(setSubscriptions)])
    } catch (error) {
      setPageError(error.message || 'Nao foi possivel carregar os clientes.')
    }
  }

  useEffect(() => { reloadAll() }, [])

  const latestSubscriptionByClient = useMemo(() => {
    const map = new Map()
    ;[...(subscriptions || [])].sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0)).forEach((item) => { if (!map.has(item.client_id)) map.set(item.client_id, item) })
    return map
  }, [subscriptions])

  const activePlanCount = useMemo(() => [...latestSubscriptionByClient.values()].filter((item) => item.status === 'active').length, [latestSubscriptionByClient])

  const filteredPets = useMemo(() => {
    const query = normalize(search)
    const queryDigits = digits(search)
    return (pets || []).filter((pet) => {
      const subscription = latestSubscriptionByClient.get(pet.id)
      const matchesText = !query || [pet.owner_name, pet.pet_name, pet.breed, pet.owner_address, pet.owner_neighborhood, pet.owner_city, subscription?.subscription_plans?.name].some((field) => normalize(field).includes(query))
      const matchesDigits = !queryDigits || [pet.phone, pet.owner_cpf].some((field) => digits(field).includes(queryDigits))
      const matchesSpecies = !speciesFilter || pet.species === speciesFilter
      const matchesPlan = !planFilter || subscription?.status === planFilter
      return (matchesText || matchesDigits) && matchesSpecies && matchesPlan
    })
  }, [latestSubscriptionByClient, pets, planFilter, search, speciesFilter])

  async function handleSave({ petPayload, planId, subscriptionStatus }) {
    const currentSubscription = modalPet?.id ? latestSubscriptionByClient.get(modalPet.id) : null
    const savedPet = modalPet?.id ? await update(modalPet.id, petPayload) : await create(petPayload)
    if (planId) {
      const selectedPlan = plans.find((plan) => plan.id === planId)
      await saveClientSubscription({ id: currentSubscription?.id, client_id: savedPet.id, plan_id: planId, plan: selectedPlan, status: subscriptionStatus || 'active', started_at: currentSubscription?.started_at || new Date().toISOString().slice(0, 10), next_billing_date: currentSubscription?.next_billing_date, services_used: currentSubscription?.services_used || {} })
    } else if (currentSubscription && currentSubscription.status !== 'cancelled') {
      await saveClientSubscription({ id: currentSubscription.id, client_id: savedPet.id, plan_id: currentSubscription.plan_id, plan: currentSubscription.subscription_plans, status: 'cancelled', started_at: currentSubscription.started_at, next_billing_date: currentSubscription.next_billing_date, services_used: currentSubscription.services_used || {} })
    }
    await reloadAll()
  }

  async function handleDelete(id) { await remove(id); if (drawerPet?.id === id) setDrawerPet(null) }

  return (
    <div className="page animate-fade-up space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><PawPrint size={22} className="text-emerald-500" />{isPetModule ? 'Clientes & Pets' : 'Clientes'}</h1>
          <p className="page-sub">{pets.length} cadastros, {activePlanCount} com plano ativo visivel nesta aba.</p>
        </div>
        <div className="flex gap-2">
          {isGlobalAdmin && <button onClick={() => setLegacyImportModal(true)} className="btn btn-secondary border-emerald-500/20 text-emerald-500"><Upload size={15} /> Import Legado</button>}
          <button onClick={() => setModalPet({})} className="btn btn-primary"><Plus size={15} /> Novo cadastro</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-[var(--border)] rounded-2xl p-5"><p className="text-xs uppercase tracking-widest text-muted font-bold">Cadastros ativos</p><p className="font-display font-bold text-3xl text-text mt-2">{pets.length}</p></div>
        <div className="bg-card border border-[var(--border)] rounded-2xl p-5"><p className="text-xs uppercase tracking-widest text-muted font-bold">Planos ativos</p><p className="font-display font-bold text-3xl text-emerald-500 mt-2">{activePlanCount}</p></div>
        <div className="bg-card border border-[var(--border)] rounded-2xl p-5"><p className="text-xs uppercase tracking-widest text-muted font-bold">Conexao com a aba de planos</p><p className="text-sm text-muted mt-2">Voce consegue cadastrar, pausar ou trocar plano direto daqui.</p></div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="inp pl-9" placeholder="Buscar tutor, pet, raca, cidade ou plano..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select className="inp w-auto" value={speciesFilter} onChange={(e) => setSpeciesFilter(e.target.value)}><option value="">Especies</option>{SPECIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <select className="inp w-auto" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}><option value="">Todos os planos</option><option value="active">Plano ativo</option><option value="paused">Plano pausado</option></select>
        <div className="flex bg-surface border border-[var(--border)] rounded-xl p-1"><button onClick={() => setView('grid')} className={`px-3 py-2 rounded-lg ${view === 'grid' ? 'bg-emerald-500 text-white' : 'text-muted'}`}><Grid size={16} /></button><button onClick={() => setView('list')} className={`px-3 py-2 rounded-lg ${view === 'list' ? 'bg-emerald-500 text-white' : 'text-muted'}`}><ListIcon size={16} /></button></div>
        <button onClick={reloadAll} className="btn btn-secondary"><RefreshCw size={14} /> Atualizar</button>
      </div>

      {pageError && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{pageError}</div>}

      {loading ? (
        <div className="rounded-2xl border border-[var(--border)] bg-card px-6 py-12 text-center text-muted"><RefreshCw size={18} className="animate-spin mx-auto mb-3" />Carregando clientes...</div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredPets.map((pet) => {
            const Icon = speciesIcon(pet.species)
            const subscription = latestSubscriptionByClient.get(pet.id)
            const ageLabel = age(pet.birth_date)
            return (
              <div key={pet.id} className="bg-card border border-[var(--border)] rounded-2xl p-5 transition-all hover:-translate-y-1 hover:border-emerald-500/30 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => setDrawerPet(pet)} className="flex items-start gap-4 text-left flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center flex-shrink-0">
                      <Icon size={24} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-bold text-lg text-text leading-tight break-words">
                        {pet.owner_name || 'Tutor sem nome'}
                      </p>
                      {subscription && (
                        <p className="text-sm font-semibold text-emerald-600 mt-1 break-words">
                          {subscription.subscription_plans?.name || 'Pacote ativo'}
                        </p>
                      )}
                      <p className="text-sm text-muted mt-1 break-words">
                        {pet.pet_name || 'Pet sem nome'}{pet.breed ? ` - ${pet.breed}` : ''}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setModalPet(pet)} className="btn btn-ghost btn-sm">Editar</button>
                    <button onClick={() => handleDelete(pet.id)} className="btn btn-ghost btn-sm text-red-400"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-[var(--border2)] grid grid-cols-1 gap-2 text-sm"><div className="flex items-center gap-2 text-muted"><Phone size={13} className="text-emerald-500" /><span>{formatPhone(pet.phone)}</span></div><div className="flex items-center gap-2 text-muted"><Weight size={13} className="text-emerald-500" /><span>{pet.weight_kg ? `${pet.weight_kg} kg` : 'Peso nao informado'}</span></div>{ageLabel && <div className="flex items-center gap-2 text-muted"><CalendarIcon size={13} className="text-emerald-500" /><span>{ageLabel}</span></div>}</div>
              </div>
            )
          })}
          {filteredPets.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-[var(--border)] px-6 py-12 text-center"><p className="text-text font-semibold">Nenhum cadastro encontrado</p><p className="text-muted text-sm mt-2">Tente remover filtros ou criar um novo cliente.</p></div>}
        </div>
      ) : (
        <div className="bg-card border border-[var(--border)] rounded-2xl overflow-hidden"><div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Tutor</th><th>Pet</th><th>Telefone</th><th>Plano</th><th className="text-right">Acoes</th></tr></thead><tbody>{filteredPets.map((pet) => { const subscription = latestSubscriptionByClient.get(pet.id); return <tr key={pet.id} className="cursor-pointer" onClick={() => setDrawerPet(pet)}><td className="font-semibold text-text">{pet.owner_name}</td><td>{pet.pet_name || '-'}</td><td>{formatPhone(pet.phone)}</td><td>{subscription ? <span className={`badge ${getPlanTone(subscription.status)}`}>{subscription.subscription_plans?.name || 'Plano'}</span> : <span className="text-muted">Sem plano</span>}</td><td className="text-right"><div className="flex justify-end gap-2"><button onClick={(e) => { e.stopPropagation(); setModalPet(pet) }} className="btn btn-secondary btn-sm">Editar</button><button onClick={(e) => { e.stopPropagation(); handleDelete(pet.id) }} className="btn btn-danger btn-sm">Excluir</button></div></td></tr> })}{filteredPets.length === 0 && <tr><td colSpan={5} className="text-center text-muted py-10">Nenhum cadastro encontrado.</td></tr>}</tbody></table></div></div>
      )}

      {modalPet !== null && <PetModal pet={modalPet?.id ? modalPet : null} plans={plans.filter((plan) => plan.active)} subscription={modalPet?.id ? latestSubscriptionByClient.get(modalPet.id) : null} onClose={() => setModalPet(null)} onSave={handleSave} />}
      {drawerPet && <PetDrawer pet={drawerPet} subscription={latestSubscriptionByClient.get(drawerPet.id)} onClose={() => setDrawerPet(null)} onEdit={(pet) => { setDrawerPet(null); setModalPet(pet) }} speciesIcon={speciesIcon} serviceLabel={serviceLabel} statusBadge={statusBadge} />}
      {legacyImportModal && <LegacyClientsImportModal moduleId={activeModuleId} tenantId={auth?.activeTenantId} onClose={() => setLegacyImportModal(false)} onDone={reloadAll} />}
    </div>
  )
}
