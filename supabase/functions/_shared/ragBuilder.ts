import { getAdminSupabase } from './supabaseClient.ts'
import type { IntentPeriod } from './intentParser.ts'

type BuildRagInput = {
  companyId: string
  targetDate: string | null
  period: IntentPeriod
}

type AppointmentRow = {
  id: string
  start_time: string | null
  status: string | null
  description: string | null
  service_type: string | null
  customer_name: string | null
}

function timeToMinutes(raw: string): number {
  const [h, m] = raw.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function isInPeriod(rawTime: string, period: IntentPeriod): boolean {
  if (!period) return true
  const minutes = timeToMinutes(rawTime)
  if (period === 'morning') return minutes >= 360 && minutes < 720
  if (period === 'afternoon') return minutes >= 720 && minutes < 1080
  return minutes >= 1080
}

function normalizeTime(raw: string | null): string {
  if (!raw) return '--:--'
  return raw.slice(0, 5)
}

function normalizeStatus(raw: string | null | undefined): string {
  return String(raw || '').trim().toLowerCase()
}

function occupiedDescription(row: AppointmentRow): string {
  if (row.description) return row.description
  if (row.service_type && row.customer_name) return `${row.service_type} - ${row.customer_name}`
  if (row.service_type) return row.service_type
  if (row.customer_name) return `Reservado para ${row.customer_name}`
  return 'Reservado'
}

export async function buildAgendaRag(input: BuildRagInput): Promise<string> {
  if (!input.targetDate) {
    return [
      '### Agenda',
      '- Nenhuma data alvo identificada na mensagem.',
    ].join('\n')
  }

  const supabase = getAdminSupabase()
  let freeStatus = 'available'

  const { data: companyData, error: companyError } = await supabase
    .from('companies')
    .select('schedule_free_status')
    .eq('id', input.companyId)
    .maybeSingle()

  if (!companyError && companyData?.schedule_free_status) {
    freeStatus = normalizeStatus(companyData.schedule_free_status) || 'available'
  }

  const { data, error } = await supabase
    .from('appointments')
    .select('id,start_time,status,description,service_type,customer_name')
    .eq('company_id', input.companyId)
    .eq('service_date', input.targetDate)
    .order('start_time', { ascending: true })

  if (error) {
    throw new Error(`Falha ao consultar agenda: ${error.message}`)
  }

  const rows = ((data || []) as AppointmentRow[]).filter((row) => {
    if (!row.start_time) return false
    return isInPeriod(row.start_time, input.period)
  })

  if (rows.length === 0) {
    return [
      `### Agenda de ${input.targetDate}`,
      '- Nenhum horário encontrado para o período solicitado.',
    ].join('\n')
  }

  const lines = rows.map((row) => {
    const hour = normalizeTime(row.start_time)
    if (normalizeStatus(row.status) === freeStatus) {
      return `- ${hour} | LIVRE [slot_id: ${row.id}]`
    }
    return `- ${hour} | OCUPADO (${occupiedDescription(row)})`
  })

  return [
    `### Agenda de ${input.targetDate}`,
    ...lines,
  ].join('\n')
}
