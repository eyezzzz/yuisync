import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AgendaPage from './AgendaPage'
import { useAppointments } from '../../../shared/hooks/useAppointments'
import { useAuthCtx } from '../../../context/AuthContext'
import { fmtCurrency, todayISO } from '../../../lib/supabase'
import { printThermalReceipt } from '../../../lib/thermalPrint'
import {
  normalizeServiceDurations,
  resolvePetshopServiceDuration,
} from '../../../../shared/petshopOperations'
import {
  appointmentInterval,
  appointmentPriceBreakdown,
  chooseAgendaSlot,
  findAgendaCardCandidate,
  isoDate,
  localDateKey,
  moneyNumber,
  normalizeText,
  normalizeTransportOptions,
  parseAgendaDate,
  slotTimeFromAria,
  transportFeeForMode,
} from './agendaOperationalCore'
import { appointmentCheckoutTotals, queueAppointmentCheckout } from './appointmentCheckoutFlow'
import './AgendaResolvedPage.css'

const NON_OPERATIONAL_STATUSES = new Set(['cancelado', 'no_show'])

const ICONS = {
  drag: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>',
  print: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
}

const escapeHtml = (value = '') => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

function appointmentServiceText(appointment, serviceLabel) {
  const items = Array.isArray(appointment?.service_items) ? appointment.service_items : []
  const names = items
    .map((item) => item?.name || item?.label || item?.service_name || serviceLabel(item?.code || item?.service_type))
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  return names.length > 0 ? names.join(', ') : (serviceLabel(appointment?.service_type) || 'Servico nao informado')
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

function findScrollableAncestor(element) {
  let current = element?.parentElement || null
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current)
    if (/(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight) return current
    current = current.parentElement
  }
  return document.scrollingElement || document.documentElement
}

