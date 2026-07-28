import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  GripVertical,
  Printer,
  RefreshCw,
  X,
} from 'lucide-react'
import AgendaPage from './AgendaPage'
import { useAppointments } from '../../../shared/hooks/useAppointments'
import { useAuthCtx } from '../../../context/AuthContext'
import { fmtCurrency, todayISO } from '../../../lib/supabase'
import { printThermalReceipt } from '../../../lib/thermalPrint'

const NON_OPERATIONAL_STATUSES = new Set(['cancelado', 'no_show'])
const MOVABLE_STATUSES = new Set(['agendado', 'confirmado', 'em_andamento'])
const BOARD_START_MINUTE = 8 * 60
const BOARD_END_MINUTE = 18 * 60
const BOARD_SLOT_MINUTES = 10
const BOARD_ROW_HEIGHT = 26

const escapeHtml = (value = '') => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

function isoDateLocal(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function localDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data nao informada'
  return date.toLocaleDateString('pt-BR')
}

function minutesOfDay(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  return date.getHours() * 60 + date.getMinutes()
}

function timeFromMinutes(value) {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Number(value || 0)))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

function appointmentInterval(appointment) {
  const start = new Date(appointment?.scheduled_at || '')
  if (Number.isNaN(start.getTime())) return 'Horario nao informado'
  const duration = Math.max(10, Number(appointment?.duration_min || 60))
  const end = new Date(start.getTime() + duration * 60 * 1000)
  const format = (value) => value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${format(start)} - ${format(end)}`
}

function appointmentServiceText(appointment, serviceLabel) {
  const items = Array.isArray(appointment?.service_items) ? appointment.service_items : []
  const names = items
    .map((item) => item?.name || item?.label || item?.service_name || serviceLabel(item?.code || item?.service_type))
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  if (names.length > 0) return names.join(', ')
  return serviceLabel(appointment?.service_type) || 'Servico nao informado'
}

function appointmentGroup(appointment) {
  const explicit = String(appointment?.service_group || '').toLowerCase()
  if (explicit === 'veterinaria') return 'veterinaria'
  if (explicit === 'banho_tosa') return 'banho_tosa'
  const source = [
    appointment?.service_type,
    ...(Array.isArray(appointment?.service_items)
      ? appointment.service_items.flatMap((item) => [item?.name, item?.label, item?.code, item?.group_type])
      : []),
  ].filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return /vet|consulta|vacina|clinica|medic/.test(source) ? 'veterinaria' : 'banho_tosa'
}

function storeAddress(storeSettings) {
  return [
    storeSettings?.store_address,
    storeSettings?.store_neighborhood,
    storeSettings?.store_city,
  ].map((value) => String(value || '').trim()).filter(Boolean).join(' - ')
}

function receiptShell({ storeSettings, title, content }) {
  return `
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>${escapeHtml(title)}</title>
        <style>
          @page { margin: 0; }
          * { box-sizing: border-box; }
          html, body { width: 80mm; margin: 0; padding: 0; color: #000; background: #fff; }
          body { font-family: Arial, Helvetica, sans-serif; padding: 3mm 0 3mm 1mm; }
          .receipt { width: 64mm; max-width: 64mm; margin: 0; overflow: hidden; }
          .center { text-align: center; }
          .store { font-size: 14px; font-weight: 900; text-transform: uppercase; }
          .store-line { margin-top: 1px; font-size: 8px; line-height: 1.2; }
          .title { margin: 3mm 0 2mm; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 1.5mm 0; font-size: 11px; font-weight: 900; letter-spacing: .3px; }
          .details { padding: 1mm 0 1.5mm; border-bottom: 1px dashed #000; }
          .line { display: flex; align-items: flex-start; gap: 2mm; padding: .65mm 0; font-size: 9px; line-height: 1.25; }
          .line-label { width: 17mm; flex: 0 0 17mm; font-size: 7.5px; font-weight: 900; text-transform: uppercase; letter-spacing: .2px; }
          .line-value { min-width: 0; flex: 1; font-weight: 700; overflow-wrap: anywhere; }
          .appointment { padding: 1.8mm 0; border-bottom: 1px dashed #000; page-break-inside: avoid; }
          .appointment-title { display: flex; justify-content: space-between; gap: 2mm; font-size: 10px; font-weight: 900; font-variant-numeric: tabular-nums; }
          .appointment-line { margin-top: .7mm; font-size: 8.5px; line-height: 1.25; overflow-wrap: anywhere; }
          .control { margin-top: 2mm; padding-top: 1.5mm; border-top: 1px dotted #777; font-size: 8px; line-height: 1.7; }
          .total { display: flex; justify-content: space-between; gap: 3mm; margin-top: 2mm; padding: 1.5mm 1mm 0 0; border-top: 2px solid #000; font-size: 12px; font-weight: 900; font-variant-numeric: tabular-nums; }
          .footer { margin-top: 3mm; font-size: 7px; line-height: 1.3; }
          @media print { body { position: absolute; inset: 0 auto auto 0; } }
        </style>
      </head>
      <body>
        <main class="receipt">
          <div class="center">
            <div class="store">${escapeHtml(storeSettings?.store_name || 'PETSHOP')}</div>
            <div class="store-line">${escapeHtml(storeAddress(storeSettings) || 'Endereco nao configurado')}</div>
            <div class="store-line">${escapeHtml(storeSettings?.store_phone || '')}</div>
            <div class="title">${escapeHtml(title)}</div>
          </div>
          ${content}
          <div class="footer center">Impresso em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>
        </main>
      </body>
    </html>
  `
}

function writeAndPrint(html) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return false
  printWindow.document.write(html)
  printWindow.document.close()
  printThermalReceipt(printWindow)
  return true
}

function buildPositionedAppointments(appointments) {
  const laneEnds = []
  const positioned = appointments.map((appointment) => {
    const start = minutesOfDay(appointment.scheduled_at)
    const end = start + Math.max(10, Number(appointment.duration_min || 60))
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = end
    return { appointment, start, end, lane }
  })
  return { positioned, laneCount: Math.max(1, laneEnds.length) }
}

export default function AgendaWorkspacePage(props) {
  const { storeSettings } = useAuthCtx()
  const {
    appointments,
    loading,
    error,
    load,
    update,
    updateStatus,
    serviceLabel,
    statusBadge,
  } = useAppointments()
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [boardGroup, setBoardGroup] = useState('banho_tosa')
  const [boardOpen, setBoardOpen] = useState(true)
  const [printOpen, setPrintOpen] = useState(false)
  const [printError, setPrintError] = useState('')
  const [actionError, setActionError] = useState('')
  const [movingId, setMovingId] = useState(null)
  const [completingId, setCompletingId] = useState(null)
  const [agendaVersion, setAgendaVersion] = useState(0)

  const reload = useCallback(async () => {
    await load({ date: selectedDate })
  }, [load, selectedDate])

  useEffect(() => {
    void reload()
  }, [reload])

  const printableAppointments = useMemo(() => (
    (appointments || [])
      .filter((appointment) => !NON_OPERATIONAL_STATUSES.has(appointment.status))
      .sort((left, right) => new Date(left.scheduled_at) - new Date(right.scheduled_at))
  ), [appointments])

  const boardAppointments = useMemo(() => (
    printableAppointments.filter((appointment) => (
      isoDateLocal(appointment.scheduled_at) === selectedDate
      && appointmentGroup(appointment) === boardGroup
      && minutesOfDay(appointment.scheduled_at) < BOARD_END_MINUTE
      && minutesOfDay(appointment.scheduled_at) + Number(appointment.duration_min || 60) > BOARD_START_MINUTE
    ))
  ), [printableAppointments, selectedDate, boardGroup])

  const { positioned, laneCount } = useMemo(
    () => buildPositionedAppointments(boardAppointments),
    [boardAppointments],
  )

  const slots = useMemo(() => Array.from(
    { length: (BOARD_END_MINUTE - BOARD_START_MINUTE) / BOARD_SLOT_MINUTES },
    (_, index) => BOARD_START_MINUTE + index * BOARD_SLOT_MINUTES,
  ), [])
  const boardHeight = slots.length * BOARD_ROW_HEIGHT

  const refreshAllAgendaViews = useCallback(async () => {
    await reload()
    setAgendaVersion((current) => current + 1)
  }, [reload])

  const handleMove = useCallback(async (appointmentId, targetMinute) => {
    const appointment = appointments.find((item) => item.id === appointmentId)
    if (!appointment || !MOVABLE_STATUSES.has(appointment.status)) return
    const target = new Date(`${selectedDate}T00:00:00`)
    target.setMinutes(targetMinute)
    setMovingId(appointmentId)
    setActionError('')
    try {
      await update(appointmentId, {
        scheduled_at: target.toISOString(),
        source: 'manual',
      })
      await refreshAllAgendaViews()
    } catch (moveError) {
      setActionError(moveError?.message || 'Nao foi possivel mover o agendamento para este horario.')
      await reload()
    } finally {
      setMovingId(null)
    }
  }, [appointments, refreshAllAgendaViews, reload, selectedDate, update])

  const handleComplete = useCallback(async (appointmentId) => {
    setCompletingId(appointmentId)
    setActionError('')
    try {
      await updateStatus(appointmentId, 'concluido')
      await refreshAllAgendaViews()
    } catch (statusError) {
      setActionError(statusError?.message || 'Nao foi possivel concluir o agendamento.')
    } finally {
      setCompletingId(null)
    }
  }, [refreshAllAgendaViews, updateStatus])

  const handlePrintSingle = useCallback((appointment) => {
    const pet = appointment?.pets || {}
    const status = statusBadge(appointment.status).label
    const responsible = appointment.responsible_staff_name || appointment.responsible_staff_key || 'Sem responsavel'
    const title = appointment.status === 'concluido' ? 'FICHA DE ATENDIMENTO' : 'FICHA DE AGENDAMENTO'
    const line = (label, value) => `
      <div class="line">
        <span class="line-label">${escapeHtml(label)}</span>
        <span class="line-value">${escapeHtml(value || 'Nao informado')}</span>
      </div>
    `
    const content = `
      <div class="details">
        ${line('Status', status)}
        ${line('Tutor / Pet', `${pet.owner_name || 'Cliente'} / ${pet.pet_name || 'Pet'}`)}
        ${line('Data / Hora', `${localDate(appointment.scheduled_at)} - ${appointmentInterval(appointment)}`)}
        ${line('Servico', appointmentServiceText(appointment, serviceLabel))}
        ${line('Responsavel', responsible)}
        ${line('Observacoes', appointment.notes || 'Nenhuma observacao')}
      </div>
      <div class="control">
        <strong>CONTROLE:</strong> [ ] Recebido &nbsp; [ ] Iniciado &nbsp; [ ] Concluido &nbsp; [ ] Tutor avisado
      </div>
      <div class="total"><span>VALOR</span><span>${escapeHtml(fmtCurrency(appointment.price))}</span></div>
    `
    setPrintError(writeAndPrint(receiptShell({ storeSettings, title, content }))
      ? ''
      : 'O navegador bloqueou a janela de impressao. Libere pop-ups para o YuiSync.')
  }, [serviceLabel, statusBadge, storeSettings])

  const handlePrintDay = useCallback(() => {
    const dayAppointments = printableAppointments.filter((appointment) => isoDateLocal(appointment.scheduled_at) === selectedDate)
    const rows = dayAppointments.map((appointment, index) => {
      const pet = appointment?.pets || {}
      const status = statusBadge(appointment.status).label
      const responsible = appointment.responsible_staff_name || appointment.responsible_staff_key || 'Sem responsavel'
      return `
        <section class="appointment">
          <div class="appointment-title">
            <span>${escapeHtml(appointmentInterval(appointment))}</span>
            <span>${escapeHtml(status)}</span>
          </div>
          <div class="appointment-line"><strong>${index + 1}. ${escapeHtml(pet.pet_name || 'Pet')}</strong> - ${escapeHtml(pet.owner_name || 'Cliente')}</div>
          <div class="appointment-line">${escapeHtml(appointmentServiceText(appointment, serviceLabel))}</div>
          <div class="appointment-line">Resp.: ${escapeHtml(responsible)}</div>
          ${appointment.notes ? `<div class="appointment-line">Obs.: ${escapeHtml(appointment.notes)}</div>` : ''}
        </section>
      `
    }).join('')
    const content = `
      <div class="details">
        <div class="line"><span class="line-label">Data</span><span class="line-value">${escapeHtml(localDate(`${selectedDate}T12:00:00`))}</span></div>
        <div class="line"><span class="line-label">Total</span><span class="line-value">${dayAppointments.length} agendamentos</span></div>
      </div>
      ${rows || '<div class="appointment-line">Nenhum agendamento operacional nesta data.</div>'}
    `
    setPrintError(writeAndPrint(receiptShell({ storeSettings, title: 'AGENDA DO DIA', content }))
      ? ''
      : 'O navegador bloqueou a janela de impressao. Libere pop-ups para o YuiSync.')
  }, [printableAppointments, selectedDate, serviceLabel, statusBadge, storeSettings])

  return (
    <div className="agenda-workspace">
      <style>{`
        .agenda-workspace-legacy [aria-label="Imprimir recibo"],
        .agenda-workspace-legacy [aria-label="Imprimir ficha do agendamento"],
        .agenda-workspace-legacy [aria-label="Imprimir ficha concluida"] { display: none !important; }
      `}</style>

      <section className="mx-4 mt-4 overflow-hidden rounded-2xl border border-emerald-500/25 bg-card shadow-[0_18px_50px_rgba(5,150,105,0.08)] lg:mx-6">
        <header className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <button type="button" onClick={() => setBoardOpen((current) => !current)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-400">
              <Clock size={18}/>
            </span>
            <span className="min-w-0">
              <strong className="block text-sm text-text">Operacao rapida da agenda</strong>
              <span className="block truncate text-xs text-muted">Arraste os cards para faixas de 10 minutos, conclua ou imprima sem abrir a edicao.</span>
            </span>
            {boardOpen ? <ChevronUp size={17} className="ml-auto shrink-0 text-muted"/> : <ChevronDown size={17} className="ml-auto shrink-0 text-muted"/>}
          </button>

          <input
            aria-label="Data da operacao rapida"
            className="inp w-auto py-2"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
          <button type="button" className="btn btn-ghost btn-sm btn-icon" title="Atualizar" onClick={reload} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setPrintOpen(true)}>
            <Printer size={15}/> Imprimir
          </button>
        </header>

        {boardOpen && (
          <div className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {[
                { id: 'banho_tosa', label: 'Banho / Tosa' },
                { id: 'veterinaria', label: 'Veterinaria' },
              ].map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setBoardGroup(group.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${boardGroup === group.id ? 'bg-emerald-500 text-gray-950' : 'bg-white/5 text-muted hover:text-text'}`}
                >
                  {group.label}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-muted">Segure pelo card e solte na nova faixa. Concluidos nao podem ser movidos.</span>
            </div>

            {(actionError || error) && (
              <div className="mb-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {actionError || error}
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <div className="grid min-w-[720px]" style={{ gridTemplateColumns: '72px minmax(0, 1fr)' }}>
                <div className="relative bg-surface/45" style={{ height: boardHeight }}>
                  {slots.map((minute, index) => (
                    <div
                      key={`label-${minute}`}
                      className="absolute inset-x-0 border-b border-[var(--border)] px-2 text-[10px] font-bold text-muted"
                      style={{ top: index * BOARD_ROW_HEIGHT, height: BOARD_ROW_HEIGHT }}
                    >
                      <span className="relative top-1">{timeFromMinutes(minute)}</span>
                    </div>
                  ))}
                </div>

                <div className="relative border-l border-[var(--border)] bg-black/[0.02]" style={{ height: boardHeight }}>
                  {slots.map((minute, index) => (
                    <div
                      key={`slot-${minute}`}
                      role="button"
                      tabIndex={-1}
                      aria-label={`Mover para ${timeFromMinutes(minute)}`}
                      onDragOver={(event) => {
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        const appointmentId = event.dataTransfer.getData('text/yuisync-appointment')
                        if (appointmentId) void handleMove(appointmentId, minute)
                      }}
                      className="absolute inset-x-0 border-b border-[var(--border)] transition-colors hover:bg-emerald-500/[0.05]"
                      style={{ top: index * BOARD_ROW_HEIGHT, height: BOARD_ROW_HEIGHT }}
                    />
                  ))}

                  {positioned.map(({ appointment, start, end, lane }) => {
                    const top = ((Math.max(start, BOARD_START_MINUTE) - BOARD_START_MINUTE) / BOARD_SLOT_MINUTES) * BOARD_ROW_HEIGHT + 2
                    const visibleEnd = Math.min(end, BOARD_END_MINUTE)
                    const height = Math.max(44, ((visibleEnd - Math.max(start, BOARD_START_MINUTE)) / BOARD_SLOT_MINUTES) * BOARD_ROW_HEIGHT - 4)
                    const laneWidth = 100 / laneCount
                    const badge = statusBadge(appointment.status)
                    const pet = appointment?.pets || {}
                    const movable = MOVABLE_STATUSES.has(appointment.status)
                    const busy = movingId === appointment.id || completingId === appointment.id
                    return (
                      <article
                        key={appointment.id}
                        draggable={movable && !busy}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData('text/yuisync-appointment', appointment.id)
                        }}
                        className={`absolute z-10 overflow-hidden rounded-xl border p-2 shadow-lg ${movable ? 'cursor-grab border-emerald-400/30 bg-surface active:cursor-grabbing' : 'border-white/10 bg-surface/85'} ${busy ? 'opacity-60' : ''}`}
                        style={{
                          top,
                          height,
                          left: `calc(${lane * laneWidth}% + 4px)`,
                          width: `calc(${laneWidth}% - 8px)`,
                        }}
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <GripVertical size={14} className={`mt-0.5 shrink-0 ${movable ? 'text-emerald-400' : 'text-muted/40'}`}/>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <strong className="whitespace-nowrap text-[11px] text-text">{appointmentInterval(appointment)}</strong>
                              <span className={`badge ${badge.cls} text-[9px]`}>{badge.label}</span>
                            </div>
                            <p className="mt-1 truncate text-xs font-black text-text">{pet.pet_name || 'Pet'} - {pet.owner_name || 'Cliente'}</p>
                            <p className="mt-0.5 truncate text-[10px] text-muted">{appointmentServiceText(appointment, serviceLabel)}</p>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {appointment.status !== 'concluido' && (
                            <button
                              type="button"
                              onClick={() => void handleComplete(appointment.id)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2 py-1 text-[10px] font-black text-gray-950 hover:bg-emerald-400 disabled:opacity-50"
                            >
                              <CheckCircle2 size={11}/> Concluir
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handlePrintSingle(appointment)}
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-black text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                          >
                            <Printer size={11}/> Imprimir
                          </button>
                        </div>
                      </article>
                    )
                  })}

                  {!loading && boardAppointments.length === 0 && (
                    <div className="absolute inset-x-8 top-8 rounded-xl border border-dashed border-[var(--border)] bg-card/80 px-4 py-5 text-center text-sm text-muted">
                      Nenhum agendamento operacional nesta area e data.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="agenda-workspace-legacy">
        <AgendaPage key={agendaVersion} {...props}/>
      </div>

      {printOpen && createPortal(
        <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && setPrintOpen(false)}>
          <div className="modal-box max-w-2xl">
            <div className="modal-header">
              <div>
                <h2 className="font-display text-xl font-bold text-text">Impressao de agendamentos</h2>
                <p className="mt-1 text-xs text-muted">Imprima uma ficha individual ou toda a agenda operacional da data.</p>
              </div>
              <button type="button" aria-label="Fechar impressao" title="Fechar" onClick={() => setPrintOpen(false)} className="text-muted hover:text-text">
                <X size={18}/>
              </button>
            </div>

            <div className="modal-body space-y-4">
              <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-card p-4 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="inp-label">Data da agenda</label>
                  <input className="inp" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}/>
                </div>
                <button type="button" className="btn btn-primary justify-center" onClick={handlePrintDay} disabled={loading || printableAppointments.length === 0}>
                  <CalendarDays size={15}/> Imprimir agenda do dia
                </button>
              </div>

              {printError && (
                <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">{printError}</div>
              )}

              <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                    <RefreshCw size={16} className="animate-spin"/> Carregando agendamentos...
                  </div>
                ) : printableAppointments.filter((appointment) => isoDateLocal(appointment.scheduled_at) === selectedDate).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-muted">
                    Nenhum agendamento operacional nesta data.
                  </div>
                ) : printableAppointments
                  .filter((appointment) => isoDateLocal(appointment.scheduled_at) === selectedDate)
                  .map((appointment) => {
                    const pet = appointment?.pets || {}
                    const badge = statusBadge(appointment.status)
                    return (
                      <div key={appointment.id} className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-card p-4 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-sm text-text">{appointmentInterval(appointment)}</strong>
                            <span className={`badge ${badge.cls}`}>{badge.label}</span>
                          </div>
                          <p className="mt-1 truncate text-sm font-semibold text-text">{pet.pet_name || 'Pet'} - {pet.owner_name || 'Cliente'}</p>
                          <p className="mt-1 truncate text-xs text-muted">{appointmentServiceText(appointment, serviceLabel)}</p>
                        </div>
                        <button type="button" className="btn btn-secondary justify-center" onClick={() => handlePrintSingle(appointment)}>
                          <Printer size={15}/> Imprimir ficha
                        </button>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
