import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, AlertTriangle, CheckCircle2, Clock3, History, Info, Plus, RefreshCw,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthCtx } from '../../context/AuthContext'
import { useModuleCtx } from '../../context/ModuleContext'
import { applyTenantFilter, buildTenantPayload, runWithTenantFallback } from '../../lib/tenant'

const PROJECT_MILESTONES = [
  {
    id: 'ms-20260508-whatsapp-cloud-api',
    fingerprint: 'milestone-whatsapp-cloud-api-20260508',
    created_at: '2026-05-08T12:00:00.000Z',
    module_id: 'petshop',
    category: 'automacao',
    status: 'success',
    source: 'changelog',
    title: 'WhatsApp Cloud API conectado ao Chat IA',
    description: 'Atendimento WhatsApp passou a receber webhooks oficiais da Meta, reutilizar o agente de IA do chat integrado e enviar respostas humanas pela Cloud API.',
  },
  {
    id: 'ms-20260508-whatsapp-webhook-diagnostics',
    fingerprint: 'milestone-whatsapp-webhook-diagnostics-20260508',
    created_at: '2026-05-08T15:12:00.000Z',
    module_id: 'petshop',
    category: 'automacao',
    status: 'info',
    source: 'changelog',
    title: 'Diagnostico de webhook WhatsApp reforcado',
    description: 'Backend passou a registrar recebimentos de webhook WhatsApp com contagem de mensagens e status para facilitar validacao da integracao Meta.',
  },
  {
    id: 'ms-20260508-whatsapp-meta-test-webhook',
    fingerprint: 'milestone-whatsapp-meta-test-webhook-20260508',
    created_at: '2026-05-08T15:28:00.000Z',
    module_id: 'petshop',
    category: 'automacao',
    status: 'info',
    source: 'changelog',
    title: 'Webhook de teste da Meta tratado separadamente',
    description: 'Payloads de teste com phone_number_id ficticio agora validam assinatura e retornam sucesso sem criar conversas falsas no atendimento.',
  },
  {
    id: 'ms-20260508-project-cleanup-github',
    fingerprint: 'milestone-project-cleanup-github-20260508',
    created_at: '2026-05-08T16:00:00.000Z',
    module_id: 'system',
    category: 'infra',
    status: 'success',
    source: 'changelog',
    title: 'Limpeza para GitHub e extracao do projeto',
    description: 'Legado Telegram, webhook experimental e caches locais foram removidos; package-lock e .env ficaram alinhados apenas com o fluxo ativo.',
  },
  {
    id: 'ms-20260416-ui-text-fixes',
    fingerprint: 'milestone-ui-text-fixes-20260416',
    created_at: '2026-04-16T14:50:00.000Z',
    module_id: 'system',
    category: 'infra',
    status: 'success',
    source: 'changelog',
    title: 'Correcoes visuais de texto e interacoes fixas',
    description: 'Textos com encoding quebrado foram corrigidos e a interface deixou de exibir caret de digitacao em blocos estaticos.',
  },
  {
    id: 'ms-20260416-product-categories-refresh',
    fingerprint: 'milestone-product-categories-refresh-20260416',
    created_at: '2026-04-16T15:05:00.000Z',
    module_id: 'petshop',
    category: 'operacao',
    status: 'info',
    source: 'changelog',
    title: 'Categorias de produto em revisao visual',
    description: 'Padronizacao de categorias, substituicao de Importacao XML por Generico e aplicacao de icones estilizados em estoque e vendas.',
  },
  {
    id: 'ms-20260402-tenant-core',
    fingerprint: 'milestone-tenant-core-20260402',
    created_at: '2026-04-02T09:20:00.000Z',
    module_id: 'system',
    category: 'infra',
    status: 'success',
    source: 'changelog',
    title: 'Multi-instancia por negocio habilitada',
    description: 'Estrutura de tenants, vinculo perfil-negocio, tenant ativo por usuario e isolamento por RLS foram adicionados.',
  },
  {
    id: 'ms-20260402-orders',
    fingerprint: 'milestone-orders-20260402',
    created_at: '2026-04-02T10:05:00.000Z',
    module_id: 'petshop',
    category: 'operacao',
    status: 'success',
    source: 'changelog',
    title: 'Ordens de servico e entrega no WhatsApp',
    description: 'Fluxo operacional dedicado para vendas por chat com acompanhamento de status, responsavel e historico.',
  },
  {
    id: 'ms-20260402-checkout',
    fingerprint: 'milestone-checkout-20260402',
    created_at: '2026-04-02T10:40:00.000Z',
    module_id: 'petshop',
    category: 'pdv',
    status: 'success',
    source: 'changelog',
    title: 'Checkout com pagamentos mistos',
    description: 'Finalizacao de venda com 2 a 4 formas de pagamento (dinheiro, pix, debito, credito) e fechamento rapido.',
  },
  {
    id: 'ms-20260402-service-order-sync',
    fingerprint: 'milestone-service-order-sync-20260402',
    created_at: '2026-04-02T11:05:00.000Z',
    module_id: 'petshop',
    category: 'automacao',
    status: 'success',
    source: 'changelog',
    title: 'Sincronizacao automatica PDV -> ordens',
    description: 'Vendas originadas no WhatsApp passaram a abrir ordem automaticamente com status inicial consistente.',
  },
  {
    id: 'ms-20260402-admin-business',
    fingerprint: 'milestone-admin-business-20260402',
    created_at: '2026-04-02T12:10:00.000Z',
    module_id: 'system',
    category: 'admin',
    status: 'success',
    source: 'changelog',
    title: 'Novo Negocio no painel de usuarios',
    description: 'Criacao manual de negocios e atribuicao de acesso por login, com negocio principal configuravel.',
  },
  {
    id: 'ms-20260402-isolation-audit',
    fingerprint: 'milestone-isolation-audit-20260402',
    created_at: '2026-04-02T13:00:00.000Z',
    module_id: 'system',
    category: 'seguranca',
    status: 'info',
    source: 'changelog',
    title: 'Scripts de auditoria de isolamento preparados',
    description: 'Checklist de schema e testes manuais RLS foram organizados para validar separacao total entre negocios.',
  },
  {
    id: 'ms-20260403-fiscal-runtime',
    fingerprint: 'milestone-fiscal-runtime-20260403',
    created_at: '2026-04-03T11:10:00.000Z',
    module_id: 'petshop',
    category: 'fiscal',
    status: 'success',
    source: 'changelog',
    title: 'Runtime fiscal automatico por venda (PDV)',
    description: 'Cada venda concluida pode gerar documento fiscal em fila por tenant, com autorizacao imediata no provedor mock_local.',
  },
  {
    id: 'ms-20260403-fiscal-settings',
    fingerprint: 'milestone-fiscal-settings-20260403',
    created_at: '2026-04-03T11:25:00.000Z',
    module_id: 'petshop',
    category: 'admin',
    status: 'success',
    source: 'changelog',
    title: 'Configuracoes fiscais completas por empresa',
    description: 'Tela de configuracoes ganhou ambiente, regime, serie, emissor e modo de emissao automatica para cada negocio.',
  },
  {
    id: 'ms-20260403-focus-adapter',
    fingerprint: 'milestone-focus-adapter-20260403',
    created_at: '2026-04-03T12:00:00.000Z',
    module_id: 'petshop',
    category: 'fiscal',
    status: 'success',
    source: 'changelog',
    title: 'Adapter Focus NFe iniciado no backend',
    description: 'Criado endpoint seguro de emissao por venda e webhook Focus para atualizar status fiscal sem expor segredos no frontend.',
  },
  {
    id: 'ms-20260403-fiscal-manual-mode',
    fingerprint: 'milestone-fiscal-manual-mode-20260403',
    created_at: '2026-04-03T12:40:00.000Z',
    module_id: 'petshop',
    category: 'fiscal',
    status: 'success',
    source: 'changelog',
    title: 'Emissao fiscal alterada para modo manual',
    description: 'PDV e historico agora possuem acao separada "Emitir Cupom Fiscal", sem disparo automatico ao finalizar venda.',
  },
  {
    id: 'ms-20260403-commercial-foundation',
    fingerprint: 'milestone-commercial-foundation-20260403',
    created_at: '2026-04-03T18:10:00.000Z',
    module_id: 'system',
    category: 'comercial',
    status: 'success',
    source: 'changelog',
    title: 'Fundacao comercial e onboarding por negocio',
    description: 'Catalogo de planos SaaS, assinatura por tenant e trilha de onboarding foram preparados para cobranca automatica futura.',
  },
  {
    id: 'ms-20260403-support-center',
    fingerprint: 'milestone-support-center-20260403',
    created_at: '2026-04-03T18:35:00.000Z',
    module_id: 'system',
    category: 'suporte',
    status: 'success',
    source: 'changelog',
    title: 'Widget de suporte global + inbox central',
    description: 'Clientes agora podem abrir chamado por um chat minimalista e a equipe responde no Hub em Suporte Central.',
  },
  {
    id: 'ms-20260403-yui-core-engine',
    fingerprint: 'milestone-yui-core-engine-20260403',
    created_at: '2026-04-03T21:40:00.000Z',
    module_id: 'system',
    category: 'infra',
    status: 'success',
    source: 'changelog',
    title: 'Motor central YuiSync para bots multiempresa',
    description: 'Camadas de prompt, parser de intenção, RAG de agenda e RPC atômica de agendamento foram estruturados para Edge Functions.',
  },
  {
    id: 'ms-20260403-yui-core-seed-compat',
    fingerprint: 'milestone-yui-core-seed-compat-20260403',
    created_at: '2026-04-03T22:35:00.000Z',
    module_id: 'system',
    category: 'infra',
    status: 'success',
    source: 'changelog',
    title: 'Seed da agenda YuiSync compatibilizado com schema real',
    description: 'Bloco SQL do motor central passou a detectar client_id/pet_id obrigatorios e resolver IDs validos no Supabase antes de inserir slots.',
  },
  {
    id: 'ms-20260403-yui-core-bootstrap',
    fingerprint: 'milestone-yui-core-bootstrap-20260403',
    created_at: '2026-04-03T22:45:00.000Z',
    module_id: 'system',
    category: 'infra',
    status: 'success',
    source: 'changelog',
    title: 'Bootstrap de companies/niches para o motor central',
    description: 'Script de bootstrap foi adicionado para criar bases do motor central em projetos que ainda nao tinham tabela companies.',
  },
  {
    id: 'ms-20260403-yui-core-status-compat',
    fingerprint: 'milestone-yui-core-status-compat-20260403',
    created_at: '2026-04-03T23:05:00.000Z',
    module_id: 'system',
    category: 'infra',
    status: 'success',
    source: 'changelog',
    title: 'Compatibilidade de status da agenda no motor Yui',
    description: 'Seed e RPC passaram a detectar/usar status compativeis com o check constraint real de appointments, sem depender de booked/available fixos.',
  },
  {
    id: 'ms-20260403-yui-ai-hub',
    fingerprint: 'milestone-yui-ai-hub-20260403',
    created_at: '2026-04-03T23:15:00.000Z',
    module_id: 'system',
    category: 'infra',
    status: 'success',
    source: 'changelog',
    title: 'Treino de IA na central com documentos e playground',
    description: 'Nova area no Hub para editar prompts, subir documentos de conhecimento e testar respostas do bot com historico.',
  },
  {
    id: 'ms-20260403-yui-ai-auto-context',
    fingerprint: 'milestone-yui-ai-auto-context-20260403',
    created_at: '2026-04-03T23:55:00.000Z',
    module_id: 'system',
    category: 'infra',
    status: 'success',
    source: 'changelog',
    title: 'IA com contexto automatico de clientes e estoque',
    description: 'Prompt passou a receber contexto operacional direto de clientes e produtos do modulo/empresa selecionados no IA Lab.',
  },
  {
    id: 'ms-20260403-ai-lab-global-only',
    fingerprint: 'milestone-ai-lab-global-admin-only-20260403',
    created_at: '2026-04-03T23:58:00.000Z',
    module_id: 'system',
    category: 'seguranca',
    status: 'success',
    source: 'changelog',
    title: 'IA Lab bloqueado para Admin Global',
    description: 'RLS dos documentos e playground de IA foi reforcada para impedir acesso de admins locais e colaboradores.',
  },
  {
    id: 'ms-20260403-plan-governance-ai',
    fingerprint: 'milestone-plan-governance-ai-20260403',
    created_at: '2026-04-03T23:59:00.000Z',
    module_id: 'system',
    category: 'comercial',
    status: 'success',
    source: 'changelog',
    title: 'Governanca de IA por plano com cota mensal',
    description: 'Start/Pro sem IA e Prime/Elite com limite mensal atomico de mensagens para previsao de custo e margem.',
  },
  {
    id: 'ms-20260404-governance-alerts',
    fingerprint: 'milestone-governance-alerts-20260404',
    created_at: '2026-04-04T09:20:00.000Z',
    module_id: 'system',
    category: 'comercial',
    status: 'success',
    source: 'changelog',
    title: 'Alertas operacionais de governanca ativados',
    description: 'Comercial agora monitora risco de quota IA, cobranca proxima e onboarding bloqueado por tenant com auditoria automatica.',
  },
  {
    id: 'ms-20260404-petshop-growth-suite',
    fingerprint: 'milestone-petshop-growth-suite-20260404',
    created_at: '2026-04-04T11:40:00.000Z',
    module_id: 'petshop',
    category: 'operacao',
    status: 'success',
    source: 'changelog',
    title: 'Growth Suite PetShop com 6 frentes',
    description: 'Novo painel Crescimento CRM com agendamento online, no-show, report card, leads, portal do cliente e dashboard executivo.',
  },
  {
    id: 'ms-20260404-petshop-motodog-booking',
    fingerprint: 'milestone-petshop-booking-motodog-20260404',
    created_at: '2026-04-04T12:20:00.000Z',
    module_id: 'petshop',
    category: 'operacao',
    status: 'success',
    source: 'changelog',
    title: 'Agendamento online com MotoDog',
    description: 'Formulario de agendamento agora aceita retirada MotoDog, taxa e endereco para coleta.',
  },
  {
    id: 'ms-20260404-security-multi-bot-hardening',
    fingerprint: 'milestone-security-multi-bot-hardening-20260404',
    created_at: '2026-04-04T13:40:00.000Z',
    module_id: 'system',
    category: 'seguranca',
    status: 'success',
    source: 'changelog',
    title: 'Hardening de seguranca e bots multi-instancia',
    description: 'API/Edge com anti-flood, isolamento por tenant no atendimento e launcher do PetShop ajustado para multiplos bots por negocio.',
  },
  {
    id: 'ms-20260404-dynamic-bot-channels',
    fingerprint: 'milestone-dynamic-bot-channels-20260404',
    created_at: '2026-04-04T14:10:00.000Z',
    module_id: 'system',
    category: 'infra',
    status: 'success',
    source: 'changelog',
    title: 'Bots por tenant via banco (sem .env por cliente)',
    description: 'Launcher do PetShop passou a ler tenant_bot_channels automaticamente, com refresh e start/stop dinamico por instancia.',
  },
  {
    id: 'ms-20260404-dynamic-launcher-shortcut',
    fingerprint: 'milestone-dynamic-launcher-shortcut-20260404',
    created_at: '2026-04-04T14:30:00.000Z',
    module_id: 'system',
    category: 'infra',
    status: 'success',
    source: 'changelog',
    title: 'Atalho para subir bots dinamicos',
    description: 'Novo comando npm run bot:petshop:dynamic carrega variaveis do .env e inicia launcher dinamico automaticamente.',
  },
]

