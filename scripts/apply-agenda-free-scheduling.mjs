import { readFile, writeFile, mkdir } from 'node:fs/promises'

const read = (path) => readFile(path, 'utf8')
const write = (path, content) => writeFile(path, content, 'utf8')

function replaceOnce(source, search, replacement, label) {
  const index = source.indexOf(search)
  if (index < 0) throw new Error(`Bloco nao encontrado: ${label}`)
  if (source.indexOf(search, index + search.length) >= 0) throw new Error(`Bloco duplicado: ${label}`)
  return source.slice(0, index) + replacement + source.slice(index + search.length)
}

const operationalPath = 'src/modules/petshop/lib/appointmentOperational.js'
let operational = await read(operationalPath)
operational = replaceOnce(
  operational,
  'export const MANUAL_SLOT_CAPACITY = 2',
  "// Quantidade de colunas visuais exibidas antes da rolagem horizontal.\n// Nao representa limite operacional de agendamentos.\nexport const MANUAL_SLOT_CAPACITY = 4",
  'capacidade visual da agenda',
)
await write(operationalPath, operational)

const agendaPath = 'src/modules/petshop/pages/AgendaPage.jsx'
let agenda = await read(agendaPath)

const overlapHelpersStart = agenda.indexOf("const intervalsOverlap = (firstStart, firstEnd, secondStart, secondEnd) => (")
const overlapHelpersEndMarker = "const fmtInterval = (appt) => fmtAppointmentInterval(appt)"
const overlapHelpersEnd = agenda.indexOf(overlapHelpersEndMarker, overlapHelpersStart)
if (overlapHelpersStart < 0 || overlapHelpersEnd < 0) throw new Error('Helpers antigos de bloqueio nao encontrados')
agenda = agenda.slice(0, overlapHelpersStart) + agenda.slice(overlapHelpersEnd)

const submitBlockStart = agenda.indexOf('    const candidateEnd = new Date(candidateStart.getTime() + effectiveDuration * 60 * 1000)\n')
const submitBlockEndMarker = '    setSaving(true)\n'
const submitBlockEnd = agenda.indexOf(submitBlockEndMarker, submitBlockStart)
if (submitBlockStart < 0 || submitBlockEnd < 0) throw new Error('Validacoes de conflito do formulario nao encontradas')
agenda = agenda.slice(0, submitBlockStart) + agenda.slice(submitBlockEnd)

agenda = replaceOnce(
  agenda,
  `    const laneEnds = Array.from({ length: slotCapacity }, () => Number.NEGATIVE_INFINITY)\n    const positioned = blocking.map((appt) => {\n      const bounds = appointmentIntervalBounds(appt)\n      const startMs = bounds?.start.getTime() ?? 0\n      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= startMs)\n      const overflow = lane < 0\n      if (lane < 0) lane = 0\n      laneEnds[lane] = Math.max(laneEnds[lane], bounds?.end.getTime() ?? startMs)\n      return { appt, bounds, lane, overflow }\n    })`,
  `    const laneEnds = []\n    const positioned = blocking.map((appt) => {\n      const bounds = appointmentIntervalBounds(appt)\n      const startMs = bounds?.start.getTime() ?? 0\n      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= startMs)\n      if (lane < 0) {\n        lane = laneEnds.length\n        laneEnds.push(Number.NEGATIVE_INFINITY)\n      }\n      laneEnds[lane] = Math.max(laneEnds[lane], bounds?.end.getTime() ?? startMs)\n      return { appt, bounds, lane }\n    })\n    const visualLaneCount = Math.max(slotCapacity, laneEnds.length)`,
  'distribuicao dinamica das colunas diarias',
)

