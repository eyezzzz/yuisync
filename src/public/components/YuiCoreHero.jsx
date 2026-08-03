import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Bot, Building2, Sparkles, Users2, Workflow } from 'lucide-react'

const CALLOUTS = [
  {
    title: 'Empresa',
    text: 'Gestão completa do negócio',
    icon: Building2,
    className: 'left-0 top-12 xl:-left-8',
    accent: 'text-cyan-200 border-cyan-300/25 bg-cyan-300/10',
  },
  {
    title: 'Equipe',
    text: 'Colaboração e produtividade',
    icon: Users2,
    className: 'right-0 top-8 xl:-right-10',
    accent: 'text-violet-200 border-violet-300/25 bg-violet-300/10',
  },
  {
    title: 'Clientes',
    text: 'Experiência integrada e fluida',
    icon: Bot,
    className: 'bottom-16 left-4 xl:-left-4',
    accent: 'text-emerald-200 border-emerald-300/25 bg-emerald-300/10',
  },
  {
    title: 'Automações',
    text: 'Processos inteligentes em movimento',
    icon: Workflow,
    className: 'bottom-12 right-0 xl:-right-12',
    accent: 'text-sky-200 border-sky-300/25 bg-sky-300/10',
  },
]

const PARTICLES = Array.from({ length: 22 }, (_, index) => ({
  id: index,
  top: `${7 + ((index * 19) % 84)}%`,
  left: `${5 + ((index * 23) % 88)}%`,
  delay: index * 0.16,
  duration: 2.8 + (index % 5) * 0.42,
  size: 2 + (index % 3),
}))

function Orbit({ className, duration, reverse = false, reducedMotion = false }) {
  return (
    <motion.div
      className={`absolute rounded-full border ${className}`}
      animate={reducedMotion ? undefined : { rotate: reverse ? -360 : 360 }}
      transition={{ duration, repeat: Infinity, ease: 'linear' }}
    >
      <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.95)]" />
      <span className="absolute left-7 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-cyan-200 shadow-[0_0_20px_rgba(103,232,249,0.95)]" />
      <span className="absolute bottom-7 right-12 h-3 w-3 rounded-full bg-emerald-200 shadow-[0_0_22px_rgba(110,231,183,0.9)]" />
    </motion.div>
  )
}

