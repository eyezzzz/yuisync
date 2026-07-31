import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  Droplets,
  PackageCheck,
  RefreshCw,
  Scissors,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import ReportsSharedPage from '../../../shared/pages/ReportsSharedPage'
import { useAuthCtx } from '../../../context/AuthContext'
import { useModuleCtx } from '../../../context/ModuleContext'
import { fmtCurrency } from '../../../lib/supabase'
import { normalizeOperationalStaff } from '../../../../shared/petshopOperations'
import { usePetshopAdvanced } from '../hooks/usePetshopAdvanced'
import {
  buildCommissionRows,
  hydrateLegacyCommissionAppointments,
} from '../lib/teamCommissionSummary'
import { enrichPackageCommissionAppointments } from '../lib/packageCommissionOperations'

const monthRange = () => {
  const now = new Date()
  return {
    startDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  }
}

const tooltipStyle = {
  backgroundColor: '#0f172a',
  border: '1px solid rgba(148,163,184,.25)',
  borderRadius: 12,
  color: '#f8fafc',
  fontSize: 12,
}

function MetricCard({ label, value, detail, icon: Icon, tone = 'emerald' }) {
  const tones = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    violet: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  }
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted">{label}</p>
          <p className="mt-2 font-display text-2xl font-black text-text">{value}</p>
          <p className="mt-1 text-xs text-muted">{detail}</p>
        </div>
        <span className={`rounded-xl border p-2.5 ${tones[tone]}`}><Icon size={18}/></span>
      </div>
    </div>
  )
}

