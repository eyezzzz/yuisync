import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('status do cadastro e recalculado pelos campos atuais sem exigir referencia opcional', async () => {
  const [hook, page] = await Promise.all([
    readFile(new URL('../src/shared/hooks/useClients.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/petshop/pages/PetsPage.jsx', import.meta.url), 'utf8'),
  ])
  assert.ok(hook.includes('registration_status: inferRegistrationStatus(c)'))
  assert.equal(hook.includes('p.registration_status || inferRegistrationStatus'), false)
  const inferBlock = hook.slice(hook.indexOf('function inferRegistrationStatus'), hook.indexOf('const sanitizeSearch'))
  assert.ok(inferBlock.includes('client.name'))
  assert.ok(inferBlock.includes('client.phone'))
  assert.ok(inferBlock.includes('client.city'))
  assert.ok(inferBlock.includes('details.pet_name'))
  assert.ok(inferBlock.includes('details.species'))
  assert.equal(inferBlock.includes('address_reference'), false)
  assert.ok(page.includes("pet.registration_status === 'completo'"))
})
