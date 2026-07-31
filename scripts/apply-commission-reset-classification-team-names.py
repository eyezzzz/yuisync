from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    content = file.read_text()
    if old not in content:
        raise SystemExit(f'Trecho não encontrado em {path}: {old[:120]!r}')
    file.write_text(content.replace(old, new, 1))


Path('src/modules/petshop/lib/teamCommissionSummary.js').write_text("""const normalizeText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\\u0300-\\u036f]/g, '')
  .toLowerCase()
  .trim()

const transportPattern = /\\b(motodog|moto\\s*dog|transporte|entrega|delivery|frete|buscar|levar)\\b/
const genericBathTosaPattern = /^(banho[_\\s-]*tosa|banho e tosa)$/

const itemText = (item = {}) => normalizeText([
  item.code,
  item.value,
  item.name,
  item.label,
  item.service_type,
  item.group_type,
].filter(Boolean).join(' '))

const itemCategory = (item = {}, appointment = {}) => {
  const text = itemText(item)
  const rawType = normalizeText(item.service_type || item.code || item.value || appointment.service_type || '')
  const genericBathTosa = genericBathTosaPattern.test(rawType)

  if (/tesoura/.test(text)) return 'scissor_grooming'
  if (/tosa\\s*(?:na\\s*)?maquina|maquina|tosa\\s*total|tosa\\s*completa|groom|trim/.test(text)) return 'machine_grooming'
  if (/\\bbanho\\b/.test(text)) return 'bath'
  if (/\\btosa\\b/.test(text) && !/higien/.test(text)) return 'machine_grooming'
  if (/higien/.test(text)) return 'other'
  if (genericBathTosa || normalizeText(item.group_type || appointment.service_group) === 'banho_tosa') return 'bath'
  return 'other'
}

export function hydrateLegacyCommissionAppointment(appointment = {}, services = []) {
  if (Array.isArray(appointment.service_items) && appointment.service_items.length) return appointment

  const rawType = normalizeText(appointment.service_type || '')
  if (!genericBathTosaPattern.test(rawType)) return appointment

  const appointmentPrice = Number(appointment.price || 0)
  const candidates = (services || []).filter((service) => (
    normalizeText(service.group_type) === 'banho_tosa'
    && appointmentPrice > 0
    && Math.abs(Number(service.default_price || 0) - appointmentPrice) < 0.01
  ))
  const categories = new Set(candidates.map((service) => itemCategory(service, appointment)))
  const selected = categories.size === 1 ? candidates[0] : null
  if (!selected) return appointment

  return {
    ...appointment,
    service_items: [{
      code: selected.code,
      name: selected.name,
      service_type: selected.code,
      group_type: selected.group_type || 'banho_tosa',
      unit_price: appointmentPrice,
      source_product_id: selected.source_product_id || null,
      inferred_from_legacy_price: true,
    }],
  }
}

export function hydrateLegacyCommissionAppointments(appointments = [], services = []) {
  return (appointments || []).map((appointment) => hydrateLegacyCommissionAppointment(appointment, services))
}

export function appointmentCommissionLines(appointment = {}) {
  const appointmentGroup = normalizeText(appointment.service_group || '')
  if (appointmentGroup && appointmentGroup !== 'banho_tosa') return []

  const rawItems = Array.isArray(appointment.service_items) && appointment.service_items.length
    ? appointment.service_items
    : [{
      code: appointment.service_type,
      name: appointment.service_type,
      service_type: appointment.service_type,
      group_type: appointment.service_group || 'banho_tosa',
      unit_price: appointment.price,
    }]

  const eligible = rawItems.filter((item) => {
    const group = normalizeText(item?.group_type || appointment.service_group || 'banho_tosa')
    const text = itemText(item)
    if (group && group !== 'banho_tosa') return false
    return !transportPattern.test(text)
  })

  return eligible.map((item) => {
    const category = itemCategory(item, appointment)
    const itemRevenue = Number(item.unit_price ?? item.catalog_price ?? item.price ?? 0)
    const revenue = itemRevenue > 0
      ? itemRevenue
      : eligible.length === 1
        ? Number(appointment.price || 0)
        : 0
    const rate = ['machine_grooming', 'scissor_grooming'].includes(category) ? 0.10 : 0.05
    const rawLabel = item.name || item.label || item.code || item.value || appointment.service_type || 'Servico estetico'
    const legacyGeneric = genericBathTosaPattern.test(normalizeText(item.service_type || item.code || appointment.service_type || ''))
    return {
      appointment_id: appointment.id,
      category,
      code: item.code || item.value || item.service_type || appointment.service_type || '',
      label: legacyGeneric && category === 'bath' ? 'Banho (registro antigo)' : rawLabel,
      revenue: Math.max(0, revenue),
      commission: Math.max(0, revenue) * rate,
      rate,
    }
  })
}

export function appointmentHasCommissionServices(appointment = {}) {
  return appointmentCommissionLines(appointment).length > 0
}

export function commissionHistoryLabel(appointment = {}) {
  const labels = appointmentCommissionLines(appointment).map((line) => line.label).filter(Boolean)
  return [...new Set(labels)].join(' + ') || 'Servico estetico'
}

export function buildCommissionRows(history = [], configuredStaff = []) {
  const rows = new Map()
  const configuredNames = new Map((configuredStaff || []).map((person) => [person.key, person.name]))
  const ensure = (key, name = '') => {
    if (!key) return null
    if (!rows.has(key)) {
      rows.set(key, {
        staff_key: key,
        collaborator_name: name || key,
        service_count: 0,
        bath_count: 0,
        machine_grooming_count: 0,
        scissor_grooming_count: 0,
        grooming_count: 0,
        other_service_count: 0,
        service_revenue: 0,
        bath_revenue: 0,
        grooming_revenue: 0,
        other_service_revenue: 0,
        bath_commission: 0,
        grooming_commission: 0,
        other_service_commission: 0,
        total_commission: 0,
      })
    }
    const current = rows.get(key)
    if (name && !configuredNames.has(key)) current.collaborator_name = name
    return current
  }

  configuredStaff.forEach((person) => ensure(person.key, person.name))

  history.forEach((appointment) => {
    const key = String(appointment.responsible_staff_key || '').trim()
    if (!key) return
    const row = ensure(key, configuredNames.get(key) || appointment.responsible_staff_name || key)
    appointmentCommissionLines(appointment).forEach((line) => {
      row.service_count += 1
      row.service_revenue += line.revenue
      row.total_commission += line.commission
      if (line.category === 'bath') {
        row.bath_count += 1
        row.bath_revenue += line.revenue
        row.bath_commission += line.commission
      } else if (line.category === 'machine_grooming') {
        row.machine_grooming_count += 1
        row.grooming_count += 1
        row.grooming_revenue += line.revenue
        row.grooming_commission += line.commission
      } else if (line.category === 'scissor_grooming') {
        row.scissor_grooming_count += 1
        row.grooming_count += 1
        row.grooming_revenue += line.revenue
        row.grooming_commission += line.commission
      } else {
        row.other_service_count += 1
        row.other_service_revenue += line.revenue
        row.other_service_commission += line.commission
      }
    })
  })

  return [...rows.values()]
    .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => (
      typeof value === 'number' ? [key, Number(value.toFixed(2))] : [key, value]
    ))))
    .sort((left, right) => right.total_commission - left.total_commission
      || String(left.collaborator_name).localeCompare(String(right.collaborator_name), 'pt-BR'))
}
""")

