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
import { useClients } from '../../../shared/hooks/useClients'
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

function isActiveSubscription(subscription = {}) {
  const status = normalizeAppointmentUiText(subscription.status)
  return ['active', 'ativo', 'ativa'].includes(status)
    && subscription.subscription_plans?.active !== false
}

function findAppointmentModal() {
  return [...document.querySelectorAll('.modal-box')]
    .find((box) => box.querySelector('button[aria-label="Fechar agendamento"]')) || null
}

function selectedClientButton(modal) {
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

function setNativeInputValue(input, value) {
  if (!input) return
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function serviceOptionTitle(button) {
  return [...(button?.querySelectorAll?.('span') || [])]
    .find((span) => String(span.className || '').includes('font-bold'))
    ?.textContent?.trim() || button?.textContent?.trim() || ''
}

function clientText(client = {}) {
  return normalizeAppointmentUiText([
    client.owner_name,
    client.pet_name,
    client.phone,
    client.email,
    client.breed,
  ].filter(Boolean).join(' '))
}

function resolveClient(clients = [], visibleText = '') {
  const normalized = normalizeAppointmentUiText(visibleText)
  const digits = String(visibleText || '').replace(/\D/g, '')
  if (!normalized && !digits) return null

  return (clients || [])
    .map((client) => {
      const haystack = clientText(client)
      const owner = normalizeAppointmentUiText(client.owner_name)
      const pet = normalizeAppointmentUiText(client.pet_name)
      const phone = String(client.phone || '').replace(/\D/g, '')
      let score = 0
      if (phone && digits && (digits.includes(phone) || phone.includes(digits))) score += 100
      if (owner && normalized.includes(owner)) score += 70
      if (pet && normalized.includes(pet)) score += 55
      const ownerTerms = owner.split(' ').filter((term) => term.length > 1)
      const petTerms = pet.split(' ').filter((term) => term.length > 1)
      score += ownerTerms.filter((term) => normalized.includes(term)).length * 8
      score += petTerms.filter((term) => normalized.includes(term)).length * 10
      return { client, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.client || null
}

function activeSubscriptionForResolvedClient(subscriptions = [], clientId = '') {
  if (!clientId) return null
  return (subscriptions || [])
    .filter(isActiveSubscription)
    .filter((subscription) => String(subscription.client_id || subscription.client?.id || '') === String(clientId))
    .sort((left, right) => new Date(right.started_at || 0) - new Date(left.started_at || 0))[0] || null
}

function serviceGroup(service = {}) {
  return service.group_type || service.groupType || service.service_group || 'outro'
}

function compatibleLegacyServices(item, catalogServices = [], group = 'banho_tosa') {
  const benefit = normalizeAppointmentUiText(item.service_type || item.label)
  return (catalogServices || []).filter((service) => {
    if (service.active === false || serviceGroup(service) !== group) return false
    const text = normalizeAppointmentUiText([service.code, service.name, service.category, service.description].filter(Boolean).join(' '))
    if (benefit === 'banho') return text.includes('banho') && !text.includes('tosa')
    if (benefit === 'tosa') return text.includes('tosa') && !text.includes('banho')
    if (benefit === 'banho e tosa' || benefit === 'banho_e_tosa') return text.includes('banho') && text.includes('tosa')
    return benefit.split(' ').filter(Boolean).every((term) => text.includes(term))
  })
}

function buildLegacyEntries(usage = [], catalogServices = [], group = 'banho_tosa') {
  const entries = []
  usage
    .filter((item) => item.service_kind !== 'transport' && !item.catalog_service && Number(item.remaining || 0) > 0)
    .forEach((item) => {
      compatibleLegacyServices(item, catalogServices, group).forEach((service) => {
        entries.push({
          ...item,
          service_type: service.code,
          label: service.name,
          catalog_service: service,
          legacy_benefit_type: item.service_type,
          legacy: true,
        })
      })
    })
  return [...new Map(entries.map((entry) => [entry.service_type, entry])).values()]
}

export default function AgendaPackageReliablePanel() {
  const { clients, load: loadClients } = useClients()
  const { loadSubscriptions } = useCatalogPlans()
  const { loadPetshopServices } = usePetshopAdvanced()
  const [modalOpen, setModalOpen] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [subscriptions, setSubscriptions] = useState([])
  const [catalogServices, setCatalogServices] = useState([])
  const [visibleClientText, setVisibleClientText] = useState('')
  const [serviceGroupValue, setServiceGroupValue] = useState('banho_tosa')
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
        loadClients(),
      ])
      setSubscriptions((subscriptionRows || []).filter(isActiveSubscription))
      setCatalogServices(serviceRows || [])
    } catch (error) {
      console.warn('Falha ao carregar pacotes da Agenda:', error)
      setNotice('Não foi possível carregar os pacotes. Atualize a Agenda e tente novamente.')
    }
  }, [loadClients, loadPetshopServices, loadSubscriptions])

  const resolvedClient = useMemo(
    () => resolveClient(clients, visibleClientText),
    [clients, visibleClientText],
  )
  const exactSubscription = useMemo(
    () => activeSubscriptionForResolvedClient(subscriptions, resolvedClient?.id),
    [resolvedClient?.id, subscriptions],
  )
  const textSubscription = useMemo(
    () => matchActivePackageSubscription(subscriptions, visibleClientText),
    [subscriptions, visibleClientText],
  )
  const activeSubscription = useMemo(() => (
    subscriptions.find((subscription) => String(subscription.id) === String(manualSubscriptionId))
    || exactSubscription
    || textSubscription
    || null
  ), [exactSubscription, manualSubscriptionId, subscriptions, textSubscription])
  const usage = useMemo(
    () => activeSubscription ? buildCatalogUsageSummary(activeSubscription, catalogServices) : [],
    [activeSubscription, catalogServices],
  )
  const realEntries = useMemo(
    () => packageCatalogEntries(usage, serviceGroupValue),
    [serviceGroupValue, usage],
  )
  const legacyEntries = useMemo(
    () => buildLegacyEntries(usage, catalogServices, serviceGroupValue),
    [catalogServices, serviceGroupValue, usage],
  )
  const packageEntries = useMemo(() => (
    [...new Map([...realEntries, ...legacyEntries].map((entry) => [entry.service_type, entry])).values()]
  ), [legacyEntries, realEntries])
  const automaticEntries = useMemo(() => {
    const legacyByType = new Map()
    legacyEntries.forEach((entry) => {
      const key = entry.legacy_benefit_type
      legacyByType.set(key, [...(legacyByType.get(key) || []), entry])
    })
    const singleLegacyEntries = [...legacyByType.values()].filter((items) => items.length === 1).flat()
    return [...realEntries.filter((entry) => Number(entry.remaining || 0) > 0), ...singleLegacyEntries]
  }, [legacyEntries, realEntries])
  const tosaServices = useMemo(() => {
    const query = normalizeAppointmentUiText(serviceSearch)
    return (catalogServices || [])
      .filter((service) => service.active !== false && isTosaCatalogService(service))
      .filter((service) => !query || normalizeAppointmentUiText([service.name, service.code].join(' ')).includes(query))
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR'))
  }, [catalogServices, serviceSearch])
  const packageMatches = useMemo(() => subscriptions
    .filter((subscription) => subscriptionMatchesSearch(subscription, packageSearch))
    .slice(0, 20), [packageSearch, subscriptions])

  const syncModal = useCallback(() => {
    frameRef.current = 0
    const modal = findAppointmentModal()
    if (!modal) {
      modalRef.current = null
      setModalOpen(false)
      setVisibleClientText('')
      setManualSubscriptionId('')
      setNotice('')
      return
    }
    const firstOpen = modalRef.current !== modal
    modalRef.current = modal
    setModalOpen(true)
    setServiceGroupValue(currentServiceGroup(modal))
    setVisibleClientText(selectedClientButton(modal)?.textContent || '')
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

  const selectService = useCallback(async (label) => {
    const modal = modalRef.current || findAppointmentModal()
    const input = modal?.querySelector('input[aria-label="Buscar servico para adicionar"]')
    if (!input) throw new Error('O campo de serviços não foi encontrado no agendamento.')
    input.focus()
    setNativeInputValue(input, label)
    await wait(130)
    const listbox = modal.querySelector('[role="listbox"][aria-label="Servicos encontrados"]')
    const target = [...(listbox?.querySelectorAll?.('button[role="option"]') || [])]
      .find((button) => normalizeAppointmentUiText(serviceOptionTitle(button)) === normalizeAppointmentUiText(label))
    if (!target) throw new Error(`O serviço “${label}” não foi encontrado na Agenda.`)
    target.click()
    await wait(90)
    input.blur()
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  }, [])

  const chooseService = useCallback(async (label) => {
    setBusy(true)
    setNotice('')
    try {
      await selectService(label)
      setNotice(`${label} adicionado ao agendamento.`)
    } catch (error) {
      setNotice(error?.message || 'Não foi possível adicionar o serviço.')
    } finally {
      setBusy(false)
    }
  }, [selectService])

  const usePackage = useCallback(async () => {
    if (!automaticEntries.length) {
      setNotice('Este pacote legado possui mais de um serviço compatível. Escolha abaixo qual serviço será realizado.')
      return
    }
    setBusy(true)
    setNotice('')
    try {
      for (const entry of automaticEntries) await selectService(entry.label)
      setNotice(`${packageName(activeSubscription)} preenchido. O saldo será reservado ao salvar.`)
    } catch (error) {
      setNotice(error?.message || 'Não foi possível preencher o pacote.')
    } finally {
      setBusy(false)
    }
  }, [activeSubscription, automaticEntries, selectService])

  if (!modalOpen) return null

  return createPortal(
    <aside className="fixed bottom-4 right-4 z-[125] w-[min(430px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-emerald-400/30 bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border2)] bg-emerald-500/10 px-4 py-3">
        <button type="button" onClick={() => setExpanded((current) => !current)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <Crown size={16} className="shrink-0 text-emerald-300"/>
          <span className="min-w-0"><span className="block text-xs font-black uppercase tracking-widest text-emerald-300">Pacote e tosas</span><span className="block truncate text-xs text-muted">Vínculo por cliente e compatibilidade legada</span></span>
          {expanded ? <ChevronDown size={15} className="ml-auto text-muted"/> : <ChevronUp size={15} className="ml-auto text-muted"/>}
        </button>
        <button type="button" aria-label="Minimizar painel" onClick={() => setExpanded(false)} className="text-muted hover:text-text"><X size={16}/></button>
      </div>

      {expanded && (
        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
          {activeSubscription ? (
            <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">Pacote ativo · prioridade</p><p className="mt-1 font-black text-text">{packageName(activeSubscription)}</p><p className="mt-1 text-xs text-muted">{activeSubscription.client?.pet_name || activeSubscription.client?.owner_name} · {activeSubscription.client?.owner_name}</p></div>
                <span className="badge badge-green">Ativo</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {usage.map((item) => <span key={item.service_type} className={`badge ${item.remaining > 0 ? 'badge-blue' : 'badge-gray'}`}>{item.label}: {item.remaining}/{item.total}</span>)}
              </div>
              {legacyEntries.length > 0 && <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Plano legado reconhecido. Os serviços abaixo foram associados por compatibilidade e continuarão consumindo o benefício antigo.</p>}
              <button type="button" disabled={busy || !packageEntries.length} onClick={usePackage} className="btn btn-primary mt-3 w-full justify-center"><PackageCheck size={15}/> {busy ? 'Adicionando...' : `Usar ${packageName(activeSubscription)}`}</button>
              <div className="mt-3 space-y-2">
                {packageEntries.map((entry) => (
                  <button key={`${entry.legacy_benefit_type || 'real'}-${entry.service_type}`} type="button" disabled={busy || Number(entry.remaining || 0) <= 0} onClick={() => chooseService(entry.label)} className="flex w-full items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50">
                    <CheckCircle2 size={15} className="shrink-0 text-emerald-300"/>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-text">{entry.label}</span><span className="block text-xs text-muted">{entry.remaining} disponível(is) · R$ 0,00{entry.legacy ? ' · legado compatível' : ''}</span></span>
                  </button>
                ))}
                {!packageEntries.length && <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">O pacote foi localizado, mas nenhum serviço compatível desta aba foi encontrado.</p>}
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4">
              <p className="text-sm font-bold text-text">Pacote ativo não localizado</p>
              <p className="mt-1 text-xs text-muted">Cliente detectado: {resolvedClient ? `${resolvedClient.pet_name} · ${resolvedClient.owner_name}` : 'nenhum'}. Pesquise para selecionar manualmente.</p>
              <div className="relative mt-3"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"/><input className="inp pl-9" value={packageSearch} onChange={(event) => setPackageSearch(event.target.value)} placeholder="Tutor, pet, telefone ou pacote..."/></div>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-[var(--border2)]">
                {packageMatches.map((subscription) => <button key={subscription.id} type="button" onClick={() => setManualSubscriptionId(subscription.id)} className="w-full border-b border-[var(--border2)] px-3 py-2 text-left last:border-0 hover:bg-white/5"><span className="block text-sm font-bold text-text">{subscription.client?.pet_name || subscription.client?.owner_name}</span><span className="block text-xs text-muted">{subscription.client?.owner_name} · {packageName(subscription)}</span></button>)}
                {!packageMatches.length && <p className="px-3 py-4 text-center text-xs text-muted">Nenhum pacote ativo encontrado.</p>}
              </div>
            </section>
          )}

          {serviceGroupValue === 'banho_tosa' && (
            <section className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] p-4">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-violet-300"><Scissors size={13}/> Tosas cadastradas</p>
              <div className="relative mt-3"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"/><input className="inp pl-9" value={serviceSearch} onChange={(event) => setServiceSearch(event.target.value)} placeholder="Pesquisar qualquer tipo de tosa..."/></div>
              <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                {tosaServices.map((service) => <button key={service.code} type="button" disabled={busy} onClick={() => chooseService(service.name)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-violet-500/10"><Scissors size={14} className="shrink-0 text-violet-300"/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-text">{service.name}</span><span className="block text-xs text-muted">{fmtCurrency(service.default_price || 0)} · {service.default_duration_min || 60} min</span></span></button>)}
                {!tosaServices.length && <p className="px-3 py-3 text-xs text-muted">Nenhuma tosa ativa encontrada.</p>}
              </div>
            </section>
          )}

          {notice && <p className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"><AlertCircle size={14} className="mt-0.5 shrink-0"/>{notice}</p>}
        </div>
      )}
    </aside>,
    document.body,
  )
}