agenda = replaceOnce(
  agenda,
  "{slotCapacity} {slotCapacity === 1 ? 'vaga' : 'vagas'} simultaneas",
  "{slotCapacity} colunas visuais · agendamentos livres",
  'cabecalho diario',
)
agenda = replaceOnce(agenda, 'min-w-[620px] grid', 'min-w-[860px] grid', 'largura da agenda diaria')
agenda = replaceOnce(
  agenda,
  '<div className="relative border-l border-[var(--border)]" style={{ height: timelineHeight }}>',
  '<div className="relative border-l border-[var(--border)]" style={{ height: timelineHeight, width: `${Math.max(100, (visualLaneCount / slotCapacity) * 100)}%` }}>',
  'largura dinamica das colunas diarias',
)
agenda = replaceOnce(
  agenda,
  'positioned.map(({ appt, bounds, lane, overflow }) => {',
  'positioned.map(({ appt, bounds, lane }) => {',
  'card diario sem overflow bloqueante',
)
agenda = replaceOnce(
  agenda,
  'const laneWidth = 100 / Math.max(1, slotCapacity)',
  'const laneWidth = 100 / Math.max(1, visualLaneCount)',
  'largura por coluna diaria',
)
agenda = replaceOnce(
  agenda,
  "className={`absolute z-10 overflow-hidden rounded-lg ${overflow ? 'ring-2 ring-red-500/70' : ''}`}",
  'className="absolute z-10 overflow-hidden rounded-lg"',
  'remocao do alerta visual de capacidade',
)

agenda = replaceOnce(
  agenda,
  "{slotCapacity} {slotCapacity === 1 ? 'vaga' : 'vagas'} por horario",
  "{slotCapacity} colunas visuais · agendamentos livres",
  'cabecalho semanal',
)
agenda = replaceOnce(
  agenda,
  'const lanes = Array.from({ length: slotCapacity }, (_, index) => occupying[index] || null)',
  'const visualLaneCount = Math.max(slotCapacity, occupying.length)\n                const lanes = Array.from({ length: visualLaneCount }, (_, index) => occupying[index] || null)',
  'colunas semanais dinamicas',
)
agenda = replaceOnce(
  agenda,
  '<div className={`grid gap-2 ${slotCapacity === 1 ? "grid-cols-1" : "grid-cols-2"}`}>',
  `<div className="overflow-x-auto">\n                      <div\n                        className="grid gap-2"\n                        style={{\n                          gridTemplateColumns: \`repeat(\${visualLaneCount}, minmax(140px, 1fr))\`,\n                          width: \`\${Math.max(100, (visualLaneCount / slotCapacity) * 100)}%\`,\n                        }}\n                      >`,
  'grade semanal com quatro colunas visiveis',
)
agenda = replaceOnce(
  agenda,
  `                    </div>\n                    {occupying.length > slotCapacity && (\n                      <p className="mt-2 rounded-md bg-red-500/10 px-2 py-1 text-[10px] text-red-300">\n                        {occupying.length - slotCapacity} agendamento(s) acima da capacidade configurada.\n                      </p>\n                    )}\n                    {nonBlocking.length > 0 && (`,
  `                      </div>\n                    </div>\n                    {nonBlocking.length > 0 && (`,
  'remocao do aviso semanal de excesso',
)
agenda = replaceOnce(
  agenda,
  'Vaga {laneIndex + 1} disponivel',
  'Espaco visual {laneIndex + 1}',
  'rotulo do espaco visual',
)
agenda = agenda.replaceAll("slotCapacity={activeAgendaTab === 'banho_tosa' ? MANUAL_SLOT_CAPACITY : 1}", 'slotCapacity={MANUAL_SLOT_CAPACITY}')
agenda = agenda.replaceAll("slotCapacity={getAppointmentServiceGroup(modal, agendaServices) === 'veterinaria' || modal?.serviceGroup === 'veterinaria' ? 1 : MANUAL_SLOT_CAPACITY}", 'slotCapacity={MANUAL_SLOT_CAPACITY}')
if (agenda.includes('wouldExceedSlotCapacity') || agenda.includes('sameResponsibleConflict')) {
  throw new Error('Restaram bloqueios de capacidade no formulario')
}
await write(agendaPath, agenda)

