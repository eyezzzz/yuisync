import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const ModuleContext = createContext()

export function ModuleProvider({ children, modules }) {
  const location = useLocation()
  const navigate = useNavigate()
  
  const getModuleFromPath = () => {
    const parts = location.pathname.split('/').filter(Boolean)
    return parts[0] || null
  }

  const [activeModuleId, setActiveModuleIdState] = useState(getModuleFromPath())

  // Sincroniza estado -> App
  useEffect(() => {
    const mid = getModuleFromPath()
    if (mid !== activeModuleId) {
       setActiveModuleIdState(mid)
    }
  }, [location.pathname])

  const setActiveModuleId = (mid) => {
    setActiveModuleIdState(mid)
  }

  const activeModule = activeModuleId ? modules[activeModuleId] : null

  const value = useMemo(() => ({
    activeModuleId,
    setActiveModuleId,
    activeModule
  }), [activeModuleId, activeModule])

  return (
    <ModuleContext.Provider value={value}>
      {children}
    </ModuleContext.Provider>
  )
}

export function useModuleCtx() {
  return useContext(ModuleContext)
}
