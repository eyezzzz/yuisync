import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  Bike,
  CheckCircle2,
  Crown,
  PackageCheck,
  Scissors,
} from 'lucide-react'

import { useAuthCtx } from '../../../context/AuthContext'
import { useModuleCtx } from '../../../context/ModuleContext'
import { fmtCurrency, supabase } from '../../../lib/supabase'
import { printThermalReceipt } from '../../../lib/thermalPrint'
import { applyTenantFilter, runWithTenantFallback } from '../../../lib/tenant'
import { useCatalogPlans } from '../hooks/useCatalogPlans'
import { usePetshopAdvanced } from '../hooks/usePetshopAdvanced'
import { buildCatalogUsageSummary } from '../lib/catalogPlanServices'
import {
  appointmentServiceNames,
  isTosaCatalogService,
  matchActivePackageSubscription,
  normalizeAppointmentUiText,
  packageCatalogEntries,
} from '../lib/appointmentPackageUi'
import {
  appointmentPriceBreakdown,
  normalizeTransportOptions,
  transportFeeForMode,
} from './agendaOperationalCore'

const STABLE_AGENDA_STYLES = `
  .page .relative.w-full.rounded-lg.border.p-2.text-left.shadow-sm {
    border-color: rgba(110, 231, 183, 0.82) !important;
    background: linear-gradient(135deg, #047857 0%, #065f46 58%, #064e3b 100%) !important;
    color: #f0fdf4 !important;
    opacity: 1 !important;
    box-shadow: 0 10px 28px rgba(2, 44, 34, 0.34) !important;
  }

  .page .relative.w-full.rounded-lg.border.p-2.text-left.shadow-sm p,
  .page .relative.w-full.rounded-lg.border.p-2.text-left.shadow-sm span {
    color: #f0fdf4 !important;
  }

  .page .relative.w-full.rounded-lg.border.p-2.text-left.shadow-sm .text-muted {
    color: #d1fae5 !important;
  }

  .yuisync-resolved-card .yuisync-resolved-actions,
  .yuisync-resolved-card[data-yuisync-density='regular'] .yuisync-resolved-actions,
  .yuisync-resolved-card[data-yuisync-density='compact'] .yuisync-resolved-actions,
  .yuisync-resolved-card[data-yuisync-density='micro'] .yuisync-resolved-actions {
    right: 4px !important;
    top: 4px !important;
    gap: 3px !important;
  }

  .yuisync-resolved-card .yuisync-resolved-action,
  .yuisync-resolved-card[data-yuisync-density='regular'] .yuisync-resolved-action,
  .yuisync-resolved-card[data-yuisync-density='compact'] .yuisync-resolved-action,
  .yuisync-resolved-card[data-yuisync-density='micro'] .yuisync-resolved-action {
    width: 28px !important;
    height: 28px !important;
    min-width: 28px !important;
    min-height: 28px !important;
    flex: 0 0 28px !important;
    flex-basis: 28px !important;
    border-radius: 8px !important;
  }

  .yuisync-resolved-card > button.w-full.text-left,
  .yuisync-resolved-card[data-yuisync-density='regular'] > button.w-full.text-left,
  .yuisync-resolved-card[data-yuisync-density='compact'] > button.w-full.text-left,
  .yuisync-resolved-card[data-yuisync-density='micro'] > button.w-full.text-left {
    padding-right: 98px !important;
  }

  .yuisync-resolved-card > button.w-full.text-left > p.mt-1,
  .yuisync-resolved-card[data-yuisync-density='regular'] > button.w-full.text-left > p.mt-1,
  .yuisync-resolved-card[data-yuisync-density='compact'] > button.w-full.text-left > p.mt-1,
  .yuisync-resolved-card[data-yuisync-density='micro'] > button.w-full.text-left > p.mt-1 {
    display: block !important;
    margin-top: 3px !important;
    overflow: visible !important;
    text-overflow: clip !important;
    white-space: normal !important;
    font-size: 10px !important;
    line-height: 1.15 !important;
  }
`

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

function findTextElement(root, predicate) {
  return [...(root?.querySelectorAll?.('*') || [])]
    .find((element) => predicate(String(element.textContent || '').trim(), element)) || null
}

