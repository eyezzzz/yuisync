import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, GripVertical, Printer } from 'lucide-react'
import AgendaPage from './AgendaPage'
import { useAppointments } from '../../../shared/hooks/useAppointments'
import { useAuthCtx } from '../../../context/AuthContext'
import { fmtCurrency, todayISO } from '../../../lib/supabase'
import { printThermalReceipt } from '../../../lib/thermalPrint'
import {
  normalizeServiceDurations,
  resolvePetshopServiceDuration,
} from '../../../../shared/petshopOperations'
import './AgendaIntegratedPage.css'

const NON_OPERATIONAL_STATUSES = new Set(['cancelado', 'no_show'])
const DEFAULT_TRANSPORT_OPTIONS = [
  { id: 'buscar_e_levar', label: 'Buscar e levar', fee: 20, active: true },
  { id: 'somente_buscar', label: 'Somente buscar', fee: 15, active: true },
  { id: 'somente_levar', label: 'Somente levar', fee: 15, active: true },
]
const MONTHS_PT = {
  janeiro: 0,
  fevereiro: 1,
  marco: 2,
  março: 2,
  abril: 3,
  maio: 4,
  junho: 5,
  julho: 6,
  agosto: 7,
  setembro: 8,
  outubro: 9,
  novembro: 10,
  dezembro: 11,
}

const escapeHtml = (value = '') => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const normalizeText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

const moneyNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value ?? '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function localDateKey(value) {
  const parsed = new Date(value || '')
  return Number.isNaN(parsed.getTime()) ? '' : isoDate(parsed)
}