Path('src/modules/petshop/lib/teamSettingsOperations.js').write_text("""import { supabase } from '../../../lib/supabase'
import { buildTenantPayload, runWithTenantFallback } from '../../../lib/tenant'
import { normalizeOperationalStaff } from '../../../../shared/petshopOperations'

export const OPERATIONAL_STAFF_TEMPLATE_KEY = '__petshop_operational_staff'

const isOperationalStaffSchemaError = (error) => {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('petshop_operational_staff') && (
    message.includes('schema cache') || message.includes('column') || message.includes('does not exist')
  )
}

export async function persistPetshopTeamSettings({
  moduleId = 'petshop',
  tenantId,
  currentSettings = {},
  staff = [],
  templatePatch = {},
}) {
  const expectedStaff = normalizeOperationalStaff(staff)
  const templates = {
    ...(currentSettings.message_templates || {}),
    [OPERATIONAL_STAFF_TEMPLATE_KEY]: expectedStaff,
    ...templatePatch,
  }

  const save = async (includeColumn) => runWithTenantFallback(tenantId, async (includeTenant) => {
    const row = buildTenantPayload({
      module_id: moduleId,
      message_templates: templates,
      ...(includeColumn ? { petshop_operational_staff: expectedStaff } : {}),
      updated_at: new Date().toISOString(),
    }, tenantId, includeTenant)
    const conflict = includeTenant ? 'tenant_id,module_id' : 'module_id'
    return supabase
      .from('settings')
      .upsert(row, { onConflict: conflict })
      .select(includeColumn ? 'petshop_operational_staff,message_templates' : 'message_templates')
      .single()
  })

  let response = await save(true)
  if (response.error && isOperationalStaffSchemaError(response.error)) response = await save(false)
  if (response.error) throw response.error

  const savedTemplates = response.data?.message_templates || templates
  const savedStaff = normalizeOperationalStaff(
    response.data?.petshop_operational_staff
      ?? savedTemplates[OPERATIONAL_STAFF_TEMPLATE_KEY]
      ?? expectedStaff,
  )
  return {
    petshop_operational_staff: savedStaff,
    message_templates: { ...templates, ...savedTemplates },
  }
}
""")

