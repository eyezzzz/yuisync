import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { useAuthCtx } from '../context/AuthContext'
import { useModuleCtx } from '../context/ModuleContext'
import LoginPage from '../shared/pages/LoginPage'
import LauncherPage from '../shared/pages/LauncherPage'
import PublicHomePage from '../public/pages/PublicHomePage'
import PublicSalesPage from '../public/pages/PublicSalesPage'
import PublicCheckoutPage from '../public/pages/PublicCheckoutPage'
import PublicBookingPage from '../public/pages/PublicBookingPage'
import PublicClientPortalPage from '../public/pages/PublicClientPortalPage'
import DashboardPage from '../modules/petshop/pages/DashboardPage'
import StarField from '../shared/components/StarField'
import { LoadingScreen } from '../components/LoadingScreen'
import { Sidebar } from '../components/Sidebar'
import { SupportWidget } from '../components/SupportWidget'
import { SystemSupportPriorityAlert } from '../components/SystemSupportPriorityAlert'

function getModuleNavItems(activeModule) {
  if (!activeModule) return []
  if (Array.isArray(activeModule.navSections) && activeModule.navSections.length > 0) {
    return activeModule.navSections.flatMap((section) => section?.items || [])
  }
  return [
    ...(activeModule.nav || []),
    ...(activeModule.adminNav || []),
  ]
}

function getAccessiblePages(activeModule, profile) {
  if (!activeModule) return []
  const allItems = getModuleNavItems(activeModule)
  const isGlobalAdmin = profile?.role === 'admin'
  const currentRole = (profile?.module_permissions || {})[activeModule.id]

  const visibleItems = isGlobalAdmin
    ? allItems
    : allItems.filter((item) => !item.roles || item.roles.includes(currentRole))

  const pageIds = visibleItems.map((item) => item.id)
  const dashboardItem = allItems.find((item) => item.id === 'dashboard')
  const canAccessDashboard = isGlobalAdmin || !dashboardItem?.roles || dashboardItem.roles.includes(currentRole)
  if (canAccessDashboard && !pageIds.includes('dashboard') && activeModule.pages?.dashboard) {
    pageIds.unshift('dashboard')
  }
  return [...new Set(pageIds)].filter((pageId) => activeModule.pages?.[pageId])
}

function AppLayout() {
  const { activeModule, activeModuleId, setActiveModuleId } = useModuleCtx()
  const { profile, signOut, storeSettings, tenantEnabledModules = [] } = useAuthCtx()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    // Determine active module based on URL instead of manually tracking strings
    const pathParts = location.pathname.split('/').filter(Boolean)
    if (pathParts.length > 0) {
      if (activeModuleId !== pathParts[0]) {
        setActiveModuleId(pathParts[0])
      }
    } else {
      if (activeModuleId !== null) {
         setActiveModuleId(null)
      }
    }
  }, [location.pathname])

  if (!activeModule) return <LauncherPage />

  // Security Lock
  const isAdmin = profile?.role === 'admin'
  let allowed = profile?.allowed_modules || []
  if (allowed.length === 0) allowed = ['petshop'] // legacy fallback
  const tenantModules = tenantEnabledModules.length > 0 ? tenantEnabledModules : ['petshop']
  const isTenantModuleEnabled = activeModuleId === 'system' || tenantModules.includes(activeModuleId)

  if (!isTenantModuleEnabled) {
    return <Navigate to="/" replace />
  }

  if (!isAdmin && !allowed.includes(activeModuleId)) {
    return <Navigate to="/" replace />
  }

  const currentPath = location.pathname.split('/')[2] || 'dashboard'
  const accessiblePages = getAccessiblePages(activeModule, profile)
  if (accessiblePages.length === 0) {
    return <Navigate to="/" replace />
  }
  const fallbackPage = accessiblePages[0] || 'dashboard'
  const hasPageAccess = accessiblePages.includes(currentPath)

  if (!hasPageAccess) {
    return <Navigate to={`/${activeModuleId}/${fallbackPage}`} replace />
  }

  const PageComponent = activeModule.pages[currentPath] || activeModule.pages[fallbackPage] || DashboardPage
  
  const setPage = (pageName) => navigate(`/${activeModuleId}/${pageName}`)

  return (
    <div className={`flex h-screen bg-bg overflow-hidden font-body theme-${activeModuleId} relative`}>
      {activeModuleId !== 'petshop' && <StarField count={80} className="text-emerald-500" />}
      <Sidebar
        profile={profile}
        onLogout={signOut}
        open={open} setOpen={setOpen}
        storeSettings={storeSettings}
        activeModule={activeModule}
        setActiveModuleId={setActiveModuleId}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 z-10">
        <header className="lg:hidden flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border2)] bg-surface flex-shrink-0">
          <button onClick={() => setOpen(true)} className="text-muted hover:text-text">
            <Menu size={19} />
          </button>
          <span className="font-display font-bold text-sm text-text">
            {storeSettings?.store_name || activeModule.name}
          </span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <PageComponent setPage={setPage} />
        </main>
      </div>
      {activeModuleId === 'system' && <SystemSupportPriorityAlert />}
      {activeModuleId !== 'system' && <SupportWidget />}
    </div>
  )
}

export function AppRouter() {
  const { session, loading } = useAuthCtx()

  if (loading) return <LoadingScreen />

  if (!session) {
    return (
      <Routes>
        <Route path="/loading" element={<LoadingScreen />} />
        <Route path="/" element={<PublicHomePage />} />
        <Route path="/site" element={<PublicHomePage />} />
        <Route path="/vendas" element={<PublicSalesPage />} />
        <Route path="/vendas/contratar" element={<PublicCheckoutPage />} />
        <Route path="/agendar/:slug" element={<PublicBookingPage />} />
        <Route path="/portal/:token" element={<PublicClientPortalPage />} />
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/:moduleId/*" element={<Navigate to="/entrar" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/loading" element={<LoadingScreen />} />
      <Route path="/" element={<LauncherPage />} />
      <Route path="/site" element={<PublicHomePage isAuthenticated />} />
      <Route path="/vendas" element={<PublicSalesPage isAuthenticated />} />
      <Route path="/vendas/contratar" element={<PublicCheckoutPage isAuthenticated />} />
      <Route path="/agendar/:slug" element={<PublicBookingPage />} />
      <Route path="/portal/:token" element={<PublicClientPortalPage />} />
      <Route path="/entrar" element={<Navigate to="/" replace />} />
      <Route path="/:moduleId/*" element={<AppLayout />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
