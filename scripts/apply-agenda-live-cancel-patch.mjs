import { readFile, writeFile } from 'node:fs/promises'

const root = process.cwd()
const read = (path) => readFile(`${root}/${path}`, 'utf8')
const write = (path, content) => writeFile(`${root}/${path}`, content)

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before)
  if (first < 0) throw new Error(`Trecho nao encontrado: ${label}`)
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Trecho ambiguo: ${label}`)
  return source.slice(0, first) + after + source.slice(first + before.length)
}

const hookPath = 'src/shared/hooks/useAppointments.js'
let hook = await read(hookPath)
hook = replaceOnce(hook, `const SERVICE_TRANSPORT_SELECT = \`
  id, client_id, sale_id, scheduled_for, delivery_address, delivery_neighborhood,
  delivery_city, delivery_reference, transport_mode, transport_label
\`
`, `const SERVICE_TRANSPORT_SELECT = \`
  id, client_id, sale_id, scheduled_for, delivery_address, delivery_neighborhood,
  delivery_city, delivery_reference, transport_mode, transport_label
\`

const APPOINTMENT_SYNC_EVENT = 'yuisync:appointments-sync'

function sortAppointmentState(items = []) {
  return [...items].sort((left, right) => new Date(left?.scheduled_at || 0) - new Date(right?.scheduled_at || 0))
}

function mergeAppointmentState(items = [], appointment) {
  if (!appointment?.id) return items
  const exists = items.some((item) => String(item?.id) === String(appointment.id))
  return sortAppointmentState(exists
    ? items.map((item) => String(item?.id) === String(appointment.id) ? appointment : item)
    : [...items, appointment])
}

function emitAppointmentSync(detail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent(APPOINTMENT_SYNC_EVENT, { detail }))
}
`, 'helpers de sincronizacao')
hook = replaceOnce(hook, `  const { activeModuleId } = useModuleCtx()
  const { activeTenantId } = useAuthCtx()

  const fetchAppointmentById`, `  const { activeModuleId } = useModuleCtx()
  const { activeTenantId } = useAuthCtx()

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const syncAppointmentState = (event) => {
      const detail = event?.detail || {}
      if (detail.moduleId && detail.moduleId !== activeModuleId) return
      if (detail.tenantId && activeTenantId && detail.tenantId !== activeTenantId) return
      if (detail.type === 'remove') {
        setAppointments((current) => current.filter((item) => String(item?.id) !== String(detail.id)))
        return
      }
      if (detail.appointment) setAppointments((current) => mergeAppointmentState(current, detail.appointment))
    }
    window.addEventListener(APPOINTMENT_SYNC_EVENT, syncAppointmentState)
    return () => window.removeEventListener(APPOINTMENT_SYNC_EVENT, syncAppointmentState)
  }, [activeModuleId, activeTenantId])

  const fetchAppointmentById`, 'listener de sincronizacao')
hook = replaceOnce(hook, `    const created = await fetchAppointmentById(response.data?.appointment_id)
    setAppointments((prev) => [...prev, created].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)))
    return created`, `    const created = await fetchAppointmentById(response.data?.appointment_id)
    setAppointments((current) => mergeAppointmentState(current, created))
    emitAppointmentSync({ type: 'upsert', appointment: created, moduleId: activeModuleId, tenantId: activeTenantId })
    return created`, 'sincronizacao da criacao')
hook = replaceOnce(hook, `    const updated = await fetchAppointmentById(id)
    setAppointments((prev) => prev.map((appt) => (appt.id === id ? updated : appt)))
    return updated`, `    const updated = await fetchAppointmentById(id)
    setAppointments((current) => mergeAppointmentState(current, updated))
    emitAppointmentSync({ type: 'upsert', appointment: updated, moduleId: activeModuleId, tenantId: activeTenantId })
    return updated`, 'sincronizacao da atualizacao')
hook = replaceOnce(hook, `    if (response.error) throw response.error
    setAppointments((prev) => prev.filter((appt) => appt.id !== id))
  }, [activeModuleId, activeTenantId])`, `    if (response.error) throw response.error
    setAppointments((current) => current.filter((appointment) => String(appointment?.id) !== String(id)))
    emitAppointmentSync({ type: 'remove', id, moduleId: activeModuleId, tenantId: activeTenantId })
  }, [activeModuleId, activeTenantId])`, 'sincronizacao da remocao')
