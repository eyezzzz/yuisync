from pathlib import Path


def replace_once(path, old, new, label):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


agenda = 'src/modules/petshop/pages/AgendaPage.jsx'
settings = 'src/shared/pages/SettingsPage.jsx'
team = 'src/modules/petshop/pages/EquipePage.jsx'
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
    "          <div className=\"flex items-start justify-between gap-2 pr-5\">\n            <div className=\"min-w-0\">\n              <p className=\"text-[11px] font-black leading-tight\">{fmtAppointmentInterval(appt)}</p>\n              <p className=\"mt-1 truncate text-xs font-bold text-text\">{appt.pets?.pet_name || 'Pet'}</p>\n              <p className=\"truncate text-[11px] font-semibold text-text/90\">Tutor: {appt.pets?.owner_name || 'Cliente'}</p>\n            </div>\n            <span className={`badge ${sb.cls} shrink-0 text-[9px]`}>{sb.label}</span>\n          </div>\n",
    "          <div className=\"min-w-0\">\n            <div className=\"flex min-w-0 flex-wrap items-center gap-1\">\n              <p className=\"shrink-0 whitespace-nowrap text-[10px] font-black leading-tight\">{fmtAppointmentInterval(appt)}</p>\n              <span className={`badge ${sb.cls} max-w-full truncate text-[9px]`}>{sb.label}</span>\n            </div>\n            <p className=\"mt-1 truncate text-xs font-bold text-text\">{appt.pets?.pet_name || 'Pet'}</p>\n            <p className=\"truncate text-[11px] font-semibold text-text/90\">Tutor: {appt.pets?.owner_name || 'Cliente'}</p>\n          </div>\n",
    'agenda card layout',
)

replace_once(
    agenda,
    "          <p className=\"text-sm font-bold text-text\">Agenda semanal</p>\n          <p className=\"text-xs text-muted\">\n            {days[0]?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}\n            {' ate '}\n            {days[days.length - 1]?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}\n          </p>\n",
    "          <p className=\"text-sm font-bold text-text\">Agenda {days.length === 1 ? 'diaria' : 'semanal'}</p>\n          <p className=\"text-xs text-muted\">\n            {days.length === 1 ? (\n              days[0]?.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })\n            ) : (\n              <>\n                {days[0]?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}\n                {' ate '}\n                {days[days.length - 1]?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}\n              </>\n            )}\n          </p>\n",
    'agenda title',
)

replace_once(
    agenda,
    "          {slotCapacity} vagas por horario\n",
    "          {slotCapacity} {slotCapacity === 1 ? 'vaga' : 'vagas'} por horario\n",
    'agenda capacity label',
)

replace_once(
    agenda,
    "        <div className=\"min-w-[1160px]\">\n",
    "        <div className={days.length === 1 ? 'min-w-[520px]' : 'min-w-[1160px]'}>\n",
    'agenda min width',
)

text = Path(agenda).read_text(encoding='utf-8')
old_grid = "style={{ gridTemplateColumns: '76px repeat(7, minmax(250px, 1fr))' }}"
if text.count(old_grid) != 2:
    raise SystemExit(f'agenda dynamic grid: expected two matches, found {text.count(old_grid)}')
text = text.replace(old_grid, "style={{ gridTemplateColumns: `76px repeat(${days.length}, minmax(${days.length === 1 ? '360px' : '250px'}, 1fr))` }}")
Path(agenda).write_text(text, encoding='utf-8')

replace_once(
    agenda,
    "                    <div className=\"grid grid-cols-2 gap-2\">\n",
    "                    <div className={`grid gap-2 ${slotCapacity === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>\n",
    'agenda capacity grid',
)

