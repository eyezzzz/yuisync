import { useCallback } from 'react'
import { supabase, todayISO } from '../../lib/supabase'
import { useModuleCtx } from '../../context/ModuleContext'
import { useAuthCtx } from '../../context/AuthContext'

export function useDashboardSnapshot() {
  const { activeModuleId } = useModuleCtx()
  const { activeTenantId } = useAuthCtx()

  const loadDashboardSnapshot = useCallback(async (date = todayISO()) => {
    if (!activeModuleId) return null

    const { data, error } = await supabase.rpc('get_petshop_dashboard_snapshot', {
      p_tenant_id: activeTenantId || null,
      p_module_id: activeModuleId,
      p_date: date,
    })

    if (error) throw error
    return data || null
  }, [activeModuleId, activeTenantId])

  return { loadDashboardSnapshot }
}