await write(hookPath, hook)

const resolvedPath = 'src/modules/petshop/pages/AgendaResolvedPage.jsx'
let resolved = await read(resolvedPath)
resolved = resolved.replace(/^  drag: .*$/m, `  cancel: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',`)
if (!resolved.includes('  cancel:')) throw new Error('Icone de cancelamento nao aplicado')
resolved = replaceOnce(resolved, `  const refreshAgendaPage = useCallback(() => {
    document.querySelector('.page button[title="Atualizar"]')?.click()
  }, [])

`, '', 'remocao do refresh visual')
resolved = replaceOnce(resolved, `      const updated = await updateStatus(appointmentId, 'concluido')
      await load({ date: selectedDate })
      refreshAgendaPage()
      if (!updated) return`, `      const updated = await updateStatus(appointmentId, 'concluido')
      if (!updated) return`, 'conclusao sem carregamento')
resolved = replaceOnce(resolved, `  }, [load, printAppointment, refreshAgendaPage, selectedDate, setPage, transportOptions, updateStatus])`, `  }, [printAppointment, setPage, transportOptions, updateStatus])`, 'dependencias da conclusao')
resolved = replaceOnce(resolved, `  const moveAppointment = useCallback(async (appointmentId, timeText) => {`, `  const cancelAppointment = useCallback(async (appointmentId) => {
    setNotice('')
    try {
      await updateStatus(appointmentId, 'cancelado')
      setNotice('Agendamento cancelado.')
    } catch (error) {
      setNotice(error?.message || 'Nao foi possivel cancelar o agendamento.')
    }
  }, [updateStatus])

  const moveAppointment = useCallback(async (appointmentId, timeText) => {`, 'acao de cancelamento')
resolved = replaceOnce(resolved, `      await update(appointmentId, { scheduled_at: target.toISOString() })
      await load({ date: selectedDate })
      refreshAgendaPage()
      setNotice`, `      await update(appointmentId, { scheduled_at: target.toISOString() })
      setNotice`, 'arraste sem carregamento')
resolved = replaceOnce(resolved, `  }, [load, operationalAppointments, refreshAgendaPage, selectedDate, update])`, `  }, [operationalAppointments, selectedDate, update])`, 'dependencias do arraste')
resolved = replaceOnce(resolved, `    const actionMarkup = (movable, canComplete) => \`
      \${movable ? \`<button type="button" data-yuisync-action="drag" class="yuisync-resolved-action yuisync-resolved-drag-handle" aria-label="Mover agendamento" title="Segure e arraste para mudar o horario">\${ICONS.drag}</button>\` : ''}
      <button type="button" data-yuisync-action="print" class="yuisync-resolved-action" aria-label="Imprimir agendamento" title="Imprimir agendamento">\${ICONS.print}</button>
      \${canComplete ? \`<button type="button" data-yuisync-action="complete" class="yuisync-resolved-action is-complete" aria-label="Concluir agendamento" title="Concluir agendamento">\${ICONS.check}</button>\` : ''}
    \``, `    const actionMarkup = (canCancel, canComplete) => \`
      \${canCancel ? \`<button type="button" data-yuisync-action="cancel" class="yuisync-resolved-action is-cancel" aria-label="Cancelar agendamento" title="Cancelar agendamento">\${ICONS.cancel}</button>\` : ''}
      <button type="button" data-yuisync-action="print" class="yuisync-resolved-action" aria-label="Imprimir agendamento" title="Imprimir agendamento">\${ICONS.print}</button>
      \${canComplete ? \`<button type="button" data-yuisync-action="complete" class="yuisync-resolved-action is-complete" aria-label="Concluir agendamento" title="Concluir agendamento">\${ICONS.check}</button>\` : ''}
    \``, 'ordem dos botoes')
