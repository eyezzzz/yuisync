import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

function read(path) {
  return readFileSync(path, 'utf8')
}

function write(path, value) {
  writeFileSync(path, value)
}

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before)
  assert.notEqual(index, -1, `Trecho não encontrado: ${label}`)
  assert.equal(source.indexOf(before, index + before.length), -1, `Trecho duplicado: ${label}`)
  return `${source.slice(0, index)}${after}${source.slice(index + before.length)}`
}

function replaceRegexOnce(source, pattern, replacement, label) {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))]
  assert.equal(matches.length, 1, `Esperava 1 ocorrência para ${label}, encontrei ${matches.length}`)
  return source.replace(pattern, replacement)
}

// Clientes & Pets: histórico renderizado nativamente e observações realmente ligadas ao pet.
{
  const path = 'src/modules/petshop/pages/PetsPage.jsx'
  let source = read(path)

  source = replaceOnce(
    source,
    "import { AlertCircle, Calendar as CalendarIcon, Cat, Dog, Fish, Grid, List as ListIcon, PawPrint, Phone, Plus, RefreshCw, Search, Trash2, Upload, Weight, X } from 'lucide-react'",
    "import { AlertCircle, Calendar as CalendarIcon, Cat, Dog, Fish, Grid, History, List as ListIcon, PawPrint, Phone, Plus, RefreshCw, Search, Trash2, Upload, Weight, X } from 'lucide-react'",
    'importar ícone de histórico',
  )

  source = replaceOnce(
    source,
    "  owner_name: '', owner_cpf: '', phone: '', email: '', owner_address: '', owner_neighborhood: '', owner_city: '',\n",
    "  owner_name: '', owner_cpf: '', phone: '', email: '', owner_address: '', owner_neighborhood: '', owner_city: '',\n  client_notes: '',\n",
    'preservar observações gerais do cliente',
  )

  source = replaceOnce(
    source,
    "          owner_name: form.owner_name.trim(), owner_cpf: formatCpf(form.owner_cpf), phone: formatPhone(form.phone), email: form.email.trim(),\n          owner_address:",
    "          owner_name: form.owner_name.trim(), owner_cpf: formatCpf(form.owner_cpf), phone: formatPhone(form.phone), email: form.email.trim(),\n          client_notes: form.client_notes || '',\n          owner_address:",
    'enviar client_notes sem misturar com observações do pet',
  )

  source = replaceOnce(
    source,
    "      email: pet.email || '',\n      owner_address:",
    "      email: pet.email || '',\n      client_notes: pet.client_notes || '',\n      owner_address:",
    'preservar client_notes ao adicionar outro pet',
  )

  source = replaceOnce(
    source,
    '<div className="md:col-span-2"><label className="inp-label">Observacoes</label><textarea',
    '<div className="md:col-span-2"><label className="inp-label">Observacoes do pet</label><textarea',
    'rotular observações como pertencentes ao pet',
  )

  source = replaceOnce(
    source,
    '<div className="mt-4 flex flex-wrap items-center justify-end gap-2"><button type="button" data-yuisync-add-pet-action',
    '<div className="mt-4 flex flex-wrap items-center justify-end gap-2"><button type="button" data-yuisync-client-history={group.key} className="btn btn-secondary btn-sm"><History size={13}/> Histórico</button><button type="button" data-yuisync-add-pet-action',
    'botão Histórico nativo na grade',
  )

  source = replaceOnce(
    source,
    '<div className="flex justify-end gap-2"><button type="button" data-yuisync-add-pet-action',
    '<div className="flex justify-end gap-2"><button type="button" data-yuisync-client-history={group.key} className="btn btn-secondary btn-sm"><History size={13}/> Histórico</button><button type="button" data-yuisync-add-pet-action',
    'botão Histórico nativo na lista',
  )

  source = replaceOnce(
    source,
    'function PetDrawer({ pet, tutorPets = [], subscriptions = [], onClose, onEdit, onAddPet, onSelectPet, speciesIcon, serviceLabel, statusBadge }) {',
    'function PetDrawer({ pet, tutorPets = [], subscriptions = [], historyGroupKey, onClose, onEdit, onAddPet, onSelectPet, speciesIcon, serviceLabel, statusBadge }) {',
    'prop nativa de histórico no drawer',
  )

  source = replaceOnce(
    source,
    '<div className="flex items-center gap-2"><button type="button" data-yuisync-add-pet-action aria-label={`Adicionar outro pet para ${pet.owner_name || \'este tutor\'}`}',
    '<div className="flex items-center gap-2">{historyGroupKey && <button type="button" data-yuisync-client-history={historyGroupKey} className="btn btn-secondary btn-sm"><History size={13}/> Histórico</button>}<button type="button" data-yuisync-add-pet-action aria-label={`Adicionar outro pet para ${pet.owner_name || \'este tutor\'}`}',
    'botão Histórico nativo no drawer',
  )

  source = replaceOnce(
    source,
    '  const totalPages = Math.max(1, Math.ceil(filteredTutorGroups.length / CLIENTS_PAGE_SIZE))',
    "  const tutorGroupKeyByPetId = useMemo(() => {\n    const map = new Map()\n    groupPetsByTutor(pets || []).forEach((group) => group.pets.forEach((item) => map.set(item.id, group.key)))\n    return map\n  }, [pets])\n  const totalPages = Math.max(1, Math.ceil(filteredTutorGroups.length / CLIENTS_PAGE_SIZE))",
    'mapear chave nativa de histórico por pet',
  )

  source = replaceOnce(
    source,
    '{drawerPet && <PetDrawer pet={drawerPet}',
    '{drawerPet && <PetDrawer pet={drawerPet} historyGroupKey={tutorGroupKeyByPetId.get(drawerPet.id) || \'\'}',
    'passar chave de histórico ao drawer',
  )

  write(path, source)
}

