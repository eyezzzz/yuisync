from pathlib import Path

FILES = {
    'package': Path('src/modules/petshop/pages/AgendaPackageIntegratedPage.jsx'),
    'integrated': Path('src/modules/petshop/pages/AgendaIntegratedPage.jsx'),
    'resolved': Path('src/modules/petshop/pages/AgendaResolvedPage.jsx'),
    'agenda': Path('src/modules/petshop/pages/AgendaPage.jsx'),
    'pdv': Path('src/modules/petshop/pages/BanhoTosaPdvPanel.jsx'),
}
workflow_path = Path('.github/workflows/apply-agenda-completion-checkout.yml')
script_path = Path(__file__)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: esperado 1 trecho, encontrado {count}')
    return text.replace(old, new, 1)


# Encaminha setPage por toda a composicao real da Agenda.
text = FILES['package'].read_text(encoding='utf-8')
text = replace_once(text,
    'export default function AgendaPackageIntegratedPage() {',
    'export default function AgendaPackageIntegratedPage({ setPage }) {',
    'props do wrapper da agenda')
text = replace_once(text,
    '      <AgendaIntegratedPage />',
    '      <AgendaIntegratedPage setPage={setPage} />',
    'setPage no wrapper da agenda')
FILES['package'].write_text(text, encoding='utf-8')

text = FILES['integrated'].read_text(encoding='utf-8')
text = replace_once(text,
    'export default function AgendaIntegratedPage() {',
    'export default function AgendaIntegratedPage({ setPage }) {',
    'props da agenda integrada')
text = replace_once(text,
    '      <AgendaResolvedPage />',
    '      <AgendaResolvedPage setPage={setPage} />',
    'setPage na agenda resolvida')
FILES['integrated'].write_text(text, encoding='utf-8')

# O overlay operacional tambem precisa seguir o mesmo fluxo financeiro.
text = FILES['resolved'].read_text(encoding='utf-8')
text = replace_once(text,
    "import './AgendaResolvedPage.css'",
    "import { appointmentCheckoutTotals, queueAppointmentCheckout } from './appointmentCheckoutFlow'\nimport './AgendaResolvedPage.css'",
    'import do checkout na agenda resolvida')
text = replace_once(text,
    'function ResolvedAgendaOperations() {',
    'function ResolvedAgendaOperations({ setPage }) {',
    'props das operacoes resolvidas')
old_complete = """  const completeAppointment = useCallback(async (appointmentId) => {
    setNotice('')
    try {
      await updateStatus(appointmentId, 'concluido')
      await load({ date: selectedDate })
      refreshAgendaPage()
      setNotice('Agendamento concluido.')
    } catch (error) {
      setNotice(error?.message || 'Nao foi possivel concluir o agendamento.')
    }
  }, [load, refreshAgendaPage, selectedDate, updateStatus])"""
new_complete = """  const completeAppointment = useCallback(async (appointmentId) => {
    setNotice('')
    try {
      const updated = await updateStatus(appointmentId, 'concluido')
      await load({ date: selectedDate })
      refreshAgendaPage()
      if (!updated) return
      const totals = appointmentCheckoutTotals(updated, transportOptions)
      if (totals.total <= 0.005) {
        printAppointment(updated)
        setNotice('Atendimento coberto pelo pacote. Nenhuma nova venda foi criada.')
        return
      }
      queueAppointmentCheckout(updated)
      setPage?.('ordens')
    } catch (error) {
      setNotice(error?.message || 'Nao foi possivel concluir o agendamento.')
    }
  }, [load, printAppointment, refreshAgendaPage, selectedDate, setPage, transportOptions, updateStatus])"""
text = replace_once(text, old_complete, new_complete, 'conclusao financeira do overlay')
text = replace_once(text,
    "export default function AgendaResolvedPage() {\n  return (\n    <>\n      <AgendaPage />\n      <ResolvedAgendaOperations />\n    </>\n  )\n}",
    "export default function AgendaResolvedPage({ setPage }) {\n  return (\n    <>\n      <AgendaPage setPage={setPage} />\n      <ResolvedAgendaOperations setPage={setPage} />\n    </>\n  )\n}",
    'composicao resolvida com setPage')
FILES['resolved'].write_text(text, encoding='utf-8')

# Integra o fluxo no modal/lista/kanban/historico nativos.
text = FILES['agenda'].read_text(encoding='utf-8')
text = replace_once(text,
    '  CheckCircle, Zap, PartyPopper, XCircle, Play, MapPin, Bike\n',
    '  CheckCircle, Zap, PartyPopper, XCircle, Play, MapPin, Bike, Wallet\n',
    'icone de recebimento')
