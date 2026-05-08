import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Percent, Plus, RefreshCw, ShieldAlert, Users, Wallet, X } from 'lucide-react'
import { usePetshopAdvanced } from '../hooks/usePetshopAdvanced'
import { fmtCurrency } from '../../../lib/supabase'

const TEAM_GUIDE = [
  'As regras definem quanto cada colaborador recebe por atendimento ou percentual.',
  'O fechamento soma os atendimentos concluidos dentro do periodo selecionado.',
  'O valor projetado depende da RPC calculate_commissions no banco.',
  'Tipos operacionais como banho/tosa, veterinaria e motodog podem aparecer na equipe.',
]

const TEAM_CHECKLIST = [
  'Selecionar um periodo curto e clicar em Recalcular.',
  'Criar uma regra para um colaborador e validar a linha de fechamento.',
  'Exportar o CSV para conferir os valores fora da tela.',
  'Se aparecer erro de RPC, aplicar o SQL de hotfix antes de testar de novo.',
]

function CommissionRuleModal({ profiles, rule, onClose, onSave }) {
  const [form, setForm] = useState({
    profile_id: rule?.profile_id || profiles[0]?.id || '',
    type: rule?.type || 'percentage',
    rate: rule?.rate || 15,
    applies_to: rule?.applies_to || 'all',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setSaving(true)
    setError('')
    try {
      await onSave({
        id: rule?.id,
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
    <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box max-w-lg">
        <div className="modal-header">
          <h2 className="font-display font-bold text-xl text-text">{rule ? 'Editar regra' : 'Nova regra de comissao'}</h2>
          <button onClick={onClose} className="text-muted hover:text-text"><X size={18} /></button>
        </div>

        <div className="modal-body space-y-4">
          <div>
            <label className="inp-label">Colaborador</label>
            <select className="inp" value={form.profile_id} onChange={(event) => setForm((prev) => ({ ...prev, profile_id: event.target.value }))}>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.full_name || profile.email}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="inp-label">Tipo</label>
              <select className="inp" value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}>
                <option value="percentage">Percentual</option>
                <option value="fixed">Fixo por atendimento</option>
              </select>
            </div>
            <div>
              <label className="inp-label">Taxa</label>
              <input className="inp" type="number" min="0" step="0.01" value={form.rate} onChange={(event) => setForm((prev) => ({ ...prev, rate: event.target.value }))} />
            </div>
          </div>

          <div>
            <label className="inp-label">Aplica em</label>
            <select className="inp" value={form.applies_to} onChange={(event) => setForm((prev) => ({ ...prev, applies_to: event.target.value }))}>
              <option value="all">Tudo</option>
              <option value="services">Apenas servicos</option>
            </select>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3">
            <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">Cancelar</button>
            <button onClick={handleSubmit} disabled={saving} className="btn btn-primary flex-1 justify-center">
              {saving ? 'Salvando...' : 'Salvar regra'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function EquipePage() {
  const { loadTeamSnapshot, loadCommissionRules, saveCommissionRule, deleteCommissionRule, exportCommissionCsv } = usePetshopAdvanced()
  const [profiles, setProfiles] = useState([])
  const [rules, setRules] = useState([])
  const [rows, setRows] = useState([])
  const [range, setRange] = useState(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
    return { startDate: start, endDate: end }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)

  async function reload(nextRange = range) {
    setLoading(true)
    setError('')
    try {
      const [{ profiles: loadedProfiles, rules: loadedRules }, snapshot] = await Promise.all([
        loadCommissionRules(),
        loadTeamSnapshot(nextRange),
      ])
      setProfiles(loadedProfiles)
      setRules(loadedRules)
      setRows(snapshot.rows)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleSaveRule(payload) {
    await saveCommissionRule(payload)
    await reload()
  }

  async function handleDeleteRule(ruleId) {
    await deleteCommissionRule(ruleId)
    await reload()
  }

  const totalRevenue = useMemo(() => rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0), [rows])
  const totalCommission = useMemo(() => rows.reduce((sum, row) => sum + Number(row.commission || 0), 0), [rows])

  return (
    <div className="page animate-fade-up space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Users size={22} className="text-emerald-400" />
            Equipe e Comissoes
          </h1>
          <p className="page-sub">Fechamento por colaborador com exportacao de folha.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => reload()} className="btn btn-secondary">
            <RefreshCw size={15} /> Atualizar
          </button>
          <button onClick={() => exportCommissionCsv(rows)} className="btn btn-secondary">
            <Download size={15} /> Exportar CSV
          </button>
          <button onClick={() => setModal({})} className="btn btn-primary">
            <Plus size={15} /> Nova regra
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-5">
          <p className="text-sm font-semibold text-text">Tutorial rapido</p>
          <div className="grid grid-cols-1 gap-3 mt-4">
            {TEAM_GUIDE.map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-white/40 px-4 py-3 text-sm text-text">
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-5">
          <p className="text-sm font-semibold text-text">Checklist de testes</p>
          <div className="grid grid-cols-1 gap-3 mt-4">
            {TEAM_CHECKLIST.map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-white/40 px-4 py-3 text-sm text-text">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="inp-label">Inicio</label>
          <input className="inp" type="date" value={range.startDate} onChange={(event) => setRange((prev) => ({ ...prev, startDate: event.target.value }))} />
        </div>
        <div>
          <label className="inp-label">Fim</label>
          <input className="inp" type="date" value={range.endDate} onChange={(event) => setRange((prev) => ({ ...prev, endDate: event.target.value }))} />
        </div>
        <button onClick={() => reload(range)} className="btn btn-primary">
          <RefreshCw size={15} /> Recalcular
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-[var(--border)] rounded-xl p-5">
          <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Colaboradores com producao</p>
          <p className="font-display font-bold text-3xl text-text">{rows.length}</p>
        </div>
        <div className="bg-card border border-[var(--border)] rounded-xl p-5">
          <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Faturamento do periodo</p>
          <p className="font-display font-bold text-3xl text-emerald-400">{fmtCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-card border border-[var(--border)] rounded-xl p-5">
          <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Comissao projetada</p>
          <p className="font-display font-bold text-3xl text-amber-400">{fmtCurrency(totalCommission)}</p>
        </div>
      </div>

      {error && (
        <p className="text-sm rounded-xl px-4 py-3 bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-2">
          <ShieldAlert size={14} /> {error}
        </p>
      )}

      <div className="bg-card border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border2)] flex items-center gap-2">
          <Wallet size={16} className="text-emerald-400" />
          <h2 className="section-title">Fechamento</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Atendimentos</th>
                <th>Faturamento</th>
                <th>Comissao</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.profile_id}>
                  <td>{row.groomer_name}</td>
                  <td>{row.appointments_count}</td>
                  <td className="text-emerald-400 font-semibold">{fmtCurrency(row.revenue)}</td>
                  <td className="text-amber-400 font-semibold">{fmtCurrency(row.commission)}</td>
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr>
                  <td colSpan={4} className="text-center text-muted py-10">Sem atendimentos concluidos no periodo.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-card border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border2)] flex items-center gap-2">
          <Percent size={16} className="text-amber-400" />
          <h2 className="section-title">Regras de comissao</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Tipo</th>
                <th>Taxa</th>
                <th>Escopo</th>
                <th className="text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const profile = profiles.find((entry) => entry.id === rule.profile_id)
                return (
                  <tr key={rule.id}>
                    <td>{profile?.full_name || profile?.email || 'Equipe'}</td>
                    <td>{rule.type === 'fixed' ? 'Fixo' : 'Percentual'}</td>
                    <td>{rule.type === 'fixed' ? fmtCurrency(rule.rate) : `${rule.rate}%`}</td>
                    <td>{rule.applies_to}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setModal(rule)} className="btn btn-secondary btn-sm">Editar</button>
                        <button onClick={() => handleDeleteRule(rule.id)} className="btn btn-danger btn-sm">Excluir</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!rules.length && !loading && (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-10">Nenhuma regra cadastrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal !== null && (
        <CommissionRuleModal
          profiles={profiles}
          rule={modal.id ? modal : null}
          onClose={() => setModal(null)}
          onSave={handleSaveRule}
        />
      )}
    </div>
  )
}
