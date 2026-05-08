import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { getAdminSupabase, OPENAI_API_KEY } from '../_shared/supabaseClient.ts'
import { parseIntent } from '../_shared/intentParser.ts'
import { buildAgendaRag } from '../_shared/ragBuilder.ts'
import { buildPromptLayers } from '../_shared/promptBuilder.ts'
import { yuiTools } from '../_shared/yuiTools.ts'
import { getOrCreateConversation, pauseAI } from '../_shared/conversationManager.ts'
import { enforcePlanGovernanceForAi } from '../_shared/planGovernance.ts'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:3080')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const RATE_LIMIT_WINDOW_MS = Number(Deno.env.get('CHAT_RATE_WINDOW_MS') || '60000')
const RATE_LIMIT_MAX_REQUESTS = Number(Deno.env.get('CHAT_RATE_MAX_REQUESTS') || '12')
const rateWindows = new Map<string, number[]>()

type ChatRequestPayload = {
  company_id?: string
  customer_phone?: string
  message?: string
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }

  if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
    headers['Access-Control-Allow-Origin'] = origin
  }

  return headers
}

function jsonResponse(status: number, body: unknown, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function normalizePhone(value: string): string {
  return value.trim()
}

function consumeRateLimit(key: string): { retryAfter: number; remaining: number; limit: number } {
  const now = Date.now()
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  const previous = rateWindows.get(key) || []
  const active = previous.filter((timestamp) => timestamp > cutoff)

  if (active.length >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.max(1, Math.ceil((active[0] + RATE_LIMIT_WINDOW_MS - now) / 1000))
    return {
      retryAfter,
      remaining: 0,
      limit: RATE_LIMIT_MAX_REQUESTS,
    }
  }

  active.push(now)
  rateWindows.set(key, active)

  if (rateWindows.size > 5000) {
    for (const [windowKey, timestamps] of rateWindows.entries()) {
      const filtered = timestamps.filter((timestamp) => timestamp > cutoff)
      if (filtered.length === 0) {
        rateWindows.delete(windowKey)
      } else {
        rateWindows.set(windowKey, filtered)
      }
    }
  }

  return {
    retryAfter: 0,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - active.length),
    limit: RATE_LIMIT_MAX_REQUESTS,
  }
}

