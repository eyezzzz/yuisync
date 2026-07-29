import { useCallback, useEffect, useRef } from 'react'

import PlanosCatalogPage from './PlanosCatalogPage'

function normalize(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function decoratePendingPayments() {
  document.querySelectorAll('.page .badge').forEach((badge) => {
    if (normalize(badge.textContent) !== 'pending_payment') return
    badge.textContent = 'Aguardando pagamento'
    badge.classList.remove('badge-red', 'badge-gray', 'badge-green')
    badge.classList.add('badge-amber')
  })

  const subscriptionModal = [...document.querySelectorAll('.modal-box')]
    .find((modal) => modal.querySelector('button[aria-label="Fechar assinatura"]'))
  if (!subscriptionModal) return

  const submit = [...subscriptionModal.querySelectorAll('button')]
    .find((button) => normalize(button.textContent) === 'salvar assinatura')
  if (submit) submit.textContent = 'Continuar para pagamento'

  const title = subscriptionModal.querySelector('h2')
  if (title && normalize(title.textContent) === 'vincular pacote ao cliente') {
    title.textContent = 'Vender pacote ao cliente'
  }

  const statusLabel = [...subscriptionModal.querySelectorAll('label')]
    .find((label) => normalize(label.textContent) === 'status')
  const statusField = statusLabel?.parentElement
  if (statusField) statusField.style.display = 'none'

  if (!subscriptionModal.querySelector('[data-yuisync-payment-hint]')) {
    const body = subscriptionModal.querySelector('.modal-body')
    const hint = document.createElement('div')
    hint.setAttribute('data-yuisync-payment-hint', 'true')
    hint.className = 'rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200'
    hint.textContent = 'Ao continuar, o pacote ficará aguardando pagamento em Ordens / Banho & Tosa. Os benefícios só serão liberados após a confirmação no caixa.'
    body?.insertBefore(hint, body.firstChild)
  }
}

export default function PlanosPaymentIntegratedPage({ setPage }) {
  const frameRef = useRef(0)

  const scheduleDecoration = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0
      decoratePendingPayments()
    })
  }, [])

  useEffect(() => {
    const observer = new MutationObserver(scheduleDecoration)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    scheduleDecoration()

    const handlePendingPayment = (event) => {
      const detail = event.detail || {}
      window.sessionStorage.setItem('yuisync:orders-tab', 'banho_tosa')
      if (detail.subscriptionId) window.sessionStorage.setItem('yuisync:subscription-focus', detail.subscriptionId)
      window.setTimeout(() => setPage?.('ordens'), 120)
    }

    window.addEventListener('yuisync:subscription-pending-payment', handlePendingPayment)
    return () => {
      observer.disconnect()
      window.removeEventListener('yuisync:subscription-pending-payment', handlePendingPayment)
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
    }
  }, [scheduleDecoration, setPage])

  return <PlanosCatalogPage />
}
