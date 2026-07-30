import { readFile, writeFile } from 'node:fs/promises'

const read = (path) => readFile(path, 'utf8')
const write = (path, content) => writeFile(path, content, 'utf8')

function replaceOnce(source, search, replacement, label) {
  const index = source.indexOf(search)
  if (index < 0) throw new Error(`Bloco nao encontrado: ${label}`)
  if (source.indexOf(search, index + search.length) >= 0) throw new Error(`Bloco duplicado: ${label}`)
  return source.slice(0, index) + replacement + source.slice(index + search.length)
}

// 1. Regras puras de layout: grupos de sobreposicao independentes e largura adaptativa.
const operationalPath = 'src/modules/petshop/lib/appointmentOperational.js'
let operational = await read(operationalPath)
operational = replaceOnce(
  operational,
  `// Quantidade de colunas visuais exibidas antes da rolagem horizontal.\n// Nao representa limite operacional de agendamentos.\nexport const MANUAL_SLOT_CAPACITY = 4\n`,
  `// Referencia visual maxima usada em textos e configuracoes legadas.\n// A largura real dos cards e adaptativa e nao limita agendamentos.\nexport const MANUAL_SLOT_CAPACITY = 4\n\nexport function agendaVisualLaneCount(concurrent = 0) {\n  const count = Math.max(0, Math.trunc(Number(concurrent) || 0))\n  return count <= 2 ? 2 : count\n}\n\nconst validTime = (value) => {\n  const time = value instanceof Date ? value.getTime() : new Date(value || '').getTime()\n  return Number.isFinite(time) ? time : null\n}\n\nexport function layoutAgendaOverlapClusters(items = [], getBounds = (item) => item?.bounds) {\n  const prepared = (Array.isArray(items) ? items : [])\n    .map((item, index) => {\n      const bounds = getBounds(item)\n      const startMs = validTime(bounds?.start)\n      const endMs = validTime(bounds?.end)\n      const createdMs = validTime(item?.created_at)\n      if (startMs === null || endMs === null || endMs <= startMs) return null\n      return { item, bounds, startMs, endMs, createdMs, index }\n    })\n    .filter(Boolean)\n    .sort((left, right) => (\n      (left.startMs - right.startMs)\n      || ((left.createdMs ?? Number.POSITIVE_INFINITY) - (right.createdMs ?? Number.POSITIVE_INFINITY))\n      || (left.index - right.index)\n    ))\n\n  const positioned = []\n  let cluster = []\n  let clusterEnd = Number.NEGATIVE_INFINITY\n\n  const flushCluster = () => {\n    if (!cluster.length) return\n    const laneEnds = []\n    const clusterPositions = cluster.map((entry) => {\n      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= entry.startMs)\n      if (lane < 0) {\n        lane = laneEnds.length\n        laneEnds.push(Number.NEGATIVE_INFINITY)\n      }\n      laneEnds[lane] = entry.endMs\n      return { ...entry, lane }\n    })\n    const laneCount = agendaVisualLaneCount(laneEnds.length)\n    clusterPositions.forEach(({ item, bounds, lane }) => positioned.push({ item, bounds, lane, laneCount }))\n    cluster = []\n    clusterEnd = Number.NEGATIVE_INFINITY\n  }\n\n  prepared.forEach((entry) => {\n    if (cluster.length && entry.startMs >= clusterEnd) flushCluster()\n    cluster.push(entry)\n    clusterEnd = Math.max(clusterEnd, entry.endMs)\n  })\n  flushCluster()\n\n  return positioned\n}\n`,
  'helpers de layout adaptativo',
)
await write(operationalPath, operational)

