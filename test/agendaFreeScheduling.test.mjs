import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { MANUAL_SLOT_CAPACITY } from '../src/modules/petshop/lib/appointmentOperational.js'

test('agenda usa quatro colunas apenas como capacidade visual', async () => {
  const agenda = await readFile(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8')
  assert.equal(MANUAL_SLOT_CAPACITY, 4)
  assert.match(agenda, /colunas visuais · agendamentos livres/)
  assert.match(agenda, /const visualLaneCount = Math.max\(slotCapacity, laneEnds.length\)/)
  assert.match(agenda, /const visualLaneCount = Math.max\(slotCapacity, occupying.length\)/)
  assert.match(agenda, /gridTemplateColumns: `repeat\(\$\{visualLaneCount\}, minmax\(140px, 1fr\)\)`/)
  assert.doesNotMatch(agenda, /wouldExceedSlotCapacity|sameResponsibleConflict|acima da capacidade configurada/)
})

test('drag and drop operacional permanece conectado ao update transacional', async () => {
  const resolved = await readFile(new URL('../src/modules/petshop/pages/AgendaResolvedPage.jsx', import.meta.url), 'utf8')
  const integrated = await readFile(new URL('../src/modules/petshop/pages/AgendaIntegratedPage.jsx', import.meta.url), 'utf8')
  assert.match(resolved, /data-yuisync-action="drag"/)
  assert.match(resolved, /pageRoot.addEventListener\('pointerdown', onPointerDown\)/)
  assert.match(resolved, /document.addEventListener\('pointermove', onPointerMove/)
  assert.match(resolved, /document.addEventListener\('pointerup', onPointerUp/)
  assert.match(resolved, /chooseAgendaSlot\(slots\(\), event.clientX, event.clientY\)/)
  assert.match(resolved, /void moveAppointment\(id, time\)/)
  assert.match(resolved, /await update\(appointmentId, \{ scheduled_at: target.toISOString\(\) \}\)/)
  assert.match(integrated, /is-yuisync-pointer-dragging/)
  assert.match(integrated, /shiftedInterval/)
  assert.match(integrated, /pendingMove/)
})

test('banco permite sobreposicao e mesmo responsavel sem remover o trigger', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20260730095500_agenda_free_overlap_visual_lanes.sql', import.meta.url), 'utf8')
  assert.match(migration, /create or replace function public\.prevent_appointment_overlap/)
  assert.match(migration, /return new;/)
  assert.doesNotMatch(migration, /drop trigger|raise exception|v_capacity|v_overlap_count/)
})