const migrationPath = 'supabase/migrations/20260730095500_agenda_free_overlap_visual_lanes.sql'
await write(migrationPath, `begin;\n\n-- A capacidade agora e apenas visual. O operador pode registrar quantos\n-- atendimentos precisar no mesmo horario, inclusive para o mesmo responsavel.\n-- Mantemos a funcao e o trigger existentes para nao quebrar dependencias, mas\n-- ela deixa de rejeitar sobreposicoes.\ncreate or replace function public.prevent_appointment_overlap()\nreturns trigger\nlanguage plpgsql\nset search_path = public\nas $$\nbegin\n  return new;\nend;\n$$;\n\ncomment on function public.prevent_appointment_overlap() is\n  'Agenda operacional livre: sobreposicoes e responsaveis coincidentes sao permitidos; quatro colunas sao apenas apresentacao.';\n\ncommit;\n`)

const infraTestPath = 'test/agendaOperationalInfrastructure.test.mjs'
let infraTest = await read(infraTestPath)
infraTest = replaceOnce(infraTest, "test('agenda manual expoe exatamente duas vagas operacionais', () => {\n  assert.equal(MANUAL_SLOT_CAPACITY, 2)", "test('agenda manual expoe quatro colunas visuais sem limitar operacao', () => {\n  assert.equal(MANUAL_SLOT_CAPACITY, 4)", 'teste da capacidade visual')
infraTest = replaceOnce(
  infraTest,
  "const [migration, staffMigration, catalogMigration, agenda, appointments, advanced, commissions, settings, authContext] = await Promise.all([",
  "const [migration, freeSchedulingMigration, staffMigration, catalogMigration, agenda, appointments, advanced, commissions, settings, authContext] = await Promise.all([",
  'lista de fixtures da infraestrutura',
)
infraTest = replaceOnce(
  infraTest,
  "    readFile(new URL('../supabase/migrations/20260727001000_agenda_capacity_operational_commissions.sql', import.meta.url), 'utf8'),\n",
  "    readFile(new URL('../supabase/migrations/20260727001000_agenda_capacity_operational_commissions.sql', import.meta.url), 'utf8'),\n    readFile(new URL('../supabase/migrations/20260730095500_agenda_free_overlap_visual_lanes.sql', import.meta.url), 'utf8'),\n",
  'migration de agenda livre na fixture',
)
infraTest = replaceOnce(infraTest, "  assert.match(agenda, /wouldExceedSlotCapacity/)\n", "  assert.doesNotMatch(agenda, /wouldExceedSlotCapacity|sameResponsibleConflict/)\n", 'ausencia de bloqueio no formulario')
infraTest = replaceOnce(infraTest, "  assert.match(agenda, /activeAgendaTab === 'banho_tosa' \\? MANUAL_SLOT_CAPACITY : 1/)\n", "  assert.match(agenda, /slotCapacity=\\{MANUAL_SLOT_CAPACITY\\}/)\n", 'capacidade visual para todas as abas')
infraTest = replaceOnce(
  infraTest,
  "  assert.ok(migration.includes('revenue * 0.05'))\n",
  "  assert.ok(migration.includes('revenue * 0.05'))\n  assert.match(freeSchedulingMigration, /create or replace function public\\.prevent_appointment_overlap/)\n  assert.match(freeSchedulingMigration, /begin\\s+return new;\\s+end;/)\n  assert.doesNotMatch(freeSchedulingMigration, /raise exception|v_overlap_count|responsible_staff_key/)\n",
  'validacao da migration livre',
)
await write(infraTestPath, infraTest)