// 2. Agenda nativa: markup aproveita toda a largura e grupos reiniciam na esquerda.
const agendaPath = 'src/modules/petshop/pages/AgendaPage.jsx'
let agenda = await read(agendaPath)
agenda = replaceOnce(
  agenda,
  `import {\n  MANUAL_SLOT_CAPACITY,\n  appointmentOccupiesManualSlot,\n  appointmentTransportAddress,\n  appointmentTransportLabel,\n  isMotodogTransportMode,\n} from '../lib/appointmentOperational'`,
  `import {\n  MANUAL_SLOT_CAPACITY,\n  agendaVisualLaneCount,\n  appointmentOccupiesManualSlot,\n  appointmentTransportAddress,\n  appointmentTransportLabel,\n  isMotodogTransportMode,\n  layoutAgendaOverlapClusters,\n} from '../lib/appointmentOperational'`,
  'imports operacionais',
)
agenda = replaceOnce(
  agenda,
  `    <div className={\`${'${compact ? "mt-1 text-[10px]" : "rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-2 text-[11px]"} ${motodog ? "text-emerald-300" : "text-sky-300"}'}\`}>`,
  `    <div className={\`yuisync-card-transport ${'${compact ? "mt-1 text-[10px]" : "rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-2 text-[11px]"} ${motodog ? "text-emerald-300" : "text-sky-300"}'}\`}>`,
  'classe do transporte no card',
)

const cardStart = agenda.indexOf('  const appointmentCard = (appt) => {')
const cardEnd = agenda.indexOf('\n\n  if (days.length === 1) {', cardStart)
if (cardStart < 0 || cardEnd < 0) throw new Error('Funcao appointmentCard nao encontrada')
const cardReplacement = `  const appointmentCard = (appt) => {\n    const sb = statusBadge(appt.status)\n    const assigned = staffById.get(appt.responsible_staff_key)\n    return (\n      <div\n        key={appt.id}\n        data-yuisync-native-agenda-card=\"true\"\n        data-yuisync-native-appointment-id={String(appt.id)}\n        className={\`yuisync-agenda-card-surface relative w-full rounded-lg border p-2 text-left shadow-sm ${'${agendaCardTone(appt.status)}'}\`}\n      >\n        <button type=\"button\" onClick={() => onEdit(appt)} className=\"yuisync-card-content w-full text-left\">\n          <div className=\"yuisync-card-header flex min-w-0 flex-wrap items-start gap-1\">\n            <p className=\"yuisync-card-time shrink-0 whitespace-nowrap text-[10px] font-black leading-tight\">{fmtAppointmentInterval(appt)}</p>\n            <span className={\`yuisync-card-status badge ${'${sb.cls}'} max-w-full truncate text-[9px]\`}>{sb.label}</span>\n          </div>\n          <div className=\"yuisync-card-body min-w-0\">\n            <p className=\"yuisync-card-pet truncate text-xs font-bold text-text\">{appt.pets?.pet_name || 'Pet'}</p>\n            <p className=\"yuisync-card-tutor truncate text-[11px] font-semibold text-text/90\">Tutor: {appt.pets?.owner_name || 'Cliente'}</p>\n            <div className=\"yuisync-card-service flex items-center justify-between gap-2 text-[10px] text-muted\">\n              <span className=\"truncate\">{serviceLabel(appt)}</span>\n              <span className=\"shrink-0 font-bold text-emerald-400\">{fmtCurrency(appt.price)}</span>\n            </div>\n            <MotodogAgendaInfo appt={appt} compact/>\n            <p className={\`yuisync-card-responsible truncate text-[10px] ${'${assigned ? "text-muted" : "text-amber-300"}'}\`}>\n              {assigned ? \`Resp.: ${'${assigned.name}'}\` : appt.responsible_staff_name ? \`Resp.: ${'${appt.responsible_staff_name}'}\` : 'Sem responsavel'}\n            </p>\n          </div>\n        </button>\n        {appt.status === 'concluido' && (\n          <button\n            type=\"button\"\n            aria-label=\"Imprimir ficha do agendamento\"\n            title=\"Imprimir ficha 80 mm\"\n            onClick={() => onReceipt(appt)}\n            className=\"absolute right-1.5 top-1.5 rounded-md bg-black/20 p-1 text-emerald-300 hover:bg-black/35\"\n          >\n            <Receipt size={11}/>\n          </button>\n        )}\n      </div>\n    )\n  }`
agenda = agenda.slice(0, cardStart) + cardReplacement + agenda.slice(cardEnd)

