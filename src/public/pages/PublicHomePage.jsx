import { useCallback, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Bot,
  Boxes,
  CheckCircle2,
  Layers3,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import YuiCoreHero from '../components/YuiCoreHero'

const NAV_ITEMS = [
  { label: 'Soluções', hash: '#solucoes' },
  { label: 'Módulos', hash: '#modulos' },
  { label: 'Recursos', hash: '#recursos' },
  { label: 'Integrações', hash: '#integracoes' },
]

const HERO_PILLS = [
  'Sincronização em tempo real',
  'IA integrada',
  'Seguro e confiável',
  'Escalável',
]

const TRUST_ITEMS = [
  'Operação centralizada',
  'Atendimento conectado',
  'Gestão por módulos',
  'Automação inteligente',
  'Dados em contexto',
]

const MODULES = [
  {
    title: 'PetShop CRM',
    text: 'Agenda, clientes, serviços, atendimento, PDV e operação em um único fluxo.',
    icon: Sparkles,
    iconClass: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200',
    glow: 'from-emerald-300/16 via-cyan-300/8 to-transparent',
  },
  {
    title: 'Gestão Central',
    text: 'Administração, permissões, suporte e visão macro para crescer com controle.',
    icon: Layers3,
    iconClass: 'border-violet-300/25 bg-violet-300/10 text-violet-200',
    glow: 'from-violet-300/16 via-sky-300/8 to-transparent',
  },
  {
    title: 'Expansão modular',
    text: 'Uma base preparada para novos módulos, automações e experiências especializadas.',
    icon: Boxes,
    iconClass: 'border-sky-300/25 bg-sky-300/10 text-sky-200',
    glow: 'from-sky-300/16 via-cyan-300/8 to-transparent',
  },
]

const RESOURCES = [
  'Visão única da operação',
  'Fluxos auditáveis e confiáveis',
  'Experiência integrada para equipe e clientes',
  'Arquitetura pronta para novas automações',
]

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-cyan-300/25 bg-cyan-300/10 shadow-[0_0_34px_rgba(58,167,255,0.18)]">
        <div className="absolute inset-1 rounded-xl border border-violet-300/20" />
        <Bot size={20} className="relative text-cyan-100" />
      </div>
      <div>
        <p className="font-display text-[22px] font-black tracking-[0.16em] text-white">YUI SYNC</p>
        <p className="text-[9px] uppercase tracking-[0.3em] text-white/42">Automated ecosystem</p>
      </div>
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
    const target = container.querySelector(hash)
    if (!target) return
    requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }))
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
    if (location.hash) smoothScrollToHash(location.hash)
  }, [location.hash, smoothScrollToHash])

  return (
    <div ref={containerRef} className="h-screen overflow-y-auto overflow-x-hidden bg-[#020611] font-body text-white">
      <section id="hero" className="relative min-h-[820px] overflow-hidden border-b border-white/5 xl:min-h-[860px]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(24,115,255,0.18),transparent_34%),radial-gradient(circle_at_87%_18%,rgba(118,79,255,0.13),transparent_30%),radial-gradient(circle_at_12%_68%,rgba(22,203,164,0.08),transparent_28%)]" />
        <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,0.13)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.13)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(circle_at_70%_36%,black,transparent_72%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/40 to-transparent" />

        <header className="relative z-50 mx-auto flex max-w-[1536px] items-center justify-between px-6 py-5 lg:px-10 xl:px-12">
          <button type="button" onClick={() => goToSection('#hero')} aria-label="Voltar ao início">
            <BrandMark />
          </button>

          <nav className="hidden items-center gap-9 text-sm font-semibold text-white/65 lg:flex">
            {NAV_ITEMS.map((item) => (
              <button key={item.hash} type="button" onClick={() => goToSection(item.hash)} className="transition-colors hover:text-white">
                {item.label}
              </button>
            ))}
            <Link to="/vendas" className="transition-colors hover:text-white">Preços</Link>
            <button type="button" onClick={() => goToSection('#sobre')} className="transition-colors hover:text-white">Sobre</button>
          </nav>

          <Link
            to={entryHref}
            className="inline-flex items-center gap-3 rounded-xl border border-cyan-300/50 bg-transparent px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/10"
          >
            {isAuthenticated ? 'Abrir painel' : 'Acessar sistema'}
            <ArrowRight size={15} />
          </Link>
        </header>

        <div className="relative z-20 mx-auto grid max-w-[1536px] grid-cols-1 items-center gap-3 px-6 pb-5 pt-5 lg:grid-cols-[0.78fr_1.22fr] lg:px-10 xl:min-h-[625px] xl:px-12">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.72, ease: 'easeOut' }}
            className="relative z-30 max-w-[560px] py-8 lg:py-2"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100">
              <Zap size={13} className="text-cyan-200" />
              Ecossistema inteligente
            </div>

            <h1 className="mt-6 font-display text-5xl font-black leading-[0.98] tracking-[-0.035em] text-white sm:text-6xl xl:text-[74px]">
              Conecte.
              <br />
              Automatize.
              <br />
              <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-emerald-300 bg-clip-text text-transparent">
                Evolua.
              </span>
            </h1>

            <p className="mt-6 max-w-[520px] text-base leading-8 text-white/66 xl:text-[17px]">
              O YuiSync une pessoas, processos e tecnologia em um único fluxo inteligente. Uma plataforma modular para operar melhor hoje e crescer sem reconstruir tudo amanhã.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => goToSection('#modulos')}
                className="inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-400 px-6 py-3.5 text-sm font-bold text-white shadow-[0_14px_45px_rgba(34,197,224,0.24)] transition hover:brightness-110"
              >
                Explorar módulos
                <ArrowRight size={16} />
              </button>
              <Link
                to="/vendas"
                className="inline-flex items-center gap-3 rounded-xl border border-white/18 bg-white/[0.025] px-6 py-3.5 text-sm font-semibold text-white/88 transition hover:border-cyan-200/35 hover:bg-white/[0.05]"
              >
                Agendar demonstração
              </Link>
            </div>

            <div className="mt-7 grid max-w-[570px] grid-cols-2 gap-2 xl:grid-cols-4">
              {HERO_PILLS.map((item) => (
                <div key={item} className="flex min-h-[42px] items-center gap-2 rounded-lg border border-white/8 bg-[#07101c]/65 px-3 py-2 text-[11px] leading-4 text-white/62 backdrop-blur-sm">
                  <CheckCircle2 size={13} className="flex-shrink-0 text-emerald-300" />
                  {item}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 0.85, delay: 0.08, ease: 'easeOut' }}
            className="relative -mr-4 min-w-0 lg:-mr-14 xl:-mr-20"
          >
            <YuiCoreHero />
          </motion.div>
        </div>

        <div className="relative z-30 mx-auto max-w-[1536px] px-6 pb-7 lg:px-10 xl:px-12">
          <div className="mb-5 flex items-center gap-5">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-white/5" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/38">Um ecossistema para toda a operação</p>
            <div className="h-px flex-1 bg-gradient-to-r from-white/5 via-white/10 to-transparent" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {TRUST_ITEMS.map((item, index) => (
              <div key={item} className="flex items-center justify-center gap-2.5 rounded-xl border border-white/6 bg-white/[0.018] px-3 py-3 text-xs font-semibold text-white/42">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/8 bg-white/[0.025] text-[10px] text-cyan-200/65">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="modulos" className="relative mx-auto max-w-[1536px] scroll-mt-6 px-6 py-16 lg:px-10 xl:px-12">
        <div className="mb-8 grid grid-cols-1 gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
              <Layers3 size={13} />
              Módulos YuiSync
            </div>
            <h2 className="mt-4 max-w-[620px] font-display text-3xl font-black leading-tight sm:text-4xl">
              Soluções que se conectam, resultados que se <span className="text-emerald-300">multiplicam.</span>
            </h2>
          </div>
          <p className="max-w-2xl justify-self-end text-sm leading-7 text-white/56">
            Comece pelo módulo que resolve seu problema atual e expanda a plataforma conforme a operação evolui.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {MODULES.map((item, index) => {
            const Icon = item.icon
            return (
              <motion.article
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                className="group relative overflow-hidden rounded-[26px] border border-white/10 bg-[#07101d] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.22)]"
              >
                <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${item.glow} opacity-70`} />
                <div className="relative z-10">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${item.iconClass}`}>
                    <Icon size={20} />
                  </div>
                  <h3 className="mt-5 font-display text-xl font-bold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/58">{item.text}</p>
                  <button type="button" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-cyan-200 transition group-hover:text-white">
                    Saiba mais <ArrowRight size={14} />
                  </button>
                </div>
              </motion.article>
            )
          })}
        </div>
      </section>

      <section id="recursos" className="mx-auto max-w-[1536px] scroll-mt-6 px-6 pb-16 lg:px-10 xl:px-12">
        <div className="grid grid-cols-1 gap-6 rounded-[30px] border border-white/10 bg-[linear-gradient(135deg,rgba(35,116,255,0.08),rgba(118,79,255,0.08),rgba(22,203,164,0.05))] p-7 lg:grid-cols-[0.9fr_1.1fr] lg:p-9">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-100">
              <ShieldCheck size={13} />
              Plataforma preparada
            </div>
            <h2 className="mt-5 font-display text-3xl font-black leading-tight sm:text-4xl">Tecnologia com presença visual, sem comprometer o produto.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/58">
              A experiência orbital fica isolada na home pública. O painel interno continua leve, previsível e focado na operação.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {RESOURCES.map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                <CheckCircle2 size={17} className="mt-0.5 flex-shrink-0 text-emerald-300" />
                <p className="text-sm leading-6 text-white/68">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="integracoes" className="mx-auto max-w-[1536px] scroll-mt-6 px-6 pb-16 lg:px-10 xl:px-12">
        <div className="rounded-[30px] border border-cyan-300/14 bg-[#06101c] p-8 text-center shadow-[0_0_70px_rgba(38,143,255,0.08)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200">Comece pelo núcleo</p>
          <h2 className="mx-auto mt-4 max-w-3xl font-display text-3xl font-black leading-tight sm:text-4xl">Centralize a operação hoje e evolua sem trocar de base amanhã.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/56">Escolha os planos, acesse o sistema ou converse com nossa equipe para montar a melhor configuração para seu negócio.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/vendas" className="btn btn-primary gap-2">Ver planos <ArrowRight size={15} /></Link>
            <Link to={entryHref} className="btn btn-secondary">{isAuthenticated ? 'Abrir painel' : 'Entrar na plataforma'}</Link>
          </div>
        </div>
      </section>

      <footer id="sobre" className="border-t border-white/6 px-6 py-6 text-xs text-white/38">
        <div className="mx-auto flex max-w-[1536px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 YuiSync. Ecossistema operacional inteligente.</p>
          <div className="flex gap-5">
            <Link to="/privacidade" className="hover:text-white">Privacidade</Link>
            <Link to="/termos" className="hover:text-white">Termos</Link>
            <Link to="/exclusao-de-dados" className="hover:text-white">Exclusão de dados</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
