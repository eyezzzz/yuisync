import { readFile, writeFile } from 'node:fs/promises'

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Trecho nao encontrado: ${label}`)
  return source.replace(before, after)
}

const corePath = 'src/modules/petshop/hooks/usePetshopAdvancedCore.js'
let core = await readFile(corePath, 'utf8')
core = replaceExact(
  core,
  `    const pendingServices = (pendingRes.data || []).map((appointment) => ({
      ...appointment,
      client: formatClient(appointment.clients || {}),
      price: Number(appointment.price || 0),
    }))

    return {
      profiles,
      rows,
      pendingServices,`,
  `    const pendingServices = (pendingRes.data || []).map((appointment) => ({
      ...appointment,
      client: formatClient(appointment.clients || {}),
      price: Number(appointment.price || 0),
    }))

    let historyRes = await runScoped(async (includeTenant) => {
      let query = supabase
        .from('appointments')
        .select(APPT_SELECT)
        .eq('module_id', moduleId)
        .eq('status', 'concluido')
        .not('responsible_staff_key', 'is', null)
        .gte('scheduled_at', start)
        .lte('scheduled_at', end)
        .order('scheduled_at', { ascending: false })
      return applyTenantFilter(query, activeTenantId, includeTenant)
    })

    if (historyRes.error && isAppointmentClientRelationError(historyRes.error)) {
      historyRes = await runScoped(async (includeTenant) => {
        let query = supabase
          .from('appointments')
          .select(APPT_BASE_SELECT)
          .eq('module_id', moduleId)
          .eq('status', 'concluido')
          .not('responsible_staff_key', 'is', null)
          .gte('scheduled_at', start)
          .lte('scheduled_at', end)
          .order('scheduled_at', { ascending: false })
        return applyTenantFilter(query, activeTenantId, includeTenant)
      })
      if (historyRes.error) throw historyRes.error
      const clientMap = await loadClientMap((historyRes.data || []).map((appointment) => appointment.client_id))
      historyRes.data = (historyRes.data || []).map((appointment) => ({
        ...appointment,
        clients: clientMap.get(appointment.client_id) || null,
      }))
    }
    if (historyRes.error) throw historyRes.error

    const serviceHistory = (historyRes.data || []).map((appointment) => ({
      ...appointment,
      client: formatClient(appointment.clients || {}),
      price: Number(appointment.price || 0),
    }))

    return {
      profiles,
      rows,
      pendingServices,
      serviceHistory,`,
  'historico detalhado do fechamento',
)
await writeFile(corePath, core)

const teamPath = 'src/modules/petshop/pages/EquipePage.jsx'
let team = await readFile(teamPath, 'utf8')
team = replaceExact(
  team,
  `import { useEffect, useMemo, useState } from 'react'`,
  `import { useEffect, useMemo, useState } from 'react'\nimport { createPortal } from 'react-dom'`,
  'createPortal da equipe',
)
team = replaceExact(
  team,
  `  Download,
  Percent,
  RefreshCw,
  Users,
  Wallet,`,
  `  Download,
  Eye,
  Percent,
  Printer,
  RefreshCw,
  Users,
  Wallet,
  X,`,
  'icones do historico',
)
team = replaceExact(
  team,
  `const dateLabel = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '-'
const serviceName = (services, code) => services.find((service) => service.code === code)?.name || code || '-'

export default function EquipePage() {`,
  `const dateLabel = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '-'
const serviceName = (services, code) => services.find((service) => service.code === code)?.name || code || '-'
const escapeHtml = (value = '') => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

function serviceHistoryName(services, appointment = {}) {
  const itemLabels = (Array.isArray(appointment.service_items) ? appointment.service_items : [])
    .map((item) => item?.name || item?.label || serviceName(services, item?.service_type || item?.code || item?.value))
    .filter((label) => label && label !== '-')
  if (itemLabels.length) return [...new Set(itemLabels)].join(' + ')
  return serviceName(services, appointment.service_type)
}

function CommissionHistoryModal({ row, items, services, range, onClose }) {
  const total = items.reduce((sum, item) => sum + Number(item.price || 0), 0)
  const responsibleName = row?.collaborator_name || row?.staff_key || 'Responsavel'

  function printHistory() {
    const printWindow = window.open('', '_blank', 'width=980,height=760')
    if (!printWindow) return
    const bodyRows = items.map((item) => \`<tr>
      <td>\${escapeHtml(dateLabel(item.scheduled_at))}</td>
      <td>\${escapeHtml(item.client?.owner_name || '-')}</td>
      <td>\${escapeHtml(item.client?.pet_name || '-')}</td>
      <td>\${escapeHtml(serviceHistoryName(services, item))}</td>
      <td class="money">\${escapeHtml(fmtCurrency(item.price || 0))}</td>
    </tr>\`).join('')
    printWindow.document.write(\`<!doctype html><html><head><meta charset="utf-8"><title>Conferencia - \${escapeHtml(responsibleName)}</title><style>
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; color: #111; margin: 0; font-size: 11px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .meta { margin-bottom: 14px; color: #444; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #bbb; padding: 6px; text-align: left; vertical-align: top; }
      th { background: #eee; font-size: 10px; text-transform: uppercase; }
      .money { text-align: right; white-space: nowrap; }
      tfoot td { font-weight: 700; }
    </style></head><body>
      <h1>Historico de servicos - \${escapeHtml(responsibleName)}</h1>
      <div class="meta">Periodo: \${escapeHtml(dateLabel(range.startDate))} a \${escapeHtml(dateLabel(range.endDate))} · \${items.length} atendimento(s)</div>
      <table><thead><tr><th>Data</th><th>Tutor</th><th>Pet</th><th>Servico</th><th>Valor</th></tr></thead>
      <tbody>\${bodyRows || '<tr><td colspan="5">Nenhum atendimento no periodo.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="4">Total conferido</td><td class="money">\${escapeHtml(fmtCurrency(total))}</td></tr></tfoot></table>
    </body></html>\`)
    printWindow.document.close()
    setTimeout(() => {
      printWindow.focus()
      printWindow.print()
    }, 180)
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box max-w-5xl">
        <div className="modal-header">
          <div>
            <h2 className="font-display text-xl font-bold text-text">Historico de {responsibleName}</h2>
            <p className="mt-1 text-sm text-muted">{dateLabel(range.startDate)} a {dateLabel(range.endDate)} · {items.length} atendimento(s)</p>
          </div>
          <button type="button" aria-label="Fechar historico" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>
        <div className="modal-body space-y-4">
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="tbl min-w-[760px]">
              <thead><tr><th>Data</th><th>Tutor</th><th>Pet</th><th>Servico</th><th>Valor</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{dateLabel(item.scheduled_at)}</td>
                    <td>{item.client?.owner_name || '-'}</td>
                    <td className="font-semibold text-text">{item.client?.pet_name || '-'}</td>
                    <td>{serviceHistoryName(services, item)}</td>
                    <td className="font-semibold text-emerald-400">{fmtCurrency(item.price || 0)}</td>
                  </tr>
                ))}
                {!items.length && <tr><td colSpan={5} className="py-10 text-center text-muted">Nenhum atendimento concluido para esta responsavel no periodo.</td></tr>}
              </tbody>
              <tfoot><tr><td colSpan={4} className="font-bold text-text">Total conferido</td><td className="font-bold text-emerald-400">{fmtCurrency(total)}</td></tr></tfoot>
            </table>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary">Fechar</button>
            <button type="button" onClick={printHistory} className="btn btn-primary"><Printer size={15}/> Imprimir historico</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function EquipePage() {`,
  'modal de conferencia',
)
team = replaceExact(
  team,
  `  const [pendingServices, setPendingServices] = useState([])
  const [services, setServices] = useState([])`,
  `  const [pendingServices, setPendingServices] = useState([])
  const [serviceHistory, setServiceHistory] = useState([])
  const [historyRow, setHistoryRow] = useState(null)
  const [services, setServices] = useState([])`,
  'estados do historico',
)
team = replaceExact(
  team,
  `      setRows(snapshot.rows || [])
      setPendingServices(snapshot.pendingServices || [])
      setServices(serviceRows || [])`,
  `      setRows(snapshot.rows || [])
      setPendingServices(snapshot.pendingServices || [])
      setServiceHistory(snapshot.serviceHistory || [])
      setServices(serviceRows || [])`,
  'carregamento do historico',
)
team = replaceExact(
  team,
  `  const totals = useMemo(() => displayRows.reduce((acc, row) => ({`,
  `  const selectedHistoryItems = useMemo(() => historyRow?.staff_key
    ? serviceHistory.filter((item) => item.responsible_staff_key === historyRow.staff_key)
    : [], [historyRow, serviceHistory])

  const totals = useMemo(() => displayRows.reduce((acc, row) => ({`,
  'historico selecionado',
)
team = replaceExact(
  team,
  `                  <th>Outros 5%</th>
                  <th>Total</th>`,
  `                  <th>Outros 5%</th>
                  <th>Total</th>
                  <th>Conferencia</th>`,
  'cabecalho de conferencia',
)
team = replaceExact(
  team,
  `                    <td className="text-emerald-400 font-bold">{fmtCurrency(row.total_commission || 0)}</td>
                  </tr>`,
  `                    <td className="text-emerald-400 font-bold">{fmtCurrency(row.total_commission || 0)}</td>
                    <td>
                      <button
                        type="button"
                        aria-label={\`Visualizar historico de \${row.collaborator_name || row.staff_key}\`}
                        title="Visualizar e imprimir historico"
                        disabled={!row.staff_key}
                        onClick={() => setHistoryRow(row)}
                        className="btn btn-secondary btn-sm justify-center"
                      >
                        <Eye size={13}/> Conferir
                      </button>
                    </td>
                  </tr>`,
  'botao de conferencia',
)
team = replaceExact(
  team,
  `<tr><td colSpan={6} className="text-center text-muted py-10">Sem producao concluida no periodo.</td></tr>`,
  `<tr><td colSpan={7} className="text-center text-muted py-10">Sem producao concluida no periodo.</td></tr>`,
  'colspan da tabela',
)
team = replaceExact(
  team,
  `      {activeTab === 'esteticistas' && (`,
  `      {historyRow && (
        <CommissionHistoryModal
          row={historyRow}
          items={selectedHistoryItems}
          services={services}
          range={range}
          onClose={() => setHistoryRow(null)}
        />
      )}

      {activeTab === 'esteticistas' && (`,
  'renderizacao do modal',
)
await writeFile(teamPath, team)

const clientsPath = 'src/shared/hooks/useClients.js'
let clients = await readFile(clientsPath, 'utf8')
clients = replaceExact(
  clients,
  `  registration_status: c.details?.registration_status || inferRegistrationStatus(c),`,
  `  registration_status: inferRegistrationStatus(c),`,
  'status recalculado na leitura',
)
clients = replaceExact(
  clients,
  `    registration_status: p.registration_status || inferRegistrationStatus({
      document: p.owner_cpf,
      address: p.owner_address,
      neighborhood: p.owner_neighborhood,
      details: {
        tutor_birth_date: p.tutor_birth_date,
        zip_code: p.zip_code,
        address_number: p.address_number,
        address_complement: p.address_complement,
        address_reference: p.address_reference,
        pet_name: p.pet_name,
        breed: p.breed,
      },
    }),`,
  `    registration_status: inferRegistrationStatus({
      name: p.owner_name,
      document: p.owner_cpf,
      phone: p.phone,
      address: p.owner_address,
      neighborhood: p.owner_neighborhood,
      city: p.owner_city,
      details: {
        pet_name: p.pet_name,
        species: p.species,
      },
    }),`,
  'status recalculado na gravacao',
)
clients = replaceExact(
  clients,
  `function inferRegistrationStatus(client = {}) {
  const details = client.details || {}
  if (!client.address || !client.neighborhood) return 'sem_endereco'
  if (!client.document) return 'sem_cpf'
  if (!details.tutor_birth_date || !details.zip_code || !details.address_number || !details.address_reference) return 'pendente'
  return 'completo'
}`,
  `function inferRegistrationStatus(client = {}) {
  const details = client.details || {}
  const present = (value) => String(value || '').trim().length > 0
  if (!present(client.document)) return 'sem_cpf'
  if (!present(client.address) || !present(client.neighborhood)) return 'sem_endereco'
  const coreFields = [client.name, client.phone, client.city, details.pet_name, details.species]
  return coreFields.every(present) ? 'completo' : 'pendente'
}`,
  'criterio operacional de cadastro',
)
await writeFile(clientsPath, clients)

const petsPath = 'src/modules/petshop/pages/PetsPage.jsx'
let pets = await readFile(petsPath, 'utf8')
pets = replaceExact(
  pets,
  `function getRegistrationBadge(pet = {}) {
  if (pet.registration_status === 'completo') return { label: 'Completo', cls: 'badge-green' }
  if (pet.registration_status === 'sem_cpf' || !pet.owner_cpf) return { label: 'Sem CPF', cls: 'badge-red' }
  if (pet.registration_status === 'sem_endereco' || !pet.owner_address || !pet.owner_neighborhood) return { label: 'Sem endereco', cls: 'badge-amber' }
  return { label: 'Pendente cadastro', cls: 'badge-amber' }
}`,
  `function getRegistrationBadge(pet = {}) {
  if (!pet.owner_cpf || pet.registration_status === 'sem_cpf') return { label: 'Sem CPF', cls: 'badge-red' }
  if (!pet.owner_address || !pet.owner_neighborhood || pet.registration_status === 'sem_endereco') return { label: 'Sem endereco', cls: 'badge-amber' }
  if (pet.registration_status === 'completo') return { label: 'Completo', cls: 'badge-green' }
  return { label: 'Pendente cadastro', cls: 'badge-amber' }
}`,
  'badge de cadastro',
)
await writeFile(petsPath, pets)

await writeFile('test/teamCommissionHistory.test.mjs', `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { readFile } from 'node:fs/promises'\n\ntest('comissoes exibem historico detalhado por responsavel e permitem impressao', async () => {\n  const [page, core] = await Promise.all([\n    readFile(new URL('../src/modules/petshop/pages/EquipePage.jsx', import.meta.url), 'utf8'),\n    readFile(new URL('../src/modules/petshop/hooks/usePetshopAdvancedCore.js', import.meta.url), 'utf8'),\n  ])\n  assert.ok(core.includes(".not('responsible_staff_key', 'is', null)"))\n  assert.ok(core.includes('serviceHistory'))\n  assert.ok(page.includes('CommissionHistoryModal'))\n  assert.ok(page.includes('Visualizar e imprimir historico'))\n  assert.ok(page.includes('Tutor'))\n  assert.ok(page.includes('Pet'))\n  assert.ok(page.includes('Servico'))\n  assert.ok(page.includes('Total conferido'))\n  assert.ok(page.includes('printWindow.print()'))\n})\n`)

await writeFile('test/clientRegistrationStatus.test.mjs', `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { readFile } from 'node:fs/promises'\n\ntest('status do cadastro e recalculado pelos campos atuais sem exigir referencia opcional', async () => {\n  const [hook, page] = await Promise.all([\n    readFile(new URL('../src/shared/hooks/useClients.js', import.meta.url), 'utf8'),\n    readFile(new URL('../src/modules/petshop/pages/PetsPage.jsx', import.meta.url), 'utf8'),\n  ])\n  assert.ok(hook.includes('registration_status: inferRegistrationStatus(c)'))\n  assert.equal(hook.includes('p.registration_status || inferRegistrationStatus'), false)\n  const inferBlock = hook.slice(hook.indexOf('function inferRegistrationStatus'), hook.indexOf('const sanitizeSearch'))\n  assert.ok(inferBlock.includes('client.name'))\n  assert.ok(inferBlock.includes('client.phone'))\n  assert.ok(inferBlock.includes('client.city'))\n  assert.ok(inferBlock.includes('details.pet_name'))\n  assert.ok(inferBlock.includes('details.species'))\n  assert.equal(inferBlock.includes('address_reference'), false)\n  assert.ok(page.includes("pet.registration_status === 'completo'"))\n})\n`)
