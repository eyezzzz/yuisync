import { useEffect } from 'react'
import AgendaResolvedPage from './AgendaResolvedPage'

const LUNCH_START_MINUTES = 11 * 60
const LUNCH_END_MINUTES = 13 * 60
const LUNCH_COLLAPSED_HEIGHT = 32

const FLUID_AGENDA_STYLES = `
  .yuisync-agenda-card-surface,
  .yuisync-resolved-card {
    padding: 7px !important;
  }

  .yuisync-card-header {
    min-height: 34px !important;
    padding-right: 96px !important;
    gap: 4px !important;
    align-content: flex-start !important;
  }

  .yuisync-card-body {
    gap: 2px !important;
  }

  .yuisync-card-time {
    font-size: 11px !important;
    line-height: 1.05 !important;
    font-weight: 900 !important;
    letter-spacing: 0 !important;
  }

  .yuisync-card-status {
    max-width: 100% !important;
    font-size: 9px !important;
    line-height: 1.1 !important;
    font-weight: 800 !important;
  }

  .yuisync-card-pet {
    margin-top: 1px !important;
    font-size: 12px !important;
    line-height: 1.15 !important;
    font-weight: 900 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }

  .yuisync-card-tutor {
    margin-top: 0 !important;
    font-size: 10px !important;
    line-height: 1.2 !important;
    font-weight: 700 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }

  .yuisync-card-service {
    margin-top: 2px !important;
    min-width: 0 !important;
    font-size: 10px !important;
    line-height: 1.2 !important;
    font-weight: 700 !important;
  }

  .yuisync-card-service > span:first-child {
    min-width: 0 !important;
    overflow: hidden !important;
    display: -webkit-box !important;
    -webkit-line-clamp: 2 !important;
    -webkit-box-orient: vertical !important;
  }

  .yuisync-card-service > span:last-child {
    white-space: nowrap !important;
    font-size: 10px !important;
    line-height: 1.2 !important;
    font-weight: 900 !important;
  }

  .yuisync-card-transport,
  .yuisync-card-responsible {
    margin-top: 1px !important;
    font-size: 9px !important;
    line-height: 1.15 !important;
    font-weight: 600 !important;
  }

  .yuisync-resolved-actions,
  [data-yuisync-width='compact'] .yuisync-resolved-actions,
  [data-yuisync-width='narrow'] .yuisync-resolved-actions,
  [data-yuisync-density='compact'] .yuisync-resolved-actions,
  [data-yuisync-density='micro'] .yuisync-resolved-actions {
    right: 5px !important;
    top: 5px !important;
    gap: 4px !important;
  }

  .yuisync-resolved-action,
  [data-yuisync-width='compact'] .yuisync-resolved-action,
  [data-yuisync-width='narrow'] .yuisync-resolved-action,
  [data-yuisync-density='compact'] .yuisync-resolved-action,
  [data-yuisync-density='micro'] .yuisync-resolved-action {
    width: 28px !important;
    height: 28px !important;
    flex-basis: 28px !important;
    border-radius: 8px !important;
  }

  .yuisync-agenda-card-surface[data-yuisync-density='compact'],
  .yuisync-resolved-card[data-yuisync-density='compact'] {
    padding: 5px !important;
  }

  [data-yuisync-density='compact'] .yuisync-card-responsible {
    display: none !important;
  }

  .yuisync-agenda-card-surface[data-yuisync-density='micro'],
  .yuisync-resolved-card[data-yuisync-density='micro'] {
    padding: 4px !important;
  }

  [data-yuisync-density='micro'] .yuisync-card-status,
  [data-yuisync-density='micro'] .yuisync-card-transport,
  [data-yuisync-density='micro'] .yuisync-card-responsible,
  [data-yuisync-density='micro'] .yuisync-card-tutor {
    display: none !important;
  }

  .yuisync-agenda-card-surface[data-yuisync-card-kind='grooming'],
  .yuisync-resolved-card[data-yuisync-card-kind='grooming'] {
    border-color: rgba(147, 197, 253, 0.92) !important;
    background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 58%, #172554 100%) !important;
    box-shadow: 0 10px 28px rgba(23, 37, 84, 0.42) !important;
  }

  [data-yuisync-card-kind='grooming'] .yuisync-resolved-action {
    border-color: rgba(191, 219, 254, 0.72) !important;
    background: rgba(30, 58, 138, 0.97) !important;
  }

  [data-yuisync-card-kind='grooming'] .yuisync-resolved-action:hover {
    background: rgba(37, 99, 235, 0.98) !important;
  }

  [data-yuisync-card-kind='grooming'] .yuisync-resolved-action.is-complete {
    background: #059669 !important;
  }

  .yuisync-agenda-card-surface .yuisync-package-label,
  .yuisync-resolved-card .yuisync-package-label {
    color: #a7f3d0 !important;
    font-size: 10px !important;
    font-weight: 900 !important;
    letter-spacing: .035em !important;
    text-transform: uppercase !important;
    white-space: nowrap !important;
  }

  .yuisync-lunch-toggle {
    display: inline-flex;
    min-height: 30px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(251, 191, 36, .35);
    border-radius: 9px;
    background: rgba(245, 158, 11, .1);
    padding: 5px 10px;
    color: #fcd34d;
    font-size: 10px;
    line-height: 1.1;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .04em;
    transition: background 120ms ease, border-color 120ms ease;
  }

  .yuisync-lunch-toggle:hover:not(:disabled) {
    border-color: rgba(251, 191, 36, .62);
    background: rgba(245, 158, 11, .17);
  }

  .yuisync-lunch-toggle:disabled {
    cursor: default;
    opacity: .72;
  }

  .yuisync-lunch-marker {
    position: absolute;
    z-index: 24;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-top: 1px dashed rgba(251, 191, 36, .45);
    border-bottom: 1px dashed rgba(251, 191, 36, .45);
    background: rgba(120, 53, 15, .18);
    color: #fcd34d;
    font-size: 10px;
    line-height: 1;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .05em;
  }

  .yuisync-lunch-marker-content {
    inset-inline: 0;
    cursor: pointer;
  }

  .yuisync-lunch-marker-label {
    inset-inline: 0;
  }
`