text = replace_once(text,
    "} from '../lib/appointmentOperational'\n",
    "} from '../lib/appointmentOperational'\nimport { normalizeTransportOptions } from './agendaOperationalCore'\nimport { appointmentCheckoutTotals, appointmentNeedsPayment, queueAppointmentCheckout } from './appointmentCheckoutFlow'\n",
    'imports financeiros da agenda')
text = replace_once(text,
    'function KanbanCard({ appt, serviceLabel, statusBadge, onEdit, onStatus, onReceipt, services = SERVICES, staffById = new Map() }) {',
    'function KanbanCard({ appt, serviceLabel, statusBadge, onEdit, onStatus, onReceipt, onCompletedAction, needsPayment, services = SERVICES, staffById = new Map() }) {',
    'props financeiros do kanban')
text = replace_once(text,
    """          {appt.status === 'concluido' && (
            <button type="button" aria-label="Imprimir recibo" onClick={() => onReceipt(appt)} className="text-muted hover:text-emerald-400" title="Imprimir Recibo">
              <Receipt size={13}/>
            </button>
          )}""",
    """          {appt.status === 'concluido' && (
            <button type="button" aria-label={needsPayment(appt) ? 'Receber atendimento' : 'Imprimir ficha'} onClick={() => onCompletedAction(appt)} className="text-muted hover:text-emerald-400" title={needsPayment(appt) ? 'Receber e lancar no caixa' : 'Imprimir ficha'}>
              {needsPayment(appt) ? <Wallet size={13}/> : <Receipt size={13}/>}
            </button>
          )}""",
    'acao concluida no kanban')
text = replace_once(text,
    """  onReceipt,
  onCreateAt,""",
    """  onReceipt,
  onCompletedAction,
  needsPayment,
  onCreateAt,""",
    'props financeiros da timeline')
old_history = """              {history.map((appt) => (
                <button
                  key={appt.id}
                  type="button"
                  onClick={() => onEdit(appt)}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs text-muted hover:bg-white/[0.06]"
                >
                  {fmtAppointmentInterval(appt)} · {appt.pets?.pet_name || 'Pet'} · {statusBadge(appt.status).label}
                </button>
              ))}"""
new_history = """              {history.map((appt) => {
                const paymentPending = appt.status === 'concluido' && needsPayment(appt)
                return (
                  <div key={appt.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-muted">
                    <button type="button" onClick={() => onEdit(appt)} className="min-w-0 flex-1 truncate text-left hover:text-text">
                      {fmtAppointmentInterval(appt)} · {appt.pets?.pet_name || 'Pet'} · {statusBadge(appt.status).label}
                    </button>
                    {appt.status === 'concluido' && (
                      <button type="button" onClick={() => onCompletedAction(appt)} className={`shrink-0 rounded-md px-2 py-1 font-bold ${paymentPending ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/12 text-emerald-300'}`}>
                        {paymentPending ? 'Receber' : 'Imprimir'}
                      </button>
                    )}
                  </div>
                )
              })}"""
text = replace_once(text, old_history, new_history, 'acoes no historico diario')
text = replace_once(text,
    """                                  aria-label="Imprimir ficha concluida"
                                  title="Imprimir ficha 80 mm"
                                  onClick={() => onReceipt(appt)}
                                  className="shrink-0 rounded p-1 text-emerald-300 hover:bg-emerald-500/15"
                                >
                                  <Receipt size={11}/>""",
    """                                  aria-label={needsPayment(appt) ? 'Receber atendimento concluido' : 'Imprimir ficha concluida'}
                                  title={needsPayment(appt) ? 'Receber e lancar no caixa' : 'Imprimir ficha 80 mm'}
                                  onClick={() => onCompletedAction(appt)}
                                  className={`shrink-0 rounded p-1 ${needsPayment(appt) ? 'text-amber-300 hover:bg-amber-500/15' : 'text-emerald-300 hover:bg-emerald-500/15'}`}
                                >
                                  {needsPayment(appt) ? <Wallet size={11}/> : <Receipt size={11}/>}""",
    'acao na timeline semanal')
text = replace_once(text,
    'export default function AgendaPage() {',
    'export default function AgendaPage({ setPage }) {',
    'setPage na pagina real')
