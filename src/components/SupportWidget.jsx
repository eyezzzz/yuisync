import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Headset, Send, X, RefreshCw, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthCtx } from '../context/AuthContext'
import { useModuleCtx } from '../context/ModuleContext'

const AUTO_REPLY = 'Entendido. Alguns de nossos especialistas da central YuiSync vao analisar sua solicitacao e retornaremos o mais rapido possivel.'
const GREETING_REPLY = 'Oi! Recebemos sua mensagem. Para agilizar, descreva em uma frase o motivo do contato e, se possivel, o modulo afetado.'
const AUTO_REPLY_DEBOUNCE_MS = 5000

const GREETING_ONLY_PATTERN = /^(oi+|ola+|ol[áa]+|bom dia|boa tarde|boa noite|e ai|eai|hello|hi+|blz|beleza|tudo bem|opa|al[oô])[\s!.,?]*$/i

function isGreetingOnly(text) {
  return GREETING_ONLY_PATTERN.test(String(text || '').trim())
}

function isSupportSchemaError(error) {
  const message = String(error?.message || '').toLowerCase()
  if (!message) return false
  return (
    (message.includes('support_threads') || message.includes('support_messages'))
    && (message.includes('does not exist') || message.includes('schema cache') || message.includes('relation'))
  )
}

function nowIso() {
  return new Date().toISOString()
}

