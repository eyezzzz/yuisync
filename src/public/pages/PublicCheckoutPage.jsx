import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Headset, ShieldCheck } from 'lucide-react'

const CHECKOUT_PLANS = {
  start: {
    id: 'start',
    name: 'Yui Start',
    promoMonthly: 197,
    fullMonthly: 297,
    staffLimit: '1 funcionário',
    ideal: 'Autônomos e iniciantes',
  },
  pro: {
    id: 'pro',
    name: 'Yui Pro',
    promoMonthly: 347,
    fullMonthly: 447,
    staffLimit: '3 funcionários',
    ideal: 'Empresas pequenas já inclusas no mercado',
  },
  prime: {
    id: 'prime',
    name: 'Yui Prime IA',
    promoMonthly: 597,
    fullMonthly: 697,
    staffLimit: '5 funcionários',
    ideal: 'Empresas que querem crescer ainda mais',
  },
  elite: {
    id: 'elite',
    name: 'Yui Elite',
    promoMonthly: null,
    fullMonthly: null,
    staffLimit: 'A partir de 6 funcionários',
    ideal: 'Operações com demanda custom e múltiplas unidades',
    custom: true,
  },
}

function toCurrency(value) {
  if (value == null) return 'Sob consulta'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export default function PublicCheckoutPage({ isAuthenticated = false }) {
  const [searchParams] = useSearchParams()
  const selectedId = searchParams.get('plano') || 'start'
  const plan = CHECKOUT_PLANS[selectedId] || CHECKOUT_PLANS.start
  const isContactFlow = plan.custom || searchParams.get('contato') === '1'
  const entryHref = isAuthenticated ? '/' : '/entrar'

  return (
    <div className="min-h-screen bg-[#07080D] text-white">
      <header className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link to="/vendas#planos" className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white">
          <ArrowLeft size={14} />
          Voltar para planos
        </Link>
        <Link to={entryHref} className="btn btn-secondary">
          {isAuthenticated ? 'Ir para painel' : 'Entrar'}
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-16">
        <div className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Etapa de contratação</p>
          <h1 className="mt-3 text-3xl md:text-4xl font-display font-black">
            {isContactFlow ? 'Atendimento personalizado' : `Contratar ${plan.name}`}
          </h1>
          <p className="mt-3 text-white/80">
            {isContactFlow
              ? 'Receba uma proposta sob medida para seu cenário operacional.'
              : 'Confira o resumo da oferta e continue para finalizar sua contratação.'}
          </p>
        </div>

        <section className="mt-6 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-5">
          <div className="rounded-3xl border border-white/10 bg-[#11131a] p-6">
            <h2 className="text-xl font-display font-bold">{plan.name}</h2>
            <p className="mt-2 text-sm text-white/70">Ideal: {plan.ideal}</p>
            <p className="mt-1 text-sm text-white/70">Limite de equipe: {plan.staffLimit}</p>

            {!isContactFlow && (
              <div className="mt-5 space-y-2">
                <p className="text-sm text-white/45 line-through">{toCurrency(plan.fullMonthly)}/mês</p>
                <p className="text-4xl font-display font-black text-emerald-300">{toCurrency(plan.promoMonthly)}/mês</p>
                <p className="text-sm text-emerald-200">Promoção válida para o primeiro mês.</p>
                <p className="text-sm text-white/70">A partir do segundo mês: {toCurrency(plan.fullMonthly)}/mês.</p>
              </div>
            )}

            {isContactFlow && (
              <div className="mt-5 space-y-2">
                <p className="text-3xl font-display font-black text-emerald-300">Sob consulta</p>
                <p className="text-sm text-white/70">
                  Uma proposta será montada com base no volume de equipe, automações e integrações necessárias.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#11131a] p-6 space-y-4">
            <h3 className="text-lg font-display font-bold">Próximo passo</h3>
            <div className="space-y-3 text-sm text-white/80">
              <p className="flex items-start gap-2">
                <CheckCircle2 size={14} className="text-emerald-300 mt-1 flex-shrink-0" />
                Confirmação dos dados da empresa e responsável.
              </p>
              <p className="flex items-start gap-2">
                <ShieldCheck size={14} className="text-emerald-300 mt-1 flex-shrink-0" />
                Definição do plano e ativação do ambiente com segurança.
              </p>
              <p className="flex items-start gap-2">
                <Headset size={14} className="text-emerald-300 mt-1 flex-shrink-0" />
                Onboarding acompanhado pela equipe YuiSync.
              </p>
            </div>

            <div className="pt-2">
              <Link to={entryHref} className="btn btn-primary w-full justify-center">
                {isContactFlow ? 'Entrar e falar com especialista' : 'Continuar contratação'}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
