import { readFile, writeFile, copyFile } from 'node:fs/promises'

async function read(path) {
  return readFile(path, 'utf8')
}

async function write(path, content) {
  await writeFile(path, content, 'utf8')
}

async function replaceOnce(path, before, after, label) {
  const source = await read(path)
  if (!source.includes(before)) throw new Error(`${path}: trecho nao encontrado (${label})`)
  await write(path, source.replace(before, after))
}

async function replaceRegex(path, regex, after, label) {
  const source = await read(path)
  if (!regex.test(source)) throw new Error(`${path}: bloco nao encontrado (${label})`)
  await write(path, source.replace(regex, after))
}

const appointmentsPath = 'src/shared/hooks/useAppointments.js'
await replaceOnce(
  appointmentsPath,
  `  id, pet_id, client_id, service_type, service_group, service_items, scheduled_at, duration_min, price, status, notes, source, created_at,\n  employee_id, groomer_id, responsible_staff_key, responsible_staff_name, live_status, checkin_at, ready_at, subscription_id, subscription_benefit_used`,
  `  id, pet_id, client_id, service_type, service_group, service_items, scheduled_at, duration_min, price, status, notes, source, created_at,\n  employee_id, groomer_id, responsible_staff_key, responsible_staff_name,\n  transport_mode, transport_label, transport_address, transport_neighborhood, transport_city, transport_reference,\n  live_status, checkin_at, ready_at, subscription_id, subscription_benefit_used`,
  'campos operacionais da agenda',
)

await replaceOnce(
  appointmentsPath,
  `  return appointments.map((appointment) => {\n    const transport = transportMap.get(transportScheduleKey(appointment.client_id, appointment.scheduled_at))\n    if (!transport) return appointment\n    return {\n      ...appointment,\n      motodog: {\n        mode: transport.transport_mode || null,\n        label: transport.transport_label || null,\n        address: transport.delivery_address || null,\n        neighborhood: transport.delivery_neighborhood || null,\n        city: transport.delivery_city || null,\n        reference: transport.delivery_reference || null,\n      },\n    }\n  })`,
  `  return appointments.map((appointment) => {\n    const transport = transportMap.get(transportScheduleKey(appointment.client_id, appointment.scheduled_at))\n    if (!transport) return appointment\n    return {\n      ...appointment,\n      motodog: {\n        ...(appointment.motodog || {}),\n        mode: transport.transport_mode || appointment.motodog?.mode || null,\n        label: transport.transport_label || appointment.motodog?.label || null,\n        address: transport.delivery_address || appointment.motodog?.address || null,\n        neighborhood: transport.delivery_neighborhood || appointment.motodog?.neighborhood || null,\n        city: transport.delivery_city || appointment.motodog?.city || null,\n        reference: transport.delivery_reference || appointment.motodog?.reference || null,\n      },\n    }\n  })`,
  'merge de transporte',
)

await replaceOnce(
  appointmentsPath,
  `  const normalized = {\n    ...appointment,\n    service_items: Array.isArray(appointment.service_items) ? appointment.service_items : [],\n  }\n  if (!normalized.clients) return normalized`,
  `  const normalized = {\n    ...appointment,\n    service_items: Array.isArray(appointment.service_items) ? appointment.service_items : [],\n    motodog: appointment.transport_mode\n      ? {\n        mode: appointment.transport_mode,\n        label: appointment.transport_label || null,\n        address: appointment.transport_address || null,\n        neighborhood: appointment.transport_neighborhood || null,\n        city: appointment.transport_city || null,\n        reference: appointment.transport_reference || null,\n      }\n      : null,\n  }\n  if (!normalized.clients) return normalized`,
  'mapeamento do transporte manual',
)

await replaceOnce(
  appointmentsPath,
  `function normalizeAppointmentPayload(payload = {}, moduleId) {\n  const apiPayload = { ...payload }\n  if (moduleId) apiPayload.module_id = moduleId\n\n  const clientId = apiPayload.client_id || apiPayload.pet_id\n  if (clientId) {\n    apiPayload.client_id = clientId\n    apiPayload.pet_id = apiPayload.pet_id || clientId\n  }\n\n  return apiPayload\n}\n`,
  `function normalizeAppointmentPayload(payload = {}, moduleId) {\n  const apiPayload = { ...payload }\n  if (moduleId) apiPayload.module_id = moduleId\n\n  const clientId = apiPayload.client_id || apiPayload.pet_id\n  if (clientId) {\n    apiPayload.client_id = clientId\n    apiPayload.pet_id = apiPayload.pet_id || clientId\n  }\n\n  return apiPayload\n}\n\nconst APPOINTMENT_OPERATIONAL_FIELDS = [\n  'responsible_staff_key',\n  'responsible_staff_name',\n  'transport_mode',\n  'transport_label',\n  'transport_address',\n  'transport_neighborhood',\n  'transport_city',\n  'transport_reference',\n]\n\nfunction hasAppointmentOperationalFields(payload = {}) {\n  return APPOINTMENT_OPERATIONAL_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(payload, field))\n}\n\nfunction appointmentOperationalPatch(payload = {}) {\n  return Object.fromEntries(APPOINTMENT_OPERATIONAL_FIELDS.map((field) => [field, payload[field] || null]))\n}\n`,
  'helpers de persistencia operacional',
)

await replaceOnce(
  appointmentsPath,
  `    if (payload.responsible_staff_key || payload.responsible_staff_name) {\n      const assignment = await runWithTenantFallback(activeTenantId, async (includeTenant) => {\n        let query = supabase\n          .from('appointments')\n          .update({\n            responsible_staff_key: payload.responsible_staff_key || null,\n            responsible_staff_name: payload.responsible_staff_name || null,\n          })\n          .eq('id', response.data?.appointment_id)\n          .eq('module_id', activeModuleId)\n        query = applyTenantFilter(query, activeTenantId, includeTenant)\n        return query\n      })\n      if (assignment.error) throw assignment.error\n    }`,
  `    if (hasAppointmentOperationalFields(payload)) {\n      const assignment = await runWithTenantFallback(activeTenantId, async (includeTenant) => {\n        let query = supabase\n          .from('appointments')\n          .update(appointmentOperationalPatch(payload))\n          .eq('id', response.data?.appointment_id)\n          .eq('module_id', activeModuleId)\n        query = applyTenantFilter(query, activeTenantId, includeTenant)\n        return query\n      })\n      if (assignment.error) throw assignment.error\n    }`,
  'persistencia operacional na criacao',
)

