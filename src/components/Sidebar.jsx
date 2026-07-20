import React, { useState } from 'react'
import { LogOut, ChevronRight, Star, Building2, RefreshCw, Moon, Sun } from 'lucide-react'
import { ModuleSwitcher } from './ModuleSwitcher'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuthCtx } from '../context/AuthContext'

export function Sidebar({ profile, onLogout, open, setOpen, storeSettings, activeModule, setActiveModuleId, darkMode, onToggleDarkMode }) {
  const isAdminGlobal = profile?.role === 'admin'
  const userModuleRole = (profile?.module_permissions || {})[activeModule.id]
  const location = useLocation()
  const { tenants = [], activeTenantId, tenantLoading, switchTenant } = useAuthCtx()
  const [switchingTenant, setSwitchingTenant] = useState(false)
  const navGroups = activeModule.navSections || [
    { title: 'Menu Principal', items: activeModule.nav || [] },
    ...(activeModule.adminNav ? [{ title: 'Administracao', items: activeModule.adminNav }] : []),
  ]

  const hasAccessToItem = (item) => {
    if (isAdminGlobal) return true
    if (!item.roles) return true
    return item.roles.includes(userModuleRole)
  }

  const renderNavGroup = (title, items) => {
    const visibleItems = items.filter(hasAccessToItem)
    if (visibleItems.length === 0) return null

    return (
      <div className="mb-6 last:mb-0">
        <p className="text-[10px] font-bold text-muted/40 uppercase tracking-[0.2em] px-2.5 mb-2.5">{title}</p>
        <div className="space-y-0.5">
          {visibleItems.map(({ id, label, icon: ItemIcon }) => {
            const targetPath = `/${activeModule.id}/${id}`
            const isActive = location.pathname === targetPath

            return (
              <NavLink
                key={id}
                to={targetPath}
                onClick={() => setOpen(false)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all duration-150 border border-transparent
                  ${isActive
                    ? `${activeModule.theme.bgLight} ${activeModule.theme.text} ${activeModule.theme.border}`
                    : 'text-muted hover:bg-white/5 hover:text-text'
                  }
                `}
              >
                <ItemIcon size={17} />
                <span>{label}</span>
                {isActive && <ChevronRight size={13} className="ml-auto opacity-60" />}
              </NavLink>
            )
          })}
        </div>
      </div>
    )
  }

  const handleGlobalTenantChange = async (tenantId) => {
    if (!tenantId || tenantId === activeTenantId) return
    try {
      setSwitchingTenant(true)
      await switchTenant(tenantId)
    } catch (error) {
      console.error('Falha ao trocar instancia ativa:', error)
    } finally {
      setSwitchingTenant(false)
    }
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setOpen(false)} />
      )}
      <aside
        className={`
        fixed lg:relative inset-y-0 left-0 z-50
        w-60 flex flex-col h-full bg-surface border-r border-[var(--border2)]
        transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
      >
        <div className="px-3 py-4 border-b border-[var(--border2)]">
          <ModuleSwitcher
            activeModule={activeModule}
            setActiveModuleId={setActiveModuleId}
            profile={profile}
            storeSettings={storeSettings}
          />
        </div>

        <nav className="flex-1 px-2.5 py-4 overflow-y-auto custom-scrollbar">
          {navGroups.map((group, index) => (
            <React.Fragment key={`${group.title || 'group'}-${index}`}>
              {renderNavGroup(group.title, group.items || [])}
            </React.Fragment>
          ))}
          {!activeModule.navSections && activeModule.adminNav && renderNavGroup('Administracao', activeModule.adminNav)}
        </nav>

        <div className="px-2.5 py-3 border-t border-[var(--border2)] space-y-2.5">
          <button type="button" onClick={onToggleDarkMode} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm font-semibold text-text hover:border-[var(--primary-border)] transition-colors" aria-label={darkMode ? 'Ativar modo claro' : 'Ativar modo noturno'}>
            <span className="flex items-center gap-2"><span className="w-7 h-7 rounded-lg bg-[var(--primary-bg-light)] text-primary flex items-center justify-center">{darkMode ? <Sun size={15} /> : <Moon size={15} />}</span>{darkMode ? 'Modo claro' : 'Modo noturno'}</span>
            <span className="text-xs text-muted">Alterar</span>
          </button>
          {isAdminGlobal && (
            <div className="px-2.5 py-2.5 rounded-xl border border-white/10 bg-white/[0.03]">
              <p className="text-[10px] text-muted uppercase tracking-[0.16em] font-bold mb-1.5 flex items-center gap-1">
                <Building2 size={10} />
                Instancia Ativa
              </p>
              <div className="relative">
                <select
                  className="w-full bg-black/20 border border-[var(--border2)] rounded-lg text-xs font-semibold text-text px-2.5 py-2 outline-none"
                  value={activeTenantId || ''}
                  disabled={tenantLoading || switchingTenant || tenants.length === 0}
                  onChange={(event) => handleGlobalTenantChange(event.target.value)}
                >
                  {tenants.length === 0 && <option value="">Sem instancias</option>}
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
                {(tenantLoading || switchingTenant) && (
                  <RefreshCw size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted animate-spin" />
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white/3">
            <div
              className={`w-7 h-7 rounded-lg ${activeModule.theme.bgLight} flex items-center justify-center text-xs font-bold ${activeModule.theme.text} flex-shrink-0`}
            >
              {(profile?.full_name || profile?.email || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-text truncate">
                {profile?.full_name || profile?.email || 'Usuario'}
              </p>
              <p className="text-[10px] text-muted truncate">
                {isAdminGlobal ? (
                  <span className="flex items-center gap-1">
                    <Star size={10} className="fill-amber-400 text-amber-400" /> Admin Global
                  </span>
                ) : (
                  activeModule.roles?.find((r) => r.id === userModuleRole)?.label || 'Acesso Restrito'
                )}
              </p>
            </div>
            <button onClick={onLogout} className="text-muted hover:text-red-400 transition-colors" title="Sair">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
