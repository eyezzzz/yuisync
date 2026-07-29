from pathlib import Path

agenda_path = Path('src/modules/petshop/pages/AgendaPage.jsx')
integration_path = Path('src/modules/petshop/pages/AgendaPackageIntegratedPage.jsx')
workflow_path = Path('.github/workflows/apply-native-agenda-patch.yml')
script_path = Path(__file__)

text = agenda_path.read_text(encoding='utf-8')

def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: esperado 1 trecho, encontrado {count}')
    text = text.replace(old, new, 1)

replace_once(
    "import { usePetshopAdvanced } from '../hooks/usePetshopAdvanced'\n",
    "import { usePetshopAdvanced } from '../hooks/usePetshopAdvanced'\nimport { useCatalogPlans } from '../hooks/useCatalogPlans'\nimport { activeSubscriptionForClient, buildCatalogUsageSummary } from '../lib/catalogPlanServices'\n",
    'imports de planos',
)

replace_once(
    "function ApptModal({ appt, onClose, onCreate, onUpdate, onReceipt, pets, services = SERVICES, staff = [], serviceDurations, onSearchClients, appointments = [], slotCapacity = MANUAL_SLOT_CAPACITY }) {",
    "function ApptModal({ appt, onClose, onCreate, onUpdate, onReceipt, pets, services = SERVICES, subscriptions = [], staff = [], serviceDurations, onSearchClients, appointments = [], slotCapacity = MANUAL_SLOT_CAPACITY }) {",
    'propriedade subscriptions no modal',
)

replace_once(
    "  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))\n  const petSearch = form.pet_search || ''\n  const deferredPetSearch = useDeferredValue(petSearch)\n  const serviceTotals = useMemo(() => {\n    const totals = calculateAppointmentServiceTotals(form.service_codes, serviceOptions)\n",
    "  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))\n  const petSearch = form.pet_search || ''\n  const deferredPetSearch = useDeferredValue(petSearch)\n  const activeSubscription = useMemo(\n    () => activeSubscriptionForClient(subscriptions, form.pet_id),\n    [subscriptions, form.pet_id],\n  )\n  const packageUsage = useMemo(\n    () => activeSubscription ? buildCatalogUsageSummary(activeSubscription, services) : [],\n    [activeSubscription, services],\n  )\n  const packageServiceEntries = useMemo(() => packageUsage.filter((item) => (\n    item.service_kind === 'catalog'\n    && item.catalog_service\n    && item.catalog_service.group_type === serviceGroup\n    && Number(item.remaining || 0) > 0\n  )), [packageUsage, serviceGroup])\n  const packageServiceCodes = useMemo(\n    () => new Set(packageServiceEntries.map((item) => String(item.service_code || item.service_type))),\n    [packageServiceEntries],\n  )\n  const packageTransport = useMemo(\n    () => packageUsage.find((item) => item.service_kind === 'transport' || item.service_type === 'motodog') || null,\n    [packageUsage],\n  )\n  const packageName = activeSubscription?.subscription_plans?.name || 'Pacote ativo'\n  const serviceTotals = useMemo(() => {\n    const totals = calculateAppointmentServiceTotals(form.service_codes, serviceOptions)\n    const packageAdjustedPrice = totals.services.reduce((sum, service) => (\n      sum + (packageServiceCodes.has(String(service.value)) ? 0 : Number(service.price || 0))\n    ), 0)\n",
    'estado nativo do pacote',
)

replace_once(
    "    if (serviceGroup !== 'banho_tosa') return totals\n",
    "    if (serviceGroup !== 'banho_tosa') return { ...totals, price: packageAdjustedPrice }\n",
    'preco veterinario',
)

replace_once(
    "      ...totals,\n      duration: totals.services.reduce((sum, service) => sum + resolvePetshopServiceDuration({",
    "      ...totals,\n      price: packageAdjustedPrice,\n      duration: totals.services.reduce((sum, service) => sum + resolvePetshopServiceDuration({",
    'preco coberto pelo pacote',
)

replace_once(
    "  }, [form.service_codes, serviceOptions, serviceGroup, serviceDurations, selectedClient?.weight_kg, appt?.pets?.weight_kg])",
    "  }, [form.service_codes, serviceOptions, serviceGroup, serviceDurations, selectedClient?.weight_kg, appt?.pets?.weight_kg, packageServiceCodes])",
    'dependencias do total',
)

