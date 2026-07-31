import { useEffect, useState } from 'react'

import { useAuthCtx } from '../../../context/AuthContext'
import { useModuleCtx } from '../../../context/ModuleContext'
import { supabase } from '../../../lib/supabase'
import { applyTenantFilter, runWithTenantFallback } from '../../../lib/tenant'

export const PACKAGE_SCHEDULE_SAVED_EVENT = 'yuisync:subscription-schedule-saved'
const STORAGE_KEY = 'yuisync:package-first-appointment-at'

const normalize = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

function buildFirstAt(dateValue, timeValue) {
  if (!dateValue || !timeValue) return ''
  const value = new Date(`${dateValue}T${timeValue}:00`)
  return Number.isNaN(value.getTime()) ? '' : value.toISOString()
}

function preview(firstAt) {
  const first = new Date(firstAt || '')
  if (Number.isNaN(first.getTime())) return 'Selecione a data e o horario.'
  return Array.from({ length: 4 }, (_, index) => {
    const value = new Date(first)
    value.setDate(value.getDate() + index * 7)
    return value.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }).join(' · ')
}

function saleModal() {
  return [...document.querySelectorAll('.modal-overlay')].find((modal) => (
    normalize(modal.querySelector('h2')?.textContent).includes('vender pacote ao cliente')
  )) || null
}

function enhanceSaleModal() {
  const modal = saleModal()
  const dateInput = modal?.querySelector('input[type="date"]')
  if (!modal || !dateInput) return

  const dateBox = dateInput.closest('div')
  const dateLabel = dateBox?.querySelector('label')
  if (dateLabel) dateLabel.textContent = 'Primeiro agendamento'

  let timeBox = modal.querySelector('[data-yuisync-package-time]')
  if (!timeBox) {
    timeBox = document.createElement('div')
    timeBox.dataset.yuisyncPackageTime = 'true'
    timeBox.innerHTML = `
      <label class="inp-label">Horario fixo semanal</label>
      <input class="inp" type="time" aria-label="Horario fixo semanal do pacote" />
      <p class="mt-1 text-[10px] text-muted">A confirmacao do pagamento reservara quatro semanas consecutivas.</p>
      <p data-yuisync-package-preview class="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[11px] font-semibold text-amber-200"></p>
      <p data-yuisync-package-error class="mt-2 hidden text-xs text-red-400"></p>
    `
    dateBox?.insertAdjacentElement('afterend', timeBox)
  }

  const timeInput = timeBox.querySelector('input[type="time"]')
  const previewNode = timeBox.querySelector('[data-yuisync-package-preview]')
  const errorNode = timeBox.querySelector('[data-yuisync-package-error]')
  const submit = [...modal.querySelectorAll('button')].find((button) => (
    normalize(button.textContent).includes('continuar para pagamento')
  ))

  const sync = () => {
    const firstAt = buildFirstAt(dateInput.value, timeInput?.value)
    if (firstAt) window.sessionStorage.setItem(STORAGE_KEY, firstAt)
    else window.sessionStorage.removeItem(STORAGE_KEY)
    if (previewNode) previewNode.textContent = preview(firstAt)
    if (errorNode && firstAt) errorNode.classList.add('hidden')
  }

  if (dateInput.dataset.yuisyncPackageBound !== 'true') {
    dateInput.dataset.yuisyncPackageBound = 'true'
    dateInput.addEventListener('input', sync)
    dateInput.addEventListener('change', sync)
  }
  if (timeInput && timeInput.dataset.yuisyncPackageBound !== 'true') {
    timeInput.dataset.yuisyncPackageBound = 'true'
    timeInput.addEventListener('input', sync)
    timeInput.addEventListener('change', sync)
  }
  if (submit && submit.dataset.yuisyncPackageBound !== 'true') {
    submit.dataset.yuisyncPackageBound = 'true'
    submit.addEventListener('click', (event) => {
      const firstAt = buildFirstAt(dateInput.value, timeInput?.value)
      if (firstAt && new Date(firstAt).getTime() >= Date.now() - 300000) {
        window.sessionStorage.setItem(STORAGE_KEY, firstAt)
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (errorNode) {
        errorNode.textContent = firstAt
          ? 'O primeiro agendamento precisa estar no presente ou no futuro.'
          : 'Informe a primeira data e o horario fixo.'
        errorNode.classList.remove('hidden')
      }
      timeInput?.focus()
    }, true)
  }
  sync()
}

export function PackageRecurringScheduleEnhancer() {
  const { activeTenantId } = useAuthCtx()
  const { activeModuleId } = useModuleCtx()
  const moduleId = activeModuleId || 'petshop'
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        enhanceSaleModal()
      })
    }
    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    const saveSchedule = async (event) => {
      const subscriptionId = event?.detail?.subscriptionId
      const firstAt = window.sessionStorage.getItem(STORAGE_KEY)
      if (!subscriptionId || !firstAt || !activeTenantId) {
        setNotice('Nao foi possivel vincular a primeira data ao pacote.')
        return
      }

      const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        let query = supabase
          .from('client_subscriptions')
          .update({
            first_appointment_at: firstAt,
            recurring_appointments_created_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', subscriptionId)
          .eq('module_id', moduleId)
        query = applyTenantFilter(query, activeTenantId, includeTenant)
        return query.select('id,first_appointment_at').single()
      })

      if (response.error) {
        setNotice(response.error.message || 'Falha ao gravar a agenda do pacote.')
        return
      }

      window.sessionStorage.removeItem(STORAGE_KEY)
      window.dispatchEvent(new CustomEvent(PACKAGE_SCHEDULE_SAVED_EVENT, {
        detail: { subscriptionId, firstAppointmentAt: firstAt },
      }))
      setNotice(`Quatro reservas preparadas: ${preview(firstAt)}.`)
    }

    window.addEventListener('yuisync:subscription-pending-payment', saveSchedule)
    return () => window.removeEventListener('yuisync:subscription-pending-payment', saveSchedule)
  }, [activeTenantId, moduleId])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 6500)
    return () => window.clearTimeout(timer)
  }, [notice])

  return notice ? (
    <button
      type="button"
      onClick={() => setNotice('')}
      className="fixed right-5 top-5 z-[120] max-w-lg rounded-xl border border-amber-500/30 bg-surface px-4 py-3 text-left text-sm font-semibold text-text shadow-2xl"
    >
      {notice}
    </button>
  ) : null
}