text = replace_once(text,
    "  const staffById = useMemo(() => new Map((staff || []).map((person) => [person.key, person])), [staff])\n",
    "  const staffById = useMemo(() => new Map((staff || []).map((person) => [person.key, person])), [staff])\n  const transportOptions = useMemo(() => normalizeTransportOptions(storeSettings), [storeSettings])\n  const needsPayment = (appointment) => appointmentNeedsPayment(appointment, transportOptions)\n  const handleCompletedAction = (appointment) => {\n    if (!appointment) return\n    const totals = appointmentCheckoutTotals(appointment, transportOptions)\n    if (totals.total <= 0.005) {\n      setReceipt(appointment)\n      return\n    }\n    queueAppointmentCheckout(appointment)\n    setPage?.('ordens')\n  }\n",
    'estado e acao financeira da agenda')
text = replace_once(text,
    """  const handleStatusChange = async (appointmentId, status) => {
    const updated = await updateStatus(appointmentId, status)
    if (status === 'concluido' && updated) setReceipt(updated)
    return updated
  }""",
    """  const handleStatusChange = async (appointmentId, status) => {
    const updated = await updateStatus(appointmentId, status)
    if (status === 'concluido' && updated) handleCompletedAction(updated)
    return updated
  }""",
    'conclusao financeira nativa')
text = replace_once(text,
    """          onReceipt={setReceipt}
          slotCapacity={activeAgendaTab === 'banho_tosa' ? MANUAL_SLOT_CAPACITY : 1}""",
    """          onReceipt={setReceipt}
          onCompletedAction={handleCompletedAction}
          needsPayment={needsPayment}
          slotCapacity={activeAgendaTab === 'banho_tosa' ? MANUAL_SLOT_CAPACITY : 1}""",
    'acoes financeiras na timeline')
text = replace_once(text,
    """                          {a.status === 'concluido' && (
                            <button type="button" aria-label="Imprimir recibo" onClick={() => setReceipt(a)}
                              className="btn btn-ghost btn-sm btn-icon text-emerald-400 border border-emerald-500/20" title="Imprimir Recibo">
                              <Receipt size={13}/>
                            </button>
                          )}""",
    """                          {a.status === 'concluido' && (
                            <button type="button" aria-label={needsPayment(a) ? 'Receber atendimento' : 'Imprimir ficha'} onClick={() => handleCompletedAction(a)}
                              className={`btn btn-ghost btn-sm btn-icon border ${needsPayment(a) ? 'text-amber-400 border-amber-500/20' : 'text-emerald-400 border-emerald-500/20'}`} title={needsPayment(a) ? 'Receber e lancar no caixa' : 'Imprimir ficha'}>
                              {needsPayment(a) ? <Wallet size={13}/> : <Receipt size={13}/>}
                            </button>
                          )}""",
    'acao financeira na lista')
text = replace_once(text,
    """                      onEdit={(a) => setModal(a)} onStatus={handleStatusChange} onReceipt={setReceipt}
                      services={agendaServices} staffById={staffById}/>""",
    """                      onEdit={(a) => setModal(a)} onStatus={handleStatusChange} onReceipt={setReceipt}
                      onCompletedAction={handleCompletedAction} needsPayment={needsPayment}
                      services={agendaServices} staffById={staffById}/>""",
    'acao financeira no kanban')
FILES['agenda'].write_text(text, encoding='utf-8')

# Reusa o mesmo calculo e abre automaticamente o atendimento recem-concluido.
text = FILES['pdv'].read_text(encoding='utf-8')
text = replace_once(text,
    """import {
  appointmentPriceBreakdown,
  normalizeTransportOptions,
  transportFeeForMode,
} from './agendaOperationalCore'""",
    """import { normalizeTransportOptions } from './agendaOperationalCore'
import {
  appointmentCheckoutTotals,
  clearQueuedAppointmentCheckout,
  readQueuedAppointmentCheckout,
} from './appointmentCheckoutFlow'""",
    'imports compartilhados do pdv')
text = replace_once(text,
    """  appointment,
  sale,
  totals,
  checkingOut,""",
    """  appointment,
  sale,
  totals,
  highlighted,
  checkingOut,""",
    'prop de destaque do card')
text = replace_once(text,
    """    <article className={`rounded-2xl border p-4 ${sale || zeroTotal ? 'border-emerald-500/25 bg-emerald-500/[0.06]' : 'border-[var(--border)] bg-card'}`}>""",
    """    <article data-yuisync-appointment-checkout={appointment.id} className={`rounded-2xl border p-4 ${highlighted ? 'ring-2 ring-amber-400/60' : ''} ${sale || zeroTotal ? 'border-emerald-500/25 bg-emerald-500/[0.06]' : 'border-[var(--border)] bg-card'}`}>""",
    'destaque do atendimento')
