import assert from 'node:assert/strict'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source
  assert.ok(source.includes(before), `${label} nao encontrado`)
  return source.replace(before, after)
}

const petsPath = 'src/modules/petshop/pages/PetsPage.jsx'
let pets = readFileSync(petsPath, 'utf8')
const oldRow = '<div className="mt-4 flex flex-wrap items-center justify-end gap-2"><button type="button" data-yuisync-client-history={group.key} className="btn btn-secondary btn-sm"><History size={13}/> Histórico</button><button type="button" data-yuisync-add-pet-action onClick={() => openAddPetForTutor(pet)} className="btn btn-primary btn-sm"><Plus size={13}/> Adicionar pet</button><button onClick={() => setModalPet(pet)} className="btn btn-secondary btn-sm">Editar cliente</button></div>'
const newRow = '<div className="mt-4 flex flex-nowrap items-center justify-end gap-1.5"><button type="button" data-yuisync-client-history={group.key} className="btn btn-secondary btn-sm shrink-0 gap-1 whitespace-nowrap px-2 text-[10px]"><History size={12}/> Histórico</button><button type="button" data-yuisync-add-pet-action onClick={() => openAddPetForTutor(pet)} className="btn btn-primary btn-sm shrink-0 gap-1 whitespace-nowrap px-2 text-[10px]"><Plus size={12}/> Adicionar pet</button><button onClick={() => setModalPet(pet)} className="btn btn-secondary btn-sm shrink-0 whitespace-nowrap px-2 text-[10px]">Editar cliente</button></div>'
pets = replaceOnce(pets, oldRow, newRow, 'linha de acoes do card')
writeFileSync(petsPath, pets)

const enhancerPath = 'src/modules/petshop/components/ClientHistoryGroomingEnhancer.jsx'
let enhancer = readFileSync(enhancerPath, 'utf8')
enhancer = replaceOnce(
  enhancer,
  "import { applyTenantFilter, runWithTenantFallback } from '../../../lib/tenant'\n",
  "import { applyTenantFilter, runWithTenantFallback } from '../../../lib/tenant'\nimport { groupPetsByTutor } from '../../../shared/lib/petTutorGroups'\n",
  'import do agrupamento compartilhado',
)

const oldGrouping = `function clientGroupKey(client = {}) {
  const explicit = String(client?.details?.tutor_group_id || '').trim()
  if (explicit) return \`group:\${explicit}\`
  const phone = phoneDigits(client.phone)
  if (phone) return \`phone:\${phone}\`
  return \`pet:\${String(client.id || '').trim()}\`
}

function mapClient(client = {}) {
  return {
    ...client,
    pet_name: String(client?.details?.pet_name || '').trim() || 'Pet',
    group_key: clientGroupKey(client),
  }
}

function clientIdentityKeys(client = {}) {
  const keys = []
  const document = phoneDigits(client.document)
  if (document) keys.push(\`document:\${document}\`)
  const phone = phoneDigits(client.phone)
  if (phone) keys.push(\`phone:\${phone}\`)
  return keys
}

function groupClients(clients = []) {
  const explicitGroupByIdentity = new Map()

  clients.forEach((client) => {
    const explicit = String(client?.details?.tutor_group_id || '').trim()
    if (!explicit) return
    const groupKey = \`group:\${explicit}\`
    clientIdentityKeys(client).forEach((identityKey) => {
      if (!explicitGroupByIdentity.has(identityKey)) explicitGroupByIdentity.set(identityKey, groupKey)
    })
  })

  const groups = new Map()
  clients.forEach((client) => {
    const explicit = String(client?.details?.tutor_group_id || '').trim()
    const inherited = clientIdentityKeys(client)
      .map((identityKey) => explicitGroupByIdentity.get(identityKey))
      .find(Boolean)
    const key = explicit ? \`group:\${explicit}\` : inherited || clientGroupKey(client)
    const current = groups.get(key) || {
      key,
      owner_name: client.name || 'Cliente',
      phone: client.phone || '',
      clients: [],
    }
    current.clients.push(client)
    groups.set(key, current)
  })
  return groups
}`
const newGrouping = `function mapClient(client = {}) {
  return {
    ...client,
    owner_name: client.name || '',
    owner_cpf: client.document || '',
    tutor_group_id: client?.details?.tutor_group_id || '',
    pet_name: String(client?.details?.pet_name || '').trim() || 'Pet',
  }
}

function groupClients(clients = []) {
  const groups = new Map()
  groupPetsByTutor(clients).forEach((group) => {
    groups.set(group.key, {
      key: group.key,
      owner_name: group.owner_name || 'Cliente',
      phone: group.phone || '',
      clients: group.pets,
    })
  })
  return groups
}`
enhancer = replaceOnce(enhancer, oldGrouping, newGrouping, 'agrupamento do historico')
enhancer = replaceOnce(
  enhancer,
  "    setClients((response.data || []).map(mapClient))\n",
  "    const mappedClients = (response.data || []).map(mapClient)\n    setClients(mappedClients)\n    return mappedClients\n",
  'retorno do carregamento de clientes',
)
const oldClick = `      const group = groups.get(button.dataset.yuisyncClientHistory)
      if (group) void openHistory(group)`