function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function SupportWidget() {
  const { profile, activeTenantId } = useAuthCtx()
  const { activeModuleId } = useModuleCtx()

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [error, setError] = useState('')
  const [thread, setThread] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [needsReasonBox, setNeedsReasonBox] = useState(false)
  const [autoReplyMode, setAutoReplyMode] = useState('none')
  const pendingThreadIdRef = useRef(null)
  const pendingMessagesRef = useRef([])
  const replyTimerRef = useRef(null)

  const moduleId = useMemo(() => {
    if (!activeModuleId || activeModuleId === 'system') return 'petshop'
    return activeModuleId
  }, [activeModuleId])

  const fallbackMessage = useMemo(() => ([
    {
      id: 'local-hello',
      sender_type: 'system',
      body: 'Central de suporte YuiSync online. Envie sua duvida ou pedido e seguimos daqui.',
      created_at: nowIso(),
    },
  ]), [])

  const loadThread = useCallback(async () => {
    if (!open || !profile?.id || !activeTenantId) return
    setLoading(true)
    setError('')

    try {
      const { data: threadData, error: threadError } = await supabase
        .from('support_threads')
        .select('id, tenant_id, module_id, requester_profile_id, status, priority, subject, updated_at, last_message_at')
        .eq('tenant_id', activeTenantId)
        .eq('module_id', moduleId)
        .eq('requester_profile_id', profile.id)
        .in('status', ['open', 'pending'])
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (threadError) throw threadError

      setSchemaMissing(false)
      setThread(threadData || null)

      if (!threadData?.id) {
        setMessages(fallbackMessage)
        return
      }

      const { data: messageData, error: messageError } = await supabase
        .from('support_messages')
        .select('id, thread_id, sender_type, body, created_at')
        .eq('thread_id', threadData.id)
        .order('created_at', { ascending: true })

      if (messageError) throw messageError

      if (!messageData || messageData.length === 0) {
        setMessages(fallbackMessage)
        return
      }

      setMessages(messageData)
    } catch (loadError) {
      if (isSupportSchemaError(loadError)) {
        setSchemaMissing(true)
        setMessages(fallbackMessage)
      } else {
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar suporte.')
      }
    } finally {
      setLoading(false)
    }
  }, [open, profile?.id, activeTenantId, moduleId, fallbackMessage])

  useEffect(() => {
    loadThread()
  }, [loadThread])

  useEffect(() => () => {
    if (replyTimerRef.current) {
      clearTimeout(replyTimerRef.current)
    }
  }, [])

  const dispatchAutoReply = useCallback(async (mode, threadId) => {
    const text = mode === 'greeting' ? GREETING_REPLY : AUTO_REPLY

    try {
      if (schemaMissing || !threadId) {
        const localReply = {
          id: `local-system-${Date.now() + 1}`,
          sender_type: 'system',
          body: text,
          created_at: nowIso(),
        }
        setMessages((prev) => [...prev, localReply])
        return
      }

      const { data, error: replyError } = await supabase
        .from('support_messages')
        .insert({
          thread_id: threadId,
          tenant_id: activeTenantId,
          sender_profile_id: null,
          sender_type: 'system',
          body: text,
        })
        .select('id, thread_id, sender_type, body, created_at')
        .single()

      if (replyError) throw replyError
      setMessages((prev) => [...prev, data])
    } catch (replyError) {
      if (!isSupportSchemaError(replyError)) {
        setError(replyError instanceof Error ? replyError.message : 'Falha ao responder automaticamente.')
      }
    }
  }, [schemaMissing, activeTenantId])

  const scheduleAutoReply = useCallback((threadId, customerText) => {
    pendingThreadIdRef.current = threadId
    pendingMessagesRef.current = [...pendingMessagesRef.current, customerText]

    if (replyTimerRef.current) {
      clearTimeout(replyTimerRef.current)
    }

    replyTimerRef.current = setTimeout(async () => {
      const snapshot = [...pendingMessagesRef.current]
      pendingMessagesRef.current = []
      replyTimerRef.current = null

      const merged = snapshot.join(' ').trim()
      if (!merged) return

      const greetingOnly = isGreetingOnly(merged)
      if (greetingOnly) {
        setNeedsReasonBox(true)
        setAutoReplyMode('greeting')
        await dispatchAutoReply('greeting', pendingThreadIdRef.current)
        return
      }

      setNeedsReasonBox(false)
      setAutoReplyMode('reason')
      await dispatchAutoReply('reason', pendingThreadIdRef.current)
    }, AUTO_REPLY_DEBOUNCE_MS)
  }, [dispatchAutoReply])

  async function sendMessage() {
    const text = input.trim()
    if (!text || !profile?.id || !activeTenantId) return

    setSending(true)
    setError('')

    try {
      if (schemaMissing) {
        const localCustomer = {
          id: `local-customer-${Date.now()}`,
          sender_type: 'customer',
          body: text,
          created_at: nowIso(),
        }
        setMessages((prev) => [...prev, localCustomer])
        setInput('')
        scheduleAutoReply('local-thread', text)
        return
      }

      let resolvedThread = thread
      if (!resolvedThread?.id) {
        const subject = `Suporte ${moduleId} - ${new Date().toLocaleDateString('pt-BR')}`
        const { data: createdThread, error: createThreadError } = await supabase
          .from('support_threads')
          .insert({
            tenant_id: activeTenantId,
            module_id: moduleId,
            requester_profile_id: profile.id,
            status: 'pending',
            priority: 'normal',
            source: 'widget',
            subject,
          })
          .select('id, tenant_id, module_id, requester_profile_id, status, priority, subject, updated_at, last_message_at')
          .single()

        if (createThreadError) throw createThreadError
        resolvedThread = createdThread
        setThread(createdThread)
      }

      const customerPayload = {
        thread_id: resolvedThread.id,
        tenant_id: activeTenantId,
        sender_profile_id: profile.id,
        sender_type: 'customer',
        body: text,
      }

      const customerResult = await supabase
        .from('support_messages')
        .insert(customerPayload)
        .select('id, thread_id, sender_type, body, created_at')
        .single()

      if (customerResult.error) throw customerResult.error

      setMessages((prev) => [...prev, customerResult.data])
      setInput('')
      scheduleAutoReply(resolvedThread.id, text)
    } catch (sendError) {
      if (isSupportSchemaError(sendError)) {
        setSchemaMissing(true)
        const localCustomer = {
          id: `local-customer-${Date.now()}`,
          sender_type: 'customer',
          body: text,
          created_at: nowIso(),
        }
        setMessages((prev) => [...prev, localCustomer])
        setInput('')
        scheduleAutoReply('local-thread', text)
      } else {
        setError(sendError instanceof Error ? sendError.message : 'Falha ao enviar mensagem.')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open && (
        <div className="mb-3 w-[320px] max-w-[85vw] rounded-3xl border border-white/10 bg-card shadow-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center text-primary">
                <Headset size={16} />
              </div>
              <div>
                <p className="text-sm font-bold text-text leading-none">Suporte YuiSync</p>
                <p className="text-[11px] text-muted mt-1">Atendimento rapido da central</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted hover:text-text">
              <X size={16} />
            </button>
          </div>

          <div className="h-[300px] overflow-y-auto px-3 py-3 space-y-2 bg-black/10">
            {loading ? (
              <div className="h-full flex items-center justify-center text-xs text-muted gap-2">
                <RefreshCw size={12} className="animate-spin" />
                Carregando conversa...
              </div>
            ) : messages.map((message) => {
              const isCustomer = message.sender_type === 'customer'
              const isAgent = message.sender_type === 'agent'
              const bubbleClass = isCustomer
                ? 'ml-8 bg-primary/15 border-primary/30 text-text'
                : isAgent
                  ? 'mr-8 bg-emerald-500/10 border-emerald-500/30 text-text'
                  : 'mr-8 bg-white/5 border-white/10 text-muted'

              return (
                <div key={message.id} className={`rounded-2xl border px-3 py-2 ${bubbleClass}`}>
                  <p className="text-[13px] leading-relaxed">{message.body}</p>
                  <p className="text-[10px] opacity-70 mt-1">{formatTime(message.created_at)}</p>
                </div>
              )
            })}
          </div>

          {error && (
            <div className="px-3 py-2 text-[11px] text-red-300 bg-red-500/10 border-t border-red-500/20">
              {error}
            </div>
          )}

          {schemaMissing && (
            <div className="px-3 py-2 text-[11px] text-amber-300 bg-amber-500/10 border-t border-amber-500/20">
              Suporte em modo local. Para persistir no banco, rode o SQL de suporte.
            </div>
          )}

          {needsReasonBox && (
            <div className="px-3 py-2 text-[11px] text-blue-200 bg-blue-500/10 border-t border-blue-500/20">
              Para agilizar, nos conte o motivo do contato, o modulo e o que aconteceu. Assim nossa equipe responde com prioridade.
            </div>
          )}

          {!needsReasonBox && autoReplyMode === 'reason' && (
            <div className="px-3 py-2 text-[11px] text-emerald-200 bg-emerald-500/10 border-t border-emerald-500/20">
              Motivo registrado com sucesso. Central YuiSync acionada.
            </div>
          )}

          <div className="p-3 border-t border-white/10 flex items-center gap-2">
            <input
              className="inp h-10 text-sm"
              placeholder="Escreva para o suporte..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  sendMessage()
                }
              }}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="w-10 h-10 rounded-xl bg-primary text-gray-900 flex items-center justify-center disabled:opacity-50"
            >
              {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`w-11 h-11 rounded-full border shadow-lg flex items-center justify-center transition-all ${
          open
            ? 'bg-white/10 border-white/20 text-text'
            : 'bg-surface border-white/15 text-primary hover:border-primary/40'
        }`}
        aria-label="Abrir suporte"
        title="Suporte YuiSync"
      >
        {open ? <X size={17} /> : <MessageCircle size={17} />}
      </button>
    </div>
  )
}
