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
const rollbackBookmark = required('YUISYNC_ROLLBACK_BOOKMARK')
const authRollbackBookmark = required('YUISYNC_AUTH_ROLLBACK_BOOKMARK')

for (let attempt = 0; attempt < 6; attempt += 1) {
  const response = await fetch(`${stagingUrl}/admin/staging/certify`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-yuisync-certification-token': certificationToken,
    },
    body: JSON.stringify({ tenantId, moduleId, gitSha, rollbackBookmark, authRollbackBookmark }),
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
