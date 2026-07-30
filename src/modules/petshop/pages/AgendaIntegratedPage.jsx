import { useEffect } from 'react'
import AgendaResolvedPage from './AgendaResolvedPage'

const FLUID_AGENDA_STYLES = `
  .yuisync-agenda-card-surface[data-yuisync-density='compact'],
  .yuisync-resolved-card[data-yuisync-density='compact'] {
    padding: 5px !important;
  }

  [data-yuisync-density='compact'] .yuisync-card-header {
    min-height: 29px;
    padding-right: 96px;
  }

  [data-yuisync-density='compact'] .yuisync-resolved-actions,
  [data-yuisync-width='compact'] .yuisync-resolved-actions {
    right: 4px !important;
    top: 4px !important;
    gap: 3px !important;
  }

  [data-yuisync-density='compact'] .yuisync-resolved-action,
  [data-yuisync-width='compact'] .yuisync-resolved-action {
    width: 28px !important;
    height: 28px !important;
    flex-basis: 28px !important;
    border-radius: 8px !important;
  }

  [data-yuisync-density='compact'] .yuisync-card-body {
    gap: 0;
  }

  [data-yuisync-density='compact'] .yuisync-card-pet,
  [data-yuisync-density='compact'] .yuisync-card-tutor,
  [data-yuisync-density='compact'] .yuisync-card-service,
  [data-yuisync-density='compact'] .yuisync-card-transport,
  [data-yuisync-density='compact'] .yuisync-card-responsible {
    margin-top: 0 !important;
    font-size: 9px !important;
    line-height: 1 !important;
  }

  .yuisync-agenda-card-surface[data-yuisync-density='micro'],
  .yuisync-resolved-card[data-yuisync-density='micro'] {
    padding: 3px !important;
  }

  [data-yuisync-density='micro'] .yuisync-card-header {
    min-height: 23px;
    padding-right: 74px;
  }

  [data-yuisync-density='micro'] .yuisync-resolved-actions,
  [data-yuisync-width='narrow'] .yuisync-resolved-actions {
    right: 3px !important;
    top: 3px !important;
    gap: 2px !important;
  }

  [data-yuisync-density='micro'] .yuisync-resolved-action,
  [data-yuisync-width='narrow'] .yuisync-resolved-action {
    width: 22px !important;
    height: 22px !important;
    flex-basis: 22px !important;
    border-radius: 7px !important;
  }

  [data-yuisync-width='compact'] .yuisync-card-header {
    padding-right: 96px;
  }

  [data-yuisync-width='narrow'] .yuisync-card-header {
    padding-right: 74px;
  }

  [data-yuisync-width='narrow'] .yuisync-card-status,
  [data-yuisync-density='micro'] .yuisync-card-status,
  [data-yuisync-density='micro'] .yuisync-card-transport,
  [data-yuisync-density='micro'] .yuisync-card-responsible {
    display: none !important;
  }

  [data-yuisync-density='micro'] .yuisync-card-body {
    gap: 0;
  }

  [data-yuisync-density='micro'] .yuisync-card-pet {
    font-size: 9px !important;
    line-height: 1 !important;
  }

  [data-yuisync-density='micro'] .yuisync-card-tutor,
  [data-yuisync-density='micro'] .yuisync-card-service {
    margin-top: 0 !important;
    font-size: 8px !important;
    line-height: 1 !important;
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
`

const normalizeCardText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()

const currencyValue = (value = '') => {
  const parsed = Number(String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

const applyPackageLabels = () => {
  document.querySelectorAll('.yuisync-agenda-card-surface').forEach((card) => {
    const text = normalizeCardText(card.textContent)
    const price = [...card.querySelectorAll('span')]
      .find((node) => /^r\$\s*/i.test(String(node.textContent || '').trim()))
    if (!price) return

    const amount = currencyValue(price.textContent)
    const packageBath = amount !== null && Math.abs(amount) < 0.005 && text.includes('banho')
    if (packageBath) {
      price.textContent = 'PACOTE BANHO'
      price.classList.add('yuisync-package-label')
    } else {
      price.classList.remove('yuisync-package-label')
    }
  })
}

function AgendaFluidRefinement() {
  useEffect(() => {
    let densityFrame = 0

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
      applyPackageLabels()
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
