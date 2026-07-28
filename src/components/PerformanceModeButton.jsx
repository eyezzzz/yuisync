import { Gauge, Sparkles } from 'lucide-react'
import { usePerformanceCtx } from '../context/PerformanceContext'

export function PerformanceModeButton({ compact = false }) {
  const { isFluidMode, togglePerformanceMode } = usePerformanceCtx()
  const label = isFluidMode ? 'Modo fluido' : 'Visual completo'
  const description = isFluidMode
    ? 'Carrega menos conteúdo fora da tela e reduz efeitos decorativos pesados.'
    : 'Usa toda a densidade visual e todos os efeitos decorativos.'

  return (
    <button
      type="button"
      onClick={togglePerformanceMode}
      aria-label={`${label}. Clique para alternar.`}
      title={`${label} — ${description}`}
      className={`performance-mode-button ${compact ? 'performance-mode-button-compact' : ''}`}
    >
      {isFluidMode ? <Gauge size={compact ? 15 : 16} /> : <Sparkles size={compact ? 15 : 16} />}
      {!compact && <span>{label}</span>}
    </button>
  )
}
