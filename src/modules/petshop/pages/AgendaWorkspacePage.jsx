import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, Printer, RefreshCw, X } from 'lucide-react'
import AgendaPage from './AgendaPage'
import { useAppointments } from '../../../shared/hooks/useAppointments'
import { useAuthCtx } from '../../../context/AuthContext'
import { fmtCurrency, todayISO } from '../../../lib/supabase'
import { printThermalReceipt } from '../../../lib/thermalPrint'

const NON_OPERATIONAL_STATUSES = new Set(['cancelado', 'no_show'])

const escapeHtml = (value = '') => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

function localDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data nao informada'
  return date.toLocaleDateString('pt-BR')
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

function appointmentTransportText(appointment) {
  const mode = String(appointment?.transport_mode || appointment?.motodog?.mode || 'cliente_leva')
  const labels = {
    cliente_leva: 'Cliente traz e busca',
    buscar_e_levar: 'MotoDog - buscar e levar',
    somente_buscar: 'MotoDog - somente buscar',
    somente_levar: 'MotoDog - somente levar',
  }
  return appointment?.transport_label || appointment?.motodog?.label || labels[mode] || mode
}

function appointmentTransportAddress(appointment) {
  return [
    appointment?.transport_address || appointment?.motodog?.address,
    appointment?.transport_neighborhood || appointment?.motodog?.neighborhood,
    appointment?.transport_city || appointment?.motodog?.city,
  ].map((value) => String(value || '').trim()).filter(Boolean).join(' - ')
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
          body { font-family: Arial, Helvetica, sans-serif; padding: 4mm 3mm; }
          .receipt { width: 100%; }
          .center { text-align: center; }
          .store { font-size: 15px; font-weight: 900; text-transform: uppercase; }
          .store-line { margin-top: 2px; font-size: 9px; line-height: 1.25; }
          .title { margin: 4mm 0 2mm; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 2mm 0; font-size: 12px; font-weight: 900; letter-spacing: .4px; }
          .row { padding: 1.5mm 0; border-bottom: 1px dotted #777; }
          .label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: .35px; }
          .value { margin-top: .5mm; font-size: 10.5px; font-weight: 700; line-height: 1.25; white-space: pre-wrap; overflow-wrap: anywhere; }
          .appointment { padding: 2.4mm 0; border-bottom: 1px dashed #000; page-break-inside: avoid; }
          .appointment-title { display: flex; justify-content: space-between; gap: 2mm; font-size: 11px; font-weight: 900; }
          .appointment-line { margin-top: 1mm; font-size: 9px; line-height: 1.3; }
          .checklist { margin-top: 3mm; border: 1px solid #000; padding: 2mm; font-size: 9px; line-height: 1.8; }
          .total { display: flex; justify-content: space-between; gap: 3mm; margin-top: 3mm; padding-top: 2mm; border-top: 2px solid #000; font-size: 13px; font-weight: 900; }
          .footer { margin-top: 4mm; font-size: 8px; line-height: 1.35; }
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

function AppointmentPrintCenter() {
  const { storeSettings } = useAuthCtx()
  const { appointments, loading, error, load, serviceLabel, statusBadge } = useAppointments()
  const [open, setOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [printError, setPrintError] = useState('')

  useEffect(() => {
    if (!open) return
    void load({ date: selectedDate })
  }, [open, selectedDate, load])

  const printableAppointments = useMemo(() => (
    (appointments || [])
      .filter((appointment) => !NON_OPERATIONAL_STATUSES.has(appointment.status))
      .sort((left, right) => new Date(left.scheduled_at) - new Date(right.scheduled_at))
  ), [appointments])

  const handlePrintSingle = (appointment) => {
    const pet = appointment?.pets || {}
    const status = statusBadge(appointment.status).label
    const transport = appointmentTransportText(appointment)
    const address = appointmentTransportAddress(appointment)
    const reference = appointment?.transport_reference || appointment?.motodog?.reference || ''
    const title = appointment.status === 'concluido' ? 'FICHA DE ATENDIMENTO' : 'FICHA DE AGENDAMENTO'
    const row = (label, value) => `
      <div class="row">
        <div class="label">${escapeHtml(label)}</div>
        <div class="value">${escapeHtml(value || 'Nao informado')}</div>
      </div>
    `
    const content = `
      ${row('Status', status)}
      ${row('Tutor', pet.owner_name)}
      ${row('Contato', pet.phone)}
      ${row('Pet', pet.pet_name)}
      ${row('Raca / especie', pet.breed || pet.species)}
      ${row('Data', localDate(appointment.scheduled_at))}
      ${row('Horario', appointmentInterval(appointment))}
      ${row('Servico', appointmentServiceText(appointment, serviceLabel))}
      ${row('Responsavel', appointment.responsible_staff_name || appointment.responsible_staff_key)}
      ${row('Transporte', transport)}
      ${address ? row('Endereco do transporte', address) : ''}
      ${reference ? row('Referencia', reference) : ''}
      ${row('Observacoes', appointment.notes || 'Nenhuma observacao')}
      <div class="checklist">
        <strong>CONTROLE INTERNO</strong><br/>
        [ ] Pet recebido &nbsp; [ ] Servico iniciado<br/>
        [ ] Servico concluido &nbsp; [ ] Tutor avisado
      </div>
      <div class="total"><span>VALOR</span><span>${escapeHtml(fmtCurrency(appointment.price))}</span></div>
    `
    setPrintError(writeAndPrint(receiptShell({ storeSettings, title, content })) ? '' : 'O navegador bloqueou a janela de impressao. Libere pop-ups para o YuiSync.')
  }

  const handlePrintDay = () => {
    const rows = printableAppointments.map((appointment, index) => {
      const pet = appointment?.pets || {}
      const status = statusBadge(appointment.status).label
      const transport = appointmentTransportText(appointment)
      const responsible = appointment.responsible_staff_name || appointment.responsible_staff_key || 'Sem responsavel'
      return `
        <section class="appointment">
          <div class="appointment-title">
            <span>${escapeHtml(appointmentInterval(appointment))}</span>
            <span>${escapeHtml(status)}</span>
          </div>
          <div class="appointment-line"><strong>${index + 1}. ${escapeHtml(pet.pet_name || 'Pet')}</strong> - Tutor: ${escapeHtml(pet.owner_name || 'Cliente')}</div>
          <div class="appointment-line">Servico: ${escapeHtml(appointmentServiceText(appointment, serviceLabel))}</div>
          <div class="appointment-line">Responsavel: ${escapeHtml(responsible)}</div>
          <div class="appointment-line">Transporte: ${escapeHtml(transport)}</div>
          ${appointment.notes ? `<div class="appointment-line">Obs.: ${escapeHtml(appointment.notes)}</div>` : ''}
        </section>
      `
    }).join('')
    const content = `
      <div class="row">
        <div class="label">Data</div>
        <div class="value">${escapeHtml(localDate(`${selectedDate}T12:00:00`))}</div>
      </div>
      <div class="row">
        <div class="label">Agendamentos operacionais</div>
        <div class="value">${printableAppointments.length}</div>
      </div>
      ${rows || '<div class="row"><div class="value">Nenhum agendamento operacional nesta data.</div></div>'}
    `
    setPrintError(writeAndPrint(receiptShell({ storeSettings, title: 'AGENDA DO DIA', content })) ? '' : 'O navegador bloqueou a janela de impressao. Libere pop-ups para o YuiSync.')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-5 z-40 inline-flex items-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white shadow-[0_14px_38px_rgba(5,150,105,0.35)] transition-transform hover:-translate-y-0.5"
        title="Imprimir agendamentos ativos ou a agenda do dia"
      >
        <Printer size={17}/>
        <span className="hidden sm:inline">Imprimir agenda</span>
      </button>

      {open && createPortal(
        <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && setOpen(false)}>
          <div className="modal-box max-w-2xl">
            <div className="modal-header">
              <div>
                <h2 className="font-display text-xl font-bold text-text">Impressao de agendamentos</h2>
                <p className="mt-1 text-xs text-muted">Agendados, confirmados, em andamento e concluidos podem ser impressos.</p>
              </div>
              <button type="button" aria-label="Fechar impressao" title="Fechar" onClick={() => setOpen(false)} className="text-muted hover:text-text">
                <X size={18}/>
              </button>
            </div>

            <div className="modal-body space-y-5">
              <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-card p-4 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="inp-label">Data da agenda</label>
                  <input className="inp" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}/>
                </div>
                <button type="button" className="btn btn-secondary justify-center" onClick={() => load({ date: selectedDate })} disabled={loading}>
                  <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> Atualizar
                </button>
                <button type="button" className="btn btn-primary justify-center" onClick={handlePrintDay} disabled={loading || printableAppointments.length === 0}>
                  <CalendarDays size={15}/> Imprimir agenda do dia
                </button>
              </div>

              {printError && (
                <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">{printError}</div>
              )}
              {error && (
                <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
              )}

              <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                    <RefreshCw size={16} className="animate-spin"/> Carregando agendamentos...
                  </div>
                ) : printableAppointments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-muted">
                    Nenhum agendamento operacional nesta data. Cancelados e no-show nao entram na impressao de controle.
                  </div>
                ) : printableAppointments.map((appointment) => {
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
    </>
  )
}

export default function AgendaWorkspacePage(props) {
  return (
    <>
      <AgendaPage {...props}/>
      <AppointmentPrintCenter/>
    </>
  )
}
