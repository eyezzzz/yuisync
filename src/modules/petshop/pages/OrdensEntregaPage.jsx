import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, MapPin, MessageSquare, Package, Printer, RefreshCw, Truck, UserCheck } from 'lucide-react'
import { useAuthCtx } from '../../../context/AuthContext'
import { fmtCurrency } from '../../../lib/supabase'
import { SERVICE_ORDER_FLOW, usePetshopAdvanced } from '../hooks/usePetshopAdvanced'

const ALL_STATUS_STEPS = [
  { id: 'pendente', label: 'Pendente' },
  { id: 'separacao', label: 'Separacao' },
  { id: 'agendado', label: 'Agendado' },
  { id: 'em_rota', label: 'Em rota' },
  { id: 'concluida', label: 'Concluida' },
]

function orderAddress(order) {
  return [
    order.delivery_address || order.client?.owner_address,
    order.delivery_neighborhood || order.client?.owner_neighborhood,
    order.delivery_city || order.client?.owner_city,
  ].filter(Boolean).join(' - ')
}

function extractNoteValue(notes = '', label = '') {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = String(notes || '').match(new RegExp(`${escaped}:\\s*([^|]+)`, 'i'))
  return match?.[1]?.trim() || ''
}

function orderItems(order) {
  const saleItems = order.sale?.sale_items || []
  if (saleItems.length) {
    return saleItems.map((item) => ({
      name: item.products?.name || 'Produto sem vinculo',
      quantity: Number(item.quantity || 1),
      unitPrice: Number(item.unit_price || 0),
      subtotal: Number(item.subtotal || Number(item.quantity || 1) * Number(item.unit_price || 0)),
    }))
  }

  const notesItems = extractNoteValue(order.notes || order.sale?.notes, 'Itens')
  if (!notesItems) return []
  return notesItems.split(';').map((entry) => ({ raw: entry.trim() })).filter((entry) => entry.raw)
}

function sourceLabel(order) {
  if (order.sale?.source === 'whatsapp' || String(order.notes || '').toLowerCase().includes('petbot')) return 'PetBot WhatsApp'
  if (order.sale?.source === 'pdv') return 'PDV'
  return order.sale?.source || order.source || 'Operacional'
}

function orderSessionId(order) {
  return order.session_id || extractNoteValue(order.notes || order.sale?.notes, 'Sessao')
}

function orderOriginAddress(order) {
  return orderAddress(order) || extractNoteValue(order.notes || order.sale?.notes, 'Endereco')
}

function visibleOrderNotes(order) {
  return String(order.notes || order.sale?.notes || '')
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => !/^(origem|sessao|itens|endereco|taxa de entrega):/i.test(entry))
    .join(' | ')
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]))
}

