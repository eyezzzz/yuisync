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
advanced = 'src/modules/petshop/hooks/usePetshopAdvanced.js'
settings = 'src/shared/pages/SettingsPage.jsx'
test_file = 'test/agendaOperationalInfrastructure.test.mjs'

replace_once(
    agenda,
    "  const [view, setView]             = useState('list')  // 'list' | 'kanban' | 'agenda'\n",
    "  const [view, setView]             = useState('list')  // 'list' | 'kanban' | 'agenda'\n  const [agendaPeriod, setAgendaPeriod] = useState('day') // 'day' | 'week'\n",
    'agenda period state',
)
replace_once(
    agenda,
    "  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate])\n  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart])\n  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])\n",
    "  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate])\n  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart])\n  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])\n  const agendaDays = useMemo(() => agendaPeriod === 'day' ? [selectedDate] : weekDays, [agendaPeriod, selectedDate, weekDays])\n  const agendaStart = agendaPeriod === 'day' ? selectedDate : weekStart\n  const agendaEnd = agendaPeriod === 'day' ? selectedDate : weekEnd\n",
    'agenda period range',
)
replace_once(
    agenda,
    "  useEffect(() => {\n    if (view === 'agenda') {\n      load({\n        startDate: isoDate(weekStart),\n        endDate: isoDate(weekEnd),\n        status: filterStatus || undefined,\n      })\n      return\n    }\n\n    load({ date: isoDate(selectedDate), status: filterStatus || undefined })\n  }, [selectedDate, filterStatus, view, weekStart, weekEnd, load])\n",
    "  useEffect(() => {\n    if (view === 'agenda') {\n      load({\n        startDate: isoDate(agendaStart),\n        endDate: isoDate(agendaEnd),\n        status: filterStatus || undefined,\n      })\n      return\n    }\n\n    load({ date: isoDate(selectedDate), status: filterStatus || undefined })\n  }, [selectedDate, filterStatus, view, agendaPeriod, weekStart, weekEnd, load])\n",
    'agenda load range',
)
replace_once(
    agenda,
    "  const reloadCurrentView = () => {\n    if (view === 'agenda') {\n      load({ startDate: isoDate(weekStart), endDate: isoDate(weekEnd), status: filterStatus || undefined })\n      return\n    }\n",
    "  const reloadCurrentView = () => {\n    if (view === 'agenda') {\n      load({ startDate: isoDate(agendaStart), endDate: isoDate(agendaEnd), status: filterStatus || undefined })\n      return\n    }\n",
    'agenda reload range',
)
replace_once(
    agenda,
    "          <p className=\"text-sm font-bold text-text\">Agenda semanal</p>\n          <p className=\"text-xs text-muted\">\n            {days[0]?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}\n            {' ate '}\n            {days[days.length - 1]?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}\n          </p>\n",
    "          <p className=\"text-sm font-bold text-text\">Agenda {days.length === 1 ? 'diaria' : 'semanal'}</p>\n          <p className=\"text-xs text-muted\">\n            {days.length === 1 ? (\n              days[0]?.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })\n            ) : (\n              <>\n                {days[0]?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}\n                {' ate '}\n                {days[days.length - 1]?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}\n              </>\n            )}\n          </p>\n",
    'agenda period title',
)
replace_once(agenda, '        <div className="min-w-[1160px]">\n', "        <div className={days.length === 1 ? 'min-w-[520px]' : 'min-w-[1160px]'}>\n", 'agenda width')
text = Path(agenda).read_text(encoding='utf-8')
old_grid = "style={{ gridTemplateColumns: '76px repeat(7, minmax(250px, 1fr))' }}"
if text.count(old_grid) != 2:
    raise SystemExit(f'agenda grids: expected two matches, found {text.count(old_grid)}')
text = text.replace(old_grid, "style={{ gridTemplateColumns: `76px repeat(${days.length}, minmax(${days.length === 1 ? '360px' : '250px'}, 1fr))` }}")
Path(agenda).write_text(text, encoding='utf-8')
replace_once(
    agenda,
    "        </div>\n\n        <button onClick={reloadCurrentView}\n",
    "        </div>\n\n        {view === 'agenda' && (\n          <div className=\"flex bg-card border border-[var(--border)] rounded-xl p-1\">\n            {[\n              { id: 'day', label: 'Diaria' },\n              { id: 'week', label: 'Semanal' },\n            ].map((period) => (\n              <button\n                key={period.id}\n                type=\"button\"\n                onClick={() => setAgendaPeriod(period.id)}\n                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${\n                  agendaPeriod === period.id ? 'bg-amber-500 text-gray-950' : 'text-muted hover:text-text'\n                }`}\n              >\n                {period.label}\n              </button>\n            ))}\n          </div>\n        )}\n\n        <button onClick={reloadCurrentView}\n",
    'agenda period toggle',
)
replace_once(agenda, '          days={weekDays}\n', '          days={agendaDays}\n', 'agenda visible days')

