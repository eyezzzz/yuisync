import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')
const write = (path, source) => writeFileSync(path, source)

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before)
  assert.notEqual(index, -1, `Trecho não encontrado: ${label}`)
  assert.equal(source.indexOf(before, index + before.length), -1, `Trecho duplicado: ${label}`)
  return `${source.slice(0, index)}${after}${source.slice(index + before.length)}`
}

{
  const path = 'src/shared/hooks/useClients.js'
  let source = read(path)

  source = replaceOnce(
    source,
    "const mapClientToPet = (c) => ({\n",
    "const petNotesFromClient = (client = {}) => {\n  const details = client.details || {}\n  return Object.prototype.hasOwnProperty.call(details, 'pet_notes')\n    ? String(details.pet_notes || '')\n    : String(client.notes || '')\n}\n\nconst mapClientToPet = (c) => ({\n",
    'helper de fallback apenas para registros legados',
  )

  source = replaceOnce(
    source,
    "  notes: c.details?.pet_notes || c.notes || '',\n",
    "  notes: petNotesFromClient(c),\n",
    'não herdar observação geral como nota do pet novo',
  )

  write(path, source)
}

{
  const path = 'src/modules/petshop/components/ClientHistoryGroomingEnhancer.jsx'
  let source = read(path)

  const start = source.indexOf('function groupClients(')
  const end = source.indexOf('function serviceLabel(', start)
  assert.ok(start >= 0 && end > start, 'bloco de agrupamento do histórico não encontrado')

  const replacement = `function clientIdentityKeys(client = {}) {
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
}

`

  source = `${source.slice(0, start)}${replacement}${source.slice(end)}`
  source = replaceOnce(
    source,
    ".select('id,name,phone,details')",
    ".select('id,name,document,phone,details')",
    'carregar documento para herdar tutor_group_id',
  )

  write(path, source)
}

{
  const path = 'test/clientHistoryNativeAndInstructions.test.mjs'
  let source = read(path)
  source = replaceOnce(
    source,
    "  assert.match(clients, /c\\.details\\?\\.pet_notes \\|\\| c\\.notes/)\n",
    "  assert.match(clients, /hasOwnProperty\\.call\\(details, 'pet_notes'\\)/)\n  assert.match(clients, /notes: petNotesFromClient\\(c\\)/)\n",
    'testar fallback legado sem herança indevida',
  )
  source = replaceOnce(
    source,
    "  assert.doesNotMatch(enhancer, /createElement\\('button'\\)/)\n",
    "  assert.doesNotMatch(enhancer, /createElement\\('button'\\)/)\n  assert.match(enhancer, /explicitGroupByIdentity/)\n  assert.match(enhancer, /document,phone,details/)\n",
    'testar agrupamento compatível com múltiplos pets',
  )
  write(path, source)
}

console.log('Compatibilidade final dos grupos e observações do pet aplicada.')
