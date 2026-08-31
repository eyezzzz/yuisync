import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FilePlus2,
  Link2,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Save,
  ShieldCheck,
  Webhook,
} from 'lucide-react'
import { useAuthCtx } from '../../context/AuthContext'
import MetaBusinessManagementReview from '../components/MetaBusinessManagementReview'
import {
  createMetaWhatsappTemplate,
  getMetaWhatsappReview,
  saveMetaWhatsappAssetIds,
  sendMetaWhatsappReviewMessage,
  subscribeMetaWhatsappBusinessAccount,
} from '../../lib/api'

function createReviewTemplateName() {
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('')
  return `yuisync_review_${stamp}`
}

function ResultBanner({ result }) {
  if (!result?.text) return null
  const success = result.type === 'success'
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${success
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
      : 'border-red-500/20 bg-red-500/10 text-red-200'}`}
    >
      {success ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
      <span>{result.text}</span>
    </div>
  )
}

function StatusPill({ enabled, children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${enabled
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
      : 'border-amber-500/20 bg-amber-500/10 text-amber-200'}`}
    >
      {enabled ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
      {children}
    </span>
  )
}

function SectionCard({ icon: Icon, step, title, description, children }) {
  return (
    <section className="rounded-3xl border border-[var(--border2)] bg-surface p-5 shadow-sm sm:p-7">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
          <Icon size={21} />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-400">Step {step}</p>
          <h2 className="mt-1 text-xl font-black text-text">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  )
}

