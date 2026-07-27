from pathlib import Path
import re


def replace_once(path, old, new, label):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


agenda = 'src/modules/petshop/pages/AgendaPage.jsx'
appointments = 'src/shared/hooks/useAppointments.js'
operations = 'shared/petshopOperations.js'
settings = 'src/shared/pages/SettingsPage.jsx'
test_ops = 'test/petshopOperations.test.mjs'
test_static = 'test/agendaOperationalInfrastructure.test.mjs'

# Presets operacionais solicitados.
replace_once(
    operations,
    "    machine_grooming_min: 90,\n    scissor_grooming_min: 120,\n",
    "    machine_grooming_min: 60,\n    scissor_grooming_min: 90,\n",
    'small duration presets',
)
replace_once(
    operations,
    "    max_weight_kg: 21.99,\n    bath_min: 60,\n    machine_grooming_min: 120,\n    scissor_grooming_min: 150,\n",
    "    max_weight_kg: 999.99,\n    bath_min: 60,\n    machine_grooming_min: 90,\n    scissor_grooming_min: 120,\n",
    'medium plus duration presets',
)

# Endereco completo do cadastro para MotoDog.
replace_once(
    agenda,
    "const motodogAddressText = (appt) => appointmentTransportAddress(appt)\n\nfunction MotodogAgendaInfo({ appt, compact = false }) {\n",
    """const motodogAddressText = (appt) => appointmentTransportAddress(appt)\n\nconst motodogDefaultsFromClient = (client = {}) => {\n  const appendUnique = (base, value, separator = ', ') => {\n    const cleanValue = String(value || '').trim()\n    if (!cleanValue) return base\n    if (safeLower(base).includes(safeLower(cleanValue))) return base\n    return base ? `${base}${separator}${cleanValue}` : cleanValue\n  }\n\n  let address = String(client.owner_address || '').trim()\n  address = appendUnique(address, client.address_number)\n  address = appendUnique(address, client.address_complement, ' - ')\n  if (client.zip_code && !safeLower(address).includes(safeLower(client.zip_code))) {\n    address = appendUnique(address, `CEP ${client.zip_code}`, ' - ')\n  }\n\n  return {\n    transport_address: address,\n    transport_neighborhood: String(client.owner_neighborhood || '').trim(),\n    transport_city: String(client.owner_city || '').trim(),\n    transport_reference: String(client.address_reference || '').trim(),\n  }\n}\n\nconst fillMotodogFromClient = (current, client, { overwrite = false } = {}) => {\n  const defaults = motodogDefaultsFromClient(client)\n  return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [\n    key,\n    overwrite ? value : (current[key] || value),\n  ]))\n}\n\nfunction MotodogAgendaInfo({ appt, compact = false }) {\n""",
    'motodog client defaults helper',
)
replace_once(
    agenda,
    "  const motodog = isMotodogTransportMode(appt.motodog.mode)\n",
    "  const motodog = isMotodogTransportMode(appt.motodog.mode)\n  const contactPhone = appt?.pets?.phone || ''\n  const contactEmail = appt?.pets?.email || ''\n",
    'motodog contact variables',
)
replace_once(
    agenda,
    """      {motodog && appt.motodog.reference && (\n        <p className=\"mt-1 text-muted\">Referencia: {appt.motodog.reference}</p>\n      )}\n    </div>\n""",
    """      {motodog && appt.motodog.reference && (\n        <p className=\"mt-1 text-muted\">Referencia: {appt.motodog.reference}</p>\n      )}\n      {motodog && contactPhone && <p className=\"mt-1 text-muted\">Contato: {contactPhone}</p>}\n      {motodog && contactEmail && <p className=\"mt-1 text-muted\">E-mail: {contactEmail}</p>}\n    </div>\n""",
    'motodog card contact details',
)

