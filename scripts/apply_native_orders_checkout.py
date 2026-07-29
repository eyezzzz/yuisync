from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new, label):
    text = path.read_text(encoding='utf-8')
    if old not in text:
        raise RuntimeError(f'{label}: trecho nao encontrado em {path}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


orders = ROOT / 'src/modules/petshop/pages/OrdensEntregaPage.jsx'
replace_once(
    orders,
    "import { Calendar, ClipboardList, MapPin, MessageSquare, Package, Printer, RefreshCw, Truck, UserCheck } from 'lucide-react'",
    "import { Calendar, ClipboardList, MapPin, MessageSquare, Package, Printer, RefreshCw, Scissors, Truck, UserCheck } from 'lucide-react'",
    'import icon',
)
replace_once(
    orders,
    "import { SERVICE_ORDER_FLOW, usePetshopAdvanced } from '../hooks/usePetshopAdvanced'",
    "import { SERVICE_ORDER_FLOW, usePetshopAdvanced } from '../hooks/usePetshopAdvanced'\nimport BanhoTosaPdvPanel from './BanhoTosaPdvPanel'\nimport { APPOINTMENT_CHECKOUT_EVENT, ORDERS_TAB_SESSION_KEY } from './appointmentCheckoutFlow'",
    'imports checkout',
)
helper = """function requestedInitialOrderType() {
  if (typeof window === 'undefined') return 'entrega'
  return window.sessionStorage.getItem(ORDERS_TAB_SESSION_KEY) === 'banho_tosa'
    ? 'banho_tosa'
    : 'entrega'
}

"""
text = orders.read_text(encoding='utf-8')
if helper.strip() not in text:
    text = text.replace('const ALL_STATUS_STEPS = [', helper + 'const ALL_STATUS_STEPS = [', 1)
    orders.write_text(text, encoding='utf-8')
replace_once(
    orders,
    "  const [orderType, setOrderType] = useState('entrega')",
    "  const [orderType, setOrderType] = useState(requestedInitialOrderType)",
    'initial order tab',
)
replace_once(
    orders,
    "  useEffect(() => {\n    reload(orderType, historyDate)\n  }, [orderType, historyDate])",
    """  useEffect(() => {
    if (orderType === 'banho_tosa') {
      setLoading(false)
      return
    }
    reload(orderType, historyDate)
  }, [orderType, historyDate])

  useEffect(() => {
    const openQueuedCheckout = () => {
      if (window.sessionStorage.getItem(ORDERS_TAB_SESSION_KEY) === 'banho_tosa') {
        setOrderType('banho_tosa')
      }
    }
    openQueuedCheckout()
    window.addEventListener(APPOINTMENT_CHECKOUT_EVENT, openQueuedCheckout)
    window.addEventListener('focus', openQueuedCheckout)
    return () => {
      window.removeEventListener(APPOINTMENT_CHECKOUT_EVENT, openQueuedCheckout)
      window.removeEventListener('focus', openQueuedCheckout)
    }
  }, [])

  useEffect(() => {
    if (orderType === 'banho_tosa') {
      window.sessionStorage.removeItem(ORDERS_TAB_SESSION_KEY)
    }
  }, [orderType])""",
    'effects native tab',
)
replace_once(
    orders,
    """        {[
          { id: 'entrega', label: 'Entregas' },
          { id: 'servico', label: 'Ordens de servico' },
        ].map((item) => (""",
    """        {[
          { id: 'entrega', label: 'Entregas' },
          { id: 'servico', label: 'Ordens de servico' },
          { id: 'banho_tosa', label: 'Banho & Tosa', icon: Scissors },
        ].map((item) => {
          const Icon = item.icon
          return (""",
    'native tabs map start',
)
replace_once(
    orders,
    """          >
            {item.label}
          </button>
        ))}""",
    """          >
            {Icon && <Icon size={14} />}
            {item.label}
          </button>
          )
        })}""",
    'native tabs map end',
)
replace_once(
    orders,
    """      <div className=\"flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-card px-4 py-3\">""",
    """      {orderType === 'banho_tosa' ? (
        <section data-yuisync-native-banho-tosa-tab className=\"space-y-6\">
          <BanhoTosaPdvPanel setPage={setPage} />
        </section>
      ) : (
        <>
      <div className=\"flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-card px-4 py-3\">""",
    'native content open',
)
closing = """        </>
      )}
    </div>
  )
}"""
replacement = """        </>
      )}
        </>
      )}
    </div>
  )
}"""
text = orders.read_text(encoding='utf-8')
if closing not in text:
    raise RuntimeError('native content close: trecho nao encontrado')
orders.write_text(text.replace(closing, replacement, 1), encoding='utf-8')

flow = ROOT / 'src/modules/petshop/pages/appointmentCheckoutFlow.js'
replace_once(
    flow,
    "export const APPOINTMENT_CHECKOUT_SESSION_KEY = 'yuisync:appointment-checkout'\nexport const ORDERS_TAB_SESSION_KEY = 'yuisync:orders-tab'",
    "export const APPOINTMENT_CHECKOUT_SESSION_KEY = 'yuisync:appointment-checkout'\nexport const ORDERS_TAB_SESSION_KEY = 'yuisync:orders-tab'\nexport const APPOINTMENT_CHECKOUT_EVENT = 'yuisync:appointment-checkout-queued'",
    'checkout event const',
)
replace_once(
    flow,
    """  window.sessionStorage.setItem(APPOINTMENT_CHECKOUT_SESSION_KEY, JSON.stringify(target))
  window.sessionStorage.setItem(ORDERS_TAB_SESSION_KEY, 'banho_tosa')
  return target""",
    """  window.sessionStorage.setItem(APPOINTMENT_CHECKOUT_SESSION_KEY, JSON.stringify(target))
  window.sessionStorage.setItem(ORDERS_TAB_SESSION_KEY, 'banho_tosa')
  window.dispatchEvent(new CustomEvent(APPOINTMENT_CHECKOUT_EVENT, { detail: target }))
  return target""",
    'dispatch checkout event',
)

pdv = ROOT / 'src/modules/petshop/pages/BanhoTosaPdvPanel.jsx'
replace_once(
    pdv,
    """  appointmentCheckoutTotals,
  clearQueuedAppointmentCheckout,
  readQueuedAppointmentCheckout,
} from './appointmentCheckoutFlow'""",
    """  APPOINTMENT_CHECKOUT_EVENT,
  appointmentCheckoutTotals,
  clearQueuedAppointmentCheckout,
  readQueuedAppointmentCheckout,
} from './appointmentCheckoutFlow'""",
    'pdv event import',
)
run_scoped = """  const runScoped = useCallback(
    (runner) => runWithTenantFallback(activeTenantId, runner),
    [activeTenantId],
  )
"""
addition = run_scoped + """
  const syncQueuedCheckout = useCallback(() => {
    const target = readQueuedAppointmentCheckout()
    if (!target?.appointment_id) return
    if (target.date) setDate(target.date)
    setFocusedId(String(target.appointment_id))
  }, [])

  useEffect(() => {
    syncQueuedCheckout()
    window.addEventListener(APPOINTMENT_CHECKOUT_EVENT, syncQueuedCheckout)
    window.addEventListener('focus', syncQueuedCheckout)
    return () => {
      window.removeEventListener(APPOINTMENT_CHECKOUT_EVENT, syncQueuedCheckout)
      window.removeEventListener('focus', syncQueuedCheckout)
    }
  }, [syncQueuedCheckout])
"""
replace_once(pdv, run_scoped, addition, 'pdv queued sync')

integrated = ROOT / 'src/modules/petshop/pages/OrdensBanhoTosaIntegratedPage.jsx'
integrated.write_text("""import OrdensEntregaPage from './OrdensEntregaPage'

export default function OrdensBanhoTosaIntegratedPage({ setPage }) {
  return <OrdensEntregaPage setPage={setPage} />
}
""", encoding='utf-8')

print('native orders checkout patch applied')
