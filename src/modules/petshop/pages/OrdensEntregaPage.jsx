import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, MapPin, MessageSquare, RefreshCw, Truck, UserCheck } from 'lucide-react'
import { fmtCurrency } from '../../../lib/supabase'
import { SERVICE_ORDER_FLOW, usePetshopAdvanced } from '../hooks/usePetshopAdvanced'

const ALL_STATUS_STEPS = [
  { id: 'pendente', label: 'Pendente' },
  { id: 'separacao', label: 'Separacao' },
  { id: 'agendado', label: 'Agendado' },
  { id: 'em_rota', label: 'Em rota' },
  { id: 'concluida', label: 'Concluida' },
]

function OrderCard({ order, assignees, onAssign, onAdvance, setPage }) {
  const flow = SERVICE_ORDER_FLOW[order.order_type] || []
  const currentIndex = flow.findIndex((step) => step.id === order.status)
  const nextStep = flow[currentIndex + 1] || null
  const address = [order.delivery_address, order.delivery_neighborhood, order.delivery_city].filter(Boolean).join(' - ')

  return (
    <div className="bg-card border border-[var(--border)] rounded-2xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display font-bold text-lg text-text">{order.client.pet_name || order.sale?.customer_name || 'Pedido WhatsApp'}</p>
          <p className="text-xs text-muted">{order.client.owner_name || order.sale?.customer_name || 'Cliente'}</p>
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

      {address && (
        <div className="rounded-xl bg-white/5 border border-[var(--border)] px-4 py-3 text-sm text-text">
          <div className="flex items-start gap-2">
            <MapPin size={15} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <span>{address}</span>
          </div>
        </div>
      )}

      {order.notes && (
        <div className="rounded-xl bg-white/5 border border-[var(--border)] px-4 py-3 text-sm text-muted">
          {order.notes}
        </div>
      )}

      <div className="flex gap-2">
        {nextStep ? (
          <button onClick={() => onAdvance(order, nextStep.id)} className="btn btn-primary flex-1 justify-center">
            <Truck size={15} /> Avancar para {nextStep.label}
          </button>
        ) : (
          <div className="flex-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400 text-center">
            Ordem concluida
          </div>
        )}
        {setPage && (
          <button onClick={() => setPage('chat')} className="btn btn-secondary">
            <MessageSquare size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function OrdensEntregaPage({ setPage }) {
  const { loadOrderAssignees, loadServiceOrders, updateServiceOrder } = usePetshopAdvanced()
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