export default function MetaWhatsappPage() {
  const { activeTenantId } = useAuthCtx()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState(null)
  const [templates, setTemplates] = useState([])
  const [pageResult, setPageResult] = useState(null)

  const [assetForm, setAssetForm] = useState({ businessAccountId: '', phoneNumberId: '' })
  const [savingAssets, setSavingAssets] = useState(false)
  const [subscribing, setSubscribing] = useState(false)

  const [messageForm, setMessageForm] = useState({
    to: '',
    message: 'Hello from YuiSync. This message was sent through the WhatsApp Cloud API for Meta App Review.',
  })
  const [sending, setSending] = useState(false)
  const [messageResult, setMessageResult] = useState(null)

  const [templateForm, setTemplateForm] = useState({
    name: createReviewTemplateName(),
    category: 'UTILITY',
    language: 'en_US',
    bodyText: 'Your appointment has been confirmed. Contact us in this WhatsApp conversation if you need to change it.',
  })
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [refreshingTemplates, setRefreshingTemplates] = useState(false)
  const [templateResult, setTemplateResult] = useState(null)

  const permissionText = useMemo(
    () => (status?.permissions || []).join(', '),
    [status?.permissions],
  )

  const loadReviewData = async ({ includeTemplates = true, silent = false } = {}) => {
    if (!activeTenantId) {
      setLoading(false)
      return
    }

    if (!silent) setLoading(true)
    try {
      const payload = await getMetaWhatsappReview({
        tenantId: activeTenantId,
        moduleId: 'petshop',
        includeTemplates,
      })
      setStatus(payload.status || null)
      setTemplates(payload.templates || [])
      setAssetForm((current) => ({
        businessAccountId: payload.status?.businessAccountId || current.businessAccountId,
        phoneNumberId: payload.status?.phoneNumberId || current.phoneNumberId,
      }))
      setPageResult(null)
    } catch (error) {
      setPageResult({ type: 'error', text: error.message })
    } finally {
      setLoading(false)
      setRefreshingTemplates(false)
    }
  }

  useEffect(() => {
    loadReviewData()
  }, [activeTenantId])

  const saveAssets = async (event) => {
    event.preventDefault()
    if (!activeTenantId) return
    setSavingAssets(true)
    setPageResult(null)
    try {
      const payload = await saveMetaWhatsappAssetIds({
        tenantId: activeTenantId,
        moduleId: 'petshop',
        ...assetForm,
      })
      setStatus(payload.status || status)
      setPageResult({ type: 'success', text: 'Meta asset IDs saved. Access tokens remain server-side.' })
      await loadReviewData({ includeTemplates: true, silent: true })
    } catch (error) {
      setPageResult({ type: 'error', text: error.message })
    } finally {
      setSavingAssets(false)
    }
  }

  const subscribeWaba = async () => {
    if (!activeTenantId) return
    setSubscribing(true)
    setPageResult(null)
    try {
      await subscribeMetaWhatsappBusinessAccount({
        tenantId: activeTenantId,
        moduleId: 'petshop',
      })
      setPageResult({ type: 'success', text: 'The WhatsApp Business Account is subscribed to this app webhook.' })
    } catch (error) {
      setPageResult({ type: 'error', text: error.message })
    } finally {
      setSubscribing(false)
    }
  }

  const sendMessage = async (event) => {
    event.preventDefault()
    if (!activeTenantId) return
    setSending(true)
    setMessageResult(null)
    try {
      const payload = await sendMetaWhatsappReviewMessage({
        tenantId: activeTenantId,
        moduleId: 'petshop',
        ...messageForm,
      })
      const messageId = payload.result?.messages?.[0]?.id
      setMessageResult({
        type: 'success',
        text: messageId
          ? `Message sent successfully. Meta message ID: ${messageId}`
          : 'Message sent successfully through the WhatsApp Cloud API.',
      })
    } catch (error) {
      setMessageResult({ type: 'error', text: error.message })
    } finally {
      setSending(false)
    }
  }

  const createTemplate = async (event) => {
    event.preventDefault()
    if (!activeTenantId) return
    setCreatingTemplate(true)
    setTemplateResult(null)
    try {
      const payload = await createMetaWhatsappTemplate({
        tenantId: activeTenantId,
        moduleId: 'petshop',
        ...templateForm,
      })
      const result = payload.result || {}
      setTemplateResult({
        type: 'success',
        text: `Template created through the Graph API. ID: ${result.id || 'returned by Meta'}, status: ${result.status || 'PENDING'}.`,
      })
      setTemplateForm((current) => ({ ...current, name: createReviewTemplateName() }))
      await loadReviewData({ includeTemplates: true, silent: true })
    } catch (error) {
      setTemplateResult({ type: 'error', text: error.message })
    } finally {
      setCreatingTemplate(false)
    }
  }

  const refreshTemplates = async () => {
    setRefreshingTemplates(true)
    setTemplateResult(null)
    await loadReviewData({ includeTemplates: true, silent: true })
  }

  const copyHostedLink = async () => {
    try {
      await navigator.clipboard.writeText(status?.hostedSignupUrl || '')
      setPageResult({ type: 'success', text: 'Hosted Embedded Signup link copied.' })
    } catch {
      setPageResult({ type: 'error', text: 'The browser could not copy the hosted onboarding link.' })
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-muted">
          <Loader2 className="animate-spin" size={20} /> Loading Meta WhatsApp review workspace...
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-transparent p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-400">Meta App Review</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-text sm:text-4xl">WhatsApp Business Platform</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted sm:text-base">
              This English-language workspace demonstrates the complete server-to-server use cases requested by Meta: onboarding, sending a WhatsApp message and managing message templates.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill enabled={Boolean(status?.canSendMessages)}>Messaging API</StatusPill>
            <StatusPill enabled={Boolean(status?.canManageTemplates)}>Template Management</StatusPill>
          </div>
        </div>

        <div className="mt-6 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[var(--border2)] bg-surface/70 p-4">
            <p className="font-bold uppercase tracking-wider text-muted">Authentication</p>
            <p className="mt-2 font-black text-text">System-user token</p>
          </div>
          <div className="rounded-2xl border border-[var(--border2)] bg-surface/70 p-4">
            <p className="font-bold uppercase tracking-wider text-muted">Phone Number ID</p>
            <p className="mt-2 break-all font-black text-text">{status?.phoneNumberId || 'Not configured'}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border2)] bg-surface/70 p-4">
            <p className="font-bold uppercase tracking-wider text-muted">WABA ID</p>
            <p className="mt-2 break-all font-black text-text">{status?.businessAccountId || 'Not configured'}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border2)] bg-surface/70 p-4">
            <p className="font-bold uppercase tracking-wider text-muted">Credential source</p>
            <p className="mt-2 font-black capitalize text-text">{status?.source || 'Not configured'}</p>
          </div>
        </div>
      </header>

      <ResultBanner result={pageResult} />

      {!activeTenantId && (
        <ResultBanner result={{ type: 'error', text: 'Select an active business before managing its WhatsApp integration.' }} />
      )}

      <SectionCard
        icon={Link2}
        step="1"
        title="Onboard the business with Meta Hosted Embedded Signup"
        description="The business owner completes the official Meta flow. YuiSync does not request or display the user’s Facebook profile data. The operational access token is used only by the backend."
      >
        <div className="flex flex-wrap gap-3">
          <a
            className="btn btn-primary gap-2"
            href={status?.hostedSignupUrl || '#'}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={15} /> Open Meta hosted onboarding
          </a>
          <button type="button" className="btn btn-secondary gap-2" onClick={copyHostedLink}>
            <Clipboard size={15} /> Copy onboarding link
          </button>
        </div>

        <form onSubmit={saveAssets} className="mt-6 grid gap-4 rounded-2xl border border-[var(--border2)] bg-bg/40 p-4 md:grid-cols-2">
          <label className="space-y-2 text-sm font-bold text-text">
            WhatsApp Business Account ID
            <input
              className="input w-full"
              inputMode="numeric"
              value={assetForm.businessAccountId}
              onChange={(event) => setAssetForm((current) => ({ ...current, businessAccountId: event.target.value }))}
              placeholder="Example: 123456789012345"
            />
          </label>
          <label className="space-y-2 text-sm font-bold text-text">
            Phone Number ID
            <input
              className="input w-full"
              inputMode="numeric"
              value={assetForm.phoneNumberId}
              onChange={(event) => setAssetForm((current) => ({ ...current, phoneNumberId: event.target.value }))}
              placeholder="Example: 123456789012345"
            />
          </label>
          <div className="flex flex-wrap gap-3 md:col-span-2">
            <button type="submit" className="btn btn-primary gap-2" disabled={savingAssets || !activeTenantId}>
              {savingAssets ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Save Meta asset IDs
            </button>
            <button
              type="button"
              className="btn btn-secondary gap-2"
              disabled={subscribing || !status?.canManageTemplates}
              onClick={subscribeWaba}
            >
              {subscribing ? <Loader2 size={15} className="animate-spin" /> : <Webhook size={15} />}
              Subscribe WABA to app webhook
            </button>
          </div>
          <p className="text-xs leading-5 text-muted md:col-span-2">
            Only non-secret Meta asset IDs are saved here. The system-user access token and App Secret stay in server-side environment variables or protected backend storage.
          </p>
        </form>
      </SectionCard>

      <SectionCard
        icon={MessageSquareText}
        step="2"
        title="Send a WhatsApp message"
        description="Record this section together with WhatsApp Web or the mobile app receiving the same message. The Graph API call is executed by the YuiSync backend."
      >
        <form onSubmit={sendMessage} className="space-y-4">
          <label className="block space-y-2 text-sm font-bold text-text">
            Recipient number in international format
            <input
              className="input w-full"
              inputMode="tel"
              value={messageForm.to}
              onChange={(event) => setMessageForm((current) => ({ ...current, to: event.target.value }))}
              placeholder="Example: 5532985205279"
              required
            />
          </label>
          <label className="block space-y-2 text-sm font-bold text-text">
            Message
            <textarea
              className="input min-h-28 w-full resize-y py-3"
              value={messageForm.message}
              onChange={(event) => setMessageForm((current) => ({ ...current, message: event.target.value }))}
              required
            />
          </label>
          <button type="submit" className="btn btn-primary gap-2" disabled={sending || !status?.canSendMessages}>
            {sending ? <Loader2 size={15} className="animate-spin" /> : <MessageSquareText size={15} />}
            Send through WhatsApp Cloud API
          </button>
          <ResultBanner result={messageResult} />
          {!status?.canSendMessages && (
            <p className="text-xs text-amber-300">Configure the Phone Number ID and system-user access token before recording this use case.</p>
          )}
        </form>
      </SectionCard>

      <SectionCard
        icon={FilePlus2}
        step="3"
        title="Create and manage a message template"
        description="Meta requires a separate video showing a real template creation API call. Submit this form, keep the success response visible, then refresh the list below."
      >
        <form onSubmit={createTemplate} className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm font-bold text-text">
            Template name
            <input
              className="input w-full"
              value={templateForm.name}
              onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
              required
            />
          </label>
          <label className="space-y-2 text-sm font-bold text-text">
            Language
            <select
              className="input w-full"
              value={templateForm.language}
              onChange={(event) => setTemplateForm((current) => ({ ...current, language: event.target.value }))}
            >
              <option value="en_US">English (US)</option>
              <option value="pt_BR">Portuguese (Brazil)</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-bold text-text">
            Category
            <select
              className="input w-full"
              value={templateForm.category}
              onChange={(event) => setTemplateForm((current) => ({ ...current, category: event.target.value }))}
            >
              <option value="UTILITY">UTILITY</option>
              <option value="MARKETING">MARKETING</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-bold text-text md:col-span-2">
            Template body
            <textarea
              className="input min-h-28 w-full resize-y py-3"
              value={templateForm.bodyText}
              onChange={(event) => setTemplateForm((current) => ({ ...current, bodyText: event.target.value }))}
              required
            />
          </label>
          <div className="flex flex-wrap gap-3 md:col-span-2">
            <button type="submit" className="btn btn-primary gap-2" disabled={creatingTemplate || !status?.canManageTemplates}>
              {creatingTemplate ? <Loader2 size={15} className="animate-spin" /> : <FilePlus2 size={15} />}
              Create template through Graph API
            </button>
            <button type="button" className="btn btn-secondary gap-2" disabled={refreshingTemplates || !status?.canManageTemplates} onClick={refreshTemplates}>
              <RefreshCw size={15} className={refreshingTemplates ? 'animate-spin' : ''} /> Refresh templates
            </button>
          </div>
          <div className="md:col-span-2"><ResultBanner result={templateResult} /></div>
        </form>

        <div className="mt-7 overflow-hidden rounded-2xl border border-[var(--border2)]">
          <div className="flex items-center justify-between border-b border-[var(--border2)] bg-bg/50 px-4 py-3">
            <h3 className="font-black text-text">Templates returned by Meta</h3>
            <span className="text-xs font-bold text-muted">{templates.length} item(s)</span>
          </div>
          {templates.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">No templates loaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-bg/40 text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Language</th>
                    <th className="px-4 py-3">Meta ID</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template) => (
                    <tr key={template.id || `${template.name}-${template.language}`} className="border-t border-[var(--border2)] text-text">
                      <td className="px-4 py-3 font-bold">{template.name}</td>
                      <td className="px-4 py-3">{template.status || 'UNKNOWN'}</td>
                      <td className="px-4 py-3">{template.category || '-'}</td>
                      <td className="px-4 py-3">{template.language || '-'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted">{template.id || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>

      <MetaBusinessManagementReview tenantId={activeTenantId} />

      <section className="rounded-3xl border border-blue-500/20 bg-blue-500/10 p-5 sm:p-7">
        <div className="flex items-start gap-4">
          <ShieldCheck size={24} className="mt-0.5 shrink-0 text-blue-300" />
          <div className="space-y-3">
            <h2 className="text-lg font-black text-blue-100">Notes for the Meta reviewer</h2>
            <p className="text-sm leading-6 text-blue-100/80">{status?.reviewerNote}</p>
            <p className="text-sm leading-6 text-blue-100/80">
              Requested advanced permissions: <strong>{permissionText || 'business_management, whatsapp_business_management, whatsapp_business_messaging'}</strong>.
            </p>
            <p className="text-sm leading-6 text-blue-100/80">
              The hosted Meta onboarding screen may show the Meta authentication and consent experience. After onboarding, all Graph API calls shown on this page are server-to-server.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
