import { useAuth as useLegacyAuth } from './useLegacyAuth'
import { useNextAuth } from './useNextAuth'

const useSelectedAuth = String(import.meta.env.VITE_NEXT_AUTH_ENABLED || '').toLowerCase() === 'true'
  ? useNextAuth
  : useLegacyAuth

export function useAuth() {
  return useSelectedAuth()
}