# Duracao editavel por agendamento, usando o preset enquanto nao houver override.
replace_once(
    agenda,
    "  const [servicePickerOpen, setServicePickerOpen] = useState(false)\n",
    "  const [servicePickerOpen, setServicePickerOpen] = useState(false)\n  const [durationOverride, setDurationOverride] = useState(() => isEdit && appt?.duration_min ? String(appt.duration_min) : '')\n",
    'duration override state',
)
replace_once(
    agenda,
    "  }, [form.service_codes, serviceOptions, serviceGroup, serviceDurations, selectedClient?.weight_kg, appt?.pets?.weight_kg])\n  const availableServiceOptions = useMemo(() => {\n",
    "  }, [form.service_codes, serviceOptions, serviceGroup, serviceDurations, selectedClient?.weight_kg, appt?.pets?.weight_kg])\n  const effectiveDuration = Math.max(10, Number(durationOverride || serviceTotals.duration || 0))\n  const availableServiceOptions = useMemo(() => {\n",
    'effective editable duration',
)
replace_once(
    agenda,
    """  const selectClient = (pet) => {\n    setForm((current) => ({\n      ...current,\n      pet_id: pet.id,\n      pet_search: '',\n      ...(isMotodogTransportMode(current.transport_mode) ? {\n        transport_address: current.transport_address || pet.owner_address || '',\n        transport_neighborhood: current.transport_neighborhood || pet.owner_neighborhood || '',\n        transport_city: current.transport_city || pet.owner_city || '',\n      } : {}),\n    }))\n""",
    """  const selectClient = (pet) => {\n    setForm((current) => ({\n      ...current,\n      pet_id: pet.id,\n      pet_search: '',\n      ...(isMotodogTransportMode(current.transport_mode)\n        ? fillMotodogFromClient(current, pet, { overwrite: true })\n        : {}),\n    }))\n""",
    'motodog fill when selecting client',
)
replace_once(
    agenda,
    "    const candidateEnd = new Date(candidateStart.getTime() + Math.max(15, Number(serviceTotals.duration || 60)) * 60 * 1000)\n",
    "    const candidateEnd = new Date(candidateStart.getTime() + effectiveDuration * 60 * 1000)\n",
    'candidate uses editable duration',
)
replace_once(
    agenda,
    "        duration_min: serviceTotals.duration,\n",
    "        duration_min: effectiveDuration,\n",
    'payload uses editable duration',
)
replace_once(
    agenda,
    """              <div className=\"rounded-xl border border-[var(--border)] bg-white/5 px-4 py-3\">\n                <span className=\"block text-[11px] font-bold uppercase tracking-wider text-muted\">Tempo total</span>\n                <strong className=\"mt-1 block text-lg text-text\">{serviceTotals.duration || 0} min</strong>\n              </div>\n""",
    """              <div className=\"rounded-xl border border-[var(--border)] bg-white/5 px-4 py-3\">\n                <label className=\"block text-[11px] font-bold uppercase tracking-wider text-muted\">Duracao total (min)</label>\n                <input\n                  aria-label=\"Duracao total do agendamento\"\n                  className=\"inp mt-2\"\n                  type=\"number\"\n                  min=\"10\"\n                  step=\"10\"\n                  value={durationOverride || serviceTotals.duration || ''}\n                  onChange={(event) => setDurationOverride(event.target.value)}\n                />\n                <p className=\"mt-1 text-[10px] text-muted\">Pre-setada pelo porte e tipo de servico. Pode ser alterada para este agendamento.</p>\n              </div>\n""",
    'editable duration field',
)
replace_once(
    agenda,
    "                  onChange={(event) => set('transport_mode', event.target.value)}\n",
    """                  onChange={(event) => {\n                    const mode = event.target.value\n                    setForm((current) => ({\n                      ...current,\n                      transport_mode: mode,\n                      ...(isMotodogTransportMode(mode) && selectedPet\n                        ? fillMotodogFromClient(current, selectedPet)\n                        : {}),\n                    }))\n                  }}\n""",
    'motodog fill when selecting transport mode',
)

# Mantem detalhes estruturados do cliente disponiveis ao editar um agendamento.
replace_once(
    appointments,
    """      owner_city: normalized.clients.city,\n      pet_name: normalized.clients.details?.pet_name || '',\n""",
    """      owner_city: normalized.clients.city,\n      zip_code: normalized.clients.details?.zip_code || '',\n      address_number: normalized.clients.details?.address_number || '',\n      address_complement: normalized.clients.details?.address_complement || '',\n      address_reference: normalized.clients.details?.address_reference || '',\n      pet_name: normalized.clients.details?.pet_name || '',\n""",
    'appointment client address details',
)

# Rotulos e edicao dos presets nas configuracoes.
replace_once(
    settings,
    "<p className=\"text-sm font-bold text-text\">{rangeKey === 'small' ? 'Pet até 9,99 kg' : 'Pet de 10 a 21,99 kg'}</p>",
    "<p className=\"text-sm font-bold text-text\">{rangeKey === 'small' ? 'Porte pequeno (até 10 kg)' : 'Porte médio ou grande (10 kg ou mais)'}</p>",
    'duration range labels',
)
replace_once(
    settings,
    "<div key={field}><label className=\"inp-label\">{label} (min)</label><input className=\"inp\" type=\"number\" min=\"15\" step=\"5\" disabled={!canEdit} value={row[field]} onChange={(event) => setForm((prev) => { const next = normalizeServiceDurations(prev.petshop_service_durations); next[rangeKey] = { ...next[rangeKey], [field]: Math.max(15, Number(event.target.value || 15)) }; return { ...prev, petshop_service_durations: next } })} /></div>",
    "<div key={field}><label className=\"inp-label\">{label} (min)</label><input className=\"inp\" type=\"number\" min=\"10\" step=\"10\" disabled={!canEdit} value={row[field]} onChange={(event) => setForm((prev) => { const next = normalizeServiceDurations(prev.petshop_service_durations); next[rangeKey] = { ...next[rangeKey], [field]: Math.max(10, Number(event.target.value || 10)) }; return { ...prev, petshop_service_durations: next } })} /></div>",
    'editable duration increments',
)