replace_once(
    agenda,
    "        <div className=\"flex bg-card border border-[var(--border)] rounded-xl p-1\">\n          {[\n            { id:'list',   label:'Lista'  },\n            { id:'agenda', label:'Agenda' },\n            { id:'kanban', label:'Kanban' },\n          ].map(v => (\n            <button key={v.id} onClick={() => setView(v.id)}\n              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${\n                view === v.id ? 'bg-amber-500 text-gray-950' : 'text-muted hover:text-text'\n              }`}>\n              {v.label}\n            </button>\n          ))}\n        </div>\n",
    "        <div className=\"flex bg-card border border-[var(--border)] rounded-xl p-1\">\n          {[\n            { id:'list',   label:'Lista'  },\n            { id:'agenda', label:'Agenda' },\n            { id:'kanban', label:'Kanban' },\n          ].map(v => (\n            <button key={v.id} onClick={() => setView(v.id)}\n              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${\n                view === v.id ? 'bg-amber-500 text-gray-950' : 'text-muted hover:text-text'\n              }`}>\n              {v.label}\n            </button>\n          ))}\n        </div>\n\n        {view === 'agenda' && (\n          <div className=\"flex bg-card border border-[var(--border)] rounded-xl p-1\">\n            {[\n              { id: 'day', label: 'Diaria' },\n              { id: 'week', label: 'Semanal' },\n            ].map((period) => (\n              <button\n                key={period.id}\n                type=\"button\"\n                onClick={() => setAgendaPeriod(period.id)}\n                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${\n                  agendaPeriod === period.id ? 'bg-amber-500 text-gray-950' : 'text-muted hover:text-text'\n                }`}\n              >\n                {period.label}\n              </button>\n            ))}\n          </div>\n        )}\n",
    'agenda period controls',
)

replace_once(agenda, '          days={weekDays}\n', '          days={agendaDays}\n', 'agenda visible days')
replace_once(agenda, '          slotCapacity={MANUAL_SLOT_CAPACITY}\n', "          slotCapacity={activeAgendaTab === 'banho_tosa' ? MANUAL_SLOT_CAPACITY : 1}\n", 'agenda capacity by service area')

replace_once(
    settings,
    "  async function handleSave() {\n    if (!canEdit || !effectiveModId) return\n    const hoursError = validateStoreAndBookingHours(form.store_business_hours, form.petbot_business_hours)\n",
    "  async function handleSave() {\n    if (!canEdit || !effectiveModId) return\n    const savingFiscalSettings = effectiveModId === 'petshop' && petSettingsTab === 'fiscal'\n    const hoursError = validateStoreAndBookingHours(form.store_business_hours, form.petbot_business_hours)\n",
    'settings fiscal scope',
)
replace_once(
    settings,
    "    if (effectiveModId === 'petshop' && form.fiscal_provider === 'mock_local' && !isTestTenant) {\n",
    "    if (savingFiscalSettings && form.fiscal_provider === 'mock_local' && !isTestTenant) {\n",
    'settings fiscal validation',
)
replace_once(
    settings,
    "      if (effectiveModId === 'petshop') {\n        const safeNextInvoice = Math.max(1, Number(form.next_invoice_number || 1))\n",
    "      if (effectiveModId === 'petshop') {\n        const expectedStaff = normalizeOperationalStaff(form.petshop_operational_staff)\n        const staffResponse = await runWithTenantFallback(activeTenantId, async (includeTenant) => {\n          let query = supabase\n            .from('settings')\n            .update({\n              petshop_operational_staff: expectedStaff,\n              updated_at: new Date().toISOString(),\n            })\n            .eq('module_id', effectiveModId)\n\n          if (includeTenant && activeTenantId) query = query.eq('tenant_id', activeTenantId)\n          return query.select('petshop_operational_staff').single()\n        })\n\n        if (staffResponse.error) {\n          throw new Error(`Nao foi possivel salvar os nomes da equipe. Aplique a migration 20260727003000_petshop_operational_staff_persistence.sql. ${staffResponse.error.message || ''}`.trim())\n        }\n\n        const savedStaff = normalizeOperationalStaff(staffResponse.data?.petshop_operational_staff)\n        const expectedSignature = JSON.stringify(expectedStaff.map(({ key, name, active }) => ({ key, name, active })))\n        const savedSignature = JSON.stringify(savedStaff.map(({ key, name, active }) => ({ key, name, active })))\n        if (savedSignature !== expectedSignature) {\n          throw new Error('O banco nao confirmou os nomes informados para a equipe operacional.')\n        }\n      }\n\n      if (savingFiscalSettings) {\n        const safeNextInvoice = Math.max(1, Number(form.next_invoice_number || 1))\n",
    'settings dedicated staff save',
)

