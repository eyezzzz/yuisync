import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PencilLine, Save, Search, ShieldAlert, X } from 'lucide-react'

import { useAuthCtx } from '../../../context/AuthContext'
import { useModuleCtx } from '../../../context/ModuleContext'
import { supabase } from '../../../lib/supabase'
import { applyTenantFilter, runWithTenantFallback } from '../../../lib/tenant'
import { useCatalogPlans } from '../hooks/useCatalogPlans'
import {
  buildEditableUsage,
  clampSubscriptionUsage,
  subscriptionMatchesSearch,
} from '../lib/subscriptionUsageAdmin'
import PlanosCatalogPage from './PlanosCatalogPage'

function normalize(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function decoratePendingPayments() {
  document.querySelectorAll('.page .badge').forEach((badge) => {
    if (normalize(badge.textContent) !== 'pending_payment') return
    badge.textContent = 'Aguardando pagamento'
    badge.classList.remove('badge-red', 'badge-gray', 'badge-green')
    badge.classList.add('badge-amber')
  })

  const subscriptionModal = [...document.querySelectorAll('.modal-box')]
    .find((modal) => modal.querySelector('button[aria-label="Fechar assinatura"]'))
  if (!subscriptionModal) return

  const submit = [...subscriptionModal.querySelectorAll('button')]
    .find((button) => normalize(button.textContent) === 'salvar assinatura')
  if (submit) submit.textContent = 'Continuar para pagamento'

  const title = subscriptionModal.querySelector('h2')
  if (title && normalize(title.textContent) === 'vincular pacote ao cliente') {
    title.textContent = 'Vender pacote ao cliente'
  }

  const statusLabel = [...subscriptionModal.querySelectorAll('label')]
    .find((label) => normalize(label.textContent) === 'status')
  const statusField = statusLabel?.parentElement
  if (statusField) statusField.style.display = 'none'

  if (!subscriptionModal.querySelector('[data-yuisync-payment-hint]')) {
    const body = subscriptionModal.querySelector('.modal-body')
    const hint = document.createElement('div')
    hint.setAttribute('data-yuisync-payment-hint', 'true')
    hint.className = 'rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200'
    hint.textContent = 'Ao continuar, o pacote ficará aguardando pagamento em Ordens / Banho & Tosa. Os benefícios só serão liberados após a confirmação no caixa.'
    body?.insertBefore(hint, body.firstChild)
  }
}

function findPlansPage() {
  return [...document.querySelectorAll('.page')].find((page) => (
    normalize(page.querySelector('h1')?.textContent).includes('planos de assinatura')
  )) || null
}

function findSubscribersSection(page) {
  const title = [...(page?.querySelectorAll('h2') || [])]
    .find((element) => normalize(element.textContent) === 'assinantes')
  if (!title) return null
  return title.closest('.overflow-hidden') || title.parentElement?.parentElement || null
}

function ensureElement(parent, selector, create) {
  let element = parent?.querySelector(selector)
  if (element || !parent) return element
  element = create()
  return element
}

function UsageEditModal({ subscription, onClose, onSave }) {
  const items = useMemo(() => buildEditableUsage(subscription), [subscription])
  const [values, setValues] = useState(() => Object.fromEntries(items.map((item) => [item.service_type, item.used])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setSaving(true)
    setError('')
    try {
      await onSave(subscription, values)
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Não foi possível salvar o consumo do pacote.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box max-w-xl">
        <div className="modal-header">
          <div>
            <h2 className="font-display text-xl font-bold text-text">Editar consumo do pacote</h2>
            <p className="mt-1 text-sm text-muted">
              {subscription.client?.pet_name || subscription.client?.owner_name} · {subscription.subscription_plans?.name || 'Pacote'}
            </p>
          </div>
          <button type="button" aria-label="Fechar edição de consumo" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>

        <div className="modal-body space-y-4">
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <p className="flex items-start gap-2"><ShieldAlert size={16} className="mt-0.5 shrink-0"/> O ajuste altera o saldo disponível imediatamente. Reduzir um consumo libera novamente unidades para novos agendamentos e não apaga o histórico dos atendimentos já concluídos.</p>
          </div>

          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.service_type} className="grid grid-cols-[minmax(0,1fr)_120px] items-end gap-3 rounded-xl border border-[var(--border2)] bg-surface/70 p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-text">{item.service_name}</p>
                  <p className="mt-1 text-xs text-muted">Limite contratado: {item.total} por ciclo</p>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted">Utilizados</label>
                  <input
                    className="inp"
                    type="number"
                    min="0"
                    max={item.total}
                    step="1"
                    value={values[item.service_type] ?? 0}
                    onChange={(event) => setValues((current) => ({ ...current, [item.service_type]: event.target.value }))}
                  />
                </div>
              </div>
            ))}
            {!items.length && <p className="rounded-xl border border-dashed border-[var(--border2)] p-6 text-center text-sm text-muted">Este pacote não possui benefícios editáveis.</p>}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1 justify-center">Cancelar</button>
            <button type="button" disabled={saving || !items.length} onClick={submit} className="btn btn-primary flex-1 justify-center">
              <Save size={15}/> {saving ? 'Salvando...' : 'Salvar consumo'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function PlanosPaymentIntegratedPage({ setPage }) {
  const { activeTenantId } = useAuthCtx()
  const { activeModuleId } = useModuleCtx()
  const { loadSubscriptions } = useCatalogPlans()
  const moduleId = activeModuleId || 'petshop'
  const frameRef = useRef(0)
  const rootsSignatureRef = useRef('')
  const [subscriptions, setSubscriptions] = useState([])
  const [search, setSearch] = useState('')
  const [searchRoot, setSearchRoot] = useState(null)
  const [actionRoots, setActionRoots] = useState([])
  const [editing, setEditing] = useState(null)
  const runScoped = useCallback(
    (runner) => runWithTenantFallback(activeTenantId, runner),
    [activeTenantId],
  )

  const reloadSubscriptions = useCallback(async () => {
    try {
      const rows = await loadSubscriptions()
      setSubscriptions(rows || [])
    } catch {
      setSubscriptions([])
    }
  }, [loadSubscriptions])

  const syncSubscriberControls = useCallback(() => {
    const page = findPlansPage()
    const section = findSubscribersSection(page)
    const table = section?.querySelector('table')
    if (!section || !table) {
      setSearchRoot(null)
      setActionRoots([])
      rootsSignatureRef.current = ''
      return
    }

    const header = section.firstElementChild
    const nextSearchRoot = ensureElement(section, ':scope > [data-yuisync-subscriber-search-root]', () => {
      const root = document.createElement('div')
      root.setAttribute('data-yuisync-subscriber-search-root', 'true')
      root.className = 'border-b border-[var(--border2)] px-5 py-3'
      header?.insertAdjacentElement('afterend', root)
      return root
    })
    setSearchRoot((current) => current === nextSearchRoot ? current : nextSearchRoot)

    const headRow = table.tHead?.rows?.[0]
    if (headRow && !headRow.querySelector('[data-yuisync-usage-actions-header]')) {
      const th = document.createElement('th')
      th.setAttribute('data-yuisync-usage-actions-header', 'true')
      th.textContent = 'Ações'
      headRow.appendChild(th)
    }

    const bodyRows = [...(table.tBodies?.[0]?.rows || [])]
    const roots = []
    bodyRows.forEach((row, index) => {
      const subscription = subscriptions[index]
      if (!subscription) {
        if (row.cells.length === 1) row.cells[0].colSpan = 6
        return
      }

      row.hidden = !subscriptionMatchesSearch(subscription, search)
      let cell = row.querySelector('td[data-yuisync-usage-action-cell]')
      if (!cell) {
        cell = document.createElement('td')
        cell.setAttribute('data-yuisync-usage-action-cell', 'true')
        const root = document.createElement('div')
        root.setAttribute('data-yuisync-usage-action-root', 'true')
        cell.appendChild(root)
        row.appendChild(cell)
      }
      const root = cell.querySelector('[data-yuisync-usage-action-root]')
      if (root) roots.push({ root, subscription })
    })

    const signature = roots.map(({ subscription }) => subscription.id).join('|')
    if (signature !== rootsSignatureRef.current) {
      rootsSignatureRef.current = signature
      setActionRoots(roots)
    }
  }, [search, subscriptions])

  const scheduleSync = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0
      decoratePendingPayments()
      syncSubscriberControls()
    })
  }, [syncSubscriberControls])

  useEffect(() => { void reloadSubscriptions() }, [reloadSubscriptions])
  useEffect(() => { scheduleSync() }, [scheduleSync, subscriptions, search])

  useEffect(() => {
    const observer = new MutationObserver(scheduleSync)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    scheduleSync()

    const handlePendingPayment = (event) => {
      const detail = event.detail || {}
      window.sessionStorage.setItem('yuisync:orders-tab', 'banho_tosa')
      if (detail.subscriptionId) window.sessionStorage.setItem('yuisync:subscription-focus', detail.subscriptionId)
      window.setTimeout(() => setPage?.('ordens'), 120)
    }

    window.addEventListener('yuisync:subscription-pending-payment', handlePendingPayment)
    return () => {
      observer.disconnect()
      window.removeEventListener('yuisync:subscription-pending-payment', handlePendingPayment)
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
    }
  }, [scheduleSync, setPage])

  async function saveUsage(subscription, requested) {
    if (!activeTenantId) throw new Error('Selecione uma empresa ativa antes de editar o consumo.')
    const servicesUsed = clampSubscriptionUsage(subscription, requested)
    const response = await runScoped(async (includeTenant) => {
      let query = supabase
        .from('client_subscriptions')
        .update({ services_used: servicesUsed, updated_at: new Date().toISOString() })
        .eq('id', subscription.id)
        .eq('module_id', moduleId)
      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return query.select('id,services_used').single()
    })
    if (response.error) throw response.error

    await reloadSubscriptions()
    const page = findPlansPage()
    const refresh = [...(page?.querySelectorAll('button') || [])]
      .find((button) => normalize(button.textContent) === 'atualizar')
    refresh?.click()
  }

  const visibleCount = subscriptions.filter((subscription) => subscriptionMatchesSearch(subscription, search)).length

  return (
    <>
      <PlanosCatalogPage />

      {searchRoot && createPortal(
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[260px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"/>
            <input
              className="inp pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por tutor, pet, telefone ou pacote..."
              aria-label="Pesquisar assinantes"
            />
          </label>
          <span className="text-xs font-semibold text-muted">{visibleCount} de {subscriptions.length} assinantes</span>
        </div>,
        searchRoot,
      )}

      {actionRoots.map(({ root, subscription }) => createPortal(
        <button
          key={subscription.id}
          type="button"
          onClick={() => setEditing(subscription)}
          disabled={!['active', 'paused'].includes(subscription.status)}
          title={['active', 'paused'].includes(subscription.status) ? 'Editar consumo do ciclo' : 'O consumo só pode ser editado após a ativação do pacote'}
          className="btn btn-secondary btn-sm whitespace-nowrap"
        >
          <PencilLine size={13}/> Editar consumo
        </button>,
        root,
      ))}

      {editing && <UsageEditModal subscription={editing} onClose={() => setEditing(null)} onSave={saveUsage}/>} 
    </>
  )
}
