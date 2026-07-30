import { readFile, writeFile } from 'node:fs/promises'

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Trecho nao encontrado: ${label}`)
  return source.replace(before, after)
}

const agendaPath = 'src/modules/petshop/pages/AgendaPage.jsx'
let agenda = await readFile(agendaPath, 'utf8')

const dailyBefore = `                    {appt.status === 'concluido' && (
                      <button
                        type="button"
                        aria-label="Reimprimir ficha concluida"
                        title="Reimprimir ficha 80 mm"
                        onClick={() => onReceipt(appt)}
                        className="shrink-0 rounded-md p-1.5 text-emerald-300 hover:bg-emerald-500/15"
                      >
                        <Receipt size={13}/>
                      </button>
                    )}`
const dailyAfter = `                    <button
                      type="button"
                      aria-label="Imprimir ficha do historico"
                      title="Imprimir ficha 80 mm"
                      onClick={() => onReceipt(appt)}
                      className="shrink-0 rounded-md p-1.5 text-emerald-300 hover:bg-emerald-500/15"
                    >
                      <Receipt size={13}/>
                    </button>`
agenda = replaceExact(agenda, dailyBefore, dailyAfter, 'impressao do historico diario')

const weeklyBefore = `                              {completed && (
                                <button
                                  type="button"
                                  aria-label="Reimprimir ficha concluida"
                                  title="Reimprimir ficha 80 mm"
                                  onClick={() => onReceipt(appt)}
                                  className="shrink-0 rounded p-1 text-emerald-300 hover:bg-emerald-500/15"
                                >
                                  <Receipt size={11}/>
                                </button>
                              )}`
const weeklyAfter = `                              <button
                                type="button"
                                aria-label="Imprimir ficha do historico"
                                title="Imprimir ficha 80 mm"
                                onClick={() => onReceipt(appt)}
                                className="shrink-0 rounded p-1 text-emerald-300 hover:bg-emerald-500/15"
                              >
                                <Receipt size={11}/>
                              </button>`
agenda = replaceExact(agenda, weeklyBefore, weeklyAfter, 'impressao do historico semanal')
await writeFile(agendaPath, agenda)

const teamPath = 'src/modules/petshop/pages/EquipePage.jsx'
let team = await readFile(teamPath, 'utf8')
team = replaceExact(
  team,
  `    loadPetshopServices,\n  } = usePetshopAdvanced()`,
  `    loadPetshopServices,\n    assignPendingServiceResponsible,\n  } = usePetshopAdvanced()`,
  'funcao de atribuicao no hook',
)
team = replaceExact(
  team,
  `  const [error, setError] = useState('')`,
  `  const [error, setError] = useState('')\n  const [assigningServiceId, setAssigningServiceId] = useState('')`,
  'estado de atribuicao',
)
team = replaceExact(
  team,
  `  const configuredStaffByKey = useMemo(\n    () => new Map(configuredStaff.map((person) => [person.key, person])),\n    [configuredStaff],\n  )`,
  `  const configuredStaffByKey = useMemo(\n    () => new Map(configuredStaff.map((person) => [person.key, person])),\n    [configuredStaff],\n  )\n  const assignableStaff = useMemo(\n    () => configuredStaff.filter((person) => person.active !== false),\n    [configuredStaff],\n  )`,
  'lista de responsaveis ativos',
)
team = replaceExact(
  team,
  `  useEffect(() => {\n    reload()\n  }, [])`,
  `  async function assignPendingResponsible(appointment, staffKey) {\n    if (!appointment?.id || !staffKey || appointment.responsible_staff_key) return\n    const person = configuredStaffByKey.get(staffKey)\n    if (!person) return\n\n    setAssigningServiceId(appointment.id)\n    setError('')\n    try {\n      await assignPendingServiceResponsible(appointment.id, { key: person.key, name: person.name })\n      await reload(range)\n    } catch (err) {\n      setError(err.message)\n    } finally {\n      setAssigningServiceId('')\n    }\n  }\n\n  useEffect(() => {\n    reload()\n  }, [])`,
  'acao manual de responsavel',
)
team = replaceExact(
  team,
  `<p className="text-sm text-muted mt-1">Escolha o responsavel na Agenda para incluir estes atendimentos no fechamento.</p>`,
  `<p className="text-sm text-muted mt-1">Escolha abaixo o responsavel para incluir estes atendimentos no fechamento.</p>`,
  'orientacao de responsavel',
)
team = replaceExact(
  team,
  `                    <p className="text-xs text-muted mt-1">{dateLabel(appt.scheduled_at)} • {fmtCurrency(appt.price || 0)}</p>`,
  `                    <p className="text-xs text-muted mt-1">{dateLabel(appt.scheduled_at)} • {fmtCurrency(appt.price || 0)}</p>\n                    <select\n                      aria-label={\`Responsavel manual do servico \${appt.id}\`}\n                      className="inp mt-3 text-xs"\n                      defaultValue=""\n                      disabled={assigningServiceId === appt.id || assignableStaff.length === 0}\n                      onChange={(event) => {\n                        const staffKey = event.target.value\n                        if (staffKey) void assignPendingResponsible(appt, staffKey)\n                      }}\n                    >\n                      <option value="">{assigningServiceId === appt.id ? 'Salvando...' : 'Selecionar responsavel'}</option>\n                      {assignableStaff.map((person) => (\n                        <option key={person.key} value={person.key}>{person.name}</option>\n                      ))}\n                    </select>`,
  'seletor manual no atendimento pendente',
)
await writeFile(teamPath, team)

