const APPOINTMENT_CARD_SELECTOR = '[data-yuisync-appointment-id]'

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
    if (card.style.pointerEvents !== 'auto') card.style.pointerEvents = 'auto'

    card.querySelectorAll('button').forEach((button) => {
      if (button.dataset.yuisyncAction === 'print') return
      const description = normalize(`${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`)
      if (!description.includes('imprimir')) return
      button.dataset.yuisyncLegacyPrint = 'true'
      button.style.setProperty('display', 'none', 'important')
    })
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

  const observer = new MutationObserver(scheduleAgendaOperationalFixes)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
}

export { syncAgendaOperationalFixes }
