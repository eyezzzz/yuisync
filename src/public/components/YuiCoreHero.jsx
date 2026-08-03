import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Bot, Building2, Sparkles, Users2, Workflow } from 'lucide-react'

const CALLOUTS = [
  {
    title: 'Empresa',
    text: 'Gestão completa do negócio',
    icon: Building2,
    position: 'left-0 top-[12%]',
    line: 'left-[22%] top-[23%] w-[18%] bg-gradient-to-r from-cyan-200/55 to-transparent',
    accent: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100',
  },
  {
    title: 'Equipe',
    text: 'Colaboração e produtividade',
    icon: Users2,
    position: 'right-0 top-[9%]',
    line: 'right-[22%] top-[22%] w-[18%] bg-gradient-to-l from-emerald-200/55 to-transparent',
    accent: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  },
  {
    title: 'Clientes',
    text: 'Experiência integrada e personalizada',
    icon: Bot,
    position: 'bottom-[9%] left-[2%]',
    line: 'bottom-[23%] left-[24%] w-[18%] bg-gradient-to-r from-violet-200/50 to-transparent',
    accent: 'border-violet-300/25 bg-violet-300/10 text-violet-100',
  },
  {
    title: 'Automações',
    text: 'Processos inteligentes em movimento',
    icon: Workflow,
    position: 'bottom-[8%] right-0',
    line: 'bottom-[22%] right-[23%] w-[18%] bg-gradient-to-l from-sky-200/50 to-transparent',
    accent: 'border-sky-300/25 bg-sky-300/10 text-sky-100',
  },
]

const PARTICLES = Array.from({ length: 30 }, (_, index) => ({
  id: index,
  top: `${8 + ((index * 29) % 82)}%`,
  left: `${7 + ((index * 19) % 86)}%`,
  delay: index * 0.11,
  duration: 2.4 + (index % 6) * 0.38,
  size: 2 + (index % 4),
}))

