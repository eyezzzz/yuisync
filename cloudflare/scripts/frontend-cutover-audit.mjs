import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
let output = ''
try {
  output = execFileSync('git', ['grep', '-n', '-E', "supabase\\.(from|rpc|auth)|lib/supabase", '--', 'src'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
} catch (error) {
  if (error?.status !== 1) throw error
}

const lines = output ? output.split('\n') : []
const infrastructureAllow = new Set([
  'src/lib/supabase.js',
  'src/lib/nextApi.js',
  'src/shared/hooks/useLegacyAuth.js',
])
const fileOf = (line) => line.split(':', 1)[0]
const isLegacyBoundary = (path) => /\/useLegacy[^/]*\.(js|jsx)$/.test(path) || path.endsWith('/LegacyAuthContext.jsx')
const candidates = lines.filter((line) => !infrastructureAllow.has(fileOf(line)))
const legacyBoundaryReferences = candidates.filter((line) => isLegacyBoundary(fileOf(line)))
const unmigratedReferences = candidates.filter((line) => !isLegacyBoundary(fileOf(line)))

const cutoverEntryPoints = [
  ['clients', 'src/shared/hooks/useClients.js'],
  ['products', 'src/shared/hooks/useProducts.js'],
  ['appointments', 'src/shared/hooks/useAppointments.js'],
  ['sales', 'src/shared/hooks/useSales.js'],
].map(([domain, path]) => {
  const content = readFileSync(resolve(repoRoot, path), 'utf8')
  return {
    domain,
    path,
    atomicBoundary: /nextDomainEnabled\(/.test(content),
    legacyFallback: /useLegacy/.test(content),
  }
})

console.log(JSON.stringify({
  directSupabaseReferences: candidates.length,
  legacyBoundaryReferences: legacyBoundaryReferences.length,
  unmigratedReferences: unmigratedReferences.length,
  cutoverEntryPoints,
  violations: unmigratedReferences,
}, null, 2))
if (process.argv.includes('--enforce') && unmigratedReferences.length) process.exit(1)