async function callOpenAI(params: {
  model: string
  temperature: number
  prompt: string
  userMessage: string
  forceToolName?: 'confirm_booking' | 'transfer_to_human'
}) {
  const body = {
    model: params.model || 'gpt-4o-mini',
    temperature: params.temperature ?? 0.7,
    messages: [
      { role: 'system', content: params.prompt },
      { role: 'user', content: params.userMessage },
    ],
    tools: yuiTools,
    tool_choice: params.forceToolName
      ? { type: 'function', function: { name: params.forceToolName } }
      : 'auto',
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`OpenAI error: ${response.status} ${text}`)
    }

    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders)
  }

  const origin = req.headers.get('origin') || ''
  if (origin && !ALLOWED_ORIGINS.includes(origin) && !ALLOWED_ORIGINS.includes('*')) {
    return jsonResponse(403, { error: 'Origin not allowed' }, corsHeaders)
  }

  try {
    const payload = (await req.json()) as ChatRequestPayload
    const companyId = String(payload.company_id || '').trim()
    const customerPhone = normalizePhone(String(payload.customer_phone || ''))
    const message = String(payload.message || '').trim()

    if (!companyId || !customerPhone || !message) {
      return jsonResponse(400, {
        error: 'Missing required fields',
        required: ['company_id', 'customer_phone', 'message'],
      }, corsHeaders)
    }

    if (message.length > 4000) {
      return jsonResponse(400, { error: 'Message too long (max 4000 chars)' }, corsHeaders)
    }

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
    const rateLimit = consumeRateLimit(`${companyId}:${customerPhone}:${ip}`)
    if (rateLimit.retryAfter > 0) {
      return jsonResponse(429, {
        error: 'rate_limited',
        message: `Too many requests. Try again in ${rateLimit.retryAfter}s.`,
        retry_after: rateLimit.retryAfter,
      }, corsHeaders)
    }

    const conversation = await getOrCreateConversation(companyId, customerPhone)

    if (conversation.ai_paused) {
      return jsonResponse(200, {
        action: 'ai_paused',
        reply: null,
        conversation_id: conversation.id,
      }, corsHeaders)
    }

    const planGovernance = await enforcePlanGovernanceForAi(companyId)
    if (!planGovernance.allowed) {
      return jsonResponse(200, {
        action: 'plan_limit',
        reply: planGovernance.message,
        conversation_id: conversation.id,
        governance: {
          reason: planGovernance.reason,
          plan_id: planGovernance.plan_id || null,
          plan_name: planGovernance.plan_name || null,
          used: planGovernance.used ?? null,
          limit: planGovernance.limit ?? null,
          remaining: planGovernance.remaining ?? null,
          period_month: planGovernance.period_month || null,
        },
      }, corsHeaders)
    }

    const intent = await parseIntent(message)

    let ragBlock = ''
    if (intent.intent === 'check_agenda' || intent.intent === 'confirm_booking') {
      ragBlock = await buildAgendaRag({
        companyId,
        targetDate: intent.target_date,
        period: intent.period,
      })
    }

    const promptData = await buildPromptLayers({
      companyId,
      ragBlock,
      userMessage: message,
      intent,
      conversationContext: conversation.context,
    })

    const forceToolName = intent.intent === 'confirm_booking'
      ? 'confirm_booking'
      : (intent.intent === 'emergency' || intent.intent === 'transfer_to_human')
        ? 'transfer_to_human'
        : undefined

    const openAiData = await callOpenAI({
      model: promptData.company.model_name || 'gpt-4o-mini',
      temperature: Number(promptData.company.temperature ?? 0.7),
      prompt: promptData.composedPrompt,
      userMessage: message,
      forceToolName,
    })

    const choice = openAiData?.choices?.[0]
    const toolCalls = choice?.message?.tool_calls || []
    const firstTool = toolCalls?.[0]

    if (firstTool?.function?.name === 'confirm_booking') {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(firstTool.function.arguments || '{}')
      } catch {
        args = {}
      }

      const slotId = String(args.slot_id || '').trim()
      const slotTime = String(args.slot_time || '').trim()
      const serviceType = String(args.service_type || '').trim()
      const petName = String(args.pet_name || '').trim()

      if (!slotId || !slotTime || !serviceType) {
        return jsonResponse(200, {
          action: 'none',
          reply: 'Nao consegui identificar todos os dados do horario. Pode confirmar novamente?',
          conversation_id: conversation.id,
          intent,
        }, corsHeaders)
      }

      const supabase = getAdminSupabase()
      const { data: bookingData, error: bookingError } = await supabase.rpc('book_appointment', {
        p_slot_id: slotId,
        p_customer_name: petName || 'Cliente',
        p_customer_phone: customerPhone,
        p_company_id: companyId,
        p_conversation_id: conversation.id,
        p_service_type: serviceType,
      })

      if (bookingError) {
        throw new Error(`Failed book_appointment RPC: ${bookingError.message}`)
      }

      if (!bookingData?.success) {
        return jsonResponse(200, {
          action: 'slot_taken',
          reply: `Esse horario (${slotTime}) acabou de ser reservado. Posso te mostrar outras opcoes?`,
          conversation_id: conversation.id,
          intent,
        }, corsHeaders)
      }

      return jsonResponse(200, {
        action: 'booked',
        reply: `Perfeito. Agendamento confirmado para ${slotTime} (${serviceType})${petName ? ` para ${petName}` : ''}.`,
        conversation_id: conversation.id,
        intent,
      }, corsHeaders)
    }

    if (firstTool?.function?.name === 'transfer_to_human') {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(firstTool.function.arguments || '{}')
      } catch {
        args = {}
      }

      const reason = String(args.reason || 'Transfer requested by assistant').trim()
      await pauseAI(conversation.id, reason)

      return jsonResponse(200, {
        action: 'transfer',
        reply: 'Entendido. Vou te direcionar para um especialista humano.',
        conversation_id: conversation.id,
        intent,
      }, corsHeaders)
    }

    const assistantReply = String(choice?.message?.content || '').trim() || 'Entendi. Como posso te ajudar melhor agora?'

    return jsonResponse(200, {
      action: 'none',
      reply: assistantReply,
      conversation_id: conversation.id,
      intent,
    }, corsHeaders)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse(500, {
      error: 'internal_error',
      message,
    }, corsHeaders)
  }
})
