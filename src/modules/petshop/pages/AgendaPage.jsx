import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Calendar, Plus, Search, ChevronLeft, ChevronRight,
  Clock, X, Check, AlertCircle, RefreshCw, Trash2, Edit2, Receipt,
  Scissors, Droplets, Stethoscope, Syringe, PawPrint, ClipboardList,
  CheckCircle, Zap, PartyPopper, XCircle, Play
} from 'lucide-react'
import { useAppointments } from '../../../shared/hooks/useAppointments'
import { useClients }         from '../../../shared/hooks/useClients'
import { useAuthCtx }      from '../../../context/AuthContext'
import { fmtCurrency, fmtTime, todayISO } from '../../../lib/supabase'

// ── Helpers ───────────────────────────────────────────────────────────────────
// ── Helpers ───────────────────────────────────────────────────────────────────
const SERVICES = [
  { value: 'banho',        label: 'Banho',          price: 60,  icon: Droplets     },
  { value: 'tosa',         label: 'Tosa',           price: 80,  icon: Scissors     },
  { value: 'banho_e_tosa', label: 'Banho & Tosa',   price: 120, icon: Scissors     },
  { value: 'veterinario',  label: 'Veterinário',    price: 150, icon: Stethoscope  },
  { value: 'consulta',     label: 'Consulta',       price: 120, icon: Stethoscope  },
  { value: 'vacina',       label: 'Vacina',         price: 90,  icon: Syringe      },
  { value: 'outro',        label: 'Outro',          price: 0,   icon: PawPrint     },
]
const STATUSES = [
  { value: 'agendado',      label: 'Agendado'      },
  { value: 'confirmado',    label: 'Confirmado'    },
  { value: 'em_andamento',  label: 'Em andamento'  },
  { value: 'concluido',     label: 'Concluído'     },
  { value: 'cancelado',     label: 'Cancelado'     },
  { value: 'no_show',       label: 'No-show'       },
]

const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }

const fmtInterval = (iso) => {
  if (!iso) return '—'
  const start = new Date(iso)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const f = (d) => d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
  return `${f(start)} - ${f(end)}`
}

