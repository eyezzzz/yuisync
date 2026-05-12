import { getAdminSupabase } from './supabaseClient.ts'
import type { IntentResult } from './intentParser.ts'
import { buildBusinessContextRag } from './businessContextBuilder.ts'

const TZ = 'America/Sao_Paulo'

const YUI_CORE = `
Voce e uma assistente conversacional da plataforma YuiSync.
Regras universais:
- Seja clara, educada e objetiva em portugues do Brasil.
- Use somente dados confirmados no contexto do banco.
- Nunca invente dados de agenda, estoque, preco, endereco ou documentos.
- Nunca exponha identificadores internos como slot_id para o cliente final.
- Quando houver sinal de emergencia, priorize transferencia para humano.
- Em confirmacoes, sempre valide disponibilidade real antes de confirmar.
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
  tenant_id: string | null
  module_id: string
  bot_name: string
  temperature: number
  model_name: string
  welcome_message: string | null
  is_active: boolean
}

type SettingsRow = {
  store_name?: string | null
  store_phone?: string | null
  store_address?: string | null
  store_neighborhood?: string | null
  store_city?: string | null
  bot_prompt?: string | null
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
    .select('id,name,tenant_id,module_id,bot_name,temperature,model_name,welcome_message,is_active')
    .eq('id', input.companyId)
    .maybeSingle()

  if (companyError) {
    throw new Error(`Falha ao buscar empresa: ${companyError.message}`)
  }
  if (!companyData) {
    throw new Error('Empresa nao encontrada.')
  }
  if (!companyData.is_active) {
    throw new Error('Empresa inativa para atendimento.')
  }

  const company = companyData as CompanyRow
  const { data: settingsData } = await supabase
    .from('settings')
    .select('*')
    .eq('tenant_id', company.tenant_id || '')
    .eq('module_id', company.module_id || 'petshop')
    .maybeSingle()

  const settings = (settingsData || {}) as SettingsRow
  const storeLocation = [
    settings.store_address,
    settings.store_neighborhood,
    settings.store_city,
  ].filter(Boolean).join(' - ') || 'Nao informado'

  const contextText = input.conversationContext
    ? JSON.stringify(input.conversationContext, null, 2)
    : '{}'

  const businessBlock = await buildBusinessContextRag({
    companyId: input.companyId,
    userMessage: input.userMessage,
  })

  const sessionLayer = [
    `Dia da semana atual no Brasil: ${todayWeekdayPtBr()}.`,
    `Intent detectada: ${input.intent.intent}.`,
    `Data alvo: ${input.intent.target_date ?? 'null'}.`,
    `Periodo alvo: ${input.intent.period ?? 'null'}.`,
    'Contexto de sessao:',
    contextText,
    '',
    'Contexto operacional clientes/produtos:',
    businessBlock,
    '',
    'Contexto em tempo real agenda:',
    input.ragBlock || '- Sem dados adicionais.',
  ].join('\n')

  const composedPrompt = [
    `Camada 1 - Yui Core\n${YUI_CORE.trim()}`,
    [
      `Camada 2 - Configuracao do tenant (${settings.store_name || company.name})`,
      `Bot: ${company.bot_name}`,
      `Telefone da loja: ${settings.store_phone || 'Nao informado'}`,
      `Endereco: ${storeLocation}`,
      '',
      'Instrucao customizada:',
      settings.bot_prompt || 'Nenhuma instrucao customizada cadastrada.',
    ].join('\n'),
    `Camada 3 - Contexto do banco/Sessao\n${sessionLayer}`,
  ].join('\n---\n')

  return {
    company,
    composedPrompt,
  }
}
