import { getAdminSupabase } from './supabaseClient.ts'
import type { IntentResult } from './intentParser.ts'
import { buildKnowledgeRag } from './knowledgeBuilder.ts'
import { buildBusinessContextRag } from './businessContextBuilder.ts'

const TZ = 'America/Sao_Paulo'

const YUI_CORE = `
Você é uma assistente conversacional da plataforma YuiSync.
Regras universais:
- Seja clara, educada e objetiva em português do Brasil.
- Nunca invente dados de agenda, estoque ou documentos.
- Nunca exponha identificadores internos como slot_id para o cliente final.
- Quando houver sinal de emergência, priorize transferência para humano.
- Em confirmações, sempre valide disponibilidade real antes de confirmar.
`

type BuildPromptInput = {
  companyId: string
  ragBlock: string
  userMessage: string
  intent: IntentResult
  conversationContext?: Record<string, unknown> | null
}

type CompanyRow = {
  id: string
  name: string
  niche_id: string
  system_prompt: string
  bot_name: string
  temperature: number
  model_name: string
  welcome_message: string | null
  is_active: boolean
}

type NicheRow = {
  id: string
  name: string
  base_prompt: string
}

function todayWeekdayPtBr(): string {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    timeZone: TZ,
  })
}

export async function buildPromptLayers(input: BuildPromptInput): Promise<{
  company: CompanyRow
  composedPrompt: string
}> {
  const supabase = getAdminSupabase()

  const { data: companyData, error: companyError } = await supabase
    .from('companies')
    .select('id,name,niche_id,system_prompt,bot_name,temperature,model_name,welcome_message,is_active')
    .eq('id', input.companyId)
    .maybeSingle()

  if (companyError) {
    throw new Error(`Falha ao buscar empresa: ${companyError.message}`)
  }
  if (!companyData) {
    throw new Error('Empresa não encontrada.')
  }
  if (!companyData.is_active) {
    throw new Error('Empresa inativa para atendimento.')
  }

  const { data: nicheData, error: nicheError } = await supabase
    .from('niches')
    .select('id,name,base_prompt')
    .eq('id', companyData.niche_id)
    .maybeSingle()

  if (nicheError) {
    throw new Error(`Falha ao buscar nicho: ${nicheError.message}`)
  }
  if (!nicheData) {
    throw new Error('Nicho da empresa não encontrado.')
  }

  const contextText = input.conversationContext
    ? JSON.stringify(input.conversationContext, null, 2)
    : '{}'

  const knowledgeBlock = await buildKnowledgeRag({
    companyId: input.companyId,
    userMessage: input.userMessage,
    limit: 3,
  })

  const businessBlock = await buildBusinessContextRag({
    companyId: input.companyId,
    userMessage: input.userMessage,
  })

  const sessionLayer = [
    `Dia da semana atual no Brasil: ${todayWeekdayPtBr()}.`,
    `Intent detectada: ${input.intent.intent}.`,
    `Data alvo: ${input.intent.target_date ?? 'null'}.`,
    `Período alvo: ${input.intent.period ?? 'null'}.`,
    'Contexto de sessão:',
    contextText,
    '',
    'RAG clientes/produtos:',
    businessBlock,
    '',
    'RAG documental:',
    knowledgeBlock,
    '',
    'RAG em tempo real (agenda):',
    input.ragBlock || '- Sem dados adicionais.',
  ].join('\n')

  const composedPrompt = [
    `Camada 1 - Yui Core\n${YUI_CORE.trim()}`,
    `Camada 2 - Nicho (${nicheData.name})\n${nicheData.base_prompt}`,
    `Camada 3 - Empresa (${companyData.name})\nBot: ${companyData.bot_name}\n${companyData.system_prompt}`,
    `Camada 4 - RAG/Sessão\n${sessionLayer}`,
  ].join('\n---\n')

  return {
    company: companyData as CompanyRow,
    composedPrompt,
  }
}
