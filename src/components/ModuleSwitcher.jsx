import React, { useState, useRef, useEffect } from 'react'
import { ChevronRight, Check } from 'lucide-react'
import { MODULES } from '../config/modules'
import { useNavigate } from 'react-router-dom'
import { useAuthCtx } from '../context/AuthContext'

export function ModuleSwitcher({ activeModule, setActiveModuleId, profile, storeSettings }) {
  const [openDrop, setOpenDrop] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const { tenantEnabledModules = [] } = useAuthCtx()

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpenDrop(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isAdmin = profile?.role === 'admin'
  const allowed = profile?.allowed_modules || []
  const tenantModules = tenantEnabledModules.length > 0 ? tenantEnabledModules : ['petshop']
  
  const modulesList = Object.values(MODULES).filter(m => {
    if (m.id === 'system') return isAdmin
    if (!tenantModules.includes(m.id)) return false
    if (isAdmin) return true
    if (allowed.length === 0) return m.id === 'petshop'
    return allowed.includes(m.id)
  })

  const hasMultiple = modulesList.length > 1 || isAdmin
  const Icon = activeModule.icon

  return (
    <div className="relative" ref={ref}>
      <button 
        disabled={!hasMultiple}
        onClick={() => setOpenDrop(!openDrop)}
        className={`flex items-center gap-2.5 w-full text-left bg-black/20 rounded-xl p-2 transition-colors border border-[var(--border2)] ${hasMultiple ? 'hover:bg-black/40' : 'cursor-default opacity-80'}`}
      >
        <div className={`w-8 h-8 rounded-xl ${activeModule.theme.primaryBg} flex items-center justify-center ${activeModule.theme.shadow} flex-shrink-0 text-gray-950`}>
           <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-sm text-text leading-none truncate">
            {activeModule.id === 'system' ? 'Gestão Central' : (storeSettings?.store_name || activeModule.name)}
          </p>
          <p className="text-[10px] text-muted mt-0.5 truncate uppercase tracking-wider font-bold">
            {hasMultiple ? 'Trocar Módulo' : 'Aplicativo Ativo'}
          </p>
        </div>
        {hasMultiple && <ChevronRight size={14} className={`text-muted transition-transform ${openDrop ? 'rotate-90' : ''}`} />}
      </button>

      {openDrop && (
        <div className="absolute top-full left-0 w-full mt-2 bg-[var(--surface)] border border-[var(--border2)] rounded-xl shadow-lg z-50 overflow-hidden py-1">
          {modulesList.map((m) => {
            const isSelected = m.id === activeModule.id
            const ModIcon = m.icon
            const defaultPage = (
              m.navSections?.[0]?.items?.[0]?.id
              || m.nav?.[0]?.id
              || 'dashboard'
            )
            return (
              <button
                key={m.id}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-white/5 transition-colors ${isSelected ? m.theme.textPrimary : 'text-text'}`}
                onClick={() => {
                  setActiveModuleId(m.id)
                  setOpenDrop(false)
                  navigate(`/${m.id}/${defaultPage}`)
                }}
              >
                <ModIcon size={16} className={isSelected ? m.theme.textPrimary : 'text-muted'} />
                <span className="flex-1 font-semibold">{m.name}</span>
                {isSelected && <Check size={14} className={m.theme.textPrimary} />}
              </button>
            )
          })}
          <div className="border-t border-[var(--border2)] mt-1 pt-1">
            <button
               className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-muted hover:bg-white/5 transition-colors"
               onClick={() => {
                 setActiveModuleId(null)
                 setOpenDrop(false)
                 navigate('/')
               }}
            >
               Voltar ao Hub Central
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