const STATUS_META = {
  success: { cls: 'badge-green', icon: CheckCircle2, label: 'Sucesso' },
  warning: { cls: 'badge-amber', icon: AlertTriangle, label: 'Atencao' },
  error: { cls: 'badge-red', icon: AlertCircle, label: 'Erro' },
  info: { cls: 'badge-blue', icon: Info, label: 'Info' },
}

const CATEGORY_LABELS = {
  operacao: 'Operacao',
  seguranca: 'Seguranca',
  infra: 'Base do sistema',
  fiscal: 'Fiscal',
  admin: 'Gestao',
  comercial: 'Comercial',
  suporte: 'Suporte',
  pdv: 'Caixa / PDV',
  automacao: 'Automacao',
}

const CATEGORY_CLIENT_TITLES = {
  operacao: 'Melhoria no dia a dia da equipe',
  seguranca: 'Protecao extra para o negocio',
  infra: 'Sistema mais estavel para sua rotina',
  fiscal: 'Fluxo fiscal mais claro',
  admin: 'Gestao mais simples',
  comercial: 'Mais controle sobre crescimento e planos',
  suporte: 'Suporte mais rapido',
  pdv: 'Caixa mais agil',
  automacao: 'Automacao que poupa tempo',
}

const CATEGORY_CLIENT_COPY = {
  operacao: 'Seu time ganhou mais clareza para atender, vender e acompanhar os processos do dia.',
  seguranca: 'Reforcamos a protecao dos dados e o isolamento entre negocios para operar com mais seguranca.',
  infra: 'A base do sistema foi ajustada para deixar a plataforma mais estavel e previsivel.',
  fiscal: 'O fluxo fiscal ficou mais organizado para reduzir duvidas e facilitar a emissao.',
  admin: 'A administracao ganhou atalhos e organizacao para voce configurar o negocio com menos atrito.',
  comercial: 'Acompanhamento de planos, onboarding e crescimento ficou mais facil de entender.',
  suporte: 'O cliente consegue falar com o suporte com mais rapidez e contexto.',
  pdv: 'O caixa ficou mais rapido e preparado para fechamentos mais confiaveis.',
  automacao: 'Automacoes novas ajudam a economizar tempo e reduzir tarefas manuais.',
}

