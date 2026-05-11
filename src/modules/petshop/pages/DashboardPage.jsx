import { useEffect, useState, useCallback } from 'react'
import { AlertTriangle, TrendingUp, Calendar, MessageSquare, PawPrint, ArrowRight, ShoppingCart, X, CheckCircle, ShieldAlert, Star, UserCheck } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import { useProducts }      from '../../../shared/hooks/useProducts'
import { useAppointments }  from '../../../shared/hooks/useAppointments'
import { useSales }         from '../../../shared/hooks/useSales'
import { useChat }          from '../../../shared/hooks/useChat'
import { useFinance }       from '../../../shared/hooks/useFinance'
import { supabase, fmtCurrency, fmtTime, todayISO } from '../../../lib/supabase'
import { useAuthCtx } from '../../../context/AuthContext'
import { useModuleCtx } from '../../../context/ModuleContext'
import { useAnalytics } from '../../../shared/hooks/useAnalytics'
import AIHoursSavedCard from '../components/AIHoursSavedCard'
import { AI_HOURS_SAVED_MOCK, AI_HOURS_SAVED_SERIES } from '../constants/aiHoursSavedMock'
import { buildAIHoursFromScopedSessions } from '../utils/aiHoursSaved'

// â”€â”€ KPI Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function KpiCard({ accent, icon: Icon, label, value, sub, onClick }) {
  return (
    <div
      className={`kpi-card kpi-${accent} h-full cursor-pointer`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-bold text-muted uppercase tracking-widest">{label}</p>
        <div className={`w-8 h-8 rounded-lg bg-${accent}-500/15 flex items-center justify-center flex-shrink-0`}>
          <Icon size={16} className={`text-${accent}-400`} />
        </div>
      </div>
      <p className="font-display font-bold text-3xl text-text leading-none">{value}</p>
      {sub && <p className="text-xs text-muted mt-1.5">{sub}</p>}
    </div>
  )
}