agenda = replaceOnce(
  agenda,
  `    const laneEnds = []\n    const positioned = blocking.map((appt) => {\n      const bounds = appointmentIntervalBounds(appt)\n      const startMs = bounds?.start.getTime() ?? 0\n      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= startMs)\n      if (lane < 0) {\n        lane = laneEnds.length\n        laneEnds.push(Number.NEGATIVE_INFINITY)\n      }\n      laneEnds[lane] = Math.max(laneEnds[lane], bounds?.end.getTime() ?? startMs)\n      return { appt, bounds, lane }\n    })\n    const visualLaneCount = Math.max(slotCapacity, laneEnds.length)`,
  `    const positioned = layoutAgendaOverlapClusters(blocking, appointmentIntervalBounds)`,
  'layout diario por grupos',
)
agenda = replaceOnce(
  agenda,
  `{slotCapacity} colunas visuais · agendamentos livres`,
  `Largura adaptativa · agendamentos livres`,
  'cabecalho diario adaptativo',
)
agenda = replaceOnce(
  agenda,
  `<div className=\"relative border-l border-[var(--border)]\" style={{ height: timelineHeight, width: \`${'${Math.max(100, (visualLaneCount / slotCapacity) * 100)}%'}\` }}>`,
  `<div className=\"relative border-l border-[var(--border)]\" style={{ height: timelineHeight }}>`,
  'superficie diaria sem escala global',
)
agenda = replaceOnce(
  agenda,
  `              {positioned.map(({ appt, bounds, lane }) => {`,
  `              {positioned.map(({ item: appt, bounds, lane, laneCount }) => {`,
  'dados posicionados diarios',
)
agenda = replaceOnce(
  agenda,
  `                const laneWidth = 100 / Math.max(1, visualLaneCount)`,
  `                const laneWidth = 100 / Math.max(1, laneCount)`,
  'largura por grupo diario',
)
agenda = replaceOnce(
  agenda,
  `{slotCapacity} colunas visuais · agendamentos livres`,
  `Largura adaptativa · agendamentos livres`,
  'cabecalho semanal adaptativo',
)
agenda = replaceOnce(
  agenda,
  `                const visualLaneCount = Math.max(slotCapacity, occupying.length)`,
  `                const visualLaneCount = agendaVisualLaneCount(occupying.length)`,
  'largura semanal adaptativa',
)
agenda = replaceOnce(
  agenda,
  `                          gridTemplateColumns: \`repeat(${'${visualLaneCount}'}, minmax(140px, 1fr))\`,\n                          width: \`${'${Math.max(100, (visualLaneCount / slotCapacity) * 100)}%'}\`,`,
  `                          gridTemplateColumns: \`repeat(${'${visualLaneCount}'}, minmax(0, 1fr))\`,\n                          width: '100%',`,
  'grade semanal progressiva',
)
await write(agendaPath, agenda)

// 3. Superficie verde nativa e uso integral da parte inferior do card.
const cssPath = 'src/modules/petshop/pages/AgendaResolvedPage.css'
let css = await read(cssPath)
css = replaceOnce(
  css,
  `.yuisync-resolved-card {\n`,
  `.yuisync-agenda-card-surface {\n  border-color: rgba(110, 231, 183, 0.82) !important;\n  background: linear-gradient(135deg, #047857 0%, #065f46 58%, #064e3b 100%) !important;\n  color: #f0fdf4 !important;\n  opacity: 1 !important;\n  box-shadow: 0 10px 28px rgba(2, 44, 34, 0.34) !important;\n}\n\n.yuisync-resolved-card {\n`,
  'superficie verde nativa',
)
css = replaceOnce(
  css,
  `.yuisync-resolved-card > button.w-full.text-left {\n  display: flex !important;\n  height: 100% !important;\n  min-height: 0 !important;\n  flex-direction: column !important;\n  overflow: hidden !important;\n  padding-right: 132px !important;\n}\n`,
  `.yuisync-agenda-card-surface > button.w-full.text-left,\n.yuisync-resolved-card > button.w-full.text-left {\n  display: flex !important;\n  height: 100% !important;\n  min-height: 0 !important;\n  flex-direction: column !important;\n  overflow: hidden !important;\n  padding: 0 !important;\n}\n\n.yuisync-card-header {\n  min-height: 40px;\n  padding-right: 126px;\n  align-content: flex-start;\n}\n\n.yuisync-card-body {\n  display: flex;\n  min-width: 0;\n  min-height: 0;\n  flex: 1;\n  flex-direction: column;\n  gap: 2px;\n  overflow: hidden;\n}\n\n.yuisync-card-service {\n  margin-top: 3px;\n  min-width: 0;\n}\n\n.yuisync-card-transport,\n.yuisync-card-responsible {\n  margin-top: 1px !important;\n}\n`,
  'conteudo integral do card',
)
css = replaceOnce(
  css,
  `  .yuisync-resolved-card > button.w-full.text-left {\n    padding-right: 116px !important;\n  }`,
  `  .yuisync-card-header {\n    padding-right: 108px;\n  }`,
  'cabecalho responsivo',
)
await write(cssPath, css)

