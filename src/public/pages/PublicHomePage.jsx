import { useCallback, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight, Bot, CheckCircle2, Clock3, Headset, Layers3, ShieldCheck, Sparkles, Users2, Zap,
} from 'lucide-react'

const HOW_IT_WORKS = [
  { id: '01', title: 'Diagnóstico rápido', text: 'Entendemos a operação do cliente e escolhemos os módulos certos.' },
  { id: '02', title: 'Onboarding guiado', text: 'Configuramos negócio, equipe, fiscal e atendimento em fluxo assistido.' },
  { id: '03', title: 'Operação diária', text: 'PDV, chat, ordens, notas e suporte central no mesmo ecossistema.' },
  { id: '04', title: 'Escala com controle', text: 'Estrutura por negócio, níveis de acesso e auditoria para crescer com organização.' },
]

const MODULES = [
  { icon: Sparkles, title: 'PetShop CRM', desc: 'Agenda, PDV, fiscal, chat e operação de ponta a ponta.' },
  { icon: Layers3, title: 'Base Multi-Tenant', desc: 'Pronto para ativar novos módulos no futuro sem refazer a estrutura.' },
]

const ABOUT_PILLARS = [
  {
    icon: ShieldCheck,
    title: 'Confiança operacional',
    text: 'Construímos fluxos para reduzir erro humano e dar previsibilidade no dia a dia.',
  },
  {
    icon: Layers3,
    title: 'Plataforma modular',
    text: 'Cada negócio ativa só o que precisa hoje e expande quando fizer sentido.',
  },
  {
    icon: Users2,
    title: 'Parceria de crescimento',
    text: 'Não entregamos só software: acompanhamos implantação, uso e melhoria contínua.',
  },
]

const DIFFERENTIALS = [
  'Multiempresa com isolamento real por cliente',
  'Controle de acesso por módulo e perfil',
  'Suporte central com prioridade global',
  'Trilha de onboarding guiada por negócio',
  'Base pronta para cobrança automática',
  'Logs e auditoria para escalar com segurança',
]

const HIRE_STEPS = [
  {
    title: 'Conversa inicial',
    text: 'Mapeamos sua operação e definimos plano, módulos e estratégia de implantação.',
  },
  {
    title: 'Ativação do ambiente',
    text: 'Criamos sua instância, equipes e configurações base em poucas horas.',
  },
  {
    title: 'Go-live assistido',
    text: 'Entramos com você no início da operação para garantir tudo rodando sem atrito.',
  },
]

