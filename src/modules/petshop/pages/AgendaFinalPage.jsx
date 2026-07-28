import { useEffect } from 'react'
import AgendaIntegratedPage from './AgendaIntegratedPage'
import { useAuthCtx } from '../../../context/AuthContext'

const normalizeText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

function applyReceiptLogo(documentRef, logo) {
  if (!documentRef || !logo) return
  const header = documentRef.querySelector('main.receipt > .center')
  if (!header || header.querySelector('[data-yuisync-print-logo]')) return

  header.querySelector('.store')?.remove()
  header.querySelectorAll('.store-line').forEach((line) => line.remove())

  const image = documentRef.createElement('img')
  image.src = logo
  image.alt = 'Logo da empresa'
  image.dataset.yuisyncPrintLogo = 'true'
  image.style.display = 'block'
  image.style.width = 'auto'
  image.style.maxWidth = '56mm'
  image.style.maxHeight = '22mm'
  image.style.margin = '0 auto 2.5mm'
  image.style.objectFit = 'contain'
  image.style.filter = 'grayscale(1) contrast(2)'
  header.insertBefore(image, header.firstChild)
}

function AgendaFinalFixes() {
  const { storeSettings } = useAuthCtx()
  const logo = String(storeSettings?.receipt_logo_data_url || '')

  useEffect(() => {
    const nativeOpen = window.open
    const patchedOpen = function patchedAgendaPrintWindow(...args) {
      const child = nativeOpen.apply(window, args)
      if (!child) return child

      try {
        const nativeClose = child.document.close.bind(child.document)
        child.document.close = () => {
          nativeClose()
          applyReceiptLogo(child.document, logo)
        }
      } catch {
        // Mantem a impressao funcionando mesmo quando o navegador bloqueia o acesso antecipado.
      }
      return child
    }

    window.open = patchedOpen
    return () => {
      if (window.open === patchedOpen) window.open = nativeOpen
    }
  }, [logo])

  useEffect(() => {
    let frame = 0

    const restore = (root = document) => {
      root.querySelectorAll('[data-yuisync-final-hidden-print]').forEach((button) => {
        button.style.display = button.dataset.yuisyncFinalOriginalDisplay || ''
        button.removeAttribute('data-yuisync-final-hidden-print')
        button.removeAttribute('data-yuisync-final-original-display')
      })
      root.querySelectorAll('[data-yuisync-final-outer]').forEach((outer) => {
        outer.style.pointerEvents = outer.dataset.yuisyncFinalOriginalPointerEvents || ''
        outer.removeAttribute('data-yuisync-final-outer')
        outer.removeAttribute('data-yuisync-final-original-pointer-events')
      })
      root.querySelectorAll('[data-yuisync-final-card]').forEach((card) => {
        card.style.pointerEvents = ''
        card.style.padding = ''
        card.style.height = ''
        card.removeAttribute('data-yuisync-final-card')
      })
      root.querySelectorAll('[data-yuisync-final-compact]').forEach((element) => {
        element.style.marginTop = ''
        element.style.maxHeight = ''
        element.style.overflow = ''
        element.removeAttribute('data-yuisync-final-compact')
        element.querySelectorAll('[data-yuisync-final-hidden-detail]').forEach((detail) => {
          detail.style.display = detail.dataset.yuisyncFinalOriginalDisplay || ''
          detail.removeAttribute('data-yuisync-final-hidden-detail')
          detail.removeAttribute('data-yuisync-final-original-display')
        })
      })
    }

    const apply = () => {
      frame = 0
      const page = document.querySelector('.page')
      if (!page) return

      page.querySelectorAll('[data-yuisync-appointment-id]').forEach((card) => {
        const outer = card.parentElement
        if (outer?.classList.contains('absolute')) {
          if (!outer.hasAttribute('data-yuisync-final-outer')) {
            outer.dataset.yuisyncFinalOriginalPointerEvents = outer.style.pointerEvents || ''
            outer.dataset.yuisyncFinalOuter = 'true'
          }
          outer.style.pointerEvents = 'none'
        }

        card.dataset.yuisyncFinalCard = 'true'
        card.style.pointerEvents = 'auto'
        card.style.height = '100%'
        card.style.padding = '6px'

        const trigger = card.querySelector('button.w-full.text-left')
        if (trigger) {
          trigger.style.height = '100%'
          trigger.style.overflow = 'hidden'
          trigger.style.paddingRight = '68px'

          const detailRows = [...trigger.querySelectorAll('div')]
          const transportBlock = detailRows.find((element) => {
            const firstLine = element.querySelector(':scope > p')
            const text = normalizeText(firstLine?.textContent)
            return text.includes('motodog')
              || text.includes('cliente traz e busca')
              || text.includes('somente buscar')
              || text.includes('somente levar')
              || text.includes('buscar e levar')
          })

          if (transportBlock) {
            transportBlock.dataset.yuisyncFinalCompact = 'true'
            transportBlock.style.marginTop = '2px'
            transportBlock.style.maxHeight = '16px'
            transportBlock.style.overflow = 'hidden'
            ;[...transportBlock.children].slice(1).forEach((detail) => {
              if (!detail.hasAttribute('data-yuisync-final-hidden-detail')) {
                detail.dataset.yuisyncFinalOriginalDisplay = detail.style.display || ''
                detail.dataset.yuisyncFinalHiddenDetail = 'true'
              }
              detail.style.display = 'none'
            })
          }

          const serviceRow = [...trigger.querySelectorAll('div')].find((element) => (
            element.className.includes('mt-2')
            && element.className.includes('justify-between')
          ))
          if (serviceRow) serviceRow.style.marginTop = '2px'

          const responsible = [...trigger.querySelectorAll('p')].find((element) => normalizeText(element.textContent).startsWith('resp.:'))
          if (responsible) responsible.style.marginTop = '1px'
        }

        card.querySelectorAll('button').forEach((button) => {
          if (button.closest('[data-yuisync-card-actions]')) return
          const label = normalizeText(`${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`)
          if (!label.includes('imprimir')) return
          if (!button.hasAttribute('data-yuisync-final-hidden-print')) {
            button.dataset.yuisyncFinalOriginalDisplay = button.style.display || ''
            button.dataset.yuisyncFinalHiddenPrint = 'true'
          }
          button.style.display = 'none'
        })
      })
    }

    const schedule = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(apply)
    }

    apply()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      observer.disconnect()
      restore()
    }
  }, [])

  return null
}

export default function AgendaFinalPage() {
  return (
    <>
      <AgendaIntegratedPage />
      <AgendaFinalFixes />
    </>
  )
}
