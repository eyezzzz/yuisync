import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { requestChatReply, sendHumanChatMessage } from '../../lib/api'
import { useModuleCtx } from '../../context/ModuleContext'
import { useAuthCtx } from '../../context/AuthContext'
import { applyTenantFilter, buildTenantPayload, runWithTenantFallback } from '../../lib/tenant'

export function useChat() {
  const [sessions, setSessions] = useState([])
  const [messages, setMessages] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [loading, setLoading] = useState(false)
  const [botTyping, setBotTyping] = useState(false)
  const [quickReplies, setQuickReplies] = useState([])
  const channelRef = useRef(null)
  const msgChannelRef = useRef(null)
  const { activeModuleId } = useModuleCtx()
  const { activeTenantId } = useAuthCtx()

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

    const normalized = (data || []).map((message) => ({
      ...message,
      sent_at: message.sent_at,
    }))

    setMessages(normalized)
    return normalized
  }, [])

  const openSession = useCallback(async (session) => {
    setActiveSession(session)
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
        setMessages((prev) => {
          if (prev.find((msg) => msg.id === payload.new.id)) return prev
          return [...prev, { ...payload.new, sent_at: payload.new.sent_at }]
        })
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

  const sendClientMessage = useCallback(async (sessionId, text) => {
    const trimmed = String(text || '').trim()
    if (!trimmed) return

    const optimisticMessage = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      metadata: { pending: true, local_only: true },
      sent_at: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, optimisticMessage])
    setBotTyping(true)
    try {
      await requestChatReply(sessionId, trimmed)
      await loadMessages(sessionId)
    } catch (error) {
      setMessages((prev) => prev.map((message) => (
        message.id === optimisticMessage.id
          ? { ...message, metadata: { ...(message.metadata || {}), pending: false, failed: true } }
          : message
      )))
      throw error
    } finally {
      setBotTyping(false)
    }
  }, [loadMessages])

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
          ...(csatScore ? { csat_score: csatScore } : {}),
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
