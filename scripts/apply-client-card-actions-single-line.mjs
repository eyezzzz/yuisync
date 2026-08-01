import assert from 'node:assert/strict'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'

const petsPath = 'src/modules/petshop/pages/PetsPage.jsx'
let pets = readFileSync(petsPath, 'utf8')

const oldRow = '<div className="mt-4 flex flex-wrap items-center justify-end gap-2"><button type="button" data-yuisync-client-history={group.key} className="btn btn-secondary btn-sm"><History size={13}/> Histórico</button><button type="button" data-yuisync-add-pet-action onClick={() => openAddPetForTutor(pet)} className="btn btn-primary btn-sm"><Plus size={13}/> Adicionar pet</button><button onClick={() => setModalPet(pet)} className="btn btn-secondary btn-sm">Editar cliente</button></div>'
const newRow = '<div className="mt-4 flex flex-nowrap items-center justify-end gap-1.5"><button type="button" data-yuisync-client-history={group.key} className="btn btn-secondary btn-sm shrink-0 gap-1 whitespace-nowrap px-2 text-[10px]"><History size={12}/> Histórico</button><button type="button" data-yuisync-add-pet-action onClick={() => openAddPetForTutor(pet)} className="btn btn-primary btn-sm shrink-0 gap-1 whitespace-nowrap px-2 text-[10px]"><Plus size={12}/> Adicionar pet</button><button onClick={() => setModalPet(pet)} className="btn btn-secondary btn-sm shrink-0 whitespace-nowrap px-2 text-[10px]">Editar cliente</button></div>'

assert.ok(pets.includes(oldRow), 'linha de acoes do card nao encontrada')
pets = pets.replace(oldRow, newRow)
assert.equal((pets.match(/mt-4 flex flex-nowrap items-center justify-end gap-1\.5/g) || []).length, 1)
writeFileSync(petsPath, pets)

const enhancerPath = 'src/modules/petshop/components/ClientHistoryGroomingEnhancer.jsx'
let enhancer = readFileSync(enhancerPath, 'utf8')

enhancer = enhancer.replace(
  "import { applyTenantFilter, runWithTenantFallback } from '../../../lib/tenant'\n",
  "import { applyTenantFilter, runWithTenantFallback } from '../../../lib/tenant'\nimport { groupPetsByTutor } from '../../../shared/lib/petTutorGroups'\n",
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

assert.ok(enhancer.includes(oldGrouping), 'agrupamento antigo do historico nao encontrado')
enhancer = enhancer.replace(oldGrouping, newGrouping)

enhancer = enhancer.replace(
  "    setClients((response.data || []).map(mapClient))\n",
  "    const mappedClients = (response.data || []).map(mapClient)\n    setClients(mappedClients)\n    return mappedClients\n",
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
assert.ok(enhancer.includes(oldClick), 'tratamento antigo do clique no historico nao encontrado')
enhancer = enhancer.replace(oldClick, newClick)
enhancer = enhancer.replace('  }, [groups, openHistory])', '  }, [groups, loadClients, openHistory])')

assert.match(enhancer, /groupPetsByTutor\(clients\)/)
assert.match(enhancer, /groupClients\(await loadClients\(\)\)/)
writeFileSync(enhancerPath, enhancer)

writeFileSync('test/clientHistoryClickAndLayout.test.mjs', `import assert from 'node:assert/strict'\nimport { readFile } from 'node:fs/promises'\nimport test from 'node:test'\n\nconst root = new URL('../', import.meta.url)\nconst read = (path) => readFile(new URL(path, root), 'utf8')\n\ntest('acoes do card permanecem em uma unica linha', async () => {\n  const pets = await read('src/modules/petshop/pages/PetsPage.jsx')\n  assert.match(pets, /mt-4 flex flex-nowrap items-center justify-end gap-1\\.5/)\n  assert.match(pets, /whitespace-nowrap px-2 text-\\[10px\\]/)\n})\n\ntest('clique do historico usa o mesmo agrupamento da tela e recarrega em caso de corrida', async () => {\n  const enhancer = await read('src/modules/petshop/components/ClientHistoryGroomingEnhancer.jsx')\n  assert.match(enhancer, /groupPetsByTutor/)\n  assert.match(enhancer, /groupPetsByTutor\\(clients\\)/)\n  assert.match(enhancer, /groupClients\\(await loadClients\\(\\)\\)\\.get\\(groupKey\\)/)\n  assert.match(enhancer, /Não foi possível identificar este tutor/)\n  assert.doesNotMatch(enhancer, /function clientGroupKey/)\n})\n`)

rmSync('scripts/apply-client-card-actions-single-line.mjs')
rmSync('.github/workflows/apply-client-card-actions-single-line.yml')
