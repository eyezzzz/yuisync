import { useEffect, useMemo, useState } from 'react'
import { Banknote, Calculator, CreditCard, Lock, LockOpen, ReceiptText, RefreshCw, ShieldAlert, Wallet } from 'lucide-react'
import { fmtCurrency } from '../../../lib/supabase'
import { usePetshopAdvanced } from '../hooks/usePetshopAdvanced'

const METHOD_LABELS = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  credito: 'Credito',
  debito: 'Debito',
  outros: 'Outros',
}

function MethodCard({ label, value, icon: Icon, tone = 'text-text' }) {
  return (
    <div className="bg-card border border-[var(--border)] rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs uppercase tracking-widest text-muted font-bold">{label}</p>
        <Icon size={16} className={tone} />
      </div>
      <p className={`font-display font-bold text-3xl ${tone}`}>{fmtCurrency(value)}</p>
    </div>
  )
}

export default function CaixaPage({ setPage }) {
  const { loadCashDashboard, openCashRegister, closeCashRegister } = usePetshopAdvanced()
  const [dashboard, setDashboard] = useState({
    registers: [],
    current: null,
    sales: [],
    totalsByMethod: {},
    expectedCash: 0,
  })
  const [openingBalance, setOpeningBalance] = useState(0)
  const [openingNotes, setOpeningNotes] = useState('')
  const [closingBalance, setClosingBalance] = useState(0)
  const [closingNotes, setClosingNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function reload() {
    setLoading(true)
    setError('')
    try {
      const data = await loadCashDashboard()
      setDashboard(data)
      setClosingBalance(Number(data.expectedCash || 0) + Number(data.current?.opening_balance || 0))
      setClosingNotes(data.current?.notes || '')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleOpenCashRegister() {
    setSaving(true)
    setError('')
    try {
      await openCashRegister({
        opening_balance: Number(openingBalance || 0),
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
      await closeCashRegister({
        registerId: dashboard.current.id,
        closing_balance: Number(closingBalance || 0),
        notes: closingNotes,
      })
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const totalSales = useMemo(
    () => (dashboard.sales || []).reduce((sum, sale) => sum + Number(sale.total_price || 0), 0),
    [dashboard.sales]
  )

  const projectedClosing = Number(dashboard.expectedCash || 0) + Number(dashboard.current?.opening_balance || 0)

  return (
    <div className="page animate-fade-up space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Wallet size={22} className="text-emerald-400" />
            Controle de Caixa
          </h1>
          <p className="page-sub">Abertura, fechamento e conferencias das vendas do dia.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => reload()} className="btn btn-secondary">
            <RefreshCw size={15} /> Atualizar
          </button>
          {setPage && (
            <button onClick={() => setPage('financeiro')} className="btn btn-secondary">
              <ReceiptText size={15} /> Financeiro / Notas
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MethodCard
          label={dashboard.current ? 'Caixa aberto' : 'Caixa do dia'}
          value={dashboard.current ? Number(dashboard.current.opening_balance || 0) : 0}
          icon={dashboard.current ? LockOpen : Lock}
          tone={dashboard.current ? 'text-emerald-400' : 'text-muted'}
        />
        <MethodCard label="Vendas concluidas" value={totalSales} icon={Calculator} tone="text-text" />
        <MethodCard label="Saldo esperado" value={projectedClosing} icon={Banknote} tone="text-amber-400" />
        <MethodCard label="Dinheiro em caixa" value={dashboard.expectedCash} icon={CreditCard} tone="text-emerald-400" />
      </div>

      {error && (
        <p className="text-sm rounded-xl px-4 py-3 bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-2">
          <ShieldAlert size={14} /> {error}
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">
        <div className="bg-card border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            {dashboard.current ? <Lock size={16} className="text-amber-400" /> : <LockOpen size={16} className="text-emerald-400" />}
            <h2 className="section-title">{dashboard.current ? 'Fechar caixa' : 'Abrir caixa'}</h2>
          </div>

          {!dashboard.current ? (
            <>
              <div>
                <label className="inp-label">Valor inicial</label>
                <input
                  aria-label="Valor inicial do caixa"
                  className="inp"
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingBalance}
                  onChange={(event) => setOpeningBalance(event.target.value)}
                />
              </div>
              <div>
                <label className="inp-label">Observacoes</label>
                <textarea
                  className="inp h-32 resize-none p-4"
                  value={openingNotes}
                  onChange={(event) => setOpeningNotes(event.target.value)}
                  placeholder="Ex.: troco inicial da recepcao"
                />
              </div>
              <button onClick={handleOpenCashRegister} disabled={saving || loading} className="btn btn-primary w-full justify-center">
                <LockOpen size={15} /> {saving ? 'Abrindo...' : 'Abrir caixa'}
              </button>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-[var(--border)] bg-white/5 p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Aberto em</span>
                  <span className="text-text font-semibold">{new Date(dashboard.current.opened_at).toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Saldo inicial</span>
                  <span className="text-text font-semibold">{fmtCurrency(dashboard.current.opening_balance || 0)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Saldo esperado</span>
                  <span className="text-amber-400 font-semibold">{fmtCurrency(projectedClosing)}</span>
                </div>
              </div>

              <div>
                <label className="inp-label">Saldo contado</label>
                <input
                  aria-label="Saldo contado no fechamento"
                  className="inp"
                  type="number"
                  min="0"
                  step="0.01"
                  value={closingBalance}
                  onChange={(event) => setClosingBalance(event.target.value)}
                />
              </div>
              <div>
                <label className="inp-label">Observacoes de fechamento</label>
                <textarea
                  className="inp h-32 resize-none p-4"
                  value={closingNotes}
                  onChange={(event) => setClosingNotes(event.target.value)}
                  placeholder="Ex.: diferenca por sangria ou reforco de troco"
                />
              </div>
              <button onClick={handleCloseCashRegister} disabled={saving || loading} className="btn btn-primary w-full justify-center">
                <Lock size={15} /> {saving ? 'Fechando...' : 'Fechar caixa'}
              </button>
            </>
          )}
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <MethodCard label={METHOD_LABELS.dinheiro} value={dashboard.totalsByMethod.dinheiro || 0} icon={Banknote} tone="text-emerald-400" />
            <MethodCard label={METHOD_LABELS.pix} value={dashboard.totalsByMethod.pix || 0} icon={CreditCard} tone="text-sky-400" />
            <MethodCard label={METHOD_LABELS.credito} value={dashboard.totalsByMethod.credito || 0} icon={CreditCard} tone="text-violet-400" />
            <MethodCard label={METHOD_LABELS.debito} value={dashboard.totalsByMethod.debito || 0} icon={CreditCard} tone="text-amber-400" />
          </div>

          <div className="bg-card border border-[var(--border)] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border2)]">
              <h2 className="section-title">Historico de caixas</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Abertura</th>
                    <th>Fechamento</th>
                    <th>Inicial</th>
                    <th>Esperado</th>
                    <th>Contado</th>
                    <th>Diferenca</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard.registers || []).map((register) => (
                    <tr key={register.id}>
                      <td>{new Date(register.opened_at).toLocaleString('pt-BR')}</td>
                      <td>{register.closed_at ? new Date(register.closed_at).toLocaleString('pt-BR') : 'Em aberto'}</td>
                      <td>{fmtCurrency(register.opening_balance || 0)}</td>
                      <td>{register.expected_balance != null ? fmtCurrency(register.expected_balance) : '-'}</td>
                      <td>{register.closing_balance != null ? fmtCurrency(register.closing_balance) : '-'}</td>
                      <td className={Number(register.difference || 0) === 0 ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                        {register.difference != null ? fmtCurrency(register.difference) : '-'}
                      </td>
                    </tr>
                  ))}
                  {!dashboard.registers.length && !loading && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-10">Nenhum fechamento registrado ainda.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