function RevenueMixCard({ value, sub, mix = [], onClick }) {
  const chartData = (mix || []).slice(0, 5)
  const piePalette = ['#10b981', '#06b6d4', '#f59e0b', '#8b5cf6', '#ef4444']

  return (
    <div className="kpi-card kpi-primary h-full cursor-pointer revenue-mix-card" onClick={onClick}>
      <div className="revenue-mix-card-glow" />
      <div className="mb-3 flex items-start justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Faturamento Hoje</p>
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/15">
          <TrendingUp size={16} className="text-primary" />
        </div>
      </div>

      <p className="font-display text-3xl font-bold leading-none text-text">{value}</p>
      {sub && <p className="mt-1.5 text-xs text-muted">{sub}</p>}

      <div className="mt-4">
        {chartData.length === 0 ? (
          <p className="text-xs text-muted">Sem vendas concluídas hoje.</p>
        ) : (
          <div className="flex items-center gap-3">
            <div className="h-28 w-28 shrink-0 revenue-pie-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="amount"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={26}
                    outerRadius={48}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    paddingAngle={2}
                    animationDuration={1300}
                    animationBegin={100}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`${entry.label}-${index}`} fill={piePalette[index % piePalette.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(amount) => fmtCurrency(Number(amount || 0))}
                    contentStyle={{ borderRadius: 12, border: '1px solid #d1fae5', fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5">
              {chartData.map((item, index) => (
                <div key={item.label} className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full revenue-pie-dot" style={{ backgroundColor: piePalette[index % piePalette.length] }} />
                    {item.label}
                  </span>
                  <span>{fmtCurrency(item.amount || 0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
// â”€â”€ Stock Alert Row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StockAlert({ product }) {
  const isEmpty = product.stock_quantity === 0
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
      isEmpty
        ? 'bg-red-500/8 border-red-500/20'
        : 'bg-amber-500/8 border-amber-500/20'
    }`}>
      <AlertTriangle size={15} className={isEmpty ? 'text-red-400' : 'text-amber-400'} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text truncate">{product.name}</p>
        <p className="text-xs text-muted">{product.category}</p>
      </div>
      <span className={`text-xs font-bold ${isEmpty ? 'text-red-400' : 'text-amber-400'}`}>
        {isEmpty ? 'ESGOTADO' : `${product.stock_quantity} un`}
      </span>
    </div>
  )
}

// â”€â”€ Appointment Row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ApptRow({ appt, serviceLabel, statusBadge, isAdmin }) {
  const sb = statusBadge(appt.status)
  return (
    <tr>
      <td>
        <span className="font-bold text-amber-400">{fmtTime(appt.scheduled_at)}</span>
      </td>
      <td>
        <p className="font-semibold text-text">{appt.pets?.pet_name || '—'}</p>
        <p className="text-xs text-muted">{appt.pets?.breed || appt.pets?.species}</p>
      </td>
      <td>{serviceLabel(appt.service_type)}</td>
      <td>
        <span className={`badge ${sb.cls}`}>{sb.label}</span>
      </td>
      {isAdmin && <td className="font-semibold text-emerald-400">{fmtCurrency(appt.price)}</td>}
    </tr>
  )
}

// â”€â”€ Dashboard Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function DashboardPage({ setPage }) {
  const auth = useAuthCtx()
  const { activeModuleId } = useModuleCtx()
  
  const isAdmin = auth?.profile?.role === 'admin' || 
                 (auth?.profile?.module_permissions || {})[activeModuleId]?.startsWith('admin_')
  const isGlobalAdmin = auth?.profile?.role === 'admin'

  const { getCriticalStock }                        = useProducts()
  const { load, appointments, todayStats, serviceLabel, statusBadge } = useAppointments()
  const { loadMetrics, getDailyStats, dailyRevenue } = useSales()
  const { loadSessions, sessions }                  = useChat()
  const { invoices, loadInvoices, deleteInvoice } = useFinance()
  const { getChatResolutionMetrics } = useAnalytics()
  // const { activeModuleId } = useModuleCtx()

  const [critical, setCritical]     = useState([])
  const [stats, setStats]           = useState({ revenue: 0, count: 0, upsells: 0, salesMix: [] })
  const [chatQuality, setChatQuality] = useState({ avgCsat: null, csatCount: 0, aiResolved: 0, humanResolved: 0, closedCount: 0 })
  const [loading, setLoading]       = useState(true)
  const [showResetModal, setShowResetModal] = useState(false)
  const [isWiping, setIsWiping]     = useState(false)
  const canWipeData = isGlobalAdmin

  const reloadAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([
      load({ date: todayISO() }),
      loadMetrics(),
      loadSessions('bot'),
      loadInvoices(),
      getCriticalStock().then(setCritical),
      getDailyStats().then(setStats),
      getChatResolutionMetrics().then(setChatQuality),
    ])
    setLoading(false)
  }, [load, loadMetrics, loadSessions, loadInvoices, getCriticalStock, getDailyStats, getChatResolutionMetrics])

  useEffect(() => {
    reloadAll()
    const interval = setInterval(reloadAll, 60_000)
    return () => clearInterval(interval)
  }, [reloadAll, activeModuleId])

  const handleMasterWipe = async () => {
    if (!activeModuleId || !canWipeData) return
    setIsWiping(true)
    try {
      // 1. Excluir Notas (invoices)
      const { data: invs } = await supabase.from('invoices').select('id').eq('module_id', activeModuleId)
      if (invs?.length) {
        for (const i of invs) await deleteInvoice(i.id)
      }
      // 2. Excluir Vendas e Itens (Garante integridade)
      const { data: sids } = await supabase.from('sales').select('id').eq('module_id', activeModuleId)
      if (sids?.length) {
         const ids = sids.map(s => s.id)
         await supabase.from('sale_items').delete().in('sale_id', ids)
         await supabase.from('sales').delete().in('id', ids)
      }
      
      setShowResetModal(false)
      await reloadAll()
    } catch (e) {
      console.error(e)
    } finally {
      setIsWiping(false)
    }
  }

  const ts = todayStats()
  const openChats = sessions.filter(s => s.status !== 'closed').length
  const aiHoursScoped = buildAIHoursFromScopedSessions(sessions, {
    totalHours: AI_HOURS_SAVED_MOCK.totalHours,
    savingPerSession: 0.4,
  })
  const aiHoursInput = aiHoursScoped.savedHours > 0
    ? aiHoursScoped
    : {
        totalHours: AI_HOURS_SAVED_MOCK.totalHours,
        savedHours: AI_HOURS_SAVED_MOCK.savedHours,
        series: AI_HOURS_SAVED_SERIES,
      }

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <div className="page animate-content">
      {/* Header */}
      <div>
        <h1 className="page-title !flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-primary rounded-full animate-pulse shadow-[0_0_10px_rgba(0,224,255,0.8)]" />
          {greeting}! <span className="opacity-40 font-normal">/ Dashboard</span>
        </h1>
        <p className="page-sub !mt-1">
          {now.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4 items-stretch">
        <AIHoursSavedCard
          className="md:col-span-2 xl:col-span-8"
          totalHours={aiHoursInput.totalHours}
          savedHours={aiHoursInput.savedHours}
          series={aiHoursInput.series}
        />
        <div className="xl:col-span-4 h-full">
          {isAdmin ? (
            <RevenueMixCard
              value={fmtCurrency(stats.revenue)}
              sub={`${stats.count} venda${stats.count !== 1 ? 's' : ''} • ${stats.upsells} upsells`}
              mix={stats.salesMix}
              onClick={() => setPage('vendas')}
            />
          ) : (
            <KpiCard
              accent="primary" icon={MessageSquare}
              label="Iniciações Chat"
              value={openChats}
              sub={`${openChats} atendimentos ativos`}
              onClick={() => setPage('chat')}
            />
          )}
        </div>
        <div className="xl:col-span-4 h-full">
          <KpiCard
            accent="amber" icon={Calendar}
            label="Agendamentos Hoje"
            value={ts.total}
            sub={`${ts.agendado + ts.confirmado} pendentes • ${ts.concluido} concluídos`}
            onClick={() => setPage('agenda')}
          />
        </div>
        <div className="xl:col-span-4 h-full">
          <KpiCard
            accent="red" icon={ShieldAlert}
            label="Estoque Crítico"
            value={critical.length}
            sub={critical.filter(p => p.stock_quantity === 0).length + ' produto(s) esgotado(s)'}
            onClick={() => setPage('estoque')}
          />
        </div>
        <div className="xl:col-span-4 h-full">
          <KpiCard
            accent="violet" icon={MessageSquare}
            label="Chats Ativos"
            value={openChats}
            sub={sessions.filter(s => s.status === 'bot').length + ' no bot'}
            onClick={() => setPage('chat')}
          />
        </div>
        <div className="xl:col-span-4 h-full">
          <KpiCard
            accent="primary" icon={Star}
            label="Satisfacao IA"
            value={chatQuality.avgCsat === null ? '-' : chatQuality.avgCsat.toFixed(1)}
            sub={`${chatQuality.csatCount} avaliacao${chatQuality.csatCount !== 1 ? 'oes' : ''} coletada${chatQuality.csatCount !== 1 ? 's' : ''}`}
            onClick={() => setPage('chat')}
          />
        </div>
        <div className="xl:col-span-4 h-full">
          <KpiCard
            accent="amber" icon={UserCheck}
            label="Resolucao Chat"
            value={`${chatQuality.aiResolved}/${chatQuality.humanResolved}`}
            sub={`IA / humano em ${chatQuality.closedCount} encerrado${chatQuality.closedCount !== 1 ? 's' : ''}`}
            onClick={() => setPage('chat')}
          />
        </div>
      </div>

      {/* Body Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Today's Agenda */}
        <div className="lg:col-span-2 bg-card border border-[var(--border)] rounded-xl2 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border2)]">
            <h2 className="section-title">Agenda de Hoje</h2>
            <button onClick={() => setPage('agenda')} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
              Ver tudo <ArrowRight size={12} />
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted text-sm">Carregando...</div>
          ) : appointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Calendar size={32} className="text-muted/30" />
              <p className="text-muted text-sm">Nenhum agendamento para hoje</p>
              <button onClick={() => setPage('agenda')} className="btn btn-secondary btn-sm">
                + Novo agendamento
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr>
                  <th>Hora</th><th>Pet</th><th>Serviço</th><th>Status</th>{isAdmin && <th>Valor</th>}
                </tr></thead>
                <tbody>
                  {appointments.slice(0, 8).map(a => (
                    <ApptRow key={a.id} appt={a} serviceLabel={serviceLabel} statusBadge={statusBadge} isAdmin={isAdmin} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Critical Stock */}
        <div className="bg-card border border-[var(--border)] rounded-xl2 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border2)]">
            <h2 className="section-title flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400" />
              Estoque Crítico
            </h2>
            <button onClick={() => setPage('estoque')} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
              Gerenciar <ArrowRight size={12} />
            </button>
          </div>
          <div className="p-4 space-y-2.5 overflow-y-auto" style={{ maxHeight: 340 }}>
            {loading ? (
              <p className="text-sm text-muted text-center py-4">Carregando...</p>
            ) : critical.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <CheckCircle size={28} className="text-emerald-400/40" />
                <p className="text-sm text-muted">Estoque em dia! </p>
              </div>
            ) : (
              critical.map(p => <StockAlert key={p.id} product={p} />)
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-card border border-[var(--border)] rounded-xl2 p-5">
        <h2 className="section-title mb-4">Ações Rápidas</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setPage('agenda')} className="btn btn-secondary">
            <Calendar size={16} /> Novo Agendamento
          </button>
          <button onClick={() => setPage('vendas')} className="btn btn-primary">
            <ShoppingCart size={16} /> Abrir PDV
          </button>
          <button onClick={() => setPage('pets')} className="btn btn-secondary">
            <PawPrint size={16} /> Cadastrar Pet
          </button>
          <button onClick={() => setPage('chat')} className="btn btn-secondary">
            <MessageSquare size={16} /> Ver Chats
          </button>
          
          {canWipeData && (
            <button onClick={() => setShowResetModal(true)} className="btn bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20">
              <X size={16} /> Resetar Ambiente (Teste)
            </button>
          )}
        </div>
      </div>

      {/* Reset Modal Internal */}
      {canWipeData && showResetModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in">
           <div className="bg-surface border border-red-500/20 w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl p-8 text-center animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-6 border border-red-500/20">
                 <AlertTriangle className="text-red-500" size={32} />
              </div>
              <h3 className="text-xl font-display font-bold text-text mb-2">Atenção Crítica</h3>
              <p className="text-muted text-sm mb-8 leading-relaxed">Isso apagará **todas as vendas e notas** deste módulo permanentemente. Útil apenas para testes.</p>
              
              <div className="flex flex-col gap-3">
                 <button 
                   disabled={isWiping}
                   onClick={handleMasterWipe}
                   className="w-full py-4 bg-red-500 hover:bg-red-400 text-bg font-bold rounded-2xl transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
                 >
                   {isWiping ? 'Resetando...' : 'Sim, Resetar Tudo'}
                 </button>
                 <button 
                   disabled={isWiping}
                   onClick={() => setShowResetModal(false)}
                   className="w-full py-4 bg-white/5 hover:bg-white/10 text-text font-bold rounded-2xl transition-all border border-white/10"
                 >
                   Cancelar
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  )
}
