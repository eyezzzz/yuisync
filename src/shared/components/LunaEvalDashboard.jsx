import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2, Download, Gauge, Play, RefreshCw, ShieldCheck, XCircle,
} from 'lucide-react'
import { prepareLunaEvalPlatform, runLunaEvalPlatform } from '../../lib/api'

const STORAGE_PREFIX = 'yuisync:luna-eval-platform:'

function storageKey(tenantId) {
  return `${STORAGE_PREFIX}${tenantId || 'unknown'}`
}

function safeParse(value) {
  try { return JSON.parse(value) } catch { return null }
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

function formatMilliseconds(value = 0) {
  const milliseconds = Number(value || 0)
  if (milliseconds < 1) return `${Math.round(milliseconds * 1000)} μs`
  if (milliseconds < 1000) return `${Math.round(milliseconds * 10) / 10} ms`
  return `${Math.round(milliseconds) / 1000}s`
}

function scenarioSummary(plan, report) {
  const results = Array.isArray(report?.results) ? report.results : []
  return (plan?.scenarios || []).map((scenario) => {
    const rows = results.filter((entry) => entry.scenario_name === scenario.name)
    const passed = rows.filter((entry) => entry.ok).length
    return {
      ...scenario,
      executed: rows.length,
      passed,
      failed: rows.length - passed,
    }
  })
}

function ResultDetails({ result }) {
  return (
    <details className="rounded-xl border border-white/10 bg-black/10 overflow-hidden">
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-3">
        {result.ok
          ? <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
          : <XCircle size={16} className="text-red-400 flex-shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-text truncate">{result.case_id}</p>
          <p className="text-[11px] text-muted truncate">{result.variant} · {formatMilliseconds(result.duration_ms)}</p>
        </div>
      </summary>
      <div className="border-t border-white/10 p-4 space-y-3">
        {result.failure && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
            <p className="text-xs font-bold text-red-300">{result.failure.code}</p>
            <p className="text-[11px] text-red-200 mt-1 break-words">{result.failure.message}</p>
          </div>
        )}
        {result.assertion_errors?.length > 0 && (
          <pre className="text-[11px] text-red-200 whitespace-pre-wrap break-words">{result.assertion_errors.join('\n')}</pre>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-lg bg-white/[0.03] p-2"><p className="text-[10px] text-muted uppercase">Estado</p><p className="text-xs text-text">{result.state?.status || '-'}</p></div>
          <div className="rounded-lg bg-white/[0.03] p-2"><p className="text-[10px] text-muted uppercase">Total</p><p className="text-xs text-text">R$ {Number(result.state?.totals?.total || 0).toFixed(2).replace('.', ',')}</p></div>
          <div className="rounded-lg bg-white/[0.03] p-2"><p className="text-[10px] text-muted uppercase">Ferramentas</p><p className="text-xs text-text">{result.tool_runs?.length || 0}</p></div>
          <div className="rounded-lg bg-white/[0.03] p-2"><p className="text-[10px] text-muted uppercase">Ledger</p><p className="text-xs text-text">{result.state?.ledger?.length || 0}</p></div>
        </div>
        <div>
          <p className="text-[10px] text-muted uppercase">Variação linguística</p>
          <div className="space-y-1 mt-2">
            {(result.transcript || []).filter((entry) => entry.role === 'user').map((entry, index) => (
              <p key={`${result.case_id}-${index}`} className="text-[11px] text-muted">• {entry.text || entry.intent}</p>
            ))}
          </div>
        </div>
      </div>
    </details>
  )
}

export default function LunaEvalDashboard({ tenantId, canEdit }) {
  const [plan, setPlan] = useState(null)
  const [report, setReport] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!tenantId) {
      setPlan(null)
      setReport(null)
      return
    }
    const saved = safeParse(window.localStorage.getItem(storageKey(tenantId)))
    setPlan(saved?.plan || null)
    setReport(saved?.report || null)
  }, [tenantId])

  const scenarios = useMemo(() => scenarioSummary(plan, report), [plan, report])
  const failedResults = useMemo(() => (report?.results || []).filter((entry) => !entry.ok), [report])

  function persist(nextPlan, nextReport) {
    window.localStorage.setItem(storageKey(tenantId), JSON.stringify({ plan: nextPlan, report: nextReport }))
  }

  async function prepare() {
    if (!tenantId || !canEdit || running) return
    setRunning(true)
    setError('')
    try {
      const response = await prepareLunaEvalPlatform({ tenantId })
      setPlan(response.data)
      setReport(null)
      persist(response.data, null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao preparar os cenários determinísticos.')
    } finally {
      setRunning(false)
    }
  }

  async function run(scenarioNames = []) {
    if (!tenantId || !canEdit || running) return
    setRunning(true)
    setError('')
    try {
      const response = await runLunaEvalPlatform({ tenantId, scenarioNames, maxCases: 500 })
      const nextReport = response.data
      setReport(nextReport)
      persist(plan, nextReport)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao executar as regressões determinísticas.')
    } finally {
      setRunning(false)
    }
  }

  function clear() {
    window.localStorage.removeItem(storageKey(tenantId))
    setPlan(null)
    setReport(null)
    setError('')
  }

  return (
    <div className="bg-card border border-primary/15 rounded-3xl p-8 shadow-sm space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h3 className="text-lg font-display font-bold text-text">Luna Eval Platform — regressões determinísticas</h3>
            <p className="text-sm text-muted mt-1 max-w-3xl">
              Compila especificações canônicas em variações linguísticas e executa tudo com relógio, catálogo, agenda, persistência e IDs simulados. Não chama a LLM, não usa créditos e não grava dados no Supabase.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!plan && <button type="button" className="btn btn-primary gap-2" disabled={!canEdit || running} onClick={prepare}><Gauge size={16} /> Preparar plataforma</button>}
          {plan && <button type="button" className="btn btn-primary gap-2" disabled={!canEdit || running} onClick={() => run([])}>{running ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />} Executar {plan.case_count} casos</button>}
          {report && <button type="button" className="btn btn-secondary gap-2" onClick={() => downloadJson(`luna-eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, report)}><Download size={16} /> Baixar relatório</button>}
          {plan && !running && <button type="button" className="btn btn-secondary" onClick={clear}>Limpar</button>}
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}

      {plan && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] text-muted uppercase">Especificações</p><p className="text-2xl font-black text-text mt-1">{plan.scenario_count}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] text-muted uppercase">Casos compilados</p><p className="text-2xl font-black text-text mt-1">{plan.case_count}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] text-muted uppercase">Aprovados</p><p className="text-2xl font-black text-emerald-300 mt-1">{report?.passed ?? '-'}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] text-muted uppercase">Falhas</p><p className={`text-2xl font-black mt-1 ${report?.failed ? 'text-red-300' : 'text-text'}`}>{report?.failed ?? '-'}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] text-muted uppercase">Duração</p><p className="text-2xl font-black text-text mt-1">{report ? formatMilliseconds(report.duration_ms) : '-'}</p></div>
        </div>
      )}

      {report?.failure_groups?.length > 0 && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 space-y-3">
          <p className="text-xs font-black uppercase tracking-wider text-red-300">Grupos de falha</p>
          {report.failure_groups.map((group) => (
            <div key={group.signature} className="rounded-xl border border-red-500/20 bg-black/10 p-4">
              <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-red-200">{group.code}</p><span className="text-xs text-red-300">{group.count} casos</span></div>
              <p className="text-[11px] text-muted mt-1 break-words">{group.message}</p>
              <p className="text-[10px] text-muted mt-2">{group.signature} · {group.scenarios.join(', ')}</p>
            </div>
          ))}
        </div>
      )}

      {plan && (
        <div className="space-y-3">
          {scenarios.map((scenario) => (
            <details key={scenario.name} className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
              <summary className="cursor-pointer list-none px-5 py-4 flex items-center gap-3">
                {scenario.executed > 0 && scenario.failed === 0 && <CheckCircle2 size={18} className="text-emerald-400" />}
                {scenario.failed > 0 && <XCircle size={18} className="text-red-400" />}
                <div className="min-w-0 flex-1"><p className="text-sm font-bold text-text">{scenario.title}</p><p className="text-xs text-muted mt-1">{scenario.case_count} variações · {(scenario.tags || []).join(' · ')}</p></div>
                <button type="button" className="btn btn-secondary text-xs" disabled={!canEdit || running} onClick={(event) => { event.preventDefault(); run([scenario.name]) }}>Executar somente este</button>
              </summary>
              <div className="border-t border-white/10 p-5 space-y-3">
                {(report?.results || []).filter((entry) => entry.scenario_name === scenario.name).map((result) => <ResultDetails key={result.case_id} result={result} />)}
                {!scenario.executed && <p className="text-xs text-muted">Ainda não executado.</p>}
              </div>
            </details>
          ))}
        </div>
      )}

      {report && failedResults.length === 0 && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          Todas as variações determinísticas foram aprovadas. O diagnóstico real de 50 cenários continua disponível abaixo para a camada com catálogo, banco e LLM reais.
        </div>
      )}
    </div>
  )
}