const staffTestPath = 'test/agendaStaffSettingsRegression.test.mjs'
let staffTest = await read(staffTestPath)
staffTest = replaceOnce(
  staffTest,
  "test('agenda, configuracoes e comissoes compartilham equipe e capacidade correta', async () => {",
  "test('agenda livre preserva equipe, configuracoes e comissoes', async () => {",
  'titulo do teste de equipe',
)
staffTest = replaceOnce(
  staffTest,
  "const [agenda, settings, team, migration] = await Promise.all([",
  "const [agenda, settings, team, migration] = await Promise.all([",
  'fixtures do teste de equipe',
)
staffTest = replaceOnce(
  staffTest,
  "    readFile(new URL('../supabase/migrations/20260727002000_veterinary_single_capacity.sql', import.meta.url), 'utf8'),",
  "    readFile(new URL('../supabase/migrations/20260730095500_agenda_free_overlap_visual_lanes.sql', import.meta.url), 'utf8'),",
  'migration atual do teste de equipe',
)
staffTest = replaceOnce(staffTest, "  assert.match(agenda, /activeAgendaTab === 'banho_tosa' \\? MANUAL_SLOT_CAPACITY : 1/)\n  assert.match(agenda, /slotCapacity === 1 \\? \"grid-cols-1\" : \"grid-cols-2\"/)\n", "  assert.match(agenda, /slotCapacity=\\{MANUAL_SLOT_CAPACITY\\}/)\n  assert.match(agenda, /visualLaneCount/)\n", 'grade visual no teste de equipe')
staffTest = replaceOnce(staffTest, "  assert.match(migration, /service_group, 'geral'\\) = 'veterinaria'/)\n  assert.match(migration, /v_capacity := 1/)\n  assert.match(migration, /duas vagas para banho\\/tosa e uma vaga para veterinaria/)\n", "  assert.match(migration, /Agenda operacional livre/)\n  assert.match(migration, /return new;/)\n  assert.doesNotMatch(migration, /raise exception/)\n", 'agenda livre no teste de equipe')
await write(staffTestPath, staffTest)

await mkdir('test', { recursive: true })
await write('test/agendaFreeScheduling.test.mjs', `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { readFile } from 'node:fs/promises'\n\nimport { MANUAL_SLOT_CAPACITY } from '../src/modules/petshop/lib/appointmentOperational.js'\n\ntest('agenda usa quatro colunas apenas como capacidade visual', async () => {\n  const agenda = await readFile(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8')\n  assert.equal(MANUAL_SLOT_CAPACITY, 4)\n  assert.match(agenda, /colunas visuais · agendamentos livres/)\n  assert.match(agenda, /const visualLaneCount = Math.max\\(slotCapacity, laneEnds.length\\)/)\n  assert.match(agenda, /const visualLaneCount = Math.max\\(slotCapacity, occupying.length\\)/)\n  assert.doesNotMatch(agenda, /wouldExceedSlotCapacity|sameResponsibleConflict|acima da capacidade configurada/)\n})\n\ntest('drag and drop operacional permanece conectado ao update transacional', async () => {\n  const resolved = await readFile(new URL('../src/modules/petshop/pages/AgendaResolvedPage.jsx', import.meta.url), 'utf8')\n  const integrated = await readFile(new URL('../src/modules/petshop/pages/AgendaIntegratedPage.jsx', import.meta.url), 'utf8')\n  assert.match(resolved, /data-yuisync-action=\"drag\"/)\n  assert.match(resolved, /chooseAgendaSlot\\(slots\\(\\), event.clientX, event.clientY\\)/)\n  assert.match(resolved, /void moveAppointment\\(id, time\\)/)\n  assert.match(resolved, /await update\\(appointmentId, \\{ scheduled_at: target.toISOString\\(\\) \\}\\)/)\n  assert.match(integrated, /is-yuisync-pointer-dragging/)\n  assert.match(integrated, /shiftedInterval/)\n})\n\ntest('banco permite sobreposicao e mesmo responsavel sem remover o trigger', async () => {\n  const migration = await readFile(new URL('../supabase/migrations/20260730095500_agenda_free_overlap_visual_lanes.sql', import.meta.url), 'utf8')\n  assert.match(migration, /create or replace function public\\.prevent_appointment_overlap/)\n  assert.match(migration, /return new;/)\n  assert.doesNotMatch(migration, /drop trigger|raise exception|v_capacity|v_overlap_count/)\n})\n`)

console.log('Agenda livre com quatro colunas visuais aplicada com sucesso.')
