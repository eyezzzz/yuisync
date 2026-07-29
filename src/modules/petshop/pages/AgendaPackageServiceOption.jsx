import { useCallback, useEffect, useRef, useState } from 'react'

import { fmtCurrency } from '../../../lib/supabase'
import { useCatalogPlans } from '../hooks/useCatalogPlans'
import { usePetshopAdvanced } from '../hooks/usePetshopAdvanced'
import { buildCatalogUsageSummary } from '../lib/catalogPlanServices'
import {
  matchActivePackageSubscription,
  normalizeAppointmentUiText,
} from '../lib/appointmentPackageUi'

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function isActiveSubscription(subscription = {}) {
  const status = normalizeAppointmentUiText(subscription.status)
  return ['active', 'ativo', 'ativa'].includes(status)
    && subscription.subscription_plans?.active !== false
}

function findAppointmentModal() {
  return [...document.querySelectorAll('.modal-box')]
    .find((box) => box.querySelector('button[aria-label="Fechar agendamento"]')) || null
}

function selectedClientText(modal) {
  const clientLabel = [...(modal?.querySelectorAll?.('label') || [])]
    .find((label) => normalizeAppointmentUiText(label.textContent).startsWith('selecionar cliente'))
  const section = clientLabel?.parentElement
  const selectedButton = [...(section?.querySelectorAll?.('button') || [])]
    .find((button) => normalizeAppointmentUiText(button.textContent).includes('alterar'))
  return selectedButton?.textContent || ''
}

function currentServiceGroup(modal) {
  const label = [...(modal?.querySelectorAll?.('label') || [])]
    .find((item) => normalizeAppointmentUiText(item.textContent).startsWith('servicos '))
  return normalizeAppointmentUiText(label?.textContent).includes('veterin') ? 'veterinaria' : 'banho_tosa'
}

function serviceOptionTitle(button) {
  return [...(button?.querySelectorAll?.('span') || [])]
    .find((span) => String(span.className || '').includes('font-bold'))
    ?.textContent?.trim() || button?.textContent?.trim() || ''
}