replace_once(
    'shared/petshopOperations.js',
    "export const PETSHOP_DELIVERY_STAFF_TEMPLATE_KEY = '__petshop_delivery_staff'\n",
    "export const PETSHOP_DELIVERY_STAFF_TEMPLATE_KEY = '__petshop_delivery_staff'\nexport const PETSHOP_COMMISSION_RESET_TEMPLATE_KEY = '__petshop_commission_reset_at'\n",
)

replace_once(
    'src/context/AuthContext.jsx',
    "  const [tenants, setTenants] = useState([])\n",
    "  const updateStoreSettings = useCallback((patch) => {\n    setStoreSettings((current) => {\n      const next = typeof patch === 'function' ? patch(current) : patch\n      return { ...current, ...(next || {}) }\n    })\n  }, [])\n\n  const [tenants, setTenants] = useState([])\n",
)
replace_once(
    'src/context/AuthContext.jsx',
    "    storeSettings,\n    refreshSettings: loadSettings,\n",
    "    storeSettings,\n    updateStoreSettings,\n    refreshSettings: loadSettings,\n",
)
replace_once(
    'src/context/AuthContext.jsx',
    "  }), [auth, storeSettings, tenants, activeTenantId, tenantLoading, tenantMode, tenantError, switchTenant, createTenant, loadTenantScope, tenantEnabledModules, loadTenantEnabledModules])\n",
    "  }), [auth, storeSettings, updateStoreSettings, tenants, activeTenantId, tenantLoading, tenantMode, tenantError, switchTenant, createTenant, loadTenantScope, tenantEnabledModules, loadTenantEnabledModules])\n",
)

replace_once(
    'src/shared/pages/SettingsPage.jsx',
    "      setForm((current) => ({\n        ...current,\n        petshop_operational_staff: savedStaff,\n        petshop_delivery_staff: savedDeliveryStaff,\n        message_templates: templates,\n      }))\n      await auth.refreshSettings(effectiveModId)\n",
    "      setForm((current) => ({\n        ...current,\n        petshop_operational_staff: savedStaff,\n        petshop_delivery_staff: savedDeliveryStaff,\n        message_templates: templates,\n      }))\n      auth.updateStoreSettings?.({\n        petshop_operational_staff: savedStaff,\n        message_templates: templates,\n      })\n      await auth.refreshSettings(effectiveModId)\n",
)

replace_once(
    'src/modules/petshop/hooks/usePetshopAdvancedCore.js',
    "    const res = await runScoped(async (includeTenant) => {\n      let query = supabase\n        .from('appointments')\n        .update({ responsible_staff_key: staffKey, responsible_staff_name: staffName })\n",
    "    const updates = { responsible_staff_key: staffKey, responsible_staff_name: staffName }\n    if (Array.isArray(staff.service_items) && staff.service_items.length) {\n      updates.service_items = staff.service_items\n    }\n\n    const res = await runScoped(async (includeTenant) => {\n      let query = supabase\n        .from('appointments')\n        .update(updates)\n",
)

