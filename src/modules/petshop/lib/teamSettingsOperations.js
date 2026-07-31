import { supabase } from '../../../lib/supabase'
import { buildTenantPayload, runWithTenantFallback } from '../../../lib/tenant'
import { normalizeOperationalStaff } from '../../../../shared/petshopOperations'

export const OPERATIONAL_STAFF_TEMPLATE_KEY = '__petshop_operational_staff'

const isOperationalStaffSchemaError = (error) => {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('petshop_operational_staff') && (
    message.includes('schema cache') || message.includes('column') || message.includes('does not exist')
  )
}

export async function persistPetshopTeamSettings({
  moduleId = 'petshop',
  tenantId,
  currentSettings = {},
  staff = [],
  templatePatch = {},
}) {
  const expectedStaff = normalizeOperationalStaff(staff)
  const templates = {
    ...(currentSettings.message_templates || {}),
    [OPERATIONAL_STAFF_TEMPLATE_KEY]: expectedStaff,
    ...templatePatch,
  }

  const save = async (includeColumn) => runWithTenantFallback(tenantId, async (includeTenant) => {
    const row = buildTenantPayload({
      module_id: moduleId,
      message_templates: templates,
      ...(includeColumn ? { petshop_operational_staff: expectedStaff } : {}),
      updated_at: new Date().toISOString(),
    }, tenantId, includeTenant)
    const conflict = includeTenant ? 'tenant_id,module_id' : 'module_id'
    return supabase
      .from('settings')
      .upsert(row, { onConflict: conflict })
      .select(includeColumn ? 'petshop_operational_staff,message_templates' : 'message_templates')
      .single()
  })

  let response = await save(true)
  if (response.error && isOperationalStaffSchemaError(response.error)) response = await save(false)
  if (response.error) throw response.error

  const savedTemplates = response.data?.message_templates || templates
  const savedStaff = normalizeOperationalStaff(
    response.data?.petshop_operational_staff
      ?? savedTemplates[OPERATIONAL_STAFF_TEMPLATE_KEY]
      ?? expectedStaff,
  )
  return {
    petshop_operational_staff: savedStaff,
    message_templates: { ...templates, ...savedTemplates },
  }
}
