import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

function isOfficialSiteRoute() {
  return window.location.pathname.replace(/\/+$/, '') === '/site'
}

export function SiteLegalFooterPortal() {
  const [footerTarget, setFooterTarget] = useState(null)

  useEffect(() => {
    const root = window.document.getElementById('root')
    if (!root) return undefined

    let frameId = null
    const syncFooterTarget = () => {
      if (frameId) window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        const nextTarget = isOfficialSiteRoute()
          ? root.querySelector('footer')
          : null
        setFooterTarget((current) => (current === nextTarget ? current : nextTarget))
      })
    }

    syncFooterTarget()

    const observer = new MutationObserver(syncFooterTarget)
    observer.observe(root, { childList: true, subtree: true })
    window.addEventListener('popstate', syncFooterTarget)

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId)
      observer.disconnect()
      window.removeEventListener('popstate', syncFooterTarget)
    }
  }, [])

  if (!footerTarget) return null

  return createPortal(
    <nav
      aria-label="Documentos legais"
      className="mx-auto mt-3 flex max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-white/5 px-4 pt-3 text-[11px] text-white/40"
    >
      <a className="transition-colors hover:text-white/70" href="/privacidade">Política de Privacidade</a>
      <a className="transition-colors hover:text-white/70" href="/termos">Termos de Serviço</a>
      <a className="transition-colors hover:text-white/70" href="/exclusao-de-dados">Exclusão de Dados</a>
    </nav>,
    footerTarget,
  )
}