replace_once(
    'src/modules/petshop/pages/EquipePage.jsx',
    "  Percent,\n  Printer,\n",
    "  Percent,\n  Pencil,\n  Printer,\n  Save,\n",
)
replace_once(
    'src/modules/petshop/pages/EquipePage.jsx',
    "import { normalizeOperationalStaff } from '../../../../shared/petshopOperations'\n",
    "import {\n  normalizeOperationalStaff,\n  PETSHOP_COMMISSION_RESET_TEMPLATE_KEY,\n} from '../../../../shared/petshopOperations'\n",
)
replace_once(
    'src/modules/petshop/pages/EquipePage.jsx',
    "  buildCommissionRows,\n  commissionHistoryLabel,\n} from '../lib/teamCommissionSummary'\n",
    "  buildCommissionRows,\n  commissionHistoryLabel,\n  hydrateLegacyCommissionAppointments,\n} from '../lib/teamCommissionSummary'\n",
)
replace_once(
    'src/modules/petshop/pages/EquipePage.jsx',
    "} from '../lib/deliveryOperations'\n",
    "} from '../lib/deliveryOperations'\nimport { persistPetshopTeamSettings } from '../lib/teamSettingsOperations'\n",
)
replace_once(
    'src/modules/petshop/pages/EquipePage.jsx',
    "const dateLabel = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '-'\n",
    "const dateLabel = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '-'\nconst dateTimeLabel = (value) => value ? new Date(value).toLocaleString('pt-BR') : '-'\n",
)
replace_once(
    'src/modules/petshop/pages/EquipePage.jsx',
    "  const [assigningServiceId, setAssigningServiceId] = useState('')\n  const [assigningDeliveryId, setAssigningDeliveryId] = useState('')\n",
    "  const [assigningServiceId, setAssigningServiceId] = useState('')\n  const [assigningDeliveryId, setAssigningDeliveryId] = useState('')\n  const [editingStaffKey, setEditingStaffKey] = useState('')\n  const [editingStaffName, setEditingStaffName] = useState('')\n  const [savingStaffKey, setSavingStaffKey] = useState('')\n  const [resettingCommissions, setResettingCommissions] = useState(false)\n",
)
replace_once(
    'src/modules/petshop/pages/EquipePage.jsx',
    "  const displayRows = useMemo(\n    () => buildCommissionRows(serviceHistory, configuredStaff),\n    [configuredStaff, serviceHistory],\n  )\n  const commissionPendingServices = useMemo(\n    () => pendingServices.filter(appointmentHasCommissionServices),\n    [pendingServices],\n  )\n",
    "  const commissionResetAt = storeSettings?.message_templates?.[PETSHOP_COMMISSION_RESET_TEMPLATE_KEY] || null\n  const hydratedServiceHistory = useMemo(\n    () => hydrateLegacyCommissionAppointments(serviceHistory, services),\n    [serviceHistory, services],\n  )\n  const hydratedPendingServices = useMemo(\n    () => hydrateLegacyCommissionAppointments(pendingServices, services),\n    [pendingServices, services],\n  )\n  const afterCommissionReset = (appointment) => {\n    if (!commissionResetAt) return true\n    const resetTime = new Date(commissionResetAt).getTime()\n    const appointmentTime = new Date(appointment?.scheduled_at || 0).getTime()\n    return !Number.isFinite(resetTime) || appointmentTime > resetTime\n  }\n  const commissionServiceHistory = useMemo(\n    () => hydratedServiceHistory.filter(afterCommissionReset),\n    [hydratedServiceHistory, commissionResetAt],\n  )\n  const displayRows = useMemo(\n    () => buildCommissionRows(commissionServiceHistory, configuredStaff),\n    [configuredStaff, commissionServiceHistory],\n  )\n  const commissionPendingServices = useMemo(\n    () => hydratedPendingServices.filter(afterCommissionReset).filter(appointmentHasCommissionServices),\n    [hydratedPendingServices, commissionResetAt],\n  )\n",
)
replace_once(
    'src/modules/petshop/pages/EquipePage.jsx',
    "      await assignPendingServiceResponsible(appointment.id, { key: person.key, name: person.name })\n",
    "      await assignPendingServiceResponsible(appointment.id, {\n        key: person.key,\n        name: person.name,\n        service_items: appointment.service_items,\n      })\n",
)
replace_once(
    'src/modules/petshop/pages/EquipePage.jsx',
    "    ? serviceHistory.filter((item) => (\n",
    "    ? commissionServiceHistory.filter((item) => (\n",
)
replace_once(
    'src/modules/petshop/pages/EquipePage.jsx',
    "    : [], [historyRow, serviceHistory])\n",
    "    : [], [historyRow, commissionServiceHistory])\n",
)
replace_once(
    'src/modules/petshop/pages/EquipePage.jsx',
    "  function resetRange() {\n    const next = emptyRange()\n    setRange(next)\n    void reload(next)\n  }\n\n",
    "  function resetRangeToMonth() {\n    const next = emptyRange()\n    setRange(next)\n    void reload(next)\n  }\n\n  async function saveStaffName(person) {\n    const cleanName = editingStaffName.trim()\n    if (!cleanName || !person?.key) return\n    const moduleId = activeModuleId || 'petshop'\n    const nextStaff = normalizeOperationalStaff(configuredStaff.map((item) => (\n      item.key === person.key ? { ...item, name: cleanName } : item\n    )))\n    const previousSettings = storeSettings\n    const optimisticTemplates = {\n      ...(storeSettings?.message_templates || {}),\n      __petshop_operational_staff: nextStaff,\n    }\n    setSavingStaffKey(person.key)\n    setError('')\n    auth.updateStoreSettings?.({\n      petshop_operational_staff: nextStaff,\n      message_templates: optimisticTemplates,\n    })\n    try {\n      const saved = await persistPetshopTeamSettings({\n        moduleId,\n        tenantId: activeTenantId,\n        currentSettings: { ...storeSettings, message_templates: optimisticTemplates },\n        staff: nextStaff,\n      })\n      auth.updateStoreSettings?.(saved)\n      setEditingStaffKey('')\n      setEditingStaffName('')\n      await auth.refreshSettings(moduleId)\n    } catch (err) {\n      auth.updateStoreSettings?.(previousSettings)\n      setError(err.message || 'Nao foi possivel alterar o nome da esteticista.')\n    } finally {\n      setSavingStaffKey('')\n    }\n  }\n\n  async function resetCommissionCycle() {\n    if (!window.confirm('Zerar o fechamento atual? Os agendamentos nao serao apagados; eles apenas ficarao fora do proximo ciclo de comissoes.')) return\n    const moduleId = activeModuleId || 'petshop'\n    const resetAt = new Date().toISOString()\n    const previousSettings = storeSettings\n    const optimisticTemplates = {\n      ...(storeSettings?.message_templates || {}),\n      [PETSHOP_COMMISSION_RESET_TEMPLATE_KEY]: resetAt,\n    }\n    setResettingCommissions(true)\n    setError('')\n    setHistoryRow(null)\n    auth.updateStoreSettings?.({ message_templates: optimisticTemplates })\n    try {\n      const saved = await persistPetshopTeamSettings({\n        moduleId,\n        tenantId: activeTenantId,\n        currentSettings: { ...storeSettings, message_templates: optimisticTemplates },\n        staff: configuredStaff,\n        templatePatch: { [PETSHOP_COMMISSION_RESET_TEMPLATE_KEY]: resetAt },\n      })\n      auth.updateStoreSettings?.(saved)\n      await auth.refreshSettings(moduleId)\n    } catch (err) {\n      auth.updateStoreSettings?.(previousSettings)\n      setError(err.message || 'Nao foi possivel zerar o fechamento de comissoes.')\n    } finally {\n      setResettingCommissions(false)\n    }\n  }\n\n  function renderEditableStaffName(person, compact = false) {\n    if (editingStaffKey === person.key) {\n      return (\n        <div className=\"flex items-center gap-2 flex-wrap\">\n          <input\n            className={`inp ${compact ? 'min-w-[150px] py-1 text-sm' : 'min-w-[190px]'}`}\n            value={editingStaffName}\n            autoFocus\n            onChange={(event) => setEditingStaffName(event.target.value)}\n            onKeyDown={(event) => {\n              if (event.key === 'Enter') void saveStaffName(person)\n              if (event.key === 'Escape') setEditingStaffKey('')\n            }}\n          />\n          <button type=\"button\" className=\"btn btn-primary btn-sm\" disabled={savingStaffKey === person.key} onClick={() => void saveStaffName(person)}>\n            <Save size={13}/> {savingStaffKey === person.key ? 'Salvando...' : 'Salvar'}\n          </button>\n          <button type=\"button\" className=\"btn btn-secondary btn-sm\" onClick={() => setEditingStaffKey('')}>Cancelar</button>\n        </div>\n      )\n    }\n    return (\n      <div className=\"flex items-center gap-2\">\n        <span className={compact ? 'font-semibold text-text' : 'font-display text-lg font-bold text-text'}>{person.name}</span>\n        <button\n          type=\"button\"\n          title=\"Editar nome da esteticista\"\n          aria-label={`Editar nome de ${person.name}`}\n          className=\"rounded-lg p-1.5 text-muted hover:text-emerald-400 hover:bg-emerald-500/10\"\n          onClick={() => { setEditingStaffKey(person.key); setEditingStaffName(person.name) }}\n        >\n          <Pencil size={13}/>\n        </button>\n      </div>\n    )\n  }\n\n",
)
replace_once(
    'src/modules/petshop/pages/EquipePage.jsx',
    "          <button onClick={resetRange} className=\"btn btn-secondary\"><RotateCcw size={15}/> Resetar periodo</button>\n",
    "          <button onClick={resetRangeToMonth} className=\"btn btn-secondary\">Periodo do mes</button>\n          {activeTab === 'fechamento' && (\n            <button onClick={() => void resetCommissionCycle()} disabled={resettingCommissions} className=\"btn btn-secondary\">\n              <RotateCcw size={15} className={resettingCommissions ? 'animate-spin' : ''}/> {resettingCommissions ? 'Zerando...' : 'Zerar fechamento'}\n            </button>\n          )}\n",
)
replace_once(
    'src/modules/petshop/pages/EquipePage.jsx',
    "      {activeTab === 'fechamento' && (\n        <div className=\"space-y-5\">\n",
    "      {activeTab === 'fechamento' && (\n        <div className=\"space-y-5\">\n          {commissionResetAt && (\n            <p className=\"text-xs text-muted\">Ultimo fechamento zerado em {dateTimeLabel(commissionResetAt)}. Agendamentos anteriores continuam preservados no historico operacional.</p>\n          )}\n",
)
replace_once(
    'src/modules/petshop/pages/EquipePage.jsx',
    "                <p className=\"mt-1 text-sm text-muted\">Tosa 10%: maquina, total ou tesoura. Banho 5%. Outros 5%. MotoDog, transporte e entrega ficam fora deste calculo. MotoDog, transporte e entrega ficam fora deste calculo.</p>\n",
    "                <p className=\"mt-1 text-sm text-muted\">Tosa 10%: maquina, total ou tesoura. Banho 5%. Outros 5%. MotoDog, transporte e entrega ficam fora deste calculo.</p>\n",
)
replace_once(
    'src/modules/petshop/pages/EquipePage.jsx',
    "                    <td className=\"font-semibold text-text\">{row.collaborator_name}</td>\n",
    "                    <td>{renderEditableStaffName(configuredStaffByKey.get(row.staff_key) || { key: row.staff_key, name: row.collaborator_name, active: true }, true)}</td>\n",
)
replace_once(
    'src/modules/petshop/pages/EquipePage.jsx',
    "                    <div><p className=\"font-display text-lg font-bold text-text\">{person.name}</p><p className=\"mt-1 text-xs text-muted\">{row?.service_count || 0} servico(s) no periodo</p></div>\n",
    "                    <div>{renderEditableStaffName(person)}<p className=\"mt-1 text-xs text-muted\">{row?.service_count || 0} servico(s) no periodo</p></div>\n",
)

