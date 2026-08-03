import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Bot, Building2, Sparkles, Users2, Workflow } from 'lucide-react'

const CALLOUTS = [
  {
    title: 'Empresa',
    text: 'Gestão completa do negócio',
    icon: Building2,
    position: 'left-0 top-[14%]',
    line: 'left-[22%] top-[25%] w-[22%] bg-gradient-to-r from-cyan-200/70 via-cyan-200/35 to-transparent',
    anchor: 'left-[43.2%] top-[24.45%] bg-cyan-200 shadow-[0_0_14px_rgba(165,243,252,0.95)]',
    accent: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100',
  },
  {
    title: 'Equipe',
    text: 'Colaboração e produtividade',
    icon: Users2,
    position: 'right-0 top-[12%]',
    line: 'right-[22%] top-[24%] w-[22%] bg-gradient-to-l from-emerald-200/70 via-emerald-200/35 to-transparent',
    anchor: 'right-[43.2%] top-[23.45%] bg-emerald-200 shadow-[0_0_14px_rgba(167,243,208,0.95)]',
    accent: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
  },
  {
    title: 'Clientes',
    text: 'Experiência integrada e personalizada',
    icon: Bot,
    position: 'bottom-[14%] left-[2%]',
    line: 'bottom-[27%] left-[24%] w-[21%] bg-gradient-to-r from-violet-200/65 via-violet-200/32 to-transparent',
    anchor: 'bottom-[26.45%] left-[44.2%] bg-violet-200 shadow-[0_0_14px_rgba(221,214,254,0.9)]',
    accent: 'border-violet-300/30 bg-violet-300/10 text-violet-100',
  },
  {
    title: 'Automações',
    text: 'Processos inteligentes em movimento',
    icon: Workflow,
    position: 'bottom-[13%] right-0',
    line: 'bottom-[26%] right-[23%] w-[21%] bg-gradient-to-l from-sky-200/65 via-sky-200/32 to-transparent',
    anchor: 'bottom-[25.45%] right-[43.2%] bg-sky-200 shadow-[0_0_14px_rgba(186,230,253,0.9)]',
    accent: 'border-sky-300/30 bg-sky-300/10 text-sky-100',
  },
]

const PARTICLES = Array.from({ length: 38 }, (_, index) => ({
  id: index,
  top: `${7 + ((index * 29) % 84)}%`,
  left: `${6 + ((index * 19) % 88)}%`,
  delay: index * 0.09,
  duration: 2.2 + (index % 6) * 0.36,
  size: 2 + (index % 4),
}))

const STATIC_STARS = Array.from({ length: 28 }, (_, index) => ({
  id: index,
  top: `${9 + ((index * 37) % 78)}%`,
  left: `${8 + ((index * 31) % 84)}%`,
  opacity: 0.12 + (index % 4) * 0.08,
}))

function OrbitTrack({ width, height, tilt, duration, reverse = false, className, foreground = false, reducedMotion = false }) {
  return (
    <div className={`pointer-events-none absolute inset-0 flex items-center justify-center ${foreground ? 'z-30' : 'z-10'}`}>
      <motion.div
        className="relative"
        style={{ width, height }}
        animate={reducedMotion ? undefined : { rotate: reverse ? -360 : 360 }}
        transition={{ duration, repeat: Infinity, ease: 'linear' }}
      >
        <div className={`absolute inset-0 rounded-[50%] border ${className}`} style={{ transform: `rotate(${tilt}deg)` }}>
          <span className="absolute left-[12%] top-[18%] h-2.5 w-2.5 rounded-full bg-cyan-100 shadow-[0_0_20px_rgba(165,243,252,0.95)]" />
          <span className="absolute right-[9%] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-sky-300 shadow-[0_0_24px_rgba(125,211,252,0.95)]" />
          <span className="absolute bottom-[12%] left-[54%] h-2 w-2 rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.95)]" />
        </div>
      </motion.div>
    </div>
  )
}