const FAQS = [
  {
    question: 'A YuiSync atende só petshop?',
    answer: 'No momento, esta versão está focada no PetShop, com base multi-tenant pronta para expansão futura.',
  },
  {
    question: 'Como funciona o suporte?',
    answer: 'Cada cliente abre atendimento no chat e sua equipe responde pela Central YuiSync com prioridade.',
  },
  {
    question: 'Consigo separar totalmente os dados de cada cliente?',
    answer: 'Sim. A plataforma foi desenhada com isolamento por empresa e políticas de acesso por perfil.',
  },
  {
    question: 'A implantação é rápida?',
    answer: 'Sim. O onboarding guiado reduz tempo de setup e deixa o time pronto para operar rápido.',
  },
  {
    question: 'Posso crescer sem trocar de sistema?',
    answer: 'Essa é a proposta: começar organizado e evoluir em módulos, automações e governança.',
  },
]

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

    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const startTop = container.scrollTop
    const targetTop = targetRect.top - containerRect.top + container.scrollTop
    let endTop = targetTop - ((container.clientHeight - target.clientHeight) / 2)

    const maxTop = Math.max(0, container.scrollHeight - container.clientHeight)
    endTop = Math.max(0, Math.min(maxTop, endTop))

    const duration = 1300
    const startTime = performance.now()
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2)

    const step = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(1, elapsed / duration)
      const eased = easeInOut(progress)
      container.scrollTop = startTop + (endTop - startTop) * eased
      if (progress < 1) requestAnimationFrame(step)
    }

    requestAnimationFrame(step)
  }, [])

  const goToSection = useCallback((hash) => {
    if (!hash) return
    if (location.hash === hash) {
      smoothScrollToHash(hash)
      return
    }
    navigate(`${location.pathname}${hash}`, { replace: true })
  }, [navigate, location.pathname, location.hash, smoothScrollToHash])

  const goToSales = useCallback(() => {
    navigate('/vendas#planos')
  }, [navigate])

  useEffect(() => {
    if (!location.hash) return
    smoothScrollToHash(location.hash)
  }, [location.hash, smoothScrollToHash])

  return (
    <div ref={containerRef} className="h-screen overflow-y-auto overflow-x-hidden bg-[#07080D] text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(5,150,105,0.2),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.25),transparent_40%)]" />
        <header className="relative z-10 max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
              <Bot size={18} className="text-emerald-300" />
            </div>
            <div>
              <p className="font-display font-bold tracking-wider">YUISYNC</p>
              <p className="text-[10px] text-white/60 uppercase tracking-[0.2em]">yuisync.com.br</p>
            </div>
          </div>
          <nav className="hidden lg:flex items-center gap-5 text-sm text-white/70">
            <button onClick={() => goToSection('#sobre')} className="hover:text-white transition-colors">Sobre nós</button>
            <button onClick={() => goToSection('#como-funciona')} className="hover:text-white transition-colors">Como funciona</button>
            <button onClick={() => goToSection('#contratar')} className="hover:text-white transition-colors">Quero Contratar</button>
            <button onClick={() => goToSection('#faqs')} className="hover:text-white transition-colors">FAQs</button>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/vendas" className="btn btn-secondary">Planos</Link>
            <Link to={entryHref} className="btn btn-primary">{isAuthenticated ? 'Ir para painel' : 'Entrar'}</Link>
          </div>
        </header>

        <section className="relative z-10 max-w-6xl mx-auto px-6 pt-10 pb-20">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-emerald-300 bg-emerald-500/10 border border-emerald-400/25 px-3 py-1.5 rounded-full">
              <Zap size={12} /> Plataforma operacional para serviços
            </p>
            <h1 className="mt-5 text-4xl md:text-6xl font-display font-black leading-tight">
              Operação, fiscal e atendimento em um só lugar.
            </h1>
            <p className="mt-4 text-lg text-white/75 leading-relaxed max-w-2xl">
              A YuiSync conecta negócio, equipe e clientes em fluxos que realmente escalam.
              Menos retrabalho, mais previsibilidade e suporte central ativo.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={goToSales} className="btn btn-primary gap-2">
                Ver planos e contratar
                <ArrowRight size={15} />
              </button>
              <Link to={entryHref} className="btn btn-secondary">
                {isAuthenticated ? 'Abrir painel' : 'Acessar plataforma'}
              </Link>
            </div>
          </div>
        </section>
      </div>

      <section id="sobre" className="max-w-6xl mx-auto px-6 py-14">
        <div className="flex items-center gap-2 mb-6">
          <Headset size={16} className="text-emerald-300" />
          <p className="text-xs uppercase tracking-[0.2em] text-white/60">Sobre nós</p>
        </div>
        <div data-scroll-target="sobre" className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-5">
          <div className="rounded-3xl border border-white/10 bg-[#11131a] p-6">
            <h2 className="font-display font-black text-3xl leading-tight">
              Somos a central de operação digital para negócios de serviço.
            </h2>
            <p className="mt-3 text-sm text-white/75 leading-relaxed">
              A YuiSync nasceu para unir operação, atendimento e controle em um ecossistema único.
              Nosso foco é ajudar empresas a crescer sem perder visibilidade, margem e qualidade.
            </p>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-xs text-white/60 uppercase tracking-widest">Missão</p>
                <p className="mt-2 text-sm text-white/80">Escalar negócios com processos claros e tecnologia útil.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-xs text-white/60 uppercase tracking-widest">Visão</p>
                <p className="mt-2 text-sm text-white/80">Ser referência em operação inteligente para serviços no Brasil.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {ABOUT_PILLARS.map((pillar) => (
              <div key={pillar.title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 flex items-center justify-center">
                  <pillar.icon size={18} />
                </div>
                <h3 className="mt-3 font-display font-bold text-xl">{pillar.title}</h3>
                <p className="mt-2 text-sm text-white/70">{pillar.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="max-w-6xl mx-auto px-6 py-14">
        <div className="flex items-center gap-2 mb-6">
          <ShieldCheck size={16} className="text-emerald-300" />
          <p className="text-xs uppercase tracking-[0.2em] text-white/60">Como funciona a empresa</p>
        </div>
        <div data-scroll-target="como-funciona" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {HOW_IT_WORKS.map((step) => (
            <div key={step.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-xs text-emerald-300 font-bold tracking-[0.15em]">{step.id}</p>
              <h3 className="mt-2 font-display font-bold text-xl">{step.title}</h3>
              <p className="mt-2 text-sm text-white/70 leading-relaxed">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MODULES.map((item) => (
            <div key={item.title} className="rounded-3xl border border-white/10 bg-[#11131a] p-6">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 flex items-center justify-center">
                <item.icon size={18} />
              </div>
              <h3 className="mt-4 font-display font-bold text-xl">{item.title}</h3>
              <p className="mt-2 text-sm text-white/70">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="flex items-center gap-2 mb-6">
          <CheckCircle2 size={16} className="text-emerald-300" />
          <p className="text-xs uppercase tracking-[0.2em] text-white/60">Diferenciais YuiSync</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          {DIFFERENTIALS.map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-white/80 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-300 flex-shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </section>

      <section id="contratar" className="max-w-6xl mx-auto px-6 pb-16">
        <div className="flex items-center gap-2 mb-6">
          <Clock3 size={16} className="text-emerald-300" />
          <p className="text-xs uppercase tracking-[0.2em] text-white/60">Quero Contratar</p>
        </div>
        <div data-scroll-target="contratar" className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-5">
          <div className="rounded-3xl border border-white/10 bg-[#11131a] p-6">
              <h3 className="font-display font-black text-3xl">Processo de contratacao simples e acompanhado.</h3>
              <p className="mt-3 text-sm text-white/75">
                Escolha o plano, ative sua instância e comece com nosso onboarding estruturado.
                Nosso time acompanha os primeiros passos para reduzir risco operacional.
              </p>
            <div className="mt-5 space-y-3">
              {HIRE_STEPS.map((step, idx) => (
                <div key={step.title} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <p className="text-xs text-emerald-300 uppercase tracking-widest font-bold">Etapa {idx + 1}</p>
                  <p className="mt-1 text-sm font-semibold text-white">{step.title}</p>
                  <p className="mt-1 text-sm text-white/70">{step.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-emerald-400/25 bg-emerald-500/10 p-6">
            <p className="text-sm font-bold text-emerald-200">Quer iniciar agora?</p>
            <p className="text-sm text-emerald-100/85 mt-2">
              Veja os planos, escolha a melhor faixa para seu momento e ativamos seu ambiente com segurança.
            </p>
            <div className="mt-5 space-y-2">
              <button type="button" onClick={goToSales} className="btn btn-primary w-full justify-center">
                Ver página de vendas
              </button>
              <Link to={entryHref} className="btn btn-secondary w-full justify-center">
                {isAuthenticated ? 'Ir para painel' : 'Acessar conta'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="faqs" className="max-w-6xl mx-auto px-6 pb-16">
        <div className="flex items-center gap-2 mb-6">
          <Sparkles size={16} className="text-emerald-300" />
          <p className="text-xs uppercase tracking-[0.2em] text-white/60">FAQs</p>
        </div>
        <div data-scroll-target="faqs" className="space-y-3">
          {FAQS.map((faq) => (
            <details key={faq.question} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 group">
              <summary className="list-none cursor-pointer text-sm font-semibold text-white flex items-center justify-between gap-3">
                <span>{faq.question}</span>
                <span className="text-white/40 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="mt-3 text-sm text-white/70 leading-relaxed">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="rounded-3xl border border-emerald-400/25 bg-emerald-500/10 p-7 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-emerald-200">Pronto para implantar seu ecossistema?</p>
            <p className="text-sm text-emerald-100/80 mt-1">Comece com onboarding guiado e suporte direto da central YuiSync.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={goToSales} className="btn btn-primary">Ir para vendas</button>
            <Link to={entryHref} className="btn btn-secondary">{isAuthenticated ? 'Ir para painel' : 'Entrar'}</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-6 text-center text-xs text-white/50">
        YuiSync Cloud Platform • Operação integrada com suporte central.
      </footer>
    </div>
  )
}