function parseAgendaDate(text) {
  const normalized = normalizeText(text)
  const longMatch = normalized.match(/(\d{1,2}) de ([a-z]+) de (\d{4})/)
  if (longMatch) {
    const month = MONTHS_PT[longMatch[2]]
    if (month !== undefined) {
      const parsed = new Date(Number(longMatch[3]), month, Number(longMatch[1]), 12, 0, 0, 0)
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
  }

  const shortMatch = normalized.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
  if (!shortMatch) return null
  const currentYear = new Date().getFullYear()
  const rawYear = shortMatch[3] ? Number(shortMatch[3]) : currentYear
  const year = rawYear < 100 ? 2000 + rawYear : rawYear
  const parsed = new Date(year, Number(shortMatch[2]) - 1, Number(shortMatch[1]), 12, 0, 0, 0)
  return Number.isNaN(parsed.getTime()) ? null : parsed
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

function normalizeTransportOptions(storeSettings = {}) {
  const configured = Array.isArray(storeSettings?.pet_transport_options)
    ? storeSettings.pet_transport_options
    : []
  const source = configured.length > 0 ? configured : DEFAULT_TRANSPORT_OPTIONS
  return source.map((option, index) => ({
    id: String(option?.id || DEFAULT_TRANSPORT_OPTIONS[index]?.id || ''),
    label: String(option?.label || DEFAULT_TRANSPORT_OPTIONS[index]?.label || 'Transporte'),
    fee: Math.max(0, moneyNumber(option?.fee ?? DEFAULT_TRANSPORT_OPTIONS[index]?.fee ?? 0)),
    active: option?.active !== false,
  }))
}

function transportFeeForMode(options, mode) {
  if (!mode || mode === 'cliente_leva') return 0
  return options.find((option) => option.id === mode && option.active)?.fee || 0
}

function servicePriceFromItems(appointment) {
  const items = Array.isArray(appointment?.service_items) ? appointment.service_items : []
  return items.reduce((sum, item) => (
    sum + Math.max(0, moneyNumber(item?.unit_price ?? item?.price ?? item?.default_price ?? item?.amount ?? 0))
  ), 0)
}

function appointmentPriceBreakdown(appointment, transportOptions) {
  const transportMode = appointment?.transport_mode || appointment?.motodog?.mode || 'cliente_leva'
  const transport = transportFeeForMode(transportOptions, transportMode)
  const stored = Math.max(0, moneyNumber(appointment?.price))
  const itemService = servicePriceFromItems(appointment)

  if (itemService > 0) {
    return {
      service: itemService,
      transport,
      total: Math.max(stored, itemService + transport),
    }
  }

  if (transport > 0 && stored >= transport) {
    return {
      service: Math.max(0, stored - transport),
      transport,
      total: stored,
    }
  }

  return { service: stored, transport, total: stored + transport }
}

function storeAddress(storeSettings) {
  return [
    storeSettings?.store_address,
    storeSettings?.store_neighborhood,
    storeSettings?.store_city,
  ].map((value) => String(value || '').trim()).filter(Boolean).join(' - ')
}

function receiptShell({ storeSettings, title, content }) {
  const logo = String(storeSettings?.receipt_logo_data_url || '')
  const header = logo
    ? `<img class="print-logo" src="${escapeHtml(logo)}" alt="Logo da empresa"/>`
    : `
      <div class="store">${escapeHtml(storeSettings?.store_name || 'PETSHOP')}</div>
      <div class="store-line">${escapeHtml(storeAddress(storeSettings) || 'Endereco nao configurado')}</div>
      <div class="store-line">${escapeHtml(storeSettings?.store_phone || '')}</div>
    `

  return `
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>${escapeHtml(title)}</title>
        <style>
          @page { margin: 0; }
          * { box-sizing: border-box; }
          html, body { width: 80mm; margin: 0; padding: 0; color: #000; background: #fff; }
          body { font-family: Arial, Helvetica, sans-serif; padding: 3mm 0 3mm 2mm; }
          .receipt { width: 64mm; max-width: 64mm; margin: 0; }
          .center { text-align: center; }
          .print-logo { display:block; width:auto; max-width:56mm; max-height:22mm; margin:0 auto 2.5mm; object-fit:contain; filter:grayscale(1) contrast(2); }
          .store { font-size: 14px; font-weight: 900; text-transform: uppercase; }
          .store-line { margin-top: 1px; font-size: 8px; line-height: 1.25; overflow-wrap: anywhere; }
          .title { margin: 3mm 0 2mm; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 1.6mm 0; font-size: 11px; font-weight: 900; }
          .details { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 1.5mm 0; }
          .line { display: grid; grid-template-columns: 18mm minmax(0, 1fr); gap: 1.5mm; padding: .7mm 0; font-size: 9px; line-height: 1.28; }
          .line strong { font-size: 8px; text-transform: uppercase; }
          .line span { min-width: 0; font-weight: 700; overflow-wrap: anywhere; }
          .appointment { padding: 1.8mm 0; border-bottom: 1px dashed #000; page-break-inside: avoid; }
          .appointment-title { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2mm; font-size: 10px; font-weight: 900; }
          .appointment-line { margin-top: .7mm; font-size: 8.5px; line-height: 1.3; overflow-wrap: anywhere; }
          .checklist { margin-top: 2.5mm; border: 1px solid #000; padding: 1.5mm; font-size: 8.5px; line-height: 1.65; }
          .total { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2mm; margin-top: 2.5mm; padding-top: 1.5mm; border-top: 2px solid #000; font-size: 12px; font-weight: 900; }
          .total span:last-child { white-space: nowrap; text-align: right; }
          .footer { margin-top: 3mm; font-size: 7.5px; line-height: 1.3; }
          @media print { body { position: absolute; inset: 0 auto auto 0; } }
        </style>
      </head>
      <body>
        <main class="receipt">
          <div class="center">
            ${header}
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

function sameTargets(current, next) {
  const currentKeys = Object.keys(current)
  const nextKeys = Object.keys(next)
  return currentKeys.length === nextKeys.length
    && nextKeys.every((key) => current[key] === next[key])
}

function findScrollableAncestor(element) {
  let current = element?.parentElement || null
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current)
    if (/(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight) return current
    current = current.parentElement
  }
  return document.scrollingElement || document.documentElement
}

function AgendaNativeEnhancements() {
  const { storeSettings } = useAuthCtx()
  const {
    appointments,
    load,
    update,
    updateStatus,
    serviceLabel,
    statusBadge,
  } = useAppointments()
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [headerTarget, setHeaderTarget] = useState(null)
  const [cardTargets, setCardTargets] = useState({})
  const [modalSummary, setModalSummary] = useState(null)
  const [busyId, setBusyId] = useState('')
  const [notice, setNotice] = useState('')
  const cardTargetsRef = useRef({})
  const dragRef = useRef(null)
  const autoScrollFrameRef = useRef(0)
  const transportOptions = useMemo(() => normalizeTransportOptions(storeSettings), [storeSettings])

  const operationalAppointments = useMemo(() => (
    (appointments || [])
      .filter((appointment) => !NON_OPERATIONAL_STATUSES.has(appointment.status))
      .filter((appointment) => localDateKey(appointment.scheduled_at) === selectedDate)
      .sort((left, right) => new Date(left.scheduled_at) - new Date(right.scheduled_at))
  ), [appointments, selectedDate])

  useEffect(() => {
    void load({ date: selectedDate })
  }, [load, selectedDate])

  const refreshAgendaPage = useCallback(() => {
    document.querySelector('.page button[title="Atualizar"]')?.click()
  }, [])

  const printAppointment = useCallback((appointment) => {
    const pet = appointment?.pets || {}
    const status = statusBadge(appointment.status).label
    const title = appointment.status === 'concluido' ? 'FICHA DE ATENDIMENTO' : 'FICHA DE AGENDAMENTO'
    const responsible = appointment.responsible_staff_name || appointment.responsible_staff_key || 'Nao informado'
    const date = new Date(appointment.scheduled_at || '')
    const dateText = Number.isNaN(date.getTime()) ? 'Nao informada' : date.toLocaleDateString('pt-BR')
    const prices = appointmentPriceBreakdown(appointment, transportOptions)
    const line = (label, value) => `<div class="line"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value || 'Nao informado')}</span></div>`
    const content = `
      <div class="details">
        ${line('Status', status)}
        ${line('Tutor', pet.owner_name)}
        ${line('Pet', pet.pet_name)}
        ${line('Raca/especie', pet.breed || pet.species)}
        ${line('Data e hora', `${dateText} - ${appointmentInterval(appointment)}`)}
        ${line('Servico', appointmentServiceText(appointment, serviceLabel))}
        ${line('Responsavel', responsible)}
        ${line('Observacoes', appointment.notes || 'Nenhuma observacao')}
      </div>
      <div class="checklist"><strong>CONTROLE:</strong><br/>[ ] Pet recebido &nbsp; [ ] Servico iniciado<br/>[ ] Servico concluido &nbsp; [ ] Tutor avisado</div>
      <div class="details" style="margin-top:2.5mm">
        ${line('Servico', fmtCurrency(prices.service))}
        ${line('Transporte', fmtCurrency(prices.transport))}
      </div>
      <div class="total"><span>TOTAL</span><span>${escapeHtml(fmtCurrency(prices.total))}</span></div>
    `
    const opened = writeAndPrint(receiptShell({ storeSettings, title, content }))
    setNotice(opened ? '' : 'O navegador bloqueou a janela de impressao. Libere pop-ups para o YuiSync.')
  }, [serviceLabel, statusBadge, storeSettings, transportOptions])

  const printDay = useCallback(() => {
    const rows = operationalAppointments.map((appointment, index) => {
      const pet = appointment?.pets || {}
      const status = statusBadge(appointment.status).label
      const responsible = appointment.responsible_staff_name || appointment.responsible_staff_key || 'Sem responsavel'
      const prices = appointmentPriceBreakdown(appointment, transportOptions)
      return `
        <section class="appointment">
          <div class="appointment-title"><span>${escapeHtml(`${index + 1}. ${appointmentInterval(appointment)}`)}</span><span>${escapeHtml(status)}</span></div>
          <div class="appointment-line"><strong>${escapeHtml(pet.pet_name || 'Pet')}</strong> - Tutor: ${escapeHtml(pet.owner_name || 'Cliente')}</div>
          <div class="appointment-line">Servico: ${escapeHtml(appointmentServiceText(appointment, serviceLabel))}</div>
          <div class="appointment-line">Responsavel: ${escapeHtml(responsible)}</div>
          <div class="appointment-line">Total: ${escapeHtml(fmtCurrency(prices.total))}</div>
          ${appointment.notes ? `<div class="appointment-line">Obs.: ${escapeHtml(appointment.notes)}</div>` : ''}
        </section>
      `
    }).join('')
    const date = new Date(`${selectedDate}T12:00:00`)
    const content = `
      <div class="details">
        <div class="line"><strong>Data</strong><span>${escapeHtml(date.toLocaleDateString('pt-BR'))}</span></div>
        <div class="line"><strong>Total</strong><span>${operationalAppointments.length} agendamento(s)</span></div>
      </div>
      ${rows || '<div class="appointment-line">Nenhum agendamento operacional nesta data.</div>'}
    `
    const opened = writeAndPrint(receiptShell({ storeSettings, title: 'AGENDA DO DIA', content }))
    setNotice(opened ? '' : 'O navegador bloqueou a janela de impressao. Libere pop-ups para o YuiSync.')
  }, [operationalAppointments, selectedDate, serviceLabel, statusBadge, storeSettings, transportOptions])

  const completeAppointment = useCallback(async (appointmentId) => {
    setBusyId(appointmentId)
    setNotice('')
    try {
      await updateStatus(appointmentId, 'concluido')
      await load({ date: selectedDate })
      refreshAgendaPage()
      setNotice('Agendamento concluido.')
    } catch (error) {
      setNotice(error?.message || 'Nao foi possivel concluir o agendamento.')
    } finally {
      setBusyId('')
    }
  }, [load, refreshAgendaPage, selectedDate, updateStatus])

  const moveAppointment = useCallback(async (appointmentId, timeText) => {
    const appointment = operationalAppointments.find((item) => String(item.id) === String(appointmentId))
    if (!appointment || appointment.status === 'concluido' || NON_OPERATIONAL_STATUSES.has(appointment.status)) return
    const match = String(timeText || '').match(/(\d{2}):(\d{2})/)
    if (!match) return

    const [year, month, day] = selectedDate.split('-').map(Number)
    const target = new Date(year, month - 1, day, Number(match[1]), Number(match[2]), 0, 0)
    const current = new Date(appointment.scheduled_at)
    if (!Number.isNaN(current.getTime()) && current.getTime() === target.getTime()) return

    setBusyId(appointmentId)
    setNotice('')
    try {
      await update(appointmentId, { scheduled_at: target.toISOString() })
      await load({ date: selectedDate })
      refreshAgendaPage()
      setNotice(`Agendamento movido para ${match[1]}:${match[2]}.`)
    } catch (error) {
      setNotice(error?.message || 'Horario indisponivel para este agendamento.')
    } finally {
      setBusyId('')
    }
  }, [load, operationalAppointments, refreshAgendaPage, selectedDate, update])

  useEffect(() => {
    const pageRoot = document.querySelector('.page')
    if (!pageRoot) return undefined
    let frame = 0

    const isDailyAgenda = () => {
      const button = [...pageRoot.querySelectorAll('button')]
        .find((item) => normalizeText(item.textContent) === 'diaria')
      return Boolean(button?.className?.includes('bg-amber'))
    }

    const syncDate = () => {
      const subtitle = pageRoot.querySelector('.page-sub')
      const parsed = parseAgendaDate(subtitle?.textContent || '')
      if (parsed) setSelectedDate((current) => current === isoDate(parsed) ? current : isoDate(parsed))
    }

    const clearDropHighlight = () => {
      pageRoot.querySelectorAll('[data-yuisync-drop-active]').forEach((slot) => {
        slot.removeAttribute('data-yuisync-drop-active')
      })
    }

    const slotAtPoint = (x, y, draggedCard = null) => {
      const previousPointerEvents = draggedCard?.style.pointerEvents || ''
      if (draggedCard) draggedCard.style.pointerEvents = 'none'
      let slot = document.elementFromPoint(x, y)?.closest?.('button[aria-label^="Agendar as "]') || null
      if (draggedCard) draggedCard.style.pointerEvents = previousPointerEvents || 'auto'
      if (slot) return slot

      const slots = [...pageRoot.querySelectorAll('button[aria-label^="Agendar as "]')]
      const exact = slots.find((candidate) => {
        const rect = candidate.getBoundingClientRect()
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
      })
      if (exact) return exact

      return slots
        .map((candidate) => ({ candidate, rect: candidate.getBoundingClientRect() }))
        .filter(({ rect }) => x >= rect.left && x <= rect.right && rect.bottom >= 0 && rect.top <= window.innerHeight)
        .sort((left, right) => (
          Math.abs((left.rect.top + left.rect.bottom) / 2 - y)
          - Math.abs((right.rect.top + right.rect.bottom) / 2 - y)
        ))[0]?.candidate || null
    }

    const setActiveSlot = (slot) => {
      clearDropHighlight()
      if (!slot || !isDailyAgenda()) return
      slot.dataset.yuisyncDropActive = 'true'
      if (dragRef.current) dragRef.current.slot = slot
    }

    const removeDragGhost = () => {
      dragRef.current?.ghost?.remove()
    }

    const stopAutoScroll = () => {
      if (autoScrollFrameRef.current) cancelAnimationFrame(autoScrollFrameRef.current)
      autoScrollFrameRef.current = 0
    }

    const resetDrag = () => {
      stopAutoScroll()
      removeDragGhost()
      const state = dragRef.current
      state?.card?.classList.remove('is-yuisync-dragging')
      dragRef.current = null
      clearDropHighlight()
    }

    const autoScrollTick = () => {
      const state = dragRef.current
      if (!state) {
        autoScrollFrameRef.current = 0
        return
      }

      const margin = 90
      const maxSpeed = 18
      const scrollParent = state.scrollParent
      let top = 0
      let bottom = window.innerHeight
      if (scrollParent && scrollParent !== document.scrollingElement && scrollParent !== document.documentElement) {
        const rect = scrollParent.getBoundingClientRect()
        top = rect.top
        bottom = rect.bottom
      }

      let delta = 0
      if (state.clientY < top + margin) delta = -Math.ceil(maxSpeed * (1 - Math.max(0, state.clientY - top) / margin))
      if (state.clientY > bottom - margin) delta = Math.ceil(maxSpeed * (1 - Math.max(0, bottom - state.clientY) / margin))

      if (delta !== 0) {
        if (scrollParent && scrollParent !== document.scrollingElement && scrollParent !== document.documentElement) {
          scrollParent.scrollTop += delta
        } else {
          window.scrollBy(0, delta)
        }
        setActiveSlot(slotAtPoint(state.clientX, state.clientY, state.card))
      }

      autoScrollFrameRef.current = requestAnimationFrame(autoScrollTick)
    }

    const syncModal = () => {
      const serviceInput = document.querySelector('input[aria-label="Buscar servico para adicionar"]')
      const modal = serviceInput?.closest('.modal-box')
      if (!modal) {
        setModalSummary((current) => current ? null : current)
        return
      }

      const transportSelect = modal.querySelector('select[aria-label="Transporte do pet"]')
      const totalLabel = [...modal.querySelectorAll('span')].find((element) => normalizeText(element.textContent) === 'valor total')
      const totalCard = totalLabel?.parentElement
      const totalValue = totalCard?.querySelector('strong')
      if (!totalCard || !totalValue) return

      let target = totalCard.querySelector('[data-yuisync-modal-total]')
      if (!target) {
        target = document.createElement('div')
        target.dataset.yuisyncModalTotal = 'true'
        target.className = 'w-full'
        ;[...totalCard.children].forEach((child) => {
          if (child === target) return
          child.dataset.yuisyncOriginalDisplay = child.style.display || ''
          child.style.display = 'none'
        })
        totalCard.appendChild(target)
      }

      const serviceTotal = moneyNumber(totalValue.textContent)
      const transportMode = transportSelect?.value || 'cliente_leva'
      setModalSummary((current) => (
        current?.target === target
        && current?.serviceTotal === serviceTotal
        && current?.transportMode === transportMode
          ? current
          : { target, serviceTotal, transportMode }
      ))

      const durations = normalizeServiceDurations(storeSettings?.petshop_service_durations)
      modal.querySelectorAll('[role="listbox"][aria-label="Servicos encontrados"] button').forEach((button) => {
        const spans = button.querySelectorAll('span')
        const label = spans.length >= 2 ? spans[spans.length - 2]?.textContent : ''
        const detail = spans.length ? spans[spans.length - 1] : null
        if (!label || !detail || !/\d+\s*min/i.test(detail.textContent || '')) return
        const duration = resolvePetshopServiceDuration({
          service: { label },
          durations,
          fallbackMin: Number((detail.textContent || '').match(/(\d+)\s*min/i)?.[1] || 60),
        })
        detail.textContent = String(detail.textContent).replace(/\d+\s*min/i, `${duration} min`)
      })
    }

    const syncTargets = () => {
      frame = 0
      syncDate()

      const pageHeader = pageRoot.querySelector('.page-header')
      let nextHeader = pageHeader?.querySelector('[data-yuisync-agenda-header-actions]') || null
      if (pageHeader && !nextHeader) {
        nextHeader = document.createElement('div')
        nextHeader.dataset.yuisyncAgendaHeaderActions = 'true'
        nextHeader.className = 'ml-auto flex items-center gap-2'
        pageHeader.appendChild(nextHeader)
      }
      setHeaderTarget((current) => current === nextHeader ? current : nextHeader)

      const daily = isDailyAgenda()
      const candidates = [...pageRoot.querySelectorAll('button.w-full.text-left')]
      const nextTargets = {}

      operationalAppointments.forEach((appointment) => {
        const interval = normalizeText(appointmentInterval(appointment))
        const petName = normalizeText(appointment?.pets?.pet_name || 'pet')
        const trigger = candidates.find((button) => {
          const text = normalizeText(button.textContent)
          return text.includes(interval) && text.includes(petName)
        })
        const card = trigger?.parentElement
        if (!card || !card.classList.contains('relative')) return

        const movable = daily && appointment.status !== 'concluido' && !NON_OPERATIONAL_STATUSES.has(appointment.status)
        card.dataset.yuisyncAppointmentId = String(appointment.id)
        card.dataset.yuisyncMovable = String(movable)
        card.draggable = movable
        card.style.pointerEvents = 'auto'
        card.title = movable ? 'Arraste o card para outra faixa de 10 minutos' : card.title
        trigger.draggable = movable
        trigger.style.paddingRight = '112px'

        const outer = card.parentElement
        if (outer?.classList.contains('absolute')) outer.style.pointerEvents = 'none'

        let target = card.querySelector('[data-yuisync-card-actions]')
        if (!target) {
          target = document.createElement('div')
          target.dataset.yuisyncCardActions = 'true'
          target.className = 'yuisync-agenda-card-actions'
          card.appendChild(target)
        }
        nextTargets[String(appointment.id)] = target

        card.querySelectorAll('button').forEach((button) => {
          if (button.closest('[data-yuisync-card-actions]')) return
          const label = normalizeText(`${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`)
          if (!label.includes('imprimir')) return
          button.dataset.yuisyncHiddenLegacyPrint = 'true'
          button.style.setProperty('display', 'none', 'important')
        })

        const prices = appointmentPriceBreakdown(appointment, transportOptions)
        const priceSpan = [...trigger.querySelectorAll('span')]
          .find((element) => /^r\$\s*/i.test(String(element.textContent || '').trim()))
        if (priceSpan) {
          priceSpan.textContent = fmtCurrency(prices.total)
          priceSpan.dataset.yuisyncAppointmentTotal = 'true'
        }
      })

      pageRoot.querySelectorAll('[data-yuisync-card-actions]').forEach((target) => {
        const card = target.parentElement
        const id = card?.dataset?.yuisyncAppointmentId
        if (!id || !nextTargets[id]) target.remove()
      })

      if (!sameTargets(cardTargetsRef.current, nextTargets)) {
        cardTargetsRef.current = nextTargets
        setCardTargets(nextTargets)
      }
      syncModal()
    }

    const scheduleSync = () => {
      if (frame) return
      frame = requestAnimationFrame(syncTargets)
    }

    const onClick = (event) => {
      const option = event.target.closest?.('[role="listbox"][aria-label="Servicos encontrados"] button')
      if (option) {
        window.setTimeout(() => {
          const input = document.querySelector('input[aria-label="Buscar servico para adicionar"]')
          input?.blur()
          document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          scheduleSync()
        }, 0)
      } else {
        window.setTimeout(scheduleSync, 0)
      }
    }

    const onChange = (event) => {
      if (event.target?.matches?.('select[aria-label="Transporte do pet"]')) scheduleSync()
    }

    const onDragStart = (event) => {
      const card = event.target.closest?.('[data-yuisync-appointment-id]')
      if (!card || card.dataset.yuisyncMovable !== 'true' || event.target.closest?.('[data-yuisync-card-actions]')) {
        event.preventDefault()
        return
      }

      const rect = card.getBoundingClientRect()
      const ghost = card.cloneNode(true)
      ghost.removeAttribute('draggable')
      ghost.querySelectorAll('[data-yuisync-card-actions]').forEach((node) => node.remove())
      ghost.classList.add('yuisync-agenda-drag-ghost')
      ghost.style.width = `${rect.width}px`
      ghost.style.left = `${event.clientX - Math.min(44, rect.width / 3)}px`
      ghost.style.top = `${event.clientY - 24}px`
      document.body.appendChild(ghost)

      const transparent = document.createElement('canvas')
      transparent.width = 1
      transparent.height = 1
      event.dataTransfer?.setDragImage(transparent, 0, 0)
      event.dataTransfer?.setData('text/plain', card.dataset.yuisyncAppointmentId || '')
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'

      card.classList.add('is-yuisync-dragging')
      dragRef.current = {
        id: card.dataset.yuisyncAppointmentId,
        card,
        ghost,
        slot: null,
        clientX: event.clientX,
        clientY: event.clientY,
        scrollParent: findScrollableAncestor(card),
      }
      stopAutoScroll()
      autoScrollFrameRef.current = requestAnimationFrame(autoScrollTick)
    }

    const onDragOver = (event) => {
      const state = dragRef.current
      if (!state) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
      state.clientX = event.clientX
      state.clientY = event.clientY
      state.ghost.style.left = `${event.clientX - 44}px`
      state.ghost.style.top = `${event.clientY - 24}px`
      setActiveSlot(slotAtPoint(event.clientX, event.clientY, state.card))
    }

    const onDrop = (event) => {
      const state = dragRef.current
      if (!state) return
      event.preventDefault()
      const slot = state.slot || slotAtPoint(event.clientX, event.clientY, state.card)
      const time = slot?.getAttribute('aria-label')?.match(/(\d{2}:\d{2})/)?.[1]
      const id = state.id
      resetDrag()
      if (id && time) void moveAppointment(id, time)
    }

    const onDragEnd = () => resetDrag()

    syncTargets()
    const observer = new MutationObserver(scheduleSync)
    observer.observe(pageRoot, { childList: true, subtree: true })
    pageRoot.addEventListener('click', onClick)
    document.addEventListener('change', onChange)
    pageRoot.addEventListener('dragstart', onDragStart)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('drop', onDrop)
    document.addEventListener('dragend', onDragEnd)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      observer.disconnect()
      pageRoot.removeEventListener('click', onClick)
      document.removeEventListener('change', onChange)
      pageRoot.removeEventListener('dragstart', onDragStart)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('drop', onDrop)
      document.removeEventListener('dragend', onDragEnd)
      resetDrag()
      cardTargetsRef.current = {}
      pageRoot.querySelectorAll('[data-yuisync-card-actions]').forEach((target) => target.remove())
      pageRoot.querySelectorAll('[data-yuisync-hidden-legacy-print]').forEach((button) => {
        button.style.removeProperty('display')
        button.removeAttribute('data-yuisync-hidden-legacy-print')
      })
      pageRoot.querySelector('[data-yuisync-agenda-header-actions]')?.remove()
      document.querySelectorAll('[data-yuisync-modal-total]').forEach((target) => {
        const parent = target.parentElement
        target.remove()
        parent?.querySelectorAll('[data-yuisync-original-display]').forEach((child) => {
          child.style.display = child.dataset.yuisyncOriginalDisplay || ''
          child.removeAttribute('data-yuisync-original-display')
        })
      })
    }
  }, [moveAppointment, operationalAppointments, storeSettings?.petshop_service_durations, transportOptions])

  const modalTransportFee = modalSummary
    ? transportFeeForMode(transportOptions, modalSummary.transportMode)
    : 0
  const modalTotal = (modalSummary?.serviceTotal || 0) + modalTransportFee

  return (
    <>
      {headerTarget && createPortal(
        <button
          type="button"
          onClick={printDay}
          disabled={operationalAppointments.length === 0}
          className="btn btn-secondary gap-2"
          title="Imprimir os agendamentos operacionais desta data"
        >
          <Printer size={15}/>
          Imprimir dia
        </button>,
        headerTarget,
      )}

      {modalSummary?.target && createPortal(
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between gap-3 text-muted">
            <span>Servico</span>
            <strong className="text-text">{fmtCurrency(modalSummary.serviceTotal)}</strong>
          </div>
          <div className="flex items-center justify-between gap-3 text-muted">
            <span>Transporte</span>
            <strong className="text-text">{fmtCurrency(modalTransportFee)}</strong>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-emerald-500/25 pt-2">
            <span className="font-black uppercase tracking-wider text-emerald-300">Total</span>
            <strong className="text-xl text-emerald-400">{fmtCurrency(modalTotal)}</strong>
          </div>
        </div>,
        modalSummary.target,
      )}

      {Object.entries(cardTargets).map(([appointmentId, target]) => {
        const appointment = operationalAppointments.find((item) => String(item.id) === appointmentId)
        if (!appointment || !target) return null
        const canComplete = appointment.status !== 'concluido'
        const busy = busyId === appointmentId
        return createPortal(
          <>
            {appointment.status !== 'concluido' && (
              <span className="yuisync-agenda-drag-handle" title="Arraste para mudar o horario" aria-hidden="true">
                <GripVertical size={13}/>
              </span>
            )}
            <button
              type="button"
              data-yuisync-action="print"
              aria-label="Imprimir agendamento"
              title="Imprimir agendamento"
              onClick={(event) => {
                event.stopPropagation()
                printAppointment(appointment)
              }}
              className="yuisync-agenda-action-button"
            >
              <Printer size={12}/>
            </button>
            {canComplete && (
              <button
                type="button"
                data-yuisync-action="complete"
                aria-label="Concluir agendamento"
                title="Concluir agendamento"
                disabled={busy}
                onClick={(event) => {
                  event.stopPropagation()
                  void completeAppointment(appointmentId)
                }}
                className="yuisync-agenda-action-button is-complete"
              >
                <Check size={12}/>
              </button>
            )}
          </>,
          target,
        )
      })}

      {notice && createPortal(
        <button
          type="button"
          onClick={() => setNotice('')}
          className="fixed right-5 top-5 z-[100] max-w-sm rounded-xl border border-amber-300/25 bg-surface px-4 py-3 text-left text-sm font-semibold text-text shadow-2xl"
          title="Fechar aviso"
        >
          {notice}
        </button>,
        document.body,
      )}
    </>
  )
}

export default function AgendaIntegratedPage() {
  return (
    <>
      <AgendaPage />
      <AgendaNativeEnhancements />
    </>
  )
}