// 4. Densidade considera altura e largura, sem esconder a linha de servico.
const integratedPath = 'src/modules/petshop/pages/AgendaIntegratedPage.jsx'
let integrated = await read(integratedPath)
const styleStart = integrated.indexOf('const FLUID_AGENDA_STYLES = `')
const styleEnd = integrated.indexOf('`\n\nconst minutesFromTime', styleStart)
if (styleStart < 0 || styleEnd < 0) throw new Error('Estilos fluidos nao encontrados')
const fluidStyles = `const FLUID_AGENDA_STYLES = \`\n  .yuisync-agenda-card-surface[data-yuisync-density='compact'],\n  .yuisync-resolved-card[data-yuisync-density='compact'] {\n    padding: 5px !important;\n  }\n\n  [data-yuisync-density='compact'] .yuisync-card-header {\n    min-height: 29px;\n    padding-right: 96px;\n  }\n\n  [data-yuisync-density='compact'] .yuisync-resolved-actions,\n  [data-yuisync-width='compact'] .yuisync-resolved-actions {\n    right: 4px !important;\n    top: 4px !important;\n    gap: 3px !important;\n  }\n\n  [data-yuisync-density='compact'] .yuisync-resolved-action,\n  [data-yuisync-width='compact'] .yuisync-resolved-action {\n    width: 28px !important;\n    height: 28px !important;\n    flex-basis: 28px !important;\n    border-radius: 8px !important;\n  }\n\n  [data-yuisync-density='compact'] .yuisync-card-body {\n    gap: 0;\n  }\n\n  [data-yuisync-density='compact'] .yuisync-card-pet,\n  [data-yuisync-density='compact'] .yuisync-card-tutor,\n  [data-yuisync-density='compact'] .yuisync-card-service,\n  [data-yuisync-density='compact'] .yuisync-card-transport,\n  [data-yuisync-density='compact'] .yuisync-card-responsible {\n    margin-top: 0 !important;\n    font-size: 9px !important;\n    line-height: 1 !important;\n  }\n\n  .yuisync-agenda-card-surface[data-yuisync-density='micro'],\n  .yuisync-resolved-card[data-yuisync-density='micro'] {\n    padding: 3px !important;\n  }\n\n  [data-yuisync-density='micro'] .yuisync-card-header {\n    min-height: 23px;\n    padding-right: 74px;\n  }\n\n  [data-yuisync-density='micro'] .yuisync-resolved-actions,\n  [data-yuisync-width='narrow'] .yuisync-resolved-actions {\n    right: 3px !important;\n    top: 3px !important;\n    gap: 2px !important;\n  }\n\n  [data-yuisync-density='micro'] .yuisync-resolved-action,\n  [data-yuisync-width='narrow'] .yuisync-resolved-action {\n    width: 22px !important;\n    height: 22px !important;\n    flex-basis: 22px !important;\n    border-radius: 7px !important;\n  }\n\n  [data-yuisync-width='compact'] .yuisync-card-header {\n    padding-right: 96px;\n  }\n\n  [data-yuisync-width='narrow'] .yuisync-card-header {\n    padding-right: 74px;\n  }\n\n  [data-yuisync-width='narrow'] .yuisync-card-status,\n  [data-yuisync-density='micro'] .yuisync-card-status,\n  [data-yuisync-density='micro'] .yuisync-card-transport,\n  [data-yuisync-density='micro'] .yuisync-card-responsible {\n    display: none !important;\n  }\n\n  [data-yuisync-density='micro'] .yuisync-card-body {\n    gap: 0;\n  }\n\n  [data-yuisync-density='micro'] .yuisync-card-pet {\n    font-size: 9px !important;\n    line-height: 1 !important;\n  }\n\n  [data-yuisync-density='micro'] .yuisync-card-tutor,\n  [data-yuisync-density='micro'] .yuisync-card-service {\n    margin-top: 0 !important;\n    font-size: 8px !important;\n    line-height: 1 !important;\n  }\n\n  .yuisync-agenda-card-surface .yuisync-package-label,\n  .yuisync-resolved-card .yuisync-package-label {\n    color: #a7f3d0 !important;\n    font-size: 10px !important;\n    font-weight: 900 !important;\n    letter-spacing: .035em !important;\n    text-transform: uppercase !important;\n    white-space: nowrap !important;\n  }\n\`\n\nconst minutesFromTime`
integrated = integrated.slice(0, styleStart) + fluidStyles + integrated.slice(styleEnd + '`\n\nconst minutesFromTime'.length)
integrated = replaceOnce(
  integrated,
  `      document.querySelectorAll('.yuisync-resolved-card').forEach((card) => {\n        const outer = card.parentElement\n        const height = outer?.getBoundingClientRect?.().height || card.getBoundingClientRect().height\n        card.dataset.yuisyncDensity = height <= 58 ? 'micro' : height <= 100 ? 'compact' : 'regular'\n      })`,
  `      document.querySelectorAll('.yuisync-agenda-card-surface').forEach((card) => {\n        const outer = card.parentElement\n        const rect = card.getBoundingClientRect()\n        const height = outer?.getBoundingClientRect?.().height || rect.height\n        const width = rect.width\n        card.dataset.yuisyncDensity = height <= 58 ? 'micro' : height <= 104 ? 'compact' : 'regular'\n        card.dataset.yuisyncWidth = width <= 170 ? 'narrow' : width <= 240 ? 'compact' : 'wide'\n      })`,
  'densidade por altura e largura',
)
integrated = integrated.replaceAll("document.querySelectorAll('.yuisync-resolved-card')", "document.querySelectorAll('.yuisync-agenda-card-surface')")
await write(integratedPath, integrated)

