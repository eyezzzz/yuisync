import { useCallback, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Bot,
  Boxes,
  CheckCircle2,
  Layers3,
  Orbit,
  ShieldCheck,
  Sparkles,
  Waves,
  Zap,
} from 'lucide-react'
import YuiCoreHero from '../components/YuiCoreHero'

const NAV_ITEMS = [
  { label: 'Plataforma', hash: '#plataforma' },
  { label: 'Módulos', hash: '#modulos' },
  { label: 'Soluções', hash: '#solucoes' },
  { label: 'Suporte', hash: '#suporte' },
]

const QUICK_LINKS = [
  { label: 'Visão geral', hash: '#hero' },
  { label: 'Ecossistema', hash: '#plataforma' },
  { label: 'Módulos', hash: '#modulos' },
  { label: 'Começar', hash: '#suporte' },
]

const MODULES = [
  {
    title: 'PetShop CRM',
    text: 'Agenda, atendimento, clientes, serviços, PDV e operação em um fluxo conectado.',
    icon: Sparkles,
    accent: 'from-emerald-300/20 via-cyan-300/10 to-transparent',
    iconClass: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  },
  {
    title: 'Gestão Central',
    text: 'Administração, suporte, permissões e visão macro para crescer com controle.',
    icon: Layers3,
    accent: 'from-violet-300/20 via-sky-300/10 to-transparent',
    iconClass: 'border-violet-300/25 bg-violet-300/10 text-violet-100',
  },
  {
    title: 'Expansão modular',
    text: 'Base preparada para novos módulos, automações e experiências especializadas.',
    icon: Boxes,
    accent: 'from-sky-300/20 via-cyan-300/10 to-transparent',
    iconClass: 'border-sky-300/25 bg-sky-300/10 text-sky-100',
  },
]

const PILLARS = [
  {
    title: 'Operação sincronizada',
    text: 'Pessoas, processos e dados compartilham o mesmo contexto operacional.',
    icon: Orbit,
  },
  {
    title: 'Automação com propósito',
    text: 'A tecnologia reduz retrabalho sem esconder o que acontece no negócio.',
    icon: Waves,
  },
  {
    title: 'Arquitetura preparada',
    text: 'A experiência pública evolui sem adicionar peso desnecessário ao painel interno.',
    icon: ShieldCheck,
  },
]

const BENEFITS = [
  'Visão central da operação',
  'Fluxos modulares por negócio',
  'Experiência integrada para equipe e clientes',
  'Base pronta para automações inteligentes',
]

function SectionTag({ icon: Icon, children }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100 sm:text-[11px]">
      <Icon size={13} />
      {children}
    </div>
  )
}