function ensurePortalRoot(parent, attribute, position = 'append') {
  if (!parent) return null
  let root = parent.querySelector(`:scope > [${attribute}]`)
  if (root) return root
  root = document.createElement('div')
  root.setAttribute(attribute, 'true')
  if (position === 'prepend') parent.insertBefore(root, parent.firstChild)
  else parent.appendChild(root)
  return root
}

function currentServiceGroup(modal) {
  const label = [...(modal?.querySelectorAll?.('label') || [])]
    .find((item) => normalizeAppointmentUiText(item.textContent).startsWith('servicos '))
  return normalizeAppointmentUiText(label?.textContent).includes('veterin') ? 'veterinaria' : 'banho_tosa'
}

function selectedClientButton(modal) {
  return [...(modal?.querySelectorAll?.('button') || [])]
    .find((button) => normalizeAppointmentUiText(button.textContent).endsWith('alterar')) || null
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

function restoreDecorations(modal) {
  if (!modal) return
  modal.querySelectorAll('[data-yuisync-package-original-text]').forEach((element) => {
    element.textContent = element.dataset.yuisyncPackageOriginalText || element.textContent
    delete element.dataset.yuisyncPackageOriginalText
  })
  const option = modal.querySelector('select[aria-label="Transporte do pet"] option[value="buscar_e_levar"]')
  if (option?.dataset.yuisyncPackageOriginalLabel) {
    option.textContent = option.dataset.yuisyncPackageOriginalLabel
    delete option.dataset.yuisyncPackageOriginalLabel
  }
}

function packagePlanName(subscription) {
  return subscription?.subscription_plans?.name || 'Pacote ativo'
}

function PackageSummary({ subscription, usage, entries, busy, notice, onUsePackage }) {
  const name = packagePlanName(subscription)
  const legacyOnly = entries.length === 0
  return (
    <div className="mb-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 shadow-[0_12px_40px_rgba(16,185,129,0.10)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300"><Crown size={13} /> Pacote ativo · prioridade</p>
          <p className="mt-1 text-base font-black text-text">{name}</p>
        </div>
        <span className="badge badge-green">Aplicacao automatica</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {usage.map((item) => (
          <span key={item.service_type} className={`badge ${item.remaining > 0 ? 'badge-blue' : 'badge-gray'}`}>
            {item.label}: {item.remaining}/{item.total} disponiveis
          </span>
        ))}
      </div>

      {legacyOnly ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>O pacote esta ativo, mas ainda usa beneficios genericos. Abra Planos e associe os servicos reais do catalogo para habilitar o preenchimento automatico.</span>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={onUsePackage} className="btn btn-primary mt-3 w-full justify-center">
          <PackageCheck size={15} /> {busy ? 'Adicionando servicos...' : `Usar ${name}`}
        </button>
      )}

      {notice && <p className="mt-2 text-xs text-amber-300">{notice}</p>}
    </div>
  )
}

