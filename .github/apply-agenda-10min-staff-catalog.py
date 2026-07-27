from pathlib import Path
import re


def replace_once(path, old, new, label):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


def regex_once(path, pattern, replacement, label, flags=0):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one regex match, found {count}')
    file.write_text(updated, encoding='utf-8')


agenda = 'src/modules/petshop/pages/AgendaPage.jsx'
settings = 'src/shared/pages/SettingsPage.jsx'
auth_context = 'src/context/AuthContext.jsx'
test_file = 'test/agendaOperationalInfrastructure.test.mjs'
advanced = 'src/modules/petshop/hooks/usePetshopAdvanced.js'

# ---------------------------------------------------------------------------
# Agenda: nomes exatos do catalogo, validacao de conflito e grade diaria 10 min.
# ---------------------------------------------------------------------------
replace_once(
    agenda,
    '  friendlyPetshopServiceLabel,\n',
    '',
    'remove friendly catalog label import',
)
replace_once(
    agenda,
    '    label: friendlyPetshopServiceLabel(service, { weightKg: service.weight_kg }),\n',
    "    label: String(service.name || service.label || service.code || 'Servico').trim(),\n",
    'use exact service catalog name',
)

agenda_helpers = r'''
const DAILY_SLOT_MINUTES = 10
const DAILY_ROW_HEIGHT = 24

const minutesOfDay = (value) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  return date.getHours() * 60 + date.getMinutes()
}

const timeFromMinutes = (minutes) => {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Number(minutes || 0)))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

const appointmentIntervalBounds = (appt = {}) => {
  const start = new Date(appt.scheduled_at)
  if (Number.isNaN(start.getTime())) return null
  const duration = Math.max(15, Number(appt.duration_min || 60))
  return { start, end: new Date(start.getTime() + duration * 60 * 1000) }
}

const intervalsOverlap = (firstStart, firstEnd, secondStart, secondEnd) => (
  firstStart < secondEnd && secondStart < firstEnd
)

const wouldExceedSlotCapacity = ({ start, end, appointments = [], capacity = 1 }) => {
  const events = [
    { time: start.getTime(), delta: 1 },
    { time: end.getTime(), delta: -1 },
  ]

  appointments.forEach((appt) => {
    const bounds = appointmentIntervalBounds(appt)
    if (!bounds || !intervalsOverlap(start, end, bounds.start, bounds.end)) return
    events.push({ time: Math.max(start.getTime(), bounds.start.getTime()), delta: 1 })
    events.push({ time: Math.min(end.getTime(), bounds.end.getTime()), delta: -1 })
  })

  events.sort((a, b) => (a.time - b.time) || (a.delta - b.delta))
  let concurrent = 0
  let maximum = 0
  events.forEach((event) => {
    concurrent += event.delta
    maximum = Math.max(maximum, concurrent)
  })
  return maximum > Math.max(1, Number(capacity || 1))
}

'''
replace_once(
    agenda,
    'const fmtInterval = (appt) => fmtAppointmentInterval(appt)\n',
    agenda_helpers + 'const fmtInterval = (appt) => fmtAppointmentInterval(appt)\n',
    'agenda interval and capacity helpers',
)

replace_once(
    agenda,
    'function ApptModal({ appt, onClose, onCreate, onUpdate, onReceipt, pets, services = SERVICES, staff = [], serviceDurations, onSearchClients }) {\n',
    'function ApptModal({ appt, onClose, onCreate, onUpdate, onReceipt, pets, services = SERVICES, staff = [], serviceDurations, onSearchClients, appointments = [], slotCapacity = MANUAL_SLOT_CAPACITY }) {\n',
    'appointment modal conflict props',
)

