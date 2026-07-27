import { readFile, writeFile } from 'node:fs/promises'

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

const helperPath = 'src/modules/petshop/lib/appointmentOperational.js'
await replaceOnce(
  helperPath,
  "const NON_BLOCKING_STATUSES = new Set(['cancelado', 'cancelled', 'no_show'])",
  "const NON_BLOCKING_STATUSES = new Set(['cancelado', 'cancelled', 'no_show', 'concluido', 'completed', 'finalizado'])",
  'status concluido nao ocupa vaga',
)

const agendaPath = 'src/modules/petshop/pages/AgendaPage.jsx'
await replaceOnce(
  agendaPath,
  `                    {nonBlocking.length > 0 && (\n                      <div className="mt-2 space-y-1">\n                        {nonBlocking.map((appt) => (\n                          <button key={appt.id} type="button" onClick={() => onEdit(appt)} className="w-full rounded-md border border-red-500/15 bg-red-500/5 px-2 py-1 text-left text-[10px] text-muted line-through">\n                            {fmtAppointmentInterval(appt)} · {appt.pets?.pet_name || 'Pet'} · {statusBadge(appt.status).label}\n                          </button>\n                        ))}\n                      </div>\n                    )}`,
  `                    {nonBlocking.length > 0 && (\n                      <div className="mt-2 space-y-1">\n                        {nonBlocking.map((appt) => {\n                          const completed = ['concluido', 'completed', 'finalizado'].includes(normalizeServiceType(appt.status))\n                          return (\n                            <div\n                              key={appt.id}\n                              className={\`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] ${'${completed ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-200" : "border-red-500/15 bg-red-500/5 text-muted"}'}\`}\n                            >\n                              <button\n                                type="button"\n                                onClick={() => onEdit(appt)}\n                                className={\`min-w-0 flex-1 text-left ${'${completed ? "" : "line-through"}'}\`}\n                              >\n                                {fmtAppointmentInterval(appt)} · {appt.pets?.pet_name || 'Pet'} · {statusBadge(appt.status).label}\n                              </button>\n                              {completed && (\n                                <button\n                                  type="button"\n                                  aria-label="Imprimir ficha concluida"\n                                  title="Imprimir ficha 80 mm"\n                                  onClick={() => onReceipt(appt)}\n                                  className="shrink-0 rounded p-1 text-emerald-300 hover:bg-emerald-500/15"\n                                >\n                                  <Receipt size={11}/>\n                                </button>\n                              )}\n                            </div>\n                          )\n                        })}\n                      </div>\n                    )}`,
  'historico concluido da grade',
)

const appointmentsPath = 'src/shared/hooks/useAppointments.js'
await replaceOnce(
  appointmentsPath,
  `const APPOINTMENT_OPERATIONAL_FIELDS = [\n  'responsible_staff_key',\n  'responsible_staff_name',\n  'transport_mode',\n  'transport_label',\n  'transport_address',\n  'transport_neighborhood',\n  'transport_city',\n  'transport_reference',\n]\n\nfunction hasAppointmentOperationalFields(payload = {}) {\n  return APPOINTMENT_OPERATIONAL_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(payload, field))\n}\n\nfunction appointmentOperationalPatch(payload = {}) {\n  return Object.fromEntries(APPOINTMENT_OPERATIONAL_FIELDS.map((field) => [field, payload[field] || null]))\n}\n\n`,
  '',
  'helpers de update separado',
)

await replaceOnce(
  appointmentsPath,
  `    if (hasAppointmentOperationalFields(payload)) {\n      const assignment = await runWithTenantFallback(activeTenantId, async (includeTenant) => {\n        let query = supabase\n          .from('appointments')\n          .update(appointmentOperationalPatch(payload))\n          .eq('id', response.data?.appointment_id)\n          .eq('module_id', activeModuleId)\n        query = applyTenantFilter(query, activeTenantId, includeTenant)\n        return query\n      })\n      if (assignment.error) throw assignment.error\n    }\n\n`,
  '',
  'update separado apos criar',
)