// Configuração: remover o remendo que criava botão invisível e manipulava o DOM.
{
  const path = 'src/config/modules.jsx'
  let source = read(path)
  source = replaceOnce(source, "import { ClientHistoryButtonVisibilityFix } from '../modules/petshop/components/ClientHistoryButtonVisibilityFix'\n", '', 'remover import do proxy')
  source = replaceOnce(source, '      <ClientHistoryButtonVisibilityFix />\n', '', 'remover montagem do proxy')
  write(path, source)
}

// Histórico: consumir os botões React nativos, guardar instruções do atendimento e eliminar MutationObserver.
{
  const path = 'src/modules/petshop/components/ClientHistoryGroomingEnhancer.jsx'
  let source = read(path)

  source = replaceOnce(
    source,
    "import { CalendarClock, History, PawPrint, Scissors, ShoppingBag, Truck, X } from 'lucide-react'",
    "import { CalendarClock, PawPrint, Scissors, ShoppingBag, Truck, X } from 'lucide-react'",
    'remover ícone usado apenas pela injeção DOM',
  )

  source = replaceOnce(
    source,
    "  return `name:${normalize(client.name)}`",
    "  return `pet:${String(client.id || '').trim()}`",
    'alinhar fallback da chave de histórico com groupPetsByTutor',
  )

  const domStart = source.indexOf('function createHistoryButton(')
  const domEnd = source.indexOf('function serviceLabel(', domStart)
  assert.ok(domStart >= 0 && domEnd > domStart, 'bloco de injeção DOM do histórico não encontrado')
  source = `${source.slice(0, domStart)}${source.slice(domEnd)}`

  source = replaceOnce(
    source,
    "      'id', 'client_id', 'service_type', 'service_items', 'scheduled_at', 'status', 'price', 'source',\n",
    "      'id', 'client_id', 'service_type', 'service_items', 'scheduled_at', 'status', 'price', 'source', 'notes',\n",
    'carregar instruções dos agendamentos no histórico',
  )

  source = replaceOnce(
    source,
    '      delivery: deliveryLabelFromAppointment(appointment),\n      machine: machine || null,',
    "      delivery: deliveryLabelFromAppointment(appointment),\n      instructions: String(appointment.notes || '').trim(),\n      machine: machine || null,",
    'mapear instruções dos serviços',
  )

  source = replaceOnce(
    source,
    '      delivery: deliveryLabelFromSale(sale),\n      machine: null,',
    "      delivery: deliveryLabelFromSale(sale),\n      instructions: '',\n      machine: null,",
    'normalizar compras sem instruções',
  )

  source = replaceOnce(
    source,
    '{row.delivery && <p className="mt-2 flex items-start gap-1 text-xs text-sky-300"><Truck size={12} className="mt-0.5 shrink-0"/> {row.delivery}</p>}',
    '{row.delivery && <p className="mt-2 flex items-start gap-1 text-xs text-sky-300"><Truck size={12} className="mt-0.5 shrink-0"/> {row.delivery}</p>}\n                        {row.instructions && <p className="mt-2 whitespace-pre-wrap rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs text-amber-100"><strong>Instruções do atendimento:</strong> {row.instructions}</p>}',
    'mostrar instruções no histórico do cliente',
  )

  source = replaceRegexOnce(
    source,
    /\n  useEffect\(\(\) => \{\n    if \(!groups\.size\) return undefined\n    let frame = 0\n    const apply = \(\) => \{ frame = 0; injectHistoryButtons\(groups\) \}\n    const schedule = \(\) => \{ if \(!frame\) frame = window\.requestAnimationFrame\(apply\) \}\n    const observer = new MutationObserver\(schedule\)\n    observer\.observe\(document\.body, \{ childList: true, subtree: true \}\)\n    schedule\(\)\n    return \(\) => \{ observer\.disconnect\(\); if \(frame\) window\.cancelAnimationFrame\(frame\) \}\n  \}, \[groups\]\)\n/,
    '\n',
    'remover MutationObserver do histórico',
  )

  write(path, source)
}