function normalizeEntry(entry) {
  return {
    ...entry,
    category: entry.category || 'geral',
    status: entry.status || 'info',
    source: entry.source || 'sistema',
    created_at: entry.created_at || new Date().toISOString(),
  }
}

function isMissingLogsTableError(error) {
  const message = String(error?.message || '').toLowerCase()
  if (!message) return false
  return (
    message.includes('system_update_logs')
    && (message.includes('does not exist') || message.includes('schema cache') || message.includes('relation'))
  )
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getFriendlyTitle(entry) {
  if (entry.source === 'manual') return entry.title
  return CATEGORY_CLIENT_TITLES[entry.category] || 'Nova melhoria disponivel'
}

function getFriendlyDescription(entry) {
  if (entry.source === 'manual') {
    return entry.description || 'Registro criado manualmente pela equipe.'
  }
  return CATEGORY_CLIENT_COPY[entry.category] || 'Seu sistema recebeu uma melhoria para ficar mais claro, seguro e confiavel.'
}

export default function LogsPage() {
  const { profile, activeTenantId } = useAuthCtx()
  const { activeModule, activeModuleId } = useModuleCtx()
  const [loading, setLoading] = useState(true)
  const [dbLogs, setDbLogs] = useState([])
  const [dbUnavailable, setDbUnavailable] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [quickLog, setQuickLog] = useState({
    title: '',
    description: '',
    category: 'operacao',
    status: 'info',
  })

  const isGlobalAdmin = profile?.role === 'admin'
  const moduleRole = (profile?.module_permissions || {})[activeModuleId]
  const isModuleAdmin = String(moduleRole || '').startsWith('admin_')
  const canWrite = isGlobalAdmin || isModuleAdmin

  const loadLogs = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        let query = supabase
          .from('system_update_logs')
          .select('id, tenant_id, module_id, category, status, source, title, description, metadata, fingerprint, created_by, created_at')
          .order('created_at', { ascending: false })
          .limit(200)

        query = applyTenantFilter(query, activeTenantId, includeTenant)

        if (activeModuleId && activeModuleId !== 'system') {
          query = query.in('module_id', [activeModuleId, 'system'])
        }

        return query
      })

      if (response.error) throw response.error
      setDbUnavailable(false)
      setDbLogs((response.data || []).map(normalizeEntry))
    } catch (loadError) {
      if (isMissingLogsTableError(loadError)) {
        setDbUnavailable(true)
        setDbLogs([])
      } else {
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar logs.')
      }
    } finally {
      setLoading(false)
    }
  }, [activeModuleId, activeTenantId])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const combinedLogs = useMemo(() => {
    const merged = [...(dbLogs || []), ...PROJECT_MILESTONES]
      .map(normalizeEntry)

    const unique = new Map()
    for (const log of merged) {
      const key = log.fingerprint || `${log.source}-${log.title}-${log.created_at}`
      if (!unique.has(key)) unique.set(key, log)
    }

    return [...unique.values()].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [dbLogs])

  async function createQuickLog() {
    if (!canWrite) return
    const title = quickLog.title.trim()
    if (!title) return setError('Informe um titulo para registrar o log.')

    setSaving(true)
    setError('')

    try {
      const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        const row = buildTenantPayload({
          module_id: activeModuleId === 'system' ? 'system' : (activeModuleId || 'system'),
          category: quickLog.category || 'operacao',
          status: quickLog.status || 'info',
          source: 'manual',
          title,
          description: quickLog.description.trim() || null,
          created_by: profile?.id || null,
          metadata: {},
          created_at: new Date().toISOString(),
        }, activeTenantId, includeTenant)

        return supabase
          .from('system_update_logs')
          .insert(row)
          .select('id, tenant_id, module_id, category, status, source, title, description, metadata, fingerprint, created_by, created_at')
          .single()
      })

      if (response.error) throw response.error

      setDbLogs((prev) => [normalizeEntry(response.data), ...prev])
      setQuickLog({
        title: '',
        description: '',
        category: 'operacao',
        status: 'info',
      })
    } catch (createError) {
      if (isMissingLogsTableError(createError)) {
        setDbUnavailable(true)
        setError('Tabela de logs ainda nao criada. Rode o SQL de logs primeiro.')
      } else {
        setError(createError instanceof Error ? createError.message : 'Falha ao registrar log.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page animate-fade-up max-w-6xl mx-auto pb-20 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <History size={22} className={activeModule?.theme?.textPrimary} />
            Central de Melhorias
          </h1>
          <p className="page-sub">
            Acompanhe novidades do sistema em uma linguagem mais simples, focada no que melhora para o seu negocio.
          </p>
        </div>
        <button onClick={loadLogs} className="btn btn-secondary gap-2">
          <RefreshCw size={15} />
          Atualizar
        </button>
      </div>

      {dbUnavailable && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Logs persistentes ainda nao estao ativos no banco. Rode o arquivo <span className="font-bold">database/system_update_logs.sql</span> no Supabase.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {canWrite && (
        <div className="bg-card border border-white/5 rounded-3xl p-5 space-y-4">
          <p className="text-sm font-bold text-text">Registrar melhoria manual</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="inp md:col-span-2"
              placeholder="Titulo visivel para o cliente"
              value={quickLog.title}
              onChange={(event) => setQuickLog((prev) => ({ ...prev, title: event.target.value }))}
            />
            <textarea
              className="inp md:col-span-2 h-24 resize-none"
              placeholder="Explique o beneficio dessa atualizacao (opcional)"
              value={quickLog.description}
              onChange={(event) => setQuickLog((prev) => ({ ...prev, description: event.target.value }))}
            />
            <select
              className="inp"
              value={quickLog.category}
              onChange={(event) => setQuickLog((prev) => ({ ...prev, category: event.target.value }))}
            >
              <option value="operacao">Operacao</option>
              <option value="seguranca">Seguranca</option>
              <option value="infra">Infra</option>
              <option value="fiscal">Fiscal</option>
              <option value="admin">Administracao</option>
            </select>
            <select
              className="inp"
              value={quickLog.status}
              onChange={(event) => setQuickLog((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="info">Info</option>
              <option value="success">Sucesso</option>
              <option value="warning">Atencao</option>
              <option value="error">Erro</option>
            </select>
          </div>
          <button onClick={createQuickLog} disabled={saving} className="btn btn-primary gap-2">
            {saving ? <RefreshCw size={15} className="animate-spin" /> : <Plus size={15} />}
            Registrar melhoria
          </button>
        </div>
      )}

      <div className="bg-card border border-white/5 rounded-3xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border2)] flex items-center gap-2">
          <Clock3 size={14} className="text-muted" />
          <span className="text-xs uppercase tracking-[0.18em] text-muted font-black">Linha do tempo</span>
        </div>

        {loading ? (
          <div className="px-5 py-12 text-center text-muted flex items-center justify-center gap-2">
            <RefreshCw size={16} className="animate-spin" />
            Carregando logs...
          </div>
        ) : combinedLogs.length === 0 ? (
          <div className="px-5 py-12 text-center text-muted">Nenhum log encontrado.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {combinedLogs.map((entry) => {
              const meta = STATUS_META[entry.status] || STATUS_META.info
              const StatusIcon = meta.icon
              return (
                <div key={entry.id || `${entry.title}-${entry.created_at}`} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-8 h-8 rounded-xl border border-white/10 flex items-center justify-center ${meta.cls}`}>
                      <StatusIcon size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-text">{getFriendlyTitle(entry)}</p>
                        <span className={`badge ${meta.cls}`}>{meta.label}</span>
                        <span className="badge badge-gray">{CATEGORY_LABELS[entry.category] || entry.category}</span>
                        <span className="badge badge-blue">{entry.module_id || 'system'}</span>
                        <span className="badge badge-gray">{entry.source}</span>
                      </div>
                      <p className="text-sm text-muted mt-1">{getFriendlyDescription(entry)}</p>
                      {entry.source !== 'manual' && entry.title && (
                        <p className="text-[11px] text-muted/80 mt-2">Detalhe interno: {entry.title}</p>
                      )}
                      <p className="text-[11px] text-muted mt-2">
                        {formatDateTime(entry.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
