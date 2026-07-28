import { useEffect } from 'react'
import AgendaResolvedPage from './AgendaResolvedPage'

const FLUID_AGENDA_STYLES = `
  .yuisync-resolved-card[data-yuisync-density='compact'] > button.w-full.text-left {
    padding: 4px 98px 4px 6px !important;
  }

  .yuisync-resolved-card[data-yuisync-density='compact'] .yuisync-resolved-actions {
    right: 4px !important;
    top: 4px !important;
    gap: 3px !important;
  }

  .yuisync-resolved-card[data-yuisync-density='compact'] .yuisync-resolved-action {
    width: 28px !important;
    height: 28px !important;
    flex-basis: 28px !important;
    border-radius: 8px !important;
  }

  .yuisync-resolved-card[data-yuisync-density='compact'] > button.w-full.text-left > .mt-2 {
    display: none !important;
  }

  .yuisync-resolved-card[data-yuisync-density='compact'] > button.w-full.text-left p,
  .yuisync-resolved-card[data-yuisync-density='compact'] > button.w-full.text-left span {
    line-height: 1.08 !important;
  }

  .yuisync-resolved-card[data-yuisync-density='compact'] > button.w-full.text-left > p.mt-1 {
    margin-top: 2px !important;
    font-size: 9px !important;
  }

  .yuisync-resolved-card[data-yuisync-density='micro'] > button.w-full.text-left {
    padding: 3px 76px 3px 5px !important;
  }

  .yuisync-resolved-card[data-yuisync-density='micro'] .yuisync-resolved-actions {
    right: 3px !important;
    top: 3px !important;
    gap: 2px !important;
  }

  .yuisync-resolved-card[data-yuisync-density='micro'] .yuisync-resolved-action {
    width: 22px !important;
    height: 22px !important;
    flex-basis: 22px !important;
    border-radius: 7px !important;
  }

  .yuisync-resolved-card[data-yuisync-density='micro'] > button.w-full.text-left > .mt-2,
  .yuisync-resolved-card[data-yuisync-density='micro'] > button.w-full.text-left > .mt-1,
  .yuisync-resolved-card[data-yuisync-density='micro'] > button.w-full.text-left > p.mt-1,
  .yuisync-resolved-card[data-yuisync-density='micro'] > button.w-full.text-left > div:first-child > p:nth-of-type(n + 2),
  .yuisync-resolved-card[data-yuisync-density='micro'] .badge {
    display: none !important;
  }

  .yuisync-resolved-card[data-yuisync-density='micro'] > button.w-full.text-left > div:first-child > p,
  .yuisync-resolved-card[data-yuisync-density='micro'] > button.w-full.text-left > div:first-child > div > p {
    margin-top: 0 !important;
    font-size: 8px !important;
    line-height: 1.02 !important;
  }

  .yuisync-resolved-card[data-yuisync-density='micro'] > button.w-full.text-left > div:first-child > p:first-of-type {
    font-size: 9px !important;
  }
`