function ResolvedAgendaOperations({ setPage }) {
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
  const [notice, setNotice] = useState('')
  const dragRef = useRef(null)
  const lastDragAtRef = useRef(0)
  const autoScrollFrameRef = useRef(0)
  const transportOptions = useMemo(() => normalizeTransportOptions(storeSettings), [storeSettings])

  const operationalAppointments = useMemo(() => (
    (appointments || [])
      .filter((appointment) => !NON_OPERATIONAL_STATUSES.has(appointment.status))
      .filter((appointment) => localDateKey(appointment.scheduled_at) === selectedDate)
      .sort((left, right) => {
        const leftFinished = left.status === 'concluido' ? 1 : 0
        const rightFinished = right.status === 'concluido' ? 1 : 0
        return (leftFinished - rightFinished) || (new Date(left.scheduled_at) - new Date(right.scheduled_at))
      })
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
      const prices = appointmentPriceBreakdown(appointment, transportOptions)
      return `
        <section class="appointment">
          <div class="appointment-title"><span>${escapeHtml(`${index + 1}. ${appointmentInterval(appointment)}`)}</span><span>${escapeHtml(status)}</span></div>
          <div class="appointment-line"><strong>${escapeHtml(pet.pet_name || 'Pet')}</strong> - Tutor: ${escapeHtml(pet.owner_name || 'Cliente')}</div>
          <div class="appointment-line">Servico: ${escapeHtml(appointmentServiceText(appointment, serviceLabel))}</div>
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
  }, [load, printAppointment, refreshAgendaPage, selectedDate, setPage, transportOptions, updateStatus])

  const moveAppointment = useCallback(async (appointmentId, timeText) => {
    const appointment = operationalAppointments.find((item) => String(item.id) === String(appointmentId))
    if (!appointment || appointment.status === 'concluido' || NON_OPERATIONAL_STATUSES.has(appointment.status)) return
    const match = String(timeText || '').match(/(\d{2}):(\d{2})/)
    if (!match) return

    const [year, month, day] = selectedDate.split('-').map(Number)
    const target = new Date(year, month - 1, day, Number(match[1]), Number(match[2]), 0, 0)
    const current = new Date(appointment.scheduled_at)
    if (!Number.isNaN(current.getTime()) && current.getTime() === target.getTime()) return

    setNotice('')
    try {
      await update(appointmentId, { scheduled_at: target.toISOString() })
      await load({ date: selectedDate })
      refreshAgendaPage()
      setNotice(`Agendamento movido para ${match[1]}:${match[2]}.`)
    } catch (error) {
      setNotice(error?.message || 'Horario indisponivel para este agendamento.')
    }
  }, [load, operationalAppointments, refreshAgendaPage, selectedDate, update])

  useEffect(() => {
    const pageRoot = document.querySelector('.page')
    if (!pageRoot) return undefined
    let syncFrame = 0

    const syncDate = () => {
      const parsed = parseAgendaDate(pageRoot.querySelector('.page-sub')?.textContent || '')
      if (parsed) setSelectedDate((current) => current === isoDate(parsed) ? current : isoDate(parsed))
    }

    const isDailyAgenda = () => {
      const button = [...pageRoot.querySelectorAll('button')]
        .find((item) => normalizeText(item.textContent) === 'diaria')
      return Boolean(button?.className?.includes('bg-amber'))
    }

    const slots = () => pageRoot.querySelectorAll('button[aria-label^="Agendar as "]')

    const clearDropHighlight = () => {
      pageRoot.querySelectorAll('[data-yuisync-drop-active]').forEach((slot) => {
        slot.removeAttribute('data-yuisync-drop-active')
      })
    }

    const setActiveSlot = (slot) => {
      clearDropHighlight()
      if (!slot || !isDailyAgenda()) return
      slot.dataset.yuisyncDropActive = 'true'
      if (dragRef.current) dragRef.current.slot = slot
    }

    const stopAutoScroll = () => {
      if (autoScrollFrameRef.current) cancelAnimationFrame(autoScrollFrameRef.current)
      autoScrollFrameRef.current = 0
    }

    const resetDrag = () => {
      stopAutoScroll()
      dragRef.current?.ghost?.remove()
      dragRef.current?.card?.classList.remove('is-yuisync-pointer-dragging')
      dragRef.current = null
      document.body.style.userSelect = ''
      clearDropHighlight()
    }

    const autoScrollTick = () => {
      const state = dragRef.current
      if (!state?.active) {
        autoScrollFrameRef.current = 0
        return
      }

      const margin = 86
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
        setActiveSlot(chooseAgendaSlot(slots(), state.clientX, state.clientY))
      }

      autoScrollFrameRef.current = requestAnimationFrame(autoScrollTick)
    }

    const syncModal = () => {
      const serviceInput = document.querySelector('input[aria-label="Buscar servico para adicionar"]')
      const modal = serviceInput?.closest('.modal-box')
      if (!modal) return

      const transportSelect = modal.querySelector('select[aria-label="Transporte do pet"]')
      const totalLabel = [...modal.querySelectorAll('span')].find((element) => normalizeText(element.textContent) === 'valor total')
      const totalCard = totalLabel?.parentElement
      const totalValue = totalCard?.querySelector('strong')
      if (totalCard && totalValue) {
        let target = totalCard.querySelector('[data-yuisync-modal-total]')
        if (!target) {
          target = document.createElement('div')
          target.dataset.yuisyncModalTotal = 'true'
          target.className = 'w-full'
          ;[...totalCard.children].forEach((child) => {
            if (child !== target) child.style.display = 'none'
          })
          totalCard.appendChild(target)
        }
        const serviceTotal = moneyNumber(totalValue.textContent)
        const transportFee = transportFeeForMode(transportOptions, transportSelect?.value || 'cliente_leva')
        target.innerHTML = `
          <div class="space-y-1 text-sm">
            <div class="flex items-center justify-between gap-3 text-muted"><span>Servico</span><strong class="text-text">${fmtCurrency(serviceTotal)}</strong></div>
            <div class="flex items-center justify-between gap-3 text-muted"><span>Transporte</span><strong class="text-text">${fmtCurrency(transportFee)}</strong></div>
            <div class="mt-2 flex items-center justify-between gap-3 border-t border-emerald-500/25 pt-2"><span class="font-black uppercase tracking-wider text-emerald-500">Total</span><strong class="text-xl text-emerald-500">${fmtCurrency(serviceTotal + transportFee)}</strong></div>
          </div>
        `
      }

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

    const compactCard = (card, trigger) => {
      const transportBlock = [...trigger.querySelectorAll('div')].find((element) => {
        const firstLine = element.querySelector(':scope > p:first-child')
        const text = normalizeText(firstLine?.textContent)
        return text.includes('motodog') || text.includes('cliente traz e busca')
      })
      if (transportBlock) {
        ;[...transportBlock.children].slice(1).forEach((detail) => detail.classList.add('yuisync-resolved-detail-hidden'))
        transportBlock.style.marginTop = '3px'
      }

      const responsible = [...trigger.querySelectorAll('p')]
        .find((element) => normalizeText(element.textContent).startsWith('resp.:'))
      if (responsible) responsible.style.marginTop = '2px'

      card.querySelectorAll('button').forEach((button) => {
        if (button.closest('[data-yuisync-resolved-actions]')) return
        const label = normalizeText(`${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`)
        if (label.includes('imprimir')) button.classList.add('yuisync-resolved-native-print-hidden')
      })
    }

    const actionMarkup = (movable, canComplete) => `
      ${movable ? `<button type="button" data-yuisync-action="drag" class="yuisync-resolved-action yuisync-resolved-drag-handle" aria-label="Mover agendamento" title="Segure e arraste para mudar o horario">${ICONS.drag}</button>` : ''}
      <button type="button" data-yuisync-action="print" class="yuisync-resolved-action" aria-label="Imprimir agendamento" title="Imprimir agendamento">${ICONS.print}</button>
      ${canComplete ? `<button type="button" data-yuisync-action="complete" class="yuisync-resolved-action is-complete" aria-label="Concluir agendamento" title="Concluir agendamento">${ICONS.check}</button>` : ''}
    `

    const cleanupCards = () => {
      pageRoot.querySelectorAll('[data-yuisync-resolved-actions]').forEach((node) => node.remove())
      pageRoot.querySelectorAll('.yuisync-resolved-card').forEach((card) => {
        card.classList.remove('yuisync-resolved-card', 'is-movable')
        card.removeAttribute('data-yuisync-appointment-id')
        card.removeAttribute('data-yuisync-movable')
      })
    }

    const syncCards = () => {
      syncFrame = 0
      syncDate()
      const daily = isDailyAgenda()
      if (!daily) {
        cleanupCards()
        syncModal()
        return
      }

      const candidates = [...pageRoot.querySelectorAll('button.w-full.text-left')]
      const usedCards = new Set()

      operationalAppointments.forEach((appointment) => {
        const statusLabel = statusBadge(appointment.status).label
        const trigger = findAgendaCardCandidate(candidates, {
          interval: appointmentInterval(appointment),
          petName: appointment?.pets?.pet_name || 'pet',
          statusLabel,
        }, usedCards)
        if (!trigger) return

        const card = trigger.parentElement
        if (!card || !card.classList.contains('relative')) return
        usedCards.add(trigger)

        const movable = appointment.status !== 'concluido' && !NON_OPERATIONAL_STATUSES.has(appointment.status)
        const canComplete = appointment.status !== 'concluido'
        card.dataset.yuisyncAppointmentId = String(appointment.id)
        card.dataset.yuisyncMovable = String(movable)
        card.classList.add('yuisync-resolved-card')
        card.classList.toggle('is-movable', movable)
        card.title = movable ? 'Arraste o card ou use a alca para mudar o horario' : card.title

        const outer = card.parentElement
        if (outer?.classList.contains('absolute')) outer.classList.add('yuisync-resolved-outer')

        compactCard(card, trigger)
        const prices = appointmentPriceBreakdown(appointment, transportOptions)
        const priceSpan = [...trigger.querySelectorAll('span')]
          .find((element) => /^r\$\s*/i.test(String(element.textContent || '').trim()))
        if (priceSpan) priceSpan.textContent = fmtCurrency(prices.total)

        let actions = card.querySelector('[data-yuisync-resolved-actions]')
        if (!actions) {
          actions = document.createElement('div')
          actions.dataset.yuisyncResolvedActions = 'true'
          actions.className = 'yuisync-resolved-actions'
          card.appendChild(actions)
        }
        const signature = `${appointment.id}:${movable}:${canComplete}`
        if (actions.dataset.yuisyncSignature !== signature) {
          actions.dataset.yuisyncSignature = signature
          actions.innerHTML = actionMarkup(movable, canComplete)
        }
      })

      const header = pageRoot.querySelector('.page-header')
      if (header && !header.querySelector('[data-yuisync-print-day]')) {
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.yuisyncPrintDay = 'true'
        button.className = 'btn btn-secondary gap-2'
        button.title = 'Imprimir os agendamentos desta data'
        button.innerHTML = `${ICONS.print}<span>Imprimir dia</span>`
        header.appendChild(button)
      }
      syncModal()
    }

    const scheduleSync = () => {
      if (syncFrame) return
      syncFrame = requestAnimationFrame(syncCards)
    }

    const onPointerDown = (event) => {
      if (event.button !== 0) return
      const card = event.target.closest?.('[data-yuisync-appointment-id]')
      if (!card || card.dataset.yuisyncMovable !== 'true') return
      const action = event.target.closest?.('[data-yuisync-action]')
      if (action && action.dataset.yuisyncAction !== 'drag') return

      dragRef.current = {
        id: card.dataset.yuisyncAppointmentId,
        card,
        startX: event.clientX,
        startY: event.clientY,
        clientX: event.clientX,
        clientY: event.clientY,
        active: false,
        slot: null,
        ghost: null,
        scrollParent: findScrollableAncestor(card),
      }
    }

    const onPointerMove = (event) => {
      const state = dragRef.current
      if (!state) return
      state.clientX = event.clientX
      state.clientY = event.clientY
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY)
      if (!state.active && distance < 7) return

      if (!state.active) {
        state.active = true
        state.card.classList.add('is-yuisync-pointer-dragging')
        const rect = state.card.getBoundingClientRect()
        const ghost = state.card.cloneNode(true)
        ghost.querySelectorAll('[data-yuisync-resolved-actions]').forEach((node) => node.remove())
        ghost.classList.add('yuisync-resolved-drag-ghost')
        ghost.style.width = `${rect.width}px`
        ghost.style.height = `${Math.min(rect.height, 180)}px`
        document.body.appendChild(ghost)
        state.ghost = ghost
        document.body.style.userSelect = 'none'
        autoScrollFrameRef.current = requestAnimationFrame(autoScrollTick)
      }

      event.preventDefault()
      state.ghost.style.left = `${event.clientX - Math.min(48, state.ghost.offsetWidth / 3)}px`
      state.ghost.style.top = `${event.clientY - 25}px`
      setActiveSlot(chooseAgendaSlot(slots(), event.clientX, event.clientY))
    }

    const onPointerUp = (event) => {
      const state = dragRef.current
      if (!state) return
      if (!state.active) {
        resetDrag()
        return
      }

      event.preventDefault()
      const slot = state.slot || chooseAgendaSlot(slots(), event.clientX, event.clientY)
      const time = slotTimeFromAria(slot)
      const id = state.id
      lastDragAtRef.current = Date.now()
      resetDrag()
      if (id && time) void moveAppointment(id, time)
    }

    const onClickCapture = (event) => {
      if (Date.now() - lastDragAtRef.current > 500) return
      if (!event.target.closest?.('[data-yuisync-appointment-id]')) return
      event.preventDefault()
      event.stopPropagation()
    }

    const onClick = (event) => {
      const action = event.target.closest?.('[data-yuisync-action]')
      if (action) {
        event.preventDefault()
        event.stopPropagation()
        const card = action.closest('[data-yuisync-appointment-id]')
        const appointment = operationalAppointments.find((item) => String(item.id) === String(card?.dataset?.yuisyncAppointmentId))
        if (!appointment) return
        if (action.dataset.yuisyncAction === 'print') printAppointment(appointment)
        if (action.dataset.yuisyncAction === 'complete') void completeAppointment(appointment.id)
        return
      }

      if (event.target.closest?.('[data-yuisync-print-day]')) {
        event.preventDefault()
        printDay()
        return
      }

      const serviceOption = event.target.closest?.('[role="listbox"][aria-label="Servicos encontrados"] button')
      if (serviceOption) {
        window.setTimeout(() => {
          const input = document.querySelector('input[aria-label="Buscar servico para adicionar"]')
          input?.blur()
          document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          syncModal()
        }, 30)
      } else {
        window.setTimeout(syncModal, 0)
      }
    }

    const onChange = (event) => {
      if (event.target?.matches?.('select[aria-label="Transporte do pet"]')) syncModal()
    }

    syncCards()
    const observer = new MutationObserver(scheduleSync)
    observer.observe(pageRoot, { childList: true, subtree: true })
    pageRoot.addEventListener('pointerdown', onPointerDown)
    pageRoot.addEventListener('click', onClickCapture, true)
    pageRoot.addEventListener('click', onClick)
    document.addEventListener('pointermove', onPointerMove, { passive: false })
    document.addEventListener('pointerup', onPointerUp, { passive: false })
    document.addEventListener('pointercancel', resetDrag)
    document.addEventListener('change', onChange)

    return () => {
      if (syncFrame) cancelAnimationFrame(syncFrame)
      observer.disconnect()
      pageRoot.removeEventListener('pointerdown', onPointerDown)
      pageRoot.removeEventListener('click', onClickCapture, true)
      pageRoot.removeEventListener('click', onClick)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', resetDrag)
      document.removeEventListener('change', onChange)
      resetDrag()
      pageRoot.querySelectorAll('[data-yuisync-resolved-actions], [data-yuisync-print-day]').forEach((node) => node.remove())
    }
  }, [completeAppointment, moveAppointment, operationalAppointments, printAppointment, printDay, statusBadge, storeSettings?.petshop_service_durations, transportOptions])

  return notice ? (
    <button
      type="button"
      onClick={() => setNotice('')}
      className="fixed right-5 top-5 z-[100] max-w-sm rounded-xl border border-amber-300/25 bg-surface px-4 py-3 text-left text-sm font-semibold text-text shadow-2xl"
      title="Fechar aviso"
    >
      {notice}
    </button>
  ) : null
}

export default function AgendaResolvedPage({ setPage }) {
  return (
    <>
      <AgendaPage setPage={setPage} />
      <ResolvedAgendaOperations setPage={setPage} />
    </>
  )
}
