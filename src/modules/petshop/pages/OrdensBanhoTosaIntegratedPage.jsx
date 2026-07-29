import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Scissors } from 'lucide-react'

import OrdensEntregaPage from './OrdensEntregaPage'
import BanhoTosaPdvPanel from './BanhoTosaPdvPanel'

const ORDERS_BRIDGE_STYLES = `
  [data-yuisync-orders-active='true'] > * {
    display: none !important;
  }

  [data-yuisync-orders-active='true'] > [data-yuisync-orders-header],
  [data-yuisync-orders-active='true'] > [data-yuisync-orders-tabs],
  [data-yuisync-orders-active='true'] > [data-yuisync-banho-tosa-content] {
    display: block !important;
  }

  [data-yuisync-banho-tosa-content] {
    width: 100%;
  }
`

function normalized(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function findOrdersPage() {
  return [...document.querySelectorAll('.page')].find((page) => {
    const title = page.querySelector('h1')
    return normalized(title?.textContent).includes('ordens de servico')
  }) || null
}

function findNativeTabs(page) {
  return [...(page?.querySelectorAll?.('div') || [])].find((element) => {
    const directButtons = [...element.querySelectorAll(':scope > button')]
    const labels = directButtons.map((button) => normalized(button.textContent))
    return labels.includes('entregas') && labels.some((label) => label.includes('ordens de servico'))
  }) || null
}

function ensurePortalRoot(parent, attribute, insertAfter = false) {
  if (!parent) return null
  const selector = `[${attribute}]`
  let root = insertAfter
    ? parent.parentElement?.querySelector(`:scope > ${selector}`)
    : parent.querySelector(`:scope > ${selector}`)
  if (root) return root
  root = document.createElement('div')
  root.setAttribute(attribute, 'true')
  if (insertAfter) parent.insertAdjacentElement('afterend', root)
  else parent.appendChild(root)
  return root
}

function BanhoTosaTabBridge({ setPage }) {
  const [active, setActive] = useState(false)
  const [tabRoot, setTabRoot] = useState(null)
  const [contentRoot, setContentRoot] = useState(null)
  const pageRef = useRef(null)
  const frameRef = useRef(0)

  const sync = useCallback(() => {
    frameRef.current = 0
    const page = findOrdersPage()
    if (!page) {
      pageRef.current = null
      setTabRoot(null)
      setContentRoot(null)
      return
    }

    pageRef.current = page
    page.setAttribute('data-yuisync-orders-active', active ? 'true' : 'false')
    page.firstElementChild?.setAttribute('data-yuisync-orders-header', 'true')

    const tabs = findNativeTabs(page)
    if (!tabs) return
    tabs.setAttribute('data-yuisync-orders-tabs', 'true')

    const nextTabRoot = ensurePortalRoot(tabs, 'data-yuisync-banho-tosa-tab-root')
    const nextContentRoot = ensurePortalRoot(tabs, 'data-yuisync-banho-tosa-content', true)
    setTabRoot((current) => current === nextTabRoot ? current : nextTabRoot)
    setContentRoot((current) => current === nextContentRoot ? current : nextContentRoot)
  }, [active])

  const scheduleSync = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = window.requestAnimationFrame(sync)
  }, [sync])

  useEffect(() => {
    const observer = new MutationObserver(scheduleSync)
    observer.observe(document.body, { childList: true, subtree: true })

    const onClick = (event) => {
      const button = event.target.closest?.('button')
      if (!button) return
      const label = normalized(button.textContent)
      if (label === 'entregas' || label.includes('ordens de servico')) setActive(false)
    }

    document.addEventListener('click', onClick, true)
    scheduleSync()
    return () => {
      observer.disconnect()
      document.removeEventListener('click', onClick, true)
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
      pageRef.current?.removeAttribute('data-yuisync-orders-active')
    }
  }, [scheduleSync])

  useEffect(() => { scheduleSync() }, [active, scheduleSync])

  return (
    <>
      <style>{ORDERS_BRIDGE_STYLES}</style>
      {tabRoot && createPortal(
        <button
          type="button"
          onClick={() => setActive(true)}
          className={`flex items-center gap-2 rounded-lg px-5 py-2 text-xs font-bold transition-all ${active ? 'bg-primary text-gray-950 shadow-lg' : 'text-muted hover:text-text'}`}
          style={active ? { backgroundColor: 'var(--primary)' } : {}}
        >
          <Scissors size={14} /> Banho & Tosa
        </button>,
        tabRoot,
      )}
      {contentRoot && active && createPortal(
        <BanhoTosaPdvPanel setPage={setPage} />,
        contentRoot,
      )}
    </>
  )
}

export default function OrdensBanhoTosaIntegratedPage({ setPage }) {
  return (
    <>
      <OrdensEntregaPage setPage={setPage} />
      <BanhoTosaTabBridge setPage={setPage} />
    </>
  )
}