migration = Path('supabase/migrations/20260727005000_petshop_service_duration_presets.sql')
migration.write_text("""begin;\n\nalter table public.settings\n  alter column petshop_service_durations set default\n  '{\"small\":{\"min_weight_kg\":0,\"max_weight_kg\":9.99,\"bath_min\":40,\"machine_grooming_min\":60,\"scissor_grooming_min\":90},\"medium\":{\"min_weight_kg\":10,\"max_weight_kg\":999.99,\"bath_min\":60,\"machine_grooming_min\":90,\"scissor_grooming_min\":120}}'::jsonb;\n\nupdate public.settings\nset petshop_service_durations =\n  case\n    when petshop_service_durations is null or jsonb_typeof(petshop_service_durations) <> 'object' then\n      '{\"small\":{\"min_weight_kg\":0,\"max_weight_kg\":9.99,\"bath_min\":40,\"machine_grooming_min\":60,\"scissor_grooming_min\":90},\"medium\":{\"min_weight_kg\":10,\"max_weight_kg\":999.99,\"bath_min\":60,\"machine_grooming_min\":90,\"scissor_grooming_min\":120}}'::jsonb\n    else\n      jsonb_set(\n        jsonb_set(\n          jsonb_set(\n            jsonb_set(\n              jsonb_set(petshop_service_durations, '{small,machine_grooming_min}',\n                to_jsonb(case when coalesce((petshop_service_durations #>> '{small,machine_grooming_min}')::integer, 90) = 90 then 60 else (petshop_service_durations #>> '{small,machine_grooming_min}')::integer end), true),\n              '{small,scissor_grooming_min}',\n              to_jsonb(case when coalesce((petshop_service_durations #>> '{small,scissor_grooming_min}')::integer, 120) = 120 then 90 else (petshop_service_durations #>> '{small,scissor_grooming_min}')::integer end), true),\n            '{medium,max_weight_kg}', to_jsonb(999.99), true),\n          '{medium,machine_grooming_min}',\n          to_jsonb(case when coalesce((petshop_service_durations #>> '{medium,machine_grooming_min}')::integer, 120) = 120 then 90 else (petshop_service_durations #>> '{medium,machine_grooming_min}')::integer end), true),\n        '{medium,scissor_grooming_min}',\n        to_jsonb(case when coalesce((petshop_service_durations #>> '{medium,scissor_grooming_min}')::integer, 150) = 150 then 120 else (petshop_service_durations #>> '{medium,scissor_grooming_min}')::integer end), true)\n  end,\n  updated_at = now()\nwhere module_id = 'petshop';\n\ncomment on column public.settings.petshop_service_durations is\n  'Presets editaveis: pequeno 40/60/90 min; medio ou grande 60/90/120 min.';\n\ncommit;\n""", encoding='utf-8')

# Testes dos novos presets e das conexoes de UI.
replace_once(
    test_ops,
    """    ['tosa maquina total', 8, 90],\n    ['tosa tesoura', 8, 120],\n    ['banho', 10, 60],\n    ['tosa maquina total', 10, 120],\n    ['tosa tesoura', 10, 150],\n""",
    """    ['tosa maquina total', 8, 60],\n    ['tosa tesoura', 8, 90],\n    ['banho', 10, 60],\n    ['tosa maquina total', 10, 90],\n    ['tosa tesoura', 10, 120],\n    ['banho', 35, 60],\n    ['tosa maquina total', 35, 90],\n    ['tosa tesoura', 35, 120],\n""",
    'duration tests',
)

static_text = Path(test_static).read_text(encoding='utf-8')
needle = "  assert.match(agenda, /Duracao total do agendamento/)\n"
if needle not in static_text:
    insert_after = "  assert.match(agenda, /dailyTimelineSlots/)\n"
    if insert_after not in static_text:
        raise SystemExit('static test insertion point not found')
    static_text = static_text.replace(insert_after, insert_after + "  assert.match(agenda, /motodogDefaultsFromClient/)\n  assert.match(agenda, /fillMotodogFromClient/)\n  assert.match(agenda, /Duracao total do agendamento/)\n  assert.match(agenda, /effectiveDuration/)\n", 1)
Path(test_static).write_text(static_text, encoding='utf-8')
