import type { IncomingMessage, ServerResponse } from 'node:http'
import { adminSupabase } from '../server/lib/supabase.js'
import { isModuleAdmin, requireAuthenticatedProfile } from '../server/lib/auth.js'
import {
  getBearerToken,
  HttpError,
  readJsonBody,
  sendJson,
  validateUUID,
} from '../server/lib/http.js'
import { resolveWhatsappConfig } from '../server/lib/whatsapp.js'

type LooseRecord = Record<string, any>
type JsonBody = Record<string, unknown>

const DEFAULT_MODULE_ID = 'petshop'
const GRAPH_BASE_URL = 'https://graph.facebook.com'
const DEFAULT_GRAPH_VERSION = 'v25.0'

function clean(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  return ''
}

function digits(value: unknown): string {
  return clean(value).replace(/\D/g, '')
}

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as LooseRecord
    : {}
}

function graphVersion(value: unknown): string {
  return (clean(value) || clean(process.env.WHATSAPP_GRAPH_VERSION) || DEFAULT_GRAPH_VERSION)
    .replace(/^\/+/, '')
}

function normalizeAdAccountId(value: unknown): string {
  return clean(value).replace(/^act_/i, '').replace(/\D/g, '')
}

async function requireReviewAccess(req: IncomingMessage, tenantId: string, moduleId: string) {
  const accessToken = getBearerToken(req)
  const profile = await requireAuthenticatedProfile(accessToken)

  if (!isModuleAdmin(profile, moduleId)) {
    throw new HttpError(403, 'Only a module administrator can manage the Meta review workspace.')
  }

  if (profile.role !== 'admin' && profile.active_tenant_id !== tenantId) {
    throw new HttpError(403, 'Select the business that owns these Meta assets before continuing.')
  }
}

async function loadWhatsappBusinessAccountId(tenantId: string, moduleId: string) {
  const { data, error } = await adminSupabase
    .from('tenant_bot_channels')
    .select('whatsapp_business_account_id')
    .eq('tenant_id', tenantId)
    .eq('module_id', moduleId)
    .eq('channel', 'whatsapp')
    .maybeSingle()

  if (error) {
    throw new HttpError(500, `Unable to load the WhatsApp Business Account ID: ${error.message}`)
  }

  return clean(data?.whatsapp_business_account_id) || clean(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID)
}