export default function PublicHomePage({ isAuthenticated = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const containerRef = useRef(null)
  const entryHref = isAuthenticated ? '/' : '/entrar'

  const smoothScrollToHash = useCallback((hash) => {
    const container = containerRef.current
    if (!container || !hash) return

    const blockKey = hash.replace('#', '')
    const target =
      container.querySelector(`[data-scroll-target="${blockKey}"]`)
      || container.querySelector(hash)

    if (!target) return

    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const goToSection = useCallback((hash) => {
    if (!hash) return

    if (location.hash === hash) {
      smoothScrollToHash(hash)
      return
    }

    navigate(`${location.pathname}${hash}`, { replace: true })
  }, [location.hash, location.pathname, navigate, smoothScrollToHash])

  useEffect(() => {
    if (!location.hash) return
    smoothScrollToHash(location.hash)
  }, [location.hash, smoothScrollToHash])

  return (
    <div
      ref={containerRef}
      className="h-screen overflow-y-auto overflow-x-hidden bg-[#030711] font-body text-white"
    >
      <section
        id="hero"
        data-scroll-target="hero"
        className="relative min-h-[100svh] overflow-hidden border-b border-white/5"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(39,149,255,0.14),transparent_33%),radial-gradient(circle_at_76%_18%,rgba(123,92,255,0.13),transparent_30%),radial-gradient(circle_at_20%_60%,rgba(41,231,164,0.08),transparent_26%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:46px_46px] [mask-image:radial-gradient(circle_at_center,black,transparent_78%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/40 to-transparent" />

        <header className="relative z-50 mx-auto flex max-w-[1500px] items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
          <button
            type="button"
            onClick={() => goToSection('#hero')}
            className="flex items-center gap-3 text-left"
            aria-label="Voltar ao início"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 shadow-[0_0_34px_rgba(58,167,255,0.16)]">
              <Bot size={20} className="text-cyan-100" />
            </div>
            <div>
              <p className="font-display text-xl font-black tracking-[0.18em]">YUI SYNC</p>
              <p className="text-[9px] uppercase tracking-[0.3em] text-white/40 sm:text-[10px]">
                Automated ecosystem
              </p>
            </div>
          </button>

          <nav className="hidden items-center gap-7 text-xs font-semibold uppercase tracking-[0.13em] text-white/60 lg:flex">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.hash}
                type="button"
                onClick={() => goToSection(item.hash)}
                className="transition-colors hover:text-white"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link to={entryHref} className="btn btn-secondary hidden sm:inline-flex">
              {isAuthenticated ? 'Abrir painel' : 'Entrar'}
            </Link>
            <Link to="/vendas" className="btn btn-primary gap-2">
              Começar agora
              <ArrowRight size={14} />
            </Link>
          </div>
        </header>

        <aside className="absolute left-5 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-2 xl:flex 2xl:left-10">
          {QUICK_LINKS.map((item, index) => (
            <button
              key={item.hash}
              type="button"
              onClick={() => goToSection(item.hash)}
              className="group flex w-[150px] items-center gap-3 rounded-xl border border-white/10 bg-[#081120]/80 px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-white/50 shadow-[0_12px_40px_rgba(0,0,0,0.2)] backdrop-blur-md transition hover:border-cyan-200/25 hover:text-white"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[9px] text-cyan-100/70 transition group-hover:border-cyan-200/25 group-hover:bg-cyan-200/10">
                {String(index + 1).padStart(2, '0')}
              </span>
              {item.label}
            </button>
          ))}
        </aside>

        <main className="relative z-20 mx-auto flex min-h-[calc(100svh-86px)] max-w-[1500px] flex-col items-center justify-center px-4 pb-12 pt-4 sm:px-8 lg:px-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
            className="relative z-30 text-center"
          >
            <SectionTag icon={Zap}>Ecossistema inteligente</SectionTag>
            <p className="mx-auto mt-3 max-w-xl text-xs leading-6 text-white/50 sm:text-sm">
              Um núcleo visual para representar a conexão entre negócio, equipe, clientes e automações.
            </p>
          </motion.div>

          <YuiCoreHero />

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.18, ease: 'easeOut' }}
            className="relative z-30 -mt-2 max-w-3xl text-center sm:-mt-5"
          >
            <h1 className="font-display text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">
              Tudo conectado.{' '}
              <span className="bg-gradient-to-r from-cyan-200 via-sky-300 to-emerald-200 bg-clip-text text-transparent">
                Tudo em movimento.
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/60 sm:text-base">
              O YuiSync centraliza operação, automação e atendimento em uma plataforma preparada para evoluir com o negócio.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => goToSection('#plataforma')} className="btn btn-primary gap-2">
                Conheça o ecossistema
                <ArrowRight size={15} />
              </button>
              <Link to={entryHref} className="btn btn-secondary">
                {isAuthenticated ? 'Ir para o sistema' : 'Acessar plataforma'}
              </Link>
            </div>
          </motion.div>
        </main>
      </section>

      <section
        id="plataforma"
        data-scroll-target="plataforma"
        className="relative mx-auto max-w-7xl scroll-mt-6 px-6 py-20"
      >
        <div className="absolute inset-x-20 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.15fr]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.55 }}
            className="rounded-[32px] border border-white/10 bg-white/[0.025] p-7 backdrop-blur-sm sm:p-9"
          >
            <SectionTag icon={Orbit}>Plataforma YuiSync</SectionTag>
            <h2 className="mt-5 font-display text-3xl font-black leading-tight sm:text-4xl">
              Uma experiência que mostra como o produto funciona.
            </h2>
            <p className="mt-4 text-sm leading-7 text-white/60 sm:text-base">
              A nova home deixa de ser apenas uma vitrine. O Yui Core comunica visualmente sincronização, contexto compartilhado e evolução modular — exatamente os princípios da plataforma.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {BENEFITS.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-3.5">
                  <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0 text-emerald-200" />
                  <p className="text-sm text-white/70">{item}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {PILLARS.map((item, index) => {
              const Icon = item.icon
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ duration: 0.5, delay: index * 0.08 }}
                  className="rounded-[28px] border border-white/10 bg-[#07101d] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                    <Icon size={18} />
                  </div>
                  <h3 className="mt-5 font-display text-xl font-bold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/60">{item.text}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      <section
        id="modulos"
        data-scroll-target="modulos"
        className="mx-auto max-w-7xl scroll-mt-6 px-6 pb-20"
      >
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <SectionTag icon={Layers3}>Módulos conectados</SectionTag>
            <h2 className="mt-4 max-w-3xl font-display text-3xl font-black leading-tight sm:text-4xl">
              Soluções que compartilham o mesmo núcleo operacional.
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-white/60">
            Cada módulo resolve um contexto específico sem fragmentar dados, equipe ou experiência do cliente.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {MODULES.map((item, index) => {
            const Icon = item.icon
            return (
              <motion.article
                key={item.title}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.52, delay: index * 0.08 }}
                className="group relative overflow-hidden rounded-[30px] border border-white/10 bg-[#07101d] p-6"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${item.accent} opacity-70 transition duration-500 group-hover:opacity-100`} />
                <div className="relative z-10">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${item.iconClass}`}>
                    <Icon size={20} />
                  </div>
                  <h3 className="mt-6 font-display text-2xl font-bold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-white/60">{item.text}</p>
                  <button
                    type="button"
                    onClick={() => goToSection('#suporte')}
                    className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-cyan-100 transition hover:text-white"
                  >
                    Explorar solução
                    <ArrowRight size={14} />
                  </button>
                </div>
              </motion.article>
            )
          })}
        </div>
      </section>

      <section
        id="solucoes"
        data-scroll-target="solucoes"
        className="mx-auto max-w-7xl scroll-mt-6 px-6 pb-20"
      >
        <div className="overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(50,163,255,0.09),rgba(119,91,255,0.08),rgba(41,231,164,0.05))] p-7 sm:p-9">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-center">
            <motion.div
              initial={{ opacity: 0, x: -18 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.55 }}
            >
              <SectionTag icon={Waves}>Experiência viva</SectionTag>
              <h2 className="mt-5 font-display text-3xl font-black leading-tight sm:text-4xl">
                Movimento com propósito, sem comprometer o produto.
              </h2>
              <p className="mt-4 text-sm leading-7 text-white/60 sm:text-base">
                Órbitas, partículas e resposta ao cursor reforçam a sensação de fluxo. A animação respeita redução de movimento e permanece isolada na home pública.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 18 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.55, delay: 0.08 }}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              {[
                'Hero orbital interativo',
                'Cartões conectados ao ecossistema',
                'Fallback visual documentado',
                'Base pronta para evolução 3D',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                  <CheckCircle2 size={17} className="text-cyan-100" />
                  <p className="mt-3 text-sm font-semibold text-white/75">{item}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      <section
        id="suporte"
        data-scroll-target="suporte"
        className="mx-auto max-w-7xl scroll-mt-6 px-6 pb-20"
      >
        <div className="rounded-[36px] border border-cyan-300/15 bg-[#06101d] px-7 py-12 text-center shadow-[0_0_70px_rgba(58,167,255,0.08)] sm:px-10">
          <SectionTag icon={Bot}>Comece pelo núcleo</SectionTag>
          <h2 className="mx-auto mt-5 max-w-3xl font-display text-3xl font-black leading-tight sm:text-4xl">
            Centralize a operação hoje e evolua sem trocar de base amanhã.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/60 sm:text-base">
            Conheça os planos, acesse o sistema ou fale com a equipe para entender a melhor configuração para o seu negócio.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/vendas" className="btn btn-primary gap-2">
              Ver planos
              <ArrowRight size={15} />
            </Link>
            <Link to={entryHref} className="btn btn-secondary">
              {isAuthenticated ? 'Abrir painel' : 'Entrar na plataforma'}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 bg-black/15">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 YuiSync. Ecossistema operacional inteligente.</p>
          <div className="flex flex-wrap gap-4">
            <Link to="/privacidade" className="transition hover:text-white">Privacidade</Link>
            <Link to="/termos" className="transition hover:text-white">Termos</Link>
            <Link to="/exclusao-de-dados" className="transition hover:text-white">Exclusão de dados</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