await replaceOnce(
  appointmentsPath,
  `    const operationalAssignment = {\n      responsible_staff_key: apiPayload.responsible_staff_key || null,\n      responsible_staff_name: apiPayload.responsible_staff_name || null,\n    }\n    const hasOperationalAssignment = Object.prototype.hasOwnProperty.call(apiPayload, 'responsible_staff_key')\n      || Object.prototype.hasOwnProperty.call(apiPayload, 'responsible_staff_name')\n    delete apiPayload.responsible_staff_key\n    delete apiPayload.responsible_staff_name`,
  `    const operationalAssignment = appointmentOperationalPatch(apiPayload)\n    const hasOperationalAssignment = hasAppointmentOperationalFields(apiPayload)\n    APPOINTMENT_OPERATIONAL_FIELDS.forEach((field) => delete apiPayload[field])`,
  'persistencia operacional na edicao',
)

const advancedPath = 'src/modules/petshop/hooks/usePetshopAdvanced.js'
await replaceOnce(
  advancedPath,
  `const APPT_BASE_SELECT = 'id,module_id,pet_id,client_id,groomer_id,service_type,scheduled_at,duration_min,price,status,live_status,checkin_at,ready_at,notes,subscription_benefit_used'`,
  `const APPT_BASE_SELECT = 'id,module_id,pet_id,client_id,groomer_id,responsible_staff_key,responsible_staff_name,service_type,service_group,service_items,scheduled_at,duration_min,price,status,live_status,checkin_at,ready_at,notes,subscription_benefit_used,transport_mode,transport_label,transport_address,transport_neighborhood,transport_city,transport_reference'`,
  'select de agendamentos para comissao',
)

await replaceOnce(
  advancedPath,
  `const hasCommissionsV2SignatureError = (error) => {\n  const m = String(error?.message || '').toLowerCase()\n  return m.includes('calculate_petshop_commissions_v2') && (\n    m.includes('does not exist')\n    || m.includes('schema cache')\n    || m.includes('could not find the function')\n  )\n}\n`,
  `const hasCommissionsV2SignatureError = (error) => {\n  const m = String(error?.message || '').toLowerCase()\n  return m.includes('calculate_petshop_commissions_v2') && (\n    m.includes('does not exist')\n    || m.includes('schema cache')\n    || m.includes('could not find the function')\n  )\n}\nconst hasOperationalCommissionsSignatureError = (error) => {\n  const m = String(error?.message || '').toLowerCase()\n  return m.includes('calculate_petshop_operational_commissions') && (\n    m.includes('does not exist')\n    || m.includes('schema cache')\n    || m.includes('could not find the function')\n  )\n}\n`,
  'deteccao da RPC operacional',
)