function CalloutCard({ item }) {
  const Icon = item.icon
  return (
    <>
      <div className={`pointer-events-none absolute z-0 hidden h-px xl:block ${item.line}`} />
      <span className={`pointer-events-none absolute z-10 hidden h-1.5 w-1.5 rounded-full xl:block ${item.anchor}`} />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.18, ease: 'easeOut' }}
        className={`pointer-events-none absolute z-40 hidden w-[210px] select-none rounded-2xl border border-white/12 bg-[#06101f]/95 px-4 py-3 shadow-[0_22px_65px_rgba(0,0,0,0.46)] backdrop-blur-xl xl:block ${item.position}`}
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${item.accent}`}>
            <Icon size={18} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/90">{item.title}</p>
            <p className="mt-1 text-xs leading-5 text-white/62">{item.text}</p>
          </div>
        </div>
      </motion.div>
    </>
  )
}

function EnergyGlyph({ reducedMotion }) {
  return (
    <motion.svg
      viewBox="0 0 220 220"
      className="h-[64%] w-[64%] overflow-visible"
      fill="none"
      animate={reducedMotion ? undefined : { scale: [1, 1.045, 1], opacity: [0.84, 1, 0.88] }}
      transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="energyStroke" x1="34" y1="30" x2="180" y2="190" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F8FDFF" />
          <stop offset="0.38" stopColor="#93E9FF" />
          <stop offset="0.72" stopColor="#53B8FF" />
          <stop offset="1" stopColor="#7DF4D0" />
        </linearGradient>
        <filter id="energyGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <motion.path
        d="M44 54C63 70 82 88 103 113"
        stroke="url(#energyStroke)"
        strokeWidth="18"
        strokeLinecap="round"
        filter="url(#energyGlow)"
        animate={reducedMotion ? undefined : { pathLength: [0.72, 1, 0.82] }}
        transition={{ duration: 3.1, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.path
        d="M176 48C154 72 134 91 113 115"
        stroke="url(#energyStroke)"
        strokeWidth="18"
        strokeLinecap="round"
        filter="url(#energyGlow)"
        animate={reducedMotion ? undefined : { pathLength: [0.78, 1, 0.76] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
      />
      <motion.path
        d="M108 113C108 134 108 153 108 180"
        stroke="url(#energyStroke)"
        strokeWidth="18"
        strokeLinecap="round"
        filter="url(#energyGlow)"
        animate={reducedMotion ? undefined : { pathLength: [0.74, 1, 0.8] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
      />
      <circle cx="108" cy="113" r="15" fill="#E9FBFF" opacity="0.9" filter="url(#energyGlow)" />
    </motion.svg>
  )
}

export default function YuiCoreHero() {
  const reducedMotion = useReducedMotion()
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  const handlePointerMove = (event) => {
    if (reducedMotion) return
    const rect = event.currentTarget.getBoundingClientRect()
    const relativeX = (event.clientX - rect.left) / rect.width
    const relativeY = (event.clientY - rect.top) / rect.height
    setTilt({ x: (relativeX - 0.5) * 8, y: (relativeY - 0.5) * -6 })
  }

  return (
    <div className="relative mx-auto h-[500px] w-full max-w-[840px] select-none sm:h-[570px] xl:h-[615px]">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[76%] w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(34,145,255,0.22),rgba(77,52,205,0.1)_42%,transparent_72%)] blur-3xl" />
      <div className="pointer-events-none absolute bottom-[10%] left-1/2 h-[11%] w-[58%] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />

      {STATIC_STARS.map((star) => (
        <span key={star.id} className="pointer-events-none absolute z-0 h-1 w-1 rounded-full bg-cyan-100" style={{ top: star.top, left: star.left, opacity: star.opacity }} />
      ))}
      {CALLOUTS.map((item) => <CalloutCard key={item.title} item={item} />)}

      <motion.div className="absolute inset-[4%] z-20" animate={reducedMotion ? undefined : { y: [0, -5, 0] }} transition={{ duration: 6.2, repeat: Infinity, ease: 'easeInOut' }}>
        <div
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setTilt({ x: 0, y: 0 })}
          className="relative h-full w-full transition-transform duration-300 ease-out"
          style={{ transform: `perspective(1500px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)` }}
        >
          <OrbitTrack width="92%" height="36%" tilt={12} duration={17} className="border-sky-200/68 shadow-[0_0_26px_rgba(56,189,248,0.42),inset_0_0_18px_rgba(56,189,248,0.14)]" reducedMotion={reducedMotion} />
          <OrbitTrack width="78%" height="43%" tilt={-31} duration={21} reverse className="border-emerald-200/60 shadow-[0_0_27px_rgba(110,231,183,0.34),inset_0_0_18px_rgba(110,231,183,0.12)]" reducedMotion={reducedMotion} />
          <OrbitTrack width="88%" height="29%" tilt={58} duration={25} className="border-violet-200/56 shadow-[0_0_28px_rgba(196,181,253,0.32),inset_0_0_20px_rgba(196,181,253,0.12)]" reducedMotion={reducedMotion} />

          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <motion.div
              className="relative h-[246px] w-[246px] rounded-full sm:h-[296px] sm:w-[296px] xl:h-[336px] xl:w-[336px]"
              animate={reducedMotion ? undefined : { scale: [1, 1.018, 1] }}
              transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="absolute inset-[-10%] rounded-full bg-[radial-gradient(circle,rgba(93,208,255,0.28),rgba(52,111,255,0.12)_44%,transparent_72%)] blur-2xl" />
              <div className="absolute inset-0 rounded-full border border-cyan-100/25 bg-[radial-gradient(circle_at_31%_24%,rgba(255,255,255,0.3),rgba(87,206,255,0.14)_20%,rgba(26,76,175,0.28)_46%,rgba(4,12,38,0.62)_72%,rgba(2,6,20,0.2)_100%)] shadow-[0_0_88px_rgba(48,145,255,0.5),inset_0_0_70px_rgba(255,255,255,0.08)] backdrop-blur-sm" />
              <div className="absolute inset-[8%] rounded-full border border-cyan-100/12 bg-[conic-gradient(from_210deg,rgba(45,212,191,0.08),rgba(59,130,246,0.18),rgba(139,92,246,0.1),rgba(34,211,238,0.12),rgba(45,212,191,0.08))] blur-[0.5px]" />
              <motion.div
                className="absolute inset-[17%] rounded-full border border-sky-100/10 bg-[radial-gradient(circle,rgba(112,230,255,0.2),rgba(41,103,223,0.1)_46%,transparent_72%)]"
                animate={reducedMotion ? undefined : { rotate: 360 }}
                transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
              />
              <motion.div
                className="absolute left-[24%] top-[18%] h-[42%] w-[52%] rounded-[50%] bg-cyan-100/16 blur-xl"
                animate={reducedMotion ? undefined : { x: [-8, 10, -8], y: [4, -7, 4], opacity: [0.38, 0.72, 0.4] }}
                transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute bottom-[10%] right-[14%] h-[44%] w-[50%] rounded-full bg-blue-500/14 blur-2xl"
                animate={reducedMotion ? undefined : { x: [7, -9, 7], y: [-4, 8, -4], opacity: [0.28, 0.58, 0.3] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              />
              <div className="absolute inset-[4%] rounded-full bg-[linear-gradient(126deg,transparent_18%,rgba(255,255,255,0.11)_42%,transparent_61%)]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <EnergyGlyph reducedMotion={reducedMotion} />
              </div>
            </motion.div>
          </div>

          <OrbitTrack width="96%" height="25%" tilt={-9} duration={19} reverse foreground className="border-cyan-50/78 shadow-[0_0_28px_rgba(103,232,249,0.56),inset_0_0_20px_rgba(103,232,249,0.16)]" reducedMotion={reducedMotion} />

          {PARTICLES.map((particle) => (
            <motion.span
              key={particle.id}
              className="pointer-events-none absolute z-40 rounded-full bg-cyan-50 shadow-[0_0_16px_rgba(165,243,252,0.98)]"
              style={{ top: particle.top, left: particle.left, width: particle.size, height: particle.size }}
              animate={reducedMotion ? undefined : { opacity: [0.16, 1, 0.22], scale: [1, 1.6, 1] }}
              transition={{ duration: particle.duration, delay: particle.delay, repeat: Infinity, ease: 'easeInOut' }}
            />
          ))}
        </div>
      </motion.div>

      <motion.div
        className="pointer-events-none absolute bottom-[6%] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/12 bg-[#06101f]/88 px-4 py-2 text-[9px] uppercase tracking-[0.2em] text-white/64 shadow-[0_12px_36px_rgba(0,0,0,0.32)] backdrop-blur-md sm:text-[10px]"
        animate={reducedMotion ? undefined : { opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Sparkles size={13} className="text-cyan-200" />
        Yui Core · núcleo energético sincronizado
      </motion.div>
    </div>
  )
}
