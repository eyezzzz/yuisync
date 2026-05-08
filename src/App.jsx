import React from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ModuleProvider } from './context/ModuleContext'
import { MODULES } from './config/modules'
import { AppRouter } from './router/AppRouter'

export default function App() {
  return (
    <BrowserRouter>
      <ModuleProvider modules={MODULES}>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </ModuleProvider>
    </BrowserRouter>
  )
}
