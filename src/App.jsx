import React from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ModuleProvider } from './context/ModuleContext'
import { PerformanceProvider } from './context/PerformanceContext'
import { MODULES } from './config/modules'
import { AppRouter } from './router/AppRouter'

export default function App() {
  return (
    <BrowserRouter>
      <PerformanceProvider>
        <ModuleProvider modules={MODULES}>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </ModuleProvider>
      </PerformanceProvider>
    </BrowserRouter>
  )
}
