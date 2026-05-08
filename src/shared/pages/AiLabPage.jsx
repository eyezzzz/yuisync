import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, Bot, CheckCircle2, FileText, FlaskConical, RefreshCw, Save, Send, Sparkles, UploadCloud,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthCtx } from '../../context/AuthContext'
import { useModuleCtx } from '../../context/ModuleContext'

function isAiCoreSchemaError(error) {
  const message = String(error?.message || '').toLowerCase()
  if (!message) return false
  return (
    (message.includes('companies')
      || message.includes('niches')
      || message.includes('prompt_versions'))
    && (message.includes('does not exist')
      || message.includes('schema cache')
      || message.includes('relation'))
  )
}

function isAiTrainingSchemaError(error) {
  const message = String(error?.message || '').toLowerCase()
  if (!message) return false
  return (
    (message.includes('ai_training_documents')
      || message.includes('ai_playground_runs')
      || message.includes('storage'))
    && (message.includes('does not exist')
      || message.includes('schema cache')
      || message.includes('relation')
      || message.includes('bucket'))
  )
}

function toDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeFilename(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseTags(raw) {
  return String(raw || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

async function invokeChatFromUi(payload) {
  const firstTry = await supabase.functions.invoke('chat', { body: payload })
  if (!firstTry.error) {
    return { data: firstTry.data, error: null }
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    return firstTry
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify(payload),
    })

    const text = await response.text()
    let parsed = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = { raw: text }
    }

    if (!response.ok) {
      return {
        data: null,
        error: new Error(parsed?.message || parsed?.error || `HTTP ${response.status}`),
      }
    }

    return { data: parsed, error: null }
  } catch (fallbackError) {
    return {
      data: null,
      error: fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError || 'Falha ao chamar function')),
    }
  }
}

