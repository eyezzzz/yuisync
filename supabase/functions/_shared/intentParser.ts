import { OPENAI_API_KEY } from './supabaseClient.ts'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const TZ = 'America/Sao_Paulo'

export type IntentKind =
  | 'greeting'
  | 'check_agenda'
  | 'confirm_booking'
  | 'transfer_to_human'
  | 'emergency'
  | 'other'

export type IntentPeriod = 'morning' | 'afternoon' | 'evening' | null

export type IntentResult = {
  intent: IntentKind
  target_date: string | null
  period: IntentPeriod
}

const FALLBACK_INTENT: IntentResult = {
  intent: 'other',
  target_date: null,
  period: null,
}

function localDateInSaoPaulo(daysToAdd = 0): string {
  const now = new Date()
  const local = new Date(now.toLocaleString('en-US', { timeZone: TZ }))
  local.setDate(local.getDate() + daysToAdd)
  return local.toLocaleDateString('sv-SE', { timeZone: TZ })
}

function weekdayPtBr(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const probe = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 12, 0, 0))
  return probe.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: TZ })
}

function sanitizeIntent(payload: Partial<IntentResult> | null | undefined): IntentResult {
  const allowedIntent: IntentKind[] = [
    'greeting',
    'check_agenda',
    'confirm_booking',
    'transfer_to_human',
    'emergency',
    'other',
  ]
  const allowedPeriod: Exclude<IntentPeriod, null>[] = ['morning', 'afternoon', 'evening']

  const intent = allowedIntent.includes(payload?.intent as IntentKind)
    ? (payload?.intent as IntentKind)
    : 'other'

  const target_date = typeof payload?.target_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.target_date)
    ? payload.target_date
    : null

  const period = allowedPeriod.includes(payload?.period as Exclude<IntentPeriod, null>)
    ? (payload?.period as Exclude<IntentPeriod, null>)
    : null

  return { intent, target_date, period }
}

export async function parseIntent(message: string): Promise<IntentResult> {
  try {
    const today = localDateInSaoPaulo(0)
    const tomorrow = localDateInSaoPaulo(1)
    const todayWeekday = weekdayPtBr(today)
    const tomorrowWeekday = weekdayPtBr(tomorrow)

    const systemPrompt = [
      'Você é um parser de intenção para assistente de pet shop.',
      'Retorne APENAS JSON válido com: intent, target_date, period.',
      'Enum fechado de intent: greeting | check_agenda | confirm_booking | transfer_to_human | emergency | other.',
      'Enum fechado de period: morning | afternoon | evening | null.',
      'target_date deve ser YYYY-MM-DD ou null.',
      `Hoje em America/Sao_Paulo: ${today} (${todayWeekday}).`,
      `Amanhã em America/Sao_Paulo: ${tomorrow} (${tomorrowWeekday}).`,
      'Se houver urgência médica (envenenamento, convulsão, sangramento intenso, emergência), use intent=emergency.',
      'Não invente campos extras.',
    ].join('\n')

    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
      }),
    })

    if (!response.ok) return FALLBACK_INTENT
    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') return FALLBACK_INTENT

    const parsed = JSON.parse(content)
    return sanitizeIntent(parsed)
  } catch {
    return FALLBACK_INTENT
  }
}