replace_once(
    'test/teamDeliveryAndCommissionSummary.test.mjs',
    "  assert.match(page, /Resetar periodo/)\n",
    "  assert.match(page, /Zerar fechamento/)\n  assert.match(page, /Editar nome da esteticista/)\n  assert.match(page, /PETSHOP_COMMISSION_RESET_TEMPLATE_KEY/)\n",
)
with Path('test/teamDeliveryAndCommissionSummary.test.mjs').open('a') as file:
    file.write("""

test('registros antigos genericos nao viram tosa automaticamente', async () => {
  const { appointmentCommissionLines, buildCommissionRows } = await import('../src/modules/petshop/lib/teamCommissionSummary.js')
  const appointment = {
    id: 'legacy-bath',
    service_type: 'banho_tosa',
    service_group: 'banho_tosa',
    service_items: [],
    price: 45,
    responsible_staff_key: 'esteticista-1',
    responsible_staff_name: 'Esteticista 1',
  }
  const lines = appointmentCommissionLines(appointment)
  assert.equal(lines[0].category, 'bath')
  assert.equal(lines[0].commission, 2.25)

  const rows = buildCommissionRows([appointment], [{ key: 'esteticista-1', name: 'Luana', active: true }])
  assert.equal(rows[0].collaborator_name, 'Luana')
  assert.equal(rows[0].bath_count, 1)
  assert.equal(rows[0].machine_grooming_count, 0)
})

test('banho com tosa higienica continua classificado como banho', async () => {
  const { appointmentCommissionLines } = await import('../src/modules/petshop/lib/teamCommissionSummary.js')
  const [line] = appointmentCommissionLines({
    id: 'bath-hygiene',
    service_group: 'banho_tosa',
    service_items: [{ name: 'Banho com tosa higienica', group_type: 'banho_tosa', unit_price: 50 }],
  })
  assert.equal(line.category, 'bath')
  assert.equal(line.rate, 0.05)
})
""")