export default function AiLabPage() {
  const { profile, activeTenantId } = useAuthCtx()
  const { activeModule } = useModuleCtx()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState({ type: '', text: '' })

  const [coreSchemaMissing, setCoreSchemaMissing] = useState(false)
  const [trainingSchemaMissing, setTrainingSchemaMissing] = useState(false)

  const [companies, setCompanies] = useState([])
  const [nichesById, setNichesById] = useState({})
  const [selectedModuleId, setSelectedModuleId] = useState('')
  const [selectedBusinessName, setSelectedBusinessName] = useState('')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')

  const [promptVersions, setPromptVersions] = useState([])
  const [promptDraft, setPromptDraft] = useState({
    core: '',
    niche: '',
    company: '',
  })

  const [documents, setDocuments] = useState([])
  const [docForm, setDocForm] = useState({
    title: '',
    tags: '',
    contentText: '',
    file: null,
  })

  const [playgroundMessage, setPlaygroundMessage] = useState('')
  const [playgroundPhone, setPlaygroundPhone] = useState('+5511999999999')
  const [playgroundRuns, setPlaygroundRuns] = useState([])

  const [refreshingWorkspace, setRefreshingWorkspace] = useState(false)
  const [savingLayer, setSavingLayer] = useState('')
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [testing, setTesting] = useState(false)

  const isGlobalAdmin = profile?.role === 'admin'
  const moduleOptions = useMemo(() => {
    const map = new Map()
    for (const company of companies) {
      const moduleId = company.module_id || 'petshop'
      if (!map.has(moduleId)) {
        map.set(moduleId, moduleId)
      }
    }
    return [...map.values()]
  }, [companies])

  const businessOptions = useMemo(() => {
    const map = new Map()
    for (const company of companies) {
      const moduleId = company.module_id || 'petshop'
      if (selectedModuleId && moduleId !== selectedModuleId) continue
      const key = company.name || 'Empresa sem nome'
      if (!map.has(key)) {
        map.set(key, key)
      }
    }
    return [...map.values()]
  }, [companies, selectedModuleId])

  const botOptions = useMemo(() => (
    companies.filter((company) => {
      const moduleId = company.module_id || 'petshop'
      if (selectedModuleId && moduleId !== selectedModuleId) return false
      if (selectedBusinessName && (company.name || 'Empresa sem nome') !== selectedBusinessName) return false
      return true
    })
  ), [companies, selectedModuleId, selectedBusinessName])

  const selectedCompany = useMemo(
    () => botOptions.find((company) => company.id === selectedCompanyId)
      || companies.find((company) => company.id === selectedCompanyId)
      || null,
    [botOptions, companies, selectedCompanyId],
  )
  const selectedNiche = selectedCompany ? nichesById[selectedCompany.niche_id] : null

  const rebuildPromptDraft = useCallback((versions, company, niche) => {
    const latestByLayer = {}
    for (const row of versions) {
      if (!row?.layer) continue
      if (latestByLayer[row.layer]) continue
      latestByLayer[row.layer] = row.content || ''
    }

    setPromptDraft({
      core: latestByLayer.core || '',
      niche: latestByLayer.niche || niche?.base_prompt || '',
      company: latestByLayer.company || company?.system_prompt || '',
    })
  }, [])

  const loadCompanies = useCallback(async () => {
    setLoading(true)
    setError('')
    setMessage({ type: '', text: '' })

    try {
      const [companiesRes, nichesRes] = await Promise.all([
        supabase
          .from('companies')
          .select('id,tenant_id,module_id,niche_id,name,bot_name,model_name,temperature,is_active,system_prompt,schedule_free_status,schedule_booked_status,created_at')
          .order('created_at', { ascending: true }),
        supabase
          .from('niches')
          .select('id,name,base_prompt')
          .order('created_at', { ascending: true }),
      ])

      if (companiesRes.error) throw companiesRes.error
      if (nichesRes.error) throw nichesRes.error

      const nextCompanies = companiesRes.data || []
      setCompanies(nextCompanies)
      setNichesById(Object.fromEntries((nichesRes.data || []).map((niche) => [niche.id, niche])))

      setCoreSchemaMissing(false)
    } catch (loadError) {
      if (isAiCoreSchemaError(loadError)) {
        setCoreSchemaMissing(true)
        setCompanies([])
        setNichesById({})
        setSelectedModuleId('')
        setSelectedBusinessName('')
        setSelectedCompanyId('')
      } else {
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar IA Lab.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadWorkspace = useCallback(async () => {
    if (!selectedCompanyId) {
      setPromptVersions([])
      setPromptDraft({ core: '', niche: '', company: '' })
      setDocuments([])
      setPlaygroundRuns([])
      return
    }

    setRefreshingWorkspace(true)
    setError('')

    try {
      const [versionsRes, docsRes, runsRes] = await Promise.all([
        supabase
          .from('prompt_versions')
          .select('id,layer,content,version,is_active,change_note,created_at')
          .eq('company_id', selectedCompanyId)
          .order('version', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('ai_training_documents')
          .select('id,title,tags,status,mime_type,file_size,content_text,storage_bucket,storage_path,created_at')
          .eq('company_id', selectedCompanyId)
          .order('created_at', { ascending: false }),
        supabase
          .from('ai_playground_runs')
          .select('id,input_message,action,reply,parsed_intent,created_at')
          .eq('company_id', selectedCompanyId)
          .order('created_at', { ascending: false })
          .limit(40),
      ])

      if (versionsRes.error) throw versionsRes.error
      if (docsRes.error) throw docsRes.error
      if (runsRes.error) throw runsRes.error

      const versionRows = versionsRes.data || []
      setPromptVersions(versionRows)
      rebuildPromptDraft(versionRows, selectedCompany, selectedNiche)

      setTrainingSchemaMissing(false)
      setDocuments(docsRes.data || [])
      setPlaygroundRuns(runsRes.data || [])
    } catch (workspaceError) {
      if (isAiTrainingSchemaError(workspaceError)) {
        setTrainingSchemaMissing(true)
        setDocuments([])
        setPlaygroundRuns([])
      } else if (isAiCoreSchemaError(workspaceError)) {
        setCoreSchemaMissing(true)
      } else {
        setError(workspaceError instanceof Error ? workspaceError.message : 'Falha ao carregar workspace da IA.')
      }
    } finally {
      setRefreshingWorkspace(false)
    }
  }, [rebuildPromptDraft, selectedCompany, selectedCompanyId, selectedNiche])

  useEffect(() => {
    loadCompanies()
  }, [loadCompanies])

  useEffect(() => {
    if (moduleOptions.length === 0) {
      if (selectedModuleId) setSelectedModuleId('')
      return
    }
    if (!selectedModuleId || !moduleOptions.includes(selectedModuleId)) {
      setSelectedModuleId(moduleOptions[0])
    }
  }, [moduleOptions, selectedModuleId])

  useEffect(() => {
    if (businessOptions.length === 0) {
      if (selectedBusinessName) setSelectedBusinessName('')
      return
    }
    if (!selectedBusinessName || !businessOptions.includes(selectedBusinessName)) {
      setSelectedBusinessName(businessOptions[0])
    }
  }, [businessOptions, selectedBusinessName])

  useEffect(() => {
    if (botOptions.length === 0) {
      if (selectedCompanyId) setSelectedCompanyId('')
      return
    }
    if (!selectedCompanyId || !botOptions.some((bot) => bot.id === selectedCompanyId)) {
      setSelectedCompanyId(botOptions[0].id)
    }
  }, [botOptions, selectedCompanyId])

  useEffect(() => {
    loadWorkspace()
  }, [loadWorkspace])

  async function savePromptLayer(layer) {
    if (!selectedCompany || !layer) return
    const content = String(promptDraft[layer] || '').trim()
    if (!content) {
      setError(`A camada ${layer} nao pode ficar vazia.`)
      return
    }

    setSavingLayer(layer)
    setError('')
    setMessage({ type: '', text: '' })

    try {
      const currentVersion = Math.max(
        0,
        ...promptVersions
          .filter((row) => row.layer === layer)
          .map((row) => Number(row.version || 0)),
      )

      const { error: insertError } = await supabase
        .from('prompt_versions')
        .insert({
          company_id: selectedCompany.id,
          layer,
          content,
          version: currentVersion + 1,
          is_active: true,
          changed_by: profile?.id || null,
          change_note: 'Atualizacao via IA Lab',
        })

      if (insertError) throw insertError

      if (layer === 'company') {
        const { error: companyUpdateError } = await supabase
          .from('companies')
          .update({
            system_prompt: content,
          })
          .eq('id', selectedCompany.id)

        if (companyUpdateError) throw companyUpdateError
      }

      if (layer === 'niche' && selectedCompany.niche_id) {
        const { error: nicheUpdateError } = await supabase
          .from('niches')
          .update({
            base_prompt: content,
          })
          .eq('id', selectedCompany.niche_id)

        if (nicheUpdateError) throw nicheUpdateError
      }

      setMessage({ type: 'success', text: `Camada ${layer} salva com nova versao.` })
      await loadCompanies()
      await loadWorkspace()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar a camada.')
    } finally {
      setSavingLayer('')
    }
  }

  async function handleUploadDocument() {
    if (!selectedCompany) return

    const hasFile = Boolean(docForm.file)
    const hasText = Boolean(String(docForm.contentText || '').trim())
    if (!hasFile && !hasText) {
      setError('Envie um arquivo ou preencha o resumo textual para treinar a IA.')
      return
    }

    const tenantId = selectedCompany.tenant_id || activeTenantId
    if (!tenantId) {
      setError('Selecione uma instancia ativa antes de enviar documentos para treino.')
      return
    }

    setUploadingDoc(true)
    setError('')
    setMessage({ type: '', text: '' })

    try {
      let storageBucket = null
      let storagePath = null
      let mimeType = null
      let fileSize = null
      let contentText = String(docForm.contentText || '').trim()

      if (docForm.file) {
        const file = docForm.file
        storageBucket = 'yuisync-ai-docs'
        const safeName = normalizeFilename(file.name) || `doc-${Date.now()}`
        storagePath = `${tenantId}/${selectedCompany.id}/${Date.now()}-${safeName}`
        mimeType = file.type || 'application/octet-stream'
        fileSize = Number(file.size || 0)

        const { error: uploadError } = await supabase.storage
          .from(storageBucket)
          .upload(storagePath, file, {
            upsert: false,
            contentType: mimeType,
          })

        if (uploadError) throw uploadError

        if (!contentText && (mimeType.startsWith('text/') || /\.(txt|md|csv|json)$/i.test(file.name))) {
          const text = await file.text()
          contentText = text.slice(0, 16000)
        }
      }

      const title = String(docForm.title || '').trim() || docForm.file?.name || 'Documento de treino'
      const tags = parseTags(docForm.tags)

      const { error: insertError } = await supabase
        .from('ai_training_documents')
        .insert({
          tenant_id: tenantId,
          module_id: selectedCompany.module_id || selectedModuleId || 'petshop',
          company_id: selectedCompany.id,
          title,
          storage_bucket: storageBucket,
          storage_path: storagePath,
          mime_type: mimeType,
          file_size: fileSize,
          content_text: contentText || null,
          tags,
          status: 'active',
          uploaded_by: profile?.id || null,
        })

      if (insertError) throw insertError

      setDocForm({
        title: '',
        tags: '',
        contentText: '',
        file: null,
      })
      setMessage({ type: 'success', text: 'Documento enviado e vinculado ao treino da IA.' })
      await loadWorkspace()
    } catch (uploadError) {
      if (isAiTrainingSchemaError(uploadError)) {
        setTrainingSchemaMissing(true)
      }
      setError(uploadError instanceof Error ? uploadError.message : 'Falha ao enviar documento.')
    } finally {
      setUploadingDoc(false)
    }
  }

  async function archiveDocument(documentId) {
    if (!documentId) return
    setError('')
    setMessage({ type: '', text: '' })

    try {
      const { error: archiveError } = await supabase
        .from('ai_training_documents')
        .update({
          status: 'archived',
        })
        .eq('id', documentId)

      if (archiveError) throw archiveError

      setMessage({ type: 'success', text: 'Documento arquivado.' })
      await loadWorkspace()
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Falha ao arquivar documento.')
    }
  }

  async function runPlaygroundTest() {
    if (!selectedCompany || !playgroundMessage.trim()) return

    const tenantId = selectedCompany.tenant_id || activeTenantId
    if (!tenantId) {
      setError('Selecione uma instancia ativa antes de testar a IA.')
      return
    }

    setTesting(true)
    setError('')
    setMessage({ type: '', text: '' })

    try {
      const payload = {
        company_id: selectedCompany.id,
        customer_phone: String(playgroundPhone || '').trim() || '+5511999999999',
        message: playgroundMessage.trim(),
      }

      const { data, error: invokeError } = await invokeChatFromUi(payload)

      if (invokeError) throw invokeError

      const run = {
        id: `local-${Date.now()}`,
        input_message: payload.message,
        action: data?.action || 'none',
        reply: data?.reply || '',
        parsed_intent: data?.intent || null,
        created_at: new Date().toISOString(),
      }

      setPlaygroundRuns((prev) => [run, ...prev].slice(0, 40))

      const { error: runInsertError } = await supabase
        .from('ai_playground_runs')
        .insert({
          tenant_id: tenantId,
          module_id: selectedCompany.module_id || selectedModuleId || 'petshop',
          company_id: selectedCompany.id,
          created_by: profile?.id || null,
          customer_phone: payload.customer_phone,
          input_message: payload.message,
          parsed_intent: data?.intent || {},
          action: data?.action || null,
          reply: data?.reply || null,
          raw_response: data || {},
        })

      if (runInsertError && !isAiTrainingSchemaError(runInsertError)) {
        throw runInsertError
      }

      if (data?.action === 'plan_limit') {
        setMessage({
          type: 'info',
          text: data?.reply || 'Teste executado, mas a IA foi bloqueada pela governanca de plano.',
        })
      } else {
        setMessage({ type: 'success', text: 'Teste executado com sucesso.' })
      }
      setPlaygroundMessage('')
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Falha ao testar a IA.')
    } finally {
      setTesting(false)
    }
  }

  if (!isGlobalAdmin) {
    return (
      <div className="page animate-fade-up max-w-4xl mx-auto">
        <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-200">
          Esta area e exclusiva para Admin Global.
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="page flex items-center justify-center py-20 text-muted">
        <RefreshCw size={18} className="animate-spin mr-2 text-[var(--primary)]" />
        Carregando IA Lab...
      </div>
    )
  }

  return (
    <div className="page animate-fade-up max-w-7xl mx-auto pb-20 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Sparkles size={22} className={activeModule?.theme?.textPrimary} />
            Treino de IA
          </h1>
          <p className="page-sub">
            Gerencie prompts, adicione documentos de conhecimento e rode testes reais do bot em um unico painel.
          </p>
        </div>
        <button onClick={loadWorkspace} className="btn btn-secondary gap-2">
          {refreshingWorkspace ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Atualizar workspace
        </button>
      </div>

      {coreSchemaMissing && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Estrutura base da IA ainda nao existe. Rode o SQL <span className="font-bold">database/yuisync_core_engine.sql</span>.
        </div>
      )}

      {trainingSchemaMissing && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Estrutura de treino/documentos ainda nao existe. Rode o SQL <span className="font-bold">database/yuisync_ai_training_hub.sql</span>.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-center gap-2">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {message.text && (
        <div className={`rounded-2xl border px-4 py-3 text-sm flex items-center gap-2 ${
          message.type === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : 'border-blue-500/30 bg-blue-500/10 text-blue-200'
        }`}>
          <CheckCircle2 size={15} />
          {message.text}
        </div>
      )}

      <section className="bg-card border border-white/10 rounded-3xl p-5 space-y-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-muted">Bot alvo</p>
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="inp-label">Modulo</label>
            <select
              className="inp"
              value={selectedModuleId}
              onChange={(event) => setSelectedModuleId(event.target.value)}
              disabled={moduleOptions.length === 0}
            >
              {moduleOptions.length === 0 && <option value="">Sem modulo</option>}
              {moduleOptions.map((moduleId) => (
                <option key={moduleId} value={moduleId}>
                  {moduleId}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="inp-label">Empresa</label>
            <select
              className="inp"
              value={selectedBusinessName}
              onChange={(event) => setSelectedBusinessName(event.target.value)}
              disabled={businessOptions.length === 0}
            >
              {businessOptions.length === 0 && <option value="">Sem empresa</option>}
              {businessOptions.map((businessName) => (
                <option key={businessName} value={businessName}>
                  {businessName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="inp-label">Bot</label>
            <select
              className="inp"
              value={selectedCompanyId}
              onChange={(event) => setSelectedCompanyId(event.target.value)}
              disabled={botOptions.length === 0}
            >
              {botOptions.length === 0 && <option value="">Sem bot</option>}
              {botOptions.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.bot_name || 'Bot'} ({company.model_name || 'gpt-4o-mini'})
                </option>
              ))}
            </select>
          </div>
          {selectedCompany && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-muted">
              <p className="text-text font-semibold flex items-center gap-2">
                <Bot size={13} className="text-[var(--primary)]" />
                {selectedCompany.bot_name} ({selectedCompany.model_name || 'gpt-4o-mini'})
              </p>
              <p className="mt-1">Modulo: {selectedCompany.module_id || selectedModuleId || 'petshop'}</p>
              <p className="mt-1">Nicho: {selectedNiche?.name || selectedCompany.niche_id}</p>
            </div>
          )}
        </div>
      </section>

      {selectedCompany && (
        <>
          <section className="bg-card border border-white/10 rounded-3xl p-5 space-y-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-muted">Camadas de prompt</p>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {['core', 'niche', 'company'].map((layer) => (
                <div key={layer} className="rounded-2xl border border-white/10 bg-black/10 p-4 space-y-3">
                  <p className="text-sm font-bold text-text uppercase tracking-wide">{layer}</p>
                  <textarea
                    className="inp min-h-[240px] resize-y"
                    value={promptDraft[layer] || ''}
                    onChange={(event) => setPromptDraft((prev) => ({ ...prev, [layer]: event.target.value }))}
                    placeholder={`Defina a camada ${layer}`}
                  />
                  <button
                    onClick={() => savePromptLayer(layer)}
                    disabled={savingLayer === layer || coreSchemaMissing}
                    className="btn btn-primary w-full gap-2"
                  >
                    {savingLayer === layer ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                    Salvar camada
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-card border border-white/10 rounded-3xl p-5 space-y-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-muted">Documentos para RAG</p>

              <div className="space-y-3">
                <input
                  className="inp"
                  placeholder="Titulo do documento"
                  value={docForm.title}
                  onChange={(event) => setDocForm((prev) => ({ ...prev, title: event.target.value }))}
                />
                <input
                  className="inp"
                  placeholder="Tags (separadas por virgula)"
                  value={docForm.tags}
                  onChange={(event) => setDocForm((prev) => ({ ...prev, tags: event.target.value }))}
                />
                <textarea
                  className="inp min-h-[120px] resize-y"
                  placeholder="Resumo textual do documento (melhora o RAG rapidamente)"
                  value={docForm.contentText}
                  onChange={(event) => setDocForm((prev) => ({ ...prev, contentText: event.target.value }))}
                />
                <input
                  className="inp"
                  type="file"
                  onChange={(event) => setDocForm((prev) => ({ ...prev, file: event.target.files?.[0] || null }))}
                />
                <button
                  onClick={handleUploadDocument}
                  disabled={uploadingDoc || coreSchemaMissing}
                  className="btn btn-primary w-full gap-2"
                >
                  {uploadingDoc ? <RefreshCw size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                  Enviar documento
                </button>
              </div>

              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {documents.length === 0 ? (
                  <p className="text-sm text-muted">Nenhum documento ativo para este bot.</p>
                ) : documents.map((doc) => (
                  <div key={doc.id} className="rounded-2xl border border-white/10 bg-black/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text truncate flex items-center gap-2">
                          <FileText size={13} className="text-[var(--primary)]" />
                          {doc.title}
                        </p>
                        <p className="text-xs text-muted mt-1">
                          {doc.tags?.length ? doc.tags.join(', ') : 'Sem tags'} - {toDateTime(doc.created_at)}
                        </p>
                      </div>
                      <button
                        onClick={() => archiveDocument(doc.id)}
                        className="btn btn-sm btn-secondary"
                      >
                        Arquivar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border border-white/10 rounded-3xl p-5 space-y-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-muted">Playground de teste</p>
              <div className="space-y-3">
                <input
                  className="inp"
                  placeholder="Telefone de sessao (teste)"
                  value={playgroundPhone}
                  onChange={(event) => setPlaygroundPhone(event.target.value)}
                />
                <textarea
                  className="inp min-h-[140px] resize-y"
                  placeholder="Digite a mensagem que voce quer testar neste bot"
                  value={playgroundMessage}
                  onChange={(event) => setPlaygroundMessage(event.target.value)}
                />
                <button
                  onClick={runPlaygroundTest}
                  disabled={testing || !playgroundMessage.trim() || coreSchemaMissing}
                  className="btn btn-primary w-full gap-2"
                >
                  {testing ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                  Executar teste
                </button>
              </div>

              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {playgroundRuns.length === 0 ? (
                  <p className="text-sm text-muted">Sem testes registrados para este bot.</p>
                ) : playgroundRuns.map((run) => (
                  <div key={run.id} className="rounded-2xl border border-white/10 bg-black/10 p-3">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted flex items-center gap-2">
                      <FlaskConical size={12} />
                      {toDateTime(run.created_at)} - action: {run.action || 'none'}
                    </p>
                    <p className="text-sm text-text mt-2"><span className="text-muted">Input:</span> {run.input_message}</p>
                    <p className="text-sm text-emerald-300 mt-1"><span className="text-muted">Reply:</span> {run.reply || '-'}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
