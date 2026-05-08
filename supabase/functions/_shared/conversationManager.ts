import { getAdminSupabase } from './supabaseClient.ts'

type ConversationRow = {
  id: string
  company_id: string
  customer_phone: string
  session_token: string
  ai_paused: boolean
  pause_reason: string | null
  context: Record<string, unknown>
  last_message_at: string
  created_at: string
}

function utcTimestamp(value: Date): string {
  return value
    .toLocaleString('sv-SE', { timeZone: 'UTC', hour12: false })
    .replace(' ', 'T')
    .concat('Z')
}

export async function getOrCreateConversation(
  companyId: string,
  customerPhone: string,
): Promise<ConversationRow> {
  const supabase = getAdminSupabase()
  const now = new Date()
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const nowText = utcTimestamp(now)
  const cutoffText = utcTimestamp(cutoff)

  const { data: existingRows, error: existingError } = await supabase
    .from('conversations')
    .select('id,company_id,customer_phone,session_token,ai_paused,pause_reason,context,last_message_at,created_at')
    .eq('company_id', companyId)
    .eq('customer_phone', customerPhone)
    .gte('last_message_at', cutoffText)
    .order('last_message_at', { ascending: false })
    .limit(1)

  if (existingError) {
    throw new Error(`Falha ao consultar conversa: ${existingError.message}`)
  }

  const existing = existingRows?.[0] as ConversationRow | undefined
  if (existing) {
    const { data: updated, error: updateError } = await supabase
      .from('conversations')
      .update({ last_message_at: nowText })
      .eq('id', existing.id)
      .select('id,company_id,customer_phone,session_token,ai_paused,pause_reason,context,last_message_at,created_at')
      .single()

    if (updateError) {
      throw new Error(`Falha ao atualizar conversa: ${updateError.message}`)
    }

    return updated as ConversationRow
  }

  const payload = {
    company_id: companyId,
    customer_phone: customerPhone,
    session_token: crypto.randomUUID(),
    ai_paused: false,
    pause_reason: null,
    context: {},
    last_message_at: nowText,
  }

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert(payload)
    .select('id,company_id,customer_phone,session_token,ai_paused,pause_reason,context,last_message_at,created_at')
    .single()

  if (createError) {
    throw new Error(`Falha ao criar conversa: ${createError.message}`)
  }

  return created as ConversationRow
}

export async function pauseAI(conversationId: string, reason: string): Promise<void> {
  const supabase = getAdminSupabase()
  const nowText = utcTimestamp(new Date())

  const { error } = await supabase
    .from('conversations')
    .update({
      ai_paused: true,
      pause_reason: reason,
      last_message_at: nowText,
    })
    .eq('id', conversationId)

  if (error) {
    throw new Error(`Falha ao pausar IA da conversa: ${error.message}`)
  }
}