replace_once(
    settings,
    "  async function handleCreateTenant() {\n",
    "  function updateOperationalStaff(index, patch) {\n    setForm((prev) => {\n      const rows = Array.isArray(prev.petshop_operational_staff)\n        ? prev.petshop_operational_staff\n        : normalizeOperationalStaff(prev.petshop_operational_staff)\n      return {\n        ...prev,\n        petshop_operational_staff: rows.map((item, itemIndex) => (\n          itemIndex === index ? { ...item, ...patch } : item\n        )),\n      }\n    })\n  }\n\n  function addOperationalStaff() {\n    setForm((prev) => {\n      const rows = Array.isArray(prev.petshop_operational_staff)\n        ? prev.petshop_operational_staff\n        : normalizeOperationalStaff(prev.petshop_operational_staff)\n      const nextIndex = rows.length + 1\n      return {\n        ...prev,\n        petshop_operational_staff: [\n          ...rows,\n          { key: `esteticista-${nextIndex}`, name: `Esteticista ${nextIndex}`, active: true },\n        ],\n      }\n    })\n  }\n\n  async function handleCreateTenant() {\n",
    'settings operational staff helpers',
)

replace_once(
    settings,
    "                  {normalizeOperationalStaff(form.petshop_operational_staff).map((person, index) => (\n                    <div key={person.key} className=\"grid grid-cols-1 md:grid-cols-[1fr_110px] items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4\">\n                      <div><label className=\"inp-label\">Esteticista {index + 1}</label><input className=\"inp\" disabled={!canEdit} value={person.name} onChange={(event) => setForm((prev) => ({ ...prev, petshop_operational_staff: normalizeOperationalStaff(prev.petshop_operational_staff).map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} /></div>\n                      <label className=\"flex items-center gap-2 text-xs text-muted\"><input type=\"checkbox\" disabled={!canEdit} checked={person.active} onChange={(event) => setForm((prev) => ({ ...prev, petshop_operational_staff: normalizeOperationalStaff(prev.petshop_operational_staff).map((item, itemIndex) => itemIndex === index ? { ...item, active: event.target.checked } : item) }))} />Ativa</label>\n                    </div>\n                  ))}\n                  {normalizeOperationalStaff(form.petshop_operational_staff).length < 4 && (\n                    <button type=\"button\" disabled={!canEdit} className=\"btn btn-secondary\" onClick={() => setForm((prev) => ({ ...prev, petshop_operational_staff: [...normalizeOperationalStaff(prev.petshop_operational_staff), { key: `esteticista-${normalizeOperationalStaff(prev.petshop_operational_staff).length + 1}`, name: `Esteticista ${normalizeOperationalStaff(prev.petshop_operational_staff).length + 1}`, active: true }] }))}><Plus size={14}/> Adicionar profissional</button>\n                  )}\n",
    "                  {(Array.isArray(form.petshop_operational_staff)\n                    ? form.petshop_operational_staff\n                    : normalizeOperationalStaff(form.petshop_operational_staff)\n                  ).map((person, index) => (\n                    <div key={person.key} className=\"grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_110px] items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4\">\n                      <div className=\"min-w-0\">\n                        <label className=\"inp-label\">Esteticista {index + 1}</label>\n                        <input className=\"inp\" disabled={!canEdit} value={person.name} onChange={(event) => updateOperationalStaff(index, { name: event.target.value })} />\n                      </div>\n                      <label className=\"flex items-center gap-2 text-xs text-muted\">\n                        <input type=\"checkbox\" disabled={!canEdit} checked={person.active !== false} onChange={(event) => updateOperationalStaff(index, { active: event.target.checked })} />\n                        Ativa\n                      </label>\n                    </div>\n                  ))}\n                  {(Array.isArray(form.petshop_operational_staff)\n                    ? form.petshop_operational_staff\n                    : normalizeOperationalStaff(form.petshop_operational_staff)\n                  ).length < 4 && (\n                    <button type=\"button\" disabled={!canEdit} className=\"btn btn-secondary\" onClick={addOperationalStaff}><Plus size={14}/> Adicionar profissional</button>\n                  )}\n",
    'settings staff inputs',
)