const PT_WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const PT_MONTHS   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ── Modal de Recibo de Serviço ────────────────────────────────────────────────
function ReceiptModal({ appt, onClose, serviceLabel }) {
  const { storeSettings } = useAuthCtx()
  const p = appt.pets || {}

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    const date = new Date().toLocaleString('pt-BR')
    const addr = [
      storeSettings?.store_address,
      storeSettings?.store_neighborhood,
      storeSettings?.store_city
    ].filter(Boolean).join(' - ')

    const receiptHtml = `
      <html>
        <head>
          <style>
            body { font-family: 'Courier New', Courier, monospace; width: ${storeSettings?.printer_width === '58' ? '58mm' : '80mm'}; margin: 0 auto; padding: 10px; color: #000; }
            .center { text-align: center; }
            .hr { border-bottom: 1px dashed #000; margin: 10px 0; }
            .header { font-weight: bold; font-size: 1.1em; margin-bottom: 5px; text-transform: uppercase; }
            .info { font-size: 0.85em; margin-bottom: 3px; }
            .label { font-size: 0.75em; font-weight: bold; margin-top: 5px; color: #555; }
            .val { font-size: 0.9em; margin-bottom: 2px; }
            .total-row { display: flex; justify-content: space-between; font-weight: bold; margin-top: 10px; border-top: 1px solid #000; padding-top: 5px; }
            .footer { font-size: 0.8em; margin-top: 15px; color: #333; }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="header">${storeSettings?.store_name?.toUpperCase() || 'PETSHOP CRM'}</div>
            <div class="info">${addr || 'Endereço não configurado'}</div>
            <div class="info">WhatsApp: ${storeSettings?.store_phone || '(00) 00000-0000'}</div>
          </div>
          <div class="hr"></div>
          <div class="center" style="font-weight: bold; font-size: 0.9em; margin-bottom: 10px;">RECIBO DE SERVIÇO</div>
          
          <div class="label">PET / ESPÉCIE</div>
          <div class="val">${p.pet_name?.toUpperCase()} (${p.breed || p.species})</div>
          
          <div class="label">TUTOR / CONTATO</div>
          <div class="val">${p.owner_name?.toUpperCase()}</div>
          <div class="val">${p.phone}</div>
          
          <div class="label">SERVIÇO</div>
          <div class="val">${serviceLabel(appt.service_type).toUpperCase()}</div>

          ${p.owner_address ? `
            <div class="label">ENDEREÇO (MOTODOG)</div>
            <div class="val">${p.owner_address.toUpperCase()}</div>
            <div class="val">${p.owner_neighborhood?.toUpperCase() || ''}</div>
          ` : ''}

          <div class="label">NOTAS</div>
          <div class="val">${appt.notes || 'Nenhuma observação'}</div>

          <div class="total-row" style="font-size: 1.1em;">
            <span>TOTAL:</span>
            <span>${fmtCurrency(appt.price)}</span>
          </div>
          <div class="hr"></div>
          <div class="info center">Data: ${date}</div>
          <div class="footer center">Obrigado pela confiança! 🐾</div>
        </body>
      </html>
    `
    printWindow.document.write(receiptHtml)
    printWindow.document.close()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 500)
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-sm">
        <div className="modal-header">
           <h2 className="font-display font-bold text-xl text-text">Recibo de Serviço</h2>
           <button onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>

        <div className="modal-body text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4 shadow-inner">
            <Receipt size={32} className="text-emerald-500"/>
          </div>
          <p className="text-muted text-[11px] uppercase tracking-widest font-bold mb-6">Tutor, Pet e Transporte</p>

          <div className="bg-card border border-[var(--border)] rounded-2xl p-5 text-left space-y-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <p className="text-[9px] text-muted uppercase font-black tracking-widest opacity-60">Pet & Serviço</p>
                <p className="text-sm font-bold text-text underline decoration-primary/30 underline-offset-4">{p.pet_name} — {serviceLabel(appt.service_type)}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted uppercase font-black tracking-widest opacity-60">Tutor</p>
                <p className="text-xs font-bold text-text/90">{p.owner_name}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted uppercase font-black tracking-widest opacity-60">Contato</p>
                <p className="text-xs font-bold text-primary">{p.phone}</p>
              </div>
            </div>
            <div className="pt-4 border-t border-[var(--border2)] flex justify-between items-center">
              <span className="text-[10px] font-black text-muted uppercase tracking-widest">Valor do Serviço</span>
              <span className="text-xl font-display font-black text-emerald-400">{fmtCurrency(appt.price)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button onClick={handlePrint} className="btn btn-primary w-full justify-center gap-2 py-3 shadow-lg">
              <Receipt size={16}/> Gerar Impressão
            </button>
            <button onClick={onClose} className="btn btn-secondary w-full justify-center">Fechar Janela</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Modal de Agendamento ──────────────────────────────────────────────────────
function ApptModal({ appt, onClose, onCreate, onUpdate, pets }) {
  const isEdit = !!appt?.id
  const now = new Date()
  const defaultDate = isoDate(now)
  const defaultTime = `${String(now.getHours()+1).padStart(2,'0')}:00`

  const [form, setForm] = useState(isEdit ? {
    pet_id:       appt.pets?.id || '',
    service_type: appt.service_type,
    date:         appt.scheduled_at?.slice(0,10) || defaultDate,
    time:         appt.scheduled_at ? fmtTime(appt.scheduled_at).replace('h',':') : defaultTime,
    duration_min: appt.duration_min || 60,
    price:        appt.price || 0,
    status:       appt.status || 'agendado',
    notes:        appt.notes || '',
  } : {
    pet_id: '', service_type: 'banho', date: defaultDate, time: defaultTime,
    duration_min: 60, price: 60, status: 'agendado', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleServiceChange = (svc) => {
    const s = SERVICES.find(x => x.value === svc)
    set('service_type', svc)
    if (!isEdit && s) set('price', s.price)
  }

  async function handleSubmit() {
    if (!form.pet_id)       return setErr('Selecione um pet')
    if (!form.date)         return setErr('Informe a data')
    if (!form.time)         return setErr('Informe o horário')
    setSaving(true); setErr('')
    try {
      const scheduled_at = new Date(`${form.date}T${form.time}:00`).toISOString()
      const payload = {
        pet_id: form.pet_id, service_type: form.service_type,
        scheduled_at, duration_min: Number(form.duration_min),
        price: Number(form.price), status: form.status, notes: form.notes,
      }
      isEdit ? await onUpdate(appt.id, payload) : await onCreate(payload)
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-lg">
        <div className="modal-header">
          <h2 className="font-display font-bold text-xl text-text">
            {isEdit ? 'Editar Agendamento' : 'Novo Agendamento'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>

        <div className="modal-body">
          <div className="space-y-6">
            {/* Pet com Busca */}
            <div className="bg-card border border-[var(--border)] rounded-2xl p-5 space-y-4">
              <label className="inp-label flex items-center gap-2"><Plus size={14}/> Selecionar Paciente</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"/>
                  <input 
                     className="inp pl-9 py-2 text-xs" 
                     placeholder="Buscar por nome..."
                     onChange={(e) => set('pet_search', e.target.value)}
                  />
                </div>
                <select className="inp py-2 text-xs" value={form.pet_id} onChange={e => set('pet_id', e.target.value)}>
                  <option value="">Lista de Pets...</option>
                  {pets
                    .filter(p => {
                      const q = (form.pet_search || '').toLowerCase();
                      return p.pet_name.toLowerCase().includes(q) || p.owner_name.toLowerCase().includes(q);
                    })
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.pet_name} ({p.owner_name})
                      </option>
                    ))
                  }
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Serviço */}
              <div>
                <select className="inp" value={form.service_type} onChange={e => handleServiceChange(e.target.value)}>
                  {SERVICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="inp-label">Status da Visita</label>
                <select className="inp" value={form.status} onChange={e => set('status', e.target.value)}>
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              {/* Data / Hora */}
              <div className="grid grid-cols-2 gap-3 md:col-span-2 bg-surface/80 border border-[var(--border)] rounded-2xl p-5">
                <div>
                  <label className="inp-label">Data Reservada</label>
                  <input className="inp" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
                </div>
                <div>
                  <label className="inp-label">Início</label>
                  <input className="inp" type="time" value={form.time} onChange={e => set('time', e.target.value)} />
                </div>
              </div>

              {/* Duração / Valor */}
              <div>
                <label className="inp-label">Tempo Est. (min)</label>
                <input className="inp" type="number" min="15" step="15"
                  value={form.duration_min} onChange={e => set('duration_min', e.target.value)} />
              </div>
              <div>
                <label className="inp-label">Valor (R$)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-muted font-bold">R$</span>
                  <input className="inp pl-9" type="number" min="0" step="5"
                    value={form.price} onChange={e => set('price', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="inp-label">Instruções para o Profissional</label>
              <textarea className="inp h-24 resize-none p-4" placeholder="Ex: Tem alergia a tal produto, ou é agressivo..."
                value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>

            {err && (
              <p className="text-sm bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
                <AlertCircle size={14}/> {err}
              </p>
            )}
            
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">Descartar</button>
              <button onClick={handleSubmit} disabled={saving} className="btn btn-primary flex-1 justify-center shadow-lg">
                {saving ? 'Confirmando...' : isEdit ? '✓ Salvar Alterações' : '+ Confirmar Reserva'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Coluna de Status (Kanban) ──────────────────────────────────────────────────
function KanbanCard({ appt, serviceLabel, statusBadge, onEdit, onStatus, onReceipt }) {
  const sb = statusBadge(appt.status)
  return (
    <div className="bg-surface border border-[var(--border)] rounded-xl p-3.5 space-y-2.5 hover:border-amber-500/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-text text-sm">{appt.pets?.pet_name || '—'}</p>
          <p className="text-xs text-muted">{appt.pets?.owner_name}</p>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {appt.status === 'concluido' && (
            <button onClick={() => onReceipt(appt)} className="text-muted hover:text-emerald-400" title="Imprimir Recibo">
              <Receipt size={13}/>
            </button>
          )}
          <button onClick={() => onEdit(appt)} className="text-muted hover:text-amber-400">
            <Edit2 size={13}/>
          </button>
        </div>
      </div>
      <div className="flex items-start gap-2 text-xs text-muted">
        <Clock size={11} className="mt-0.5 flex-shrink-0"/>
        <div>
          <p className="text-amber-400 font-bold leading-none">{fmtInterval(appt.scheduled_at)}</p>
          <p className="mt-1 opacity-70 flex items-center gap-1">
             {(() => {
               const s = SERVICES.find(x => x.value === appt.service_type);
               const Icon = s?.icon || PawPrint;
               return <><Icon size={10}/> {s?.label || 'Serviço'}</>
             })()}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className={`badge ${sb.cls} text-[10px]`}>{sb.label}</span>
        <span className="text-xs font-semibold text-emerald-400">{fmtCurrency(appt.price)}</span>
      </div>
      {/* Quick status actions */}
      <div className="flex gap-1.5 pt-1">
        {appt.status === 'agendado' && (
          <button onClick={() => onStatus(appt.id, 'confirmado')}
            className="btn btn-success btn-sm flex-1 justify-center text-[10px] py-1">
            <Check size={10}/> Confirmar
          </button>
        )}
        {appt.status === 'confirmado' && (
          <button onClick={() => onStatus(appt.id, 'em_andamento')}
            className="btn btn-secondary btn-sm flex-1 justify-center text-[10px] py-1 gap-1">
            <Play size={10}/> Iniciar
          </button>
        )}
        {appt.status === 'em_andamento' && (
          <button onClick={() => onStatus(appt.id, 'concluido')}
            className="btn btn-success btn-sm flex-1 justify-center text-[10px] py-1">
            ✓ Concluir
          </button>
        )}
        {['agendado','confirmado'].includes(appt.status) && (
          <button onClick={() => onStatus(appt.id, 'cancelado')}
            className="btn btn-danger btn-sm justify-center text-[10px] py-1 px-2">
            <X size={10}/>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Página Principal ──────────────────────────────────────────────────────────
export default function AgendaPage() {
  const { appointments, loading, load, create, update, updateStatus, remove, serviceLabel, statusBadge, todayStats } =
    useAppointments()
  const { clients: pets, load: loadPets } = useClients()

  const [selectedDate, setSelectedDate] = useState(new Date())
  const [modal, setModal]           = useState(null)   // null | {} | {appt}
  const [receipt, setReceipt]       = useState(null) // appt to print
  const [view, setView]             = useState('list')  // 'list' | 'kanban'
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch]         = useState('')

  useEffect(() => {
    loadPets()
  }, [])

  useEffect(() => {
    load({ date: isoDate(selectedDate), status: filterStatus || undefined })
  }, [selectedDate, filterStatus])

  const stats = todayStats()

  const displayed = appointments.filter(a => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      a.pets?.pet_name?.toLowerCase().includes(q) ||
      a.pets?.owner_name?.toLowerCase().includes(q) ||
      a.service_type?.toLowerCase().includes(q)
    )
  })

  const isToday = isoDate(selectedDate) === todayISO()

  return (
    <div className="page animate-fade-up">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Calendar size={22} className="text-amber-400"/> Agenda
          </h1>
          <p className="page-sub">
            {selectedDate.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}
            {isToday && <span className="ml-2 badge badge-amber text-[10px]">Hoje</span>}
          </p>
        </div>
        <button onClick={() => setModal({})} className="btn btn-primary">
          <Plus size={16}/> Novo Agendamento
        </button>
      </div>

      {/* Stats do dia */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: 'Total',        value: stats.total,        cls: 'text-text'       },
          { label: 'Agendados',    value: stats.agendado,     cls: 'text-amber-400'  },
          { label: 'Confirmados',  value: stats.confirmado,   cls: 'text-amber-400'   },
          { label: 'Em andamento', value: stats.em_andamento, cls: 'text-violet-400' },
          { label: 'Concluídos',   value: stats.concluido,    cls: 'text-emerald-400'},
          { label: 'Cancelados',   value: stats.cancelado,    cls: 'text-red-400'    },
        ].map(s => (
          <div key={s.label} className="bg-card border border-[var(--border)] rounded-xl p-3 text-center">
            <p className={`font-display font-bold text-2xl ${s.cls}`}>{s.value}</p>
            <p className="text-xs text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Date Navigator */}
        <div className="flex items-center gap-1 bg-card border border-[var(--border)] rounded-xl p-1">
          <button onClick={() => setSelectedDate(d => addDays(d,-1))}
            className="btn btn-ghost btn-sm btn-icon">
            <ChevronLeft size={15}/>
          </button>
          <button onClick={() => setSelectedDate(new Date())}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              isToday ? 'text-amber-400 bg-amber-500/10' : 'text-muted hover:text-text'
            }`}>
            {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          </button>
          <button onClick={() => setSelectedDate(d => addDays(d,1))}
            className="btn btn-ghost btn-sm btn-icon">
            <ChevronRight size={15}/>
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"/>
          <input className="inp pl-9 py-2" placeholder="Buscar pet, tutor..."
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>

        {/* Status filter */}
        <select className="inp py-2 w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        {/* View toggle */}
        <div className="flex bg-card border border-[var(--border)] rounded-xl p-1">
          {[
            { id:'list',   label:'Lista'  },
            { id:'kanban', label:'Kanban' },
          ].map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                view === v.id ? 'bg-amber-500 text-gray-950' : 'text-muted hover:text-text'
              }`}>
              {v.label}
            </button>
          ))}
        </div>

        <button onClick={() => load({ date: isoDate(selectedDate) })}
          className="btn btn-ghost btn-sm btn-icon" title="Atualizar">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted text-sm">
          <RefreshCw size={16} className="animate-spin mr-2"/> Carregando...
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-card border border-[var(--border)] rounded-xl2">
          <Calendar size={40} className="text-muted/30"/>
          <div className="text-center">
            <p className="text-text font-semibold">Nenhum agendamento</p>
            <p className="text-muted text-sm mt-1">
              {filterStatus || search ? 'Tente remover os filtros' : 'Clique em "+ Novo Agendamento" para começar'}
            </p>
          </div>
          <button onClick={() => setModal({})} className="btn btn-primary">
            <Plus size={15}/> Novo Agendamento
          </button>
        </div>
      ) : view === 'list' ? (
        /* ── LIST VIEW ── */
        <div className="bg-card border border-[var(--border)] rounded-xl2 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>
                <th>Hora</th><th>Pet</th><th>Tutor</th><th>Serviço</th>
                <th>Status</th><th>Valor</th><th>Obs.</th><th></th>
              </tr></thead>
              <tbody>
                {displayed.map(a => {
                  const sb = statusBadge(a.status)
                  return (
                    <tr key={a.id}>
                      <td><span className="font-bold text-amber-400 font-display whitespace-nowrap">{fmtInterval(a.scheduled_at)}</span></td>
                      <td>
                        <p className="font-semibold text-text">{a.pets?.pet_name || '—'}</p>
                        <p className="text-xs text-muted">{a.pets?.breed || a.pets?.species}</p>
                      </td>
                      <td>
                        <p className="text-sm">{a.pets?.owner_name || '—'}</p>
                        <p className="text-xs text-muted">{a.pets?.phone}</p>
                      </td>
                      <td className="text-xs">{serviceLabel(a.service_type)}</td>
                      <td><span className={`badge ${sb.cls}`}>{sb.label}</span></td>
                      <td><span className="font-semibold text-emerald-400">{fmtCurrency(a.price)}</span></td>
                      <td><span className="text-xs text-muted truncate max-w-[120px] block">{a.notes || '—'}</span></td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setModal(a)} className="btn btn-ghost btn-sm btn-icon">
                            <Edit2 size={13}/>
                          </button>
                          {a.status === 'concluido' && (
                            <button onClick={() => setReceipt(a)}
                              className="btn btn-ghost btn-sm btn-icon text-emerald-400 border border-emerald-500/20" title="Imprimir Recibo">
                              <Receipt size={13}/>
                            </button>
                          )}
                          {['agendado','confirmado'].includes(a.status) && (
                            <button onClick={() => updateStatus(a.id, 'concluido')}
                              className="btn btn-success btn-sm btn-icon" title="Concluir">
                              <Check size={13}/>
                            </button>
                          )}
                          <button onClick={() => remove(a.id)}
                            className="btn btn-danger btn-sm btn-icon" title="Excluir">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── KANBAN VIEW ── */
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[
            { status:'agendado',     label:'Agendado',       cls:'text-amber-400',   icon: ClipboardList },
            { status:'confirmado',   label:'Confirmado',     cls:'text-amber-400',    icon: CheckCircle },
            { status:'em_andamento', label:'Em andamento',   cls:'text-violet-400',  icon: Zap },
            { status:'concluido',    label:'Concluído',      cls:'text-emerald-400', icon: CheckCircle },
            { status:'cancelado',    label:'Cancelado',      cls:'text-red-400',     icon: XCircle },
          ].map(col => {
            const colItems = displayed.filter(a => a.status === col.status)
            return (
              <div key={col.status} className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className={`flex items-center gap-1.5 text-xs font-bold ${col.cls}`}>
                    <col.icon size={13}/> {col.label}
                  </div>
                  <span className="text-xs text-muted bg-white/8 rounded-full px-2 py-0.5">{colItems.length}</span>
                </div>
                <div className="space-y-2.5 min-h-[100px]">
                  {colItems.map(a => (
                    <KanbanCard key={a.id} appt={a} serviceLabel={serviceLabel} statusBadge={statusBadge}
                      onEdit={(a) => setModal(a)} onStatus={updateStatus} onReceipt={setReceipt}/>
                  ))}
                  {colItems.length === 0 && (
                    <div className="border border-dashed border-[var(--border)] rounded-xl p-4 text-center">
                      <p className="text-xs text-muted/40">Vazio</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {modal !== null && (
        <ApptModal
          appt={modal?.id ? modal : null}
          pets={pets}
          onClose={() => setModal(null)}
          onCreate={create}
          onUpdate={update}
        />
      )}

      {receipt !== null && (
        <ReceiptModal 
          appt={receipt} 
          onClose={() => setReceipt(null)}
          serviceLabel={serviceLabel}
        />
      )}
    </div>
  )
}