text = replace_once(text,
    """  const [date, setDate] = useState(localDate())
  const [appointments, setAppointments] = useState([])""",
    """  const initialCheckoutTarget = useMemo(() => readQueuedAppointmentCheckout(), [])
  const [date, setDate] = useState(initialCheckoutTarget?.date || localDate())
  const [focusedId, setFocusedId] = useState(initialCheckoutTarget?.appointment_id || null)
  const [appointments, setAppointments] = useState([])""",
    'alvo inicial do checkout')
old_totals = """  const totalsFor = useCallback((appointment) => {
    const breakdown = appointmentPriceBreakdown(appointment, transportOptions)
    const mode = appointment.transport_mode || 'cliente_leva'
    const catalogTransport = transportFeeForMode(transportOptions, mode)
    const netTransport = appointmentHasTransportBenefit(appointment) ? 0 : breakdown.transport
    const items = Array.isArray(appointment.service_items) ? appointment.service_items : []
    const catalogServices = items.length
      ? items.reduce((sum, item) => sum + Math.max(0, Number(item?.catalog_price ?? item?.default_price ?? item?.unit_price ?? item?.price ?? 0)), 0)
      : Math.max(0, Number(appointment.price || 0))
    const catalogTotal = Math.max(breakdown.total, catalogServices + catalogTransport)
    const total = Math.max(0, breakdown.service + netTransport)
    return {
      service: breakdown.service,
      transport: netTransport,
      catalogTransport,
      catalogTotal,
      total,
      discount: Math.max(0, catalogTotal - total),
    }
  }, [transportOptions])"""
new_totals = """  const totalsFor = useCallback(
    (appointment) => appointmentCheckoutTotals(appointment, transportOptions),
    [transportOptions],
  )"""
text = replace_once(text, old_totals, new_totals, 'calculo compartilhado do pdv')
text = replace_once(text,
    '  function openCheckout(appointment, totals) {',
    '  const openCheckout = useCallback((appointment, totals) => {',
    'checkout memoizado')
text = replace_once(text,
    """    setSplits([
      { method: 'dinheiro', amount: totals.total ? totals.total.toFixed(2) : '' },
      { method: 'pix', amount: '' },
    ])
  }""",
    """    setSplits([
      { method: 'dinheiro', amount: totals.total ? totals.total.toFixed(2) : '' },
      { method: 'pix', amount: '' },
    ])
  }, [])""",
    'fim do checkout memoizado')
text = replace_once(text,
    """      setActiveId(null)
      await reload()""",
    """      setActiveId(null)
      setFocusedId(null)
      clearQueuedAppointmentCheckout()
      await reload()""",
    'limpeza apos pagamento')
text = replace_once(text,
    """  const financialState = useMemo(() => appointments.map((appointment) => ({
    appointment,
    sale: salesByAppointment.get(String(appointment.id)) || null,
    totals: totalsFor(appointment),
  })), [appointments, salesByAppointment, totalsFor])
  const pendingCount""",
    """  const financialState = useMemo(() => appointments.map((appointment) => ({
    appointment,
    sale: salesByAppointment.get(String(appointment.id)) || null,
    totals: totalsFor(appointment),
  })), [appointments, salesByAppointment, totalsFor])

  useEffect(() => {
    if (!focusedId || loading) return
    const entry = financialState.find((item) => String(item.appointment.id) === String(focusedId))
    if (!entry) return
    if (entry.sale || entry.totals.total <= 0.005) {
      clearQueuedAppointmentCheckout()
      setFocusedId(null)
      return
    }
    openCheckout(entry.appointment, entry.totals)
    clearQueuedAppointmentCheckout()
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-yuisync-appointment-checkout="${entry.appointment.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [financialState, focusedId, loading, openCheckout])

  const pendingCount""",
    'abertura automatica do checkout')
text = replace_once(text,
    """              totals={totals}
              checkingOut={checkingOut}""",
    """              totals={totals}
              highlighted={String(focusedId || activeId || '') === String(appointment.id)}
              checkingOut={checkingOut}""",
    'destaque repassado ao card')
FILES['pdv'].write_text(text, encoding='utf-8')

# Remove artefatos temporarios depois da aplicacao.
if workflow_path.exists():
    workflow_path.unlink()
if script_path.exists():
    script_path.unlink()