helpers = r'''
const normalizeCatalogText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const catalogServiceCode = (productId = '') => `catalog_${String(productId).replace(/-/g, '')}`

const isCatalogServiceProduct = (product = {}) => {
  const metadata = product.bot_metadata && typeof product.bot_metadata === 'object' ? product.bot_metadata : {}
  const category = normalizeCatalogText(product.category)
  const name = normalizeCatalogText(product.name)
  const text = normalizeCatalogText([product.name, product.category, product.description, metadata.product_type].filter(Boolean).join(' '))
  if (/racao|petisco|medicamento|acessorio|areia|brinquedo/.test(category)) return false
  if (/banheira|banho (?:a )?seco|brinquedo|casinha|roupa|shampoo|varinha/.test(name)) return false
  if (/pacote.*banho|banho.*pacote/.test(name)) return false
  return metadata.product_type === 'servico'
    || category === 'servico'
    || /banho|tosa|desembolo|escovac|hidrat|higieniz|consulta|vacina|exame|cirurg|ultrassom|castr|curativo|microchip/.test(text)
}

const inferCatalogServiceGroup = (product = {}) => {
  const metadata = product.bot_metadata && typeof product.bot_metadata === 'object' ? product.bot_metadata : {}
  if (['banho_tosa', 'veterinaria', 'outro'].includes(metadata.service_group)) return metadata.service_group
  const text = normalizeCatalogText([product.name, product.category, product.description].filter(Boolean).join(' '))
  if (/vet|veterin|consulta|vacina|clinica|medico|exame|cirurg|ultrassom|castr|retorno|internac|curativo|vermifug|microchip|aplicacao|hemograma|radiograf|raio[ -]?x|coleta|sorolog|odontolog|anestesia|medicacao|eletrocard|ecocard|emergencia|procedimento/.test(text)) return 'veterinaria'
  if (/banho|tosa|desembolo|escovac|hidrat|higien|groom|perfume|spa|trim|unha|ouvido|orelha/.test(text)) return 'banho_tosa'
  return 'outro'
}
'''
replace_once(advanced, "const isSalePaymentSplitSchemaError = (error) => {\n", helpers + "\nconst isSalePaymentSplitSchemaError = (error) => {\n", 'catalog helpers')

new_loader = r'''const loadPetshopServices = useCallback(async () => {
    const [productsRes, linkedServicesRes] = await Promise.all([
      runScoped(async (includeTenant) => {
        let q = supabase
          .from('products')
          .select('id,name,category,description,price,active,bot_metadata')
          .eq('module_id', moduleId)
          .eq('active', true)
          .order('name', { ascending: true })
        return applyTenantFilter(q, activeTenantId, includeTenant)
      }),
      runScoped(async (includeTenant) => {
        let q = supabase
          .from('petshop_services')
          .select('*')
          .eq('module_id', moduleId)
          .not('source_product_id', 'is', null)
        return applyTenantFilter(q, activeTenantId, includeTenant)
      }),
    ])

    if (productsRes.error) throw productsRes.error
    if (linkedServicesRes.error && !isPetshopServicesSchemaError(linkedServicesRes.error)) {
      throw linkedServicesRes.error
    }

    const linkedByProductId = new Map((linkedServicesRes.data || []).map((service) => [service.source_product_id, service]))
    const services = (productsRes.data || [])
      .filter(isCatalogServiceProduct)
      .map((product) => {
        const linked = linkedByProductId.get(product.id) || {}
        const metadata = product.bot_metadata && typeof product.bot_metadata === 'object' ? product.bot_metadata : {}
        const groupType = inferCatalogServiceGroup(product)
        return {
          ...linked,
          id: linked.id || product.id,
          code: linked.code || catalogServiceCode(product.id),
          name: String(product.name || '').trim(),
          group_type: groupType,
          default_price: Number(product.price || 0),
          default_duration_min: Math.max(15, Number(
            linked.default_duration_min
            ?? metadata.duration_min
            ?? metadata.service_duration_min
            ?? 60
          )),
          commission_type: linked.commission_type || 'percentage',
          commission_rate: Number(linked.commission_rate || 0),
          active: product.active !== false,
          sort_order: Number(linked.sort_order ?? 500),
          icon: linked.icon || (groupType === 'veterinaria' ? 'stethoscope' : groupType === 'banho_tosa' ? 'droplets' : 'paw'),
          source_product_id: product.id,
        }
      })

    return normalizeServices(services)
  }, [activeTenantId, moduleId, runScoped])'''
