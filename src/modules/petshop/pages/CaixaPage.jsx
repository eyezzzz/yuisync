import { useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  Calculator,
  CalendarCheck,
  CreditCard,
  Lock,
  LockOpen,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
  Wallet,
} from 'lucide-react'
import { fmtCurrency } from '../../../lib/supabase'
import { useAuthCtx } from '../../../context/AuthContext'
import { useModuleCtx } from '../../../context/ModuleContext'
import {
  closeCashRegisterSnapshot,
  loadCashDashboardSnapshot,
  openCashRegisterSnapshot,
} from '../lib/cashRegisterOperations'

const METHOD_LABELS = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  credito: 'Credito',
  debito: 'Debito',
  multiplo: 'Pagamento dividido',
  pacote: 'Pacote ja pago',
  cortesia: 'Cortesia',
  outros: 'Outros',
}

function MethodCard({ label, value, icon: Icon, tone = 'text-text', hint = '' }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-card p-5">
      <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
          {hint && <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p>}
        </div>
        <Icon size={16} className={`${tone} shrink-0`} />
      </div>
      <p className={`break-words font-display font-bold leading-tight tabular-nums ${tone}`} style={{ fontSize: 'clamp(1.35rem, 2.45vw, 2rem)' }}>
        {fmtCurrency(value)}
      </p>
    </div>
  )
}

function SourceCard({ label, count, total, icon: Icon, tone }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--border2)] bg-white/[0.025] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted">{label}</p>
        <Icon size={15} className={tone}/>
      </div>
      <p className="mt-3 text-xl font-black text-text tabular-nums">{count}</p>
      <p className={`mt-1 text-sm font-bold ${tone}`}>{fmtCurrency(total)}</p>
    </div>
  )
}

const dateTime = (value) => value ? new Date(value).toLocaleString('pt-BR') : '-'