const minutesFromTime = (value = '') => {
  const match = String(value).match(/(\d{2}):(\d{2})/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

const timeFromMinutes = (value) => {
  const safe = ((Number(value) % 1440) + 1440) % 1440
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

const shiftedInterval = (currentText, targetTime) => {
  const match = String(currentText || '').match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/)
  const nextStart = minutesFromTime(targetTime)
  if (!match || nextStart === null) return currentText

  const currentStart = minutesFromTime(match[1])
  const currentEnd = minutesFromTime(match[2])
  if (currentStart === null || currentEnd === null) return currentText

  const duration = currentEnd > currentStart
    ? currentEnd - currentStart
    : currentEnd + 1440 - currentStart
  return `${timeFromMinutes(nextStart)} - ${timeFromMinutes(nextStart + Math.max(10, duration))}`
}

const findIntervalNode = (card) => [...(card?.querySelectorAll?.('p') || [])]
  .find((node) => /\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/.test(String(node.textContent || '')))

function AgendaFluidRefinement() {
  useEffect(() => {
    let dragStart = null
    let pendingMove = null
    let densityFrame = 0
    let suppressRefreshUntil = 0

    const applyDensity = () => {
      densityFrame = 0
      document.querySelectorAll('.yuisync-resolved-card').forEach((card) => {
        const outer = card.parentElement
        const height = outer?.getBoundingClientRect?.().height || card.getBoundingClientRect().height
        card.dataset.yuisyncDensity = height <= 58 ? 'micro' : height <= 100 ? 'compact' : 'regular'
      })
    }

    const scheduleDensity = () => {
      if (densityFrame) return
      densityFrame = window.requestAnimationFrame(applyDensity)
    }

    const revertPendingMove = () => {
      if (!pendingMove) return
      pendingMove.outer.style.top = pendingMove.oldTop
      if (pendingMove.intervalNode) pendingMove.intervalNode.textContent = pendingMove.oldText
      pendingMove.outer.style.transition = ''
      pendingMove = null
      scheduleDensity()
    }

    const reconcileNotice = () => {
      if (!pendingMove) return
      const notice = document.querySelector('button[title="Fechar aviso"]')
      const text = String(notice?.textContent || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      if (text.includes('agendamento movido para')) {
        pendingMove.outer.style.transition = ''
        pendingMove = null
      } else if (text.includes('horario indisponivel') || text.includes('nao foi possivel')) {
        revertPendingMove()
      }
    }

    const onPointerDownCapture = (event) => {
      const card = event.target.closest?.('[data-yuisync-appointment-id][data-yuisync-movable="true"]')
      if (!card) return
      const action = event.target.closest?.('[data-yuisync-action]')
      if (action && action.dataset.yuisyncAction !== 'drag') return

      const outer = card.parentElement
      if (!outer) return
      const intervalNode = findIntervalNode(card)
      dragStart = {
        card,
        outer,
        intervalNode,
        oldTop: outer.style.top,
        oldText: intervalNode?.textContent || '',
      }
    }

    const onPointerUpCapture = () => {
      if (!dragStart) return
      const slot = document.querySelector('button[data-yuisync-drop-active="true"]')
      const targetTime = slot?.getAttribute('aria-label')?.match(/(\d{2}:\d{2})/)?.[1] || ''
      const slotTop = Number.parseFloat(slot?.style?.top || '')
      const active = dragStart.card.classList.contains('is-yuisync-pointer-dragging')

      if (!active || !targetTime || !Number.isFinite(slotTop)) {
        dragStart = null
        return
      }

      const nextText = shiftedInterval(dragStart.oldText, targetTime)
      dragStart.outer.style.transition = 'top 160ms ease-out'
      dragStart.outer.style.top = `${slotTop + 2}px`
      if (dragStart.intervalNode && nextText) dragStart.intervalNode.textContent = nextText

      pendingMove = { ...dragStart, targetTime }
      suppressRefreshUntil = Date.now() + 15000
      dragStart = null
      scheduleDensity()
    }

    const onClickCapture = (event) => {
      const refreshButton = event.target.closest?.('.page button[title="Atualizar"]')
      if (!refreshButton) return
      if (!pendingMove && Date.now() > suppressRefreshUntil) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
    }

    const observer = new MutationObserver(() => {
      scheduleDensity()
      reconcileNotice()
    })

    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('pointerdown', onPointerDownCapture, true)
    document.addEventListener('pointerup', onPointerUpCapture, true)
    document.addEventListener('click', onClickCapture, true)
    window.addEventListener('resize', scheduleDensity)
    scheduleDensity()

    return () => {
      observer.disconnect()
      document.removeEventListener('pointerdown', onPointerDownCapture, true)
      document.removeEventListener('pointerup', onPointerUpCapture, true)
      document.removeEventListener('click', onClickCapture, true)
      window.removeEventListener('resize', scheduleDensity)
      if (densityFrame) window.cancelAnimationFrame(densityFrame)
    }
  }, [])

  return <style>{FLUID_AGENDA_STYLES}</style>
}

export default function AgendaIntegratedPage() {
  return (
    <>
      <AgendaResolvedPage />
      <AgendaFluidRefinement />
    </>
  )
}
