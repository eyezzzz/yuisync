import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Bike, CheckCircle2, Crown, PackageCheck, Scissors } from 'lucide-react'

import { fmtCurrency } from '../../../lib/supabase'
import { useCatalogPlans } from '../hooks/useCatalogPlans'
import { usePetshopAdvanced } from '../hooks/usePetshopAdvanced'
import { buildCatalogUsageSummary } from '../lib/catalogPlanServices'
import {
  isTosaCatalogService,
  matchActivePackageSubscription,
  normalizeAppointmentUiText,
  packageCatalogEntries,
} from '../lib/appointmentPackageUi'

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

function findAppointmentModal() {
  return [...document.querySelectorAll('.modal-box')]
    .find((box) => box.querySelector('button[aria-label="Fechar agendamento"]')) || null
}

function setNativeInputValue(input, value) {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function selectedClientText(modal) {
  const button = [...(modal?.querySelectorAll?.('button') || [])]
    .find((item) => normalizeAppointmentUiText(item.textContent).endsWith('alterar'))
  return button?.textContent || ''
}

function modalServiceGroup(modal) {
  const label = [...(modal?.querySelectorAll?.('label') || [])]
    .find((item) => normalizeAppointmentUiText(item.textContent).startsWith('servicos '))
  return normalizeAppointmentUiText(label?.textContent).includes('veterin') ? 'veterinaria' : 'banho_tosa'
}

function ensurePanelRoot(modal) {
  const stack = modal?.querySelector('.modal-body > .space-y-6')
  if (!stack) return null
  let root = stack.querySelector(':scope > [data-yuisync-native-package-panel]')
  if (root) return root
  root = document.createElement('div')
  root.setAttribute('data-yuisync-native-package-panel', 'true')
  const clientSection = stack.firstElementChild
  if (clientSection) clientSection.insertAdjacentElement('afterend', root)
  else stack.prepend(root)
  return root
}

function serviceOptionTitle(button) {
  return [...button.querySelectorAll('span')]
    .find((span) => String(span.className || '').includes('font-bold'))?.textContent || button.textContent || ''
}

function PackagePanel({ subscription, usage, entries, tosaServices, busy, notice, onUsePackage, onSelectService }) {
  const planName = subscription?.subscription_plans?.name || 'Pacote ativo'
  const motodog = usage.find((item) => item.service_type === 'motodog')

  return (
    <div className="space-y-4">
      {subscription ? (
        <section className="rounded-2xl border border-emerald-400/35 bg-emerald-500/10 p-4 shadow-[0_12px_40px_rgba(16,185,129,0.10)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300"><Crown size={13}/> Pacote ativo · prioridade</p>
              <p className="mt-1 text-base font-black text-text">{planName}</p>
            </div>
            <span className="badge badge-green">Selecionar no pacote</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {usage.map((item) => <span key={item.service_type} className={`badge ${item.remaining > 0 ? 'badge-blue' : 'badge-gray'}`}>{item.label}: {item.remaining}/{item.total} disponíveis</span>)}
          </div>

          {entries.length ? (
            <>
              <button type="button" disabled={busy || !entries.some((entry) => entry.remaining > 0)} onClick={onUsePackage} className="btn btn-primary mt-3 w-full justify-center"><PackageCheck size={15}/> {busy ? 'Adicionando...' : `Usar ${planName}`}</button>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {entries.map((entry) => {
                  const available = entry.remaining > 0
                  return <button key={entry.service_type} type="button" disabled={!available || busy} onClick={() => onSelectService(entry.label)} className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left ${available ? 'border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/16' : 'cursor-not-allowed border-white/5 bg-white/[0.02] opacity-55'}`}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300"><CheckCircle2 size={15}/></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-text">{entry.label}</span><span className="block text-xs text-muted">{available ? `${entry.remaining} disponíveis · R$ 0,00` : 'Esgotado neste ciclo'}</span></span></button>
                })}
              </div>
            </>
          ) : (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"><AlertCircle size={14} className="mt-0.5 shrink-0"/> O pacote ainda usa itens legados. Edite o pacote e associe os serviços reais do catálogo.</p>
          )}

          {motodog && <p className="mt-3 flex items-center gap-2 text-xs text-sky-300"><Bike size={13}/> MotoDog é opcional e será usado somente ao selecionar “buscar e levar”.</p>}
          {notice && <p className="mt-2 text-xs text-amber-300">{notice}</p>}
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-[var(--border2)] bg-white/[0.02] px-4 py-3 text-sm text-muted">Cliente selecionado sem pacote ativo. Os serviços abaixo serão cobrados como avulsos.</section>
      )}

      {tosaServices.length > 0 && (
        <section className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-4">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-violet-300"><Scissors size={13}/> Tosas cadastradas</p>
            <p className="mt-1 text-xs text-muted">Todos os serviços de tosa do catálogo, sem limite de 12 itens.</p>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {tosaServices.map((service) => <button key={service.code} type="button" disabled={busy} onClick={() => onSelectService(service.name)} className="flex items-center gap-3 rounded-xl border border-violet-500/15 bg-white/[0.02] px-3 py-3 text-left hover:bg-violet-500/10"><Scissors size={14} className="shrink-0 text-violet-300"/><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-text">{service.name}</span><span className="block text-xs text-muted">{fmtCurrency(service.default_price || 0)} · {service.default_duration_min || 60} min</span></span></button>)}
          </div>
        </section>
      )}
    </div>
  )
}

export default function AgendaNativePackageControls() {
  const { loadSubscriptions } = useCatalogPlans()
  const { loadPetshopServices } = usePetshopAdvanced()
  const [subscriptions, setSubscriptions] = useState([])
  const [catalogServices, setCatalogServices] = useState([])
  const [activeSubscription, setActiveSubscription] = useState(null)
  const [root, setRoot] = useState(null)
  const [serviceGroup, setServiceGroup] = useState('banho_tosa')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const modalRef = useRef(null)
  const frameRef = useRef(0)

  const refreshData = useCallback(async () => {
    try {
      const [subscriptionRows, serviceRows] = await Promise.all([loadSubscriptions(), loadPetshopServices()])
      setSubscriptions(subscriptionRows || [])
      setCatalogServices(serviceRows || [])
    } catch (error) {
      console.warn('Falha ao carregar pacote e tosas:', error)
    }
  }, [loadPetshopServices, loadSubscriptions])

  const usage = useMemo(() => activeSubscription ? buildCatalogUsageSummary(activeSubscription, catalogServices) : [], [activeSubscription, catalogServices])
  const entries = useMemo(() => packageCatalogEntries(usage, serviceGroup), [serviceGroup, usage])
  const availableEntries = useMemo(() => entries.filter((entry) => entry.remaining > 0), [entries])
  const tosaServices = useMemo(() => serviceGroup === 'banho_tosa'
    ? catalogServices.filter((service) => service.active !== false && isTosaCatalogService(service)).sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR')).slice(0, 80)
    : [], [catalogServices, serviceGroup])

  const resolveSubscription = useCallback((text) => {
    const matched = matchActivePackageSubscription(subscriptions, text)
    setActiveSubscription(matched || null)
    return matched
  }, [subscriptions])

  const sync = useCallback(() => {
    frameRef.current = 0
    const modal = findAppointmentModal()
    modalRef.current = modal
    if (!modal) {
      setRoot(null)
      setActiveSubscription(null)
      return
    }
    setRoot((current) => {
      const next = ensurePanelRoot(modal)
      return current === next ? current : next
    })
    setServiceGroup(modalServiceGroup(modal))
    const text = selectedClientText(modal)
    if (text) resolveSubscription(text)
    else setActiveSubscription(null)
  }, [resolveSubscription])

  const scheduleSync = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = window.requestAnimationFrame(sync)
  }, [sync])

  const selectService = useCallback(async (label, { keepOpen = false } = {}) => {
    const modal = modalRef.current || findAppointmentModal()
    const input = modal?.querySelector('input[aria-label="Buscar servico para adicionar"]')
    if (!input) throw new Error('Campo de serviço não encontrado.')
    input.focus()
    setNativeInputValue(input, label)
    await wait(80)
    const listbox = modal.querySelector('[role="listbox"][aria-label="Servicos encontrados"]')
    const option = [...(listbox?.querySelectorAll?.('button[role="option"]') || [])]
      .find((button) => normalizeAppointmentUiText(serviceOptionTitle(button)) === normalizeAppointmentUiText(label))
    if (!option) throw new Error(`O serviço “${label}” não foi encontrado na Agenda.`)
    option.click()
    await wait(80)
    if (!keepOpen) {
      input.blur()
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    }
  }, [])

  const chooseService = useCallback(async (label) => {
    setBusy(true)
    setNotice('')
    try { await selectService(label) } catch (error) { setNotice(error?.message || 'Não foi possível adicionar o serviço.') } finally { setBusy(false) }
  }, [selectService])

  const usePackage = useCallback(async () => {
    setBusy(true)
    setNotice('')
    try {
      for (let index = 0; index < availableEntries.length; index += 1) {
        await selectService(availableEntries[index].label, { keepOpen: index < availableEntries.length - 1 })
      }
      setNotice('Serviços disponíveis do pacote adicionados ao agendamento.')
    } catch (error) {
      setNotice(error?.message || 'Não foi possível adicionar o pacote.')
    } finally {
      setBusy(false)
    }
  }, [availableEntries, selectService])

  useEffect(() => { void refreshData() }, [refreshData])

  useEffect(() => {
    const observer = new MutationObserver(scheduleSync)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    const onClick = (event) => {
      const clientOption = event.target.closest?.('[role="listbox"][aria-label="Resultados de clientes"] [role="option"]')
      if (clientOption) {
        const matched = matchActivePackageSubscription(subscriptions, clientOption.textContent)
        setActiveSubscription(matched || null)
      }
      window.setTimeout(scheduleSync, 0)
    }
    document.addEventListener('click', onClick, true)
    scheduleSync()
    return () => {
      observer.disconnect()
      document.removeEventListener('click', onClick, true)
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
    }
  }, [scheduleSync, subscriptions])

  return root ? createPortal(
    <PackagePanel
      subscription={activeSubscription}
      usage={usage}
      entries={entries}
      tosaServices={tosaServices}
      busy={busy}
      notice={notice}
      onUsePackage={() => void usePackage()}
      onSelectService={(label) => void chooseService(label)}
    />,
    root,
  ) : null
}