// 5. Sincronizacao nativa por ID e recarga pontual do segundo hook apos criacao.
const resolvedPath = 'src/modules/petshop/pages/AgendaResolvedPage.jsx'
let resolved = await read(resolvedPath)
resolved = replaceOnce(
  resolved,
  `    let syncFrame = 0\n`,
  `    let syncFrame = 0\n    let reloadTimer = 0\n    let reloadPending = false\n    let lastUnresolvedSignature = ''\n    let unresolvedAttempts = 0\n`,
  'estado da sincronizacao de cards',
)
resolved = replaceOnce(
  resolved,
  `      operationalAppointments.forEach((appointment) => {\n        const statusLabel = statusBadge(appointment.status).label\n        const trigger = findAgendaCardCandidate(candidates, {\n          interval: appointmentInterval(appointment),\n          petName: appointment?.pets?.pet_name || 'pet',\n          statusLabel,\n        }, usedCards)\n        if (!trigger) return\n\n        const card = trigger.parentElement\n        if (!card || !card.classList.contains('relative')) return\n`,
  `      operationalAppointments.forEach((appointment) => {\n        const nativeCard = [...pageRoot.querySelectorAll('[data-yuisync-native-appointment-id]')]\n          .find((node) => node.dataset.yuisyncNativeAppointmentId === String(appointment.id))\n        const statusLabel = statusBadge(appointment.status).label\n        const trigger = nativeCard?.querySelector(':scope > button.w-full.text-left') || findAgendaCardCandidate(candidates, {\n          interval: appointmentInterval(appointment),\n          petName: appointment?.pets?.pet_name || 'pet',\n          statusLabel,\n        }, usedCards)\n        if (!trigger) return\n\n        const card = nativeCard || trigger.parentElement\n        if (!card || !card.classList.contains('relative')) return\n`,
  'sincronizacao por id nativo',
)
resolved = replaceOnce(
  resolved,
  `    const scheduleSync = () => {\n      if (syncFrame) return\n      syncFrame = requestAnimationFrame(syncCards)\n    }\n`,
  `    const scheduleSync = () => {\n      if (syncFrame) return\n      syncFrame = requestAnimationFrame(syncCards)\n    }\n\n    const scheduleOperationalReload = () => {\n      if (!isDailyAgenda() || reloadPending || reloadTimer) return\n      const unresolved = [...pageRoot.querySelectorAll('[data-yuisync-native-agenda-card=\"true\"]:not(.yuisync-resolved-card)')]\n      if (!unresolved.length) {\n        lastUnresolvedSignature = ''\n        unresolvedAttempts = 0\n        return\n      }\n      const signature = unresolved\n        .map((card) => card.dataset.yuisyncNativeAppointmentId || '')\n        .filter(Boolean)\n        .sort()\n        .join('|')\n      if (signature === lastUnresolvedSignature && unresolvedAttempts >= 2) return\n      if (signature !== lastUnresolvedSignature) {\n        lastUnresolvedSignature = signature\n        unresolvedAttempts = 0\n      }\n      unresolvedAttempts += 1\n      reloadTimer = window.setTimeout(async () => {\n        reloadTimer = 0\n        reloadPending = true\n        try {\n          await load({ date: selectedDate })\n        } finally {\n          reloadPending = false\n          scheduleSync()\n        }\n      }, 120)\n    }\n`,
  'recarga pontual de novos cards',
)
resolved = replaceOnce(
  resolved,
  `    const observer = new MutationObserver(scheduleSync)\n`,
  `    const observer = new MutationObserver(() => {\n      scheduleSync()\n      scheduleOperationalReload()\n    })\n`,
  'observador de novos cards',
)
resolved = replaceOnce(
  resolved,
  `    syncCards()\n    const observer = new MutationObserver`,
  `    syncCards()\n    scheduleOperationalReload()\n    const observer = new MutationObserver`,
  'sincronizacao inicial',
)
resolved = replaceOnce(
  resolved,
  `      if (syncFrame) cancelAnimationFrame(syncFrame)\n      observer.disconnect()`,
  `      if (syncFrame) cancelAnimationFrame(syncFrame)\n      if (reloadTimer) window.clearTimeout(reloadTimer)\n      observer.disconnect()`,
  'limpeza da recarga',
)
resolved = replaceOnce(
  resolved,
  `  }, [completeAppointment, moveAppointment, operationalAppointments, printAppointment, printDay, statusBadge, storeSettings?.petshop_service_durations, transportOptions])`,
  `  }, [completeAppointment, load, moveAppointment, operationalAppointments, printAppointment, printDay, selectedDate, statusBadge, storeSettings?.petshop_service_durations, transportOptions])`,
  'dependencias da sincronizacao',
)
await write(resolvedPath, resolved)

