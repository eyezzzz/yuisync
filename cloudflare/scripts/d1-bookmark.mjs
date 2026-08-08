import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const binding = String(process.argv[2] || '').trim()
if (!['DB', 'AUTH_DB'].includes(binding)) throw new Error('Usage: node scripts/d1-bookmark.mjs DB|AUTH_DB')

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const raw = execFileSync('npx', [
  'wrangler', 'd1', 'time-travel', 'info', binding, '--env', 'staging', '--json',
], { encoding: 'utf8', cwd })

const parsed = JSON.parse(raw)
const findBookmark = (value) => {
  if (!value) return null
  if (typeof value === 'object' && typeof value.bookmark === 'string') return value.bookmark
  if (Array.isArray(value)) return value.map(findBookmark).find(Boolean) || null
  if (typeof value === 'object') return Object.values(value).map(findBookmark).find(Boolean) || null
  return null
}

const bookmark = findBookmark(parsed)
if (!bookmark) throw new Error(`Unable to resolve current D1 Time Travel bookmark for ${binding}`)
process.stdout.write(bookmark)
