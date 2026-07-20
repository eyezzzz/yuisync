import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { 
  CreditCard, Search, CheckCircle2, Clock, 
  AlertTriangle, ExternalLink, FileText, Settings, 
  DownloadCloud, UploadCloud, FilePlus, RefreshCw, Receipt,
  ArrowLeft, Building2, Hash, Calendar, ShoppingBag, Eye, X, Trash2, Copy, Check
} from 'lucide-react'
import { useFinance } from '../hooks/useFinance'
import { useModuleCtx } from '../../context/ModuleContext'
import { fmtCurrency } from '../../lib/supabase'
import { useAuthCtx } from '../../context/AuthContext'
import { issueFiscalForSale } from '../../lib/api'
import { printThermalReceipt } from '../../lib/thermalPrint'

export default function BillingPage() {
  const { activeModule, activeModuleId } = useModuleCtx()
  const { profile } = useAuthCtx()
  const {
    invoices,
    loading,
    error,
    loadInvoices,
    createInvoice,
    updateStatus,
    deleteInvoice,
    importXmlInvoice,
    getBillingSettings,
    getFiscalAutomationStatus,
    publishGlobalFiscalPolicyVersion,
    syncGlobalFiscalPolicies,
    runFiscalAudit,
    loadFiscalAuditLogs,
  } = useFinance()
  const [copiedKey, setCopiedKey] = useState(false)
  
  const [tab, setTab] = useState('list') // 'list' | 'import'
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [billingSettings, setBillingSettings] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [isImporting, setIsImporting] = useState(false)
  const [xmlError, setXmlError] = useState('')
  const [xmlFileName, setXmlFileName] = useState('')
  const [saveStatus, setSaveStatus] = useState(null) 
  const [fiscalStatus, setFiscalStatus] = useState(null)
  const [fiscalLogs, setFiscalLogs] = useState([])
  const [fiscalBusy, setFiscalBusy] = useState(false)
  const [fiscalError, setFiscalError] = useState('')
  const [fiscalSuccess, setFiscalSuccess] = useState('')
  const [policyNotes, setPolicyNotes] = useState('')
  const [viewingInvoice, setViewingInvoice] = useState(null) // Modal de visualização
  const [issuingViewFiscal, setIssuingViewFiscal] = useState(false)
  const [viewFiscalMsg, setViewFiscalMsg] = useState('')
  const [viewFiscalErr, setViewFiscalErr] = useState('')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [createError, setCreateError] = useState('')
  const [newInvoice, setNewInvoice] = useState({
    amount: '',
    due_date: '',
    customer_phone: '',
    notes: '',
    status: 'pending',
  })
  
  const fileInputRef = useRef(null)
  const isGlobalAdmin = profile?.role === 'admin'

  async function reloadFiscalPanel() {
    if (activeModuleId !== 'petshop') {
      setFiscalStatus(null)
      setFiscalLogs([])
      return
    }

    try {
      const [status, logs] = await Promise.all([
        getFiscalAutomationStatus(),
        loadFiscalAuditLogs(30),
      ])
      setFiscalStatus(status)
      setFiscalLogs(logs || [])
      setFiscalError('')
    } catch (e) {
      setFiscalError(e.message || 'Falha ao carregar painel fiscal.')
    }
  }

  useEffect(() => {
    loadInvoices()
    getBillingSettings().then(setBillingSettings)
    reloadFiscalPanel()
  }, [loadInvoices, getBillingSettings, activeModuleId])

  async function handleRunFiscalAudit() {
    setFiscalBusy(true)
    setFiscalError('')
    setFiscalSuccess('')

    try {
      const result = await runFiscalAudit()
      await reloadFiscalPanel()
      setFiscalSuccess(`Auditoria concluida com ${result.inserted || 0} apontamentos.`)
    } catch (e) {
      setFiscalError(e.message || 'Falha ao rodar auditoria fiscal.')
    } finally {
      setFiscalBusy(false)
    }
  }

  async function handleSyncGlobalFiscal() {
    setFiscalBusy(true)
    setFiscalError('')
    setFiscalSuccess('')

    try {
      const syncedCount = await syncGlobalFiscalPolicies()
      await reloadFiscalPanel()
      setFiscalSuccess(`Politica fiscal sincronizada para ${syncedCount} instancias.`)
    } catch (e) {
      setFiscalError(e.message || 'Falha ao sincronizar politica fiscal.')
    } finally {
      setFiscalBusy(false)
    }
  }

  async function handlePublishGlobalPolicy() {
    setFiscalBusy(true)
    setFiscalError('')
    setFiscalSuccess('')

    try {
      const payloadNotes = policyNotes.trim()
      const version = await publishGlobalFiscalPolicyVersion({
        notes: payloadNotes || undefined,
      })
      await reloadFiscalPanel()
      setPolicyNotes('')
      if (version?.alreadyUpToDate) {
        setFiscalSuccess('Politica fiscal ja estava atualizada para esta versao.')
      } else {
        setFiscalSuccess(`Nova versao fiscal publicada: ${version.version_label}.`)
      }
    } catch (e) {
      setFiscalError(e.message || 'Falha ao publicar versao fiscal global.')
    } finally {
      setFiscalBusy(false)
    }
  }

  function openXmlPicker() {
    setTab('import')
    setXmlError('')
    setTimeout(() => fileInputRef.current?.click(), 60)
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsImporting(true); setImportResult(null); setSaveStatus(null); setXmlError(''); setXmlFileName(file.name || '')
    
    try {
      const res = await importXmlInvoice(file)
      if (res) {
        setImportResult(res)
        setSaveStatus('saved')
        await loadInvoices()
      }
    } catch (err) {
      console.error("Erro no upload:", err)
      setXmlError(err.message || 'Nao foi possivel importar o XML.')
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = "" 
    }
  }

  const getStatusBadge = (status) => ({
    paid:      { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Pago/Recebido', icon: CheckCircle2 },
    pending:   { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', label: 'Pendente', icon: Clock },
    overdue:   { cls: 'bg-red-500/10 text-red-400 border-red-500/20', label: 'Atrasado', icon: AlertTriangle },
    cancelled: { cls: 'bg-white/5 text-muted border-white/10', label: 'Cancelado', icon: AlertTriangle },
  }[status] || { cls: 'bg-white/5 text-muted border-white/10', label: status, icon: Clock })

  const filteredInvoices = invoices.filter(inv => {
    const matchesFilter = (inv.customer_phone || '').includes(filter) || (inv.notes || '').toLowerCase().includes(filter.toLowerCase())
    const matchesStatus = !statusFilter || inv.status === statusFilter
    return matchesFilter && matchesStatus
  })

  function resetCreateForm() {
    setNewInvoice({
      amount: '',
      due_date: '',
      customer_phone: '',
      notes: '',
      status: 'pending',
    })
    setCreateError('')
  }

  function openCreateModal() {
    resetCreateForm()
    setCreateModalOpen(true)
  }

  async function handleCreateInvoice() {
    const amount = Number(newInvoice.amount || 0)
    if (amount <= 0) {
      setCreateError('Informe um valor maior que zero.')
      return
    }
    if (!newInvoice.due_date) {
      setCreateError('Informe a data de vencimento.')
      return
    }

    setCreatingInvoice(true)
    setCreateError('')
    try {
      await createInvoice({
        amount,
        due_date: newInvoice.due_date,
        customer_phone: newInvoice.customer_phone || null,
        notes: newInvoice.notes || 'Fatura manual',
        status: newInvoice.status || 'pending',
      })
      setCreateModalOpen(false)
      resetCreateForm()
      await loadInvoices()
    } catch (e) {
      setCreateError(e.message || 'Falha ao criar fatura.')
    } finally {
      setCreatingInvoice(false)
    }
  }

  function getFiscalKeyFromInvoice(invoice) {
    return (
      invoice?.invoice_nfe_url
      || invoice?.fiscal?.document?.nfe_key
      || invoice?.fiscal?.invoice?.invoice_nfe_url
      || ''
    )
  }

  function formatDateSafe(value) {
    if (!value) return '--'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '--'
    return date.toLocaleDateString('pt-BR')
  }

  function openInvoiceViewer(invoice) {
    setViewingInvoice(invoice)
    setCopiedKey(false)
    setViewFiscalErr('')
    setViewFiscalMsg('')
  }

  function handleDownloadInvoiceReceipt(invoice = viewingInvoice) {
    if (!invoice) return
    const lines = [
      `Documento #${String(invoice.id || '').slice(0, 8).toUpperCase()}`,
      `Descricao: ${invoice.notes || 'Consumidor Final'}`,
      `Valor: ${fmtCurrency(invoice.amount || 0)}`,
      `Status: ${invoice.status || 'pending'}`,
      `Emissao: ${formatDateSafe(invoice.created_at)}`,
      `Vencimento: ${formatDateSafe(invoice.due_date)}`,
      `Fiscal: ${getFiscalKeyFromInvoice(invoice) || 'Nao vinculado'}`,
    ]

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `comprovante-${String(invoice.id || '').slice(0, 8)}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
  }

  function handleConsultFiscal(invoice = viewingInvoice) {
    const fiscalKey = getFiscalKeyFromInvoice(invoice)
    if (!fiscalKey) {
      setViewFiscalErr('Este documento ainda nao possui chave fiscal para consulta.')
      return
    }
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(fiscalKey).catch(() => {})
    }
    window.open('https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ+gAVw2g=', '_blank')
  }

  function handlePrintFiscal(invoice = viewingInvoice) {
    if (!invoice) return
    const fiscalPdfUrl = invoice?.fiscal?.document?.pdf_url
    if (fiscalPdfUrl) {
      window.open(fiscalPdfUrl, '_blank')
      return
    }

    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    const fiscalKey = getFiscalKeyFromInvoice(invoice)

    const html = `
      <html>
        <head>
          <style>
            @page { margin: 0; }
            * { box-sizing: border-box; }
            html, body { width: 80mm; height: auto !important; min-height: 0 !important; margin: 0; padding: 0; overflow: visible; }
            body { font-family: 'Courier New', Courier, monospace; padding: 6px; color: #000; }
            .receipt { width: 100%; height: auto; min-height: 0; break-after: avoid-page; page-break-after: avoid; }
            @media print { html, body { height: auto !important; min-height: 0 !important; } body, .receipt { position: absolute !important; top: 0 !important; left: 0 !important; } }
            .title { text-align: center; font-weight: bold; text-transform: uppercase; margin-bottom: 8px; }
            .line { display: flex; justify-content: space-between; margin: 4px 0; font-size: 12px; }
            .hr { border-bottom: 1px dashed #000; margin: 8px 0; }
            .key { font-size: 10px; word-break: break-all; }
          </style>
        </head>
        <body><main class="receipt">
          <div class="title">Cupom Fiscal</div>
          <div class="line"><span>ID</span><span>#${String(invoice.id || '').slice(0, 8).toUpperCase()}</span></div>
          <div class="line"><span>Descricao</span><span>${invoice.notes || 'Consumidor Final'}</span></div>
          <div class="line"><span>Valor</span><span>${fmtCurrency(invoice.amount || 0)}</span></div>
          <div class="line"><span>Status</span><span>${invoice?.fiscal?.document?.status || invoice?.fiscal_status || 'pending'}</span></div>
          <div class="hr"></div>
          <div class="key">${fiscalKey ? `Chave: ${fiscalKey}` : 'Chave fiscal indisponivel'}</div>
        </main></body>
      </html>
    `

    printWindow.document.write(html)
    printWindow.document.close()
    printThermalReceipt(printWindow)
  }

  async function handleIssueViewingInvoiceFiscal() {
    if (!viewingInvoice) return
    if (activeModuleId !== 'petshop') return
    if (!viewingInvoice.sale_id) {
      setViewFiscalErr('Esse documento nao tem venda vinculada. Emissao fiscal manual indisponivel aqui.')
      return
    }

    setIssuingViewFiscal(true)
    setViewFiscalErr('')
    setViewFiscalMsg('')
    try {
      const result = await issueFiscalForSale(viewingInvoice.sale_id)
      if (result?.status === 'runtime_missing') {
        setViewFiscalErr('Runtime fiscal nao habilitado no banco deste tenant.')
        return
      }

      setViewingInvoice((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          fiscal: result || null,
          invoice_nfe_url: result?.document?.nfe_key || result?.invoice?.invoice_nfe_url || prev.invoice_nfe_url,
          fiscal_status: result?.invoice?.fiscal_status || prev.fiscal_status,
          fiscal_document_id: result?.invoice?.fiscal_document_id || prev.fiscal_document_id,
        }
      })

      if (result?.document?.nfe_key || result?.invoice?.invoice_nfe_url) {
        setViewFiscalMsg('Cupom fiscal emitido/atualizado com sucesso.')
      } else {
        setViewFiscalMsg('Solicitacao fiscal enviada. Atualize em alguns segundos.')
      }
      await loadInvoices()
    } catch (errorIssue) {
      setViewFiscalErr(errorIssue?.message || 'Falha ao emitir cupom fiscal deste documento.')
    } finally {
      setIssuingViewFiscal(false)
    }
  }

  const viewingFiscalKey = getFiscalKeyFromInvoice(viewingInvoice)
  const viewingFiscalAuthorized = viewingInvoice?.fiscal?.document?.status === 'authorized'
    || viewingInvoice?.fiscal?.invoice?.fiscal_status === 'authorized'
    || viewingInvoice?.fiscal_status === 'authorized'
  const canIssueViewingFiscal = activeModuleId === 'petshop' && Boolean(viewingInvoice?.sale_id)
  const fiscalModeLabel = fiscalStatus?.tenantProfile?.mode === 'pinned' ? 'Configuracao fixa neste cliente' : 'Configuracao herdada da Focus / politica central'
  const fiscalNextStep = fiscalStatus?.enabled
    ? 'A YuiSync organiza a fila e o acompanhamento; a emissao fiscal fica terceirizada via Focus NFe.'
    : 'Quando o runtime fiscal estiver habilitado, esta tela passa a acompanhar a emissao terceirizada pela Focus NFe.'

  return (
    <div className="p-4 md:p-8 space-y-6 animate-fade-up max-w-7xl mx-auto pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-text">Financeiro e Fiscal</h1>
          <p className="text-muted mt-1">Caixa, cobrancas e acompanhamento da emissao terceirizada pela Focus NFe.</p>
        </div>
        
        <div className="flex gap-2">
            <button 
              onClick={() => (tab === 'import' ? setTab('list') : openXmlPicker())}
              className={`flex items-center gap-2 px-6 py-2.5 border rounded-xl transition-all text-sm font-bold shadow-lg ${
                 tab === 'import' ? 'bg-primary border-primary/20 text-bg shadow-primary/20' : 'bg-surface border-white/5 text-text hover:bg-white/5'
              }`}
            >
               {tab === 'import' ? <ArrowLeft size={16} /> : <UploadCloud size={16} />}
               {tab === 'import' ? 'Voltar para Lista' : 'Importar Nota XML'}
            </button>
           <button 
             onClick={async () => {
               if(confirm('Isso excluirá TODAS as faturas deste módulo. Tem certeza?')) {
                 if(confirm('TEM CERTEZA ABSOLUTA? Esta ação não pode ser desfeita.')) {
                   for(const inv of invoices) await deleteInvoice(inv.id)
                 }
               }
             }}
             className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-all text-sm font-bold shadow-lg"
           >
              <Trash2 size={16} /> Excluir Todas
           </button>
           <button onClick={openCreateModal} className="flex items-center gap-2 px-4 py-2 bg-text text-bg rounded-xl hover:bg-gray-300 transition-all text-sm font-bold shadow-lg shadow-white/5">
              <FilePlus size={16} /> Nova Fatura
           </button>
        </div>
      </header>

      {activeModuleId === 'petshop' && (
        <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4">
          <div className="rounded-3xl border border-[var(--border2)] bg-surface p-5 shadow-card">
            <p className="text-xs uppercase tracking-[0.18em] text-muted font-black">Como fica com a Focus NFe</p>
            <h2 className="text-xl font-display font-bold text-text mt-2">YuiSync organiza. Focus NFe emite.</h2>
            <p className="text-sm text-muted mt-2">{fiscalNextStep}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              <div className="rounded-2xl border border-[var(--border2)] bg-card px-4 py-3">
                <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Modelo</p>
                <p className="text-sm font-semibold text-text mt-1">Terceirizacao Focus NFe</p>
              </div>
              <div className="rounded-2xl border border-[var(--border2)] bg-card px-4 py-3">
                <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Configuracao atual</p>
                <p className="text-sm font-semibold text-text mt-1">{fiscalModeLabel}</p>
              </div>
              <div className="rounded-2xl border border-[var(--border2)] bg-card px-4 py-3">
                <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Proximo passo</p>
                <p className="text-sm font-semibold text-text mt-1">{fiscalStatus?.enabled ? 'Conferir fila, XML e status' : 'Habilitar runtime fiscal no banco'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--border2)] bg-surface p-5 shadow-card">
            <p className="text-xs uppercase tracking-[0.18em] text-muted font-black">Fluxo simples para voce e para o cliente</p>
            <div className="space-y-3 mt-4">
              <div className="rounded-2xl border border-[var(--border2)] bg-card px-4 py-3 text-sm text-text">1. Venda ou fatura registrada no sistema.</div>
              <div className="rounded-2xl border border-[var(--border2)] bg-card px-4 py-3 text-sm text-text">2. YuiSync acompanha a fila fiscal e mostra o status aqui.</div>
              <div className="rounded-2xl border border-[var(--border2)] bg-card px-4 py-3 text-sm text-text">3. Focus NFe cuida da emissao e do retorno do documento.</div>
              <div className="rounded-2xl border border-[var(--border2)] bg-card px-4 py-3 text-sm text-text">4. XML importado entra como documento de entrada e pode atualizar estoque.</div>
            </div>
          </div>
        </section>
      )}

      {activeModuleId === 'petshop' && (
        <section className="bg-surface border border-[var(--border2)] rounded-3xl p-5 md:p-6 shadow-card space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-display font-bold text-text">Automacao Fiscal Global</h2>
              <p className="text-sm text-muted mt-1">
                Politica central aplicada para todos os petshops (atuais e futuros).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={reloadFiscalPanel}
                disabled={fiscalBusy}
                className="btn btn-secondary"
              >
                Atualizar painel
              </button>
              <button
                onClick={handleRunFiscalAudit}
                disabled={fiscalBusy}
                className="btn btn-primary"
              >
                {fiscalBusy ? 'Processando...' : 'Rodar auditoria'}
              </button>
            </div>
          </div>

          {fiscalStatus?.enabled ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
                <p className="text-[10px] text-muted font-bold uppercase tracking-wider">Versao global ativa</p>
                <p className="text-sm font-bold text-text mt-1">
                  {fiscalStatus.activePolicy?.version_label || 'Sem versao ativa'}
                </p>
              </div>
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
                <p className="text-[10px] text-muted font-bold uppercase tracking-wider">Modo da instancia</p>
                <p className="text-sm font-bold text-text mt-1">
                  {fiscalStatus.tenantProfile?.mode === 'pinned' ? 'Fixada (pinned)' : 'Heranca automatica'}
                </p>
              </div>
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
                <p className="text-[10px] text-muted font-bold uppercase tracking-wider">Auto update</p>
                <p className="text-sm font-bold text-text mt-1">
                  {fiscalStatus.tenantProfile?.auto_update ? 'Ativado' : 'Desativado'}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-amber-300 text-sm">
              {fiscalStatus?.reason || 'Automacao fiscal ainda nao habilitada.'}
            </div>
          )}

          {isGlobalAdmin && (
            <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-text uppercase tracking-wider">Acoes globais (Admin)</p>
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  className="inp flex-1"
                  placeholder="Observacao da nova versao fiscal (opcional)"
                  value={policyNotes}
                  onChange={(event) => setPolicyNotes(event.target.value)}
                />
                <button onClick={handlePublishGlobalPolicy} disabled={fiscalBusy} className="btn btn-primary">
                  Publicar versao global
                </button>
                <button onClick={handleSyncGlobalFiscal} disabled={fiscalBusy} className="btn btn-secondary">
                  Sincronizar todos os clientes
                </button>
              </div>
            </div>
          )}

          {fiscalError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-red-300 text-sm">
              {fiscalError}
            </div>
          )}

          {fiscalSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 text-emerald-300 text-sm">
              {fiscalSuccess}
            </div>
          )}

          {fiscalLogs.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-muted font-bold uppercase tracking-wider">Ultimos apontamentos fiscais</p>
              <div className="space-y-2">
                {fiscalLogs.slice(0, 6).map((log) => (
                  <div key={log.id} className="bg-white/5 border border-white/5 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-text truncate">
                      {log.message}
                    </p>
                    <span className={`text-[10px] font-black uppercase ${
                      log.severity === 'error'
                        ? 'text-red-400'
                        : log.severity === 'warning'
                          ? 'text-amber-400'
                          : 'text-blue-400'
                    }`}>
                      {log.severity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'list' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <FinanceCard label="Total Recebido" val={fmtCurrency(invoices.filter(i => i.status === 'paid').reduce((acc, i) => acc + parseFloat(i.amount || 0), 0))} col="text-emerald-400" />
             <FinanceCard label="Pendente" val={fmtCurrency(invoices.filter(i => i.status === 'pending').reduce((acc, i) => acc + parseFloat(i.amount || 0), 0))} col="text-amber-400" />
             <FinanceCard label="Atrasado" val={fmtCurrency(invoices.filter(i => i.status === 'overdue').reduce((acc, i) => acc + parseFloat(i.amount || 0), 0))} col="text-red-500" />
          </div>

          <div className="bg-surface border border-[var(--border2)] rounded-3xl shadow-card overflow-hidden min-h-[400px]">
            <div className="p-4 bg-white/5 border-b border-[var(--border2)] flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex items-center gap-3 w-full md:w-auto">
                   <div className="relative flex-1 md:w-80">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                      <input className="inp pl-9 py-2 text-sm bg-bg border-none" placeholder="Buscar fornecedor ou descrição..." value={filter} onChange={e => setFilter(e.target.value)} />
                   </div>
                   <select className="p-2.5 bg-bg border-none rounded-xl text-sm font-bold text-muted" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                      <option value="">Todos Status</option>
                      <option value="paid">Pago</option>
                      <option value="pending">Pendente</option>
                   </select>
                </div>
            </div>

            <div className="overflow-x-auto">
               <table className="w-full text-left border-collapse">
                  <thead>
                     <tr className="border-b border-[var(--border2)] bg-black/10">
                        <th className="p-4 text-[10px] font-bold text-muted uppercase tracking-widest">Identificador</th>
                        <th className="p-4 text-[10px] font-bold text-muted uppercase tracking-widest">Descrição / Fornecedor</th>
                        <th className="p-4 text-[10px] font-bold text-muted uppercase tracking-widest text-center">Status</th>
                        <th className="p-4 text-[10px] font-bold text-muted uppercase tracking-widest text-right">Valor</th>
                        <th className="p-4 text-[10px] font-bold text-muted uppercase tracking-widest text-center">Ver Nota</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                     {loading && invoices.length === 0 ? (
                        <tr><td colSpan="5" className="p-12 text-center text-muted animate-pulse font-bold uppercase tracking-widest text-[10px]">Alinhando satélites financeiros...</td></tr>
                     ) : filteredInvoices.length === 0 ? (
                        <tr><td colSpan="5" className="p-12 text-center text-muted py-20">Nenhuma fatura encontrada com esses filtros.</td></tr>
                     ) : filteredInvoices.map((inv) => {
                        const status = getStatusBadge(inv.status)
                        return (
                           <tr key={inv.id} className="hover:bg-white/5 group border-b border-white/5 last:border-0 transition-colors">
                              <td className="p-4">
                                 <p className="font-bold text-sm text-text">#{inv.id.substring(0,8).toUpperCase()}</p>
                                 <p className="text-[10px] text-muted">Referência: {new Date(inv.created_at).toLocaleDateString('pt-BR')}</p>
                              </td>
                              <td className="p-4">
                                 <p className="text-sm font-bold text-text truncate max-w-[250px] uppercase">{inv.notes || 'Venda Consumidor'}</p>
                                 <p className="text-[10px] text-muted">{inv.customer_phone === 'NFe Entrada' ? 'Documento Fiscal Importado' : 'Transação Interna'}</p>
                              </td>
                              <td className="p-4 flex justify-center">
                                 <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-bold shadow-sm ${status.cls}`}>
                                    <status.icon size={12} /> {status.label}
                                 </div>
                              </td>
                              <td className="p-4 text-right font-display font-bold text-text text-lg">{fmtCurrency(inv.amount || 0)}</td>
                              <td className="p-4">
                                 <div className="flex justify-center gap-2">
                                     <button 
                                      onClick={() => openInvoiceViewer(inv)}
                                      className="p-2.5 bg-white/5 text-muted hover:text-text hover:bg-white/10 rounded-xl border border-white/5 transition-all"
                                    >
                                      <Eye size={18} />
                                    </button>
                                    <button 
                                       onClick={() => { if(confirm('Excluir fatura permanentemente?')) deleteInvoice(inv.id) }}
                                       className="p-2.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl border border-red-500/20 transition-all ml-1"
                                     >
                                       <Trash2 size={18} />
                                     </button>
                                 </div>
                              </td>
                           </tr>
                        )
                     })}
                  </tbody>
               </table>
            </div>
          </div>
        </>
      ) : (
        /* Import XML Section */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-5">
           <div className="bg-surface border border-[var(--border2)] rounded-3xl p-8 shadow-card flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-6 border border-amber-500/20">
                 <UploadCloud size={40} className="text-amber-500 animate-pulse" />
              </div>
              <h2 className="text-xl font-display font-bold text-text mb-2">Importar Nota Fiscal XML</h2>
              <p className="text-muted text-sm max-w-xs mb-8">Selecione um XML valido para importar como documento de entrada, despesa ou nota recebida do fornecedor.</p>
              <input type="file" accept=".xml" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
              <button disabled={isImporting} onClick={openXmlPicker} className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-bg font-bold rounded-2xl flex items-center justify-center gap-3 transition-colors shadow-lg shadow-amber-500/10">
                {isImporting ? 'Processando XML...' : 'Selecionar Arquivo'} <DownloadCloud size={20} />
              </button>
              {xmlFileName && <p className="text-xs text-muted mt-4">Ultimo arquivo selecionado: {xmlFileName}</p>}
              {xmlError && <p className="text-red-500 text-sm mt-4 font-bold flex items-center gap-2 bg-red-500/5 px-4 py-2 rounded-xl border border-red-500/10"><AlertTriangle size={14}/> {xmlError}</p>}
           </div>

           {importResult && (
             <div className="bg-surface border border-[var(--border2)] rounded-3xl p-6 shadow-card animate-in zoom-in-95">
                <div className="flex items-center justify-between mb-6 pb-6 border-b border-white/5">
                   <h3 className="font-display font-bold text-lg text-text">Resumo da Nota Importada</h3>
                   <div className={`px-3 py-1 border rounded-lg text-[10px] font-black uppercase tracking-tighter ${saveStatus === 'saved' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                      {saveStatus === 'saved' ? '✨ Gravado com Sucesso' : '🔎 Processado'}
                   </div>
                </div>
                <div className="space-y-4">
                   <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                         <p className="text-[10px] text-muted font-bold uppercase mb-1">Emitente</p>
                         <p className="text-sm font-bold text-text flex items-center gap-2 truncate uppercase"><Building2 size={14} className="text-muted" /> {importResult.emit_name}</p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                         <p className="text-[10px] text-muted font-bold uppercase mb-1">Chave NF-e</p>
                         <p className="text-sm font-bold text-text flex items-center gap-2"><Hash size={14} className="text-muted" /> {importResult.nfe_key.substring(0,8)}...</p>
                      </div>
                   </div>
                   <div className="p-6 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-center">
                      <p className="text-[10px] font-bold text-amber-500 uppercase mb-1 tracking-widest">Valor Total Liquidado</p>
                      <p className="text-3xl font-display font-bold text-text">{fmtCurrency(importResult.total_val)}</p>
                   </div>
                   <div className="max-h-48 overflow-y-auto custom-scrollbar pr-2">
                     <p className="text-[10px] font-bold text-muted uppercase mb-3 flex items-center gap-2"><ShoppingBag size={14} /> Itens da Nota ({importResult.itens?.length})</p>
                     {importResult.itens.map((item, idx) => (
                       <div key={idx} className="flex items-center justify-between p-3 bg-white/5 rounded-xl text-xs mb-2 border border-white/5">
                          <span className="font-medium text-text truncate max-w-[140px] uppercase">{item.name}</span>
                          <span className="text-text font-bold">{fmtCurrency(item.total)}</span>
                       </div>
                     ))}
                   </div>
                </div>
             </div>
           )}
        </div>
      )}

      {/* Modal de Nova Fatura */}
      {createModalOpen && createPortal(
        <div className="modal-overlay" onClick={() => setCreateModalOpen(false)}>
          <div className="modal-box max-w-xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <FilePlus className="text-primary" size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-display font-bold text-text">Nova Fatura</h3>
                  <p className="text-[10px] text-muted uppercase font-black tracking-widest mt-0.5">
                    Criacao manual de documento financeiro
                  </p>
                </div>
              </div>
              <button onClick={() => setCreateModalOpen(false)} className="text-muted hover:text-text p-2 ml-1">
                <X size={20} />
              </button>
            </div>

            <div className="modal-body space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-2">Valor (R$)</p>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="inp w-full"
                    placeholder="0,00"
                    value={newInvoice.amount}
                    onChange={(event) => setNewInvoice((prev) => ({ ...prev, amount: event.target.value }))}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-2">Vencimento</p>
                  <input
                    type="date"
                    className="inp w-full"
                    value={newInvoice.due_date}
                    onChange={(event) => setNewInvoice((prev) => ({ ...prev, due_date: event.target.value }))}
                  />
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-2">Telefone do cliente (opcional)</p>
                <input
                  type="text"
                  className="inp w-full"
                  placeholder="(11) 99999-9999"
                  value={newInvoice.customer_phone}
                  onChange={(event) => setNewInvoice((prev) => ({ ...prev, customer_phone: event.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-2">Status inicial</p>
                  <select
                    className="inp w-full"
                    value={newInvoice.status}
                    onChange={(event) => setNewInvoice((prev) => ({ ...prev, status: event.target.value }))}
                  >
                    <option value="pending">Pendente</option>
                    <option value="paid">Pago</option>
                    <option value="overdue">Atrasado</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
                <div>
                  <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-2">Descricao</p>
                  <input
                    type="text"
                    className="inp w-full"
                    placeholder="Ex: Servico petshop"
                    value={newInvoice.notes}
                    onChange={(event) => setNewInvoice((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>
              </div>

              {createError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-300 text-sm">
                  {createError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="flex-1 py-3 bg-secondary hover:bg-white/10 text-text font-black text-xs uppercase tracking-widest rounded-2xl transition-all border border-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateInvoice}
                  disabled={creatingInvoice}
                  className="flex-1 py-3 bg-text text-bg font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-gray-200 transition-all shadow-xl shadow-white/5 disabled:opacity-60"
                >
                  {creatingInvoice ? 'Salvando...' : 'Criar Fatura'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Visualização da Fatura */}
      {viewingInvoice && createPortal(
        <div className="modal-overlay" onClick={() => setViewingInvoice(null)}>
           <div className="modal-box max-w-2xl" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                 <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                       <FileText className="text-primary" size={22} />
                    </div>
                    <div>
                       <h3 className="text-lg font-display font-bold text-text">Datalhes do Documento</h3>
                       <p className="text-[9px] text-muted uppercase font-black tracking-widest leading-none mt-0.5">ID: #{viewingInvoice.id.substring(0,8).toUpperCase()}</p>
                    </div>
                 </div>
                 <button onClick={() => setViewingInvoice(null)} className="text-muted hover:text-text p-2 ml-1">
                    <X size={20} />
                 </button>
              </div>

              <div className="modal-body space-y-8">
                 <div className="grid grid-cols-2 gap-8 items-start">
                    <div>
                       <p className="text-[10px] font-black text-muted uppercase mb-2 tracking-widest">Fornecedor / Emitente</p>
                       <p className="text-lg font-bold text-text uppercase leading-tight">{viewingInvoice.notes || 'Consumidor Final'}</p>
                       <p className="text-[11px] text-muted mt-2 font-bold opacity-70">DATA EMISSÃO: {formatDateSafe(viewingInvoice.created_at)}</p>
                       <div className={`mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[10px] font-black uppercase tracking-tighter ${getStatusBadge(viewingInvoice.status).cls}`}>
                          <CheckCircle2 size={12} /> {getStatusBadge(viewingInvoice.status).label}
                       </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                       <p className="text-[10px] font-black text-muted uppercase mb-1 tracking-widest">Valor Liquidado</p>
                       <p className="text-4xl font-display font-black text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]">{fmtCurrency(viewingInvoice.amount)}</p>
                       <p className="text-[10px] text-muted mt-3 font-bold uppercase">Vencimento: {formatDateSafe(viewingInvoice.due_date)}</p>
                    </div>
                 </div>

                    {viewingFiscalKey && (
                        <div className="p-5 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between">
                           <div className="flex items-center gap-3">
                              <Hash className="text-primary/70" size={18} />
                              <div>
                                 <p className="text-[10px] font-black text-muted uppercase tracking-widest leading-none mb-1">Chave NF-e Fiscal</p>
                                 <p className="text-[11px] text-text/80 font-mono tracking-tight">{viewingFiscalKey}</p>
                              </div>
                           </div>
                           <div className="flex gap-2">
                             <button 
                                onClick={() => {
                                   navigator.clipboard.writeText(viewingFiscalKey)
                                   setCopiedKey(true)
                                   setTimeout(() => setCopiedKey(false), 2000)
                                }}
                                className={`p-2.5 rounded-xl border transition-all ${copiedKey ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-white/5 border-white/10 text-muted hover:text-text'}`}
                             >
                                {copiedKey ? <Check size={16} /> : <Copy size={16} />}
                             </button>
                              <button 
                                 onClick={() => handleConsultFiscal(viewingInvoice)}
                                 className="px-5 py-2.5 bg-primary text-bg text-[10px] font-black rounded-xl hover:bg-primary/90 transition-all flex items-center gap-2 shadow-lg"
                              >
                                <ExternalLink size={14} /> CONSULTAR SEFAZ
                             </button>
                           </div>
                        </div>
                     )}

                 {viewFiscalErr && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                      {viewFiscalErr}
                    </div>
                 )}

                 {viewFiscalMsg && (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                      {viewFiscalMsg}
                    </div>
                 )}

                 <div className="p-6 bg-white/3 rounded-2xl border border-white/5 border-dashed">
                    <p className="text-center text-muted text-[11px] font-medium leading-relaxed italic uppercase tracking-wider opacity-60">Processamento Digital YuiSync Cloud.<br/>Todas as transações são registradas via Ledger seguro.</p>
                 </div>

                 <div className="space-y-3 pt-2">
                    {activeModuleId === 'petshop' && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <button
                          type="button"
                          onClick={handleIssueViewingInvoiceFiscal}
                          disabled={issuingViewFiscal || !canIssueViewingFiscal || viewingFiscalAuthorized}
                          className="py-3 bg-primary text-bg font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {issuingViewFiscal ? <RefreshCw size={16} className="animate-spin" /> : <FileText size={16} />}
                          {viewingFiscalAuthorized ? 'Cupom Fiscal Emitido' : 'Emitir Cupom Fiscal'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConsultFiscal(viewingInvoice)}
                          disabled={!viewingFiscalKey}
                          className="py-3 bg-secondary hover:bg-white/10 text-text font-black text-xs uppercase tracking-widest rounded-2xl transition-all border border-white/5 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          <ExternalLink size={16} /> Consultar Fiscal
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintFiscal(viewingInvoice)}
                          disabled={!viewingInvoice?.fiscal && !viewingFiscalKey}
                          className="py-3 bg-secondary hover:bg-white/10 text-text font-black text-xs uppercase tracking-widest rounded-2xl transition-all border border-white/5 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          <Receipt size={16} /> Imprimir Cupom
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <button className="py-4 bg-secondary hover:bg-white/10 text-text font-black text-xs uppercase tracking-widest rounded-2xl transition-all border border-white/5" onClick={() => setViewingInvoice(null)}>
                        Fechar Visualização
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadInvoiceReceipt(viewingInvoice)}
                        className="py-4 bg-text text-bg font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-gray-200 transition-all shadow-xl shadow-white/5 flex items-center justify-center gap-2"
                      >
                         <DownloadCloud size={18} /> Baixar Comprovante
                      </button>
                    </div>
                 </div>
              </div>
           </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function FinanceCard({ label, val, col }) {
   return (
      <div className="bg-surface border border-white/5 p-6 rounded-3xl shadow-card transition-all hover:translate-y-[-4px] group relative overflow-hidden">
         <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <CreditCard size={48} className={col} />
         </div>
         <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-2 group-hover:text-text transition-colors">{label}</p>
         <p className={`text-3xl font-display font-black ${col} drop-shadow-sm`}>{val}</p>
      </div>
   )
}


