import { useCallback, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, Check, Headset, ShieldCheck, Sparkles } from 'lucide-react'

const PRICING = [
  {
    id: 'start',
    name: 'Yui Start',
    subtitle: 'Essencial para operar bem desde o primeiro dia',
    monthly: 'R$ 297',
    promoMonthly: 'R$ 197',
    yearly: 'R$ 2.970',
    staffLimit: '1 funcionário',
    recommendedFor: 'Autônomos e iniciantes',
    highlighted: false,
    features: [
      'Agenda, clientes e pets',
      'PDV, estoque e caixa',
      'Relatórios operacionais base',
      'Suporte padrão',
    ],
  },
  {
    id: 'pro',
    name: 'Yui Pro',
    subtitle: 'Fiscal + atendimento integrado para crescimento real',
    monthly: 'R$ 447',
    promoMonthly: 'R$ 347',
    yearly: 'R$ 4.470',
    staffLimit: '3 funcionários',
    recommendedFor: 'Empresas pequenas já inclusas no mercado',
    highlighted: true,
    badge: 'Mais vendido',
    features: [
      'Tudo do Start',
      'Ordens de serviço e entrega',
      'Chat integrado com central',
      'Configuração fiscal por empresa',
    ],
  },
  {
    id: 'prime',
    name: 'Yui Prime IA',
    subtitle: 'Automação e inteligência para escalar com margem',
    monthly: 'R$ 697',
    promoMonthly: 'R$ 597',
    yearly: 'R$ 6.970',
    staffLimit: '5 funcionários',
    recommendedFor: 'Empresas que querem crescer ainda mais',
    highlighted: false,
    badge: 'Premium IA',
    features: [
      'Tudo do Pro',
      'Fluxos com IA assistida',
      'Campanhas e reengajamento',
      'Suporte prioritário',
    ],
  },
  {
    id: 'elite',
    name: 'Yui Elite',
    subtitle: 'Atendimento personalizado + automações específicas sob medida',
    monthly: 'Sob consulta',
    yearly: 'Contrato personalizado',
    staffLimit: 'A partir de 6 funcionários',
    recommendedFor: 'Operações com demanda custom e múltiplas unidades',
    highlighted: false,
    badge: 'Concierge',
    customPricing: true,
    cta: 'Entrar em contato',
    features: [
      'Tudo do Prime IA',
      'Automações específicas para sua operação',
      'Especialista dedicado para evolução do fluxo',
      'SLA prioritário e canal direto com a central',
    ],
  },
]

export default function PublicSalesPage({ isAuthenticated = false }) {
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
    const preferredTop = targetTop - ((container.clientHeight - target.clientHeight) / 2)
    const endTop = Math.max(0, Math.min(preferredTop, container.scrollHeight - container.clientHeight))

    const duration = 1200
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

  useEffect(() => {
    if (!location.hash) return
    smoothScrollToHash(location.hash)
  }, [location.hash, smoothScrollToHash])

  return (
    <div ref={containerRef} className="h-screen overflow-y-auto overflow-x-hidden bg-[#07080D] text-white">
      <header className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link to="/site" className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white">
          <ArrowLeft size={14} />
          Voltar ao início
        </Link>
        <nav className="hidden md:flex items-center gap-4 text-sm text-white/70">
          <Link to="/site#sobre" className="hover:text-white transition-colors">Sobre nós</Link>
          <Link to="/site#contratar" className="hover:text-white transition-colors">Quero Contratar</Link>
          <Link to="/site#faqs" className="hover:text-white transition-colors">FAQs</Link>
        </nav>
        <Link to={entryHref} className="btn btn-secondary">
          {isAuthenticated ? 'Ir para painel' : 'Entrar'}
        </Link>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-6 pb-10 text-center">
        <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-emerald-300 bg-emerald-500/10 border border-emerald-400/25 px-3 py-1.5 rounded-full">
          <Sparkles size={12} />
          Planos oficiais YuiSync
        </p>
        <h1 className="mt-5 text-4xl md:text-6xl font-display font-black">
          Escolha o plano ideal para sua operação.
        </h1>
        <p className="mt-4 text-lg text-white/75 max-w-3xl mx-auto">
          Planos desenhados para crescimento sustentável, com suporte próximo e evolução contínua.
          Escale com previsibilidade e margem.
        </p>
      </section>

      <section id="planos" className="max-w-6xl mx-auto px-6 pb-14">
        <div data-scroll-target="planos" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {PRICING.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-3xl border p-6 ${
                plan.highlighted
                  ? 'border-emerald-400/40 bg-emerald-500/12 shadow-[0_20px_50px_rgba(5,150,105,0.22)]'
                  : 'border-white/10 bg-[#11131a]'
              } h-full flex flex-col`}
            >
              <div className="flex items-center justify-between gap-3 min-h-[64px]">
                <h3 className="font-display font-black text-2xl">{plan.name}</h3>
                {plan.badge && <span className="badge badge-blue whitespace-nowrap">{plan.badge}</span>}
              </div>
              <p className="mt-2 text-sm text-white/70 min-h-[40px]">{plan.subtitle}</p>
              <p className="mt-2 text-sm text-white/60 min-h-[48px]">Ideal: {plan.recommendedFor}</p>

              <div className="mt-5">
                {plan.promoMonthly && !plan.customPricing && (
                  <p className="text-sm text-white/45 line-through">
                    {plan.monthly}
                    <span className="text-sm text-white/45">/mês</span>
                  </p>
                )}
                <p className={`font-display font-black ${plan.customPricing ? 'text-3xl' : 'text-4xl'}`}>
                  {plan.promoMonthly || plan.monthly}
                  {!plan.customPricing && <span className="text-base text-white/60">/mês</span>}
                </p>
                {plan.promoMonthly && (
                  <p className="text-xs text-emerald-300 mt-1 uppercase tracking-[0.08em] font-semibold">
                    Valor promocional no primeiro mês
                  </p>
                )}
                <p className="text-sm text-white/60 mt-1">Limite de equipe: {plan.staffLimit}</p>
              </div>

              <div className="mt-5 space-y-2.5 flex-1">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm text-white/80">
                    <Check size={15} className="text-emerald-300 mt-0.5" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <Link
                  to={`/vendas/contratar?plano=${plan.id}${plan.customPricing ? '&contato=1' : ''}`}
                  className={`btn w-full justify-center ${plan.highlighted ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {plan.cta || 'Contratar Agora'}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-white/10 p-4">
            <p className="text-sm font-bold text-white flex items-center gap-2"><ShieldCheck size={15} className="text-emerald-300" /> Implantação segura</p>
            <p className="text-sm text-white/70 mt-2">Onboarding guiado por empresa, com isolamento de dados e permissão por módulo.</p>
          </div>
          <div className="rounded-2xl border border-white/10 p-4">
            <p className="text-sm font-bold text-white flex items-center gap-2"><Headset size={15} className="text-emerald-300" /> Suporte central</p>
            <p className="text-sm text-white/70 mt-2">Seu cliente abre atendimento no chat e sua equipe responde na Central YuiSync em um só painel.</p>
          </div>
          <div className="rounded-2xl border border-white/10 p-4">
            <p className="text-sm font-bold text-white flex items-center gap-2"><Sparkles size={15} className="text-emerald-300" /> Escala com margem</p>
            <p className="text-sm text-white/70 mt-2">Planos prontos para crescer sem perder controle operacional.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
