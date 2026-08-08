import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const required = (name) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const stagingUrl = required('YUISYNC_STAGING_URL').replace(/\/$/, '')
const certificationToken = required('YUISYNC_STAGING_CERTIFICATION_TOKEN')
const gitSha = required('GIT_SHA')
const tenantId = required('YUISYNC_STAGING_TENANT_ID')
const moduleId = required('YUISYNC_STAGING_MODULE_ID')
const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const raw = execFileSync('npx', [
  'wrangler', 'd1', 'time-travel', 'info', 'DB', '--env', 'staging', '--json'
], { encoding: 'utf8', cwd })
const parsed = JSON.parse(raw)
const findBookmark = (value) => {
  if (!value) return null
  if (typeof value === 'object' && typeof value.bookmark === 'string') return value.bookmark
  if (Array.isArray(value)) return value.map(findBookmark).find(Boolean) || null
  if (typeof value === 'object') return Object.values(value).map(findBookmark).find(Boolean) || null
  return null
}
const rollbackBookmark = findBookmark(parsed)
if (!rollbackBookmark) throw new Error('Unable to resolve current D1 Time Travel bookmark')

for (let attempt = 0; attempt < 6; attempt += 1) {
  const response = await fetch(`${stagingUrl}/admin/staging/certify`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-yuisync-certification-token': certificationToken,
    },
    body: JSON.stringify({ tenantId, moduleId, gitSha, rollbackBookmark }),
  })
  const payload = await response.json()
  if (response.ok && payload.pass) {
    console.log(JSON.stringify(payload, null, 2))
    process.exit(0)
  }
  const queueOnlyPending = payload?.checks?.queue === false &&
    Object.entries(payload?.checks || {}).filter(([key]) => !['queue', 'details'].includes(key)).every(([, value]) => value === true)
  if (!queueOnlyPending) {
    console.error(JSON.stringify(payload, null, 2))
    process.exit(1)
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500))
}
throw new Error('Queue certification probe did not complete')