const newSnapshot = `  const loadTeamSnapshot = useCallback(async ({ startDate, endDate } = {}) => {\n    const range = getMonthRange(new Date())\n    const start = startDate ? \`${'${startDate}'}T00:00:00.000Z\` : range.start\n    const end = endDate ? \`${'${endDate}'}T23:59:59.999Z\` : range.end\n\n    let profiles = []\n    let rows = []\n    let usingLegacy = false\n    const operationalRes = await supabase.rpc('calculate_petshop_operational_commissions', {\n      p_module_id: moduleId,\n      p_start: start,\n      p_end: end,\n      p_tenant_id: activeTenantId || null,\n    })\n\n    if (!operationalRes.error) {\n      rows = (operationalRes.data || []).map((entry) => ({\n        ...entry,\n        service_count: Number(entry.service_count || 0),\n        grooming_count: Number(entry.grooming_count || 0),\n        other_service_count: Number(entry.other_service_count || 0),\n        service_revenue: Number(entry.service_revenue || 0),\n        grooming_revenue: Number(entry.grooming_revenue || 0),\n        other_service_revenue: Number(entry.other_service_revenue || 0),\n        grooming_commission: Number(entry.grooming_commission || 0),\n        other_service_commission: Number(entry.other_service_commission || 0),\n        total_commission: Number(entry.total_commission || 0),\n        sales_count: 0,\n        motoboy_count: 0,\n        sales_revenue: 0,\n        motoboy_revenue: 0,\n        sales_commission: 0,\n        motoboy_commission: 0,\n      }))\n    } else {\n      if (!hasOperationalCommissionsSignatureError(operationalRes.error)) throw operationalRes.error\n\n      let rpcRes = await supabase.rpc('calculate_petshop_commissions_v2', { p_module_id: moduleId, p_start: start, p_end: end, p_tenant_id: activeTenantId || null })\n      if (rpcRes.error && hasCommissionsV2SignatureError(rpcRes.error)) {\n        usingLegacy = true\n        rpcRes = await supabase.rpc('calculate_commissions', { p_module_id: moduleId, p_start: start, p_end: end, p_tenant_id: activeTenantId || null })\n        if (rpcRes.error && hasCommissionsSignatureError(rpcRes.error)) {\n          rpcRes = await supabase.rpc('calculate_commissions', { p_module_id: moduleId, p_start: start, p_end: end })\n        }\n      }\n      if (rpcRes.error) throw rpcRes.error\n\n      const commissionState = await loadCommissionRules()\n      profiles = commissionState.profiles\n      const ruleMap = new Map((commissionState.rules || []).map((rule) => [rule.profile_id, rule]))\n      rows = (rpcRes.data || []).map((entry) => usingLegacy ? ({\n        ...entry,\n        collaborator_name: entry.groomer_name,\n        service_count: Number(entry.appointments_count || 0),\n        grooming_count: 0,\n        other_service_count: Number(entry.appointments_count || 0),\n        service_revenue: Number(entry.revenue || 0),\n        grooming_commission: 0,\n        other_service_commission: Number(entry.commission || 0),\n        total_commission: Number(entry.commission || 0),\n        rule: ruleMap.get(entry.profile_id) || null,\n      }) : ({\n        ...entry,\n        service_count: Number(entry.service_count || 0),\n        grooming_count: Number(entry.grooming_count || 0),\n        other_service_count: Number(entry.other_service_count || entry.service_count || 0),\n        service_revenue: Number(entry.service_revenue || 0),\n        grooming_commission: Number(entry.grooming_commission || 0),\n        other_service_commission: Number(entry.other_service_commission || entry.service_commission || 0),\n        total_commission: Number(entry.total_commission || 0),\n        rule: ruleMap.get(entry.profile_id) || null,\n      }))\n    }\n\n    let pendingRes = await runScoped(async (includeTenant) => {\n      let query = supabase\n        .from('appointments')\n        .select(APPT_SELECT)\n        .eq('module_id', moduleId)\n        .eq('status', 'concluido')\n        .is('responsible_staff_key', null)\n        .gte('scheduled_at', start)\n        .lte('scheduled_at', end)\n        .order('scheduled_at', { ascending: false })\n      return applyTenantFilter(query, activeTenantId, includeTenant)\n    })\n\n    if (pendingRes.error && isAppointmentClientRelationError(pendingRes.error)) {\n      pendingRes = await runScoped(async (includeTenant) => {\n        let query = supabase\n          .from('appointments')\n          .select(APPT_BASE_SELECT)\n          .eq('module_id', moduleId)\n          .eq('status', 'concluido')\n          .is('responsible_staff_key', null)\n          .gte('scheduled_at', start)\n          .lte('scheduled_at', end)\n          .order('scheduled_at', { ascending: false })\n        return applyTenantFilter(query, activeTenantId, includeTenant)\n      })\n      if (pendingRes.error) throw pendingRes.error\n      const clientMap = await loadClientMap((pendingRes.data || []).map((appointment) => appointment.client_id))\n      pendingRes.data = (pendingRes.data || []).map((appointment) => ({\n        ...appointment,\n        clients: clientMap.get(appointment.client_id) || null,\n      }))\n    }\n    if (pendingRes.error) throw pendingRes.error\n\n    const pendingServices = (pendingRes.data || []).map((appointment) => ({\n      ...appointment,\n      client: formatClient(appointment.clients || {}),\n      price: Number(appointment.price || 0),\n    }))\n\n    return {\n      profiles,\n      rows,\n      pendingServices,\n      usingLegacy,\n      range: { startDate: startDate || range.startDate, endDate: endDate || range.endDate },\n    }\n  }, [activeTenantId, loadClientMap, loadCommissionRules, moduleId, runScoped])\n\n  const exportCommissionCsv`

await replaceRegex(
  advancedPath,
  /  const loadTeamSnapshot = useCallback\(async \(\{ startDate, endDate \} = \{\}\) => \{[\s\S]*?\n  \}, \[activeTenantId, loadClientMap, loadCommissionRules, moduleId, runScoped\]\)\n\n  const exportCommissionCsv/,
  newSnapshot,
  'snapshot operacional',
)

const newExport = `  const exportCommissionCsv = useCallback((rows, fileName = 'comissoes-petshop.csv') => {\n    const operational = (rows || []).some((row) => row.staff_key)\n    const lines = operational\n      ? [\n        ['Esteticista', 'Servicos', 'Tosas', 'Outros servicos', 'Receita', 'Comissao tosa 10%', 'Comissao outros 5%', 'Total comissao'].join(','),\n        ...(rows || []).map((row) => [\n          \`"${'${row.collaborator_name || row.staff_key || ""}'}"\`,\n          row.service_count || 0,\n          row.grooming_count || 0,\n          row.other_service_count || 0,\n          Number(row.service_revenue || 0).toFixed(2),\n          Number(row.grooming_commission || 0).toFixed(2),\n          Number(row.other_service_commission || 0).toFixed(2),\n          Number(row.total_commission || 0).toFixed(2),\n        ].join(',')),\n      ]\n      : [\n        ['Colaborador', 'Servicos', 'Vendas', 'Motoboy', 'Faturamento servicos', 'Faturamento vendas', 'Faturamento motoboy', 'Comissao servicos', 'Comissao vendas', 'Comissao motoboy', 'Total comissao'].join(','),\n        ...(rows || []).map((row) => [\n          \`"${'${row.collaborator_name || row.groomer_name || ""}'}"\`,\n          row.service_count || row.appointments_count || 0,\n          row.sales_count || 0,\n          row.motoboy_count || 0,\n          Number(row.service_revenue ?? row.revenue ?? 0).toFixed(2),\n          Number(row.sales_revenue || 0).toFixed(2),\n          Number(row.motoboy_revenue || 0).toFixed(2),\n          Number(row.service_commission ?? row.commission ?? 0).toFixed(2),\n          Number(row.sales_commission || 0).toFixed(2),\n          Number(row.motoboy_commission || 0).toFixed(2),\n          Number(row.total_commission ?? row.commission ?? 0).toFixed(2),\n        ].join(',')),\n      ]\n    const blob = new Blob([lines.join('\\n')], { type: 'text/csv;charset=utf-8;' })\n    const url = URL.createObjectURL(blob)\n    const anchor = document.createElement('a')\n    anchor.href = url\n    anchor.download = fileName\n    anchor.click()\n    URL.revokeObjectURL(url)\n  }, [])\n\n  const loadGroomers`

await replaceRegex(
  advancedPath,
  /  const exportCommissionCsv = useCallback\(\(rows, fileName = 'comissoes-petshop\.csv'\) => \{[\s\S]*?\n  \}, \[\]\)\n\n  const loadGroomers/,
  newExport,
  'exportacao operacional',
)

