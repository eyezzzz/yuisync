import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crown,
  PackageCheck,
  Scissors,
  Search,
  X,
} from 'lucide-react'

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
import { subscriptionMatchesSearch } from '../lib/subscriptionUsageAdmin'

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

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

function findSelectedClientButton(modal) {
  return [...(modal?.querySelectorAll?.('button') || [])]
    .find((button) => normalizeAppointmentUiText(button.textContent).endsWith('alterar')) || null
}

function currentServiceGroup(modal) {
  const label = [...(modal?.querySelectorAll?.('label') || [])]
    .find((item) => normalizeAppointmentUiText(item.textContent).startsWith('servicos '))
  return normalizeAppointmentUiText(label?.textContent).includes('veterin') ? 'veterinaria' : 'banho_tosa'
}

function packageName(subscription) {
  return subscription?.subscription_plans?.name || 'Pacote ativo'
}

function serviceOptionTitle(button) {
  return [...(button?.querySelectorAll?.('span') || [])]
    .find((span) => String(span.className || '').includes('font-bold'))
    ?.textContent?.trim() || button?.textContent?.trim() || ''
}

export default function AgendaPackageNativePanel() {
  const { loadSubscriptions } = useCatalogPlans()
  const { loadPetshopServices } = usePetshopAdvanced()
  const [modalOpen, setModalOpen] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [subscriptions, setSubscriptions] = useState([])
  const [catalogServices, setCatalogServices] = useState([])
  const [clientText, setClientText] = useState('')
  const [serviceGroup, setServiceGroup] = useState('banho_tosa')
  const [manualSubscriptionId, setManualSubscriptionId] = useState('')
  const [packageSearch, setPackageSearch] = useState('')
  const [serviceSearch, setServiceSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const modalRef = useRef(null)
  const frameRef = useRef(0)

  const refreshData = useCallback(async () => {
    try {
      const [subscriptionRows, serviceRows] = await Promise.all([
        loadSubscriptions(),
        loadPetshopServices(),
      ])
      setSubscriptions((subscriptionRows || []).filter((subscription) => (
        subscription.status === 'active' && subscription.subscription_plans?.active !== false
      )))
      setCatalogServices(serviceRows || [])
    } catch (error) {
      console.warn('Falha ao carregar pacotes e serviços da Agenda:', error)
      setNotice('Não foi possível carregar os pacotes e serviços. Use Atualizar e tente novamente.')
    }
  }, [loadPetshopServices, loadSubscriptions])

  const automaticSubscription = useMemo(
    () => matchActivePackageSubscription(subscriptions, clientText),
    [clientText, subscriptions],
  )
  const activeSubscription = useMemo(() => (
    subscriptions.find((subscription) => String(subscription.id) === String(manualSubscriptionId))
    || automaticSubscription
    || null
  ), [automaticSubscription, manualSubscriptionId, subscriptions])
  const usage = useMemo(
    () => activeSubscription ? buildCatalogUsageSummary(activeSubscription, catalogServices) : [],
    [activeSubscription, catalogServices],
  )
  const packageEntries = useMemo(
    () => packageCatalogEntries(usage, serviceGroup),
    [serviceGroup, usage],
  )
  const availablePackageEntries = useMemo(
    () => packageEntries.filter((entry) => Number(entry.remaining || 0) > 0),
    [packageEntries],
  )
  const tosaServices = useMemo(() => {
    const query = normalizeAppointmentUiText(serviceSearch)
    return catalogServices
      .filter((service) => service.active !== false && isTosaCatalogService(service))
      .filter((service) => !query || normalizeAppointmentUiText([service.name, service.code].join(' ')).includes(query))
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR'))
  }, [catalogServices, serviceSearch])
  const packageMatches = useMemo(() => subscriptions
    .filter((subscription) => subscriptionMatchesSearch(subscription, packageSearch))
    .slice(0, 12), [packageSearch, subscriptions])

  const syncModal = useCallback(() => {
    frameRef.current = 0
    const modal = findAppointmentModal()
    if (!modal) {
      modalRef.current = null
      setModalOpen(false)
      setClientText('')
      setManualSubscriptionId('')
      setNotice('')
      return
    }

    const firstOpen = modalRef.current !== modal
    modalRef.current = modal
    setModalOpen(true)
    setServiceGroup(currentServiceGroup(modal))
    const selectedClient = findSelectedClientButton(modal)
    setClientText(selectedClient?.textContent || '')
    if (firstOpen) {
      setExpanded(true)
      setManualSubscriptionId('')
      setPackageSearch('')
      setServiceSearch('')
      setNotice('')
      void refreshData()
    }
  }, [refreshData])

  const scheduleSync = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = window.requestAnimationFrame(syncModal)
  }, [syncModal])

  useEffect(() => {
    const observer = new MutationObserver(scheduleSync)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    scheduleSync()
    return () => {
      observer.disconnect()
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
    }
  }, [scheduleSync])

  const selectNativeService = useCallback(async (label) => {
    const modal = modalRef.current || findAppointmentModal()
    const input = modal?.querySelector('input[aria-label="Buscar servico para adicionar"]')
    if (!input) throw new Error('O campo de serviços não foi encontrado no agendamento.')

    input.focus()
    setNativeInputValue(input, label)
    await wait(120)
    const listbox = modal.querySelector('[role="listbox"][aria-label="Servicos encontrados"]')
    const target = [...(listbox?.querySelectorAll?.('button[role="option"]') || [])]
      .find((button) => normalizeAppointmentUiText(serviceOptionTitle(button)) === normalizeAppointmentUiText(label))
    if (!target) throw new Error(`O serviço “${label}” não foi encontrado. Verifique se ele está ativo e classificado como Banho/Tosa.`)
    target.click()
    await wait(80)
    input.blur()
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  }, [])

  const useWholePackage = useCallback(async () => {
    if (!availablePackageEntries.length) return
    setBusy(true)
    setNotice('')
    try {
      for (const entry of availablePackageEntries) {
        await selectNativeService(entry.label)
      }
      setNotice(`${packageName(activeSubscription)} preenchido no agendamento. A reserva ocorrerá ao salvar.`)
    } catch (error) {
      setNotice(error?.message || 'Não foi possível preencher o pacote.')
    } finally {
      setBusy(false)
    }
  }, [activeSubscription, availablePackageEntries, selectNativeService])

  const chooseService = useCallback(async (label) => {
    setBusy(true)
    setNotice('')
    try {
      await selectNativeService(label)
      setNotice(`${label} adicionado.`)
    } catch (error) {
      setNotice(error?.message || 'Não foi possível adicionar o serviço.')
    } finally {
      setBusy(false)
    }
  }, [selectNativeService])

  if (!modalOpen) return null

  return createPortal(
    <aside className="fixed bottom-4 right-4 z-[120] w-[min(420px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-emerald-400/30 bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border2)] bg-emerald-500/10 px-4 py-3">
        <button type="button" onClick={() => setExpanded((current) => !current)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <Crown size={16} className="shrink-0 text-emerald-300"/>
          <span className="min-w-0">
            <span className="block text-xs font-black uppercase tracking-widest text-emerald-300">Pacote e tosas</span>
            <span className="block truncate text-xs text-muted">Seleção prioritária do agendamento</span>
          </span>
          {expanded ? <ChevronDown size={15} className="ml-auto text-muted"/> : <ChevronUp size={15} className="ml-auto text-muted"/>}
        </button>
        <button type="button" aria-label="Minimizar painel" onClick={() => setExpanded(false)} className="text-muted hover:text-text"><X size={16}/></button>
      </div>

      {expanded && (
        <div className="max-h-[68vh] space-y-4 overflow-y-auto p-4">
          {activeSubscription ? (
            <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">Pacote ativo · prioridade</p>
                  <p className="mt-1 font-black text-text">{packageName(activeSubscription)}</p>
                  <p className="mt-1 text-xs text-muted">{activeSubscription.client?.pet_name || activeSubscription.client?.owner_name} · {activeSubscription.client?.owner_name}</p>
                </div>
                <span className="badge badge-green">Ativo</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {usage.map((item) => (
                  <span key={item.service_type} className={`badge ${item.remaining > 0 ? 'badge-blue' : 'badge-gray'}`}>{item.label}: {item.remaining}/{item.total}</span>
                ))}
              </div>

              {availablePackageEntries.length ? (
                <>
                  <button type="button" disabled={busy} onClick={useWholePackage} className="btn btn-primary mt-3 w-full justify-center"><PackageCheck size={15}/> {busy ? 'Adicionando...' : `Usar ${packageName(activeSubscription)}`}</button>
                  <div className="mt-3 space-y-2">
                    {packageEntries.map((entry) => (
                      <button
                        key={entry.service_type}
                        type="button"
                        disabled={busy || Number(entry.remaining || 0) <= 0}
                        onClick={() => chooseService(entry.label)}
                        className="flex w-full items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CheckCircle2 size={15} className="shrink-0 text-emerald-300"/>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-text">{entry.label}</span><span className="block text-xs text-muted">{entry.remaining > 0 ? `${entry.remaining} disponível(is) · R$ 0,00` : 'Esgotado neste ciclo'}</span></span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  <AlertCircle size={14} className="mt-0.5 shrink-0"/>
                  O pacote não possui serviço real disponível nesta aba. Edite o pacote e associe os itens do catálogo.
                </div>
              )}
            </section>
          ) : (
            <section className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4">
              <p className="text-sm font-bold text-text">Pacote ativo não localizado automaticamente</p>
              <p className="mt-1 text-xs text-muted">Selecione o cliente no agendamento ou pesquise abaixo para escolher manualmente.</p>
              <div className="relative mt-3">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"/>
                <input className="inp pl-9" value={packageSearch} onChange={(event) => setPackageSearch(event.target.value)} placeholder="Tutor, pet, telefone ou pacote..."/>
              </div>
              <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-[var(--border2)]">
                {packageMatches.map((subscription) => (
                  <button key={subscription.id} type="button" onClick={() => setManualSubscriptionId(subscription.id)} className="w-full border-b border-[var(--border2)] px-3 py-2 text-left last:border-0 hover:bg-white/5">
                    <span className="block text-sm font-bold text-text">{subscription.client?.pet_name || subscription.client?.owner_name}</span>
                    <span className="block text-xs text-muted">{subscription.client?.owner_name} · {packageName(subscription)}</span>
                  </button>
                ))}
                {!packageMatches.length && <p className="px-3 py-4 text-center text-xs text-muted">Nenhum pacote ativo encontrado.</p>}
              </div>
            </section>
          )}

          {serviceGroup === 'banho_tosa' && (
            <section className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-4">
              <div className="flex items-center gap-2"><Scissors size={15} className="text-violet-300"/><p className="text-sm font-black text-text">Tosas cadastradas</p></div>
              <p className="mt-1 text-xs text-muted">Todos os serviços de tosa ativos do catálogo aparecem aqui, sem limite de 12 itens.</p>
              <div className="relative mt-3">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"/>
                <input className="inp pl-9" value={serviceSearch} onChange={(event) => setServiceSearch(event.target.value)} placeholder="Pesquisar tipo de tosa..."/>
              </div>
              <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-[var(--border2)]">
                {tosaServices.map((service) => (
                  <button key={service.code} type="button" disabled={busy} onClick={() => chooseService(service.name)} className="flex w-full items-center gap-3 border-b border-[var(--border2)] px-3 py-2.5 text-left last:border-0 hover:bg-violet-500/10">
                    <Scissors size={14} className="shrink-0 text-violet-300"/>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-text">{service.name}</span><span className="block text-xs text-muted">{fmtCurrency(service.default_price || 0)} · {service.default_duration_min || 60} min</span></span>
                  </button>
                ))}
                {!tosaServices.length && <p className="px-3 py-4 text-center text-xs text-muted">Nenhuma tosa ativa foi classificada no catálogo.</p>}
              </div>
            </section>
          )}

          {notice && <p className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">{notice}</p>}
        </div>
      )}
    </aside>,
    document.body,
  )
}
