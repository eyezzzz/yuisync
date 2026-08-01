import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('historico de Clientes e Pets e renderizado no JSX nativo', async () => {
  const pets = await read('src/modules/petshop/pages/PetsPage.jsx')
  const modules = await read('src/config/modules.jsx')
  const enhancer = await read('src/modules/petshop/components/ClientHistoryGroomingEnhancer.jsx')

  assert.ok((pets.match(/data-yuisync-client-history=\{group\.key\}/g) || []).length >= 2)
  assert.match(pets, /historyGroupKey=\{tutorGroupKeyByPetId/)
  assert.doesNotMatch(modules, /ClientHistoryButtonVisibilityFix/)
  assert.doesNotMatch(enhancer, /MutationObserver/)
  assert.doesNotMatch(enhancer, /createElement\('button'\)/)
  assert.match(enhancer, /explicitGroupByIdentity/)
  assert.match(enhancer, /document,phone,details/)
})

test('observacoes do pet preenchem instrucoes e ficam salvas no historico', async () => {
  const clients = await read('src/shared/hooks/useClients.js')
  const appointments = await read('src/shared/hooks/useAppointments.js')
  const agenda = await read('src/modules/petshop/pages/AgendaPage.jsx')
  const history = await read('src/modules/petshop/components/ClientHistoryGroomingEnhancer.jsx')

  assert.match(clients, /pet_notes: p\.notes \|\| null/)
  assert.match(clients, /hasOwnProperty\.call\(details, 'pet_notes'\)/)
  assert.match(clients, /notes: petNotesFromClient\(c\)/)
  assert.match(appointments, /details\?\.pet_notes \|\| normalized\.clients\.notes/)
  assert.match(agenda, /petNotesDefaultRef/)
  assert.match(agenda, /selectedPet\?\.notes/)
  assert.match(agenda, /Instrucoes e especificacoes para o profissional/)
  assert.match(agenda, /<strong>Instruções:<\/strong>/)
  assert.match(history, /instructions: String\(appointment\.notes/)
  assert.match(history, /Instruções do atendimento/)
})