const newClick = `      const groupKey = button.dataset.yuisyncClientHistory
      void (async () => {
        let group = groups.get(groupKey)
        if (!group) {
          try {
            group = groupClients(await loadClients()).get(groupKey)
          } catch (error) {
            setHistoryGroup({ key: groupKey, owner_name: 'Cliente', clients: [] })
            setHistoryRows([])
            setHistoryError(error?.message || 'Não foi possível carregar os clientes para abrir o histórico.')
            setHistoryLoading(false)
            return
          }
        }
        if (!group) {
          setHistoryGroup({ key: groupKey, owner_name: 'Cliente', clients: [] })
          setHistoryRows([])
          setHistoryError('Não foi possível identificar este tutor. Atualize a página e tente novamente.')
          setHistoryLoading(false)
          return
        }
        void openHistory(group)
      })()`
enhancer = replaceOnce(enhancer, oldClick, newClick, 'tratamento do clique no historico')
enhancer = replaceOnce(
  enhancer,
  '  }, [groups, openHistory])',
  '  }, [groups, loadClients, openHistory])',
  'dependencias do clique no historico',
)
writeFileSync(enhancerPath, enhancer)

const corePath = 'src/modules/petshop/hooks/usePetshopAdvancedCore.js'
let core = readFileSync(corePath, 'utf8')
core = replaceOnce(
  core,
  'ready_at,notes,subscription_benefit_used,transport_mode',
  'ready_at,notes,subscription_id,subscription_benefit_used,transport_mode',
  'subscription_id no snapshot de comissoes',
)
writeFileSync(corePath, core)

writeFileSync('test/clientHistoryClickLayoutAndPackageCommission.test.mjs', `import assert from 'node:assert/strict'\nimport { readFile } from 'node:fs/promises'\nimport test from 'node:test'\n\nconst root = new URL('../', import.meta.url)\nconst read = (path) => readFile(new URL(path, root), 'utf8')\n\ntest('acoes do card permanecem em uma unica linha', async () => {\n  const pets = await read('src/modules/petshop/pages/PetsPage.jsx')\n  assert.match(pets, /mt-4 flex flex-nowrap items-center justify-end gap-1\\.5/)\n  assert.match(pets, /whitespace-nowrap px-2 text-\\[10px\\]/)\n})\n\ntest('clique do historico usa exatamente o agrupamento da tela e recarrega se necessario', async () => {\n  const enhancer = await read('src/modules/petshop/components/ClientHistoryGroomingEnhancer.jsx')\n  assert.match(enhancer, /groupPetsByTutor/)\n  assert.match(enhancer, /groupPetsByTutor\\(clients\\)/)\n  assert.match(enhancer, /groupClients\\(await loadClients\\(\\)\\)\\.get\\(groupKey\\)/)\n  assert.match(enhancer, /Não foi possível identificar este tutor/)\n  assert.doesNotMatch(enhancer, /function clientGroupKey/)\n})\n\ntest('snapshot de comissoes carrega subscription_id para aplicar o valor liquido do pacote', async () => {\n  const core = await read('src/modules/petshop/hooks/usePetshopAdvancedCore.js')\n  assert.match(core, /notes,subscription_id,subscription_benefit_used/)\n})\n\ntest('banho de pacote de 200 dividido em quatro usa base 50 e comissao 2,50', async () => {\n  const { buildPackageCommissionAllocation } = await import('../src/modules/petshop/lib/packageCommissionOperations.js')\n  const { appointmentCommissionLines } = await import('../src/modules/petshop/lib/teamCommissionSummary.js')\n  const allocation = buildPackageCommissionAllocation({\n    plan: { name: '4 banhos', price: 200, services: [{ service_type: 'banho_0_10', qty_per_cycle: 4 }] },\n    catalogServices: [{ code: 'banho_0_10', default_price: 55 }],\n  })\n  assert.equal(allocation.unit_values.get('banho_0_10'), 50)\n  const [line] = appointmentCommissionLines({\n    id: 'package-bath',\n    service_group: 'banho_tosa',\n    subscription_id: 'subscription-1',\n    subscription_benefit_used: true,\n    package_commission: true,\n    package_commission_unit_value: 50,\n    service_items: [{ code: 'banho_0_10', name: 'Banho', group_type: 'banho_tosa', unit_price: 0, package_covered: true, package_unit_price: 50 }],\n  })\n  assert.equal(line.revenue, 50)\n  assert.equal(line.commission, 2.5)\n  assert.notEqual(line.commission, 2.75)\n})\n`)

for (const disposable of [
  'scripts/apply-client-card-actions-single-line.mjs',
  '.github/workflows/apply-client-card-actions-single-line.yml',
  '.github/history-fix-trigger',
]) {
  try { rmSync(disposable) } catch {}
}