function printOrderReceipt(order, storeSettings = {}, fallbackItems = []) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  const width = storeSettings?.printer_width === '58' ? '58mm' : '80mm'
  const storeAddress = [
    storeSettings?.store_address,
    storeSettings?.store_neighborhood,
    storeSettings?.store_city,
  ].filter(Boolean).join(' - ')
  const address = orderOriginAddress(order)
  const directItems = orderItems(order)
  const items = directItems.length ? directItems : fallbackItems
  const publicNotes = visibleOrderNotes(order)
  const createdAt = order.created_at ? new Date(order.created_at).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR')
  const total = Number(order.sale?.total_price || 0)
  const subtotal = Number(order.sale?.subtotal || 0)
  const discount = Number(order.sale?.discount || 0)
  const orderLabel = String(order.id || '').slice(0, 8)
  const saleLabel = String(order.sale_id || '').slice(0, 8) || '-'

  const html = `
    <html>
      <head>
        <title>Ordem ${escapeHtml(orderLabel)}</title>
        <style>
          @page { size: ${width} auto; margin: 0; }
          * { box-sizing: border-box; }
          body { width: ${width}; margin: 0 auto; padding: 10px; color: #000; font-family: "Courier New", Courier, monospace; font-size: 12px; }
          .center { text-align: center; }
          .header { font-size: 15px; font-weight: 700; text-transform: uppercase; }
          .muted { font-size: 10px; }
          .hr { border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
          .label { font-weight: 700; text-transform: uppercase; }
          .wrap { white-space: normal; word-break: break-word; }
          .item { margin: 5px 0; }
          .total { font-size: 15px; font-weight: 700; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="header">${escapeHtml(storeSettings?.store_name || 'PETSHOP')}</div>
          <div class="muted wrap">${escapeHtml(storeAddress || 'Endereco da loja nao configurado')}</div>
          <div class="muted">Tel: ${escapeHtml(storeSettings?.store_phone || '-')}</div>
        </div>
        <div class="hr"></div>
        <div class="center label">ORDEM DE ${escapeHtml(order.order_type === 'servico' ? 'SERVICO' : 'ENTREGA')}</div>
        <div class="row"><span>Ordem</span><span>#${escapeHtml(orderLabel)}</span></div>
        <div class="row"><span>Venda</span><span>#${escapeHtml(saleLabel)}</span></div>
        <div class="row"><span>Status</span><span>${escapeHtml(order.status || '-')}</span></div>
        <div class="row"><span>Data</span><span>${escapeHtml(createdAt)}</span></div>
        <div class="hr"></div>
        <div class="label">Cliente</div>
        <div class="wrap">${escapeHtml(order.client?.owner_name || order.sale?.customer_name || 'Cliente')}</div>
        <div>Contato: ${escapeHtml(order.contact_phone || order.client?.phone || '-')}</div>
        ${address ? `<div class="hr"></div><div class="label">Endereco</div><div class="wrap">${escapeHtml(address)}</div>` : ''}
        <div class="hr"></div>
        <div class="label">Itens</div>
        ${items.length ? items.map((item) => item.raw ? `
          <div class="item wrap">${escapeHtml(item.raw)}</div>
        ` : `
          <div class="item">
            <div class="wrap">${escapeHtml(`${item.quantity}x ${item.name}`)}</div>
            <div class="row"><span>${fmtCurrency(item.unitPrice)} un.</span><span>${fmtCurrency(item.subtotal)}</span></div>
          </div>
        `).join('') : '<div class="wrap">Sem itens vinculados nesta ordem.</div>'}
        <div class="hr"></div>
        ${subtotal > 0 ? `<div class="row"><span>Subtotal</span><span>${fmtCurrency(subtotal)}</span></div>` : ''}
        ${discount > 0 ? `<div class="row"><span>Desconto</span><span>-${fmtCurrency(discount)}</span></div>` : ''}
        <div class="row total"><span>Total</span><span>${fmtCurrency(total)}</span></div>
        <div class="row"><span>Pagamento</span><span>${escapeHtml(order.sale?.payment_method || '-')}</span></div>
        <div class="hr"></div>
        <div class="muted wrap">Origem: ${escapeHtml(address || sourceLabel(order))}</div>
        ${publicNotes ? `<div class="muted wrap">${escapeHtml(publicNotes)}</div>` : ''}
      </body>
    </html>
  `

  printWindow.document.write(html)
  printWindow.document.close()
  setTimeout(() => {
    printWindow.print()
    printWindow.close()
  }, 350)
}