// 6. Atualiza a regressao anterior e adiciona cenarios das imagens.
const freeTestPath = 'test/agendaFreeScheduling.test.mjs'
let freeTest = await read(freeTestPath)
freeTest = replaceOnce(
  freeTest,
  `  assert.match(agenda, /const visualLaneCount = Math.max\\(slotCapacity, laneEnds.length\\)/)\n  assert.match(agenda, /const visualLaneCount = Math.max\\(slotCapacity, occupying.length\\)/)`,
  `  assert.match(agenda, /layoutAgendaOverlapClusters\\(blocking, appointmentIntervalBounds\\)/)\n  assert.match(agenda, /agendaVisualLaneCount\\(occupying.length\\)/)`,
  'regressao da largura adaptativa',
)
await write(freeTestPath, freeTest)

await write('test/agendaAdaptiveCards.test.mjs', `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { readFile } from 'node:fs/promises'\n\nimport { agendaVisualLaneCount, layoutAgendaOverlapClusters } from '../src/modules/petshop/lib/appointmentOperational.js'\n\nconst at = (time) => new Date(\`2026-07-30T\${time}:00-03:00\`)\nconst bounds = (item) => ({ start: at(item.start), end: at(item.end) })\n\ntest('um ou dois cards usam meia agenda e tres ou mais dividem progressivamente', () => {\n  assert.equal(agendaVisualLaneCount(0), 2)\n  assert.equal(agendaVisualLaneCount(1), 2)\n  assert.equal(agendaVisualLaneCount(2), 2)\n  assert.equal(agendaVisualLaneCount(3), 3)\n  assert.equal(agendaVisualLaneCount(5), 5)\n})\n\ntest('novo grupo de horario volta para a primeira coluna', () => {\n  const items = [\n    { id: 'a', start: '08:10', end: '09:40', created_at: '2026-07-30T10:00:00Z' },\n    { id: 'b', start: '08:10', end: '09:10', created_at: '2026-07-30T10:01:00Z' },\n    { id: 'c', start: '08:10', end: '08:50', created_at: '2026-07-30T10:02:00Z' },\n    { id: 'd', start: '09:40', end: '10:20', created_at: '2026-07-30T10:03:00Z' },\n  ]\n  const layout = layoutAgendaOverlapClusters(items, bounds)\n  const byId = new Map(layout.map((entry) => [entry.item.id, entry]))\n  assert.deepEqual([byId.get('a').lane, byId.get('b').lane, byId.get('c').lane], [0, 1, 2])\n  assert.equal(byId.get('a').laneCount, 3)\n  assert.equal(byId.get('d').lane, 0)\n  assert.equal(byId.get('d').laneCount, 2)\n})\n\ntest('card nasce verde e sincroniza pelo id sem depender de ctrl f5', async () => {\n  const [agenda, css, resolved, integrated] = await Promise.all([\n    readFile(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8'),\n    readFile(new URL('../src/modules/petshop/pages/AgendaResolvedPage.css', import.meta.url), 'utf8'),\n    readFile(new URL('../src/modules/petshop/pages/AgendaResolvedPage.jsx', import.meta.url), 'utf8'),\n    readFile(new URL('../src/modules/petshop/pages/AgendaIntegratedPage.jsx', import.meta.url), 'utf8'),\n  ])\n  assert.match(agenda, /data-yuisync-native-agenda-card=\"true\"/)\n  assert.match(agenda, /data-yuisync-native-appointment-id/)\n  assert.match(css, /\\.yuisync-agenda-card-surface[\\s\\S]*background: linear-gradient/)\n  assert.match(resolved, /scheduleOperationalReload/)\n  assert.match(resolved, /data-yuisync-native-appointment-id/)\n  assert.match(integrated, /querySelectorAll\\('\.yuisync-agenda-card-surface'\\)/)\n})\n\ntest('cards estreitos reservam botoes apenas no cabecalho e preservam linhas uteis', async () => {\n  const [agenda, css, integrated] = await Promise.all([\n    readFile(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8'),\n    readFile(new URL('../src/modules/petshop/pages/AgendaResolvedPage.css', import.meta.url), 'utf8'),\n    readFile(new URL('../src/modules/petshop/pages/AgendaIntegratedPage.jsx', import.meta.url), 'utf8'),\n  ])\n  assert.match(agenda, /yuisync-card-header/)\n  assert.match(agenda, /yuisync-card-service/)\n  assert.match(agenda, /yuisync-card-responsible/)\n  assert.doesNotMatch(css, /padding-right: 132px/)\n  assert.match(css, /\\.yuisync-card-header[\\s\\S]*padding-right: 126px/)\n  assert.doesNotMatch(integrated, /> button\\.w-full\\.text-left > \\.mt-2[\\s\\S]*display: none/)\n  assert.match(integrated, /data-yuisync-width/)\n})\n\ntest('drag and drop existente permanece inalterado no caminho operacional', async () => {\n  const [resolved, integrated] = await Promise.all([\n    readFile(new URL('../src/modules/petshop/pages/AgendaResolvedPage.jsx', import.meta.url), 'utf8'),\n    readFile(new URL('../src/modules/petshop/pages/AgendaIntegratedPage.jsx', import.meta.url), 'utf8'),\n  ])\n  assert.match(resolved, /chooseAgendaSlot\\(slots\\(\\), event.clientX, event.clientY\\)/)\n  assert.match(resolved, /void moveAppointment\\(id, time\\)/)\n  assert.match(resolved, /await update\\(appointmentId, \\{ scheduled_at: target.toISOString\\(\\) \\}\\)/)\n  assert.match(integrated, /shiftedInterval/)\n  assert.match(integrated, /is-yuisync-pointer-dragging/)\n})\n`)
