import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import {
  getMetaBusinessManagementReview,
  verifyMetaBusinessAdAccount,
} from '../../lib/api'

function ResultBanner({ result }) {
  if (!result?.text) return null
  const success = result.type === 'success'
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${success
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
      : 'border-red-500/20 bg-red-500/10 text-red-200'}`}
    >
      {success ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <ShieldCheck size={18} className="mt-0.5 shrink-0" />}
      <span>{result.text}</span>
    </div>
  )
}

function accountIdentity(account) {
  return account?.id || (account?.accountId ? `act_${account.accountId}` : '')
}

export default function MetaBusinessManagementReview({ tenantId }) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [businessPortfolio, setBusinessPortfolio] = useState(null)
  const [adAccounts, setAdAccounts] = useState([])
  const [selectedAdAccountId, setSelectedAdAccountId] = useState('')
  const [verifiedAccount, setVerifiedAccount] = useState(null)
  const [verification, setVerification] = useState(null)
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState(null)

  const selectedAccount = useMemo(
    () => adAccounts.find((account) => accountIdentity(account) === selectedAdAccountId) || null,
    [adAccounts, selectedAdAccountId],
  )

  const loadAssets = async ({ silent = false } = {}) => {
    if (!tenantId) {
      setLoading(false)
      return
    }

    if (silent) setRefreshing(true)
    else setLoading(true)

    try {
      const payload = await getMetaBusinessManagementReview({
        tenantId,
        moduleId: 'petshop',
      })
      setBusinessPortfolio(payload.businessPortfolio || null)
      setAdAccounts(payload.adAccounts || [])
      setVerifiedAccount(null)
      setVerification(null)

      if (payload.businessAssetsError) {
        setResult({ type: 'error', text: payload.businessAssetsError })
      } else {
        setResult(null)
      }

      setSelectedAdAccountId((current) => {
        if (!current) return ''
        const stillExists = (payload.adAccounts || []).some((account) => accountIdentity(account) === current)
        return stillExists ? current : ''
      })
    } catch (error) {
      setResult({ type: 'error', text: error.message })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadAssets()
  }, [tenantId])

  const selectAccount = (account) => {
    setSelectedAdAccountId(accountIdentity(account))
    setVerifiedAccount(null)
    setVerification(null)
    setResult(null)
  }

  const verifySelectedAccount = async () => {
    if (!tenantId || !selectedAccount) return
    setVerifying(true)
    setResult(null)
    try {
      const payload = await verifyMetaBusinessAdAccount({
        tenantId,
        moduleId: 'petshop',
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
              This section demonstrates the business_management use case requested by Meta. It lists the Ad Accounts owned by the connected Business Portfolio, lets the reviewer see an explicit account selection, and keeps the same account name and ID visible during the Graph API verification.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary shrink-0 gap-2"
          disabled={refreshing || loading || !tenantId}
          onClick={() => loadAssets({ silent: true })}
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          Refresh Ad Accounts
        </button>
      </div>

      {!tenantId ? (
        <div className="mt-6">
          <ResultBanner result={{ type: 'error', text: 'Select an active business before loading Meta business assets.' }} />
        </div>
      ) : loading ? (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[var(--border2)] bg-bg/40 px-4 py-6 text-sm text-muted">
          <Loader2 size={18} className="animate-spin" /> Loading Business Portfolio and Ad Accounts from Meta...
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-blue-200/70">Connected Business Portfolio</p>
              <p className="mt-2 text-base font-black text-blue-100">{businessPortfolio?.name || 'Not returned by Meta'}</p>
              <p className="mt-1 break-all font-mono text-xs text-blue-100/70">Business ID: {businessPortfolio?.id || '-'}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border2)] bg-bg/40 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-muted">Graph API source</p>
              <p className="mt-2 text-sm font-black text-text">Business Manager owned Ad Accounts</p>
              <p className="mt-1 font-mono text-xs text-muted">/{businessPortfolio?.id || 'BUSINESS_ID'}/owned_ad_accounts</p>
            </div>
          </div>

          <ResultBanner result={result} />

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
                No owned Ad Accounts were returned for this Business Portfolio.
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
                        <span className="block font-black text-text">{account.name || 'Unnamed Ad Account'}</span>
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
                    This identity remains visible while YuiSync verifies the selected account through the Meta Graph API.
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
                    Graph API: {verification?.graphEndpoint || `/${businessPortfolio?.id || 'BUSINESS_ID'}/owned_ad_accounts`}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
