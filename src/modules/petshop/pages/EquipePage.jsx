import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  Download,
  Percent,
  RefreshCw,
  Users,
  Wallet,
} from 'lucide-react'
import { usePetshopAdvanced } from '../hooks/usePetshopAdvanced'
import { fmtCurrency } from '../../../lib/supabase'
import { useAuthCtx } from '../../../context/AuthContext'
import { normalizeOperationalStaff } from '../../../../shared/petshopOperations'

const TABS = [
  { id: 'fechamento', label: 'Comissoes', icon: Wallet },
  { id: 'esteticistas', label: 'Esteticistas', icon: Users },
]

const emptyRange = () => {
  const now = new Date()
  return {
    startDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  }
}

const dateLabel = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '-'
const serviceName = (services, code) => services.find((service) => service.code === code)?.name || code || '-'

export default function EquipePage() {
  const {
    loadTeamSnapshot,
    exportCommissionCsv,
    loadPetshopServices,
  } = usePetshopAdvanced()
  const { storeSettings } = useAuthCtx()

  const [activeTab, setActiveTab] = useState('fechamento')
  const [rows, setRows] = useState([])
  const [pendingServices, setPendingServices] = useState([])
  const [services, setServices] = useState([])
  const [range, setRange] = useState(emptyRange)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const configuredStaff = useMemo(
    () => normalizeOperationalStaff(storeSettings?.petshop_operational_staff),
    [storeSettings?.petshop_operational_staff],
  )

  const staffCards = useMemo(() => {
    const map = new Map(configuredStaff.map((person) => [person.key, person]))
    rows.forEach((row) => {
      if (!row.staff_key || map.has(row.staff_key)) return
      map.set(row.staff_key, {
        key: row.staff_key,
        name: row.collaborator_name || row.staff_key,
        active: row.detail?.active !== false,
      })
    })
    return [...map.values()]
  }, [configuredStaff, rows])

  async function reload(nextRange = range) {
    setLoading(true)
    setError('')
    try {
      const [snapshot, serviceRows] = await Promise.all([
        loadTeamSnapshot(nextRange),
        loadPetshopServices(),
      ])
      setRows(snapshot.rows || [])
      setPendingServices(snapshot.pendingServices || [])
      setServices(serviceRows || [])
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
    serviceCount: acc.serviceCount + Number(row.service_count || 0),
    serviceRevenue: acc.serviceRevenue + Number(row.service_revenue || 0),
    groomingCommission: acc.groomingCommission + Number(row.grooming_commission || 0),
    otherCommission: acc.otherCommission + Number(row.other_service_commission || 0),
    commission: acc.commission + Number(row.total_commission || 0),
  }), {
    serviceCount: 0,
    serviceRevenue: 0,
    groomingCommission: 0,
    otherCommission: 0,
    commission: 0,
  }), [rows])

  return (
    <div className="page animate-fade-up space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Percent size={22} className="text-emerald-400" />
            Comissoes
          </h1>
          <p className="page-sub">Fechamento automatico dos responsaveis escolhidos na Agenda.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => reload()} className="btn btn-secondary">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
          {activeTab === 'fechamento' && (
            <button onClick={() => exportCommissionCsv(rows)} className="btn btn-secondary">
              <Download size={15} /> Exportar CSV
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 bg-card border border-[var(--border)] rounded-xl p-1 w-fit max-w-full">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors ${
                active ? 'bg-emerald-500 text-gray-950' : 'text-muted hover:text-text hover:bg-white/5'
              }`}
            >
              <Icon size={14} /> {tab.label}
            </button>
          )
        })}
      </div>

      {error && (
        <p className="text-sm rounded-xl px-4 py-3 bg-red-500/10 text-red-400 border border-red-500/20">
          {error}
        </p>
      )}

      {activeTab === 'fechamento' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-5 py-4">
            <div className="flex items-start gap-3">
              <CheckCircle size={18} className="mt-0.5 text-emerald-400" />
              <div>
                <p className="font-semibold text-text">Calculo automatico por servico concluido</p>
                <p className="mt-1 text-sm text-muted">
                  Tosa recebe 10%. Banho e qualquer outro servico estetico recebem 5%. O responsavel vem diretamente da Agenda.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="inp-label">Inicio</label>
              <input
                aria-label="Data inicial das comissoes"
                className="inp"
                type="date"
                value={range.startDate}
                onChange={(event) => setRange((prev) => ({ ...prev, startDate: event.target.value }))}
              />
            </div>
            <div>
              <label className="inp-label">Fim</label>
              <input
                aria-label="Data final das comissoes"
                className="inp"
                type="date"
                value={range.endDate}
                onChange={(event) => setRange((prev) => ({ ...prev, endDate: event.target.value }))}
              />
            </div>
            <button onClick={() => reload(range)} className="btn btn-primary">
              <RefreshCw size={15} /> Recalcular
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-[var(--border)] rounded-xl p-5">
              <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Servicos concluidos</p>
              <p className="font-display font-bold text-3xl text-text">{totals.serviceCount}</p>
            </div>
            <div className="bg-card border border-[var(--border)] rounded-xl p-5">
              <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Receita estetica</p>
              <p className="font-display font-bold text-3xl text-emerald-400">{fmtCurrency(totals.serviceRevenue)}</p>
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
                  <p className="text-sm text-muted mt-1">Escolha o responsavel na Agenda para incluir estes atendimentos no fechamento.</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {pendingServices.slice(0, 9).map((appt) => (
                  <div key={appt.id} className="rounded-xl border border-[var(--border)] bg-card px-4 py-3 text-sm">
                    <p className="font-semibold text-text">
                      {appt.client?.pet_name || appt.client?.owner_name || 'Pet'} - {serviceName(services, appt.service_type)}
                    </p>
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
                  <th>Esteticista</th>
                  <th>Servicos</th>
                  <th>Receita</th>
                  <th>Tosa 10%</th>
                  <th>Outros 5%</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.staff_key || row.profile_id}>
                    <td className="font-semibold text-text">{row.collaborator_name || row.staff_key}</td>
                    <td>
                      <span className="font-semibold">{row.service_count || 0}</span>
                      <span className="ml-2 text-xs text-muted">
                        ({row.grooming_count || 0} tosa · {row.other_service_count || 0} outros)
                      </span>
                    </td>
                    <td>{fmtCurrency(row.service_revenue || 0)}</td>
                    <td className="text-amber-400 font-semibold">{fmtCurrency(row.grooming_commission || 0)}</td>
                    <td className="text-amber-400 font-semibold">{fmtCurrency(row.other_service_commission || 0)}</td>
                    <td className="text-emerald-400 font-bold">{fmtCurrency(row.total_commission || 0)}</td>
                  </tr>
                ))}
                {!rows.length && !loading && (
                  <tr><td colSpan={6} className="text-center text-muted py-10">Sem producao concluida no periodo.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'esteticistas' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--border)] bg-card px-5 py-4">
            <p className="font-semibold text-text">Mesmos responsaveis da Agenda</p>
            <p className="mt-1 text-sm text-muted">
              Estes cadastros sao operacionais e nao criam login, email ou usuario no YuiSync. O nome selecionado no campo Responsavel da Agenda e o usado no fechamento.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {staffCards.map((person) => (
              <div key={person.key} className="rounded-2xl border border-[var(--border)] bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-bold text-text">{person.name}</p>
                    <p className="mt-1 text-xs text-muted">Identificador: {person.key}</p>
                  </div>
                  <span className={`badge ${person.active === false ? 'badge-gray' : 'badge-green'}`}>
                    {person.active === false ? 'Inativo' : 'Ativo'}
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[var(--border2)] bg-white/[0.03] px-3 py-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Tosa</p>
                    <p className="mt-1 text-xl font-black text-amber-400">10%</p>
                  </div>
                  <div className="rounded-xl border border-[var(--border2)] bg-white/[0.03] px-3 py-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Outros</p>
                    <p className="mt-1 text-xl font-black text-amber-400">5%</p>
                  </div>
                </div>
              </div>
            ))}
            {!staffCards.length && (
              <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-muted">
                Nenhum esteticista operacional configurado.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
