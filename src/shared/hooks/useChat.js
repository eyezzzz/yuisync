import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { requestChatReply, sendHumanChatMessage } from '../../lib/api'
import { useModuleCtx } from '../../context/ModuleContext'
import { useAuthCtx } from '../../context/AuthContext'
import { applyTenantFilter, buildTenantPayload, runWithTenantFallback } from '../../lib/tenant'

const DEFAULT_DASHBOARD_REPLY_DEBOUNCE_MS = 8000
const DASHBOARD_REPLY_DEBOUNCE_MS = (() => {
  const parsed = Number(import.meta.env.VITE_CHAT_REPLY_DEBOUNCE_MS)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DASHBOARD_REPLY_DEBOUNCE_MS
})()

function createPendingClientMessage(content) {
  const id = `temp-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    role: 'user',
    content,
    metadata: { pending: true, local_only: true, client_message_id: id },
    sent_at: new Date().toISOString(),
  }
}

function normalizeIncomingMessage(message) {
  return {
    ...message,
    sent_at: message.sent_at,
  }
}

function isMatchingPendingMessage(localMessage, incomingMessage) {
  if (!localMessage?.metadata?.local_only) return false
  if (localMessage.metadata.failed) return false
  if (localMessage.role !== incomingMessage.role) return false
  if (incomingMessage?.metadata?.client_message_id && localMessage.metadata.client_message_id === incomingMessage.metadata.client_message_id) {
    return true
  }
  if (String(localMessage.content || '') !== String(incomingMessage.content || '')) return false

  const localTime = new Date(localMessage.sent_at || 0).getTime()
  const incomingTime = new Date(incomingMessage.sent_at || 0).getTime()
  if (!Number.isFinite(localTime) || !Number.isFinite(incomingTime)) return true

  return Math.abs(incomingTime - localTime) < 120000
}

function mergeIncomingMessage(previousMessages, message) {
  const incomingMessage = normalizeIncomingMessage(message)
  if (previousMessages.find((item) => item.id === incomingMessage.id)) return previousMessages

  const pendingIndex = previousMessages.findIndex((item) => isMatchingPendingMessage(item, incomingMessage))
  if (pendingIndex >= 0) {
    const next = [...previousMessages]
    next[pendingIndex] = incomingMessage
    return next
  }

  return [...previousMessages, incomingMessage]
}

export function useChat() {
  const [sessions, setSessions] = useState([])
  const [messages, setMessages] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [loading, setLoading] = useState(false)
  const [botTyping, setBotTyping] = useState(false)
  const [quickReplies, setQuickReplies] = useState([])
  const channelRef = useRef(null)
  const msgChannelRef = useRef(null)
  const activeSessionIdRef = useRef(null)
  const pendingClientMessagesRef = useRef(new Map())
  const replyTimerRef = useRef(new Map())
  const { activeModuleId } = useModuleCtx()
  const { activeTenantId } = useAuthCtx()

  useEffect(() => {
    activeSessionIdRef.current = activeSession?.id || null
  }, [activeSession?.id])

  const loadSessions = useCallback(async (statusFilter = '') => {
    if (!activeModuleId) return
    setLoading(true)

    try {
      const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        let query = supabase
          .from('chat_sessions')
          .select('id, customer_phone, customer_name, status, intent, last_message_at, opened_at, csat_score, clients(name, details)')
          .eq('module_id', activeModuleId)
          .order('last_message_at', { ascending: false })

        query = applyTenantFilter(query, activeTenantId, includeTenant)
        if (statusFilter) query = query.eq('status', statusFilter)
        return query
      })

      if (response.error) throw response.error

      const mapped = (response.data || []).map((session) => {
        if (!session.clients) return session
        return {
          ...session,
          pets: {
            pet_name: session.clients.details?.pet_name || session.clients.name || '',
            species: session.clients.details?.species || '',
          },
          clients: undefined,
        }
      })

      setSessions(mapped)
    } finally {
      setLoading(false)
    }
  }, [activeModuleId, activeTenantId])

  const loadMessages = useCallback(async (sessionId) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('id, role, content, metadata, tokens_used, sent_at')
      .eq('session_id', sessionId)
      .order('sent_at', { ascending: true })

    const normalized = (data || []).map(normalizeIncomingMessage)

    setMessages(normalized)
    return normalized
  }, [])

  const openSession = useCallback(async (session) => {
    setActiveSession(session)
    activeSessionIdRef.current = session.id
    const loadedMessages = await loadMessages(session.id)

    msgChannelRef.current?.unsubscribe()
    msgChannelRef.current = supabase
      .channel(`messages-${session.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `session_id=eq.${session.id}`,
      }, (payload) => {
        setMessages((prev) => mergeIncomingMessage(prev, payload.new))
      })
      .subscribe()

    return loadedMessages
  }, [loadMessages])

  const createSession = useCallback(async ({ customer_phone, customer_name, pet_id, channel = 'whatsapp' }) => {
    if (!activeModuleId) throw new Error('Modulo nao definido')

    const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      const payload = buildTenantPayload({
        customer_phone,
        customer_name,
        client_id: pet_id,
        channel,
        status: 'bot',
        module_id: activeModuleId,
      }, activeTenantId, includeTenant)

      return supabase
        .from('chat_sessions')
        .insert(payload)
        .select()
        .single()
    })

    if (response.error) throw response.error
    setSessions((prev) => [response.data, ...prev])
    return response.data
  }, [activeModuleId, activeTenantId])

  const flushClientMessages = useCallback(async (sessionId) => {
    const queuedMessages = pendingClientMessagesRef.current.get(sessionId) || []
    pendingClientMessagesRef.current.delete(sessionId)
    replyTimerRef.current.delete(sessionId)

    if (!queuedMessages.length) {
      if (pendingClientMessagesRef.current.size === 0 && replyTimerRef.current.size === 0) setBotTyping(false)
      return
    }

    const combinedMessage = queuedMessages.map((message) => message.content).filter(Boolean).join('\n')

    try {
      await requestChatReply(sessionId, combinedMessage, {
        userMessages: queuedMessages.map((message) => ({
          client_message_id: message.id,
          content: message.content,
          sent_at: message.sent_at,
        })),
      })
      if (activeSessionIdRef.current === sessionId) {
        await loadMessages(sessionId)
      }
    } catch (error) {
      const failedIds = new Set(queuedMessages.map((message) => message.id))
      setMessages((prev) => prev.map((message) => (
        failedIds.has(message.id)
          ? { ...message, metadata: { ...(message.metadata || {}), pending: false, failed: true } }
          : message
      )))
      console.error('Falha ao responder chat com debounce:', error)
    } finally {
      if (pendingClientMessagesRef.current.size === 0 && replyTimerRef.current.size === 0) {
        setBotTyping(false)
      }
    }
  }, [loadMessages])

  const sendClientMessage = useCallback(async (sessionId, text) => {
    const trimmed = String(text || '').trim()
    if (!trimmed) return

    const optimisticMessage = createPendingClientMessage(trimmed)
    const queuedMessages = pendingClientMessagesRef.current.get(sessionId) || []
    pendingClientMessagesRef.current.set(sessionId, [...queuedMessages, optimisticMessage])

    setMessages((prev) => [...prev, optimisticMessage])
    setBotTyping(true)

    const existingTimer = replyTimerRef.current.get(sessionId)
    if (existingTimer) clearTimeout(existingTimer)

    const timer = setTimeout(() => {
      void flushClientMessages(sessionId)
    }, DASHBOARD_REPLY_DEBOUNCE_MS)
    replyTimerRef.current.set(sessionId, timer)
  }, [flushClientMessages])

  const sendHumanMessage = useCallback(async (sessionId, text) => {
    const trimmed = String(text || '').trim()
    if (!trimmed) return

    await sendHumanChatMessage(sessionId, trimmed)
    await loadMessages(sessionId)
  }, [loadMessages])

  const takeOver = useCallback(async (sessionId, employeeId) => {
    const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let query = supabase
        .from('chat_sessions')
        .update({ status: 'human', employee_id: employeeId })
        .eq('id', sessionId)
        .select()
        .single()

      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return query
    })

    if (response.error) throw response.error
    setActiveSession(response.data)
    setSessions((prev) => prev.map((session) => (session.id === sessionId ? { ...session, status: 'human' } : session)))
    return response.data
  }, [activeTenantId])

  const returnToBot = useCallback(async (sessionId) => {
    const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let query = supabase
        .from('chat_sessions')
        .update({ status: 'bot', employee_id: null })
        .eq('id', sessionId)
        .select()
        .single()

      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return query
    })

    if (response.error) throw response.error
    setActiveSession(response.data)
    setSessions((prev) => prev.map((session) => (session.id === sessionId ? { ...session, status: 'bot' } : session)))
  }, [activeTenantId])

  const closeSession = useCallback(async (sessionId, csatScore) => {
    const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let query = supabase
        .from('chat_sessions')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          ...(csatScore !== undefined && csatScore !== null ? { csat_score: csatScore } : {}),
        })
        .eq('id', sessionId)

      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return query
    })

    if (response.error) throw response.error
    setSessions((prev) => prev.filter((session) => session.id !== sessionId))
    if (activeSession?.id === sessionId) setActiveSession(null)
  }, [activeSession?.id, activeTenantId])

  const subscribeSessionsList = useCallback(() => {
    if (!activeModuleId) return

    channelRef.current?.unsubscribe()
    channelRef.current = supabase
      .channel('chat-sessions-list')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_sessions',
        filter: `module_id=eq.${activeModuleId}`,
      }, () => loadSessions())
      .subscribe()
  }, [activeModuleId, loadSessions])

  const loadQuickReplies = useCallback(async () => {
    const { data } = await supabase
      .from('quick_replies')
      .select('id, category, title, text')
      .eq('active', true)
      .order('category')

    setQuickReplies(data || [])
  }, [])

  useEffect(() => () => {
    channelRef.current?.unsubscribe()
    msgChannelRef.current?.unsubscribe()
    replyTimerRef.current.forEach((timer) => clearTimeout(timer))
    replyTimerRef.current.clear()
    pendingClientMessagesRef.current.clear()
  }, [])

  const statusConfig = (status) => ({
    bot: { cls: 'badge-amber', label: 'Bot', dot: 'bg-amber-400' },
    human: { cls: 'badge-purple', label: 'Humano', dot: 'bg-violet-400' },
    waiting: { cls: 'badge-blue', label: 'Aguardando', dot: 'bg-blue-400' },
    closed: { cls: 'badge-gray', label: 'Fechado', dot: 'bg-gray-500' },
  }[status] || { cls: 'badge-gray', label: status, dot: 'bg-gray-500' })

  return {
    sessions,
    messages,
    activeSession,
    loading,
    botTyping,
    quickReplies,
    loadSessions,
    loadMessages,
    loadQuickReplies,
    openSession,
    createSession,
    sendClientMessage,
    sendHumanMessage,
    takeOver,
    returnToBot,
    closeSession,
    subscribeSessionsList,
    setActiveSession,
    statusConfig,
  }
}