function PriorityPicker({ subscription, entries, tosaServices, busy, onUsePackage, onSelectService }) {
  const name = packagePlanName(subscription)
  return (
    <div>
      {subscription && (
        <div className="border-b border-emerald-500/25 bg-emerald-500/[0.08] p-2">
          <div className="px-2 pb-2 pt-1">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300"><PackageCheck size={12} /> {name}</p>
            <p className="mt-1 text-[11px] text-muted">O pacote aparece primeiro e reserva os beneficios quando o agendamento for confirmado.</p>
          </div>
          {entries.length > 0 && (
            <button type="button" disabled={busy} onClick={onUsePackage} className="mb-2 flex w-full items-center gap-3 rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-3 py-3 text-left hover:bg-emerald-500/20">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300"><Crown size={15} /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-text">Usar {name}</span><span className="block text-xs text-muted">Preencher automaticamente os servicos disponiveis</span></span>
            </button>
          )}
          <div className="space-y-1">
            {entries.map((entry) => {
              const available = entry.remaining > 0
              return (
                <button
                  key={entry.service_type}
                  type="button"
                  disabled={!available || busy}
                  onClick={() => available && onSelectService(entry.label)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${available ? 'border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/16' : 'cursor-not-allowed border-white/5 bg-white/[0.02] opacity-55'}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300"><CheckCircle2 size={15} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-text">{entry.label}</span><span className="block text-xs text-muted">{available ? `${entry.remaining} de ${entry.total} disponiveis · R$ 0,00` : 'Esgotado neste ciclo'}</span></span>
                  {available && <span className="badge badge-green">Pacote</span>}
                </button>
              )
            })}
          </div>
          <p className="px-2 pb-1 pt-3 text-[10px] font-black uppercase tracking-[0.16em] text-muted">Servicos avulsos</p>
        </div>
      )}

      {tosaServices.length > 0 && (
        <div className="border-b border-violet-500/20 bg-violet-500/[0.05] p-2">
          <div className="px-2 pb-2 pt-1">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-violet-300"><Scissors size={12} /> Tosas cadastradas</p>
            <p className="mt-1 text-[11px] text-muted">Atalhos para todos os servicos de tosa do catalogo, sem o limite visual da lista.</p>
          </div>
          <div className="space-y-1">
            {tosaServices.map((service) => (
              <button key={service.code} type="button" disabled={busy} onClick={() => onSelectService(service.name)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-violet-500/10">
                <Scissors size={14} className="shrink-0 text-violet-300" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-text">{service.name}</span><span className="block text-xs text-muted">{fmtCurrency(service.default_price)} · {service.default_duration_min || 60} min</span></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MotoDogNotice({ subscription, balance, selected }) {
  if (!subscription || !balance) return null
  return (
    <div className={`mt-2 rounded-xl border px-3 py-2 text-xs ${selected && balance.remaining > 0 ? 'border-sky-400/35 bg-sky-500/12 text-sky-200' : 'border-sky-400/20 bg-sky-500/[0.06] text-muted'}`}>
      <p className="flex items-center gap-2 font-bold"><Bike size={13} /> MotoDog no {packagePlanName(subscription)}</p>
      <p className="mt-1">{balance.remaining} de {balance.total} disponiveis. O beneficio so e reservado em “buscar e levar”.</p>
    </div>
  )
}

function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]))
}

export default function AgendaBookingEnhancements() {
  const { activeTenantId, storeSettings } = useAuthCtx()
  const { activeModuleId } = useModuleCtx()
  const moduleId = activeModuleId || 'petshop'
  const { loadSubscriptions } = useCatalogPlans()
  const { loadPetshopServices } = usePetshopAdvanced()
  const [subscriptions, setSubscriptions] = useState([])
  const [catalogServices, setCatalogServices] = useState([])
  const [activeSubscription, setActiveSubscription] = useState(null)
  const [summaryRoot, setSummaryRoot] = useState(null)
  const [pickerRoot, setPickerRoot] = useState(null)
  const [transportRoot, setTransportRoot] = useState(null)
  const [serviceGroup, setServiceGroup] = useState('banho_tosa')
  const [transportMode, setTransportMode] = useState('cliente_leva')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const modalRef = useRef(null)
  const frameRef = useRef(0)
  const runScoped = useCallback((runner) => runWithTenantFallback(activeTenantId, runner), [activeTenantId])
  const transportOptions = useMemo(() => normalizeTransportOptions(storeSettings), [storeSettings])

  const refreshData = useCallback(async () => {
    try {
      const [subscriptionRows, serviceRows] = await Promise.all([
        loadSubscriptions(),
        loadPetshopServices(),
      ])
      setSubscriptions(subscriptionRows || [])
      setCatalogServices(serviceRows || [])
      return { subscriptionRows: subscriptionRows || [], serviceRows: serviceRows || [] }
    } catch (error) {
      console.warn('Falha ao carregar pacotes e servicos da agenda:', error)
      return { subscriptionRows: [], serviceRows: [] }
    }
  }, [loadPetshopServices, loadSubscriptions])

  const usage = useMemo(() => activeSubscription
    ? buildCatalogUsageSummary(activeSubscription, catalogServices)
    : [], [activeSubscription, catalogServices])
  const packageEntries = useMemo(() => packageCatalogEntries(usage, serviceGroup), [serviceGroup, usage])
  const availablePackageEntries = useMemo(() => packageEntries.filter((entry) => entry.remaining > 0), [packageEntries])
  const motoDogBalance = useMemo(() => usage.find((entry) => entry.service_type === 'motodog') || null, [usage])
  const tosaServices = useMemo(() => serviceGroup === 'banho_tosa'
    ? catalogServices.filter((service) => service.active !== false && isTosaCatalogService(service)).slice(0, 40)
    : [], [catalogServices, serviceGroup])

  const resolveSubscription = useCallback((text, rows = subscriptions) => {
    const matched = matchActivePackageSubscription(rows, text)
    setActiveSubscription((current) => current?.id === matched?.id ? current : matched)
    return matched
  }, [subscriptions])

  const selectNativeService = useCallback(async (label, { keepOpen = false } = {}) => {
    const modal = modalRef.current || findAppointmentModal()
    const input = modal?.querySelector('input[aria-label="Buscar servico para adicionar"]')
    if (!input) throw new Error('Campo de servico nao encontrado.')

    input.focus()
    setNativeInputValue(input, label)
    await wait(90)
    const listbox = modal.querySelector('[role="listbox"][aria-label="Servicos encontrados"]')
    const target = [...(listbox?.querySelectorAll?.('button[role="option"]') || [])]
      .find((button) => {
        const title = [...button.querySelectorAll('span')]
          .find((span) => String(span.className || '').includes('font-bold'))?.textContent || button.textContent
        return normalizeAppointmentUiText(title) === normalizeAppointmentUiText(label)
      })
    if (!target) throw new Error(`O servico “${label}” nao foi encontrado na Agenda.`)
    target.click()
    await wait(90)
    if (!keepOpen) {
      input.blur()
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    }
  }, [])

  const useWholePackage = useCallback(async () => {
    if (!availablePackageEntries.length) return
    setBusy(true)
    setNotice('')
    try {
      for (let index = 0; index < availablePackageEntries.length; index += 1) {
        await selectNativeService(availablePackageEntries[index].label, {
          keepOpen: index < availablePackageEntries.length - 1,
        })
      }
      setNotice(`${packagePlanName(activeSubscription)} preenchido no agendamento.`)
    } catch (error) {
      setNotice(error?.message || 'Nao foi possivel preencher todos os servicos do pacote.')
    } finally {
      setBusy(false)
    }
  }, [activeSubscription, availablePackageEntries, selectNativeService])

  const chooseSingleService = useCallback(async (label) => {
    setBusy(true)
    setNotice('')
    try {
      await selectNativeService(label)
    } catch (error) {
      setNotice(error?.message || 'Nao foi possivel adicionar o servico.')
    } finally {
      setBusy(false)
    }
  }, [selectNativeService])

  const applyVisualPricing = useCallback((modal) => {
    restoreDecorations(modal)
    if (!modal) return

    const availableByLabel = new Map(availablePackageEntries.map((entry) => [normalizeAppointmentUiText(entry.label), entry]))
    const serviceByLabel = new Map(catalogServices.map((service) => [normalizeAppointmentUiText(service.name), service]))
    let serviceTotal = 0

    selectedServiceRows(modal).forEach((row) => {
      const label = serviceRowLabel(row)
      const normalizedLabel = normalizeAppointmentUiText(label)
      const metadata = serviceRowMetadata(row)
      const benefit = activeSubscription ? availableByLabel.get(normalizedLabel) : null
      const catalog = serviceByLabel.get(normalizedLabel)
      serviceTotal += benefit ? 0 : Number(catalog?.default_price || 0)
      if (benefit && metadata) {
        metadata.dataset.yuisyncPackageOriginalText = metadata.textContent || ''
        metadata.textContent = `R$ 0,00 · Incluso no ${packagePlanName(activeSubscription)}`
      }
    })

    const transportSelect = modal.querySelector('select[aria-label="Transporte do pet"]')
    const mode = transportSelect?.value || 'cliente_leva'
    const packageTransport = activeSubscription && mode === 'buscar_e_levar' && Number(motoDogBalance?.remaining || 0) > 0
    const transportFee = packageTransport ? 0 : transportFeeForMode(transportOptions, mode)
    const total = serviceTotal + transportFee

    const totalLabel = findTextElement(modal, (text) => normalizeAppointmentUiText(text) === 'valor total')
    const totalCard = totalLabel?.parentElement
    const totalValue = totalCard?.querySelector('strong')
    if (totalValue) {
      totalValue.dataset.yuisyncPackageOriginalText = totalValue.textContent || ''
      totalValue.textContent = fmtCurrency(total)
    }

    const resolvedTotal = modal.querySelector('[data-yuisync-modal-total]')
    if (resolvedTotal) {
      resolvedTotal.innerHTML = `
        <div class="space-y-1 text-sm">
          <div class="flex items-center justify-between gap-3 text-muted"><span>Servico</span><strong class="text-text">${fmtCurrency(serviceTotal)}</strong></div>
          <div class="flex items-center justify-between gap-3 text-muted"><span>Transporte</span><strong class="text-text">${fmtCurrency(transportFee)}</strong></div>
          <div class="mt-2 flex items-center justify-between gap-3 border-t border-emerald-500/25 pt-2"><span class="font-black uppercase tracking-wider text-emerald-500">Total</span><strong class="text-xl text-emerald-500">${fmtCurrency(total)}</strong></div>
        </div>
      `
    }

    const option = transportSelect?.querySelector('option[value="buscar_e_levar"]')
    if (option && activeSubscription && Number(motoDogBalance?.remaining || 0) > 0) {
      option.dataset.yuisyncPackageOriginalLabel = option.textContent || 'MotoDog - buscar e levar'
      option.textContent = `MotoDog - buscar e levar · incluso no ${packagePlanName(activeSubscription)} (${motoDogBalance.remaining} disponiveis)`
    }
  }, [activeSubscription, availablePackageEntries, catalogServices, motoDogBalance, transportOptions])

  const syncDom = useCallback(() => {
    frameRef.current = 0
    const modal = findAppointmentModal()
    if (!modal) {
      restoreDecorations(modalRef.current)
      modalRef.current = null
      setActiveSubscription(null)
      setSummaryRoot(null)
      setPickerRoot(null)
      setTransportRoot(null)
      return
    }

    modalRef.current = modal
    setServiceGroup(currentServiceGroup(modal))

    const clientButton = selectedClientButton(modal)
    if (clientButton) resolveSubscription(clientButton.textContent)

    const serviceLabel = [...modal.querySelectorAll('label')]
      .find((label) => normalizeAppointmentUiText(label.textContent).startsWith('servicos '))
    const summary = serviceLabel?.parentElement
      ? ensurePortalRoot(serviceLabel.parentElement, 'data-yuisync-package-summary-root')
      : null
    setSummaryRoot((current) => current === summary ? current : summary)

    const listbox = modal.querySelector('[role="listbox"][aria-label="Servicos encontrados"]')
    const picker = listbox ? ensurePortalRoot(listbox, 'data-yuisync-package-picker-root', 'prepend') : null
    setPickerRoot((current) => current === picker ? current : picker)

    const transportSelect = modal.querySelector('select[aria-label="Transporte do pet"]')
    setTransportMode(transportSelect?.value || 'cliente_leva')
    const transport = transportSelect?.parentElement
      ? ensurePortalRoot(transportSelect.parentElement, 'data-yuisync-package-transport-root')
      : null
    setTransportRoot((current) => current === transport ? current : transport)

    applyVisualPricing(modal)
  }, [applyVisualPricing, resolveSubscription])

  const scheduleSync = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = window.requestAnimationFrame(syncDom)
  }, [syncDom])

  const fetchLatestAppointment = useCallback(async (appointmentId) => {
    const response = await runScoped(async (includeTenant) => {
      let query = supabase
        .from('appointments')
        .select('id,client_id,service_type,service_items,scheduled_at,duration_min,price,status,notes,responsible_staff_name,responsible_staff_key,transport_mode,transport_label,transport_address,transport_neighborhood,transport_city,transport_reference,clients(id,name,phone,email,details)')
        .eq('id', appointmentId)
        .eq('module_id', moduleId)
        .single()
      return applyTenantFilter(query, activeTenantId, includeTenant)
    })
    if (response.error) throw response.error
    return response.data
  }, [activeTenantId, moduleId, runScoped])

  const printLatestAppointment = useCallback(async (appointmentId) => {
    const appointment = await fetchLatestAppointment(appointmentId)
    const client = appointment.clients || {}
    const details = client.details || {}
    const petName = details.pet_name || 'Pet'
    const names = appointmentServiceNames(appointment)
    const responsible = appointment.responsible_staff_name || appointment.responsible_staff_key || 'Nao informado'
    const prices = appointmentPriceBreakdown(appointment, transportOptions)
    const date = new Date(appointment.scheduled_at || '')
    const intervalStart = Number.isNaN(date.getTime()) ? '-' : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const end = new Date(date.getTime() + Math.max(10, Number(appointment.duration_min || 60)) * 60000)
    const intervalEnd = Number.isNaN(end.getTime()) ? '-' : end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const printWindow = window.open('', '_blank')
    if (!printWindow) throw new Error('O navegador bloqueou a janela de impressao.')

    const html = `
      <html><head><meta charset="utf-8"/><title>Ficha de atendimento</title><style>
        @page { margin: 0; } * { box-sizing: border-box; } html, body { width: 80mm; margin: 0; padding: 0; color: #000; background: #fff; }
        body { font-family: Arial, Helvetica, sans-serif; padding: 3mm 0 3mm 2mm; }
        main { width: 64mm; max-width: 64mm; }
        h1 { margin: 0 0 3mm; border-bottom: 1px dashed #000; padding-bottom: 2mm; text-align: center; font-size: 13px; }
        .line { display: grid; grid-template-columns: 18mm minmax(0,1fr); gap: 1.5mm; padding: .8mm 0; font-size: 9px; line-height: 1.3; }
        .line b { font-size: 8px; text-transform: uppercase; } .line span { overflow-wrap: anywhere; font-weight: 700; }
        .notes { margin-top: 2mm; border: 1px solid #000; padding: 2mm; font-size: 9px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
        .total { margin-top: 2mm; border-top: 2px solid #000; padding-top: 1.5mm; display: flex; justify-content: space-between; font-size: 12px; font-weight: 900; }
      </style></head><body><main>
        <h1>FICHA DE ATENDIMENTO</h1>
        <div class="line"><b>Tutor</b><span>${escapeHtml(client.name || 'Nao informado')}</span></div>
        <div class="line"><b>Pet</b><span>${escapeHtml(petName)}</span></div>
        <div class="line"><b>Horario</b><span>${escapeHtml(`${intervalStart} - ${intervalEnd}`)}</span></div>
        <div class="line"><b>Servico</b><span>${escapeHtml(names.join(' + '))}</span></div>
        <div class="line"><b>Responsavel</b><span>${escapeHtml(responsible)}</span></div>
        <div class="line"><b>Transporte</b><span>${escapeHtml(appointment.transport_label || appointment.transport_mode || 'Cliente traz e busca')}</span></div>
        <div class="notes"><b>INSTRUCOES PARA O PROFISSIONAL</b><br/>${escapeHtml(appointment.notes || 'Nenhuma observacao')}</div>
        <div class="total"><span>TOTAL</span><span>${escapeHtml(fmtCurrency(prices.total))}</span></div>
      </main></body></html>
    `
    printWindow.document.write(html)
    printWindow.document.close()
    printThermalReceipt(printWindow)
  }, [fetchLatestAppointment, transportOptions])

  useEffect(() => {
    void refreshData()
    const observer = new MutationObserver(scheduleSync)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    const onClick = (event) => {
      const clientOption = event.target.closest?.('[role="listbox"][aria-label="Resultados de clientes"] [role="option"]')
      if (clientOption) window.setTimeout(() => resolveSubscription(clientOption.textContent), 0)

      const printAction = event.target.closest?.('[data-yuisync-action="print"]')
      if (printAction) {
        const card = printAction.closest('[data-yuisync-appointment-id]')
        const appointmentId = card?.dataset?.yuisyncAppointmentId
        if (appointmentId) {
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation?.()
          void printLatestAppointment(appointmentId).catch((error) => window.alert(error?.message || 'Nao foi possivel imprimir o agendamento atualizado.'))
        }
      }

      window.setTimeout(scheduleSync, 0)
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
  }, [printLatestAppointment, refreshData, resolveSubscription, scheduleSync])

  return (
    <>
      <style>{STABLE_AGENDA_STYLES}</style>
      {summaryRoot && activeSubscription && createPortal(
        <PackageSummary subscription={activeSubscription} usage={usage} entries={packageEntries} busy={busy} notice={notice} onUsePackage={() => void useWholePackage()} />,
        summaryRoot,
      )}
      {pickerRoot && createPortal(
        <PriorityPicker subscription={activeSubscription} entries={packageEntries} tosaServices={tosaServices} busy={busy} onUsePackage={() => void useWholePackage()} onSelectService={(label) => void chooseSingleService(label)} />,
        pickerRoot,
      )}
      {transportRoot && activeSubscription && createPortal(
        <MotoDogNotice subscription={activeSubscription} balance={motoDogBalance} selected={transportMode === 'buscar_e_levar'} />,
        transportRoot,
      )}
    </>
  )
}