const agendaPath = 'src/modules/petshop/pages/AgendaPage.jsx'
await replaceOnce(
  agendaPath,
  `} from '../lib/appointmentServices'\n`,
  `} from '../lib/appointmentServices'\nimport {\n  MANUAL_SLOT_CAPACITY,\n  appointmentOccupiesManualSlot,\n  appointmentTransportAddress,\n  appointmentTransportLabel,\n  isMotodogTransportMode,\n} from '../lib/appointmentOperational'\n`,
  'import operacional',
)

await replaceOnce(
  agendaPath,
  `const motodogAddressText = (appt) => [\n  appt?.motodog?.address,\n  appt?.motodog?.neighborhood,\n  appt?.motodog?.city,\n].filter(Boolean).join(' - ')`,
  `const motodogAddressText = (appt) => appointmentTransportAddress(appt)`,
  'endereco de transporte',
)

await replaceRegex(
  agendaPath,
  /function MotodogAgendaInfo\(\{ appt, compact = false \}\) \{[\s\S]*?\n\}\n\nconst agendaCardTone/,
  `function MotodogAgendaInfo({ appt, compact = false }) {\n  if (!appt?.motodog?.mode) return null\n  const address = motodogAddressText(appt)\n  const motodog = isMotodogTransportMode(appt.motodog.mode)\n  return (\n    <div className={\`${'${compact ? "mt-1 text-[10px]" : "rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-2 text-[11px]"}'} ${'${motodog ? "text-emerald-300" : "text-sky-300"}'}\`}>\n      <p className="flex items-center gap-1 font-bold">\n        <Bike size={compact ? 10 : 12}/> {appointmentTransportLabel(appt.motodog.mode)}\n      </p>\n      {motodog && address && (\n        <p className="mt-1 flex items-start gap-1 text-muted">\n          <MapPin size={compact ? 9 : 11} className="mt-0.5 shrink-0"/>\n          <span>{address}</span>\n        </p>\n      )}\n      {motodog && appt.motodog.reference && (\n        <p className="mt-1 text-muted">Referencia: {appt.motodog.reference}</p>\n      )}\n    </div>\n  )\n}\n\nconst agendaCardTone`,
  'informacao de transporte',
)

const receiptBlock = `const escapeReceiptHtml = (value = '') => String(value ?? '')\n  .replace(/&/g, '&amp;')\n  .replace(/</g, '&lt;')\n  .replace(/>/g, '&gt;')\n  .replace(/"/g, '&quot;')\n  .replace(/'/g, '&#039;')\n\nfunction ReceiptModal({ appt, onClose, serviceLabel, staffById = new Map() }) {\n  const { storeSettings } = useAuthCtx()\n  const pet = appt.pets || {}\n  const assigned = staffById.get(appt.responsible_staff_key)\n  const responsible = assigned?.name || appt.responsible_staff_name || 'Nao informado'\n  const scheduled = appt.scheduled_at ? new Date(appt.scheduled_at) : null\n  const date = scheduled && !Number.isNaN(scheduled.getTime())\n    ? scheduled.toLocaleDateString('pt-BR')\n    : 'Nao informada'\n  const interval = fmtAppointmentInterval(appt)\n  const transport = appointmentTransportLabel(appt.motodog?.mode)\n  const transportAddress = motodogAddressText(appt)\n  const isMotodog = isMotodogTransportMode(appt.motodog?.mode)\n\n  const handlePrint = () => {\n    const printWindow = window.open('', '_blank')\n    if (!printWindow) return\n    const storeAddress = [\n      storeSettings?.store_address,\n      storeSettings?.store_neighborhood,\n      storeSettings?.store_city,\n    ].filter(Boolean).join(' - ')\n\n    const row = (label, value) => \`\n      <div class="row">\n        <div class="label">${'${escapeReceiptHtml(label)}'}</div>\n        <div class="value">${'${escapeReceiptHtml(value || "Nao informado")}'}</div>\n      </div>\n    \`\n\n    const receiptHtml = \`\n      <html>\n        <head>\n          <meta charset="utf-8"/>\n          <title>Ficha de atendimento</title>\n          <style>\n            @page { size: 80mm auto; margin: 0; }\n            * { box-sizing: border-box; }\n            html, body { width: 80mm; margin: 0; padding: 0; color: #000; background: #fff; }\n            body { font-family: Arial, Helvetica, sans-serif; padding: 4mm 3mm; }\n            .receipt { width: 100%; }\n            .center { text-align: center; }\n            .store { font-size: 15px; font-weight: 900; text-transform: uppercase; }\n            .store-line { margin-top: 2px; font-size: 9px; line-height: 1.25; }\n            .title { margin: 4mm 0 2mm; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 2mm 0; font-size: 12px; font-weight: 900; letter-spacing: .4px; }\n            .row { padding: 1.6mm 0; border-bottom: 1px dotted #777; }\n            .label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: .4px; }\n            .value { margin-top: .6mm; font-size: 11px; font-weight: 700; line-height: 1.25; white-space: pre-wrap; overflow-wrap: anywhere; }\n            .transport { margin-top: 2mm; border: 1px solid #000; padding: 2mm; }\n            .total { display: flex; justify-content: space-between; gap: 3mm; margin-top: 3mm; padding-top: 2mm; border-top: 2px solid #000; font-size: 13px; font-weight: 900; }\n            .footer { margin-top: 4mm; font-size: 8px; line-height: 1.35; }\n            @media print { body { position: absolute; inset: 0 auto auto 0; } }\n          </style>\n        </head>\n        <body>\n          <main class="receipt">\n            <div class="center">\n              <div class="store">${'${escapeReceiptHtml(storeSettings?.store_name || "PETSHOP")}'}</div>\n              <div class="store-line">${'${escapeReceiptHtml(storeAddress || "Endereco nao configurado")}'}</div>\n              <div class="store-line">${'${escapeReceiptHtml(storeSettings?.store_phone || "")}'}</div>\n              <div class="title">FICHA DE ATENDIMENTO</div>\n            </div>\n            ${'${row("Tutor", pet.owner_name)}'}\n            ${'${row("Contato", pet.phone)}'}\n            ${'${row("Pet", pet.pet_name)}'}\n            ${'${row("Raca / especie", pet.breed || pet.species)}'}\n            ${'${row("Data", date)}'}\n            ${'${row("Horario", interval)}'}\n            ${'${row("Servico", serviceLabel(appt))}'}\n            ${'${row("Responsavel", responsible)}'}\n            <div class="transport">\n              <div class="label">Transporte</div>\n              <div class="value">${'${escapeReceiptHtml(transport)}'}</div>\n              ${'${isMotodog && transportAddress ? `<div class="label" style="margin-top:2mm">Endereco completo</div><div class="value">${escapeReceiptHtml(transportAddress)}</div>` : ""}'}\n              ${'${isMotodog && appt.motodog?.reference ? `<div class="label" style="margin-top:2mm">Referencia</div><div class="value">${escapeReceiptHtml(appt.motodog.reference)}</div>` : ""}'}\n            </div>\n            ${'${row("Observacoes", appt.notes || "Nenhuma observacao")}' }\n            <div class="total"><span>VALOR</span><span>${'${escapeReceiptHtml(fmtCurrency(appt.price))}'}</span></div>\n            <div class="footer center">Impresso em ${'${escapeReceiptHtml(new Date().toLocaleString("pt-BR"))}'}</div>\n          </main>\n        </body>\n      </html>\n    \`\n    printWindow.document.write(receiptHtml)\n    printWindow.document.close()\n    printThermalReceipt(printWindow)\n  }\n\n  return createPortal(\n    <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && onClose()}>\n      <div className="modal-box max-w-md">\n        <div className="modal-header">\n          <h2 className="font-display font-bold text-xl text-text">Ficha 80 mm</h2>\n          <button type="button" aria-label="Fechar impressao" title="Fechar" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>\n        </div>\n        <div className="modal-body space-y-5">\n          <div className="rounded-2xl border border-[var(--border)] bg-card p-5 space-y-3 text-sm">\n            <p><span className="text-muted">Tutor:</span> <strong>{pet.owner_name || 'Nao informado'}</strong></p>\n            <p><span className="text-muted">Pet:</span> <strong>{pet.pet_name || 'Nao informado'}</strong></p>\n            <p><span className="text-muted">Horario:</span> <strong>{date} · {interval}</strong></p>\n            <p><span className="text-muted">Servico:</span> <strong>{serviceLabel(appt)}</strong></p>\n            <p><span className="text-muted">Responsavel:</span> <strong>{responsible}</strong></p>\n            <p><span className="text-muted">Transporte:</span> <strong>{transport}</strong></p>\n            {isMotodog && transportAddress && <p className="text-xs text-muted">{transportAddress}</p>}\n            <p><span className="text-muted">Observacoes:</span> <strong>{appt.notes || 'Nenhuma observacao'}</strong></p>\n          </div>\n          <button onClick={handlePrint} className="btn btn-primary w-full justify-center gap-2 py-3">\n            <Receipt size={16}/> Imprimir ficha\n          </button>\n        </div>\n      </div>\n    </div>,\n    document.body,\n  )\n}\n\n// ── Modal de Agendamento`

