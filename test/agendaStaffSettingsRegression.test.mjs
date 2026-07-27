import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('agenda, configuracoes e comissoes compartilham equipe e capacidade correta', async () => {
  const [agenda, settings, team, migration] = await Promise.all([
    readFile(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/shared/pages/SettingsPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/petshop/pages/EquipePage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260727002000_veterinary_single_capacity.sql', import.meta.url), 'utf8'),
  ])

  assert.match(agenda, /activeAgendaTab === 'banho_tosa' \? MANUAL_SLOT_CAPACITY : 1/)
  assert.match(agenda, /slotCapacity === 1 \? "grid-cols-1" : "grid-cols-2"/)
  assert.match(agenda, /whitespace-nowrap text-\[10px\] font-black/)

  assert.match(settings, /const savingFiscalSettings = effectiveModId === 'petshop' && petSettingsTab === 'fiscal'/)
  assert.match(settings, /if \(savingFiscalSettings && form\.fiscal_provider === 'mock_local'/)
  assert.match(settings, /if \(savingFiscalSettings\) \{\s*const safeNextInvoice/)
  assert.match(settings, /function updateOperationalStaff/)
  assert.match(settings, /onChange=\{\(event\) => updateOperationalStaff\(index, \{ name: event\.target\.value \}\)\}/)

  assert.match(team, /const configuredStaffByKey = useMemo/)
  assert.match(team, /const displayRows = useMemo/)
  assert.match(team, /exportCommissionCsv\(displayRows\)/)
  assert.match(team, /\{displayRows\.map\(\(row\) => \(/)

  assert.match(migration, /service_group, 'geral'\) = 'veterinaria'/)
  assert.match(migration, /v_capacity := 1/)
  assert.match(migration, /duas vagas para banho\/tosa e uma vaga para veterinaria/)
})
