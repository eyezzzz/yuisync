import { useEffect, useMemo, useState } from 'react'
import { Calendar, CheckCircle2, ChevronRight, Clock3, RefreshCw, Sparkles } from 'lucide-react'
import { fmtCurrency, todayISO } from '../../../lib/supabase'
import { usePetshopAdvanced, LIVE_STATUS_FLOW } from '../hooks/usePetshopAdvanced'

function StatusCard({ appointment, nextStep, groomers, onAssignGroomer, onAdvance }) {
  return (
    <div className="bg-card border border-[var(--border)] rounded-2xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display font-bold text-lg text-text">{appointment.client.pet_name || appointment.client.owner_name}</p>
          <p className="text-xs text-muted">{appointment.client.owner_name}</p>
        </div>
        <span className="badge badge-blue">{appointment.live_status}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted font-bold mb-1">Horario</p>
          <p className="text-text">{new Date(appointment.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted font-bold mb-1">Servico</p>
          <p className="text-text capitalize">{appointment.service_type}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted font-bold mb-1">Valor</p>
          <p className={appointment.subscription_benefit_used ? 'text-emerald-400 font-semibold' : 'text-text'}>
            {appointment.subscription_benefit_used ? 'Coberto pelo plano' : fmtCurrency(appointment.price)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted font-bold mb-1">Check-in</p>
          <p className="text-text">
            {appointment.checkin_at ? new Date(appointment.checkin_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
          </p>
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted font-bold mb-2">Profissional</p>
        <select
          className="inp"
          value={appointment.groomer_id || ''}
          onChange={(event) => onAssignGroomer(appointment, event.target.value)}
        >
          <option value="">Sem responsavel</option>
          {groomers.map((groomer) => (
            <option key={groomer.id} value={groomer.id}>{groomer.full_name || groomer.email}</option>
          ))}
        </select>
      </div>

      {nextStep ? (
        <button onClick={() => onAdvance(appointment, nextStep.id)} className="btn btn-primary w-full justify-center">
          <ChevronRight size={15} /> Avancar para {nextStep.label}
        </button>
      ) : (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400 flex items-center gap-2">
          <CheckCircle2 size={16} /> Fluxo finalizado, pet pronto para entrega.
        </div>
      )}
    </div>
  )
}

export default function StatusLivePage() {
  const { loadLiveBoard, updateAppointmentGroomer, updateAppointmentLiveStatus, loadGroomers } = usePetshopAdvanced()
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [appointments, setAppointments] = useState([])
  const [groomers, setGroomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function reload(date = selectedDate) {
    setLoading(true)
    setError('')
    try {
      const [board, groomerList] = await Promise.all([
        loadLiveBoard(date),
        loadGroomers().catch(() => []),
      ])
      setAppointments(board)
      setGroomers(groomerList)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload(selectedDate)
  }, [selectedDate])

  const grouped = useMemo(() => {
    return LIVE_STATUS_FLOW.map((statusMeta) => ({
      ...statusMeta,
      appointments: appointments.filter((appointment) => (appointment.live_status || 'aguardando') === statusMeta.id),
    }))
  }, [appointments])

  async function handleAssignGroomer(appointment, groomerId) {
    try {
      await updateAppointmentGroomer(appointment, groomerId)
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAdvance(appointment, nextStatus) {
    try {
      await updateAppointmentLiveStatus(appointment, nextStatus)
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="page animate-fade-up space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Sparkles size={22} className="text-emerald-400" />
            Status ao Vivo
          </h1>
          <p className="page-sub">Operacao em tempo real, com check-in, banho, tosa e aviso de pet pronto.</p>
        </div>
        <div className="flex items-center gap-2">
          <input aria-label="Data do painel ao vivo" className="inp w-auto" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
          <button onClick={() => reload()} className="btn btn-secondary">
            <RefreshCw size={15} /> Atualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border border-[var(--border)] rounded-xl p-5">
          <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Pets do dia</p>
          <p className="font-display font-bold text-3xl text-text">{appointments.length}</p>
        </div>
        <div className="bg-card border border-[var(--border)] rounded-xl p-5">
          <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Em execucao</p>
          <p className="font-display font-bold text-3xl text-violet-400">
            {appointments.filter((appointment) => ['em_banho', 'em_tosa', 'secando'].includes(appointment.live_status)).length}
          </p>
        </div>
        <div className="bg-card border border-[var(--border)] rounded-xl p-5">
          <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Prontos</p>
          <p className="font-display font-bold text-3xl text-emerald-400">
            {appointments.filter((appointment) => appointment.live_status === 'pronto').length}
          </p>
        </div>
        <div className="bg-card border border-[var(--border)] rounded-xl p-5">
          <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Check-ins</p>
          <p className="font-display font-bold text-3xl text-amber-400">
            {appointments.filter((appointment) => appointment.checkin_at).length}
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="text-sm text-muted flex items-center gap-2">
          <RefreshCw size={15} className="animate-spin" /> Carregando quadro ao vivo...
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {grouped.map((column) => (
            <div key={column.id} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-text">{column.label}</p>
                  <p className="text-xs text-muted">{column.hint}</p>
                </div>
                <span className="badge badge-gray">{column.appointments.length}</span>
              </div>

              <div className="space-y-3">
                {column.appointments.map((appointment) => {
                  const currentIndex = LIVE_STATUS_FLOW.findIndex((item) => item.id === (appointment.live_status || 'aguardando'))
                  const nextStep = LIVE_STATUS_FLOW[currentIndex + 1] || null

                  return (
                    <StatusCard
                      key={appointment.id}
                      appointment={appointment}
                      nextStep={nextStep}
                      groomers={groomers}
                      onAssignGroomer={handleAssignGroomer}
                      onAdvance={handleAdvance}
                    />
                  )
                })}

                {!column.appointments.length && (
                  <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-muted text-sm">
                    <Calendar size={20} className="mx-auto mb-2 opacity-50" />
                    Nada neste status agora.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-card border border-[var(--border)] rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock3 size={16} className="text-amber-400" />
          <h2 className="section-title">Linha do tempo operacional</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {LIVE_STATUS_FLOW.map((step) => (
            <div key={step.id} className="rounded-xl bg-white/5 border border-[var(--border)] p-4">
              <p className="font-semibold text-text">{step.label}</p>
              <p className="text-xs text-muted mt-1">{step.hint}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