await replaceRegex(
  agendaPath,
  /function ReceiptModal\(\{ appt, onClose, serviceLabel \}\) \{[\s\S]*?\n\}\n\n\/\/ ── Modal de Agendamento/,
  receiptBlock,
  'ficha termica',
)

await replaceOnce(
  agendaPath,
  `function ApptModal({ appt, onClose, onCreate, onUpdate, pets, services = SERVICES, staff = [], serviceDurations, onSearchClients }) {`,
  `function ApptModal({ appt, onClose, onCreate, onUpdate, onReceipt, pets, services = SERVICES, staff = [], serviceDurations, onSearchClients }) {`,
  'callback de impressao',
)

await replaceOnce(
  agendaPath,
  `    notes: isEdit ? appt.notes || '' : '',\n    responsible_staff_key: isEdit ? appt.responsible_staff_key || '' : '',`,
  `    notes: isEdit ? appt.notes || '' : '',\n    responsible_staff_key: isEdit ? appt.responsible_staff_key || '' : '',\n    transport_mode: isEdit ? appt.motodog?.mode || 'cliente_leva' : 'cliente_leva',\n    transport_address: isEdit ? appt.motodog?.address || '' : '',\n    transport_neighborhood: isEdit ? appt.motodog?.neighborhood || '' : '',\n    transport_city: isEdit ? appt.motodog?.city || '' : '',\n    transport_reference: isEdit ? appt.motodog?.reference || '' : '',`,
  'estado de transporte',
)

await replaceOnce(
  agendaPath,
  `  const selectClient = (pet) => {\n    setForm((current) => ({ ...current, pet_id: pet.id, pet_search: '' }))`,
  `  const selectClient = (pet) => {\n    setForm((current) => ({\n      ...current,\n      pet_id: pet.id,\n      pet_search: '',\n      ...(isMotodogTransportMode(current.transport_mode) ? {\n        transport_address: current.transport_address || pet.owner_address || '',\n        transport_neighborhood: current.transport_neighborhood || pet.owner_neighborhood || '',\n        transport_city: current.transport_city || pet.owner_city || '',\n      } : {}),\n    }))`,
  'preenchimento de endereco',
)

