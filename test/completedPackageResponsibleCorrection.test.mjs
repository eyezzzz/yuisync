import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationPath = new URL(
  '../supabase/migrations/20260805161000_allow_completed_package_responsible_correction.sql',
  import.meta.url,
)

const sql = await readFile(migrationPath, 'utf8')

test('completed package appointments only recalculate when service codes really change', () => {
  assert.match(sql, /v_services_changed := v_requested_service_codes is distinct from v_current_service_codes/i)
  assert.match(sql, /v_recalculate := v_services_changed\s+or v_service_type_changed\s+or v_client_id is distinct from v_current\.client_id/is)
})

test('responsible staff remains editable without rebuilding consumed benefits', () => {
  assert.match(sql, /responsible_staff_key = case\s+when p_payload \? 'responsible_staff_key'/is)
  assert.match(sql, /responsible_staff_name = case\s+when p_payload \? 'responsible_staff_name'/is)
  assert.match(sql, /if not v_recalculate and not v_transport_changed then/is)
})

test('real service or transport changes stay protected', () => {
  assert.match(sql, /perform public\.restore_petshop_appointment_benefits\(p_appointment_id\)/i)
  assert.match(sql, /v_transport_changed := \(p_payload \? 'transport_mode'\)/i)
})