replace_once(
    agenda,
    "    setSaving(true)\n    setErr('')\n    try {\n      const scheduled_at = new Date(`${form.date}T${form.time}:00`).toISOString()\n",
    "    const candidateStart = new Date(`${form.date}T${form.time}:00`)\n    if (Number.isNaN(candidateStart.getTime())) return setErr('Horario invalido')\n    const candidateEnd = new Date(candidateStart.getTime() + Math.max(15, Number(serviceTotals.duration || 60)) * 60 * 1000)\n    const candidateBlocks = appointmentOccupiesManualSlot({ status: form.status })\n    const relevantAppointments = (appointments || []).filter((item) => (\n      String(item.id || '') !== String(appt?.id || '')\n      && appointmentOccupiesManualSlot(item)\n      && getAppointmentServiceGroup(item, services) === serviceGroup\n    ))\n\n    if (candidateBlocks && form.responsible_staff_key) {\n      const sameResponsibleConflict = relevantAppointments.some((item) => {\n        if (item.responsible_staff_key !== form.responsible_staff_key) return false\n        const bounds = appointmentIntervalBounds(item)\n        return bounds && intervalsOverlap(candidateStart, candidateEnd, bounds.start, bounds.end)\n      })\n      if (sameResponsibleConflict) {\n        return setErr('Este responsavel ja possui atendimento dentro desse intervalo.')\n      }\n    }\n\n    if (candidateBlocks && wouldExceedSlotCapacity({\n      start: candidateStart,\n      end: candidateEnd,\n      appointments: relevantAppointments,\n      capacity: serviceGroup === 'banho_tosa' ? slotCapacity : 1,\n    })) {\n      return setErr(serviceGroup === 'veterinaria'\n        ? 'Ja existe atendimento veterinario dentro desse intervalo.'\n        : 'As duas vagas de banho/tosa ja estao ocupadas em parte desse intervalo.')\n    }\n\n    setSaving(true)\n    setErr('')\n    try {\n      const scheduled_at = candidateStart.toISOString()\n",
    'appointment client-side overlap validation',
)

# Insert the dedicated daily timeline immediately before the existing weekly return.
agenda_file = Path(agenda)
agenda_text = agenda_file.read_text(encoding='utf-8')
function_start = agenda_text.index('function AgendaTimelineView(')
return_marker = '  return (\n    <div className="bg-card border border-[var(--border)] rounded-xl2 overflow-hidden">\n'
return_index = agenda_text.index(return_marker, function_start)

daily_branch = r'''  if (days.length === 1) {
    const day = days[0]
    const dayKey = isoDate(day)
    const dayItems = (appointments || [])
      .filter((appt) => localDateKey(appt.scheduled_at) === dayKey)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    const blocking = dayItems.filter(appointmentOccupiesManualSlot)
    const history = dayItems.filter((item) => !appointmentOccupiesManualSlot(item))
    const blockingBounds = blocking.map(appointmentIntervalBounds).filter(Boolean)
    const earliestMinute = Math.min(8 * 60, ...(blockingBounds.length ? blockingBounds.map((bounds) => minutesOfDay(bounds.start)) : [8 * 60]))
    const latestMinute = Math.max(18 * 60, ...(blockingBounds.length ? blockingBounds.map((bounds) => minutesOfDay(bounds.end)) : [18 * 60]))
    const rangeStart = Math.floor(earliestMinute / DAILY_SLOT_MINUTES) * DAILY_SLOT_MINUTES
    const rangeEnd = Math.ceil(latestMinute / DAILY_SLOT_MINUTES) * DAILY_SLOT_MINUTES
    const slotCount = Math.max(1, Math.ceil((rangeEnd - rangeStart) / DAILY_SLOT_MINUTES))
    const slots = Array.from({ length: slotCount }, (_, index) => rangeStart + index * DAILY_SLOT_MINUTES)
    const timelineHeight = slots.length * DAILY_ROW_HEIGHT
    const laneEnds = Array.from({ length: slotCapacity }, () => Number.NEGATIVE_INFINITY)
    const positioned = blocking.map((appt) => {
      const bounds = appointmentIntervalBounds(appt)
      const startMs = bounds?.start.getTime() ?? 0
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= startMs)
      const overflow = lane < 0
      if (lane < 0) lane = 0
      laneEnds[lane] = Math.max(laneEnds[lane], bounds?.end.getTime() ?? startMs)
      return { appt, bounds, lane, overflow }
    })

    return (
      <div className="bg-card border border-[var(--border)] rounded-xl2 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
          <div>
            <p className="text-sm font-bold text-text">Agenda diaria em intervalos de 10 minutos</p>
            <p className="text-xs text-muted">{day.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            {slotCapacity} {slotCapacity === 1 ? 'vaga' : 'vagas'} simultaneas
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[620px] grid" style={{ gridTemplateColumns: '76px minmax(0, 1fr)' }}>
            <div className="relative bg-surface/35" style={{ height: timelineHeight }}>
              {slots.map((minute, index) => (
                <div
                  key={`label-${minute}`}
                  className="absolute inset-x-0 border-b border-[var(--border)] px-2 text-[10px] font-bold text-muted"
                  style={{ top: index * DAILY_ROW_HEIGHT, height: DAILY_ROW_HEIGHT }}
                >
                  <span className="relative top-1">{timeFromMinutes(minute)}</span>
                </div>
              ))}
            </div>

            <div className="relative border-l border-[var(--border)]" style={{ height: timelineHeight }}>
              {slots.map((minute, index) => (
                <button
                  key={`slot-${minute}`}
                  type="button"
                  aria-label={`Agendar as ${timeFromMinutes(minute)}`}
                  title={`Novo agendamento as ${timeFromMinutes(minute)}`}
                  onClick={() => onCreateAt(day, timeFromMinutes(minute))}
                  className="absolute inset-x-0 border-b border-[var(--border)] text-left hover:bg-emerald-500/[0.04]"
                  style={{ top: index * DAILY_ROW_HEIGHT, height: DAILY_ROW_HEIGHT }}
                />
              ))}

              {positioned.map(({ appt, bounds, lane, overflow }) => {
                if (!bounds) return null
                const startMinute = minutesOfDay(bounds.start)
                const endMinute = minutesOfDay(bounds.end)
                const top = ((startMinute - rangeStart) / DAILY_SLOT_MINUTES) * DAILY_ROW_HEIGHT + 2
                const height = Math.max(34, ((endMinute - startMinute) / DAILY_SLOT_MINUTES) * DAILY_ROW_HEIGHT - 4)
                const laneWidth = 100 / Math.max(1, slotCapacity)
                return (
                  <div
                    key={appt.id}
                    className={`absolute z-10 overflow-hidden rounded-lg ${overflow ? 'ring-2 ring-red-500/70' : ''}`}
                    style={{
                      top,
                      height,
                      left: `calc(${lane * laneWidth}% + 4px)`,
                      width: `calc(${laneWidth}% - 8px)`,
                    }}
                  >
                    {appointmentCard(appt)}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {history.length > 0 && (
          <div className="border-t border-[var(--border)] p-3">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted">Historico do dia</p>
            <div className="grid gap-2 md:grid-cols-2">
              {history.map((appt) => (
                <button
                  key={appt.id}
                  type="button"
                  onClick={() => onEdit(appt)}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs text-muted hover:bg-white/[0.06]"
                >
                  {fmtAppointmentInterval(appt)} · {appt.pets?.pet_name || 'Pet'} · {statusBadge(appt.status).label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

'''
agenda_text = agenda_text[:return_index] + daily_branch + agenda_text[return_index:]
agenda_file.write_text(agenda_text, encoding='utf-8')

