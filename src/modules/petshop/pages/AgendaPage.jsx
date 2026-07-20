import { useDeferredValue, useMemo, useRef, useState, useEffect } from 'react'
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
import { printThermalReceipt } from '../../../lib/thermalPrint'
import { usePetshopAdvanced } from '../hooks/usePetshopAdvanced'
import {
  DEFAULT_PETSHOP_SERVICES,
  SERVICE_GROUPS,
  findService,
  getServiceGroupFromCode,
  serviceIcon,
  serviceLabel as lookupServiceLabel,
} from '../lib/petshopTeam'

// ── Helpers ───────────────────────────────────────────────────────────────────
// ── Helpers ───────────────────────────────────────────────────────────────────
const LEGACY_SERVICES = [
  { value: 'banho',        label: 'Banho',          price: 60,  icon: Droplets     },
  { value: 'tosa',         label: 'Tosa',           price: 80,  icon: Scissors     },
  { value: 'banho_e_tosa', label: 'Banho & Tosa',   price: 120, icon: Scissors     },
  { value: 'veterinario',  label: 'Veterinário',    price: 150, icon: Stethoscope  },
  { value: 'consulta',     label: 'Consulta',       price: 120, icon: Stethoscope  },
  { value: 'vacina',       label: 'Vacina',         price: 90,  icon: Syringe      },
  { value: 'outro',        label: 'Outro',          price: 0,   icon: PawPrint     },
]

const asAgendaServices = (services = DEFAULT_PETSHOP_SERVICES) =>
  (services?.length ? services : DEFAULT_PETSHOP_SERVICES).map((service) => ({
    value: service.code || service.value,
    label: service.name || service.label,
    price: Number(service.default_price ?? service.price ?? 0),
    duration: Number(service.default_duration_min ?? service.duration ?? 60),
    icon: serviceIcon(service),
    group_type: service.group_type || getServiceGroupFromCode(service.code || service.value),
    active: service.active !== false,
  }))

const SERVICES = asAgendaServices(DEFAULT_PETSHOP_SERVICES)

const AGENDA_TABS = [
  { id: 'banho_tosa', label: 'Banho/Tosa', icon: Scissors },
  { id: 'veterinaria', label: 'Veterinária', icon: Stethoscope },
]