replace_once(
    "    return serviceOptions\n      .filter((service) => !selectedCodes.has(String(service.value)))\n      .filter((service) => !query || safeLower([service.label, service.value].filter(Boolean).join(' ')).includes(query))\n      .slice(0, 12)\n  }, [serviceOptions, form.service_codes, serviceSearch])",
    "    return serviceOptions\n      .filter((service) => !selectedCodes.has(String(service.value)))\n      .filter((service) => !query || safeLower([service.label, service.value].filter(Boolean).join(' ')).includes(query))\n      .sort((left, right) => {\n        const packagePriority = Number(packageServiceCodes.has(String(right.value))) - Number(packageServiceCodes.has(String(left.value)))\n        if (packagePriority !== 0) return packagePriority\n        return String(left.label || '').localeCompare(String(right.label || ''), 'pt-BR')\n      })\n  }, [serviceOptions, form.service_codes, serviceSearch, packageServiceCodes])",
    'lista completa de servicos',
)

replace_once(
    "    setServiceSearch('')\n    setServicePickerOpen(true)\n    setErr('')\n    requestAnimationFrame(() => serviceSearchRef.current?.focus())\n  }\n\n  const removeService",
    "    setServiceSearch('')\n    setServicePickerOpen(false)\n    setErr('')\n  }\n\n  const addPackageServices = () => {\n    const codes = packageServiceEntries.map((item) => String(item.service_code || item.service_type)).filter(Boolean)\n    if (!codes.length) return setErr('O pacote ativo não possui serviço disponível nesta aba.')\n    setForm((current) => ({\n      ...current,\n      service_codes: [...new Set([...current.service_codes, ...codes])],\n    }))\n    setServiceSearch('')\n    setServicePickerOpen(false)\n    setErr('')\n  }\n\n  const removeService",
    'fechamento do seletor e uso do pacote',
)

replace_once(
    "              <label className=\"inp-label\">{serviceGroupLabel}</label>\n              {serviceOptions.length === 0 ? (",
    "              <label className=\"inp-label\">{serviceGroupLabel}</label>\n              {serviceGroup === 'banho_tosa' && activeSubscription && (\n                <section data-yuisync-native-package-panel className=\"mb-3 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 p-4\">\n                  <div className=\"flex flex-wrap items-start justify-between gap-3\">\n                    <div>\n                      <p className=\"text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300\">Pacote ativo · prioridade</p>\n                      <p className=\"mt-1 text-base font-black text-text\">{packageName}</p>\n                      <p className=\"mt-1 text-xs text-muted\">{selectedPet?.pet_name || 'Pet'} · Tutor: {selectedPet?.owner_name || 'Cliente'}</p>\n                    </div>\n                    <span className=\"badge badge-green\">Agenda nativa v1</span>\n                  </div>\n                  <div className=\"mt-3 flex flex-wrap gap-2\">\n                    {packageUsage.map((item) => (\n                      <span key={item.service_type} className={`badge ${Number(item.remaining || 0) > 0 ? 'badge-blue' : 'badge-gray'}`}>\n                        {item.label}: {item.remaining}/{item.total} disponíveis\n                      </span>\n                    ))}\n                  </div>\n                  {packageTransport && Number(packageTransport.remaining || 0) > 0 && (\n                    <p className=\"mt-2 text-xs font-semibold text-sky-300\">MotoDog disponível: {packageTransport.remaining}/{packageTransport.total}. O transporte só é consumido quando selecionado abaixo.</p>\n                  )}\n                  {packageServiceEntries.length > 0 ? (\n                    <>\n                      <button type=\"button\" onClick={addPackageServices} className=\"btn btn-primary mt-3 w-full justify-center\">\n                        Usar {packageName}\n                      </button>\n                      <div className=\"mt-3 space-y-2\">\n                        {packageServiceEntries.map((entry) => (\n                          <button\n                            key={entry.service_type}\n                            type=\"button\"\n                            onClick={() => addService(String(entry.service_code || entry.service_type))}\n                            className=\"flex w-full items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-left hover:bg-emerald-500/15\"\n                          >\n                            <CheckCircle size={15} className=\"shrink-0 text-emerald-300\"/>\n                            <span className=\"min-w-0 flex-1\">\n                              <span className=\"block truncate text-sm font-bold text-text\">{entry.label}</span>\n                              <span className=\"block text-xs text-muted\">{entry.remaining} disponível(is) · R$ 0,00</span>\n                            </span>\n                            <span className=\"badge badge-green\">Pacote</span>\n                          </button>\n                        ))}\n                      </div>\n                    </>\n                  ) : (\n                    <p className=\"mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200\">O pacote está ativo, mas não possui serviço de banho/tosa disponível neste ciclo.</p>\n                  )}\n                </section>\n              )}\n              {serviceOptions.length === 0 ? (",
    'painel nativo no JSX',
)

