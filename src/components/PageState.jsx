import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react'

export function LoadingState({ label = 'Carregando...' }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-sm text-muted" role="status" aria-live="polite">
      <Loader2 size={24} className="animate-spin text-primary" />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({ title = 'Nenhum registro encontrado', description = '', action = null }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-4 text-center">
      <Inbox size={30} className="text-muted/40" />
      <div>
        <p className="text-sm font-semibold text-text">{title}</p>
        {description && <p className="mt-1 text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ message = 'Nao foi possivel carregar esta area.', onRetry }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-4 text-center" role="alert">
      <AlertTriangle size={30} className="text-red-400" />
      <p className="max-w-lg text-sm text-red-300">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-secondary btn-sm">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      )}
    </div>
  )
}
