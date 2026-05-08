import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

function YuiLogo({ size = 40, className = "" }) {
  return (
    <svg width={size} height={size*0.4} viewBox="0 0 100 40" fill="none" className={`relative overflow-visible ${className}`}>
      <circle cx="80" cy="20" r="16" fill="currentColor" className="opacity-10 animate-glow-soft" />
      <path d="M5 20 H80" stroke="currentColor" strokeWidth="6" strokeLinecap="round" className="opacity-20" />
      <path d="M5 20 H80" stroke="currentColor" strokeWidth="6" strokeLinecap="round" className="animate-neon-breath" />
      <circle cx="80" cy="20" r="8" stroke="currentColor" strokeWidth="2" fill="transparent" className="animate-pulse opacity-40 shadow-[0_0_15px_currentColor]" />
      <circle cx="80" cy="20" r="3" fill="white" className="animate-pulse shadow-[0_0_20px_white]" />
    </svg>
  )
}

export function LoadingScreen() {
  useEffect(() => {
    document.body.classList.add('app-loading')
    document.body.setAttribute('aria-busy', 'true')

    return () => {
      document.body.classList.remove('app-loading')
      document.body.removeAttribute('aria-busy')
    }
  }, [])

  return createPortal(
    <div
      className="yui-loading-portal fixed inset-0 z-[9999] flex min-h-screen items-center justify-center overflow-hidden bg-[#1A1A1A]"
      role="status"
      aria-live="polite"
      aria-label="Carregando aplicacao"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(74,144,226,0.08),transparent_70%)]" />
      <div className="flex flex-col items-center gap-6 relative z-10 animate-in fade-in zoom-in-95 duration-700">
        <div className="relative">
           <YuiLogo size={120} className="text-[#4A90E2] animate-sync" />
           <div className="absolute -inset-4 bg-blue-500/10 blur-2xl rounded-full" />
        </div>
        <div className="flex flex-col items-center">
          <h1 className="text-white font-display font-medium text-2xl tracking-[0.25em] uppercase">YUI Sync</h1>
          <div className="flex items-center gap-2 mt-4">
             <div className="w-1 h-1 bg-blue-500 rounded-full animate-ping" />
             <p className="text-[#555555] text-[10px] font-bold uppercase tracking-[0.4em]">Carregando...</p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
