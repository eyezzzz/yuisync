import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  Briefcase,
  Download,
  Percent,
  Plus,
  RefreshCw,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { usePetshopAdvanced } from '../hooks/usePetshopAdvanced'
import { fmtCurrency } from '../../../lib/supabase'
import {
  COMMISSION_SCOPES,
  DEFAULT_PETSHOP_SERVICES,
  SERVICE_GROUPS,
  STAFF_TYPE_OPTIONS,
  commissionScopeLabel,
  normalizeCode,
  staffTypeLabel,
} from '../lib/petshopTeam'

const TABS = [
  { id: 'fechamento', label: 'Fechamento', icon: Wallet },
  { id: 'regras', label: 'Regras de comissao', icon: Percent },
  { id: 'funcionarios', label: 'Funcionarios', icon: Users },
  { id: 'servicos', label: 'Servicos', icon: Briefcase },
]

const emptyRange = () => {
  const now = new Date()
  return {
    startDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  }
}

const dateLabel = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '-'
const profileName = (profile) => profile?.full_name || profile?.email || 'Colaborador'
const serviceName = (services, code) => services.find((service) => service.code === code)?.name || code || '-'
const productName = (products, id) => products.find((product) => product.id === id)?.name || id || '-'

function ModalShell({ title, onClose, children }) {
  return createPortal(
    <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box max-w-2xl">
        <div className="modal-header">
          <h2 className="font-display font-bold text-xl text-text">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-text"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

function RuleModal({ profiles, services, products, categories, rule, onClose, onSave }) {
  const [form, setForm] = useState({
    profile_id: rule?.profile_id || profiles.find((profile) => profile.active !== false)?.id || '',
    scope: rule?.scope || rule?.applies_to || 'service',
    service_code: rule?.service_code || '',
    product_id: rule?.product_id || '',
    category: rule?.category || '',
    type: rule?.type || 'percentage',
    rate: rule?.rate ?? 5,
    active: rule?.active !== false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  async function submit() {
    setSaving(true)
    setError('')
    try {
      await onSave({ id: rule?.id, ...form })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={rule ? 'Editar regra de comissao' : 'Nova regra de comissao'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="inp-label">Colaborador</label>
          <select className="inp" value={form.profile_id} onChange={(event) => set('profile_id', event.target.value)}>
            <option value="">Selecione</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profileName(profile)}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="inp-label">Escopo</label>
            <select className="inp" value={form.scope} onChange={(event) => set('scope', event.target.value)}>
              {COMMISSION_SCOPES.map((scope) => (
                <option key={scope.value} value={scope.value}>{scope.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="inp-label">Tipo de comissao</label>
            <select className="inp" value={form.type} onChange={(event) => set('type', event.target.value)}>
              <option value="percentage">Percentual (%)</option>
              <option value="fixed">Valor fixo</option>
            </select>
          </div>
        </div>

        {form.scope === 'service' && (
          <div>
            <label className="inp-label">Servico</label>
            <select className="inp" value={form.service_code} onChange={(event) => set('service_code', event.target.value)}>
              <option value="">Selecione</option>
              {services.filter((service) => service.active !== false).map((service) => (
                <option key={service.code} value={service.code}>{service.name}</option>
              ))}
            </select>
          </div>
        )}

        {form.scope === 'category' && (
          <div>
            <label className="inp-label">Categoria</label>
            <select className="inp" value={form.category} onChange={(event) => set('category', event.target.value)}>
              <option value="">Selecione</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        )}

        {form.scope === 'product' && (
          <div>
            <label className="inp-label">Produto</label>
            <select className="inp" value={form.product_id} onChange={(event) => set('product_id', event.target.value)}>
              <option value="">Selecione</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="inp-label">{form.type === 'fixed' ? 'Valor fixo (R$)' : 'Percentual (%)'}</label>
            <input className="inp" type="number" min="0" step="0.01" value={form.rate} onChange={(event) => set('rate', event.target.value)} />
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-surface/70 px-4 py-3 text-sm text-text mt-6">
            <input type="checkbox" checked={form.active} onChange={(event) => set('active', event.target.checked)} />
            Regra ativa
          </label>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={submit} disabled={saving} className="btn btn-primary flex-1 justify-center">{saving ? 'Salvando...' : 'Salvar regra'}</button>
        </div>
      </div>
    </ModalShell>
  )
}

function ServiceModal({ service, onClose, onSave }) {
  const base = service || DEFAULT_PETSHOP_SERVICES[0]
  const [form, setForm] = useState({
    id: service?.id,
    code: base.code || '',
    name: base.name || '',
    group_type: base.group_type || 'banho_tosa',
    default_price: base.default_price ?? 0,
    default_duration_min: base.default_duration_min ?? 60,
    commission_type: base.commission_type || 'percentage',
    commission_rate: base.commission_rate ?? 0,
    active: base.active !== false,
    sort_order: base.sort_order ?? 999,
    icon: base.icon || 'paw',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  async function submit() {
    setSaving(true)
    setError('')
    try {
      await onSave({ ...form, code: form.code || normalizeCode(form.name) })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={service ? 'Editar servico' : 'Novo servico'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="inp-label">Nome do servico</label>
            <input className="inp" value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Ex: Tosa higiênica" />
          </div>
          <div>
            <label className="inp-label">Codigo interno</label>
            <input className="inp" value={form.code} onChange={(event) => set('code', normalizeCode(event.target.value))} placeholder="tosa_higienica" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="inp-label">Grupo</label>
            <select className="inp" value={form.group_type} onChange={(event) => set('group_type', event.target.value)}>
              {SERVICE_GROUPS.map((group) => (
                <option key={group.id} value={group.id}>{group.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="inp-label">Preco padrao</label>
            <input className="inp" type="number" min="0" step="0.01" value={form.default_price} onChange={(event) => set('default_price', event.target.value)} />
          </div>
          <div>
            <label className="inp-label">Duracao (min)</label>
            <input className="inp" type="number" min="15" step="15" value={form.default_duration_min} onChange={(event) => set('default_duration_min', event.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="inp-label">Tipo da comissao padrao</label>
            <select className="inp" value={form.commission_type} onChange={(event) => set('commission_type', event.target.value)}>
              <option value="percentage">Percentual (%)</option>
              <option value="fixed">Valor fixo</option>
            </select>
          </div>
          <div>
            <label className="inp-label">{form.commission_type === 'fixed' ? 'Valor fixo' : 'Percentual'}</label>
            <input className="inp" type="number" min="0" step="0.01" value={form.commission_rate} onChange={(event) => set('commission_rate', event.target.value)} />
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-surface/70 px-4 py-3 text-sm text-text mt-6">
            <input type="checkbox" checked={form.active} onChange={(event) => set('active', event.target.checked)} />
            Servico ativo
          </label>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={submit} disabled={saving} className="btn btn-primary flex-1 justify-center">{saving ? 'Salvando...' : 'Salvar servico'}</button>
        </div>
      </div>
    </ModalShell>
  )
}

function MemberModal({ member, onClose, onSave }) {
  const isEdit = Boolean(member?.id)
  const [form, setForm] = useState({
    id: member?.id || '',
    full_name: member?.full_name || '',
    email: member?.email || '',
    password: '',
    staff_type: member?.staff_type || 'funcionario',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  async function submit() {
    setSaving(true)
    setError('')
    try {
      await onSave(form)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={isEdit ? 'Editar funcionario' : 'Adicionar funcionario'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="inp-label">Nome completo</label>
          <input className="inp" value={form.full_name} onChange={(event) => set('full_name', event.target.value)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="inp-label">Email de acesso</label>
            <input className="inp" type="email" value={form.email} onChange={(event) => set('email', event.target.value)} disabled={isEdit} />
          </div>
          {!isEdit && (
            <div>
              <label className="inp-label">Senha temporaria</label>
              <input className="inp" type="password" value={form.password} onChange={(event) => set('password', event.target.value)} placeholder="12+ caracteres, maiuscula e numero" />
            </div>
          )}
        </div>
        <div>
          <label className="inp-label">Funcao operacional</label>
          <select className="inp" value={form.staff_type} onChange={(event) => set('staff_type', event.target.value)}>
            {STAFF_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={submit} disabled={saving} className="btn btn-primary flex-1 justify-center">{saving ? 'Salvando...' : 'Salvar funcionario'}</button>
        </div>
      </div>
    </ModalShell>
  )
}

export default function EquipePage() {
  const {
    loadTeamSnapshot,
    loadCommissionRules,
    saveCommissionRule,
    deleteCommissionRule,
    exportCommissionCsv,
    loadPetshopServices,
    savePetshopService,
    setPetshopServiceActive,
    loadTeamMembers,
    saveTeamMember,
    setTeamMemberActive,
    loadCommissionCatalog,
  } = usePetshopAdvanced()

  const [activeTab, setActiveTab] = useState('fechamento')
  const [profiles, setProfiles] = useState([])
  const [rules, setRules] = useState([])
  const [rows, setRows] = useState([])
  const [pendingServices, setPendingServices] = useState([])
  const [services, setServices] = useState(DEFAULT_PETSHOP_SERVICES)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [range, setRange] = useState(emptyRange)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)

  async function reload(nextRange = range) {
    setLoading(true)
    setError('')
    try {
      const [members, rulesPayload, snapshot, serviceRows, catalog] = await Promise.all([
        loadTeamMembers({ includeInactive: true }),
        loadCommissionRules(),
        loadTeamSnapshot(nextRange),
        loadPetshopServices(),
        loadCommissionCatalog(),
      ])
      setProfiles(members.length ? members : rulesPayload.profiles)
      setRules(rulesPayload.rules)
      setRows(snapshot.rows)
      setPendingServices(snapshot.pendingServices || [])
      setServices(serviceRows)
      setProducts(catalog.products)
      setCategories(catalog.categories)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const totals = useMemo(() => rows.reduce((acc, row) => ({
    serviceRevenue: acc.serviceRevenue + Number(row.service_revenue || 0),
    salesRevenue: acc.salesRevenue + Number(row.sales_revenue || 0),
    motoboyRevenue: acc.motoboyRevenue + Number(row.motoboy_revenue || 0),
    commission: acc.commission + Number(row.total_commission || row.commission || 0),
    serviceCommission: acc.serviceCommission + Number(row.service_commission || 0),
    salesCommission: acc.salesCommission + Number(row.sales_commission || 0),
    motoboyCommission: acc.motoboyCommission + Number(row.motoboy_commission || 0),
  }), { serviceRevenue: 0, salesRevenue: 0, motoboyRevenue: 0, commission: 0, serviceCommission: 0, salesCommission: 0, motoboyCommission: 0 }), [rows])

  async function handleSaveRule(payload) {
    await saveCommissionRule(payload)
    await reload()
  }

  async function handleDeleteRule(ruleId) {
    await deleteCommissionRule(ruleId)
    await reload()
  }

  async function handleSaveService(payload) {
    await savePetshopService(payload)
    await reload()
  }

  async function handleToggleService(service) {
    await setPetshopServiceActive(service, service.active === false)
    await reload()
  }

  async function handleSaveMember(payload) {
    await saveTeamMember(payload)
    await reload()
  }

  async function handleToggleMember(profile) {
    await setTeamMemberActive(profile.id, profile.active === false)
    await reload()
  }

  return (
    <div className="page animate-fade-up space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Users size={22} className="text-emerald-400" />
            Equipe e Comissoes
          </h1>
          <p className="page-sub">Funcionarios, servicos, regras e fechamento mensal.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => reload()} className="btn btn-secondary"><RefreshCw size={15} /> Atualizar</button>
          {activeTab === 'fechamento' && <button onClick={() => exportCommissionCsv(rows)} className="btn btn-secondary"><Download size={15} /> Exportar CSV</button>}
          {activeTab === 'regras' && <button onClick={() => setModal({ type: 'rule' })} className="btn btn-primary"><Plus size={15} /> Nova regra</button>}
          {activeTab === 'funcionarios' && <button onClick={() => setModal({ type: 'member' })} className="btn btn-primary"><Plus size={15} /> Funcionario</button>}
          {activeTab === 'servicos' && <button onClick={() => setModal({ type: 'service' })} className="btn btn-primary"><Plus size={15} /> Servico</button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 bg-card border border-[var(--border)] rounded-xl p-1 w-fit max-w-full">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors ${active ? 'bg-emerald-500 text-gray-950' : 'text-muted hover:text-text hover:bg-white/5'}`}>
              <Icon size={14} /> {tab.label}
            </button>
          )
        })}
      </div>

      {error && (
        <p className="text-sm rounded-xl px-4 py-3 bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-2">
          <ShieldAlert size={14} /> {error}
        </p>
      )}

      {activeTab === 'fechamento' && (
        <div className="space-y-5">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="inp-label">Inicio</label>
              <input aria-label="Data inicial das comissões" className="inp" type="date" value={range.startDate} onChange={(event) => setRange((prev) => ({ ...prev, startDate: event.target.value }))} />
            </div>
            <div>
              <label className="inp-label">Fim</label>
              <input aria-label="Data final das comissões" className="inp" type="date" value={range.endDate} onChange={(event) => setRange((prev) => ({ ...prev, endDate: event.target.value }))} />
            </div>
            <button onClick={() => reload(range)} className="btn btn-primary"><RefreshCw size={15} /> Recalcular</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-card border border-[var(--border)] rounded-xl p-5">
              <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Pessoas com producao</p>
              <p className="font-display font-bold text-3xl text-text">{rows.length}</p>
            </div>
            <div className="bg-card border border-[var(--border)] rounded-xl p-5">
              <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Servicos</p>
              <p className="font-display font-bold text-3xl text-emerald-400">{fmtCurrency(totals.serviceRevenue)}</p>
            </div>
            <div className="bg-card border border-[var(--border)] rounded-xl p-5">
              <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Vendas</p>
              <p className="font-display font-bold text-3xl text-emerald-400">{fmtCurrency(totals.salesRevenue)}</p>
            </div>
            <div className="bg-card border border-[var(--border)] rounded-xl p-5">
              <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Total a pagar</p>
              <p className="font-display font-bold text-3xl text-amber-400">{fmtCurrency(totals.commission)}</p>
            </div>
          </div>

          {pendingServices.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-text">Servicos concluidos sem responsavel</p>
                  <p className="text-sm text-muted mt-1">Defina o responsavel na agenda para esses atendimentos entrarem no fechamento.</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {pendingServices.slice(0, 6).map((appt) => (
                  <div key={appt.id} className="rounded-xl border border-[var(--border)] bg-card px-4 py-3 text-sm">
                    <p className="font-semibold text-text">{appt.client?.pet_name || appt.client?.owner_name || 'Pet'} - {serviceName(services, appt.service_type)}</p>
                    <p className="text-xs text-muted mt-1">{dateLabel(appt.scheduled_at)} • {fmtCurrency(appt.price || 0)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="tbl-wrapper overflow-hidden">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Servicos</th>
                  <th>Vendas</th>
                  <th>Motoboy</th>
                  <th>Comissao servicos</th>
                  <th>Comissao vendas</th>
                  <th>Comissao motoboy</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.profile_id}>
                    <td>{row.collaborator_name || row.groomer_name}</td>
                    <td>{row.service_count || 0} • {fmtCurrency(row.service_revenue || 0)}</td>
                    <td>{row.sales_count || 0} • {fmtCurrency(row.sales_revenue || 0)}</td>
                    <td>{row.motoboy_count || 0} • {fmtCurrency(row.motoboy_revenue || 0)}</td>
                    <td className="text-amber-400 font-semibold">{fmtCurrency(row.service_commission || 0)}</td>
                    <td className="text-amber-400 font-semibold">{fmtCurrency(row.sales_commission || 0)}</td>
                    <td className="text-amber-400 font-semibold">{fmtCurrency(row.motoboy_commission || 0)}</td>
                    <td className="text-emerald-400 font-bold">{fmtCurrency(row.total_commission || row.commission || 0)}</td>
                  </tr>
                ))}
                {!rows.length && !loading && (
                  <tr><td colSpan={8} className="text-center text-muted py-10">Sem producao concluida no periodo.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'regras' && (
        <div className="tbl-wrapper overflow-hidden">
          <table className="tbl">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Escopo</th>
                <th>Referencia</th>
                <th>Tipo</th>
                <th>Taxa</th>
                <th>Status</th>
                <th className="text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const profile = profiles.find((entry) => entry.id === rule.profile_id)
                const reference = rule.scope === 'service' ? serviceName(services, rule.service_code)
                  : rule.scope === 'product' ? productName(products, rule.product_id)
                    : rule.scope === 'category' ? rule.category
                      : '-'
                return (
                  <tr key={rule.id}>
                    <td>{profileName(profile)}</td>
                    <td>{commissionScopeLabel(rule.scope || rule.applies_to)}</td>
                    <td>{reference}</td>
                    <td>{rule.type === 'fixed' ? 'Fixo' : 'Percentual'}</td>
                    <td>{rule.type === 'fixed' ? fmtCurrency(rule.rate) : `${rule.rate}%`}</td>
                    <td><span className={`badge ${rule.active === false ? 'badge-gray' : 'badge-green'}`}>{rule.active === false ? 'Inativa' : 'Ativa'}</span></td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setModal({ type: 'rule', data: rule })} className="btn btn-secondary btn-sm">Editar</button>
                        <button onClick={() => handleDeleteRule(rule.id)} className="btn btn-danger btn-sm">Excluir</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!rules.length && !loading && (
                <tr><td colSpan={7} className="text-center text-muted py-10">Nenhuma regra cadastrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'funcionarios' && (
        <div className="tbl-wrapper overflow-hidden">
          <table className="tbl">
            <thead>
              <tr>
                <th>Funcionario</th>
                <th>Funcao</th>
                <th>Status</th>
                <th>Negocios</th>
                <th className="text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id}>
                  <td>
                    <p className="font-semibold text-text">{profileName(profile)}</p>
                    <p className="text-xs text-muted">{profile.email}</p>
                  </td>
                  <td>{staffTypeLabel(profile.staff_type)}</td>
                  <td><span className={`badge ${profile.active === false ? 'badge-red' : 'badge-green'}`}>{profile.active === false ? 'Bloqueado' : 'Ativo'}</span></td>
                  <td className="text-xs text-muted">{profile.tenants?.map((tenant) => tenant.name || tenant.slug).join(', ') || '-'}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setModal({ type: 'member', data: profile })} className="btn btn-secondary btn-sm">Editar</button>
                      <button onClick={() => handleToggleMember(profile)} className={`btn btn-sm ${profile.active === false ? 'btn-success' : 'btn-danger'}`}>
                        {profile.active === false ? 'Reativar' : 'Bloquear'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!profiles.length && !loading && (
                <tr><td colSpan={5} className="text-center text-muted py-10">Nenhum funcionario encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'servicos' && (
        <div className="tbl-wrapper overflow-hidden">
          <table className="tbl">
            <thead>
              <tr>
                <th>Servico</th>
                <th>Grupo</th>
                <th>Preco padrao</th>
                <th>Duracao</th>
                <th>Comissao padrao</th>
                <th>Status</th>
                <th className="text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id || service.code}>
                  <td>
                    <p className="font-semibold text-text">{service.name}</p>
                    <p className="text-xs text-muted">{service.code}</p>
                  </td>
                  <td>{SERVICE_GROUPS.find((group) => group.id === service.group_type)?.label || service.group_type}</td>
                  <td>{fmtCurrency(service.default_price || 0)}</td>
                  <td>{service.default_duration_min || 0} min</td>
                  <td>{service.commission_type === 'fixed' ? fmtCurrency(service.commission_rate || 0) : `${service.commission_rate || 0}%`}</td>
                  <td><span className={`badge ${service.active === false ? 'badge-gray' : 'badge-green'}`}>{service.active === false ? 'Inativo' : 'Ativo'}</span></td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setModal({ type: 'service', data: service })} className="btn btn-secondary btn-sm">Editar</button>
                      <button onClick={() => handleToggleService(service)} className="btn btn-secondary btn-sm">
                        {service.active === false ? <ToggleLeft size={14} /> : <ToggleRight size={14} />}
                        {service.active === false ? 'Ativar' : 'Inativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal?.type === 'rule' && (
        <RuleModal
          profiles={profiles.filter((profile) => profile.active !== false)}
          services={services}
          products={products}
          categories={categories}
          rule={modal.data}
          onClose={() => setModal(null)}
          onSave={handleSaveRule}
        />
      )}
      {modal?.type === 'service' && (
        <ServiceModal service={modal.data} onClose={() => setModal(null)} onSave={handleSaveService} />
      )}
      {modal?.type === 'member' && (
        <MemberModal member={modal.data} onClose={() => setModal(null)} onSave={handleSaveMember} />
      )}
    </div>
  )
}