await replaceOnce(
  appointmentsPath,
  `    const apiPayload = normalizeAppointmentPayload(payload)\n    const operationalAssignment = appointmentOperationalPatch(apiPayload)\n    const hasOperationalAssignment = hasAppointmentOperationalFields(apiPayload)\n    APPOINTMENT_OPERATIONAL_FIELDS.forEach((field) => delete apiPayload[field])`,
  `    const apiPayload = normalizeAppointmentPayload(payload)`,
  'remocao de campos antes da transacao',
)

await replaceOnce(
  appointmentsPath,
  `\n    if (hasOperationalAssignment) {\n      const assignment = await runWithTenantFallback(activeTenantId, async (includeTenant) => {\n        let query = supabase\n          .from('appointments')\n          .update(operationalAssignment)\n          .eq('id', id)\n          .eq('module_id', activeModuleId)\n        query = applyTenantFilter(query, activeTenantId, includeTenant)\n        return query\n      })\n      if (assignment.error) throw assignment.error\n    }\n`,
  '',
  'update separado apos editar',
)

const migrationPath = 'supabase/migrations/20260727001000_agenda_capacity_operational_commissions.sql'
const rpcDefinitions = `for each row execute function public.prevent_appointment_overlap();\n\n-- Persist responsible staff and transport in the same transaction that creates\n-- or edits the appointment. This prevents a valid reservation from being left\n-- behind if the operational assignment is rejected.\ncreate or replace function public.book_petshop_appointment_transaction(p_payload jsonb)\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = public\nas $$\ndeclare\n  v_tenant_id uuid := nullif(p_payload->>'tenant_id', '')::uuid;\n  v_module_id text := coalesce(nullif(trim(p_payload->>'module_id'), ''), 'petshop');\n  v_client_id uuid := coalesce(nullif(p_payload->>'client_id', '')::uuid, nullif(p_payload->>'pet_id', '')::uuid);\n  v_idempotency_key text := nullif(trim(p_payload->>'idempotency_key'), '');\n  v_resolved jsonb;\n  v_appointment_id uuid;\n  v_source text := coalesce(nullif(trim(p_payload->>'source'), ''), 'manual');\nbegin\n  if v_tenant_id is null or not public.has_tenant_access(v_tenant_id) then raise exception 'Tenant invalido ou sem permissao.'; end if;\n  if v_client_id is null then raise exception 'Cliente obrigatorio.'; end if;\n  if v_idempotency_key is null then raise exception 'Chave de idempotencia obrigatoria.'; end if;\n  if nullif(p_payload->>'scheduled_at', '') is null then raise exception 'Data e horario obrigatorios.'; end if;\n\n  select id into v_appointment_id\n  from public.appointments\n  where tenant_id = v_tenant_id and idempotency_key = v_idempotency_key\n  limit 1;\n  if found then return jsonb_build_object('appointment_id', v_appointment_id, 'duplicated', true); end if;\n\n  if not exists (\n    select 1 from public.clients\n    where id = v_client_id and tenant_id = v_tenant_id and module_id = v_module_id and active = true\n  ) then raise exception 'Cliente nao pertence ao tenant ativo.'; end if;\n\n  v_resolved := public.resolve_petshop_appointment_services(\n    v_tenant_id,\n    v_module_id,\n    v_client_id,\n    coalesce(p_payload->'services', '[]'::jsonb),\n    p_payload->>'service_type'\n  );\n\n  insert into public.appointments (\n    tenant_id, module_id, client_id, pet_id, service_type, service_group, service_items,\n    scheduled_at, duration_min, price, status, notes, source, employee_id, groomer_id,\n    responsible_staff_key, responsible_staff_name,\n    transport_mode, transport_label, transport_address, transport_neighborhood,\n    transport_city, transport_reference,\n    subscription_id, subscription_benefit_used, idempotency_key\n  ) values (\n    v_tenant_id, v_module_id, v_client_id, coalesce(nullif(p_payload->>'pet_id', '')::uuid, v_client_id),\n    v_resolved->>'service_type', v_resolved->>'service_group', v_resolved->'items',\n    (p_payload->>'scheduled_at')::timestamptz,\n    (v_resolved->>'duration_min')::integer,\n    (v_resolved->>'price')::numeric,\n    coalesce(nullif(trim(p_payload->>'status'), ''), 'agendado'),\n    concat_ws(' | ', nullif(trim(p_payload->>'notes'), ''), case when (v_resolved->>'benefit_used')::boolean then 'Beneficio de plano aplicado' end),\n    v_source,\n    nullif(p_payload->>'employee_id', '')::uuid,\n    nullif(p_payload->>'groomer_id', '')::uuid,\n    nullif(trim(p_payload->>'responsible_staff_key'), ''),\n    nullif(trim(p_payload->>'responsible_staff_name'), ''),\n    nullif(trim(p_payload->>'transport_mode'), ''),\n    nullif(trim(p_payload->>'transport_label'), ''),\n    nullif(trim(p_payload->>'transport_address'), ''),\n    nullif(trim(p_payload->>'transport_neighborhood'), ''),\n    nullif(trim(p_payload->>'transport_city'), ''),\n    nullif(trim(p_payload->>'transport_reference'), ''),\n    nullif(v_resolved->>'subscription_id', '')::uuid,\n    coalesce((v_resolved->>'benefit_used')::boolean, false),\n    v_idempotency_key\n  ) returning id into v_appointment_id;\n\n  return jsonb_build_object(\n    'appointment_id', v_appointment_id,\n    'price', (v_resolved->>'price')::numeric,\n    'duration_min', (v_resolved->>'duration_min')::integer,\n    'service_items', v_resolved->'items',\n    'duplicated', false\n  );\nend;\n$$;\n\ncreate or replace function public.update_petshop_appointment_transaction(\n  p_appointment_id uuid,\n  p_payload jsonb\n)\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = public\nas $$\ndeclare\n  v_current public.appointments%rowtype;\n  v_tenant_id uuid := nullif(p_payload->>'tenant_id', '')::uuid;\n  v_module_id text := coalesce(nullif(trim(p_payload->>'module_id'), ''), 'petshop');\n  v_client_id uuid;\n  v_resolved jsonb;\n  v_recalculate boolean;\nbegin\n  select * into v_current\n  from public.appointments\n  where id = p_appointment_id\n  for update;\n\n  if not found then raise exception 'Agendamento nao encontrado.'; end if;\n  if v_tenant_id is null then v_tenant_id := v_current.tenant_id; end if;\n  if v_current.tenant_id <> v_tenant_id or v_current.module_id <> v_module_id or not public.has_tenant_access(v_tenant_id) then\n    raise exception 'Agendamento nao pertence ao tenant ativo.';\n  end if;\n\n  v_client_id := coalesce(nullif(p_payload->>'client_id', '')::uuid, nullif(p_payload->>'pet_id', '')::uuid, v_current.client_id);\n  if not exists (\n    select 1 from public.clients\n    where id = v_client_id and tenant_id = v_tenant_id and module_id = v_module_id and active = true\n  ) then raise exception 'Cliente nao pertence ao tenant ativo.'; end if;\n\n  v_recalculate := p_payload ? 'services'\n    or nullif(p_payload->>'service_type', '') is not null\n    or v_client_id is distinct from v_current.client_id;\n\n  if v_recalculate then\n    perform public.restore_petshop_appointment_benefits(p_appointment_id);\n    v_resolved := public.resolve_petshop_appointment_services(\n      v_tenant_id,\n      v_module_id,\n      v_client_id,\n      case when p_payload ? 'services' then coalesce(p_payload->'services', '[]'::jsonb) else coalesce(v_current.service_items, '[]'::jsonb) end,\n      coalesce(nullif(p_payload->>'service_type', ''), v_current.service_type)\n    );\n  else\n    v_resolved := jsonb_build_object(\n      'service_type', v_current.service_type,\n      'service_group', v_current.service_group,\n      'items', coalesce(v_current.service_items, '[]'::jsonb),\n      'price', v_current.price,\n      'duration_min', v_current.duration_min,\n      'subscription_id', v_current.subscription_id,\n      'benefit_used', v_current.subscription_benefit_used\n    );\n  end if;\n\n  update public.appointments\n  set client_id = v_client_id,\n      pet_id = coalesce(nullif(p_payload->>'pet_id', '')::uuid, v_current.pet_id, v_client_id),\n      service_type = v_resolved->>'service_type',\n      service_group = v_resolved->>'service_group',\n      service_items = v_resolved->'items',\n      scheduled_at = coalesce(nullif(p_payload->>'scheduled_at', '')::timestamptz, v_current.scheduled_at),\n      duration_min = (v_resolved->>'duration_min')::integer,\n      price = (v_resolved->>'price')::numeric,\n      status = coalesce(nullif(trim(p_payload->>'status'), ''), v_current.status),\n      notes = case when p_payload ? 'notes' then nullif(trim(p_payload->>'notes'), '') else v_current.notes end,\n      source = coalesce(nullif(trim(p_payload->>'source'), ''), v_current.source, 'manual'),\n      employee_id = case when p_payload ? 'employee_id' then nullif(p_payload->>'employee_id', '')::uuid else v_current.employee_id end,\n      groomer_id = case when p_payload ? 'groomer_id' then nullif(p_payload->>'groomer_id', '')::uuid else v_current.groomer_id end,\n      responsible_staff_key = case when p_payload ? 'responsible_staff_key' then nullif(trim(p_payload->>'responsible_staff_key'), '') else v_current.responsible_staff_key end,\n      responsible_staff_name = case when p_payload ? 'responsible_staff_name' then nullif(trim(p_payload->>'responsible_staff_name'), '') else v_current.responsible_staff_name end,\n      transport_mode = case when p_payload ? 'transport_mode' then nullif(trim(p_payload->>'transport_mode'), '') else v_current.transport_mode end,\n      transport_label = case when p_payload ? 'transport_label' then nullif(trim(p_payload->>'transport_label'), '') else v_current.transport_label end,\n      transport_address = case when p_payload ? 'transport_address' then nullif(trim(p_payload->>'transport_address'), '') else v_current.transport_address end,\n      transport_neighborhood = case when p_payload ? 'transport_neighborhood' then nullif(trim(p_payload->>'transport_neighborhood'), '') else v_current.transport_neighborhood end,\n      transport_city = case when p_payload ? 'transport_city' then nullif(trim(p_payload->>'transport_city'), '') else v_current.transport_city end,\n      transport_reference = case when p_payload ? 'transport_reference' then nullif(trim(p_payload->>'transport_reference'), '') else v_current.transport_reference end,\n      subscription_id = nullif(v_resolved->>'subscription_id', '')::uuid,\n      subscription_benefit_used = coalesce((v_resolved->>'benefit_used')::boolean, false),\n      updated_at = now()\n  where id = p_appointment_id and tenant_id = v_tenant_id;\n\n  return jsonb_build_object(\n    'appointment_id', p_appointment_id,\n    'price', (v_resolved->>'price')::numeric,\n    'duration_min', (v_resolved->>'duration_min')::integer,\n    'service_items', v_resolved->'items'\n  );\nend;\n$$;\n\nrevoke all on function public.book_petshop_appointment_transaction(jsonb) from public;\nrevoke all on function public.update_petshop_appointment_transaction(uuid, jsonb) from public;\ngrant execute on function public.book_petshop_appointment_transaction(jsonb) to authenticated, service_role;\ngrant execute on function public.update_petshop_appointment_transaction(uuid, jsonb) to authenticated, service_role;`

await replaceOnce(
  migrationPath,
  `for each row execute function public.prevent_appointment_overlap();`,
  rpcDefinitions,
  'RPC atomica de agendamento',
)

const databasePath = 'database/agenda_capacity_operational_commissions.sql'
await write(databasePath, await read(migrationPath))

const testPath = 'test/agendaOperationalInfrastructure.test.mjs'
await replaceOnce(
  testPath,
  `  assert.equal(appointmentOccupiesManualSlot({ status: 'concluido' }), true)`,
  `  assert.equal(appointmentOccupiesManualSlot({ status: 'concluido' }), false)`,
  'concluido libera vaga',
)
await replaceOnce(
  testPath,
  `  assert.ok(migration.includes('calculate_petshop_operational_commissions'))`,
  `  assert.ok(migration.includes('calculate_petshop_operational_commissions'))\n  assert.ok(migration.includes('book_petshop_appointment_transaction'))\n  assert.ok(migration.includes('responsible_staff_key, responsible_staff_name'))\n  assert.ok(migration.includes('transport_mode, transport_label, transport_address'))`,
  'contrato transacional atomico',
)

console.log('Infraestrutura final da agenda aplicada.')