replace_once(
    agenda,
    '  const openSlotModal = (day, hour) => {\n    setModal({\n      serviceGroup: activeAgendaTab,\n      date: isoDate(day),\n      time: `${String(hour).padStart(2, "0")}:00`,\n    })\n  }\n',
    "  const openSlotModal = (day, timeOrHour) => {\n    const time = typeof timeOrHour === 'number'\n      ? `${String(timeOrHour).padStart(2, '0')}:00`\n      : String(timeOrHour || '08:00')\n    setModal({\n      serviceGroup: activeAgendaTab,\n      date: isoDate(day),\n      time,\n    })\n  }\n",
    'precise daily slot modal time',
)

replace_once(
    agenda,
    '          onSearchClients={searchPets}\n          onClose={() => setModal(null)}\n',
    "          onSearchClients={searchPets}\n          appointments={appointments}\n          slotCapacity={getAppointmentServiceGroup(modal, agendaServices) === 'veterinaria' || modal?.serviceGroup === 'veterinaria' ? 1 : MANUAL_SLOT_CAPACITY}\n          onClose={() => setModal(null)}\n",
    'pass appointments to conflict validation',
)

# The catalog loader must only return active, priced products and the UI keeps the exact product name.
replace_once(
    advanced,
    "          .eq('active', true)\n          .order('name', { ascending: true })\n",
    "          .eq('active', true)\n          .gt('price', 0)\n          .order('name', { ascending: true })\n",
    'active priced service products only',
)