replace_once(
    "                        {availableServiceOptions.map((service) => {\n                          const Icon = service.icon || PawPrint\n                          return (",
    "                        {availableServiceOptions.map((service) => {\n                          const Icon = service.icon || PawPrint\n                          const coveredByPackage = packageServiceCodes.has(String(service.value))\n                          return (",
    'flag de cobertura na lista',
)

replace_once(
    "                              className=\"flex w-full items-center gap-3 border-b border-[var(--border2)] px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-white/7\"\n",
    "                              className={`flex w-full items-center gap-3 border-b border-[var(--border2)] px-3 py-2.5 text-left transition-colors last:border-b-0 ${coveredByPackage ? 'bg-emerald-500/10 hover:bg-emerald-500/15' : 'hover:bg-white/7'}`}\n",
    'estilo de opcao coberta',
)

replace_once(
    "                                <span className=\"block text-xs text-muted\">{fmtCurrency(service.price)} · {service.duration || 60} min</span>\n",
    "                                <span className={`block text-xs ${coveredByPackage ? 'font-semibold text-emerald-300' : 'text-muted'}`}>{coveredByPackage ? 'Pacote · R$ 0,00' : fmtCurrency(service.price)} · {service.duration || 60} min</span>\n",
    'preco na lista nativa',
)

replace_once(
    "                              <Plus size={15} className=\"flex-shrink-0 text-amber-400\"/>\n",
    "                              {coveredByPackage ? <span className=\"badge badge-green\">Pacote</span> : <Plus size={15} className=\"flex-shrink-0 text-amber-400\"/>}\n",
    'badge na lista nativa',
)

replace_once(
    "                               <span className=\"block text-xs text-muted\">{fmtCurrency(service.price)} · {displayedDuration} min</span>\n",
    "                               <span className=\"block text-xs text-muted\">{packageServiceCodes.has(String(service.value)) ? 'Pacote · R$ 0,00' : fmtCurrency(service.price)} · {displayedDuration} min</span>\n",
    'preco do servico selecionado',
)

replace_once(
    "  const { loadPetshopServices } = usePetshopAdvanced()\n  const { storeSettings } = useAuthCtx()\n",
    "  const { loadPetshopServices } = usePetshopAdvanced()\n  const { loadSubscriptions } = useCatalogPlans()\n  const { storeSettings } = useAuthCtx()\n",
    'hook de assinaturas na agenda',
)

replace_once(
    "  const [agendaServices, setAgendaServices] = useState(SERVICES)\n",
    "  const [agendaServices, setAgendaServices] = useState(SERVICES)\n  const [subscriptions, setSubscriptions] = useState([])\n",
    'estado de assinaturas na pagina',
)

replace_once(
    "    loadPets()\n    loadPetshopServices().then((items) => setAgendaServices(asAgendaServices(items))).catch((err) => console.warn('Falha ao carregar servicos:', err))\n  }, [loadPets, loadPetshopServices])",
    "    loadPets()\n    loadPetshopServices().then((items) => setAgendaServices(asAgendaServices(items))).catch((err) => console.warn('Falha ao carregar servicos:', err))\n    loadSubscriptions().then((items) => setSubscriptions(items || [])).catch((err) => console.warn('Falha ao carregar assinaturas:', err))\n  }, [loadPets, loadPetshopServices, loadSubscriptions])",
    'carregamento de assinaturas',
)

replace_once(
    "          services={agendaServices}\n          staff={staff}\n",
    "          services={agendaServices}\n          subscriptions={subscriptions}\n          staff={staff}\n",
    'assinaturas passadas ao modal',
)

agenda_path.write_text(text, encoding='utf-8')

integration = integration_path.read_text(encoding='utf-8')
integration = integration.replace("import AgendaPackageInlinePanel from './AgendaPackageInlinePanel'\n", '')
integration = integration.replace('      <AgendaPackageInlinePanel />\n', '')
integration_path.write_text(integration, encoding='utf-8')

if workflow_path.exists():
    workflow_path.unlink()
if script_path.exists():
    script_path.unlink()