function OrbitTrack({
  width,
  height,
  tilt,
  duration,
  reverse = false,
  className,
  foreground = false,
  reducedMotion = false,
}) {
  return (
    <div className={`pointer-events-none absolute inset-0 flex items-center justify-center ${foreground ? 'z-30' : 'z-10'}`}>
      <motion.div
        className="relative"
        style={{ width, height }}
        animate={reducedMotion ? undefined : { rotate: reverse ? -360 : 360 }}
        transition={{ duration, repeat: Infinity, ease: 'linear' }}
      >
        <div
          className={`absolute inset-0 rounded-[50%] border ${className}`}
          style={{ transform: `rotate(${tilt}deg)` }}
        >
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
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.18, ease: 'easeOut' }}
        className={`absolute z-40 hidden w-[205px] rounded-2xl border border-white/10 bg-[#07101e]/90 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.36)] backdrop-blur-xl xl:block ${item.position}`}
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${item.accent}`}>
            <Icon size={18} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/85">{item.title}</p>
            <p className="mt-1 text-xs leading-5 text-white/55">{item.text}</p>
          </div>
        </div>
      </motion.div>
    </>
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
      x: (relativeX - 0.5) * 10,
      y: (relativeY - 0.5) * -8,
    })
  }

  return (
    <div className="relative mx-auto h-[500px] w-full max-w-[860px] sm:h-[580px] xl:h-[640px]">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[72%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(31,142,255,0.2),rgba(89,58,218,0.1)_40%,transparent_72%)] blur-3xl" />
      <div className="pointer-events-none absolute bottom-[7%] left-1/2 h-[12%] w-[62%] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />

      {CALLOUTS.map((item) => <CalloutCard key={item.title} item={item} />)}

      <motion.div
        className="absolute inset-[4%] z-20"
        animate={reducedMotion ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 6.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setTilt({ x: 0, y: 0 })}
          className="relative h-full w-full transition-transform duration-300 ease-out"
          style={{ transform: `perspective(1500px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)` }}
        >
          <OrbitTrack
            width="92%"
            height="36%"
            tilt={12}
            duration={17}
            className="border-sky-300/55 shadow-[0_0_22px_rgba(56,189,248,0.32),inset_0_0_18px_rgba(56,189,248,0.12)]"
            reducedMotion={reducedMotion}
          />
          <OrbitTrack
            width="78%"
            height="43%"
            tilt={-31}
            duration={21}
            reverse
            className="border-emerald-300/50 shadow-[0_0_24px_rgba(110,231,183,0.28),inset_0_0_18px_rgba(110,231,183,0.1)]"
            reducedMotion={reducedMotion}
          />
          <OrbitTrack
            width="88%"
            height="29%"
            tilt={58}
            duration={25}
            className="border-violet-300/45 shadow-[0_0_25px_rgba(196,181,253,0.28),inset_0_0_20px_rgba(196,181,253,0.1)]"
            reducedMotion={reducedMotion}
          />

          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <motion.div
              className="relative h-[240px] w-[240px] rounded-full border border-white/20 bg-[radial-gradient(circle_at_32%_25%,rgba(255,255,255,0.42),rgba(54,171,255,0.32)_22%,rgba(28,83,180,0.72)_48%,rgba(8,20,62,0.96)_78%,rgba(2,7,22,1)_100%)] shadow-[0_0_75px_rgba(48,145,255,0.55),inset_0_0_48px_rgba(255,255,255,0.12)] sm:h-[290px] sm:w-[290px] xl:h-[330px] xl:w-[330px]"
              animate={reducedMotion ? undefined : {
                boxShadow: [
                  '0 0 65px rgba(48,145,255,0.42), inset 0 0 42px rgba(255,255,255,0.1)',
                  '0 0 105px rgba(48,145,255,0.68), inset 0 0 58px rgba(255,255,255,0.16)',
                  '0 0 65px rgba(48,145,255,0.42), inset 0 0 42px rgba(255,255,255,0.1)',
                ],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="absolute inset-[7%] rounded-full border border-cyan-100/10" />
              <div className="absolute left-[19%] top-[12%] h-[28%] w-[46%] -rotate-[24deg] rounded-[50%] bg-white/15 blur-md" />
              <div className="absolute inset-0 rounded-full bg-[linear-gradient(125deg,transparent_20%,rgba(255,255,255,0.08)_45%,transparent_62%)]" />

              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                animate={reducedMotion ? undefined : { scale: [1, 1.035, 1] }}
                transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <span className="select-none bg-gradient-to-b from-white via-cyan-100 to-sky-300 bg-clip-text font-display text-[98px] font-black leading-none text-transparent drop-shadow-[0_0_30px_rgba(255,255,255,0.6)] sm:text-[122px] xl:text-[148px]">
                  Y
                </span>
              </motion.div>
            </motion.div>
          </div>

          <OrbitTrack
            width="96%"
            height="25%"
            tilt={-9}
            duration={19}
            reverse
            foreground
            className="border-cyan-100/65 shadow-[0_0_24px_rgba(103,232,249,0.45),inset_0_0_18px_rgba(103,232,249,0.12)]"
            reducedMotion={reducedMotion}
          />

          {PARTICLES.map((particle) => (
            <motion.span
              key={particle.id}
              className="absolute z-40 rounded-full bg-cyan-100 shadow-[0_0_14px_rgba(165,243,252,0.95)]"
              style={{
                top: particle.top,
                left: particle.left,
                width: particle.size,
                height: particle.size,
              }}
              animate={reducedMotion ? undefined : {
                opacity: [0.18, 0.95, 0.24],
                scale: [1, 1.55, 1],
              }}
              transition={{
                duration: particle.duration,
                delay: particle.delay,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </motion.div>

      <motion.div
        className="absolute bottom-[2%] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-[#07101e]/80 px-4 py-2 text-[9px] uppercase tracking-[0.2em] text-white/55 backdrop-blur-md sm:text-[10px]"
        animate={reducedMotion ? undefined : { opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Sparkles size={13} className="text-cyan-200" />
        Yui Core · ecossistema sincronizado
      </motion.div>

      <div className="absolute inset-x-3 bottom-4 z-50 grid grid-cols-2 gap-2 xl:hidden">
        {CALLOUTS.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.title} className="rounded-xl border border-white/10 bg-[#07101e]/85 p-2.5 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border ${item.accent}`}>
                  <Icon size={14} />
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/80">{item.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-[10px] text-white/45">{item.text}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
