const APPOINTMENT_CARD_SELECTOR = '[data-yuisync-appointment-id]'
let nativeDragCard = null

function normalize(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function syncAgendaOperationalFixes() {
  document.querySelectorAll(APPOINTMENT_CARD_SELECTOR).forEach((card) => {
    const positioningWrapper = card.parentElement
    if (positioningWrapper && positioningWrapper.style.pointerEvents !== 'none') {
      positioningWrapper.style.pointerEvents = 'none'
    }

    card.style.pointerEvents = 'auto'
    card.style.opacity = '1'
    card.style.backgroundColor = 'var(--card)'
    card.style.boxShadow = '0 8px 22px rgba(0, 0, 0, .28)'

    const movable = card.dataset.yuisyncMovable === 'true'
    card.draggable = movable
    if (movable) {
      card.style.cursor = 'grab'
      card.style.userSelect = 'none'
      card.style.webkitUserSelect = 'none'
    }

    card.querySelectorAll('button').forEach((button) => {
      if (button.dataset.yuisyncAction === 'print') return
      const description = normalize(`${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`)
      if (!description.includes('imprimir')) return
      button.dataset.yuisyncLegacyPrint = 'true'
      button.style.setProperty('display', 'none', 'important')
    })
  })
}

function dispatchPointer(type, target, sourceEvent) {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: type === 'pointerup' ? 0 : 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: sourceEvent.clientX,
    clientY: sourceEvent.clientY,
  })
  target.dispatchEvent(event)
}

function installNativeDragFallback() {
  document.addEventListener('dragstart', (event) => {
    const card = event.target.closest?.(APPOINTMENT_CARD_SELECTOR)
    if (!card || card.dataset.yuisyncMovable !== 'true') return
    nativeDragCard = card
    dispatchPointer('pointerdown', card, event)
    event.dataTransfer?.setData('text/plain', card.dataset.yuisyncAppointmentId || '')
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  })

  document.addEventListener('dragover', (event) => {
    if (!nativeDragCard) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    dispatchPointer('pointermove', document, event)
  })

  document.addEventListener('drop', (event) => {
    if (!nativeDragCard) return
    event.preventDefault()
    dispatchPointer('pointermove', document, event)
    dispatchPointer('pointerup', document, event)
    nativeDragCard = null
  })

  document.addEventListener('dragend', (event) => {
    if (!nativeDragCard) return
    dispatchPointer('pointercancel', document, event)
    nativeDragCard = null
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
