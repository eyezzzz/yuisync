import { randomUUID } from 'node:crypto'
import { HttpError } from './http.js'
import { respondToChatMessage } from './chat.js'

const DEFAULT_QUIET_WINDOW_MS = 900
const DEFAULT_POLL_INTERVAL_MS = 200
const DEFAULT_WAIT_BUDGET_MS = 90000
const DEFAULT_LEASE_SECONDS = 110

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function dashboardChatRuntimeConfig() {
  return {
    quietWindowMs: boundedNumber(
      process.env.DASHBOARD_CHAT_QUIET_WINDOW_MS,
      DEFAULT_QUIET_WINDOW_MS,
      250,
      3000,
    ),
    pollIntervalMs: boundedNumber(
      process.env.DASHBOARD_CHAT_POLL_INTERVAL_MS,
      DEFAULT_POLL_INTERVAL_MS,
      100,
      1000,
    ),
    waitBudgetMs: boundedNumber(
      process.env.DASHBOARD_CHAT_WAIT_BUDGET_MS,
      DEFAULT_WAIT_BUDGET_MS,
      5000,
      100000,
    ),
    leaseSeconds: boundedNumber(
      process.env.DASHBOARD_CHAT_LEASE_SECONDS,
      DEFAULT_LEASE_SECONDS,
      15,
      110,
    ),
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}

/**
 * @param {{message?: unknown, clientMessageId?: unknown, userMessages?: unknown[]}} [input]
 * @returns {Array<{id: string, content: string}>}
 */
export function normalizeDashboardChatEntries({ message, clientMessageId, userMessages } = {}) {
  const normalizeBatch = (batch) => batch
    .map((entry) => {
      const content = typeof entry?.content === 'string' ? entry.content.trim() : ''
      if (!content) return null

      const rawId = String(entry?.client_message_id || entry?.id || '').trim()
      return {
        id: isUuid(rawId) ? rawId : randomUUID(),
        content,
      }
    })
    .filter(Boolean)
    .slice(0, 10)

  let normalized = Array.isArray(userMessages)
    ? normalizeBatch(userMessages)
    : []

  if (!normalized.length) {
    normalized = normalizeBatch([{ content: message, client_message_id: clientMessageId }])
  }

  if (!normalized.length) {
    throw new HttpError(400, 'message e obrigatoria.')
  }

  return normalized
}

function databaseCoordinationError(error, operation) {
  const message = String(error?.message || '')
  const missingMigration = /dashboard_(message|processed|processing|turn)_version|ingest_dashboard_chat_message|acquire_dashboard_chat_turn/i.test(message)
  if (missingMigration) {
    return new HttpError(503, 'A migration de ingestao serverless do chat ainda nao foi aplicada.')
  }
  return new HttpError(500, `Falha ao ${operation} no chat: ${message || 'erro desconhecido'}.`)
}

async function ingestDashboardMessage(supabase, sessionId, entry, source) {
  const { data, error } = await supabase.rpc('ingest_dashboard_chat_message', {
    p_session_id: sessionId,
    p_message_id: entry.id,
    p_content: entry.content,
    p_source: source,
  })

  if (error) throw databaseCoordinationError(error, 'registrar a mensagem')
  if (!data?.message || !Number(data?.turn_version)) {
    throw new HttpError(500, 'A ingestao serverless nao retornou a mensagem persistida.')
  }

  return data
}

async function loadDashboardTurnState(supabase, sessionId) {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, dashboard_message_version, dashboard_processed_version, dashboard_processing_token, dashboard_processing_until')
    .eq('id', sessionId)
    .maybeSingle()

  if (error) throw databaseCoordinationError(error, 'carregar a coordenacao')
  if (!data) throw new HttpError(404, 'Chat nao encontrado.')

  return {
    messageVersion: Number(data.dashboard_message_version || 0),
    processedVersion: Number(data.dashboard_processed_version || 0),
    processingToken: data.dashboard_processing_token || null,
    processingUntil: data.dashboard_processing_until || null,
  }
}

async function loadLatestDashboardMessage(supabase, sessionId) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, sent_at, dashboard_turn_version')
    .eq('session_id', sessionId)
    .not('dashboard_turn_version', 'is', null)
    .order('dashboard_turn_version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw databaseCoordinationError(error, 'consultar a ultima mensagem')
  return data || null
}

async function waitForQuietDashboardWindow(supabase, sessionId, quietWindowMs, deadline) {
  while (Date.now() < deadline) {
    const latest = await loadLatestDashboardMessage(supabase, sessionId)
    if (!latest?.sent_at) return

    const sentAt = new Date(latest.sent_at).getTime()
    if (!Number.isFinite(sentAt)) return

    const remaining = quietWindowMs - Math.max(0, Date.now() - sentAt)
    if (remaining <= 0) return
    await sleep(Math.min(remaining, Math.max(0, deadline - Date.now())))
  }
}

async function acquireDashboardTurn(supabase, sessionId, expectedVersion, token, leaseSeconds) {
  const { data, error } = await supabase.rpc('acquire_dashboard_chat_turn', {
    p_session_id: sessionId,
    p_expected_version: expectedVersion,
    p_processing_token: token,
    p_lease_seconds: leaseSeconds,
  })

  if (error) throw databaseCoordinationError(error, 'adquirir o processamento')
  return data || { acquired: false }
}

async function completeDashboardTurn(supabase, sessionId, token, processedVersion) {
  const { data, error } = await supabase.rpc('complete_dashboard_chat_turn', {
    p_session_id: sessionId,
    p_processing_token: token,
    p_processed_version: processedVersion,
  })

  if (error) throw databaseCoordinationError(error, 'concluir o processamento')
  return data || { completed: false }
}

async function releaseDashboardTurn(supabase, sessionId, token) {
  const { error } = await supabase.rpc('release_dashboard_chat_turn', {
    p_session_id: sessionId,
    p_processing_token: token,
  })

  if (error) {
    console.error('[dashboard-chat] failed to release processing lease', error)
  }
}

async function loadDashboardTurnMessages(supabase, sessionId, afterVersion, throughVersion) {
  let query = supabase
    .from('chat_messages')
    .select('id, role, content, metadata, tokens_used, sent_at, dashboard_turn_version')
    .eq('session_id', sessionId)
    .eq('role', 'user')
    .gt('dashboard_turn_version', afterVersion)
    .lte('dashboard_turn_version', throughVersion)
    .order('dashboard_turn_version', { ascending: true })

  const { data, error } = await query
  if (error) throw databaseCoordinationError(error, 'carregar as mensagens pendentes')
  return data || []
}

function isStaleTurnError(error) {
  return error?.status === 409 && (
    error?.code === 'PETBOT_STALE_TURN'
    || /newer customer message superseded/i.test(String(error?.message || ''))
  )
}

/**
 * @param {{
 *   supabase: any,
 *   sessionId: string,
 *   entries: Array<{id: string, content: string}>,
 *   source?: string,
 *   runtime?: Record<string, number>,
 * }} input
 * @returns {Promise<any>}
 */
export async function ingestAndRespondToDashboardChat({
  supabase,
  sessionId,
  entries,
  source = 'dashboard_simulation',
  runtime = {},
} = {}) {
  if (!supabase) throw new HttpError(500, 'Cliente de banco indisponivel para o chat.')
  if (!isUuid(sessionId)) throw new HttpError(400, 'sessionId invalido.')

  const normalizedEntries = normalizeDashboardChatEntries({ userMessages: entries })
  const ingested = []
  for (const entry of normalizedEntries) {
    ingested.push(await ingestDashboardMessage(supabase, sessionId, entry, source))
  }

  const savedUserMessages = ingested.map((item) => item.message)
  const requestedVersion = Math.max(...ingested.map((item) => Number(item.turn_version || 0)))
  const config = { ...dashboardChatRuntimeConfig(), ...runtime }
  const deadline = Date.now() + config.waitBudgetMs
  let lastReply = null

  while (Date.now() < deadline) {
    let state = await loadDashboardTurnState(supabase, sessionId)
    if (state.processedVersion >= requestedVersion) {
      return {
        ok: true,
        status: lastReply ? 'replied' : 'processed_by_another_invocation',
        savedUserMessages,
        ...(lastReply || {}),
      }
    }

    await waitForQuietDashboardWindow(supabase, sessionId, config.quietWindowMs, deadline)
    state = await loadDashboardTurnState(supabase, sessionId)

    if (state.processedVersion >= requestedVersion) {
      return {
        ok: true,
        status: lastReply ? 'replied' : 'processed_by_another_invocation',
        savedUserMessages,
        ...(lastReply || {}),
      }
    }

    const targetVersion = state.messageVersion
    const token = randomUUID()
    const lease = await acquireDashboardTurn(
      supabase,
      sessionId,
      targetVersion,
      token,
      config.leaseSeconds,
    )

    if (!lease.acquired) {
      await sleep(Math.min(config.pollIntervalMs, Math.max(0, deadline - Date.now())))
      continue
    }

    const processedVersion = Number(lease.processed_version || 0)
    const turnVersion = Number(lease.turn_version || targetVersion)

    try {
      const turnMessages = await loadDashboardTurnMessages(
        supabase,
        sessionId,
        processedVersion,
        turnVersion,
      )

      if (!turnMessages.length) {
        const completion = await completeDashboardTurn(supabase, sessionId, token, turnVersion)
        if (Number(completion.turn_version || 0) > Number(completion.processed_version || 0)) continue
        return {
          ok: true,
          status: 'no_pending_messages',
          savedUserMessages,
          ...(lastReply || {}),
        }
      }

      const combinedMessage = turnMessages
        .map((message) => String(message.content || '').trim())
        .filter(Boolean)
        .join('\n')

      const response = await respondToChatMessage(supabase, sessionId, combinedMessage, {
        skipUserPersistence: true,
        source,
        userMessages: turnMessages.map((message) => ({
          client_message_id: message.id,
          content: message.content,
          sent_at: message.sent_at,
        })),
        assistantMetadata: {
          dashboard_turn_version: turnVersion,
          server_serialized: true,
        },
      })

      lastReply = response
      const completion = await completeDashboardTurn(supabase, sessionId, token, turnVersion)
      if (Number(completion.turn_version || 0) > Number(completion.processed_version || 0)) {
        continue
      }

      return {
        ok: true,
        status: 'replied',
        savedUserMessages,
        ...response,
      }
    } catch (error) {
      await releaseDashboardTurn(supabase, sessionId, token)
      if (isStaleTurnError(error)) {
        await sleep(Math.min(config.pollIntervalMs, Math.max(0, deadline - Date.now())))
        continue
      }
      throw error
    }
  }

  return {
    ok: true,
    status: 'queued',
    queued: true,
    savedUserMessages,
    ...(lastReply || {}),
  }
}
