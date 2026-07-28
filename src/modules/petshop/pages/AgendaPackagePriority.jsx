import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bike, CheckCircle2, Crown, PackageCheck } from 'lucide-react'

import { useCatalogPlans } from '../hooks/useCatalogPlans'
import { usePetshopAdvanced } from '../hooks/usePetshopAdvanced'
import {
  buildCatalogUsageSummary,
  matchActiveSubscriptionByText,
  normalizePlanText,
} from '../lib/catalogPlanServices'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function setNativeInputValue(input, value) {
  if (!input) return
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function findAppointmentModal() {
  return [...document.querySelectorAll('.modal-box')]
    .find((box) => box.querySelector('button[aria-label="Fechar agendamento"]')) || null
}

function findTextElement(root, predicate) {
  return [...(root?.querySelectorAll?.('*') || [])]
    .find((element) => predicate(String(element.textContent || '').trim(), element)) || null
}

function ensurePortalRoot(parent, attribute, position = 'append') {
  if (!parent) return null
  let root = parent.querySelector(`:scope > [${attribute}]`)
  if (!root) {
    root = document.createElement('div')
    root.setAttribute(attribute, 'true')
    if (position === 'prepend') parent.insertBefore(root, parent.firstChild)
    else parent.appendChild(root)
  }
  return root
}

function restoreDecorations(modal) {
  if (!modal) return
  modal.querySelectorAll('[data-yuisync-package-original-text]').forEach((element) => {
    element.textContent = element.dataset.yuisyncPackageOriginalText || element.textContent
    delete element.dataset.yuisyncPackageOriginalText
  })
  const transportOption = modal.querySelector('select[aria-label="Transporte do pet"] option[value="buscar_e_levar"]')
  if (transportOption?.dataset.yuisyncPackageOriginalLabel) {
    transportOption.textContent = transportOption.dataset.yuisyncPackageOriginalLabel
    delete transportOption.dataset.yuisyncPackageOriginalLabel
  }
}

function selectedServiceRows(modal) {
  return [...(modal?.querySelectorAll?.('button[aria-label^="Remover "]') || [])]
    .map((button) => button.parentElement)
    .filter(Boolean)
}

function serviceRowLabel(row) {
  return [...(row?.querySelectorAll?.('span') || [])]
    .find((span) => String(span.className || '').includes('font-semibold') && String(span.className || '').includes('text-sm'))
    ?.textContent?.trim() || ''
}

function serviceRowMetadata(row) {
  return [...(row?.querySelectorAll?.('span') || [])]
    .find((span) => String(span.className || '').includes('text-xs') && String(span.className || '').includes('text-muted')) || null
}

function currentServiceGroup(modal) {
  const label = [...(modal?.querySelectorAll?.('label') || [])]
    .find((item) => normalizePlanText(item.textContent).startsWith('servicos '))
  return normalizePlanText(label?.textContent).includes('veterin') ? 'veterinaria' : 'banho_tosa'
}

function PackageSummary({ planName, usage }) {
  return (
    <div className="mb-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 shadow-[0_12px_40px_rgba(16,185,129,0.10)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300"><Crown size={13}/> Pacote ativo · prioridade</p>
          <p className="mt-1 text-base font-black text-text">{planName}</p>
        </div>
        <span className="badge badge-green">Aplicação automática</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {usage.map((item) => (
          <span key={item.service_type} className={`badge ${item.remaining > 0 ? 'badge-blue' : 'badge-gray'}`}>
            {item.label}: {item.remaining}/{item.total} disponíveis
          </span>
        ))}
      </div>
    </div>
  )
}

function PackagePriorityOptions({ planName, entries, onSelect }) {
  if (!entries.length) return null
  return (
    <div className="border-b border-emerald-500/25 bg-emerald-500/[0.08] p-2">
      <div className="px-2 pb-2 pt-1">
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300"><PackageCheck size={12}/> {planName}</p>
        <p className="mt-1 text-[11px] text-muted">Serviços inclusos aparecem primeiro e serão reservados ao confirmar.</p>
      </div>
      <div className="space-y-1">
        {entries.map((entry) => {
          const available = entry.remaining > 0
          return (
            <button
              key={entry.service_type}
              type="button"
              disabled={!available}
              onClick={() => available && onSelect(entry)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${available ? 'border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/16' : 'cursor-not-allowed border-white/5 bg-white/[0.02] opacity-55'}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300"><CheckCircle2 size={15}/></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-text">{entry.label}</span>
                <span className="block text-xs text-muted">{available ? `${entry.remaining} de ${entry.total} disponíveis · R$ 0,00` : 'Esgotado neste ciclo · disponível como avulso abaixo'}</span>
              </span>
              {available && <span className="badge badge-green">Pacote</span>}
            </button>
          )
        })}
      </div>
      <p className="px-2 pb-1 pt-3 text-[10px] font-black uppercase tracking-[0.16em] text-muted">Serviços avulsos</p>
    </div>
  )
}

function MotoDogPackageNotice({ planName, balance, selected }) {
  if (!balance || balance.remaining <= 0) return null
  return (
    <div className={`mt-2 rounded-xl border px-3 py-2 text-xs ${selected ? 'border-sky-400/35 bg-sky-500/12 text-sky-200' : 'border-sky-400/20 bg-sky-500/[0.06] text-muted'}`}>
      <p className="flex items-center gap-2 font-bold"><Bike size={13}/> MotoDog incluso no {planName}</p>
      <p className="mt-1">{balance.remaining} de {balance.total} disponíveis. Só será reservado ao escolher “buscar e levar”.</p>
    </div>
  )
}

export default function AgendaPackagePriority() {
  const { loadSubscriptions } = useCatalogPlans()
  const { loadPetshopServices } = usePetshopAdvanced()
  const [subscriptions, setSubscriptions] = useState([])
  const [catalogServices, setCatalogServices] = useState([])
  const [activeSubscription, setActiveSubscription] = useState(null)
  const [summaryRoot, setSummaryRoot] = useState(null)
  const [priorityRoot, setPriorityRoot] = useState(null)
  const [transportRoot, setTransportRoot] = useState(null)
  const [serviceGroup, setServiceGroup] = useState('banho_tosa')
  const [transportMode, setTransportMode] = useState('cliente_leva')
  const modalRef = useRef(null)
  const frameRef = useRef(0)

  const refreshData = useCallback(async () => {
    try {
      const [subscriptionRows, catalogRows] = await Promise.all([
        loadSubscriptions(),
        loadPetshopServices(),
      ])
      setSubscriptions(subscriptionRows)
      setCatalogServices(catalogRows)
      return { subscriptionRows, catalogRows }
    } catch (error) {
      console.warn('Falha ao carregar prioridade de pacotes na agenda:', error)
      return { subscriptionRows: [], catalogRows: [] }
    }
  }, [loadPetshopServices, loadSubscriptions])

  const usage = useMemo(() => (
    activeSubscription ? buildCatalogUsageSummary(activeSubscription, catalogServices) : []
  ), [activeSubscription, catalogServices])
  const planName = activeSubscription?.subscription_plans?.name || 'Pacote ativo'
  const priorityEntries = useMemo(() => usage.filter((item) => (
    item.service_kind === 'catalog'
    && item.catalog_service
    && (item.catalog_service.group_type || item.group_type) === serviceGroup
  )), [serviceGroup, usage])
  const motoDogBalance = useMemo(() => usage.find((item) => item.service_type === 'motodog') || null, [usage])

  const resolveSubscription = useCallback((text, rows = subscriptions) => {
    const matched = matchActiveSubscriptionByText(rows, text)
    setActiveSubscription((current) => current?.id === matched?.id ? current : matched)
    return matched
  }, [subscriptions])

  const selectPackageService = useCallback((entry) => {
    const modal = modalRef.current
    const input = modal?.querySelector('input[aria-label="Buscar servico para adicionar"]')
    const listbox = modal?.querySelector('[role="listbox"][aria-label="Servicos encontrados"]')
    if (!input || !listbox) return

    setNativeInputValue(input, entry.label)
    window.setTimeout(() => {
      const target = [...listbox.querySelectorAll('button[role="option"]')]
        .find((button) => normalizePlanText(button.textContent).includes(normalizePlanText(entry.label)))
      target?.click()
    }, 80)
  }, [])

  const applyVisualPricing = useCallback((modal, currentUsage) => {
    restoreDecorations(modal)
    if (!activeSubscription) return

    const availableByLabel = new Map(currentUsage
      .filter((item) => item.service_kind === 'catalog' && item.catalog_service && item.remaining > 0)
      .map((item) => [normalizePlanText(item.label), item]))
    const catalogByLabel = new Map(catalogServices.map((service) => [normalizePlanText(service.name || service.label), service]))
    let previewTotal = 0

    selectedServiceRows(modal).forEach((row) => {
      const label = serviceRowLabel(row)
      const normalizedLabel = normalizePlanText(label)
      const metadata = serviceRowMetadata(row)
      const benefit = availableByLabel.get(normalizedLabel)
      const catalogService = catalogByLabel.get(normalizedLabel)
      previewTotal += benefit ? 0 : Number(catalogService?.default_price || catalogService?.price || 0)

      if (benefit && metadata) {
        metadata.dataset.yuisyncPackageOriginalText = metadata.textContent || ''
        metadata.textContent = `R$ 0,00 · Incluso no ${planName}`
      }
    })

    const totalLabel = findTextElement(modal, (text) => normalizePlanText(text) === 'valor total')
    const totalCard = totalLabel?.parentElement
    const totalValue = totalCard?.querySelector('strong')
    if (totalValue && selectedServiceRows(modal).length) {
      totalValue.dataset.yuisyncPackageOriginalText = totalValue.textContent || ''
      totalValue.textContent = money.format(previewTotal)
    }

    const transportSelect = modal.querySelector('select[aria-label="Transporte do pet"]')
    const transportOption = transportSelect?.querySelector('option[value="buscar_e_levar"]')
    if (transportOption && motoDogBalance?.remaining > 0) {
      transportOption.dataset.yuisyncPackageOriginalLabel = transportOption.textContent || 'MotoDog - buscar e levar'
      transportOption.textContent = `MotoDog - buscar e levar · incluso no ${planName} (${motoDogBalance.remaining} disponíveis)`
    }
  }, [activeSubscription, catalogServices, motoDogBalance?.remaining, planName])

  const syncDom = useCallback(async () => {
    frameRef.current = 0
    const modal = findAppointmentModal()
    if (!modal) {
      if (modalRef.current) restoreDecorations(modalRef.current)
      modalRef.current = null
      setActiveSubscription(null)
      setSummaryRoot(null)
      setPriorityRoot(null)
      setTransportRoot(null)
      return
    }

    if (modalRef.current !== modal) {
      modalRef.current = modal
      const fresh = await refreshData()
      const selectedClientButton = [...modal.querySelectorAll('button')]
        .find((button) => normalizePlanText(button.textContent).endsWith('alterar'))
      if (selectedClientButton) resolveSubscription(selectedClientButton.textContent, fresh.subscriptionRows)
    }

    setServiceGroup(currentServiceGroup(modal))
    const serviceLabel = [...modal.querySelectorAll('label')]
      .find((label) => normalizePlanText(label.textContent).startsWith('servicos '))
    const summary = serviceLabel?.parentElement
      ? ensurePortalRoot(serviceLabel.parentElement, 'data-yuisync-package-summary-root', 'append')
      : null
    setSummaryRoot((current) => current === summary ? current : summary)

    const listbox = modal.querySelector('[role="listbox"][aria-label="Servicos encontrados"]')
    const priority = listbox ? ensurePortalRoot(listbox, 'data-yuisync-package-priority-root', 'prepend') : null
    setPriorityRoot((current) => current === priority ? current : priority)

    const transportSelect = modal.querySelector('select[aria-label="Transporte do pet"]')
    setTransportMode(transportSelect?.value || 'cliente_leva')
    const transport = transportSelect?.parentElement
      ? ensurePortalRoot(transportSelect.parentElement, 'data-yuisync-package-transport-root', 'append')
      : null
    setTransportRoot((current) => current === transport ? current : transport)

    const selectedClientButton = [...modal.querySelectorAll('button')]
      .find((button) => normalizePlanText(button.textContent).endsWith('alterar'))
    if (selectedClientButton) resolveSubscription(selectedClientButton.textContent)
    applyVisualPricing(modal, usage)
  }, [applyVisualPricing, refreshData, resolveSubscription, usage])

  const scheduleSync = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = window.requestAnimationFrame(() => { void syncDom() })
  }, [syncDom])

  useEffect(() => {
    void refreshData()
    const observer = new MutationObserver(scheduleSync)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    const onClick = (event) => {
      const clientOption = event.target.closest?.('[role="listbox"][aria-label="Resultados de clientes"] [role="option"]')
      if (clientOption) window.setTimeout(() => resolveSubscription(clientOption.textContent), 0)
      const serviceOption = event.target.closest?.('[role="listbox"][aria-label="Servicos encontrados"] [role="option"]')
      if (serviceOption) window.setTimeout(scheduleSync, 0)
    }
    const onChange = (event) => {
      if (event.target?.matches?.('select[aria-label="Transporte do pet"]')) {
        setTransportMode(event.target.value)
        window.setTimeout(scheduleSync, 0)
      }
    }

    document.addEventListener('click', onClick, true)
    document.addEventListener('change', onChange, true)
    scheduleSync()
    return () => {
      observer.disconnect()
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('change', onChange, true)
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
      restoreDecorations(modalRef.current)
    }
  }, [refreshData, resolveSubscription, scheduleSync])

  return (
    <>
      {summaryRoot && activeSubscription && createPortal(
        <PackageSummary planName={planName} usage={usage}/>,
        summaryRoot,
      )}
      {priorityRoot && activeSubscription && createPortal(
        <PackagePriorityOptions planName={planName} entries={priorityEntries} onSelect={selectPackageService}/>,
        priorityRoot,
      )}
      {transportRoot && activeSubscription && createPortal(
        <MotoDogPackageNotice planName={planName} balance={motoDogBalance} selected={transportMode === 'buscar_e_levar'}/>,
        transportRoot,
      )}
    </>
  )
}