function PetshopServiceReportsPanel() {
  const { loadTeamSnapshot, loadPetshopServices } = usePetshopAdvanced()
  const { activeModuleId } = useModuleCtx()
  const { activeTenantId, storeSettings } = useAuthCtx()
  const moduleId = activeModuleId || 'petshop'
  const [range, setRange] = useState(monthRange)
  const [history, setHistory] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const configuredStaff = useMemo(
    () => normalizeOperationalStaff(storeSettings?.petshop_operational_staff),
    [storeSettings?.petshop_operational_staff],
  )

  async function reload(nextRange = range) {
    setLoading(true)
    setError('')
    try {
      const [snapshot, catalogServices] = await Promise.all([
        loadTeamSnapshot(nextRange),
        loadPetshopServices(),
      ])
      const enriched = await enrichPackageCommissionAppointments({
        appointments: snapshot.serviceHistory || [],
        moduleId,
        tenantId: activeTenantId,
        settings: storeSettings,
        catalogServices,
      })
      setServices(catalogServices || [])
      setHistory(enriched)
    } catch (loadError) {
      setError(loadError?.message || 'Nao foi possivel carregar os relatorios de servicos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const hydratedHistory = useMemo(
    () => hydrateLegacyCommissionAppointments(history, services),
    [history, services],
  )
  const rows = useMemo(
    () => buildCommissionRows(hydratedHistory, configuredStaff),
    [configuredStaff, hydratedHistory],
  )
  const totals = useMemo(() => rows.reduce((summary, row) => ({
    serviceCount: summary.serviceCount + Number(row.service_count || 0),
    bathCount: summary.bathCount + Number(row.bath_count || 0),
    groomingCount: summary.groomingCount + Number(row.grooming_count || 0),
    packageCount: summary.packageCount + Number(row.package_count || 0),
    otherCount: summary.otherCount + Number(row.other_service_count || 0),
    revenue: summary.revenue + Number(row.service_revenue || 0),
    packageRevenue: summary.packageRevenue + Number(row.package_revenue || 0),
    commission: summary.commission + Number(row.total_commission || 0),
  }), {
    serviceCount: 0,
    bathCount: 0,
    groomingCount: 0,
    packageCount: 0,
    otherCount: 0,
    revenue: 0,
    packageRevenue: 0,
    commission: 0,
  }), [rows])
  const afterCommission = Math.max(0, totals.revenue - totals.commission)
  const commissionPercent = totals.revenue > 0 ? totals.commission / totals.revenue * 100 : 0

  const categoryData = useMemo(() => [
    { name: 'Banhos avulsos', Quantidade: totals.bathCount },
    { name: 'Tosas avulsas', Quantidade: totals.groomingCount },
    { name: 'Pacotes', Quantidade: totals.packageCount },
    { name: 'Outros', Quantidade: totals.otherCount },
  ], [totals])

  const staffVolumeData = useMemo(() => rows.map((row) => ({
    name: row.collaborator_name || row.staff_key,
    Banhos: Number(row.bath_count || 0),
    Tosas: Number(row.grooming_count || 0),
    Pacotes: Number(row.package_count || 0),
    Outros: Number(row.other_service_count || 0),
  })), [rows])

  const staffFinanceData = useMemo(() => rows.map((row) => ({
    name: row.collaborator_name || row.staff_key,
    Receita: Number(row.service_revenue || 0),
    Comissao: Number(row.total_commission || 0),
    Resultado: Math.max(0, Number(row.service_revenue || 0) - Number(row.total_commission || 0)),
  })), [rows])

  function resetMonth() {
    const next = monthRange()
    setRange(next)
    void reload(next)
  }

  return (
    <div className="page animate-fade-up space-y-6 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="page-title flex items-center gap-2"><BarChart3 size={22} className="text-emerald-400"/> Servicos & Comissoes</h2>
          <p className="page-sub">Banhos, tosas, pacotes e resultado apos comissoes por esteticista.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="inp-label">Inicio</label><input className="inp" type="date" value={range.startDate} onChange={(event) => setRange((current) => ({ ...current, startDate: event.target.value }))}/></div>
          <div><label className="inp-label">Fim</label><input className="inp" type="date" value={range.endDate} onChange={(event) => setRange((current) => ({ ...current, endDate: event.target.value }))}/></div>
          <button type="button" onClick={() => void reload(range)} className="btn btn-primary"><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> Atualizar</button>
          <button type="button" onClick={resetMonth} className="btn btn-secondary">Mes atual</button>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 px-5 py-4 text-sm text-muted">
        Pacotes usam a receita liquida do servico: o valor integral do MotoDog e retirado antes da divisao pelas unidades. “Resultado apos comissao” representa receita de servicos menos comissoes; custos de insumos nao estao cadastrados nesta conta.
      </div>

      {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Servicos" value={totals.serviceCount} detail="Concluidos no periodo" icon={TrendingUp}/>
        <MetricCard label="Banhos avulsos" value={totals.bathCount} detail="Sem beneficios de pacote" icon={Droplets} tone="blue"/>
        <MetricCard label="Pacotes executados" value={totals.packageCount} detail={fmtCurrency(totals.packageRevenue)} icon={PackageCheck} tone="amber"/>
        <MetricCard label="Comissoes" value={fmtCurrency(totals.commission)} detail={`${commissionPercent.toFixed(1)}% da receita`} icon={WalletCards} tone="violet"/>
        <MetricCard label="Apos comissao" value={fmtCurrency(afterCommission)} detail={`Receita ${fmtCurrency(totals.revenue)}`} icon={Scissors}/>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-[var(--border)] bg-card p-5">
          <div className="mb-5"><h3 className="font-display text-lg font-bold text-text">Quantidade por origem</h3><p className="text-xs text-muted">Categorias exclusivas para evitar contagem duplicada.</p></div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} margin={{ left: 0, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.14)"/>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false}/>
                <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={tooltipStyle}/>
                <Bar dataKey="Quantidade" fill="#10b981" radius={[8, 8, 0, 0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-3xl border border-[var(--border)] bg-card p-5">
          <div className="mb-5"><h3 className="font-display text-lg font-bold text-text">Producao por esteticista</h3><p className="text-xs text-muted">Banhos e tosas avulsos separados dos atendimentos de pacote.</p></div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={staffVolumeData} margin={{ left: 0, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.14)"/>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false}/>
                <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={tooltipStyle}/>
                <Legend wrapperStyle={{ fontSize: 11 }}/>
                <Bar dataKey="Banhos" stackId="volume" fill="#10b981"/>
                <Bar dataKey="Tosas" stackId="volume" fill="#3b82f6"/>
                <Bar dataKey="Pacotes" stackId="volume" fill="#f59e0b"/>
                <Bar dataKey="Outros" stackId="volume" fill="#8b5cf6" radius={[8, 8, 0, 0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-[var(--border)] bg-card p-5">
        <div className="mb-5"><h3 className="font-display text-lg font-bold text-text">Receita x comissao</h3><p className="text-xs text-muted">Comparacao da receita liquida dos servicos, comissao e valor restante.</p></div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={staffFinanceData} margin={{ left: 8, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.14)"/>
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={(value) => `R$ ${value}`} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false}/>
              <Tooltip formatter={(value) => fmtCurrency(value)} contentStyle={tooltipStyle}/>
              <Legend wrapperStyle={{ fontSize: 11 }}/>
              <Bar dataKey="Receita" fill="#10b981" radius={[6, 6, 0, 0]}/>
              <Bar dataKey="Comissao" fill="#8b5cf6" radius={[6, 6, 0, 0]}/>
              <Bar dataKey="Resultado" fill="#0ea5e9" radius={[6, 6, 0, 0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="tbl-wrapper overflow-hidden">
        <table className="tbl min-w-[1050px]">
          <thead><tr><th>Esteticista</th><th>Banhos</th><th>Tosas</th><th>Pacotes</th><th>Outros</th><th>Receita</th><th>Comissao</th><th>Apos comissao</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.staff_key}>
                <td className="font-semibold text-text">{row.collaborator_name}</td>
                <td>{row.bath_count}</td>
                <td>{row.grooming_count}</td>
                <td className="font-bold text-amber-400">{row.package_count}</td>
                <td>{row.other_service_count}</td>
                <td>{fmtCurrency(row.service_revenue)}</td>
                <td className="font-bold text-violet-400">{fmtCurrency(row.total_commission)}</td>
                <td className="font-bold text-emerald-400">{fmtCurrency(Math.max(0, row.service_revenue - row.total_commission))}</td>
              </tr>
            ))}
            {!rows.length && !loading && <tr><td colSpan={8} className="py-10 text-center text-muted">Sem servicos concluidos no periodo.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function PetshopReportsPage() {
  const [activeTab, setActiveTab] = useState('servicos')
  return (
    <div className="space-y-4">
      <div className="mx-auto mt-4 flex w-fit max-w-[calc(100%-2rem)] flex-wrap gap-2 rounded-xl border border-[var(--border)] bg-card p-1">
        <button type="button" onClick={() => setActiveTab('geral')} className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider ${activeTab === 'geral' ? 'bg-emerald-500 text-slate-950' : 'text-muted hover:bg-white/5 hover:text-text'}`}>Visao geral</button>
        <button type="button" onClick={() => setActiveTab('servicos')} className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider ${activeTab === 'servicos' ? 'bg-emerald-500 text-slate-950' : 'text-muted hover:bg-white/5 hover:text-text'}`}>Servicos & Comissoes</button>
      </div>
      {activeTab === 'geral' ? <ReportsSharedPage/> : <PetshopServiceReportsPanel/>}
    </div>
  )
}
