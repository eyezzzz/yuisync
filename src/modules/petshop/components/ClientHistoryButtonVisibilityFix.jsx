import { useEffect } from 'react'

function installGridHistoryProxies() {
  if (!window.location.pathname.endsWith('/pets')) return

  document.querySelectorAll('[data-yuisync-add-pet-action]').forEach((addPetButton) => {
    const card = addPetButton.closest('.rounded-2xl.border.bg-card')
    if (!card) return
    if (card.querySelector('[data-yuisync-client-history]')) return
    if (card.querySelector('[data-yuisync-history-grid-proxy]')) return

    const proxy = document.createElement('button')
    proxy.type = 'button'
    proxy.hidden = true
    proxy.tabIndex = -1
    proxy.dataset.yuisyncHistoryGridProxy = 'true'
    proxy.textContent = 'Abrir'
    card.appendChild(proxy)
  })
}

export function ClientHistoryButtonVisibilityFix() {
  useEffect(() => {
    let frame = 0
    const apply = () => {
      frame = 0
      installGridHistoryProxies()
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(apply)
    }

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    schedule()

    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      document.querySelectorAll('[data-yuisync-history-grid-proxy]').forEach((node) => node.remove())
    }
  }, [])

  return null
}

export default ClientHistoryButtonVisibilityFix
