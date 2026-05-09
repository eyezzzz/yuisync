import { logger } from './logger.js'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function requireAnyEnv(...names) {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }

  throw new Error(`Missing required environment variable: ${names.join(' or ')}`)
}

function optionalEnv(name, defaultValue = '') {
  return process.env[name] || defaultValue
}

function parseNumber(name, fallback) {
  const raw = optionalEnv(name, String(fallback))
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production'
const allowedOrigins = parseOrigins(process.env.API_ALLOWED_ORIGINS || 'http://localhost:3080')

export const serverEnv = {
  isProduction,
  apiPort: parseNumber('API_PORT', 3090),
  allowedOrigins,
  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseAnonKey: requireAnyEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  openAiApiKey: requireEnv('OPENAI_API_KEY'),
  openAiModel: optionalEnv('OPENAI_MODEL', 'gpt-4o-mini'),
  openAiTimeoutMs: parseNumber('OPENAI_TIMEOUT_MS', 30000),
  focusNfeToken: optionalEnv('FOCUS_NFE_TOKEN'),
  focusNfeProdBaseUrl: optionalEnv('FOCUS_NFE_PROD_URL', 'https://api.focusnfe.com.br'),
  focusNfeHomologBaseUrl: optionalEnv('FOCUS_NFE_HOMOLOG_URL', 'https://homologacao.focusnfe.com.br'),
  focusNfeWebhookToken: optionalEnv('FOCUS_NFE_WEBHOOK_TOKEN'),
  focusNfeTimeoutMs: parseNumber('FOCUS_NFE_TIMEOUT_MS', 30000),
  whatsappPhoneNumberId: optionalEnv('WHATSAPP_PHONE_NUMBER_ID'),
  whatsappAccessToken: optionalEnv('WHATSAPP_ACCESS_TOKEN'),
  whatsappVerifyToken: optionalEnv('WHATSAPP_VERIFY_TOKEN'),
  whatsappAppSecret: optionalEnv('WHATSAPP_APP_SECRET'),
  whatsappGraphVersion: optionalEnv('WHATSAPP_GRAPH_VERSION', 'v25.0'),
  whatsappTenantId: optionalEnv('WHATSAPP_TENANT_ID'),
  whatsappModuleId: optionalEnv('WHATSAPP_MODULE_ID', 'petshop'),
}

if (serverEnv.supabaseAnonKey === serverEnv.supabaseServiceRoleKey) {
  logger.error('FATAL: SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are identical.', {
    hint: 'Use the public anon key in SUPABASE_ANON_KEY and keep service_role only on backend secrets.',
  })
  process.exit(1)
}

const viteAnon = optionalEnv('VITE_SUPABASE_ANON_KEY')
if (viteAnon && viteAnon === serverEnv.supabaseServiceRoleKey) {
  logger.error('FATAL: VITE_SUPABASE_ANON_KEY is using the service_role key.', {
    hint: 'Replace VITE_SUPABASE_ANON_KEY with the public anon key before shipping.',
  })
  if (isProduction) {
    process.exit(1)
  }
}

if (!serverEnv.focusNfeWebhookToken) {
  logger.warn('FOCUS_NFE_WEBHOOK_TOKEN is empty. Fiscal webhook endpoint will reject requests.')
}

if ((serverEnv.whatsappPhoneNumberId || serverEnv.whatsappAccessToken) && (!serverEnv.whatsappPhoneNumberId || !serverEnv.whatsappAccessToken)) {
  logger.warn('WhatsApp Cloud API fallback env is incomplete. Set both WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.')
}

if ((serverEnv.whatsappPhoneNumberId || serverEnv.whatsappAccessToken) && !serverEnv.whatsappVerifyToken) {
  logger.warn('WHATSAPP_VERIFY_TOKEN is empty. Meta webhook verification will require tenant_bot_channels configuration.')
}

if (isProduction && serverEnv.allowedOrigins.some((origin) => origin.includes('localhost'))) {
  logger.warn('API_ALLOWED_ORIGINS contains localhost while NODE_ENV=production.', {
    origins: serverEnv.allowedOrigins,
  })
}
