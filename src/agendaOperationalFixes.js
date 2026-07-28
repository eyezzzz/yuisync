const APPOINTMENT_CARD_SELECTOR = '[data-yuisync-appointment-id]'
const STYLE_ID = 'yuisync-agenda-operational-style'
let nativeDragCard = null
let nativeDragPrimed = false
let lastPointerStart = null

function normalize(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function ensureOperationalStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .yuisync-agenda-solid-card {
      --card: #065f46;
      --surface: #064e3b;
      --text: #ffffff;
      --muted: #d1fae5;
      opacity: 1 !important;
      background: #065f46 !important;
      background-color: #065f46 !important;
      border-color: #34d399 !important;
      color: #ffffff !important;
      box-shadow: 0 10px 26px rgba(6, 78, 59, .34) !important;
    }
    .yuisync-agenda-solid-card .text-text,
    .yuisync-agenda-solid-card p,
    .yuisync-agenda-solid-card span:not(.badge) {
      color: #ffffff !important;
    }
    .yuisync-agenda-solid-card .text-muted {
      color: #d1fae5 !important;
    }
    .yuisync-agenda-solid-card[data-yuisync-movable="true"] {
      cursor: grab !important;
    }
    .yuisync-agenda-solid-card[data-yuisync-dragging="true"] {
      cursor: grabbing !important;
      opacity: 1 !important;
      filter: brightness(1.06);
    }
  `
  document.head.appendChild(style)
}

function cardCanMove(card) {
  const text = normalize(card?.textContent)
  return !['concluido', 'cancelado', 'no-show', 'no_show'].some((status) => text.includes(status))
}

function printButtonsInside(card) {
  return [...card.querySelectorAll('button')].filter((button) => {
    const description = normalize(`${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`)
    return button.dataset.yuisyncAction === 'print' || description.includes('imprimir')
  })
}

function keepSinglePrintButton(card) {
  const buttons = printButtonsInside(card)
  if (buttons.length === 0) return

  const keep = buttons.find((button) => button.dataset.yuisyncAction === 'print') || buttons[0]
  buttons.forEach((button) => {
    if (button === keep) {
      button.removeAttribute('data-yuisync-duplicate-print')
      button.style.removeProperty('display')
      return
    }
    button.dataset.yuisyncDuplicatePrint = 'true'
    button.style.setProperty('display', 'none', 'important')
  })
}

function syncAgendaOperationalFixes() {
  ensureOperationalStyle()

  document.querySelectorAll(APPOINTMENT_CARD_SELECTOR).forEach((card) => {
    const positioningWrapper = card.parentElement
    if (positioningWrapper) positioningWrapper.style.pointerEvents = 'none'

    card.classList.add('yuisync-agenda-solid-card')
    card.style.pointerEvents = 'auto'

    const movable = card.dataset.yuisyncMovable === 'true' || cardCanMove(card)
    card.dataset.yuisyncMovable = String(movable)
    card.draggable = movable

    const contentButton = card.querySelector('button.w-full.text-left')
    if (contentButton) {
      contentButton.draggable = movable
      contentButton.style.cursor = movable ? 'grab' : ''
      contentButton.style.userSelect = movable ? 'none' : ''
      contentButton.style.webkitUserSelect = movable ? 'none' : ''
    }

    keepSinglePrintButton(card)
  })
}

function dispatchPointer(type, target, coordinates) {
  const EventConstructor = window.PointerEvent || window.MouseEvent
  const event = new EventConstructor(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    clientX: coordinates.clientX,
    clientY: coordinates.clientY,
  })
  target.dispatchEvent(event)
}

function slotForVerticalPoint(card, clientY) {
  const timeline = card?.parentElement?.parentElement
  if (!timeline) return null
  const slots = [...timeline.querySelectorAll('button[aria-label^="Agendar as "]')]
  if (slots.length === 0) return null

  const direct = slots.find((slot) => {
    const rect = slot.getBoundingClientRect()
    return clientY >= rect.top && clientY < rect.bottom
  })
  if (direct) return direct

  return slots.reduce((nearest, slot) => {
    const rect = slot.getBoundingClientRect()
    const distance = Math.abs(clientY - (rect.top + rect.height / 2))
    return !nearest || distance < nearest.distance ? { slot, distance } : nearest
  }, null)?.slot || null
}

function coordinatesInsideSlot(slot, fallback) {
  if (!slot) return fallback
  const rect = slot.getBoundingClientRect()
  return {
    clientX: Math.max(rect.left + 12, Math.min(rect.right - 12, fallback.clientX || rect.left + rect.width / 2)),
    clientY: rect.top + rect.height / 2,
  }
}

function primeIntegratedDrag(sourceEvent) {
  if (!nativeDragCard || nativeDragPrimed) return
  const fallback = lastPointerStart || {
    clientX: sourceEvent.clientX,
    clientY: sourceEvent.clientY,
  }
  dispatchPointer('pointerdown', nativeDragCard, fallback)
  nativeDragPrimed = true
}

function installNativeDragFallback() {
  document.addEventListener('pointerdown', (event) => {
    const card = event.target.closest?.(APPOINTMENT_CARD_SELECTOR)
    if (!card || card.dataset.yuisyncMovable !== 'true') return
    if (event.target.closest?.('[data-yuisync-card-actions]')) return
    lastPointerStart = {
      card,
      clientX: event.clientX,
      clientY: event.clientY,
    }
  }, true)

  document.addEventListener('pointercancel', (event) => {
    if (!nativeDragCard) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }, true)

  document.addEventListener('dragstart', (event) => {
    const card = event.target.closest?.(APPOINTMENT_CARD_SELECTOR)
    if (!card || card.dataset.yuisyncMovable !== 'true') return
    nativeDragCard = card
    nativeDragPrimed = false
    card.dataset.yuisyncDragging = 'true'
    event.dataTransfer?.setData('text/yuisync-appointment', card.dataset.yuisyncAppointmentId || '')
    event.dataTransfer?.setData('text/plain', card.dataset.yuisyncAppointmentId || '')
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  })

  document.addEventListener('dragover', (event) => {
    if (!nativeDragCard) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    primeIntegratedDrag(event)
    const slot = slotForVerticalPoint(nativeDragCard, event.clientY)
    dispatchPointer('pointermove', document, coordinatesInsideSlot(slot, event))
  })

  document.addEventListener('drop', (event) => {
    if (!nativeDragCard) return
    event.preventDefault()
    primeIntegratedDrag(event)
    const slot = slotForVerticalPoint(nativeDragCard, event.clientY)
    const coordinates = coordinatesInsideSlot(slot, event)
    dispatchPointer('pointermove', document, coordinates)
    dispatchPointer('pointerup', document, coordinates)
    nativeDragCard.removeAttribute('data-yuisync-dragging')
    nativeDragCard = null
    nativeDragPrimed = false
    lastPointerStart = null
  })

  document.addEventListener('dragend', (event) => {
    if (!nativeDragCard) return
    dispatchPointer('pointercancel', document, event)
    nativeDragCard.removeAttribute('data-yuisync-dragging')
    nativeDragCard = null
    nativeDragPrimed = false
    lastPointerStart = null
  })
}

let scheduled = false
function scheduleAgendaOperationalFixes() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    syncAgendaOperationalFixes()
  })
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleAgendaOperationalFixes, { once: true })
  } else {
    scheduleAgendaOperationalFixes()
  }

  installNativeDragFallback()

  const observer = new MutationObserver(scheduleAgendaOperationalFixes)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
}

export { syncAgendaOperationalFixes }