await replaceOnce(
  agendaPath,
  `        responsible_staff_key: form.responsible_staff_key || null,\n        responsible_staff_name: staffOptions.find((person) => person.key === form.responsible_staff_key)?.name || null,\n        source: 'manual',`,
  `        responsible_staff_key: form.responsible_staff_key || null,\n        responsible_staff_name: staffOptions.find((person) => person.key === form.responsible_staff_key)?.name || null,\n        transport_mode: form.transport_mode || 'cliente_leva',\n        transport_label: appointmentTransportLabel(form.transport_mode),\n        transport_address: isMotodogTransportMode(form.transport_mode) ? form.transport_address || null : null,\n        transport_neighborhood: isMotodogTransportMode(form.transport_mode) ? form.transport_neighborhood || null : null,\n        transport_city: isMotodogTransportMode(form.transport_mode) ? form.transport_city || null : null,\n        transport_reference: isMotodogTransportMode(form.transport_mode) ? form.transport_reference || null : null,\n        source: 'manual',`,
  'payload de transporte',
)

await replaceOnce(
  agendaPath,
  `            <div>\n              <label className="inp-label">Instrucoes para o profissional</label>`,
  `            <div className="rounded-2xl border border-[var(--border)] bg-surface/70 p-5 space-y-4">\n              <div>\n                <label className="inp-label">Transporte do pet</label>\n                <select\n                  aria-label="Transporte do pet"\n                  className="inp"\n                  value={form.transport_mode}\n                  onChange={(event) => set('transport_mode', event.target.value)}\n                >\n                  <option value="cliente_leva">Cliente traz e busca</option>\n                  <option value="buscar_e_levar">MotoDog - buscar e levar</option>\n                  <option value="somente_buscar">MotoDog - somente buscar</option>\n                  <option value="somente_levar">MotoDog - somente levar</option>\n                </select>\n              </div>\n\n              {isMotodogTransportMode(form.transport_mode) && (\n                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">\n                  <div className="md:col-span-2">\n                    <label className="inp-label">Rua e numero</label>\n                    <input className="inp" value={form.transport_address} onChange={(event) => set('transport_address', event.target.value)} placeholder="Rua, numero e complemento"/>\n                  </div>\n                  <div>\n                    <label className="inp-label">Bairro</label>\n                    <input className="inp" value={form.transport_neighborhood} onChange={(event) => set('transport_neighborhood', event.target.value)}/>\n                  </div>\n                  <div>\n                    <label className="inp-label">Cidade</label>\n                    <input className="inp" value={form.transport_city} onChange={(event) => set('transport_city', event.target.value)}/>\n                  </div>\n                  <div className="md:col-span-2">\n                    <label className="inp-label">Ponto de referencia</label>\n                    <input className="inp" value={form.transport_reference} onChange={(event) => set('transport_reference', event.target.value)}/>\n                  </div>\n                </div>\n              )}\n            </div>\n\n            <div>\n              <label className="inp-label">Instrucoes para o profissional</label>`,
  'campos de transporte',
)

await replaceOnce(
  agendaPath,
  `            <div className="flex gap-3 pt-2">\n              <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">Descartar</button>`,
  `            <div className="flex flex-wrap gap-3 pt-2">\n              {isEdit && appt.status === 'concluido' && (\n                <button type="button" onClick={() => onReceipt(appt)} className="btn btn-secondary justify-center">\n                  <Receipt size={15}/> Imprimir ficha\n                </button>\n              )}\n              <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">Descartar</button>`,
  'botao de impressao no modal',
)

