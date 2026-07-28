import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = '@yuisync-performance-mode'
const VALID_MODES = new Set(['fluid', 'full'])

const PerformanceContext = createContext(null)

function readStoredMode() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return VALID_MODES.has(stored) ? stored : 'fluid'
  } catch {
    return 'fluid'
  }
}

function optimizeAuthenticatedMedia(root = document) {
  const images = root.querySelectorAll?.('.page img:not([loading])') || []
  for (const image of images) {
    image.loading = 'lazy'
    image.decoding = 'async'
  }
}

export function PerformanceProvider({ children }) {
  const [performanceMode, setPerformanceModeState] = useState(readStoredMode)

  const setPerformanceMode = useCallback((nextMode) => {
    setPerformanceModeState(VALID_MODES.has(nextMode) ? nextMode : 'fluid')
  }, [])

  const togglePerformanceMode = useCallback(() => {
    setPerformanceModeState((current) => current === 'fluid' ? 'full' : 'fluid')
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.yuisyncPerformance = performanceMode
    root.classList.toggle('yuisync-performance-fluid', performanceMode === 'fluid')
    root.classList.toggle('yuisync-performance-full', performanceMode === 'full')

    try {
      localStorage.setItem(STORAGE_KEY, performanceMode)
    } catch {
      // Preferencia local opcional; a interface continua funcionando sem storage.
    }

    window.dispatchEvent(new CustomEvent('yuisync:performance-mode', {
      detail: { mode: performanceMode },
    }))
  }, [performanceMode])

  useEffect(() => {
    const syncVisibility = () => {
      document.documentElement.classList.toggle('yuisync-page-hidden', document.hidden)
    }

    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)
    return () => document.removeEventListener('visibilitychange', syncVisibility)
  }, [])

  useEffect(() => {
    if (performanceMode !== 'fluid') return undefined

    optimizeAuthenticatedMedia()
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) optimizeAuthenticatedMedia(node)
        }
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [performanceMode])

  const value = useMemo(() => ({
    performanceMode,
    isFluidMode: performanceMode === 'fluid',
    setPerformanceMode,
    togglePerformanceMode,
  }), [performanceMode, setPerformanceMode, togglePerformanceMode])

  return (
    <PerformanceContext.Provider value={value}>
      {children}
    </PerformanceContext.Provider>
  )
}

export function usePerformanceCtx() {
  const context = useContext(PerformanceContext)
  if (!context) throw new Error('usePerformanceCtx must be used within PerformanceProvider')
  return context
}
