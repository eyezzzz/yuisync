import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bike,
  Clock3,
  Droplets,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Stethoscope,
  ToggleLeft,
  ToggleRight,
  X,
} from 'lucide-react'

import { fmtCurrency } from '../../../lib/supabase'
import { usePetshopAdvanced } from '../hooks/usePetshopAdvanced'

const SERVICE_GROUPS = [
  { id: 'banho_tosa', label: 'Banho/Tosa', icon: Droplets, defaultIcon: 'droplets' },
  { id: 'veterinaria', label: 'Veterinária', icon: Stethoscope, defaultIcon: 'stethoscope' },
  { id: 'motoboy', label: 'Motoboy', icon: Bike, defaultIcon: 'bike' },
]

const groupMeta = (groupId) => SERVICE_GROUPS.find((group) => group.id === groupId) || SERVICE_GROUPS[0]

const emptyService = (groupId = 'banho_tosa') => ({
  name: '',
  code: '',
  group_type: groupId,
  default_price: '',
  default_duration_min: '60',
  commission_rate: '0',
  active: true,
  sort_order: '999',
})

function ServiceModal({ service, initialGroup, onClose, onSave }) {
  const [form, setForm] = useState(() => service
    ? {
        ...emptyService(service.group_type),
        ...service,
        default_price: String(service.default_price ?? ''),
        default_duration_min: String(service.default_duration_min ?? 60),
        commission_rate: String(service.commission_rate ?? 0),
        sort_order: String(service.sort_order ?? 999),
      }
    : emptyService(initialGroup))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  async function submit() {
    const name = String(form.name || '').trim()
    const price = Number(form.default_price)
    const duration = Number(form.default_duration_min)
    const commission = Number(form.commission_rate)

    if (!name) return setError('Informe o nome do serviço.')
    if (!Number.isFinite(price) || price < 0) return setError('Informe um valor válido.')
    if (!Number.isFinite(duration) || duration < 15) return setError('A duração mínima é de 15 minutos.')
    if (!Number.isFinite(commission) || commission < 0) return setError('Informe uma comissão válida.')

    setSaving(true)
    setError('')
    try {
      const metadata = groupMeta(form.group_type)
      await onSave({
        id: service?.id,
        name,
        code: String(form.code || '').trim(),
        group_type: form.group_type,
        default_price: price,
        default_duration_min: duration,
        commission_type: 'percentage',
        commission_rate: commission,
        active: form.active !== false,
        sort_order: Number(form.sort_order || 999),
        icon: metadata.defaultIcon,
      })
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Não foi possível salvar o serviço.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box max-w-xl">
        <div className="modal-header">
          <div>
            <h2 className="font-display text-xl font-bold text-text">{service ? 'Editar serviço' : 'Novo serviço'}</h2>
            <p className="mt-1 text-sm text-muted">O item será salvo diretamente no catálogo operacional e aparecerá na tabela da área escolhida.</p>
          </div>
          <button type="button" aria-label="Fechar serviço" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>

        <div className="modal-body space-y-5">
          <div>
            <label className="inp-label">Área do serviço</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {SERVICE_GROUPS.map((group) => {
                const Icon = group.icon
                const selected = form.group_type === group.id
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => set('group_type', group.id)}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${selected ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-300' : 'border-[var(--border2)] text-muted hover:bg-white/5 hover:text-text'}`}
                  >
                    <Icon size={15}/>{group.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="inp-label">Nome</label>
              <input className="inp" value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Ex.: Escovação dental"/>
            </div>
            <div>
              <label className="inp-label">Código interno</label>
              <input className="inp" value={form.code} onChange={(event) => set('code', event.target.value)} placeholder="Gerado pelo nome"/>
            </div>
            <div>
              <label className="inp-label">Valor</label>
              <input className="inp" type="number" min="0" step="0.01" value={form.default_price} onChange={(event) => set('default_price', event.target.value)}/>
            </div>
            <div>
              <label className="inp-label">Duração (min)</label>
              <input className="inp" type="number" min="15" step="5" value={form.default_duration_min} onChange={(event) => set('default_duration_min', event.target.value)}/>
            </div>
            <div>
              <label className="inp-label">Comissão (%)</label>
              <input className="inp" type="number" min="0" step="0.01" value={form.commission_rate} onChange={(event) => set('commission_rate', event.target.value)}/>
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-[var(--border2)] px-4 py-3 text-sm text-text">
            <input type="checkbox" checked={form.active !== false} onChange={(event) => set('active', event.target.checked)}/>
            Serviço ativo e disponível para uso
          </label>

          {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1 justify-center">Cancelar</button>
            <button type="button" onClick={submit} disabled={saving} className="btn btn-primary flex-1 justify-center"><Save size={15}/>{saving ? 'Salvando...' : 'Salvar serviço'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function ServicosPage() {
  const {
    loadPetshopServices,
    savePetshopService,
    setPetshopServiceActive,
  } = usePetshopAdvanced()
  const [services, setServices] = useState([])
  const [activeGroup, setActiveGroup] = useState('banho_tosa')
  const [modal, setModal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [changingId, setChangingId] = useState('')
  const [error, setError] = useState('')

  async function reload() {
    setLoading(true)
    setError('')
    try {
      setServices(await loadPetshopServices())
    } catch (loadError) {
      setError(loadError?.message || 'Não foi possível carregar os serviços.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const counts = useMemo(() => SERVICE_GROUPS.reduce((map, group) => {
    map[group.id] = services.filter((service) => service.group_type === group.id).length
    return map
  }, {}), [services])

  const visibleServices = useMemo(() => services
    .filter((service) => service.group_type === activeGroup)
    .sort((left, right) => Number(left.sort_order || 999) - Number(right.sort_order || 999)
      || String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR')), [services, activeGroup])

  async function handleSave(payload) {
    await savePetshopService(payload)
    setActiveGroup(payload.group_type)
    await reload()
  }

  async function toggleService(service) {
    setChangingId(service.id)
    setError('')
    try {
      await setPetshopServiceActive(service, service.active === false)
      await reload()
    } catch (toggleError) {
      setError(toggleError?.message || 'Não foi possível alterar o serviço.')
    } finally {
      setChangingId('')
    }
  }

  return (
    <div className="page animate-fade-up space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Catálogo de Serviços</h1>
          <p className="page-sub">Cadastre serviços manuais e organize cada item diretamente em Banho/Tosa, Veterinária ou Motoboy.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={reload} className="btn btn-secondary"><RefreshCw size={15}/>Atualizar</button>
          <button type="button" onClick={() => setModal({ mode: 'create' })} className="btn btn-primary"><Plus size={15}/>Novo serviço</button>
        </div>
      </div>

      <nav className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-card p-1" aria-label="Áreas do catálogo de serviços">
        {SERVICE_GROUPS.map((group) => {
          const Icon = group.icon
          const selected = activeGroup === group.id
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => setActiveGroup(group.id)}
              className={`flex min-w-fit items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-colors ${selected ? 'bg-emerald-500 text-gray-950' : 'text-muted hover:bg-white/5 hover:text-text'}`}
            >
              <Icon size={15}/>{group.label}<span className={`rounded-full px-2 py-0.5 text-[10px] ${selected ? 'bg-black/15' : 'bg-white/8'}`}>{counts[group.id] || 0}</span>
            </button>
          )
        })}
      </nav>

      {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-card">
        <div className="flex items-center gap-2 border-b border-[var(--border2)] px-5 py-4">
          {(() => { const Icon = groupMeta(activeGroup).icon; return <Icon size={17} className="text-emerald-400"/> })()}
          <h2 className="section-title">Serviços de {groupMeta(activeGroup).label}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl min-w-[850px]">
            <thead><tr><th>Serviço</th><th>Código</th><th>Valor</th><th>Duração</th><th>Comissão</th><th>Origem</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              {visibleServices.map((service) => {
                const productManaged = service.service_source === 'product'
                return (
                  <tr key={`${service.group_type}-${service.id || service.code}`}>
                    <td className="font-semibold text-text">{service.name}</td>
                    <td className="font-mono text-xs text-muted">{service.code}</td>
                    <td>{fmtCurrency(service.default_price || 0)}</td>
                    <td><span className="inline-flex items-center gap-1"><Clock3 size={13}/>{service.default_duration_min || 60} min</span></td>
                    <td>{Number(service.commission_rate || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</td>
                    <td><span className={`badge ${productManaged ? 'badge-blue' : 'badge-gray'}`}>{productManaged ? 'Produto / Estoque' : 'Manual'}</span></td>
                    <td><span className={`badge ${service.active !== false ? 'badge-green' : 'badge-gray'}`}>{service.active !== false ? 'Ativo' : 'Inativo'}</span></td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button type="button" disabled={productManaged} title={productManaged ? 'Edite este item no Estoque' : 'Editar serviço'} onClick={() => setModal({ mode: 'edit', service })} className="btn btn-secondary btn-sm"><Pencil size={13}/>Editar</button>
                        <button type="button" disabled={productManaged || changingId === service.id} onClick={() => toggleService(service)} className="btn btn-ghost btn-sm">
                          {service.active !== false ? <ToggleRight size={17} className="text-emerald-400"/> : <ToggleLeft size={17}/>} {service.active !== false ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!visibleServices.length && !loading && (
                <tr><td colSpan={8} className="py-12 text-center text-muted">Nenhum serviço nesta área. Clique em “Novo serviço” para cadastrar o primeiro.</td></tr>
              )}
              {loading && <tr><td colSpan={8} className="py-12 text-center text-muted">Carregando serviços...</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {modal && (
        <ServiceModal
          service={modal.mode === 'edit' ? modal.service : null}
          initialGroup={activeGroup}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