async function graphRequest(config: LooseRecord, path: string) {
  const accessToken = clean(config.accessToken)
  if (!accessToken) {
    throw new HttpError(409, 'A system-user access token is not configured for this business.')
  }

  const response = await fetch(
    `${GRAPH_BASE_URL}/${graphVersion(config.graphVersion)}/${path.replace(/^\/+/, '')}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    },
  )

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const graphError = asRecord(payload.error)
    const detail = clean(graphError.message) || `Graph API HTTP ${response.status}`
    const code = graphError.code ? ` (code ${graphError.code})` : ''
    throw new HttpError(502, `${detail}${code}`)
  }

  return payload as LooseRecord
}

async function resolveBusinessPortfolio(
  config: LooseRecord,
  tenantId: string,
  moduleId: string,
  requestedBusinessId: string,
) {
  const explicitBusinessId = digits(requestedBusinessId) || digits(process.env.META_BUSINESS_ID)

  if (explicitBusinessId) {
    return {
      id: explicitBusinessId,
      name: clean(process.env.META_BUSINESS_NAME) || 'Connected Meta Business Portfolio',
      source: requestedBusinessId ? 'review_input' : 'environment',
    }
  }

  const wabaId = await loadWhatsappBusinessAccountId(tenantId, moduleId)
  if (!wabaId) {
    throw new HttpError(409, 'Enter the Meta Business Portfolio ID to load Ad Accounts.')
  }

  const payload = await graphRequest(
    config,
    `${encodeURIComponent(wabaId)}?fields=${encodeURIComponent('owner_business_info')}`,
  )
  const owner = asRecord(payload.owner_business_info)
  const id = digits(owner.id)

  if (!id) {
    throw new HttpError(409, 'Meta did not return the owner Business Portfolio. Enter its Business ID manually.')
  }

  return {
    id,
    name: clean(owner.name) || 'Connected Meta Business Portfolio',
    source: 'waba_owner',
  }
}

function normalizeAccounts(entries: unknown, relationship: 'owned' | 'client') {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const account = asRecord(entry)
      const accountId = normalizeAdAccountId(account.account_id || account.id)
      return {
        id: accountId ? `act_${accountId}` : clean(account.id),
        accountId,
        name: clean(account.name) || 'Unnamed Ad Account',
        relationship,
      }
    })
    .filter((account) => Boolean(account.id))
}

async function loadAccountsForBusiness(config: LooseRecord, businessId: string) {
  const fields = encodeURIComponent('id,name,account_id')
  const endpoints = [
    { relationship: 'owned' as const, path: `${encodeURIComponent(businessId)}/owned_ad_accounts?fields=${fields}&limit=100` },
    { relationship: 'client' as const, path: `${encodeURIComponent(businessId)}/client_ad_accounts?fields=${fields}&limit=100` },
  ]

  const accounts: LooseRecord[] = []
  const endpointErrors: string[] = []

  for (const endpoint of endpoints) {
    try {
      const payload = await graphRequest(config, endpoint.path)
      accounts.push(...normalizeAccounts(payload.data, endpoint.relationship))
    } catch (error) {
      endpointErrors.push(`${endpoint.relationship}: ${error instanceof Error ? error.message : 'Graph API error'}`)
    }
  }

  const deduped = new Map<string, LooseRecord>()
  accounts.forEach((account) => {
    const key = normalizeAdAccountId(account.id)
    if (key && !deduped.has(key)) deduped.set(key, account)
  })

  if (deduped.size === 0 && endpointErrors.length === endpoints.length) {
    throw new HttpError(
      502,
      `The system-user token could not read Ad Accounts for Business ${businessId}. Confirm the Business Portfolio ID, include business_management when generating the token, and assign the relevant business/ad account assets to the system user. Meta responses: ${endpointErrors.join(' | ')}`,
    )
  }

  return {
    adAccounts: [...deduped.values()],
    endpointErrors,
  }
}

async function loadBusinessAssets(
  tenantId: string,
  moduleId: string,
  requestedBusinessId: string,
) {
  const config = await resolveWhatsappConfig({
    tenantId,
    moduleId,
    requireMessaging: false,
  })

  const businessPortfolio = await resolveBusinessPortfolio(
    config,
    tenantId,
    moduleId,
    requestedBusinessId,
  )
  const { adAccounts, endpointErrors } = await loadAccountsForBusiness(config, businessPortfolio.id)

  return {
    businessPortfolio,
    adAccounts,
    endpointErrors,
  }
}

function handleError(res: ServerResponse, error: unknown) {
  const status = error instanceof HttpError ? error.status : 500
  const message = error instanceof Error ? error.message : 'Unable to process the Meta business review request.'
  if (status >= 500) console.error('[meta-business-review]', error)
  sendJson(res, status, { error: message })
}

export async function handleMetaBusinessReviewApi(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`)

    if (req.method === 'GET') {
      const tenantId = clean(url.searchParams.get('tenant_id'))
      const moduleId = clean(url.searchParams.get('module_id')) || DEFAULT_MODULE_ID
      const businessId = digits(url.searchParams.get('business_id'))

      validateUUID(tenantId, 'tenantId')
      await requireReviewAccess(req, tenantId, moduleId)

      try {
        const assets = await loadBusinessAssets(tenantId, moduleId, businessId)
        sendJson(res, 200, {
          ...assets,
          requestedBusinessId: businessId,
          needsBusinessId: false,
        })
      } catch (error) {
        if (!businessId) {
          sendJson(res, 200, {
            businessPortfolio: null,
            adAccounts: [],
            endpointErrors: [],
            requestedBusinessId: '',
            needsBusinessId: true,
            autoResolveError: error instanceof Error ? error.message : 'Automatic Business Portfolio lookup failed.',
          })
          return
        }
        throw error
      }
      return
    }

    if (req.method !== 'POST') {
      throw new HttpError(405, 'Method not allowed.')
    }

    const body = await readJsonBody(req) as JsonBody
    const tenantId = clean(body.tenantId)
    const moduleId = clean(body.moduleId) || DEFAULT_MODULE_ID
    const businessId = digits(body.businessId)
    const adAccountId = normalizeAdAccountId(body.adAccountId)

    validateUUID(tenantId, 'tenantId')
    await requireReviewAccess(req, tenantId, moduleId)

    if (!businessId) throw new HttpError(400, 'Business Portfolio ID is required for verification.')
    if (!adAccountId) throw new HttpError(400, 'Select an Ad Account before verification.')

    const assets = await loadBusinessAssets(tenantId, moduleId, businessId)
    const adAccount = assets.adAccounts.find(
      (account) => normalizeAdAccountId(account.id) === adAccountId,
    )

    if (!adAccount) {
      throw new HttpError(404, 'The selected Ad Account is no longer present in this Business Portfolio.')
    }

    sendJson(res, 200, {
      ok: true,
      result: {
        businessPortfolio: assets.businessPortfolio,
        adAccount,
        graphEndpoint: adAccount.relationship === 'client'
          ? `/${assets.businessPortfolio.id}/client_ad_accounts`
          : `/${assets.businessPortfolio.id}/owned_ad_accounts`,
        verifiedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    handleError(res, error)
  }
}
