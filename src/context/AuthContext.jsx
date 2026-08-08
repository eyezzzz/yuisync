import { useContext } from 'react'
import { AuthContext, AuthProvider as LegacyAuthProvider } from './LegacyAuthContext'
import { NextAuthProvider } from './NextAuthContext'

const NEXT_AUTH_ENABLED = String(import.meta.env.VITE_NEXT_AUTH_ENABLED || '').toLowerCase() === 'true'
const SelectedProvider = NEXT_AUTH_ENABLED ? NextAuthProvider : LegacyAuthProvider

export { AuthContext }

export function AuthProvider({ children }) {
  return <SelectedProvider>{children}</SelectedProvider>
}

export function useAuthCtx() {
  const context = useContext(AuthContext)
  if (context == null) throw new Error('useAuthCtx must be used within an AuthProvider')
  return context
}