const timelineBlock = `function AgendaTimelineView({\n  days,\n  selectedDate,\n  appointments,\n  serviceLabel,\n  statusBadge,\n  staffById,\n  onEdit,\n  onReceipt,\n  onCreateAt,\n  onSelectDate,\n  slotCapacity = MANUAL_SLOT_CAPACITY,\n}) {\n  const selectedKey = isoDate(selectedDate)\n  const hours = useMemo(() => {\n    const appointmentHours = (appointments || [])\n      .map((appt) => localHour(appt.scheduled_at))\n      .filter((hour) => hour >= 0 && hour <= 23)\n    const min = Math.min(AGENDA_HOURS[0], ...(appointmentHours.length ? appointmentHours : [AGENDA_HOURS[0]]))\n    const max = Math.max(AGENDA_HOURS[AGENDA_HOURS.length - 1], ...(appointmentHours.length ? appointmentHours : [AGENDA_HOURS[AGENDA_HOURS.length - 1]]))\n    return Array.from({ length: max - min + 1 }, (_, index) => min + index)\n  }, [appointments])\n\n  const bySlot = useMemo(() => {\n    const map = new Map()\n    ;(appointments || []).forEach((appt) => {\n      const key = \`${'${localDateKey(appt.scheduled_at)}'}-${'${localHour(appt.scheduled_at)}'}\`\n      const list = map.get(key) || []\n      list.push(appt)\n      map.set(key, list)\n    })\n    map.forEach((list) => list.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)))\n    return map\n  }, [appointments])\n\n  const appointmentCard = (appt) => {\n    const sb = statusBadge(appt.status)\n    const assigned = staffById.get(appt.responsible_staff_key)\n    return (\n      <div key={appt.id} className={\`relative w-full rounded-lg border p-2 text-left shadow-sm ${'${agendaCardTone(appt.status)}'}\`}>\n        <button type="button" onClick={() => onEdit(appt)} className="w-full text-left">\n          <div className="flex items-start justify-between gap-2 pr-5">\n            <div className="min-w-0">\n              <p className="text-[11px] font-black leading-tight">{fmtAppointmentInterval(appt)}</p>\n              <p className="mt-1 truncate text-xs font-bold text-text">{appt.pets?.pet_name || 'Pet'}</p>\n              <p className="truncate text-[11px] font-semibold text-text/90">Tutor: {appt.pets?.owner_name || 'Cliente'}</p>\n            </div>\n            <span className={\`badge ${'${sb.cls}'} shrink-0 text-[9px]\`}>{sb.label}</span>\n          </div>\n          <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted">\n            <span className="truncate">{serviceLabel(appt)}</span>\n            <span className="font-bold text-emerald-400">{fmtCurrency(appt.price)}</span>\n          </div>\n          <MotodogAgendaInfo appt={appt} compact/>\n          <p className={\`mt-1 truncate text-[10px] ${'${assigned ? "text-muted" : "text-amber-300"}'}\`}>\n            {assigned ? \`Resp.: ${'${assigned.name}'}\` : appt.responsible_staff_name ? \`Resp.: ${'${appt.responsible_staff_name}'}\` : 'Sem responsavel'}\n          </p>\n        </button>\n        {appt.status === 'concluido' && (\n          <button\n            type="button"\n            aria-label="Imprimir ficha do agendamento"\n            title="Imprimir ficha 80 mm"\n            onClick={() => onReceipt(appt)}\n            className="absolute right-1.5 top-1.5 rounded-md bg-black/20 p-1 text-emerald-300 hover:bg-black/35"\n          >\n            <Receipt size={11}/>\n          </button>\n        )}\n      </div>\n    )\n  }\n\n  return (\n    <div className="bg-card border border-[var(--border)] rounded-xl2 overflow-hidden">\n      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">\n        <div>\n          <p className="text-sm font-bold text-text">Agenda semanal</p>\n          <p className="text-xs text-muted">\n            {days[0]?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}\n            {' ate '}\n            {days[days.length - 1]?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}\n          </p>\n        </div>\n        <div className="flex items-center gap-2 text-xs text-muted">\n          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />\n          {slotCapacity} vagas por horario\n        </div>\n      </div>\n\n      <div className="overflow-x-auto">\n        <div className="min-w-[1160px]">\n          <div className="grid border-b border-[var(--border)] bg-surface/50" style={{ gridTemplateColumns: '76px repeat(7, minmax(250px, 1fr))' }}>\n            <div className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-muted">Hora</div>\n            {days.map((day) => {\n              const key = isoDate(day)\n              const isSelected = key === selectedKey\n              const dayCount = (appointments || []).filter((appt) => localDateKey(appt.scheduled_at) === key).length\n              return (\n                <button key={key} type="button" onClick={() => onSelectDate(day)} className={\`text-left px-3 py-3 border-l border-[var(--border)] transition-colors ${'${isSelected ? "bg-amber-500/14" : "hover:bg-white/5"}'}\`}>\n                  <p className={\`text-xs font-black uppercase tracking-widest ${'${isSelected ? "text-amber-300" : "text-muted"}'}\`}>{PT_WEEKDAYS[day.getDay()]}</p>\n                  <div className="mt-1 flex items-center justify-between gap-2">\n                    <span className="text-lg font-display font-black text-text">{String(day.getDate()).padStart(2, '0')}</span>\n                    <span className={\`rounded-full px-2 py-0.5 text-[10px] font-bold ${'${isSelected ? "bg-amber-500 text-gray-950" : "bg-white/8 text-muted"}'}\`}>{dayCount}</span>\n                  </div>\n                </button>\n              )\n            })}\n          </div>\n\n          {hours.map((hour) => (\n            <div key={hour} className="grid border-b border-[var(--border)] last:border-b-0" style={{ gridTemplateColumns: '76px repeat(7, minmax(250px, 1fr))' }}>\n              <div className="px-3 py-3 text-xs font-bold text-muted bg-surface/35">{String(hour).padStart(2, '0')}:00</div>\n              {days.map((day) => {\n                const dayKey = isoDate(day)\n                const slotItems = bySlot.get(\`${'${dayKey}'}-${'${hour}'}\`) || []\n                const occupying = slotItems.filter(appointmentOccupiesManualSlot)\n                const nonBlocking = slotItems.filter((item) => !appointmentOccupiesManualSlot(item))\n                const lanes = Array.from({ length: slotCapacity }, (_, index) => occupying[index] || null)\n                return (\n                  <div key={\`${'${dayKey}'}-${'${hour}'}\`} className="min-h-[118px] border-l border-[var(--border)] p-2 hover:bg-white/[0.03] transition-colors">\n                    <div className="grid grid-cols-2 gap-2">\n                      {lanes.map((appt, laneIndex) => appt ? appointmentCard(appt) : (\n                        <button\n                          key={\`available-${'${laneIndex}'}\`}\n                          type="button"\n                          onClick={() => onCreateAt(day, hour)}\n                          className="min-h-[92px] rounded-lg border border-dashed border-emerald-500/25 bg-emerald-500/[0.04] px-2 py-3 text-center text-[10px] font-bold text-emerald-300 hover:border-emerald-400/50 hover:bg-emerald-500/10"\n                        >\n                          <Plus size={14} className="mx-auto mb-1"/>\n                          Vaga {laneIndex + 1} disponivel\n                        </button>\n                      ))}\n                    </div>\n                    {occupying.length > slotCapacity && (\n                      <p className="mt-2 rounded-md bg-red-500/10 px-2 py-1 text-[10px] text-red-300">\n                        {occupying.length - slotCapacity} agendamento(s) acima da capacidade configurada.\n                      </p>\n                    )}\n                    {nonBlocking.length > 0 && (\n                      <div className="mt-2 space-y-1">\n                        {nonBlocking.map((appt) => (\n                          <button key={appt.id} type="button" onClick={() => onEdit(appt)} className="w-full rounded-md border border-red-500/15 bg-red-500/5 px-2 py-1 text-left text-[10px] text-muted line-through">\n                            {fmtAppointmentInterval(appt)} · {appt.pets?.pet_name || 'Pet'} · {statusBadge(appt.status).label}\n                          </button>\n                        ))}\n                      </div>\n                    )}\n                  </div>\n                )\n              })}\n            </div>\n          ))}\n        </div>\n      </div>\n    </div>\n  )\n}\n\nexport default function AgendaPage()`