export default function CaixaPage({ setPage }) {
  const { activeTenantId } = useAuthCtx()
  const { activeModuleId } = useModuleCtx()
  const moduleId = activeModuleId || 'petshop'
  const [dashboard, setDashboard] = useState({
    registers: [], current: null, sales: [], movements: [], totalsByMethod: {}, expectedCash: 0, totalSales: 0,
    sourceSummary: {
      agenda: { count: 0, total: 0 }, subscriptions: { count: 0, total: 0 },
      retail: { count: 0, total: 0 }, packageConsumed: { count: 0, total: 0 },
    },
    period: null,
  })
  const [openingBalance, setOpeningBalance] = useState(0)
  const [openingNotes, setOpeningNotes] = useState('')
  const [closingBalance, setClosingBalance] = useState(0)
  const [closingNotes, setClosingNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function reload() {
    if (!activeTenantId) return
    setLoading(true)
    setError('')
    try {
      const data = await loadCashDashboardSnapshot({ tenantId: activeTenantId, moduleId })
      setDashboard(data)
      setClosingBalance(Number(data.expectedCash || 0) + Number(data.current?.opening_balance || 0))
      setClosingNotes(data.current?.notes || '')
    } catch (err) {
      setError(err.message || 'Nao foi possivel carregar o caixa.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [activeTenantId, moduleId])

  async function handleOpenCashRegister() {
    setSaving(true)
    setError('')
    try {
      await openCashRegisterSnapshot({
        tenantId: activeTenantId,
        moduleId,
        openingBalance: Number(openingBalance || 0),
        notes: openingNotes,
      })
      setOpeningBalance(0)
      setOpeningNotes('')
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleCloseCashRegister() {
    if (!dashboard.current?.id) return
    setSaving(true)
    setError('')
    try {
      await closeCashRegisterSnapshot({
        tenantId: activeTenantId,
        moduleId,
        registerId: dashboard.current.id,
        closingBalance: Number(closingBalance || 0),
        notes: closingNotes,
      })
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const projectedClosing = Number(dashboard.expectedCash || 0) + Number(dashboard.current?.opening_balance || 0)
  const closingDifference = Number(closingBalance || 0) - projectedClosing
  const source = dashboard.sourceSummary || {}
  const periodLabel = dashboard.current
    ? `Movimentos desde a abertura em ${dateTime(dashboard.current.opened_at)}`
    : 'Movimentos financeiros de hoje'

  return (
    <div className="page animate-fade-up space-y-6 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="page-title flex items-center gap-2"><Wallet size={22} className="text-emerald-400"/> Controle de Caixa</h1>
          <p className="page-sub">Abertura, fechamento e conferencia de vendas, pacotes e atendimentos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void reload()} className="btn btn-secondary"><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> Atualizar</button>
          {setPage && <button onClick={() => setPage('financeiro')} className="btn btn-secondary"><ReceiptText size={15}/> Financeiro / Notas</button>}
        </div>
      </div>

      <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-sm text-sky-100">
        <strong>{periodLabel}.</strong> Pacotes entram uma unica vez quando pagos; cada banho consumido aparece abaixo como R$ 0,00 e nao soma novamente no caixa.
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 215px), 1fr))' }}>
        <MethodCard label={dashboard.current ? 'Caixa aberto' : 'Caixa do dia'} value={dashboard.current ? Number(dashboard.current.opening_balance || 0) : 0} icon={dashboard.current ? LockOpen : Lock} tone={dashboard.current ? 'text-emerald-400' : 'text-muted'} hint="Saldo inicial informado"/>
        <MethodCard label="Vendas no periodo" value={dashboard.totalSales || 0} icon={Calculator} hint="Agenda, pacotes e PDV"/>
        <MethodCard label="Saldo fisico esperado" value={projectedClosing} icon={Banknote} tone="text-amber-400" hint="Saldo inicial + entradas em dinheiro"/>
        <MethodCard label="Entradas em dinheiro" value={dashboard.expectedCash || 0} icon={CreditCard} tone="text-emerald-400" hint="Pix e cartoes nao entram no saldo fisico"/>
      </div>

      {error && <p className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"><ShieldAlert size={14}/> {error}</p>}

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4 rounded-2xl border border-[var(--border)] bg-card p-5">
          <div className="flex items-center gap-2">
            {dashboard.current ? <Lock size={16} className="text-amber-400"/> : <LockOpen size={16} className="text-emerald-400"/>}
            <h2 className="section-title">{dashboard.current ? 'Fechar caixa' : 'Abrir caixa'}</h2>
          </div>

          {!dashboard.current ? (
            <>
              <div><label className="inp-label">Valor inicial</label><input aria-label="Valor inicial do caixa" className="inp" type="number" min="0" step="0.01" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)}/></div>
              <div><label className="inp-label">Observacoes</label><textarea className="inp h-32 resize-none p-4" value={openingNotes} onChange={(event) => setOpeningNotes(event.target.value)} placeholder="Ex.: troco inicial da recepcao"/></div>
              <button onClick={handleOpenCashRegister} disabled={saving || loading} className="btn btn-primary w-full justify-center"><LockOpen size={15}/> {saving ? 'Abrindo...' : 'Abrir caixa'}</button>
            </>
          ) : (
            <>
              <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-white/5 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2"><span className="text-muted">Aberto em</span><span className="break-words text-right font-semibold text-text">{dateTime(dashboard.current.opened_at)}</span></div>
                <div className="flex items-center justify-between gap-2"><span className="text-muted">Saldo inicial</span><span className="font-semibold text-text">{fmtCurrency(dashboard.current.opening_balance || 0)}</span></div>
                <div className="flex items-center justify-between gap-2"><span className="text-muted">Entradas em dinheiro</span><span className="font-semibold text-emerald-400">{fmtCurrency(dashboard.expectedCash || 0)}</span></div>
                <div className="flex items-center justify-between gap-2"><span className="text-muted">Saldo fisico esperado</span><span className="font-semibold text-amber-400">{fmtCurrency(projectedClosing)}</span></div>
              </div>
              <div><label className="inp-label">Saldo contado</label><input aria-label="Saldo contado no fechamento" className="inp" type="number" min="0" step="0.01" value={closingBalance} onChange={(event) => setClosingBalance(event.target.value)}/></div>
              <div className={`rounded-xl border px-4 py-3 text-sm ${Math.abs(closingDifference) < 0.01 ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/20 bg-amber-500/10 text-amber-300'}`}>
                Diferenca prevista: <strong>{fmtCurrency(closingDifference)}</strong>
              </div>
              <div><label className="inp-label">Observacoes de fechamento</label><textarea className="inp h-28 resize-none p-4" value={closingNotes} onChange={(event) => setClosingNotes(event.target.value)} placeholder="Ex.: sangria, reforco de troco ou divergencia"/></div>
              <button onClick={handleCloseCashRegister} disabled={saving || loading} className="btn btn-primary w-full justify-center"><Lock size={15}/> {saving ? 'Fechando...' : 'Fechar caixa'}</button>
            </>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 165px), 1fr))' }}>
            <MethodCard label={METHOD_LABELS.dinheiro} value={dashboard.totalsByMethod.dinheiro || 0} icon={Banknote} tone="text-emerald-400"/>
            <MethodCard label={METHOD_LABELS.pix} value={dashboard.totalsByMethod.pix || 0} icon={CreditCard} tone="text-sky-400"/>
            <MethodCard label={METHOD_LABELS.credito} value={dashboard.totalsByMethod.credito || 0} icon={CreditCard} tone="text-violet-400"/>
            <MethodCard label={METHOD_LABELS.debito} value={dashboard.totalsByMethod.debito || 0} icon={CreditCard} tone="text-amber-400"/>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-card p-5">
            <div className="mb-4"><h2 className="section-title">Origem dos movimentos</h2><p className="mt-1 text-xs text-muted">O consumo de pacote e informativo e permanece zerado financeiramente.</p></div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 145px), 1fr))' }}>
              <SourceCard label="Agenda" count={source.agenda?.count || 0} total={source.agenda?.total || 0} icon={CalendarCheck} tone="text-sky-400"/>
              <SourceCard label="Pacotes pagos" count={source.subscriptions?.count || 0} total={source.subscriptions?.total || 0} icon={PackageCheck} tone="text-amber-400"/>
              <SourceCard label="PDV / WhatsApp" count={source.retail?.count || 0} total={source.retail?.total || 0} icon={ShoppingCart} tone="text-emerald-400"/>
              <SourceCard label="Banhos de pacote" count={source.packageConsumed?.count || 0} total={0} icon={PackageCheck} tone="text-violet-400"/>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-card">
            <div className="border-b border-[var(--border2)] px-5 py-4"><h2 className="section-title">Movimentos do caixa</h2><p className="mt-1 text-xs text-muted">Pagamentos e servicos de pacote realizados no periodo do caixa.</p></div>
            <div className="overflow-x-auto">
              <table className="tbl min-w-[860px]">
                <thead><tr><th>Data</th><th>Origem</th><th>Cliente / Pet</th><th>Descricao</th><th>Pagamento</th><th>Valor</th></tr></thead>
                <tbody>
                  {(dashboard.movements || []).map((movement) => (
                    <tr key={movement.id}>
                      <td>{dateTime(movement.occurred_at)}</td>
                      <td><span className={`badge ${movement.record_type === 'package_consumption' ? 'badge-blue' : 'badge-green'}`}>{movement.source_label}</span></td>
                      <td><p className="font-semibold text-text">{movement.client_name}</p>{movement.pet_name && <p className="text-xs text-muted">{movement.pet_name}</p>}</td>
                      <td className="max-w-[280px] whitespace-normal text-xs text-muted">{movement.description || '-'}</td>
                      <td>{METHOD_LABELS[movement.payment_method] || movement.payment_method || '-'}</td>
                      <td className={movement.amount === 0 ? 'font-bold text-sky-400' : 'font-bold text-emerald-400'}>{fmtCurrency(movement.amount)}</td>
                    </tr>
                  ))}
                  {!dashboard.movements?.length && !loading && <tr><td colSpan={6} className="py-10 text-center text-muted">Nenhum movimento no periodo atual.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-card">
            <div className="border-b border-[var(--border2)] px-5 py-4"><h2 className="section-title">Historico de caixas</h2></div>
            <div className="overflow-x-auto">
              <table className="tbl min-w-[760px]">
                <thead><tr><th>Abertura</th><th>Fechamento</th><th>Inicial</th><th>Esperado</th><th>Contado</th><th>Diferenca</th></tr></thead>
                <tbody>
                  {(dashboard.registers || []).map((register) => (
                    <tr key={register.id}>
                      <td>{dateTime(register.opened_at)}</td><td>{register.closed_at ? dateTime(register.closed_at) : 'Em aberto'}</td>
                      <td>{fmtCurrency(register.opening_balance || 0)}</td><td>{register.expected_balance != null ? fmtCurrency(register.expected_balance) : '-'}</td>
                      <td>{register.closing_balance != null ? fmtCurrency(register.closing_balance) : '-'}</td>
                      <td className={Number(register.difference || 0) === 0 ? 'font-semibold text-emerald-400' : 'font-semibold text-amber-400'}>{register.difference != null ? fmtCurrency(register.difference) : '-'}</td>
                    </tr>
                  ))}
                  {!dashboard.registers.length && !loading && <tr><td colSpan={6} className="py-10 text-center text-muted">Nenhum fechamento registrado ainda.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