function setNativeInputValue(input, value) {
  if (!input) return
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function serviceGroup(service = {}) {
  return service.group_type || service.groupType || service.service_group || 'outro'
}

function compatibleLegacyEntries(usage = [], catalogServices = []) {
  const entries = []
  usage
    .filter((item) => item.service_kind !== 'transport' && !item.catalog_service && Number(item.remaining || 0) > 0)
    .forEach((item) => {
      const benefit = normalizeAppointmentUiText(item.service_type || item.label)
      ;(catalogServices || []).forEach((service) => {
        if (service.active === false || serviceGroup(service) !== 'banho_tosa') return
        const text = normalizeAppointmentUiText([
          service.code,
          service.name,
          service.category,
          service.description,
        ].filter(Boolean).join(' '))

        const compatible = benefit === 'banho'
          ? text.includes('banho') && !text.includes('tosa')
          : benefit === 'tosa'
            ? text.includes('tosa') && !text.includes('banho')
            : benefit === 'banho e tosa' || benefit === 'banho_e_tosa'
              ? text.includes('banho') && text.includes('tosa')
              : benefit.split(' ').filter(Boolean).every((term) => text.includes(term))

        if (!compatible) return
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

function resolveActiveSubscription(subscriptions = [], visibleText = '') {
  const candidates = (subscriptions || [])
    .filter(isActiveSubscription)
    .map((subscription) => ({ ...subscription, status: 'active' }))
  return matchActivePackageSubscription(candidates, visibleText)
}

function packageName(subscription = {}) {
  return subscription.subscription_plans?.name || 'Pacote ativo'
}

async function selectNativeService(modal, label) {
  const input = modal?.querySelector('input[aria-label="Buscar servico para adicionar"]')
  if (!input) throw new Error('O campo de serviços não foi encontrado no agendamento.')

  input.focus()
  setNativeInputValue(input, label)
  await wait(140)

  const listbox = modal.querySelector('[role="listbox"][aria-label="Servicos encontrados"]')
  const target = [...(listbox?.querySelectorAll?.('button[role="option"]') || [])]
    .filter((button) => !button.closest('[data-yuisync-package-service-option]'))
    .find((button) => normalizeAppointmentUiText(serviceOptionTitle(button)) === normalizeAppointmentUiText(label))

  if (!target) throw new Error(`O serviço “${label}” não foi encontrado na Agenda.`)
  target.click()
  await wait(90)
}

function closeServicePicker(modal) {
  modal?.querySelector('input[aria-label="Buscar servico para adicionar"]')?.blur()
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
}

function packageMarkup({ subscription, usage, realEntries, legacyEntries, transport }) {
  const exactAvailable = realEntries.filter((entry) => Number(entry.remaining || 0) > 0)
  const legacyAvailable = legacyEntries.filter((entry) => Number(entry.remaining || 0) > 0)
  const automatic = exactAvailable.length > 0
    ? exactAvailable
    : legacyAvailable.length === 1
      ? legacyAvailable
      : []
  const benefits = usage.map((item) => `
    <span class="inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
      ${escapeHtml(item.label)}: ${Number(item.remaining || 0)}/${Number(item.total || 0)}
    </span>
  `).join('')

  const legacyOptions = exactAvailable.length === 0 && legacyAvailable.length > 1
    ? `
      <div class="mt-2 border-t border-emerald-400/15 pt-2">
        <p class="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">Escolha o serviço compatível do pacote legado</p>
        <div class="space-y-1">
          ${legacyAvailable.map((entry) => `
            <button type="button" data-yuisync-package-service="${escapeHtml(entry.label)}" class="flex w-full items-center justify-between gap-3 rounded-lg border border-emerald-400/15 bg-emerald-500/[0.06] px-3 py-2 text-left hover:bg-emerald-500/12">
              <span class="min-w-0">
                <span class="block truncate text-xs font-bold text-text">${escapeHtml(entry.label)}</span>
                <span class="block text-[10px] text-muted">${Number(entry.remaining || 0)} disponível(is) · R$ 0,00</span>
              </span>
              <span class="badge badge-green">Pacote</span>
            </button>
          `).join('')}
        </div>
      </div>
    `
    : ''

  return `
    <div class="sticky top-0 z-10 border-b border-emerald-400/25 bg-surface p-2" data-yuisync-package-service-option>
      <div class="rounded-xl border border-emerald-400/35 bg-emerald-500/10 p-3 shadow-lg">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-300">Pacote ativo · prioridade</p>
            <p class="mt-0.5 truncate text-sm font-black text-text">${escapeHtml(packageName(subscription))}</p>
            <p class="mt-0.5 text-[10px] text-muted">${escapeHtml(subscription.client?.pet_name || 'Pet')} · Tutor: ${escapeHtml(subscription.client?.owner_name || 'Cliente')}</p>
          </div>
          <span class="badge badge-green">Ativo</span>
        </div>
        <div class="mt-2 flex flex-wrap gap-1.5">${benefits}</div>
        ${transport ? `<p class="mt-2 text-[10px] font-semibold text-sky-300">MotoDog disponível: ${Number(transport.remaining || 0)}/${Number(transport.total || 0)} · selecione o transporte quando necessário.</p>` : ''}
        <button type="button" data-yuisync-use-active-package class="btn btn-primary mt-2 w-full justify-center py-2 text-xs" ${automatic.length ? '' : 'disabled'}>
          ${automatic.length ? `Usar ${escapeHtml(packageName(subscription))}` : 'Escolha um serviço do pacote abaixo'}
        </button>
        ${legacyOptions}
        <p data-yuisync-package-notice class="mt-2 hidden rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-[10px] font-semibold text-amber-200"></p>
      </div>
    </div>
  `
}

export default function AgendaPackageServiceOption() {
  const { loadSubscriptions } = useCatalogPlans()
  const { loadPetshopServices } = usePetshopAdvanced()
  const [subscriptions, setSubscriptions] = useState([])
  const [catalogServices, setCatalogServices] = useState([])
  const refreshFrame = useRef(0)

  const reload = useCallback(async () => {
    try {
      const [subscriptionRows, serviceRows] = await Promise.all([
        loadSubscriptions(),
        loadPetshopServices(),
      ])
      setSubscriptions(subscriptionRows || [])
      setCatalogServices(serviceRows || [])
    } catch (error) {
      console.warn('Falha ao carregar pacote ativo na seleção da Agenda:', error)
    }
  }, [loadPetshopServices, loadSubscriptions])

  useEffect(() => {
    void reload()
    const refresh = () => void reload()
    window.addEventListener('yuisync:subscription-pending-payment', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('yuisync:subscription-pending-payment', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [reload])

  useEffect(() => {
    const removeRoots = () => {
      document.querySelectorAll('[data-yuisync-package-service-option]').forEach((node) => node.remove())
    }

    const sync = () => {
      refreshFrame.current = 0
      const modal = findAppointmentModal()
      if (!modal || currentServiceGroup(modal) !== 'banho_tosa') {
        removeRoots()
        return
      }

      const listbox = modal.querySelector('[role="listbox"][aria-label="Servicos encontrados"]')
      if (!listbox) {
        removeRoots()
        return
      }

      const subscription = resolveActiveSubscription(subscriptions, selectedClientText(modal))
      if (!subscription) {
        removeRoots()
        return
      }

      const usage = buildCatalogUsageSummary(subscription, catalogServices)
      const realEntries = usage.filter((item) => (
        item.service_kind === 'catalog'
        && item.catalog_service
        && serviceGroup(item.catalog_service) === 'banho_tosa'
      ))
      const legacyEntries = compatibleLegacyEntries(usage, catalogServices)
      const transport = usage.find((item) => item.service_kind === 'transport' || item.service_type === 'motodog') || null
      const signature = JSON.stringify({
        id: subscription.id,
        usage: usage.map((item) => [item.service_type, item.remaining, item.total]),
        real: realEntries.map((item) => item.service_type),
        legacy: legacyEntries.map((item) => item.service_type),
      })

      let root = listbox.querySelector(':scope > [data-yuisync-package-service-option]')
      if (!root) {
        root = document.createElement('div')
        listbox.prepend(root)
      }
      root.setAttribute('data-yuisync-package-service-option', 'true')

      if (root.dataset.signature !== signature) {
        root.dataset.signature = signature
        root.innerHTML = packageMarkup({ subscription, usage, realEntries, legacyEntries, transport })
      }

      root.onclick = async (event) => {
        const usePackageButton = event.target.closest?.('[data-yuisync-use-active-package]')
        const serviceButton = event.target.closest?.('[data-yuisync-package-service]')
        if (!usePackageButton && !serviceButton) return
        event.preventDefault()
        event.stopPropagation()

        const notice = root.querySelector('[data-yuisync-package-notice]')
        const showNotice = (message, error = false) => {
          if (!notice) return
          notice.textContent = message
          notice.classList.remove('hidden', 'text-amber-200', 'text-emerald-200')
          notice.classList.add(error ? 'text-amber-200' : 'text-emerald-200')
        }

        const exactAvailable = realEntries.filter((entry) => Number(entry.remaining || 0) > 0)
        const legacyAvailable = legacyEntries.filter((entry) => Number(entry.remaining || 0) > 0)
        const entries = serviceButton
          ? [{ label: serviceButton.dataset.yuisyncPackageService }]
          : exactAvailable.length > 0
            ? exactAvailable
            : legacyAvailable.length === 1
              ? legacyAvailable
              : []

        if (!entries.length) {
          showNotice('Escolha abaixo qual serviço compatível será realizado.', true)
          return
        }

        root.querySelectorAll('button').forEach((button) => { button.disabled = true })
        showNotice('Adicionando os serviços do pacote...')
        try {
          for (const entry of entries) await selectNativeService(modal, entry.label)
          showNotice(`${packageName(subscription)} adicionado. O saldo será reservado ao salvar.`)
          await wait(120)
          closeServicePicker(modal)
        } catch (error) {
          showNotice(error?.message || 'Não foi possível adicionar o serviço do pacote.', true)
          root.querySelectorAll('button').forEach((button) => { button.disabled = false })
        }
      }
    }

    const schedule = () => {
      if (refreshFrame.current) return
      refreshFrame.current = window.requestAnimationFrame(sync)
    }

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    document.addEventListener('click', schedule, true)
    document.addEventListener('focusin', schedule, true)
    schedule()

    return () => {
      observer.disconnect()
      document.removeEventListener('click', schedule, true)
      document.removeEventListener('focusin', schedule, true)
      if (refreshFrame.current) window.cancelAnimationFrame(refreshFrame.current)
      removeRoots()
    }
  }, [catalogServices, subscriptions])

  return null
}