# ---------------------------------------------------------------------------
# Settings: dedicated staff persistence with schema-compatible JSON fallback.
# ---------------------------------------------------------------------------
replace_once(
    settings,
    'const INITIAL_FORM = {\n',
    "const OPERATIONAL_STAFF_TEMPLATE_KEY = '__petshop_operational_staff'\n\nconst INITIAL_FORM = {\n",
    'staff fallback key',
)
replace_once(
    settings,
    "function toBool(value, fallback = false) {\n",
    "function isOperationalStaffSchemaError(error) {\n  const msg = String(error?.message || '').toLowerCase()\n  return msg.includes('petshop_operational_staff') && (\n    msg.includes('schema cache') || msg.includes('column') || msg.includes('does not exist')\n  )\n}\n\nfunction toBool(value, fallback = false) {\n",
    'staff schema error helper',
)
replace_once(
    settings,
    "  const [saving, setSaving] = useState(false)\n  const [msg, setMsg] = useState({ type: '', text: '' })\n",
    "  const [saving, setSaving] = useState(false)\n  const [savingStaff, setSavingStaff] = useState(false)\n  const [staffMsg, setStaffMsg] = useState({ type: '', text: '' })\n  const [msg, setMsg] = useState({ type: '', text: '' })\n",
    'staff saving state',
)
replace_once(
    settings,
    '          petshop_operational_staff: normalizeOperationalStaff(data.petshop_operational_staff),\n',
    '          petshop_operational_staff: normalizeOperationalStaff(data.petshop_operational_staff ?? data.message_templates?.[OPERATIONAL_STAFF_TEMPLATE_KEY]),\n',
    'load staff from column or template fallback',
)

persist_staff = r'''  async function persistOperationalStaff({ announce = false } = {}) {
    if (!canEdit || effectiveModId !== 'petshop') return null
    const expectedStaff = normalizeOperationalStaff(form.petshop_operational_staff)
    const templates = {
      ...normalizeTemplates(form.message_templates),
      [OPERATIONAL_STAFF_TEMPLATE_KEY]: expectedStaff,
    }

    if (announce) {
      setSavingStaff(true)
      setStaffMsg({ type: '', text: '' })
    }

    try {
      const save = async (includeColumn) => runWithTenantFallback(activeTenantId, async (includeTenant) => {
        const row = buildTenantPayload({
          module_id: effectiveModId,
          message_templates: templates,
          ...(includeColumn ? { petshop_operational_staff: expectedStaff } : {}),
          updated_at: new Date().toISOString(),
        }, activeTenantId, includeTenant)
        const conflict = includeTenant ? 'tenant_id,module_id' : 'module_id'
        return supabase
          .from('settings')
          .upsert(row, { onConflict: conflict })
          .select(includeColumn ? 'petshop_operational_staff,message_templates' : 'message_templates')
          .single()
      })

      let response = await save(true)
      if (response.error && isOperationalStaffSchemaError(response.error)) {
        response = await save(false)
      }
      if (response.error) throw response.error

      const savedRaw = response.data?.petshop_operational_staff
        ?? response.data?.message_templates?.[OPERATIONAL_STAFF_TEMPLATE_KEY]
      const savedStaff = normalizeOperationalStaff(savedRaw)
      const signature = (rows) => JSON.stringify(rows.map(({ key, name, active }) => ({ key, name, active })))
      if (signature(savedStaff) !== signature(expectedStaff)) {
        throw new Error('O banco nao confirmou os nomes informados para a equipe operacional.')
      }

      setForm((current) => ({
        ...current,
        petshop_operational_staff: savedStaff,
        message_templates: templates,
      }))
      await auth.refreshSettings(effectiveModId)
      if (announce) setStaffMsg({ type: 'success', text: 'Equipe salva e atualizada na Agenda e em Comissoes.' })
      return savedStaff
    } catch (error) {
      if (announce) {
        setStaffMsg({ type: 'error', text: error instanceof Error ? error.message : 'Nao foi possivel salvar a equipe.' })
        return null
      }
      throw error
    } finally {
      if (announce) setSavingStaff(false)
    }
  }

'''
replace_once(
    settings,
    '  async function handleSave() {\n',
    persist_staff + '  async function handleSave() {\n',
    'dedicated operational staff persistence',
)

regex_once(
    settings,
    r"\n      if \(effectiveModId === 'petshop'\) \{\n        const expectedStaff = normalizeOperationalStaff\(form\.petshop_operational_staff\)[\s\S]*?\n      \}\n\n      if \(savingFiscalSettings\)",
    "\n      if (effectiveModId === 'petshop') await persistOperationalStaff()\n\n      if (savingFiscalSettings)",
    'reuse dedicated staff persistence from general save',
)

replace_once(
    settings,
    '  function updateOperationalStaff(index, patch) {\n    setForm((prev) => {\n',
    "  function updateOperationalStaff(index, patch) {\n    setStaffMsg({ type: '', text: '' })\n    setForm((prev) => {\n",
    'clear staff message on edit',
)
replace_once(
    settings,
    '  function addOperationalStaff() {\n    setForm((prev) => {\n',
    "  function addOperationalStaff() {\n    setStaffMsg({ type: '', text: '' })\n    setForm((prev) => {\n",
    'clear staff message on add',
)