await replaceRegex(
  agendaPath,
  /function AgendaTimelineView\(\{[\s\S]*?\n\}\n\nexport default function AgendaPage\(\)/,
  timelineBlock,
  'grade de duas vagas',
)

await replaceOnce(
  agendaPath,
  `  const openSlotModal = (day, hour) => {\n    setModal({\n      serviceGroup: activeAgendaTab,\n      date: isoDate(day),\n      time: \`${'${String(hour).padStart(2, "0")}'}:00\`,\n    })\n  }`,
  `  const openSlotModal = (day, hour) => {\n    setModal({\n      serviceGroup: activeAgendaTab,\n      date: isoDate(day),\n      time: \`${'${String(hour).padStart(2, "0")}'}:00\`,\n    })\n  }\n  const handleStatusChange = async (appointmentId, status) => {\n    const updated = await updateStatus(appointmentId, status)\n    if (status === 'concluido' && updated) setReceipt(updated)\n    return updated\n  }`,
  'concluir e imprimir',
)

await replaceOnce(
  agendaPath,
  `          onEdit={(appt) => setModal(appt)}\n          onCreateAt={openSlotModal}`,
  `          onEdit={(appt) => setModal(appt)}\n          onReceipt={setReceipt}\n          slotCapacity={MANUAL_SLOT_CAPACITY}\n          onCreateAt={openSlotModal}`,
  'props da agenda semanal',
)

await replaceOnce(
  agendaPath,
  `onClick={() => updateStatus(a.id, 'concluido')}`,
  `onClick={() => handleStatusChange(a.id, 'concluido')}`,
  'conclusao na lista',
)

await replaceOnce(
  agendaPath,
  `onEdit={(a) => setModal(a)} onStatus={updateStatus} onReceipt={setReceipt}`,
  `onEdit={(a) => setModal(a)} onStatus={handleStatusChange} onReceipt={setReceipt}`,
  'conclusao no kanban',
)

await replaceOnce(
  agendaPath,
  `          onUpdate={update}\n        />`,
  `          onUpdate={update}\n          onReceipt={setReceipt}\n        />`,
  'impressao pelo modal',
)

await replaceOnce(
  agendaPath,
  `          serviceLabel={serviceLabel}\n        />`,
  `          serviceLabel={serviceLabel}\n          staffById={staffById}\n        />`,
  'responsavel na ficha',
)

const packagePath = 'package.json'
const packageJson = JSON.parse(await read(packagePath))
packageJson.scripts['test:transactions'] = 'node --test test/transactionalStatic.test.mjs test/agendaOperationalInfrastructure.test.mjs'
await write(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)

const testContent = `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { readFile } from 'node:fs/promises'\n\nimport {\n  MANUAL_SLOT_CAPACITY,\n  appointmentOccupiesManualSlot,\n  appointmentTransportAddress,\n  appointmentTransportLabel,\n  operationalCommissionRate,\n} from '../src/modules/petshop/lib/appointmentOperational.js'\n\ntest('agenda manual expoe exatamente duas vagas operacionais', () => {\n  assert.equal(MANUAL_SLOT_CAPACITY, 2)\n  assert.equal(appointmentOccupiesManualSlot({ status: 'agendado' }), true)\n  assert.equal(appointmentOccupiesManualSlot({ status: 'concluido' }), true)\n  assert.equal(appointmentOccupiesManualSlot({ status: 'cancelado' }), false)\n})\n\ntest('transporte da ficha diferencia cliente e MotoDog', () => {\n  assert.equal(appointmentTransportLabel('cliente_leva'), 'Cliente traz e busca')\n  assert.match(appointmentTransportLabel('buscar_e_levar'), /MotoDog/)\n  assert.equal(appointmentTransportAddress({ motodog: { address: 'Rua A, 10', neighborhood: 'Centro', city: 'Muriae' } }), 'Rua A, 10 - Centro - Muriae')\n})\n\ntest('comissao operacional usa 10 por cento para tosa e 5 para outros esteticos', () => {\n  assert.equal(operationalCommissionRate({ code: 'tosa_tesoura', group_type: 'banho_tosa' }), 10)\n  assert.equal(operationalCommissionRate({ name: 'Banho Pet', group_type: 'banho_tosa' }), 5)\n  assert.equal(operationalCommissionRate({ name: 'Escovacao Dental', group_type: 'banho_tosa' }), 5)\n  assert.equal(operationalCommissionRate({ name: 'Consulta Veterinaria', group_type: 'veterinaria' }), 0)\n})\n\ntest('infraestrutura conecta capacidade, transporte e responsible_staff_key', async () => {\n  const [migration, agenda, appointments, advanced, commissions] = await Promise.all([\n    readFile(new URL('../supabase/migrations/20260727001000_agenda_capacity_operational_commissions.sql', import.meta.url), 'utf8'),\n    readFile(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8'),\n    readFile(new URL('../src/shared/hooks/useAppointments.js', import.meta.url), 'utf8'),\n    readFile(new URL('../src/modules/petshop/hooks/usePetshopAdvanced.js', import.meta.url), 'utf8'),\n    readFile(new URL('../src/modules/petshop/pages/EquipePage.jsx', import.meta.url), 'utf8'),\n  ])\n\n  assert.match(migration, /petbot_booking_capacity = 2/)\n  assert.match(migration, /responsible_staff_key/)\n  assert.match(migration, /calculate_petshop_operational_commissions/)\n  assert.match(migration, /revenue \* 0\\.10/)\n  assert.match(migration, /revenue \* 0\\.05/)\n  assert.match(agenda, /Vaga \{laneIndex \+ 1\} disponivel/)\n  assert.match(agenda, /FICHA DE ATENDIMENTO/)\n  assert.match(agenda, /Responsavel/)\n  assert.match(appointments, /transport_reference/)\n  assert.match(advanced, /calculate_petshop_operational_commissions/)\n  assert.match(advanced, /is\('responsible_staff_key', null\)/)\n  assert.match(commissions, /Tosa 10%/)\n  assert.match(commissions, /Outros 5%/)\n})\n`
await write('test/agendaOperationalInfrastructure.test.mjs', testContent)
await copyFile(
  'supabase/migrations/20260727001000_agenda_capacity_operational_commissions.sql',
  'database/agenda_capacity_operational_commissions.sql',
)

console.log('Agenda, transporte e comissoes operacionais aplicados.')
