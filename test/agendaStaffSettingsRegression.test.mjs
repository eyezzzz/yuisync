import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('agenda livre preserva equipe, configuracoes e comissoes', async () => {
  const [agenda, settings, team, migration] = await Promise.all([
    readFile(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/shared/pages/SettingsPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/petshop/pages/EquipePage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260730095500_agenda_free_overlap_visual_lanes.sql', import.meta.url), 'utf8'),
  ])

  assert.match(agenda, /slotCapacity=\{MANUAL_SLOT_CAPACITY\}/)
  assert.match(agenda, /visualLaneCount/)
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

  assert.match(migration, /Agenda operacional livre/)
  assert.match(migration, /return new;/)
  assert.doesNotMatch(migration, /raise exception/)
})