const normalizeCardText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const currencyValue = (value = '') => {
  const parsed = Number(String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

const minutesFromClock = (value = '') => {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

const intervalFromCard = (card) => {
  const text = card?.querySelector?.('.yuisync-card-time')?.textContent || ''
  const matches = [...String(text).matchAll(/(\d{1,2}):(\d{2})/g)]
  if (matches.length < 2) return null
  return {
    start: Number(matches[0][1]) * 60 + Number(matches[0][2]),
    end: Number(matches[1][1]) * 60 + Number(matches[1][2]),
  }
}

const applyCardPresentation = () => {
  document.querySelectorAll('.yuisync-agenda-card-surface').forEach((card) => {
    const text = normalizeCardText(card.textContent)
    const price = [...card.querySelectorAll('span')]
      .find((node) => /^r\$\s*/i.test(String(node.textContent || '').trim()))
    if (price) {
      const amount = currencyValue(price.textContent)
      const packageBath = amount !== null && Math.abs(amount) < 0.005 && text.includes('banho')
      if (packageBath) {
        price.textContent = 'PACOTE BANHO'
        price.classList.add('yuisync-package-label')
      } else {
        price.classList.remove('yuisync-package-label')
      }
    }

    const serviceNode = card.querySelector('.yuisync-card-service > span:first-child')
    const serviceText = normalizeCardText(serviceNode?.textContent)
    const genericGroup = ['banho/tosa', 'banho_tosa', 'banho tosa'].includes(serviceText)
    card.dataset.yuisyncCardKind = serviceText.includes('tosa') && !genericGroup
      ? 'grooming'
      : 'bath'
  })
}

const rememberLayoutValue = (element, key, value) => {
  if (!element?.dataset) return
  if (!(key in element.dataset)) element.dataset[key] = String(value ?? '')
}

const restoreLayoutNode = (node) => {
  if (!node?.dataset) return
  if ('yuisyncLunchOriginalTop' in node.dataset) node.style.top = node.dataset.yuisyncLunchOriginalTop
  if ('yuisyncLunchOriginalDisplay' in node.dataset) node.style.display = node.dataset.yuisyncLunchOriginalDisplay
}

function AgendaFluidRefinement() {
  useEffect(() => {
    let densityFrame = 0
    let lunchPreference = null

    const ensureLunchMarker = (column, kind, top) => {
      const selector = `[data-yuisync-lunch-marker='${kind}']`
      let marker = column.querySelector(selector)
      if (!marker) {
        marker = document.createElement(kind === 'content' ? 'button' : 'div')
        if (kind === 'content') marker.type = 'button'
        marker.dataset.yuisyncLunchMarker = kind
        marker.className = `yuisync-lunch-marker ${kind === 'content' ? 'yuisync-lunch-marker-content' : 'yuisync-lunch-marker-label'}`
        marker.textContent = kind === 'content' ? '11:00–13:00 recolhido · clique para abrir' : '11–13'
        column.appendChild(marker)
      }
      marker.style.top = `${top}px`
      marker.style.height = `${LUNCH_COLLAPSED_HEIGHT}px`
      marker.style.display = 'flex'
      if (kind === 'content') {
        marker.onclick = () => {
          lunchPreference = 'expanded'
          scheduleDensity()
        }
      }
      return marker
    }

    const applyLunchGap = () => {
      const slots = [...document.querySelectorAll('button[aria-label^="Agendar as "]')]
      const startSlot = slots.find((slot) => minutesFromClock(slot.getAttribute('aria-label')) === LUNCH_START_MINUTES)
      const endSlot = slots.find((slot) => minutesFromClock(slot.getAttribute('aria-label')) === LUNCH_END_MINUTES)
      if (!startSlot || !endSlot || startSlot.parentElement !== endSlot.parentElement) return

      const contentColumn = startSlot.parentElement
      const labelColumn = contentColumn.previousElementSibling
      const grid = contentColumn.parentElement
      if (!labelColumn || !grid) return

      const startTop = Number(startSlot.dataset.yuisyncLunchOriginalTop || startSlot.style.top.replace('px', ''))
      const endTop = Number(endSlot.dataset.yuisyncLunchOriginalTop || endSlot.style.top.replace('px', ''))
      if (!Number.isFinite(startTop) || !Number.isFinite(endTop) || endTop <= startTop) return

      const cards = [...contentColumn.querySelectorAll('.yuisync-agenda-card-surface')]
      const lunchInUse = cards.some((card) => {
        const interval = intervalFromCard(card)
        return interval && interval.start < LUNCH_END_MINUTES && interval.end > LUNCH_START_MINUTES
      })
      const collapsed = !lunchInUse && lunchPreference !== 'expanded'
      const shift = Math.max(0, (endTop - startTop) - LUNCH_COLLAPSED_HEIGHT)

      const header = grid.parentElement?.previousElementSibling
      let toggle = header?.querySelector?.('[data-yuisync-lunch-toggle]')
      if (header && !toggle) {
        toggle = document.createElement('button')
        toggle.type = 'button'
        toggle.dataset.yuisyncLunchToggle = 'true'
        toggle.className = 'yuisync-lunch-toggle'
        const target = header.lastElementChild || header
        target.appendChild(toggle)
      }
      if (toggle) {
        toggle.disabled = lunchInUse
        toggle.textContent = lunchInUse
          ? '11:00–13:00 em uso'
          : collapsed
            ? 'Mostrar 11:00–13:00'
            : 'Recolher 11:00–13:00'
        toggle.onclick = () => {
          if (lunchInUse) return
          lunchPreference = collapsed ? 'expanded' : 'collapsed'
          scheduleDensity()
        }
      }

      ;[labelColumn, contentColumn].forEach((column) => {
        rememberLayoutValue(column, 'yuisyncLunchOriginalHeight', column.style.height)
        const originalHeight = Number(column.dataset.yuisyncLunchOriginalHeight.replace('px', ''))
        if (Number.isFinite(originalHeight)) {
          column.style.height = `${collapsed ? originalHeight - shift : originalHeight}px`
        }
      })

      const repositionRows = (column) => {
        ;[...column.children].forEach((node) => {
          if (node.dataset.yuisyncLunchMarker) return
          if (!node.style?.top) return
          rememberLayoutValue(node, 'yuisyncLunchOriginalTop', node.style.top)
          rememberLayoutValue(node, 'yuisyncLunchOriginalDisplay', node.style.display)
          const originalTop = Number(node.dataset.yuisyncLunchOriginalTop.replace('px', ''))
          if (!Number.isFinite(originalTop)) return

          if (!collapsed) {
            restoreLayoutNode(node)
            return
          }

          if (originalTop >= startTop && originalTop < endTop) {
            node.style.display = 'none'
            return
          }
          node.style.display = node.dataset.yuisyncLunchOriginalDisplay
          node.style.top = `${originalTop >= endTop ? originalTop - shift : originalTop}px`
        })
      }

      repositionRows(labelColumn)
      repositionRows(contentColumn)

      if (collapsed) {
        ensureLunchMarker(labelColumn, 'label', startTop)
        ensureLunchMarker(contentColumn, 'content', startTop)
      } else {
        labelColumn.querySelector('[data-yuisync-lunch-marker="label"]')?.remove()
        contentColumn.querySelector('[data-yuisync-lunch-marker="content"]')?.remove()
      }

      grid.dataset.yuisyncLunchCollapsed = String(collapsed)
    }

    const applyDensity = () => {
      densityFrame = 0
      document.querySelectorAll('.yuisync-agenda-card-surface').forEach((card) => {
        const outer = card.parentElement
        const rect = card.getBoundingClientRect()
        const height = outer?.getBoundingClientRect?.().height || rect.height
        const width = rect.width
        card.dataset.yuisyncDensity = height <= 58 ? 'micro' : height <= 104 ? 'compact' : 'regular'
        card.dataset.yuisyncWidth = width <= 170 ? 'narrow' : width <= 240 ? 'compact' : 'wide'
      })
      applyCardPresentation()
      applyLunchGap()
    }

    const scheduleDensity = () => {
      if (densityFrame) return
      densityFrame = window.requestAnimationFrame(applyDensity)
    }

    const onClickCapture = (event) => {
      const selectedService = event.target.closest?.('[role="listbox"][aria-label="Servicos encontrados"] [role="option"]')
      if (!selectedService) return
      window.setTimeout(() => {
        document.querySelector('input[aria-label="Buscar servico para adicionar"]')?.blur()
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      }, 0)
    }

    const observer = new MutationObserver(scheduleDensity)

    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('click', onClickCapture, true)
    window.addEventListener('resize', scheduleDensity)
    scheduleDensity()

    return () => {
      observer.disconnect()
      document.removeEventListener('click', onClickCapture, true)
      window.removeEventListener('resize', scheduleDensity)
      if (densityFrame) window.cancelAnimationFrame(densityFrame)
    }
  }, [])

  return <style>{FLUID_AGENDA_STYLES}</style>
}

export default function AgendaIntegratedPage({ setPage }) {
  return (
    <>
      <AgendaResolvedPage setPage={setPage} />
      <AgendaFluidRefinement />
    </>
  )
}