function OrderCard({ order, assignees, onAssign, onAdvance, onPrint, fallbackItems = [], setPage }) {
  const flow = SERVICE_ORDER_FLOW[order.order_type] || []
  const currentIndex = flow.findIndex((step) => step.id === order.status)
  const nextStep = flow[currentIndex + 1] || null
  const address = orderAddress(order)
  const directItems = orderItems(order)
  const items = directItems.length ? directItems : fallbackItems
  const originAddress = address || orderOriginAddress(order)
  const publicNotes = visibleOrderNotes(order)
  const ownerName = order.client?.owner_name || order.sale?.customer_name || 'Cliente'
  const petName = order.client?.pet_name && order.client.pet_name !== ownerName ? order.client.pet_name : ''
  const subtitle = petName ? `Pet: ${petName}` : sourceLabel(order)

  return (
    <div className="bg-card border border-[var(--border)] rounded-2xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display font-bold text-lg text-text truncate">{ownerName}</p>
          <p className="text-xs text-muted truncate">{subtitle}</p>
        </div>
        <span className="badge badge-blue capitalize">{order.order_type}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted font-bold mb-1">Venda</p>
          <p className="text-text font-semibold">#{String(order.sale_id || '').slice(0, 8) || '-'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted font-bold mb-1">Total</p>
          <p className="text-emerald-400 font-semibold">{fmtCurrency(order.sale?.total_price || 0)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted font-bold mb-1">Contato</p>
          <p className="text-text">{order.contact_phone || order.client.phone || '-'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted font-bold mb-1">Criada em</p>
          <p className="text-text">{new Date(order.created_at).toLocaleString('pt-BR')}</p>
        </div>
      </div>

      <div className="rounded-xl bg-white/5 border border-[var(--border)] px-4 py-3 text-sm text-text">
        <p className="text-[10px] uppercase tracking-widest text-muted font-bold mb-2">Itens</p>
        {items.length ? (
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={`${order.id}-item-${index}`} className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <Package size={15} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span className="text-sm leading-snug line-clamp-2">
                    {item.raw || `${item.quantity}x ${item.name}`}
                  </span>
                </div>
                {!item.raw && (
                  <span className="text-xs font-semibold text-muted whitespace-nowrap">{fmtCurrency(item.subtotal)}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-amber-500">Sem itens vinculados nesta ordem.</p>
        )}
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted font-bold mb-2">Responsavel</p>
        <select
          className="inp"
          value={order.assigned_to || ''}
          onChange={(event) => onAssign(order, event.target.value)}
        >
          <option value="">Sem responsavel</option>
          {assignees.map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.full_name || profile.email}</option>
          ))}
        </select>
      </div>

      <div className="rounded-xl bg-white/5 border border-[var(--border)] px-4 py-3 text-sm text-text">
        <p className="text-[10px] uppercase tracking-widest text-muted font-bold mb-2">Origem</p>
        <div className="flex items-start gap-2">
          <MapPin size={15} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <span className="leading-snug">{originAddress || 'Endereco nao informado na ordem.'}</span>
        </div>
        <p className="text-[11px] text-muted mt-2">Canal: {sourceLabel(order)}</p>
      </div>

      {publicNotes && (
        <div className="rounded-xl bg-white/5 border border-[var(--border)] px-4 py-3 text-sm text-muted">
          {publicNotes}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_44px_44px] gap-2">
        {nextStep ? (
          <button
            onClick={() => onAdvance(order, nextStep.id)}
            className="btn btn-primary min-w-0 justify-center px-3 text-xs"
            title={`Avancar para ${nextStep.label}`}
          >
            <Truck size={15} className="flex-shrink-0" />
            <span className="truncate">Avancar para {nextStep.label}</span>
          </button>
        ) : (
          <div className="min-w-0 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-3 text-xs text-emerald-400 text-center truncate">
            Ordem concluida
          </div>
        )}
        <button
          onClick={() => onPrint(order, items)}
          className="btn btn-secondary btn-icon h-11 w-11 justify-center"
          title="Imprimir ordem 80mm"
          aria-label="Imprimir ordem 80mm"
        >
          <Printer size={15} />
        </button>
        {setPage && (
          <button onClick={() => setPage('chat')} className="btn btn-secondary btn-icon h-11 w-11 justify-center" title="Abrir chat" aria-label="Abrir chat">
            <MessageSquare size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function OrdensEntregaPage({ setPage }) {
  const { loadOrderAssignees, loadServiceOrders, updateServiceOrder } = usePetshopAdvanced()
  const { storeSettings } = useAuthCtx()
  const [orderType, setOrderType] = useState('entrega')
  const [orders, setOrders] = useState([])
  const [assignees, setAssignees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function reload(nextOrderType = orderType) {
    setLoading(true)
    setError('')
    try {
      const [orderRows, profileRows] = await Promise.all([
        loadServiceOrders({ orderType: nextOrderType || '' }),
        loadOrderAssignees(),
      ])
      setOrders(orderRows)
      setAssignees(profileRows)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload(orderType)
  }, [orderType])

  async function handleAssign(order, assignedTo) {
    try {
      await updateServiceOrder(order, { assigned_to: assignedTo || null })
      await reload(orderType)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAdvance(order, nextStatus) {
    try {
      await updateServiceOrder(order, { status: nextStatus })
      await reload(orderType)
    } catch (err) {
      setError(err.message)
    }
  }

  const itemsBySession = useMemo(() => {
    const map = new Map()
    orders.forEach((order) => {
      const sessionId = orderSessionId(order)
      const items = orderItems(order)
      if (sessionId && items.length && !map.has(sessionId)) {
        map.set(sessionId, items)
      }
    })
    return map
  }, [orders])

  function handlePrint(order, fallbackItems = []) {
    printOrderReceipt(order, storeSettings, fallbackItems)
  }

  const steps = orderType ? (SERVICE_ORDER_FLOW[orderType] || ALL_STATUS_STEPS) : ALL_STATUS_STEPS
  const pendingCount = orders.filter((order) => ['pendente', 'separacao', 'agendado'].includes(order.status)).length
  const routeCount = orders.filter((order) => order.status === 'em_rota').length
  const doneCount = orders.filter((order) => order.status === 'concluida').length
  const totalValue = useMemo(
    () => orders.reduce((sum, order) => sum + Number(order.sale?.total_price || 0), 0),
    [orders]
  )

  return (
    <div className="page animate-fade-up space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ClipboardList size={22} className="text-amber-400" />
            Ordens de Servico / Entrega
          </h1>
          <p className="page-sub">Fila operacional nascida das vendas por WhatsApp, com dono, rota e status.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => reload(orderType)} className="btn btn-secondary">
            <RefreshCw size={15} /> Atualizar
          </button>
          {setPage && (
            <button onClick={() => setPage('vendas')} className="btn btn-secondary">
              <Truck size={15} /> Ir para Vendas
            </button>
          )}
        </div>
      </div>

      <div className="flex bg-white/5 border border-white/5 rounded-xl p-1 w-fit">
        {[
          { id: 'entrega', label: 'Entregas' },
          { id: 'servico', label: 'Ordens de servico' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setOrderType(item.id)}
            className={`flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg transition-all ${
              orderType === item.id ? 'bg-primary text-gray-950 shadow-lg' : 'text-muted hover:text-text'
            }`}
            style={orderType === item.id ? { backgroundColor: 'var(--primary)' } : {}}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border border-[var(--border)] rounded-xl p-5">
          <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Na fila</p>
          <p className="font-display font-bold text-3xl text-text">{pendingCount}</p>
        </div>
        <div className="bg-card border border-[var(--border)] rounded-xl p-5">
          <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Em rota</p>
          <p className="font-display font-bold text-3xl text-sky-400">{routeCount}</p>
        </div>
        <div className="bg-card border border-[var(--border)] rounded-xl p-5">
          <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Concluidas</p>
          <p className="font-display font-bold text-3xl text-emerald-400">{doneCount}</p>
        </div>
        <div className="bg-card border border-[var(--border)] rounded-xl p-5">
          <p className="text-xs uppercase tracking-widest text-muted font-bold mb-2">Valor em ordens</p>
          <p className="font-display font-bold text-3xl text-amber-400">{fmtCurrency(totalValue)}</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="text-sm text-muted flex items-center gap-2">
          <RefreshCw size={15} className="animate-spin" /> Carregando ordens operacionais...
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {steps.map((step) => (
            <div key={step.id} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-text">{step.label}</p>
                  <p className="text-xs text-muted">
                    {(SERVICE_ORDER_FLOW[orderType] || []).find((item) => item.id === step.id)?.hint || 'Acompanhamento operacional'}
                  </p>
                </div>
                <span className="badge badge-gray">{orders.filter((order) => order.status === step.id).length}</span>
              </div>

              <div className="space-y-3">
                {orders
                  .filter((order) => order.status === step.id)
                  .map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      assignees={assignees}
                      onAssign={handleAssign}
                      onAdvance={handleAdvance}
                      onPrint={handlePrint}
                      fallbackItems={itemsBySession.get(orderSessionId(order)) || []}
                      setPage={setPage}
                    />
                  ))}

                {!orders.some((order) => order.status === step.id) && (
                  <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-muted text-sm">
                    <UserCheck size={20} className="mx-auto mb-2 opacity-50" />
                    Nada neste status agora.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
