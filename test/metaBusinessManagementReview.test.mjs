import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const routeSource = fs.readFileSync('serverless/metaBusinessReviewApi.ts', 'utf8')
const respondSource = fs.readFileSync('api/chat/respond.ts', 'utf8')
const componentSource = fs.readFileSync('src/shared/components/MetaBusinessManagementReview.jsx', 'utf8')
const clientSource = fs.readFileSync('src/lib/metaBusinessReviewApi.js', 'utf8')

test('business review accepts an explicit Business Portfolio ID', () => {
  assert.match(routeSource, /requestedBusinessId/)
  assert.match(routeSource, /META_BUSINESS_ID/)
  assert.match(componentSource, /Meta Business Portfolio ID/)
  assert.match(componentSource, /Load this Business/)
})

test('business review lists owned and shared ad accounts', () => {
  assert.match(routeSource, /owned_ad_accounts/)
  assert.match(routeSource, /client_ad_accounts/)
  assert.match(componentSource, /Owned \+ shared Ad Accounts/)
})

test('verification keeps the selected account identity explicit', () => {
  assert.match(componentSource, /Selected Ad Account/)
  assert.match(componentSource, /Same account confirmed by Meta/)
  assert.match(componentSource, /Verify selected account through Graph API/)
  assert.match(clientSource, /adAccountId/)
  assert.match(clientSource, /businessId/)
})

test('review endpoint keeps the Meta system-user token server-side', () => {
  assert.match(routeSource, /resolveWhatsappConfig/)
  assert.match(routeSource, /Authorization: `Bearer \$\{accessToken\}`/)
  assert.doesNotMatch(componentSource, /accessToken/)
})

test('business review reuses the existing Vercel chat function', () => {
  assert.match(respondSource, /integration === 'meta-business-review'/)
  assert.match(respondSource, /handleMetaBusinessReviewApi/)
  assert.match(clientSource, /chat\/respond\?integration=meta-business-review/)
  assert.equal(fs.existsSync('api/meta-business-review.ts'), false)
})