function CalloutCard({ item }) {
  const Icon = item.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut', delay: 0.25 }}
      className={`absolute z-30 hidden w-[220px] rounded-2xl border border-white/10 bg-[#07101f]/90 px-4 py-3 shadow-[0_18px_55px_rgba(0,0,0,0.35)] backdrop-blur-xl xl:block ${item.className}`}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${item.accent}`}>
          <Icon size={18} />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/85">{item.title}</p>
          <p className="mt-1 text-xs leading-5 text-white/58">{item.text}</p>
        </div>
      </div>
    </motion.div>
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
    setTilt({
      x: (relativeX - 0.5) * 14,
      y: (relativeY - 0.5) * -12,
    })
  }

  return (
    <div className="relative mx-auto w-full max-w-[920px] py-3 sm:py-6">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[72%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(37,170,255,0.15),rgba(115,79,255,0.08)_42%,transparent_72%)] blur-3xl" />

      <div className="pointer-events-none absolute left-[14%] top-[30%] hidden h-px w-[26%] bg-gradient-to-r from-cyan-300/50 to-transparent xl:block" />
      <div className="pointer-events-none absolute right-[14%] top-[29%] hidden h-px w-[26%] bg-gradient-to-l from-violet-300/45 to-transparent xl:block" />
      <div className="pointer-events-none absolute bottom-[29%] left-[15%] hidden h-px w-[25%] bg-gradient-to-r from-emerald-300/45 to-transparent xl:block" />
      <div className="pointer-events-none absolute bottom-[28%] right-[14%] hidden h-px w-[27%] bg-gradient-to-l from-sky-300/45 to-transparent xl:block" />

      {CALLOUTS.map((item) => <CalloutCard key={item.title} item={item} />)}

      <motion.div
        animate={reducedMotion ? undefined : { y: [0, -8, 0] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
        className="relative z-20 mx-auto flex h-[440px] w-[440px] items-center justify-center sm:h-[540px] sm:w-[540px] lg:h-[620px] lg:w-[620px]"
      >
        <div
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setTilt({ x: 0, y: 0 })}
          className="relative flex h-full w-full items-center justify-center transition-transform duration-300 ease-out"
          style={{ transform: `perspective(1400px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)` }}
        >
          <div className="absolute inset-[4%] rounded-full border border-cyan-200/10 bg-[radial-gradient(circle_at_50%_50%,rgba(53,185,255,0.04),transparent_67%)] shadow-[0_0_80px_rgba(37,170,255,0.12)]" />

          <Orbit
            className="inset-[9%] border-cyan-200/35 shadow-[0_0_32px_rgba(103,232,249,0.24)]"
            duration={20}
            reducedMotion={reducedMotion}
          />
          <Orbit
            className="inset-[14%] border-emerald-200/28 shadow-[0_0_34px_rgba(110,231,183,0.18)]"
            duration={25}
            reverse
            reducedMotion={reducedMotion}
          />
          <Orbit
            className="inset-[19%] border-violet-200/28 shadow-[0_0_36px_rgba(196,181,253,0.2)]"
            duration={30}
            reducedMotion={reducedMotion}
          />

          <motion.div
            className="absolute inset-[23%] rounded-full border border-white/15 bg-[radial-gradient(circle_at_34%_28%,rgba(255,255,255,0.34),rgba(47,162,255,0.2)_28%,rgba(27,54,116,0.72)_62%,rgba(4,9,24,0.96)_100%)] shadow-[0_0_85px_rgba(58,167,255,0.4),inset_0_0_55px_rgba(255,255,255,0.11)]"
            animate={reducedMotion ? undefined : {
              boxShadow: [
                '0 0 70px rgba(58,167,255,0.3), inset 0 0 45px rgba(255,255,255,0.08)',
                '0 0 105px rgba(58,167,255,0.48), inset 0 0 64px rgba(255,255,255,0.14)',
                '0 0 70px rgba(58,167,255,0.3), inset 0 0 45px rgba(255,255,255,0.08)',
              ],
            }}
            transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
          />

          <div className="absolute inset-[28%] rounded-full border border-cyan-100/10 bg-[radial-gradient(circle_at_40%_34%,rgba(255,255,255,0.12),rgba(51,117,224,0.12),rgba(2,6,23,0.72))]" />

          <motion.div
            className="absolute inset-[32%] flex items-center justify-center rounded-full"
            animate={reducedMotion ? undefined : { scale: [1, 1.035, 1] }}
            transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <span className="select-none bg-gradient-to-b from-white via-cyan-100 to-sky-300 bg-clip-text font-display text-[92px] font-black leading-none text-transparent drop-shadow-[0_0_28px_rgba(255,255,255,0.45)] sm:text-[118px] lg:text-[140px]">
              Y
            </span>
          </motion.div>

          {PARTICLES.map((particle) => (
            <motion.span
              key={particle.id}
              className="absolute rounded-full bg-cyan-100 shadow-[0_0_14px_rgba(165,243,252,0.95)]"
              style={{
                top: particle.top,
                left: particle.left,
                width: particle.size,
                height: particle.size,
              }}
              animate={reducedMotion ? undefined : {
                opacity: [0.18, 0.95, 0.25],
                scale: [1, 1.65, 1],
              }}
              transition={{
                duration: particle.duration,
                delay: particle.delay,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}

          <div className="absolute left-1/2 top-1/2 h-px w-[106%] -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-transparent via-cyan-100/18 to-transparent" />
          <div className="absolute left-1/2 top-1/2 h-[106%] w-px -translate-x-1/2 -translate-y-1/2 bg-gradient-to-b from-transparent via-violet-100/12 to-transparent" />

          <div className="absolute right-[15%] top-[15%] rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-cyan-100 sm:text-[10px]">
            Fluxo inteligente
          </div>
          <div className="absolute left-[15%] top-[18%] rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-emerald-100 sm:text-[10px]">
            Modular
          </div>
          <div className="absolute bottom-[16%] right-[15%] rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-violet-100 sm:text-[10px]">
            Interativo
          </div>

          <motion.div
            className="absolute bottom-[7%] left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-[#06101f]/70 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-white/65 backdrop-blur-md sm:text-xs"
            animate={reducedMotion ? undefined : { opacity: [0.66, 1, 0.66] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Sparkles size={13} className="text-cyan-200" />
            Yui Core · ecossistema em movimento
          </motion.div>
        </div>
      </motion.div>

      <div className="mt-2 grid grid-cols-2 gap-3 px-4 xl:hidden">
        {CALLOUTS.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${item.accent}`}>
                  <Icon size={15} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">{item.title}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-white/52">{item.text}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