staff_ui_marker = '''                  {(Array.isArray(form.petshop_operational_staff)
                    ? form.petshop_operational_staff
                    : normalizeOperationalStaff(form.petshop_operational_staff)
                  ).length < 4 && (
                    <button type="button" disabled={!canEdit} className="btn btn-secondary" onClick={addOperationalStaff}>
                      <Plus size={14}/> Adicionar profissional
                    </button>
                  )}
'''
staff_ui_replacement = staff_ui_marker + '''                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      disabled={!canEdit || savingStaff}
                      className="btn btn-primary gap-2"
                      onClick={() => persistOperationalStaff({ announce: true })}
                    >
                      {savingStaff ? <RefreshCw size={14} className="animate-spin"/> : <Save size={14}/>} 
                      {savingStaff ? 'Salvando equipe...' : 'Salvar equipe'}
                    </button>
                    {staffMsg.text && (
                      <p className={`text-xs font-semibold ${staffMsg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {staffMsg.text}
                      </p>
                    )}
                  </div>
'''
replace_once(settings, staff_ui_marker, staff_ui_replacement, 'dedicated staff save button')

# Auth context must expose the fallback value to Agenda and Commissions immediately.
replace_once(
    auth_context,
    "import { buildTenantSlug, isTenantSchemaError, runWithTenantFallback } from '../lib/tenant'\n",
    "import { buildTenantSlug, isTenantSchemaError, runWithTenantFallback } from '../lib/tenant'\nimport { normalizeOperationalStaff } from '../../shared/petshopOperations'\n",
    'auth operational staff normalizer import',
)
replace_once(
    auth_context,
    "const SUPPORTED_BUSINESS_MODULES = ['petshop']\n",
    "const SUPPORTED_BUSINESS_MODULES = ['petshop']\nconst OPERATIONAL_STAFF_TEMPLATE_KEY = '__petshop_operational_staff'\n",
    'auth staff fallback key',
)
replace_once(
    auth_context,
    '        setStoreSettings(data[0])\n',
    "        const row = data[0]\n        setStoreSettings({\n          ...row,\n          petshop_operational_staff: normalizeOperationalStaff(\n            row.petshop_operational_staff ?? row.message_templates?.[OPERATIONAL_STAFF_TEMPLATE_KEY],\n          ),\n        })\n",
    'auth exposes persisted staff fallback',
)

# ---------------------------------------------------------------------------
# Static regression coverage.
# ---------------------------------------------------------------------------
replace_once(
    test_file,
    '  const [migration, staffMigration, catalogMigration, agenda, appointments, advanced, commissions, settings] = await Promise.all([\n',
    '  const [migration, staffMigration, catalogMigration, agenda, appointments, advanced, commissions, settings, authContext] = await Promise.all([\n',
    'test auth context fixture',
)
replace_once(
    test_file,
    "    readFile(new URL('../src/shared/pages/SettingsPage.jsx', import.meta.url), 'utf8'),\n  ])\n",
    "    readFile(new URL('../src/shared/pages/SettingsPage.jsx', import.meta.url), 'utf8'),\n    readFile(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8'),\n  ])\n",
    'test auth context read',
)
replace_once(
    test_file,
    "  assert.match(agenda, /agendaPeriod/)\n",
    "  assert.match(agenda, /agendaPeriod/)\n  assert.match(agenda, /DAILY_SLOT_MINUTES = 10/)\n  assert.match(agenda, /wouldExceedSlotCapacity/)\n  assert.match(agenda, /Agenda diaria em intervalos de 10 minutos/)\n  assert.match(agenda, /label: String\\(service.name/)\n  assert.doesNotMatch(agenda, /friendlyPetshopServiceLabel/)\n",
    'test daily timeline exact catalog labels',
)
replace_once(
    test_file,
    "  assert.match(settings, /select\\('petshop_operational_staff'\\)\\.single\\(\\)/)\n",
    "  assert.match(settings, /OPERATIONAL_STAFF_TEMPLATE_KEY/)\n  assert.match(settings, /Salvar equipe/)\n  assert.match(settings, /persistOperationalStaff/)\n  assert.match(authContext, /message_templates\\?\\.\\[OPERATIONAL_STAFF_TEMPLATE_KEY\\]/)\n",
    'test dedicated staff fallback persistence',
)

print('agenda 10-minute, staff persistence and real catalog hotfix applied')