replace_once(
    team,
    "  const configuredStaff = useMemo(\n    () => normalizeOperationalStaff(storeSettings?.petshop_operational_staff),\n    [storeSettings?.petshop_operational_staff],\n  )\n\n  const staffCards = useMemo(() => {\n",
    "  const configuredStaff = useMemo(\n    () => normalizeOperationalStaff(storeSettings?.petshop_operational_staff),\n    [storeSettings?.petshop_operational_staff],\n  )\n  const configuredStaffByKey = useMemo(\n    () => new Map(configuredStaff.map((person) => [person.key, person])),\n    [configuredStaff],\n  )\n  const displayRows = useMemo(() => rows.map((row) => ({\n    ...row,\n    collaborator_name: configuredStaffByKey.get(row.staff_key)?.name\n      || row.collaborator_name\n      || row.staff_key,\n  })), [configuredStaffByKey, rows])\n\n  const staffCards = useMemo(() => {\n",
    'commission configured names',
)
replace_once(team, '  const totals = useMemo(() => rows.reduce((acc, row) => ({\n', '  const totals = useMemo(() => displayRows.reduce((acc, row) => ({\n', 'commission totals rows')
replace_once(team, '  }), [rows])\n', '  }), [displayRows])\n', 'commission totals dependency')
replace_once(team, '            <button onClick={() => exportCommissionCsv(rows)} className="btn btn-secondary">\n', '            <button onClick={() => exportCommissionCsv(displayRows)} className="btn btn-secondary">\n', 'commission csv names')
replace_once(team, '                {rows.map((row) => (\n', '                {displayRows.map((row) => (\n', 'commission table names')

replace_once(
    test_file,
    "  const [migration, agenda, appointments, advanced, commissions] = await Promise.all([\n",
    "  const [migration, staffMigration, agenda, appointments, advanced, commissions, settings] = await Promise.all([\n",
    'test fixture list',
)
replace_once(
    test_file,
    "    readFile(new URL('../supabase/migrations/20260727001000_agenda_capacity_operational_commissions.sql', import.meta.url), 'utf8'),\n    readFile(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8'),\n",
    "    readFile(new URL('../supabase/migrations/20260727001000_agenda_capacity_operational_commissions.sql', import.meta.url), 'utf8'),\n    readFile(new URL('../supabase/migrations/20260727003000_petshop_operational_staff_persistence.sql', import.meta.url), 'utf8'),\n    readFile(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8'),\n",
    'test staff migration fixture',
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
    "  assert.ok(agenda.includes('Vaga {laneIndex + 1} disponivel'))\n  assert.match(agenda, /agendaPeriod/)\n  assert.match(agenda, /days=\{agendaDays\}/)\n  assert.match(agenda, /activeAgendaTab === 'banho_tosa' \? MANUAL_SLOT_CAPACITY : 1/)\n  assert.match(staffMigration, /add column if not exists petshop_operational_staff/)\n  assert.match(settings, /select\('petshop_operational_staff'\)\.single\(\)/)\n  assert.match(settings, /savingFiscalSettings/)\n  assert.match(settings, /updateOperationalStaff/)\n",
    'test daily agenda and staff persistence assertions',
)
