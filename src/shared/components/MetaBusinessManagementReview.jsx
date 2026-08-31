import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react'
import {
  getMetaBusinessReview,
  verifyMetaBusinessReviewAdAccount,
} from '../../lib/metaBusinessReviewApi'

function ResultBanner({ result }) {
  if (!result?.text) return null
  const success = result.type === 'success'
  const warning = result.type === 'warning'
  const classes = success
    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
    : warning
      ? 'border-amber-500/20 bg-amber-500/10 text-amber-100'
      : 'border-red-500/20 bg-red-500/10 text-red-200'
  const Icon = success ? CheckCircle2 : warning ? AlertTriangle : ShieldCheck

  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${classes}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <span>{result.text}</span>
    </div>
  )
}

function accountIdentity(account) {
  return account?.id || (account?.accountId ? `act_${account.accountId}` : '')
}

function normalizeBusinessId(value) {
  return String(value || '').replace(/\D/g, '')
}

export default function MetaBusinessManagementReview({ tenantId }) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [businessIdInput, setBusinessIdInput] = useState('')
  const [businessPortfolio, setBusinessPortfolio] = useState(null)
  const [adAccounts, setAdAccounts] = useState([])
  const [selectedAdAccountId, setSelectedAdAccountId] = useState('')
  const [verifiedAccount, setVerifiedAccount] = useState(null)
  const [verification, setVerification] = useState(null)
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState(null)

  const storageKey = useMemo(
    () => tenantId ? `yuisync.meta.business-id.${tenantId}` : '',
    [tenantId],
  )

  const selectedAccount = useMemo(
    () => adAccounts.find((account) => accountIdentity(account) === selectedAdAccountId) || null,
    [adAccounts, selectedAdAccountId],
  )

  const loadAssets = async ({ businessId = businessIdInput, silent = false } = {}) => {
    if (!tenantId) {
      setLoading(false)
      return
    }

    if (silent) setRefreshing(true)
    else setLoading(true)

    try {
      const normalizedBusinessId = normalizeBusinessId(businessId)
      const payload = await getMetaBusinessReview({
        tenantId,
        moduleId: 'petshop',
        businessId: normalizedBusinessId,
      })

      setBusinessPortfolio(payload.businessPortfolio || null)
      setAdAccounts(payload.adAccounts || [])
      setVerifiedAccount(null)
      setVerification(null)

      const resolvedBusinessId = normalizeBusinessId(payload.businessPortfolio?.id || normalizedBusinessId)
      if (resolvedBusinessId) {
        setBusinessIdInput(resolvedBusinessId)
        if (storageKey) window.localStorage.setItem(storageKey, resolvedBusinessId)
      }

      if (payload.needsBusinessId) {
        setResult({
          type: 'warning',
          text: `Automatic WABA owner lookup was not available. Enter the Meta Business Portfolio ID below and load the Ad Accounts. ${payload.autoResolveError || ''}`.trim(),
        })
      } else if ((payload.endpointErrors || []).length > 0) {
        setResult({
          type: 'warning',
          text: `Meta returned the available Ad Accounts, but one relationship endpoint could not be read: ${payload.endpointErrors.join(' | ')}`,
        })
      } else {
        setResult(null)
      }

      setSelectedAdAccountId((current) => {
        if (!current) return ''
        const stillExists = (payload.adAccounts || []).some((account) => accountIdentity(account) === current)
        return stillExists ? current : ''
      })
    } catch (error) {
      setBusinessPortfolio(null)
      setAdAccounts([])
      setSelectedAdAccountId('')
      setVerifiedAccount(null)
      setVerification(null)
      setResult({ type: 'error', text: error.message })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (!tenantId) {
      setLoading(false)
      return
    }

    const savedBusinessId = storageKey
      ? normalizeBusinessId(window.localStorage.getItem(storageKey))
      : ''
    setBusinessIdInput(savedBusinessId)
    void loadAssets({ businessId: savedBusinessId })
  }, [tenantId, storageKey])

  const submitBusinessId = async (event) => {
    event.preventDefault()
    const businessId = normalizeBusinessId(businessIdInput)
    if (!businessId) {
      setResult({ type: 'error', text: 'Enter the numeric Meta Business Portfolio ID.' })
      return
    }
    await loadAssets({ businessId })
  }

  const selectAccount = (account) => {
    setSelectedAdAccountId(accountIdentity(account))
    setVerifiedAccount(null)
    setVerification(null)
    setResult(null)
  }

  const verifySelectedAccount = async () => {
    const businessId = normalizeBusinessId(businessPortfolio?.id || businessIdInput)
    if (!tenantId || !selectedAccount || !businessId) return

    setVerifying(true)
    setResult(null)
    try {
      const payload = await verifyMetaBusinessReviewAdAccount({
        tenantId,
        moduleId: 'petshop',
        businessId,
        adAccountId: accountIdentity(selectedAccount),
      })
      setVerifiedAccount(payload.result?.adAccount || null)
      setVerification(payload.result || null)
      const account = payload.result?.adAccount || selectedAccount
      setResult({
        type: 'success',
        text: `Graph API verification completed for ${account.name || 'Ad Account'} (${accountIdentity(account)}).`,
      })
    } catch (error) {
      setResult({ type: 'error', text: error.message })
    } finally {
      setVerifying(false)
    }
  }

  return (
    <section
      className="rounded-3xl border border-[var(--border2)] bg-surface p-5 shadow-sm sm:p-7"
      data-meta-review="business_management"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
            <Building2 size={21} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">Step 4</p>
            <h2 className="mt-1 text-xl font-black text-text">Verify the Ad Account used by YuiSync</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              This section demonstrates the business_management use case requested by Meta. It shows the Business Portfolio, lists owned and shared Ad Accounts, requires an explicit account selection and repeats the same account identity during verification.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary shrink-0 gap-2"
          disabled={refreshing || loading || !tenantId}
          onClick={() => loadAssets({ businessId: businessPortfolio?.id || businessIdInput, silent: true })}
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          Refresh Ad Accounts
        </button>
      </div>

      {!tenantId ? (
        <div className="mt-6">
          <ResultBanner result={{ type: 'error', text: 'Select an active business before loading Meta business assets.' }} />
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <form onSubmit={submitBusinessId} className="rounded-2xl border border-[var(--border2)] bg-bg/40 p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <label className="space-y-2 text-sm font-bold text-text">
                Meta Business Portfolio ID
                <input
                  className="input w-full font-mono"
                  inputMode="numeric"
                  value={businessIdInput}
                  onChange={(event) => setBusinessIdInput(normalizeBusinessId(event.target.value))}
                  placeholder="Example: 1972385232742147"
                />
              </label>
              <button
                type="submit"
                className="btn btn-primary gap-2"
                disabled={loading || refreshing || !normalizeBusinessId(businessIdInput)}
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                Load this Business
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">
              This is a non-secret Meta asset ID. YuiSync keeps the system-user access token only on the server. The ID is saved only in this browser so the reviewer flow stays stable when the page is refreshed.
            </p>
          </form>

          {loading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--border2)] bg-bg/40 px-4 py-6 text-sm text-muted">
              <Loader2 size={18} className="animate-spin" /> Loading Business Portfolio and Ad Accounts from Meta...
            </div>
          ) : (
            <>
              <ResultBanner result={result} />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-blue-200/70">Connected Business Portfolio</p>
                  <p className="mt-2 text-base font-black text-blue-100">{businessPortfolio?.name || 'Waiting for Business ID'}</p>
                  <p className="mt-1 break-all font-mono text-xs text-blue-100/70">Business ID: {businessPortfolio?.id || normalizeBusinessId(businessIdInput) || '-'}</p>
                </div>
                <div className="rounded-2xl border border-[var(--border2)] bg-bg/40 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-muted">Graph API sources</p>
                  <p className="mt-2 text-sm font-black text-text">Owned + shared Ad Accounts</p>
                  <p className="mt-1 break-all font-mono text-xs text-muted">/{businessPortfolio?.id || normalizeBusinessId(businessIdInput) || 'BUSINESS_ID'}/owned_ad_accounts</p>
                  <p className="mt-1 break-all font-mono text-xs text-muted">/{businessPortfolio?.id || normalizeBusinessId(businessIdInput) || 'BUSINESS_ID'}/client_ad_accounts</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-[var(--border2)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border2)] bg-bg/50 px-4 py-3">
                  <div>
                    <h3 className="font-black text-text">Ad Accounts returned by Meta</h3>
                    <p className="mt-1 text-xs text-muted">Choose one account explicitly before verifying access.</p>
                  </div>
                  <span className="text-xs font-bold text-muted">{adAccounts.length} account(s)</span>
                </div>

                {adAccounts.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted">
                    No Ad Accounts loaded yet. Enter the Business Portfolio ID above if automatic discovery is unavailable.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--border2)]">
                    {adAccounts.map((account) => {
                      const identity = accountIdentity(account)
                      const selected = identity === selectedAdAccountId
                      return (
                        <button
                          key={identity}
                          type="button"
                          className={`flex w-full flex-col gap-3 px-4 py-4 text-left transition sm:flex-row sm:items-center sm:justify-between ${selected
                            ? 'bg-emerald-500/10'
                            : 'bg-transparent hover:bg-bg/40'}`}
                          onClick={() => selectAccount(account)}
                        >
                          <span>
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-black text-text">{account.name || 'Unnamed Ad Account'}</span>
                              <span className="rounded-full border border-[var(--border2)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-muted">
                                {account.relationship === 'client' ? 'Shared' : 'Owned'}
                              </span>
                            </span>
                            <span className="mt-1 block break-all font-mono text-xs text-muted">Ad Account ID: {identity}</span>
                          </span>
                          <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${selected
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-[var(--border2)] text-muted'}`}
                          >
                            {selected && <CheckCircle2 size={13} />}
                            {selected ? 'Selected' : 'Select this account'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {selectedAccount && (
                <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/10 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Selected Ad Account</p>
                  <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-lg font-black text-emerald-100">{selectedAccount.name || 'Unnamed Ad Account'}</p>
                      <p className="mt-1 break-all font-mono text-sm text-emerald-100/80">Ad Account ID: {accountIdentity(selectedAccount)}</p>
                      <p className="mt-2 text-xs leading-5 text-emerald-100/70">
                        This exact identity remains visible while YuiSync verifies the same account through the Meta Graph API.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary shrink-0 gap-2"
                      disabled={verifying}
                      onClick={verifySelectedAccount}
                    >
                      {verifying ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                      Verify selected account through Graph API
                    </button>
                  </div>
                </div>
              )}

              {verifiedAccount && (
                <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-blue-200" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-200">Same account confirmed by Meta</p>
                      <p className="mt-2 text-lg font-black text-blue-100">{verifiedAccount.name || 'Unnamed Ad Account'}</p>
                      <p className="mt-1 break-all font-mono text-sm text-blue-100/80">Ad Account ID: {accountIdentity(verifiedAccount)}</p>
                      <p className="mt-3 text-xs leading-5 text-blue-100/70">
                        Business Portfolio: {verification?.businessPortfolio?.name || businessPortfolio?.name || '-'} ({verification?.businessPortfolio?.id || businessPortfolio?.id || '-'})
                      </p>
                      <p className="mt-1 break-all font-mono text-xs text-blue-100/60">
                        Graph API: {verification?.graphEndpoint || '-'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
