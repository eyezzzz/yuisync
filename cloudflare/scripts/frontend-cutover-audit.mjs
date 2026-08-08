import { execFileSync } from 'node:child_process'
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
const allow = new Set([
  'src/lib/supabase.js',
  'src/lib/nextApi.js',
  'src/shared/hooks/useLegacyAuth.js',
])
const violations = lines.filter((line) => !allow.has(line.split(':', 1)[0]))
console.log(JSON.stringify({ directSupabaseReferences: violations.length, violations }, null, 2))
if (process.argv.includes('--enforce') && violations.length) process.exit(1)