resolved = replaceOnce(resolved, `        card.title = movable ? 'Arraste o card ou use a alca para mudar o horario' : card.title`, `        card.title = movable ? 'Arraste o card para mudar o horario' : card.title`, 'titulo do card')
resolved = replaceOnce(resolved, `      const action = event.target.closest?.('[data-yuisync-action]')
      if (action && action.dataset.yuisyncAction !== 'drag') return`, `      const action = event.target.closest?.('[data-yuisync-action]')
      if (action) return`, 'acoes nao iniciam arraste')
resolved = replaceOnce(resolved, `        if (action.dataset.yuisyncAction === 'print') printAppointment(appointment)
        if (action.dataset.yuisyncAction === 'complete') void completeAppointment(appointment.id)`, `        if (action.dataset.yuisyncAction === 'cancel') void cancelAppointment(appointment.id)
        if (action.dataset.yuisyncAction === 'print') printAppointment(appointment)
        if (action.dataset.yuisyncAction === 'complete') void completeAppointment(appointment.id)`, 'clique de cancelamento')
resolved = replaceOnce(resolved, `  }, [completeAppointment, load, moveAppointment, operationalAppointments, printAppointment, printDay, selectedDate, statusBadge, storeSettings?.petshop_service_durations, transportOptions])`, `  }, [cancelAppointment, completeAppointment, load, moveAppointment, operationalAppointments, printAppointment, printDay, selectedDate, statusBadge, storeSettings?.petshop_service_durations, transportOptions])`, 'dependencias das acoes')
await write(resolvedPath, resolved)

const cssPath = 'src/modules/petshop/pages/AgendaResolvedPage.css'
let css = await read(cssPath)
css = replaceOnce(css, `.yuisync-resolved-action.is-complete {
  background: #059669;
  border-color: rgba(236, 253, 245, 0.8);
}

.yuisync-resolved-drag-handle {
  cursor: grab;
  touch-action: none;
}
`, `.yuisync-resolved-action.is-complete {
  background: #059669;
  border-color: rgba(236, 253, 245, 0.8);
}

.yuisync-resolved-action.is-cancel {
  background: rgba(127, 29, 29, 0.96);
  border-color: rgba(254, 202, 202, 0.72);
  color: #fee2e2;
}

.yuisync-resolved-action.is-cancel:hover {
  background: rgba(185, 28, 28, 0.98);
}
`, 'estilo do cancelamento')
await write(cssPath, css)

const testPath = 'test/agendaAdaptiveCards.test.mjs'
let testFile = await read(testPath)
testFile += `

test('acoes ficam cancelar imprimir concluir e sincronizam sem recarregar a tabela', async () => {
  const [resolved, css, hook] = await Promise.all([
    readFile(new URL('../src/modules/petshop/pages/AgendaResolvedPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/petshop/pages/AgendaResolvedPage.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/shared/hooks/useAppointments.js', import.meta.url), 'utf8'),
  ])
  const cancelIndex = resolved.indexOf('data-yuisync-action="cancel"')
  const printIndex = resolved.indexOf('data-yuisync-action="print"')
  const completeIndex = resolved.indexOf('data-yuisync-action="complete"')
  assert.ok(cancelIndex >= 0 && cancelIndex < printIndex && printIndex < completeIndex)
  assert.doesNotMatch(resolved, /data-yuisync-action="drag"/)
  assert.match(resolved, /updateStatus\(appointmentId, 'cancelado'\)/)
  assert.match(resolved, /const action = event\.target\.closest[\s\S]*if \(action\) return/)
  assert.doesNotMatch(resolved, /button\[title="Atualizar"\]/)
  assert.match(css, /\.yuisync-resolved-action\.is-cancel/)
  assert.match(hook, /APPOINTMENT_SYNC_EVENT/)
  assert.match(hook, /emitAppointmentSync\(\{ type: 'upsert'/)
})
`
await write(testPath, testFile)

for (const path of [hookPath, resolvedPath, cssPath, testPath]) {
  const encoded = Buffer.from(await read(path), 'utf8').toString('base64')
  const chunkSize = 3000
  const total = Math.ceil(encoded.length / chunkSize)
  for (let index = 0; index < total; index += 1) {
    const chunk = encoded.slice(index * chunkSize, (index + 1) * chunkSize)
    console.log(`YUISYNC_BLOB|${path}|${index + 1}|${total}|${chunk}`)
  }
}
