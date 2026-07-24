import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2, ChevronDown, CircleStop, Clock3, Download, FlaskConical,
  Play, RefreshCw, Trash2, XCircle,
} from 'lucide-react'
import { preparePetbotDiagnosticSuite, runPetbotDiagnosticCase } from '../../lib/api'

const STORAGE_PREFIX = 'yuisync:petbot-diagnostic-50:'

function safeJsonParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function reportStorageKey(tenantId) {
  return `${STORAGE_PREFIX}${tenantId || 'unknown'}`
}

function formatDuration(milliseconds = 0) {
  const seconds = Math.max(0, Math.round(Number(milliseconds || 0) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}m ${String(remainder).padStart(2, '0')}s`
}

function summarize(results = [], plan = null) {
  const rows = Array.isArray(results) ? results : []
  const groups = (plan?.groups || []).map((group) => {
    const groupRows = rows.filter((result) => result?.scenario?.category === group.category)
    const passed = groupRows.filter((result) => result.success).length
    return {
      ...group,
      executed: groupRows.length,
      passed,
      failed: groupRows.length - passed,
      passRate: groupRows.length ? Math.round((passed / groupRows.length) * 1000) / 10 : 0,
    }
  })
  const passed = rows.filter((result) => result.success).length
  return {
    total: Number(plan?.total || 0),
    executed: rows.length,
    passed,
    failed: rows.length - passed,
    passRate: rows.length ? Math.round((passed / rows.length) * 1000) / 10 : 0,
    averageDurationMs: rows.length
      ? Math.round(rows.reduce((sum, result) => sum + Number(result.duration_ms || 0), 0) / rows.length)
      : 0,
    groups,
  }
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function MemoryBlock({ memory }) {
  const facts = memory?.facts && typeof memory.facts === 'object' ? memory.facts : {}
  const visibleFacts = Object.entries(facts).filter(([, value]) => (
    value !== null && value !== undefined && value !== '' && value !== false
  ))
  if (!visibleFacts.length && !memory?.last_turn_semantics) return null

  return (
    <div className="rounded-xl border border-white/10 bg-black/10 p-4">
      <p className="text-xs font-black uppercase tracking-wider text-muted">Memória estruturada</p>
      {visibleFacts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
          {visibleFacts.map(([key, value]) => (
            <p key={key} className="text-xs text-muted break-words">
              <span className="font-bold text-text">{key}:</span>{' '}
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </p>
          ))}
        </div>
      )}
      {memory?.last_turn_semantics && (
        <pre className="mt-3 text-[11px] leading-relaxed text-muted whitespace-pre-wrap break-words">
          {JSON.stringify(memory.last_turn_semantics, null, 2)}
        </pre>
      )}
    </div>
  )
}

function ScenarioResult({ scenario, result, isCurrent }) {
  const status = result?.success ? 'passed' : result ? 'failed' : isCurrent ? 'running' : 'pending'
  return (
    <details className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <summary className="list-none cursor-pointer px-5 py-4 flex items-center gap-3">
        {status === 'passed' && <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />}
        {status === 'failed' && <XCircle size={18} className="text-red-400 flex-shrink-0" />}
        {status === 'running' && <RefreshCw size={18} className="text-primary animate-spin flex-shrink-0" />}
        {status === 'pending' && <Clock3 size={18} className="text-muted flex-shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-text truncate">{scenario.id} · {scenario.title}</p>
          <p className="text-xs text-muted truncate">
            {scenario.service_name || scenario.product_name || scenario.expected_outcome}
            {scenario.addition_name ? ` · acrescenta ${scenario.addition_name}` : ''}
          </p>
        </div>
        {result && <span className="text-xs text-muted">{formatDuration(result.duration_ms)}</span>}
        <ChevronDown size={16} className="text-muted" />
      </summary>

      <div className="border-t border-white/10 p-5 space-y-4">
        {!result && (
          <p className="text-xs text-muted">Este cenário ainda não foi executado.</p>
        )}
        {result?.error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">
            <p className="text-xs font-bold">Falha funcional</p>
            <p className="text-xs mt-1 break-words">{result.error}</p>
          </div>
        )}
        {result?.cleanup_error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">
            <p className="text-xs font-bold">Falha na limpeza</p>
            <p className="text-xs mt-1 break-words">{result.cleanup_error}</p>
          </div>
        )}
        {result?.evidence && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="rounded-xl bg-black/10 px-3 py-2"><p className="text-[10px] text-muted uppercase">Venda</p><p className="text-xs text-text truncate">{result.evidence.sale_id || '-'}</p></div>
            <div className="rounded-xl bg-black/10 px-3 py-2"><p className="text-[10px] text-muted uppercase">Ordem</p><p className="text-xs text-text truncate">{result.evidence.order_id || '-'}</p></div>
            <div className="rounded-xl bg-black/10 px-3 py-2"><p className="text-[10px] text-muted uppercase">Agenda</p><p className="text-xs text-text truncate">{result.evidence.appointment_id || '-'}</p></div>
            <div className="rounded-xl bg-black/10 px-3 py-2"><p className="text-[10px] text-muted uppercase">Total</p><p className="text-xs text-text">{result.evidence.total ?? '-'}</p></div>
            <div className="rounded-xl bg-black/10 px-3 py-2"><p className="text-[10px] text-muted uppercase">Duplicidade</p><p className="text-xs text-text">{result.evidence.assertions?.duplicate_confirmation_safe ? 'segura' : '-'}</p></div>
          </div>
        )}
        {Array.isArray(result?.transcript) && result.transcript.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-wider text-muted">Conversa</p>
            {result.transcript.map((turn, index) => (
              <div key={`${scenario.id}-${index}`} className="rounded-xl border border-white/10 bg-black/10 p-4 space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted">Cliente</p>
                  <p className="text-xs text-text whitespace-pre-wrap break-words mt-1">{turn.customer}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted">Luna · {formatDuration(turn.duration_ms)}</p>
                  <p className="text-xs text-muted whitespace-pre-wrap break-words mt-1">{turn.assistant}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {result?.memory && <MemoryBlock memory={result.memory} />}
        {result?.cleanup && (
          <div className="rounded-xl border border-white/10 bg-black/10 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-muted">Limpeza</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
              {Object.entries(result.cleanup.remaining || {}).map(([key, value]) => (
                <p key={key} className={`text-xs font-bold ${Number(value) === 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                  {key}: {value}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  )
}

export default function PetbotDiagnosticSuite({ tenantId, canEdit }) {
  const [plan, setPlan] = useState(null)
  const [results, setResults] = useState([])
  const [running, setRunning] = useState(false)
  const [currentScenarioId, setCurrentScenarioId] = useState('')
  const [error, setError] = useState('')
  const stopRef = useRef(false)

  useEffect(() => {
    if (!tenantId) {
      setPlan(null)
      setResults([])
      return
    }
    const saved = safeJsonParse(window.localStorage.getItem(reportStorageKey(tenantId)))
    if (saved?.plan && Array.isArray(saved?.results)) {
      setPlan(saved.plan)
      setResults(saved.results)
    } else {
      setPlan(null)
      setResults([])
    }
  }, [tenantId])

  const summary = useMemo(() => summarize(results, plan), [results, plan])
  const resultByScenario = useMemo(() => new Map(results.map((result) => [result?.scenario?.id, result])), [results])
  const pendingScenarios = useMemo(() => (
    (plan?.scenarios || []).filter((scenario) => !resultByScenario.has(scenario.id))
  ), [plan, resultByScenario])

  function persist(nextPlan, nextResults) {
    if (!tenantId) return
    window.localStorage.setItem(reportStorageKey(tenantId), JSON.stringify({
      saved_at: new Date().toISOString(),
      plan: nextPlan,
      results: nextResults,
    }))
  }

  async function preparePlan({ reset = false } = {}) {
    const response = await preparePetbotDiagnosticSuite({ tenantId })
    const nextPlan = response.data
    const currentIds = new Set((nextPlan?.scenarios || []).map((scenario) => scenario.id))
    const nextResults = reset
      ? []
      : results.filter((result) => currentIds.has(result?.scenario?.id) && result?.version === nextPlan?.version)
    setPlan(nextPlan)
    setResults(nextResults)
    persist(nextPlan, nextResults)
    return { nextPlan, nextResults }
  }

  async function handleStart({ reset = false } = {}) {
    if (!canEdit || !tenantId || running) return
    const message = reset || !results.length
      ? 'Executar 50 conversas fictícias no runtime real? Cada cenário será limpo ao terminar. A execução pode levar vários minutos e o relatório ficará salvo neste navegador.'
      : `Continuar os ${pendingScenarios.length} cenários restantes? O relatório já salvo será preservado.`
    if (!window.confirm(message)) return

    setRunning(true)
    setError('')
    stopRef.current = false
    try {
      const { nextPlan, nextResults } = await preparePlan({ reset })
      const completedIds = new Set(nextResults.map((result) => result?.scenario?.id))
      const queue = (nextPlan?.scenarios || []).filter((scenario) => !completedIds.has(scenario.id))
      let accumulated = [...nextResults]
      const suiteId = `PETBOT_DIAGNOSTIC_${Date.now()}`

      for (const scenario of queue) {
        if (stopRef.current) break
        setCurrentScenarioId(scenario.id)
        try {
          const response = await runPetbotDiagnosticCase({
            tenantId,
            scenarioId: scenario.id,
            suiteId,
          })
          const report = response.data || {
            success: false,
            version: nextPlan.version,
            scenario,
            error: 'A API não devolveu o relatório deste cenário.',
          }
          accumulated = [...accumulated.filter((item) => item?.scenario?.id !== scenario.id), report]
        } catch (caught) {
          accumulated = [...accumulated.filter((item) => item?.scenario?.id !== scenario.id), {
            success: false,
            version: nextPlan.version,
            scenario,
            duration_ms: 0,
            error: caught instanceof Error ? caught.message : 'Falha de rede ao executar o cenário.',
            transcript: [],
            memory: null,
            cleanup: null,
          }]
        }
        setResults([...accumulated])
        persist(nextPlan, accumulated)
        // Sem espera artificial: o próximo cenário começa assim que a limpeza do atual termina.
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao preparar a bateria de testes.')
    } finally {
      setCurrentScenarioId('')
      setRunning(false)
    }
  }

  function handleStop() {
    stopRef.current = true
  }

  function handleClear() {
    if (running || !window.confirm('Apagar o relatório salvo neste navegador?')) return
    window.localStorage.removeItem(reportStorageKey(tenantId))
    setPlan(null)
    setResults([])
    setError('')
  }

  function handleDownload() {
    if (!plan) return
    downloadJson(`petbot-diagnostic-${tenantId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, {
      exported_at: new Date().toISOString(),
      tenant_id: tenantId,
      plan,
      summary,
      results,
    })
  }

  const estimatedRemainingMs = summary.averageDurationMs * pendingScenarios.length

  return (
    <div className="bg-card border border-white/5 rounded-3xl p-8 shadow-sm space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
            <FlaskConical size={22} />
          </div>
          <div>
            <h3 className="text-lg font-display font-bold text-text">Bateria real do PetBot — 50 cenários</h3>
            <p className="text-sm text-muted mt-1 max-w-3xl">
              Executa 10 banhos, 10 tosas e outros serviços, 10 produtos, 10 rações e 10 cenários veterinários. Cada caso roda numa requisição separada, mostra a conversa aqui, audita venda, ordem, agenda e duplicidade quando aplicável e remove os dados fictícios antes de avançar.
            </p>
            <p className="text-xs text-muted mt-2">
              Modo rápido: não existe debounce ou pausa artificial entre mensagens e cenários. Permanecem somente o tempo da LLM, banco e eventuais tentativas de rede.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!running && (
            <button type="button" onClick={() => handleStart({ reset: results.length === 0 })} disabled={!canEdit || !tenantId} className="btn btn-primary gap-2">
              <Play size={16} />
              {results.length && pendingScenarios.length ? `Continuar ${pendingScenarios.length} restantes` : 'Executar 50 testes'}
            </button>
          )}
          {running && (
            <button type="button" onClick={handleStop} className="btn btn-secondary gap-2">
              <CircleStop size={16} /> Parar depois do atual
            </button>
          )}
          {results.length > 0 && !running && (
            <button type="button" onClick={() => handleStart({ reset: true })} className="btn btn-secondary gap-2">
              <RefreshCw size={16} /> Reiniciar
            </button>
          )}
          {plan && (
            <button type="button" onClick={handleDownload} className="btn btn-secondary gap-2">
              <Download size={16} /> Baixar JSON
            </button>
          )}
          {(plan || results.length > 0) && !running && (
            <button type="button" onClick={handleClear} className="btn btn-secondary gap-2">
              <Trash2 size={16} /> Limpar relatório
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-red-300">
          <p className="text-sm font-bold">Falha ao preparar a suíte</p>
          <p className="text-xs mt-1 break-words">{error}</p>
        </div>
      )}

      {plan && (
        <>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-text">{summary.executed} de {summary.total} executados</p>
                <p className="text-xs text-muted mt-1">
                  {summary.passed} aprovados · {summary.failed} falharam · média {formatDuration(summary.averageDurationMs)} por cenário
                  {pendingScenarios.length > 0 && summary.averageDurationMs > 0 ? ` · estimativa restante ${formatDuration(estimatedRemainingMs)}` : ''}
                </p>
              </div>
              <p className={`text-2xl font-black ${summary.failed === 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                {summary.executed ? `${summary.passRate}%` : '0%'}
              </p>
            </div>
            <div className="h-2 rounded-full bg-black/20 overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${summary.total ? (summary.executed / summary.total) * 100 : 0}%` }} />
            </div>
            {running && currentScenarioId && (
              <div className="flex items-center gap-2 text-xs text-primary">
                <RefreshCw size={14} className="animate-spin" /> Executando {currentScenarioId}. O próximo começa imediatamente após a limpeza.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {summary.groups.map((group) => (
              <div key={group.category} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs font-black text-text">{group.label}</p>
                <p className="text-2xl font-black text-text mt-2">{group.passed}/{group.executed}</p>
                <p className="text-[11px] text-muted">{group.executed ? `${group.passRate}% aprovados` : `${group.total} pendentes`}</p>
              </div>
            ))}
          </div>

          <div className="space-y-5">
            {plan.groups.map((group) => (
              <div key={group.category} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-black text-text">{group.label}</h4>
                  <span className="text-xs text-muted">10 cenários</span>
                </div>
                {(plan.scenarios || []).filter((scenario) => scenario.category === group.category).map((scenario) => (
                  <ScenarioResult
                    key={scenario.id}
                    scenario={scenario}
                    result={resultByScenario.get(scenario.id)}
                    isCurrent={currentScenarioId === scenario.id}
                  />
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {!plan && !running && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm font-bold text-text">O relatório aparecerá nesta tela.</p>
          <p className="text-xs text-muted mt-1">
            Ele é salvo no navegador após cada cenário e pode ser baixado em JSON. Uma falha não interrompe os testes seguintes.
          </p>
        </div>
      )}
    </div>
  )
}
