import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Sparkles, Timer } from 'lucide-react'
import { AI_HOURS_SAVED_MOCK, AI_HOURS_SAVED_SERIES } from '../constants/aiHoursSavedMock'
import { calculateSavedPercentage, formatHours, formatPercentage } from '../utils/aiHoursSaved'

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-xl border border-emerald-300/35 bg-emerald-950/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-200/90">{label}</p>
      <p className="text-sm font-semibold text-white">{formatHours(payload[0].value)}</p>
    </div>
  )
}

export default function AIHoursSavedCard({
  totalHours = AI_HOURS_SAVED_MOCK.totalHours,
  savedHours = AI_HOURS_SAVED_MOCK.savedHours,
  series = AI_HOURS_SAVED_SERIES,
  className = '',
  onClick,
}) {
  const [isHovered, setIsHovered] = useState(false)

  const savedPercentage = useMemo(
    () => calculateSavedPercentage(savedHours, totalHours),
    [savedHours, totalHours]
  )

  const latestSaved = series?.[series.length - 1]?.saved ?? savedHours
  const helperText = `${formatHours(savedHours)} economizadas de ${formatHours(totalHours)} de operacao hoje`
  const lastIndex = Math.max((series?.length || 1) - 1, 0)

  function LivePointDot({ cx, cy, index }) {
    if (index !== lastIndex) return null

    return (
      <g>
        <circle cx={cx} cy={cy} r={5} className="ai-flow-dot" />
        <circle cx={cx} cy={cy} r={2.4} fill="#ecfdf5" />
      </g>
    )
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      whileHover={{ y: -4, scale: 1.005 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl2 border border-emerald-300/35 bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 p-5 shadow-[0_20px_50px_rgba(5,150,105,0.42)] ring-1 ring-emerald-200/20 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.24),transparent_38%)]" />
      <motion.div
        aria-hidden="true"
        animate={{
          opacity: isHovered ? 0.38 : 0.18,
          x: isHovered ? [0, 26, 0] : [0, 16, 0],
        }}
        transition={{ duration: isHovered ? 1.4 : 2.6, repeat: Infinity, ease: 'easeInOut' }}
        className="pointer-events-none absolute -right-24 top-0 h-full w-64 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.45),transparent_68%)] blur-2xl"
      />

      <div className="relative z-10">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-50/80">
              Tempo economizado pela IA
            </p>
            <p className="mt-1 text-sm text-emerald-50/90">Indicador de eficiencia operacional</p>
          </div>

          <div className="inline-flex items-center gap-1 rounded-full border border-emerald-100/35 bg-emerald-50/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-50">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-100 ai-live-dot" />
            Tempo real
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-display text-5xl font-black leading-none text-white">{formatPercentage(savedPercentage)}</p>
            <p className="mt-1 text-xs text-emerald-50/90">{helperText}</p>
          </div>

          <div className="rounded-xl border border-emerald-100/30 bg-emerald-900/20 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-100/85">Hoje</p>
            <p className="mt-1 flex items-center justify-end gap-1 text-lg font-bold text-white">
              <Timer size={16} className="text-emerald-100/90" />
              {formatHours(latestSaved)}
            </p>
          </div>
        </div>

        <div className="h-40 rounded-xl border border-emerald-100/20 bg-emerald-900/20 p-2 backdrop-blur-[2px] sm:h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="aiHoursFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#dcfce7" stopOpacity="0.58" />
                  <stop offset="100%" stopColor="#dcfce7" stopOpacity="0.06" />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fill: 'rgba(236,253,245,0.88)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: 'rgba(236,253,245,0.82)', fontSize: 10 }}
                width={30}
                axisLine={false}
                tickLine={false}
                domain={[0, 'dataMax + 0.6']}
              />
              <Tooltip cursor={{ stroke: 'rgba(236,253,245,0.25)', strokeWidth: 1 }} content={<ChartTooltip />} />
              <Area
                type="basis"
                dataKey="saved"
                stroke="#ecfdf5"
                strokeWidth={isHovered ? 3.2 : 2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                fillOpacity={1}
                fill="url(#aiHoursFill)"
                dot={(dotProps) => <LivePointDot {...dotProps} />}
                activeDot={{ r: 5, fill: '#bbf7d0', stroke: '#14532d', strokeWidth: 2 }}
                animationDuration={1100}
                className="ai-flow-line"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-emerald-50/85">
          <span className="inline-flex items-center gap-1">
            <Sparkles size={12} />
            IA operando em otimizacao continua
          </span>
          <span className="font-semibold">{formatHours(savedHours)} / {formatHours(totalHours)}</span>
        </div>
      </div>

      {/* TODO: Conectar com Supabase/API para receber `totalHours`, `savedHours` e `series` em tempo real */}
    </motion.article>
  )
}