const corePath = 'src/modules/petshop/hooks/usePetshopAdvancedCore.js'
let core = await readFile(corePath, 'utf8')
const assignFunction = `  const assignPendingServiceResponsible = useCallback(async (appointmentId, staff = {}) => {\n    assertActiveTenant(activeTenantId, 'atribuir o responsavel do servico')\n    const staffKey = String(staff?.key || '').trim()\n    const staffName = String(staff?.name || '').trim()\n    if (!appointmentId || !staffKey || !staffName) throw new Error('Selecione um responsavel valido.')\n\n    const res = await runScoped(async (includeTenant) => {\n      let query = supabase\n        .from('appointments')\n        .update({ responsible_staff_key: staffKey, responsible_staff_name: staffName })\n        .eq('id', appointmentId)\n        .eq('module_id', moduleId)\n        .eq('status', 'concluido')\n        .is('responsible_staff_key', null)\n      query = applyTenantFilter(query, activeTenantId, includeTenant)\n      return query.select(APPT_BASE_SELECT).maybeSingle()\n    })\n\n    if (res.error) throw res.error\n    if (!res.data) throw new Error('Este atendimento ja possui responsavel ou nao esta mais disponivel para atribuicao.')\n    return res.data\n  }, [activeTenantId, moduleId, runScoped])\n\n`
core = replaceExact(
  core,
  `  const exportCommissionCsv = useCallback((rows, fileName = 'comissoes-petshop.csv') => {`,
  `${assignFunction}  const exportCommissionCsv = useCallback((rows, fileName = 'comissoes-petshop.csv') => {`,
  'funcao transacional de atribuicao',
)
core = replaceExact(
  core,
  `    loadTeamSnapshot,\n    exportCommissionCsv,`,
  `    loadTeamSnapshot,\n    assignPendingServiceResponsible,\n    exportCommissionCsv,`,
  'export da atribuicao',
)
await writeFile(corePath, core)

await writeFile('test/agendaHistoryPrintAction.test.mjs', `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { readFile } from 'node:fs/promises'\n\ntest('todo atendimento exibido no historico pode imprimir a ficha', async () => {\n  const source = await readFile(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8')\n  const marker = 'aria-label="Imprimir ficha do historico"'\n  const first = source.indexOf(marker)\n  const second = source.indexOf(marker, first + marker.length)\n  assert.ok(first >= 0 && second > first)\n  assert.equal(source.indexOf(marker, second + marker.length), -1)\n  assert.equal(source.includes('aria-label="Reimprimir ficha concluida"'), false)\n  assert.equal(source.slice(Math.max(0, first - 180), first).includes("appt.status === 'concluido'"), false)\n  assert.equal(source.slice(Math.max(0, second - 180), second).includes('completed &&'), false)\n  assert.ok(source.includes('Historico do dia'))\n  assert.ok(source.includes('<Receipt size={13}/>'))\n  assert.ok(source.includes('<Receipt size={11}/>'))\n})\n`)

await writeFile('test/teamPendingResponsibleAssignment.test.mjs', `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { readFile } from 'node:fs/promises'\n\ntest('equipe permite atribuir apenas servicos concluidos ainda sem responsavel', async () => {\n  const [page, core] = await Promise.all([\n    readFile(new URL('../src/modules/petshop/pages/EquipePage.jsx', import.meta.url), 'utf8'),\n    readFile(new URL('../src/modules/petshop/hooks/usePetshopAdvancedCore.js', import.meta.url), 'utf8'),\n  ])\n  assert.ok(page.includes('assignPendingServiceResponsible'))\n  assert.ok(page.includes('Responsavel manual do servico'))\n  assert.ok(page.includes('Selecionar responsavel'))\n  assert.ok(core.includes('assignPendingServiceResponsible'))\n  assert.ok(core.includes(".eq('status', 'concluido')"))\n  assert.ok(core.includes(".is('responsible_staff_key', null)"))\n  assert.ok(core.includes('responsible_staff_name: staffName'))\n  assert.ok(core.includes('ja possui responsavel'))\n})\n`)