// Observações do pet passam a ter armazenamento próprio em details.pet_notes.
{
  const path = 'src/shared/hooks/useClients.js'
  let source = read(path)

  source = replaceOnce(
    source,
    "  notes: c.notes || '',\n",
    "  client_notes: c.notes || '',\n  notes: c.details?.pet_notes || c.notes || '',\n",
    'ler observações específicas do pet com fallback legado',
  )

  source = replaceOnce(
    source,
    '  notes: p.notes || null,\n  details: {',
    '  notes: p.client_notes || null,\n  details: {\n    pet_notes: p.notes || null,',
    'separar pet_notes de client notes',
  )

  write(path, source)
}

// Agenda: pré-preencher instruções com observações do pet e exibi-las no histórico visual.
{
  const path = 'src/modules/petshop/pages/AgendaPage.jsx'
  let source = read(path)

  source = replaceOnce(
    source,
    '  const searchRequestRef = useRef(0)\n',
    "  const searchRequestRef = useRef(0)\n  const petNotesDefaultRef = useRef(isEdit ? String(appt?.notes || '') : '')\n",
    'controlar preset das observações do pet',
  )

  source = replaceOnce(
    source,
    '  const selectedTutorPets = useMemo(() => {',
    "  useEffect(() => {\n    if (isEdit) return\n    const petNotes = String(selectedPet?.notes || '').trim()\n    setForm((current) => {\n      const currentNotes = String(current.notes || '')\n      const previousDefault = petNotesDefaultRef.current\n      petNotesDefaultRef.current = petNotes\n      if (currentNotes && currentNotes !== previousDefault) return current\n      if (currentNotes === petNotes) return current\n      return { ...current, notes: petNotes }\n    })\n  }, [isEdit, selectedPet?.id, selectedPet?.notes])\n\n  const selectedTutorPets = useMemo(() => {",
    'pré-preencher instruções ao selecionar o pet',
  )

  source = replaceOnce(
    source,
    '<label className="inp-label">Instrucoes para o profissional</label>',
    '<label className="inp-label">Instrucoes e especificacoes para o profissional</label>',
    'deixar claro que o campo é persistido no atendimento',
  )

  source = replaceOnce(
    source,
    '                onChange={(event) => set(\'notes\', event.target.value)}\n              />\n            </div>',
    "                onChange={(event) => set('notes', event.target.value)}\n              />\n              {selectedPet?.notes && <p className=\"mt-2 text-xs text-muted\">Pré-preenchido com as observações do pet. Você pode complementar sem alterar o cadastro permanente.</p>}\n            </div>",
    'explicar preset sem alterar cadastro do pet',
  )

  source = replaceOnce(
    source,
    '      <MotodogAgendaInfo appt={appt}/>\n      <div className="flex items-center justify-between">',
    '      <MotodogAgendaInfo appt={appt}/>\n      {appt.notes && <p className="whitespace-pre-wrap rounded-lg border border-amber-500/20 bg-amber-500/8 px-2.5 py-2 text-xs text-amber-100"><ClipboardList size={12} className="mr-1 inline"/> {appt.notes}</p>}\n      <div className="flex items-center justify-between">',
    'mostrar instruções nos cards do kanban',
  )

  source = replaceOnce(
    source,
    "            <p className={`yuisync-card-responsible truncate text-[10px] ${assigned ? \"text-muted\" : \"text-amber-300\"}`}>\n              {assigned ? `Resp.: ${assigned.name}` : appt.responsible_staff_name ? `Resp.: ${appt.responsible_staff_name}` : 'Sem responsavel'}\n            </p>\n",
    "            <p className={`yuisync-card-responsible truncate text-[10px] ${assigned ? \"text-muted\" : \"text-amber-300\"}`}>\n              {assigned ? `Resp.: ${assigned.name}` : appt.responsible_staff_name ? `Resp.: ${appt.responsible_staff_name}` : 'Sem responsavel'}\n            </p>\n            {appt.notes && <p className=\"yuisync-card-instructions mt-1 line-clamp-3 whitespace-pre-wrap rounded-md border border-amber-500/20 bg-amber-500/8 px-2 py-1 text-[10px] text-amber-100\"><strong>Instruções:</strong> {appt.notes}</p>}\n",
    'mostrar especificações no histórico visual da agenda',
  )

  write(path, source)
}

