import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  CheckCircle,
  Download,
  Eye,
  Percent,
  Printer,
  RefreshCw,
  Users,
  Wallet,
  X,
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
const escapeHtml = (value = '') => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

function serviceHistoryName(services, appointment = {}) {
  const itemLabels = (Array.isArray(appointment.service_items) ? appointment.service_items : [])
    .map((item) => item?.name || item?.label || serviceName(services, item?.service_type || item?.code || item?.value))
    .filter((label) => label && label !== '-')
  if (itemLabels.length) return [...new Set(itemLabels)].join(' + ')
  return serviceName(services, appointment.service_type)
}

function CommissionHistoryModal({ row, items, services, range, onClose }) {
  const total = items.reduce((sum, item) => sum + Number(item.price || 0), 0)
  const responsibleName = row?.collaborator_name || row?.staff_key || 'Responsavel'

  function printHistory() {
    const printWindow = window.open('', '_blank', 'width=980,height=760')
    if (!printWindow) return
    const bodyRows = items.map((item) => `<tr>
      <td>${escapeHtml(dateLabel(item.scheduled_at))}</td>
      <td>${escapeHtml(item.client?.owner_name || '-')}</td>
      <td>${escapeHtml(item.client?.pet_name || '-')}</td>
      <td>${escapeHtml(serviceHistoryName(services, item))}</td>
      <td class="money">${escapeHtml(fmtCurrency(item.price || 0))}</td>
    </tr>`).join('')
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Conferencia - ${escapeHtml(responsibleName)}</title><style>
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; color: #111; margin: 0; font-size: 11px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .meta { margin-bottom: 14px; color: #444; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #bbb; padding: 6px; text-align: left; vertical-align: top; }
      th { background: #eee; font-size: 10px; text-transform: uppercase; }
      .money { text-align: right; white-space: nowrap; }
      tfoot td { font-weight: 700; }
    </style></head><body>
      <h1>Historico de servicos - ${escapeHtml(responsibleName)}</h1>
      <div class="meta">Periodo: ${escapeHtml(dateLabel(range.startDate))} a ${escapeHtml(dateLabel(range.endDate))} · ${items.length} atendimento(s)</div>
      <table><thead><tr><th>Data</th><th>Tutor</th><th>Pet</th><th>Servico</th><th>Valor</th></tr></thead>
      <tbody>${bodyRows || '<tr><td colspan="5">Nenhum atendimento no periodo.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="4">Total conferido</td><td class="money">${escapeHtml(fmtCurrency(total))}</td></tr></tfoot></table>
    </body></html>`)
    printWindow.document.close()
    setTimeout(() => {
      printWindow.focus()
      printWindow.print()
    }, 180)
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box max-w-5xl">
        <div className="modal-header">
          <div>
            <h2 className="font-display text-xl font-bold text-text">Historico de {responsibleName}</h2>
            <p className="mt-1 text-sm text-muted">{dateLabel(range.startDate)} a {dateLabel(range.endDate)} · {items.length} atendimento(s)</p>
          </div>
          <button type="button" aria-label="Fechar historico" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>
        <div className="modal-body space-y-4">
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="tbl min-w-[760px]">
              <thead><tr><th>Data</th><th>Tutor</th><th>Pet</th><th>Servico</th><th>Valor</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{dateLabel(item.scheduled_at)}</td>
                    <td>{item.client?.owner_name || '-'}</td>
                    <td className="font-semibold text-text">{item.client?.pet_name || '-'}</td>
                    <td>{serviceHistoryName(services, item)}</td>
                    <td className="font-semibold text-emerald-400">{fmtCurrency(item.price || 0)}</td>
                  </tr>
                ))}
                {!items.length && <tr><td colSpan={5} className="py-10 text-center text-muted">Nenhum atendimento concluido para esta responsavel no periodo.</td></tr>}
              </tbody>
              <tfoot><tr><td colSpan={4} className="font-bold text-text">Total conferido</td><td className="font-bold text-emerald-400">{fmtCurrency(total)}</td></tr></tfoot>
            </table>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary">Fechar</button>
            <button type="button" onClick={printHistory} className="btn btn-primary"><Printer size={15}/> Imprimir historico</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function EquipePage() {
  const {
    loadTeamSnapshot,
    exportCommissionCsv,
    loadPetshopServices,
    assignPendingServiceResponsible,
  } = usePetshopAdvanced()
  const { storeSettings } = useAuthCtx()

  const [activeTab, setActiveTab] = useState('fechamento')
  const [rows, setRows] = useState([])
  const [pendingServices, setPendingServices] = useState([])
  const [serviceHistory, setServiceHistory] = useState([])
  const [historyRow, setHistoryRow] = useState(null)
  const [services, setServices] = useState([])
  const [range, setRange] = useState(emptyRange)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [assigningServiceId, setAssigningServiceId] = useState('')

  const configuredStaff = useMemo(
    () => normalizeOperationalStaff(storeSettings?.petshop_operational_staff),
    [storeSettings?.petshop_operational_staff],
  )
  const configuredStaffByKey = useMemo(
    () => new Map(configuredStaff.map((person) => [person.key, person])),
    [configuredStaff],
  )
  const assignableStaff = useMemo(
    () => configuredStaff.filter((person) => person.active !== false),
    [configuredStaff],
  )
  const displayRows = useMemo(() => rows.map((row) => ({
    ...row,
    collaborator_name: configuredStaffByKey.get(row.staff_key)?.name
      || row.collaborator_name
      || row.staff_key,
  })), [configuredStaffByKey, rows])

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
      setServiceHistory(snapshot.serviceHistory || [])
      setServices(serviceRows || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function assignPendingResponsible(appointment, staffKey) {
    if (!appointment?.id || !staffKey || appointment.responsible_staff_key) return
    const person = configuredStaffByKey.get(staffKey)
    if (!person) return

    setAssigningServiceId(appointment.id)
    setError('')
    try {
      await assignPendingServiceResponsible(appointment.id, { key: person.key, name: person.name })
      await reload(range)
    } catch (err) {
      setError(err.message)
    } finally {
      setAssigningServiceId('')
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const selectedHistoryItems = useMemo(() => historyRow?.staff_key
    ? serviceHistory.filter((item) => item.responsible_staff_key === historyRow.staff_key)
    : [], [historyRow, serviceHistory])

  const totals = useMemo(() => displayRows.reduce((acc, row) => ({
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
  }), [displayRows])

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
            <button onClick={() => exportCommissionCsv(displayRows)} className="btn btn-secondary">
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
                  <p className="text-sm text-muted mt-1">Escolha abaixo o responsavel para incluir estes atendimentos no fechamento.</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {pendingServices.slice(0, 9).map((appt) => (
                  <div key={appt.id} className="rounded-xl border border-[var(--border)] bg-card px-4 py-3 text-sm">
                    <p className="font-semibold text-text">
                      {appt.client?.pet_name || appt.client?.owner_name || 'Pet'} - {serviceName(services, appt.service_type)}
                    </p>
                    <p className="text-xs text-muted mt-1">{dateLabel(appt.scheduled_at)} • {fmtCurrency(appt.price || 0)}</p>
                    <select
                      aria-label={`Responsavel manual do servico ${appt.id}`}
                      className="inp mt-3 text-xs"
                      defaultValue=""
                      disabled={assigningServiceId === appt.id || assignableStaff.length === 0}
                      onChange={(event) => {
                        const staffKey = event.target.value
                        if (staffKey) void assignPendingResponsible(appt, staffKey)
                      }}
                    >
                      <option value="">{assigningServiceId === appt.id ? 'Salvando...' : 'Selecionar responsavel'}</option>
                      {assignableStaff.map((person) => (
                        <option key={person.key} value={person.key}>{person.name}</option>
                      ))}
                    </select>
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
                  <th>Conferencia</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
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
                    <td>
                      <button
                        type="button"
                        aria-label={`Visualizar historico de ${row.collaborator_name || row.staff_key}`}
                        title="Visualizar e imprimir historico"
                        disabled={!row.staff_key}
                        onClick={() => setHistoryRow(row)}
                        className="btn btn-secondary btn-sm justify-center"
                      >
                        <Eye size={13}/> Conferir
                      </button>
                    </td>
                  </tr>
                ))}
                {!rows.length && !loading && (
                  <tr><td colSpan={7} className="text-center text-muted py-10">Sem producao concluida no periodo.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {historyRow && (
        <CommissionHistoryModal
          row={historyRow}
          items={selectedHistoryItems}
          services={services}
          range={range}
          onClose={() => setHistoryRow(null)}
        />
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