const normalizeServiceType = (type = '') =>
  String(type || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const compactText = (value = '') => normalizeServiceType(value).trim()
const safeLower = (value = '') => compactText(value)
const serviceText = (service = {}) =>
  compactText(`${service.value || ''} ${service.label || ''} ${service.group_type || ''}`)

const isVeterinaryService = (service) => /vet|consulta|vacina|clinica|medico|exame|cirurg/.test(serviceText(service))
const isGroomingService = (service) => /banho|tosa|escov|higien|groom|perfume|hidrat/.test(serviceText(service))

const getAppointmentServiceGroup = (type = '', services = SERVICES) => {
  const matched = (services || SERVICES).find((service) => service.value === type)
  if (matched?.group_type) return matched.group_type
  const service = normalizeServiceType(type)
  if (/vet|consulta|vacina|clinica|medico/.test(service)) return 'veterinaria'
  return 'banho_tosa'
}

const serviceFitsAgendaGroup = (service, group, services = SERVICES) => {
  if (!service || service.active === false) return false
  if (service.value === 'outro') return group === 'outro'
  const declaredGroup = service.group_type || getAppointmentServiceGroup(service.value, services)
  const vet = isVeterinaryService(service)
  const grooming = isGroomingService(service)

  if (group === 'veterinaria') return !grooming && (declaredGroup === 'veterinaria' || vet)
  if (group === 'banho_tosa') return !vet && (declaredGroup === 'banho_tosa' || grooming)
  return declaredGroup === group
}

const fmtAppointmentInterval = (appt) => {
  if (!appt?.scheduled_at) return '-'
  const start = new Date(appt.scheduled_at)
  const duration = Math.max(15, Number(appt.duration_min || 60))
  const end = new Date(start.getTime() + duration * 60 * 1000)
  const f = (d) => d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
  return `${f(start)} - ${f(end)}`
}

const agendaCardTone = (status) => ({
  agendado: 'border-amber-400/35 bg-amber-500/12 text-amber-100',
  confirmado: 'border-blue-400/35 bg-blue-500/12 text-blue-100',
  em_andamento: 'border-violet-400/40 bg-violet-500/14 text-violet-100',
  concluido: 'border-emerald-400/35 bg-emerald-500/12 text-emerald-100',
  cancelado: 'border-red-400/25 bg-red-500/10 text-red-100 opacity-70',
  no_show: 'border-red-400/25 bg-red-500/10 text-red-100 opacity-70',
}[status] || 'border-white/12 bg-white/7 text-text')

const serviceOptionsForGroup = (group, services = SERVICES) =>
  (services || SERVICES).filter((service) => serviceFitsAgendaGroup(service, group, services))

const serviceLabelFallbackLegacy = (type = '') =>
  SERVICES.find((service) => service.value === type)?.label || String(type || 'Serviço')

const serviceLabelFallback = (type = '', services = SERVICES) =>
  (services || SERVICES).find((service) => service.value === type)?.label || serviceLabelFallbackLegacy(type)

const buildStatsForDate = (items, selectedDate) => {
  const day = isoDate(selectedDate)
  const list = items.filter((appt) => appt.scheduled_at?.startsWith(day))
  return {
    total: list.length,
    agendado: list.filter((appt) => appt.status === 'agendado').length,
    confirmado: list.filter((appt) => appt.status === 'confirmado').length,
    em_andamento: list.filter((appt) => appt.status === 'em_andamento').length,
    concluido: list.filter((appt) => appt.status === 'concluido').length,
    cancelado: list.filter((appt) => appt.status === 'cancelado').length,
  }
}

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
const startOfWeek = (d) => addDays(d, -((d.getDay() + 6) % 7))
const AGENDA_HOURS = Array.from({ length: 14 }, (_, i) => i + 7)
const localDateKey = (value) => value ? isoDate(new Date(value)) : ''
const localHour = (value) => value ? new Date(value).getHours() : -1

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
            @page { size: 32mm 140mm; margin: 0; }
            * { box-sizing: border-box; }
            html, body { width: 32mm; height: auto !important; min-height: 0 !important; margin: 0; padding: 0; overflow: visible; }
            body { font-family: 'Courier New', Courier, monospace; padding: 6px; color: #000; }
            .receipt { width: 100%; height: auto; min-height: 0; break-after: avoid-page; page-break-after: avoid; }
            @media print { html, body { height: auto !important; min-height: 0 !important; } body, .receipt { position: absolute !important; top: 0 !important; left: 0 !important; } }
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
        <body><main class="receipt">
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
        </main></body>
      </html>
    `
    printWindow.document.write(receiptHtml)
    printWindow.document.close()
    printThermalReceipt(printWindow)
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-sm">
        <div className="modal-header">
           <h2 className="font-display font-bold text-xl text-text">Recibo de Serviço</h2>
           <button type="button" aria-label="Fechar recibo" title="Fechar" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
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
function ApptModal({ appt, onClose, onCreate, onUpdate, pets, services = SERVICES, staff = [], onSearchClients }) {
  const isEdit = !!appt?.id
  const now = new Date()
  const defaultDate = appt?.date || isoDate(now)
  const defaultTime = appt?.time || `${String(now.getHours()+1).padStart(2,'0')}:00`
  const serviceGroup = isEdit ? getAppointmentServiceGroup(appt?.service_type, services) : (appt?.serviceGroup || 'banho_tosa')
  const serviceOptions = serviceOptionsForGroup(serviceGroup, services)
  const fallbackService = SERVICES.find((service) => serviceFitsAgendaGroup(service, serviceGroup, SERVICES))
  const defaultService = serviceOptions[0] || fallbackService || SERVICES.find((service) => service.value === 'outro') || SERVICES[0]
  const serviceGroupLabel = serviceGroup === 'veterinaria' ? 'Atendimento veterinario' : 'Servico de banho/tosa'
  const staffOptions = (staff || []).filter((person) => {
    const staffType = person?.staff_type || 'funcionario'
    if (serviceGroup === 'veterinaria') return ['veterinaria', 'gerente', 'funcionario'].includes(staffType)
    if (serviceGroup === 'banho_tosa') return ['banho_tosa', 'gerente', 'funcionario'].includes(staffType)
    return ['gerente', 'funcionario'].includes(staffType)
  })

  const [form, setForm] = useState(isEdit ? {
    pet_id:       appt.pets?.id || '',
    pet_search:   '',
    service_type: appt.service_type,
    date:         appt.scheduled_at?.slice(0,10) || defaultDate,
    time:         appt.scheduled_at ? fmtTime(appt.scheduled_at).replace('h',':') : defaultTime,
    duration_min: appt.duration_min || 60,
    price:        appt.price || 0,
    status:       appt.status || 'agendado',
    notes:        appt.notes || '',
    groomer_id:    appt.groomer_id || '',
  } : {
    pet_id: '', pet_search: '', service_type: defaultService.value, date: defaultDate, time: defaultTime,
    duration_min: defaultService.duration || 60, price: defaultService.price, status: 'agendado', notes: '', groomer_id: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')
  const [clientPickerOpen, setClientPickerOpen] = useState(() => !form.pet_id)
  const [selectedClient, setSelectedClient] = useState(() => appt?.pets || null)
  const [remotePets, setRemotePets] = useState([])
  const [searchingClients, setSearchingClients] = useState(false)
  const clientPickerRef = useRef(null)
  const clientSearchRef = useRef(null)
  const searchRequestRef = useRef(0)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const petSearch = form.pet_search || ''
  const deferredPetSearch = useDeferredValue(petSearch)
  const searchablePets = useMemo(() => (pets || []).map((pet) => ({
    pet,
    searchText: safeLower([
      pet.pet_name,
      pet.owner_name,
      pet.phone,
      pet.email,
      pet.breed,
      pet.species,
    ].filter(Boolean).join(' ')),
  })), [pets])
  const localFilteredPets = useMemo(() => {
    const q = safeLower(deferredPetSearch)
    return searchablePets
      .filter(({ searchText }) => !q || searchText.includes(q))
      .map(({ pet }) => pet)
  }, [searchablePets, deferredPetSearch])
  const filteredPets = useMemo(() => {
    const unique = new Map()
    ;[...localFilteredPets, ...remotePets].forEach((pet) => unique.set(pet.id, pet))
    return [...unique.values()].slice(0, 8)
  }, [localFilteredPets, remotePets])
  const selectedPet = useMemo(() => (
    (selectedClient?.id === form.pet_id ? selectedClient : null)
    || (pets || []).find((pet) => pet.id === form.pet_id)
    || (appt?.pets?.id === form.pet_id ? appt.pets : null)
  ), [selectedClient, pets, form.pet_id, appt?.pets])

  useEffect(() => {
    const query = petSearch.trim()
    if (!onSearchClients || query.length < 2) {
      searchRequestRef.current += 1
      setRemotePets([])
      setSearchingClients(false)
      return undefined
    }

    const requestId = ++searchRequestRef.current
    const timer = setTimeout(async () => {
      setSearchingClients(true)
      try {
        const results = await onSearchClients(query, { limit: 20 })
        if (searchRequestRef.current === requestId) setRemotePets(results || [])
      } catch (searchError) {
        if (searchRequestRef.current === requestId) console.warn('Falha ao buscar clientes da agenda:', searchError)
      } finally {
        if (searchRequestRef.current === requestId) setSearchingClients(false)
      }
    }, 120)

    return () => clearTimeout(timer)
  }, [petSearch, onSearchClients])

  useEffect(() => {
    if (!clientPickerOpen) return undefined
    const closePicker = (event) => {
      if (clientPickerRef.current && !clientPickerRef.current.contains(event.target)) {
        setClientPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', closePicker)
    return () => document.removeEventListener('mousedown', closePicker)
  }, [clientPickerOpen])

  const openClientPicker = () => {
    setClientPickerOpen(true)
    requestAnimationFrame(() => clientSearchRef.current?.focus())
  }

  const selectClient = (pet) => {
    setForm((current) => ({ ...current, pet_id: pet.id, pet_search: '' }))
    setSelectedClient(pet)
    setErr('')
    setClientPickerOpen(false)
  }

  const handleServiceChange = (svc) => {
    const s = (services || SERVICES).find(x => x.value === svc)
    set('service_type', svc)
    if (!isEdit && s) {
      set('price', s.price)
      set('duration_min', s.duration || 60)
    }
  }

  async function handleSubmit() {
    if (!form.pet_id)       return setErr('Selecione um cliente/pet')
    if (!form.date)         return setErr('Informe a data')
    if (!form.time)         return setErr('Informe o horário')
    setSaving(true); setErr('')
    try {
      const scheduled_at = new Date(`${form.date}T${form.time}:00`).toISOString()
      const payload = {
        pet_id: form.pet_id, service_type: form.service_type,
        scheduled_at, duration_min: Number(form.duration_min),
        price: Number(form.price), status: form.status, notes: form.notes,
        groomer_id: form.groomer_id || null,
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
          <button type="button" aria-label="Fechar agendamento" title="Fechar" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>

        <div className="modal-body">
          <div className="space-y-6">
            {/* Pet com Busca */}
            <div ref={clientPickerRef} className="bg-card border border-[var(--border)] rounded-2xl p-5 space-y-4">
              <label className="inp-label flex items-center gap-2"><Plus size={14}/> Selecionar cliente</label>
              {!clientPickerOpen && selectedPet ? (
                <button
                  type="button"
                  onClick={openClientPicker}
                  className="w-full rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-amber-500/15 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-text truncate">{selectedPet.owner_name || 'Cliente sem nome'}</span>
                    <span className="block text-xs text-muted truncate">
                      {[selectedPet.pet_name, selectedPet.breed || selectedPet.species, selectedPet.phone].filter(Boolean).join(' - ') || 'Cadastro sem pet informado'}
                    </span>
                  </span>
                  <span className="text-[11px] font-bold text-amber-400 flex-shrink-0">Alterar</span>
                </button>
              ) : !clientPickerOpen ? (
                <button type="button" onClick={openClientPicker} className="btn btn-secondary w-full justify-center">
                  <Search size={14} /> Buscar cliente ou pet
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"/>
                    <input
                      ref={clientSearchRef}
                      aria-label="Buscar cliente ou pet"
                      className="inp pl-9 py-2 text-xs"
                      placeholder="Buscar cliente, pet ou telefone..."
                      value={form.pet_search}
                      onChange={(event) => set('pet_search', event.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div role="listbox" aria-label="Resultados de clientes" className="max-h-64 rounded-xl border border-[var(--border2)] bg-surface/60 overflow-y-auto">
                {filteredPets.map((p) => {
                  const active = form.pet_id === p.id
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      key={p.id}
                      onClick={() => selectClient(p)}
                      className={`w-full px-3 py-2 text-left flex items-center justify-between gap-3 border-b border-[var(--border2)] last:border-b-0 transition-colors ${
                        active ? 'bg-amber-500/15 text-text' : 'hover:bg-white/5 text-muted'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-text truncate">{p.owner_name || 'Cliente sem nome'}</span>
                        <span className="block text-[11px] truncate">
                          {[p.pet_name, p.breed || p.species, p.phone].filter(Boolean).join(' - ') || 'Cadastro sem pet informado'}
                        </span>
                      </span>
                      {active && <Check size={14} className="text-amber-400 flex-shrink-0"/>}
                    </button>
                  )
                })}
                {filteredPets.length === 0 && (
                  <p className="px-3 py-3 text-xs text-muted">Nenhum cliente encontrado com essa busca.</p>
                )}
                  </div>
                  <p className="text-[11px] text-muted">
                    {searchingClients
                      ? 'Buscando mais clientes...'
                      : deferredPetSearch
                        ? 'Mostrando ate 8 resultados.'
                        : 'Digite um nome, pet ou telefone para refinar a lista.'}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Serviço */}
              <div>
                <label className="inp-label">{serviceGroupLabel}</label>
                <select aria-label="Servico" className="inp" value={form.service_type} onChange={e => handleServiceChange(e.target.value)}>
                  {isEdit && form.service_type && !serviceOptions.some(s => s.value === form.service_type) && (
                    <option value={form.service_type}>{serviceLabelFallback(form.service_type, services)}</option>
                  )}
                  {serviceOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="inp-label">Status da Visita</label>
                <select aria-label="Status do agendamento" className="inp" value={form.status} onChange={e => set('status', e.target.value)}>
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="inp-label">Responsavel pelo servico</label>
                <select aria-label="Responsavel pelo atendimento" className="inp" value={form.groomer_id} onChange={e => set('groomer_id', e.target.value)}>
                  <option value="">Sem responsavel</option>
                  {staffOptions.map((person) => (
                    <option key={person.id} value={person.id}>{person.full_name || person.email}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted mt-1">
                  Pode ficar vazio no agendamento. O dono define o profissional depois, antes do fechamento de comissao.
                </p>
              </div>

              {/* Data / Hora */}
              <div className="grid grid-cols-2 gap-3 md:col-span-2 bg-surface/80 border border-[var(--border)] rounded-2xl p-5">
                <div>
                  <label className="inp-label">Data Reservada</label>
                  <input aria-label="Data do agendamento" className="inp" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
                </div>
                <div>
                  <label className="inp-label">Início</label>
                  <input aria-label="Horario do agendamento" className="inp" type="time" value={form.time} onChange={e => set('time', e.target.value)} />
                </div>
              </div>

              {/* Duração / Valor */}
              <div>
                <label className="inp-label">Tempo Est. (min)</label>
                <input aria-label="Duracao em minutos" className="inp" type="number" min="15" step="15"
                  value={form.duration_min} onChange={e => set('duration_min', e.target.value)} />
              </div>
              <div>
                <label className="inp-label">Valor (R$)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-muted font-bold">R$</span>
                  <input aria-label="Valor do atendimento" className="inp pl-9" type="number" min="0" step="5"
                    value={form.price} onChange={e => set('price', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="inp-label">Instruções para o Profissional</label>
              <textarea aria-label="Observacoes do agendamento" className="inp h-24 resize-none p-4" placeholder="Ex: Tem alergia a tal produto, ou é agressivo..."
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
function KanbanCard({ appt, serviceLabel, statusBadge, onEdit, onStatus, onReceipt, services = SERVICES, staffById = new Map() }) {
  const sb = statusBadge(appt.status)
  const assigned = staffById.get(appt.groomer_id)
  return (
    <div className="bg-surface border border-[var(--border)] rounded-xl p-3.5 space-y-2.5 hover:border-amber-500/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-text text-sm">{appt.pets?.pet_name || '—'}</p>
          <p className="text-xs text-muted">{appt.pets?.owner_name}</p>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {appt.status === 'concluido' && (
            <button type="button" aria-label="Imprimir recibo" onClick={() => onReceipt(appt)} className="text-muted hover:text-emerald-400" title="Imprimir Recibo">
              <Receipt size={13}/>
            </button>
          )}
            <button type="button" aria-label="Editar agendamento" title="Editar" onClick={() => onEdit(appt)} className="text-muted hover:text-amber-400">
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
               const s = (services || SERVICES).find(x => x.value === appt.service_type);
               const Icon = s?.icon || PawPrint;
               return <><Icon size={10}/> {s?.label || 'Serviço'}</>
             })()}
          </p>
          <p className={`mt-1 ${assigned ? 'text-muted' : 'text-amber-400'}`}>
            {assigned ? `Resp.: ${assigned.full_name || assigned.email}` : 'Sem responsavel'}
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
          <button type="button" aria-label="Cancelar agendamento" title="Cancelar agendamento" onClick={() => onStatus(appt.id, 'cancelado')}
            className="btn btn-danger btn-sm justify-center text-[10px] py-1 px-2">
            <X size={10}/>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Página Principal ──────────────────────────────────────────────────────────
function AgendaTimelineView({
  days,
  selectedDate,
  appointments,
  serviceLabel,
  statusBadge,
  staffById,
  onEdit,
  onCreateAt,
  onSelectDate,
}) {
  const selectedKey = isoDate(selectedDate)
  const hours = useMemo(() => {
    const appointmentHours = (appointments || [])
      .map((appt) => localHour(appt.scheduled_at))
      .filter((hour) => hour >= 0 && hour <= 23)
    const min = Math.min(AGENDA_HOURS[0], ...(appointmentHours.length ? appointmentHours : [AGENDA_HOURS[0]]))
    const max = Math.max(AGENDA_HOURS[AGENDA_HOURS.length - 1], ...(appointmentHours.length ? appointmentHours : [AGENDA_HOURS[AGENDA_HOURS.length - 1]]))
    return Array.from({ length: max - min + 1 }, (_, index) => min + index)
  }, [appointments])

  const bySlot = useMemo(() => {
    const map = new Map()
    ;(appointments || []).forEach((appt) => {
      const key = `${localDateKey(appt.scheduled_at)}-${localHour(appt.scheduled_at)}`
      const list = map.get(key) || []
      list.push(appt)
      map.set(key, list)
    })
    map.forEach((list) => list.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)))
    return map
  }, [appointments])

  return (
    <div className="bg-card border border-[var(--border)] rounded-xl2 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
        <div>
          <p className="text-sm font-bold text-text">Agenda semanal</p>
          <p className="text-xs text-muted">
            {days[0]?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            {' ate '}
            {days[days.length - 1]?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
          Horarios do periodo carregado
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[1080px]">
          <div
            className="grid border-b border-[var(--border)] bg-surface/50"
            style={{ gridTemplateColumns: '76px repeat(7, minmax(136px, 1fr))' }}
          >
            <div className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-muted">Hora</div>
            {days.map((day) => {
              const key = isoDate(day)
              const isSelected = key === selectedKey
              const dayCount = (appointments || []).filter((appt) => localDateKey(appt.scheduled_at) === key).length
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectDate(day)}
                  className={`text-left px-3 py-3 border-l border-[var(--border)] transition-colors ${
                    isSelected ? 'bg-amber-500/14' : 'hover:bg-white/5'
                  }`}
                >
                  <p className={`text-xs font-black uppercase tracking-widest ${isSelected ? 'text-amber-300' : 'text-muted'}`}>
                    {PT_WEEKDAYS[day.getDay()]}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-lg font-display font-black text-text">{String(day.getDate()).padStart(2, '0')}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isSelected ? 'bg-amber-500 text-gray-950' : 'bg-white/8 text-muted'}`}>
                      {dayCount}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {hours.map((hour) => (
            <div
              key={hour}
              className="grid border-b border-[var(--border)] last:border-b-0"
              style={{ gridTemplateColumns: '76px repeat(7, minmax(136px, 1fr))' }}
            >
              <div className="px-3 py-3 text-xs font-bold text-muted bg-surface/35">
                {String(hour).padStart(2, '0')}:00
              </div>

              {days.map((day) => {
                const dayKey = isoDate(day)
                const slotItems = bySlot.get(`${dayKey}-${hour}`) || []
                return (
                  <div
                    key={`${dayKey}-${hour}`}
                    className="min-h-[96px] border-l border-[var(--border)] p-2 hover:bg-white/[0.03] transition-colors"
                    onDoubleClick={() => onCreateAt(day, hour)}
                  >
                    {slotItems.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => onCreateAt(day, hour)}
                        className="h-full min-h-[76px] w-full rounded-lg border border-dashed border-transparent text-[11px] text-transparent hover:border-amber-400/25 hover:text-amber-300 transition-colors"
                      >
                        + agendar
                      </button>
                    ) : (
                      <div className="space-y-2">
                        {slotItems.map((appt) => {
                          const sb = statusBadge(appt.status)
                          const assigned = staffById.get(appt.groomer_id)
                          return (
                            <button
                              key={appt.id}
                              type="button"
                              onClick={() => onEdit(appt)}
                              className={`w-full rounded-lg border p-2 text-left shadow-sm transition-transform hover:-translate-y-0.5 ${agendaCardTone(appt.status)}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-[11px] font-black leading-tight">{fmtAppointmentInterval(appt)}</p>
                                  <p className="mt-1 truncate text-xs font-bold text-text">{appt.pets?.pet_name || 'Pet'}</p>
                                  <p className="truncate text-[11px] text-muted">{appt.pets?.owner_name || 'Cliente'}</p>
                                </div>
                                <span className={`badge ${sb.cls} shrink-0 text-[9px]`}>{sb.label}</span>
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted">
                                <span className="truncate">{serviceLabel(appt.service_type)}</span>
                                <span className="font-bold text-emerald-400">{fmtCurrency(appt.price)}</span>
                              </div>
                              <p className={`mt-1 truncate text-[10px] ${assigned ? 'text-muted' : 'text-amber-300'}`}>
                                {assigned ? `Resp.: ${assigned.full_name || assigned.email}` : 'Sem responsavel'}
                              </p>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function AgendaPage() {
  const { appointments, loading, load, create, update, updateStatus, remove, serviceLabel: legacyServiceLabel, statusBadge } =
    useAppointments()
  const { clients: pets, load: loadPets, search: searchPets } = useClients()
  const { loadPetshopServices, loadAssignableStaff } = usePetshopAdvanced()

  const [selectedDate, setSelectedDate] = useState(new Date())
  const [modal, setModal]           = useState(null)   // null | {} | {appt}
  const [receipt, setReceipt]       = useState(null) // appt to print
  const [view, setView]             = useState('list')  // 'list' | 'kanban' | 'agenda'
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch]         = useState('')
  const [activeAgendaTab, setActiveAgendaTab] = useState('banho_tosa')
  const [agendaServices, setAgendaServices] = useState(SERVICES)
  const [staff, setStaff] = useState([])

  const staffById = useMemo(() => new Map((staff || []).map((person) => [person.id, person])), [staff])
  const serviceLabel = (type) => serviceLabelFallback(type, agendaServices) || legacyServiceLabel(type)
  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart])
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  useEffect(() => {
    loadPets()
    loadPetshopServices().then((items) => setAgendaServices(asAgendaServices(items))).catch((err) => console.warn('Falha ao carregar servicos:', err))
    loadAssignableStaff().then(setStaff).catch((err) => console.warn('Falha ao carregar equipe:', err))
  }, [loadPets, loadPetshopServices, loadAssignableStaff])

  useEffect(() => {
    if (view === 'agenda') {
      load({
        startDate: isoDate(weekStart),
        endDate: isoDate(weekEnd),
        status: filterStatus || undefined,
      })
      return
    }

    load({ date: isoDate(selectedDate), status: filterStatus || undefined })
  }, [selectedDate, filterStatus, view, weekStart, weekEnd, load])

  const tabbedAppointments = appointments.filter((appointment) =>
    getAppointmentServiceGroup(appointment.service_type, agendaServices) === activeAgendaTab
  )
  const stats = buildStatsForDate(tabbedAppointments, selectedDate)
  const tabCounts = AGENDA_TABS.reduce((acc, tab) => ({
    ...acc,
    [tab.id]: appointments.filter((appointment) => getAppointmentServiceGroup(appointment.service_type, agendaServices) === tab.id).length,
  }), {})

  const displayed = tabbedAppointments.filter(a => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      a.pets?.pet_name?.toLowerCase().includes(q) ||
      a.pets?.owner_name?.toLowerCase().includes(q) ||
      a.service_type?.toLowerCase().includes(q) ||
      staffById.get(a.groomer_id)?.full_name?.toLowerCase().includes(q)
    )
  })

  const isToday = isoDate(selectedDate) === todayISO()
  const reloadCurrentView = () => {
    if (view === 'agenda') {
      load({ startDate: isoDate(weekStart), endDate: isoDate(weekEnd), status: filterStatus || undefined })
      return
    }
    load({ date: isoDate(selectedDate), status: filterStatus || undefined })
  }
  const openSlotModal = (day, hour) => {
    setModal({
      serviceGroup: activeAgendaTab,
      date: isoDate(day),
      time: `${String(hour).padStart(2, '0')}:00`,
    })
  }

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
        <button onClick={() => setModal({ serviceGroup: activeAgendaTab })} className="btn btn-primary">
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

      <div className="flex flex-wrap gap-2 bg-card border border-[var(--border)] rounded-xl p-1 w-fit max-w-full">
        {AGENDA_TABS.map(tab => {
          const Icon = tab.icon
          const active = activeAgendaTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveAgendaTab(tab.id)}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors ${
                active ? 'bg-amber-500 text-gray-950' : 'text-muted hover:text-text hover:bg-white/5'
              }`}
            >
              <Icon size={14}/>
              {tab.label}
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-gray-950/15' : 'bg-white/8 text-muted'}`}>
                {tabCounts[tab.id] || 0}
              </span>
            </button>
          )
        })}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Date Navigator */}
        <div className="flex items-center gap-1 bg-card border border-[var(--border)] rounded-xl p-1">
          <button aria-label="Dia anterior" title="Dia anterior" onClick={() => setSelectedDate(d => addDays(d,-1))}
            className="btn btn-ghost btn-sm btn-icon">
            <ChevronLeft size={15}/>
          </button>
          <button onClick={() => setSelectedDate(new Date())}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              isToday ? 'text-amber-400 bg-amber-500/10' : 'text-muted hover:text-text'
            }`}>
            {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          </button>
          <button aria-label="Próximo dia" title="Próximo dia" onClick={() => setSelectedDate(d => addDays(d,1))}
            className="btn btn-ghost btn-sm btn-icon">
            <ChevronRight size={15}/>
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"/>
          <input aria-label="Buscar pet ou tutor" className="inp pl-9 py-2" placeholder="Buscar pet, tutor..."
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>

        {/* Status filter */}
        <select aria-label="Filtrar por status" className="inp py-2 w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        {/* View toggle */}
        <div className="flex bg-card border border-[var(--border)] rounded-xl p-1">
          {[
            { id:'list',   label:'Lista'  },
            { id:'agenda', label:'Agenda' },
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

        <button onClick={reloadCurrentView}
          className="btn btn-ghost btn-sm btn-icon" title="Atualizar">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted text-sm">
          <RefreshCw size={16} className="animate-spin mr-2"/> Carregando...
        </div>
      ) : displayed.length === 0 && view !== 'agenda' ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-card border border-[var(--border)] rounded-xl2">
          <Calendar size={40} className="text-muted/30"/>
          <div className="text-center">
            <p className="text-text font-semibold">Nenhum agendamento</p>
            <p className="text-muted text-sm mt-1">
              {filterStatus || search ? 'Tente remover os filtros' : 'Clique em "+ Novo Agendamento" para começar'}
            </p>
          </div>
          <button onClick={() => setModal({ serviceGroup: activeAgendaTab })} className="btn btn-primary">
            <Plus size={15}/> Novo Agendamento
          </button>
        </div>
      ) : view === 'agenda' ? (
        <AgendaTimelineView
          days={weekDays}
          selectedDate={selectedDate}
          appointments={displayed}
          serviceLabel={serviceLabel}
          statusBadge={statusBadge}
          staffById={staffById}
          onEdit={(appt) => setModal(appt)}
          onCreateAt={openSlotModal}
          onSelectDate={setSelectedDate}
        />
      ) : view === 'list' ? (
        /* ── LIST VIEW ── */
        <div className="bg-card border border-[var(--border)] rounded-xl2 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>
                <th>Hora</th><th>Pet</th><th>Tutor</th><th>Serviço</th>
                <th>Responsavel</th><th>Status</th><th>Valor</th><th>Obs.</th><th></th>
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
                      <td className="text-xs">
                        {staffById.get(a.groomer_id)?.full_name || (
                          <span className={a.status === 'concluido' ? 'text-amber-400 font-semibold' : 'text-muted'}>Sem responsavel</span>
                        )}
                      </td>
                      <td><span className={`badge ${sb.cls}`}>{sb.label}</span></td>
                      <td><span className="font-semibold text-emerald-400">{fmtCurrency(a.price)}</span></td>
                      <td><span className="text-xs text-muted truncate max-w-[120px] block">{a.notes || '—'}</span></td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button type="button" aria-label="Editar agendamento" title="Editar" onClick={() => setModal(a)} className="btn btn-ghost btn-sm btn-icon">
                            <Edit2 size={13}/>
                          </button>
                          {a.status === 'concluido' && (
                            <button type="button" aria-label="Imprimir recibo" onClick={() => setReceipt(a)}
                              className="btn btn-ghost btn-sm btn-icon text-emerald-400 border border-emerald-500/20" title="Imprimir Recibo">
                              <Receipt size={13}/>
                            </button>
                          )}
                          {['agendado','confirmado'].includes(a.status) && (
                            <button type="button" aria-label="Concluir agendamento" onClick={() => updateStatus(a.id, 'concluido')}
                              className="btn btn-success btn-sm btn-icon" title="Concluir">
                              <Check size={13}/>
                            </button>
                          )}
                          <button type="button" aria-label="Excluir agendamento" onClick={() => remove(a.id)}
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
                      onEdit={(a) => setModal(a)} onStatus={updateStatus} onReceipt={setReceipt}
                      services={agendaServices} staffById={staffById}/>
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
          appt={modal?.id ? modal : modal}
          pets={pets}
          services={agendaServices}
          staff={staff}
          onSearchClients={searchPets}
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