// Relações de agendamento também carregam as observações permanentes do pet.
{
  const path = 'src/shared/hooks/useAppointments.js'
  let source = read(path)

  source = replaceOnce(
    source,
    '  clients ( id, name, document, phone, email, address, neighborhood, city, details )',
    '  clients ( id, name, document, phone, email, address, neighborhood, city, notes, details )',
    'selecionar notes na relação de clientes',
  )

  source = replaceOnce(
    source,
    "      weight_kg: normalized.clients.details?.weight_kg || null,\n",
    "      weight_kg: normalized.clients.details?.weight_kg || null,\n      notes: normalized.clients.details?.pet_notes || normalized.clients.notes || '',\n",
    'mapear observações do pet para a agenda',
  )

  source = replaceOnce(
    source,
    ".select('id, name, document, phone, email, address, neighborhood, city, details')",
    ".select('id, name, document, phone, email, address, neighborhood, city, notes, details')",
    'carregar notes no fallback de clientes',
  )

  source = replaceOnce(
    source,
    '    notes: client.notes || null,\n    updated_at:',
    '    notes: client.details?.pet_notes || client.notes || null,\n    updated_at:',
    'sincronizar pets com pet_notes',
  )

  write(path, source)
}

// Remover os arquivos do remendo anterior.
for (const path of [
  'src/modules/petshop/components/ClientHistoryButtonVisibilityFix.jsx',
  'test/clientHistoryButtonVisibility.test.mjs',
]) {
  if (existsSync(path)) rmSync(path)
}

write('test/clientHistoryNativeAndInstructions.test.mjs', `import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('historico de Clientes e Pets e renderizado no JSX nativo', async () => {
  const pets = await read('src/modules/petshop/pages/PetsPage.jsx')
  const modules = await read('src/config/modules.jsx')
  const enhancer = await read('src/modules/petshop/components/ClientHistoryGroomingEnhancer.jsx')

  assert.ok((pets.match(/data-yuisync-client-history=\\{group\\.key\\}/g) || []).length >= 2)
  assert.match(pets, /historyGroupKey=\\{tutorGroupKeyByPetId/)
  assert.doesNotMatch(modules, /ClientHistoryButtonVisibilityFix/)
  assert.doesNotMatch(enhancer, /MutationObserver/)
  assert.doesNotMatch(enhancer, /createElement\\('button'\\)/)
})

test('observacoes do pet preenchem instrucoes e ficam salvas no historico', async () => {
  const clients = await read('src/shared/hooks/useClients.js')
  const appointments = await read('src/shared/hooks/useAppointments.js')
  const agenda = await read('src/modules/petshop/pages/AgendaPage.jsx')
  const history = await read('src/modules/petshop/components/ClientHistoryGroomingEnhancer.jsx')

  assert.match(clients, /pet_notes: p\\.notes \\|\\| null/)
  assert.match(clients, /c\\.details\\?\\.pet_notes \\|\\| c\\.notes/)
  assert.match(appointments, /details\\?\\.pet_notes \\|\\| normalized\\.clients\\.notes/)
  assert.match(agenda, /petNotesDefaultRef/)
  assert.match(agenda, /selectedPet\\?\\.notes/)
  assert.match(agenda, /Instrucoes e especificacoes para o profissional/)
  assert.match(agenda, /<strong>Instruções:<\\/strong>/)
  assert.match(history, /instructions: String\\(appointment\\.notes/)
  assert.match(history, /Instruções do atendimento/)
})
`)

console.log('Correção nativa de histórico e instruções do pet aplicada com sucesso.')