regex_once(
    advanced,
    r"const loadPetshopServices = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[activeTenantId, moduleId, runScoped\]\)",
    new_loader,
    'catalog-backed service loader',
)

replace_once(
    settings,
    "      if (savingFiscalSettings) {\n        const safeNextInvoice = Math.max(1, Number(form.next_invoice_number || 1))\n",
    "      if (effectiveModId === 'petshop') {\n        const expectedStaff = normalizeOperationalStaff(form.petshop_operational_staff)\n        const staffResponse = await runWithTenantFallback(activeTenantId, async (includeTenant) => {\n          let query = supabase\n            .from('settings')\n            .update({\n              petshop_operational_staff: expectedStaff,\n              updated_at: new Date().toISOString(),\n            })\n            .eq('module_id', effectiveModId)\n\n          if (includeTenant && activeTenantId) query = query.eq('tenant_id', activeTenantId)\n          return query.select('petshop_operational_staff').single()\n        })\n\n        if (staffResponse.error) {\n          throw new Error(`Nao foi possivel salvar os nomes da equipe. Aplique a migration 20260727003000_petshop_operational_staff_persistence.sql. ${staffResponse.error.message || ''}`.trim())\n        }\n\n        const savedStaff = normalizeOperationalStaff(staffResponse.data?.petshop_operational_staff)\n        const signature = (rows) => JSON.stringify(rows.map(({ key, name, active }) => ({ key, name, active })))\n        if (signature(savedStaff) !== signature(expectedStaff)) {\n          throw new Error('O banco nao confirmou os nomes informados para a equipe operacional.')\n        }\n      }\n\n      if (savingFiscalSettings) {\n        const safeNextInvoice = Math.max(1, Number(form.next_invoice_number || 1))\n",
    'dedicated staff persistence',
)

replace_once(
    test_file,
    "  const [migration, agenda, appointments, advanced, commissions] = await Promise.all([\n",
    "  const [migration, staffMigration, catalogMigration, agenda, appointments, advanced, commissions, settings] = await Promise.all([\n",
    'test fixtures',
)
replace_once(
    test_file,
    "    readFile(new URL('../supabase/migrations/20260727001000_agenda_capacity_operational_commissions.sql', import.meta.url), 'utf8'),\n    readFile(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8'),\n",
    "    readFile(new URL('../supabase/migrations/20260727001000_agenda_capacity_operational_commissions.sql', import.meta.url), 'utf8'),\n    readFile(new URL('../supabase/migrations/20260727003000_petshop_operational_staff_persistence.sql', import.meta.url), 'utf8'),\n    readFile(new URL('../supabase/migrations/20260727004000_reconcile_agenda_service_catalog.sql', import.meta.url), 'utf8'),\n    readFile(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8'),\n",
    'test migrations',
)
replace_once(
    test_file,
    "    readFile(new URL('../src/modules/petshop/pages/EquipePage.jsx', import.meta.url), 'utf8'),\n  ])\n",
    "    readFile(new URL('../src/modules/petshop/pages/EquipePage.jsx', import.meta.url), 'utf8'),\n    readFile(new URL('../src/shared/pages/SettingsPage.jsx', import.meta.url), 'utf8'),\n  ])\n",
    'test settings fixture',
)
replace_once(
    test_file,
    "  assert.ok(agenda.includes('Vaga {laneIndex + 1} disponivel'))\n",
    "  assert.ok(agenda.includes('Vaga {laneIndex + 1} disponivel'))\n  assert.match(agenda, /agendaPeriod/)\n  assert.match(agenda, /days=\{agendaDays\}/)\n  assert.match(agenda, /activeAgendaTab === 'banho_tosa' \? MANUAL_SLOT_CAPACITY : 1/)\n  assert.match(staffMigration, /add column if not exists petshop_operational_staff/)\n  assert.match(catalogMigration, /sync_product_service_to_petshop_services/)\n  assert.match(advanced, /from\('products'\)/)\n  assert.match(advanced, /inferCatalogServiceGroup/)\n  assert.match(advanced, /return 'veterinaria'/)\n  assert.match(advanced, /return 'banho_tosa'/)\n  assert.match(advanced, /source_product_id/)\n  assert.match(settings, /select\('petshop_operational_staff'\)\.single\(\)/)\n",
    'test new behavior',
)
