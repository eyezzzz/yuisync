from pathlib import Path


def replace_once(path, old, new):
    file_path = Path(path)
    text = file_path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: esperava 1 ocorrência, encontrei {count}\nTrecho: {old[:160]!r}')
    file_path.write_text(text.replace(old, new, 1), encoding='utf-8')


pets = 'src/modules/petshop/pages/PetsPage.jsx'
agenda = 'src/modules/petshop/pages/AgendaPage.jsx'
plans = 'src/modules/petshop/pages/PlanosNativePage.jsx'
test_file = 'test/multiPetPackages.test.mjs'

replace_once(
    pets,
    "function PetModal({ pet, plans, subscription, onClose, onSave }) {\n  const [form, setForm] = useState({",
    "function PetModal({ pet, plans, subscription, onClose, onSave }) {\n  const addingPetForTutor = Boolean(pet?.adding_pet_for_tutor)\n  const [form, setForm] = useState({",
)
replace_once(
    pets,
    "    if (!form.owner_name.trim()) return setError('Informe o nome do tutor.')\n    if (!form.phone.trim()) return setError('Informe o telefone.')\n    setSaving(true)",
    "    if (!form.owner_name.trim()) return setError('Informe o nome do tutor.')\n    if (!form.phone.trim()) return setError('Informe o telefone.')\n    if (!form.pet_name.trim()) return setError('Informe o nome do pet.')\n    setSaving(true)",
)
replace_once(
    pets,
    "            <h2 className=\"font-display font-bold text-xl text-text\">{pet?.adding_pet_for_tutor ? 'Adicionar pet ao cliente' : pet?.id ? 'Editar cliente e pet' : 'Novo cliente e pet'}</h2>\n            <p className=\"text-sm text-muted mt-1\">{pet?.adding_pet_for_tutor ? 'Os dados do tutor foram mantidos; complete apenas o novo pet.' : 'Essa tela conversa direto com a aba de planos.'}</p>",
    "            <h2 className=\"font-display font-bold text-xl text-text\">{addingPetForTutor ? 'Adicionar pet ao cliente' : pet?.id ? 'Editar cliente e pet' : 'Novo cliente e pet'}</h2>\n            <p className=\"text-sm text-muted mt-1\">{addingPetForTutor ? 'Os dados do tutor foram mantidos; complete apenas o novo pet.' : 'Essa tela conversa direto com a aba de planos.'}</p>",
)
replace_once(
    pets,
    "        <div className=\"modal-body space-y-5\">\n          <div className=\"grid grid-cols-1 xl:grid-cols-2 gap-5\">",
    "        <div className=\"modal-body space-y-5\">\n          {addingPetForTutor && (\n            <div className=\"rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100\">\n              Novo pet para <strong>{form.owner_name}</strong>. Os dados do tutor ficam bloqueados para evitar cadastros divergentes.\n            </div>\n          )}\n          <div className=\"grid grid-cols-1 xl:grid-cols-2 gap-5\">",
)
replace_once(
    pets,
    "            <div className=\"rounded-2xl border border-[var(--border)] bg-card p-5 grid grid-cols-1 md:grid-cols-2 gap-3\">",
    "            <fieldset disabled={addingPetForTutor} className=\"rounded-2xl border border-[var(--border)] bg-card p-5 grid grid-cols-1 md:grid-cols-2 gap-3 disabled:opacity-70\">",
)
replace_once(
    pets,
    "              <div><label className=\"inp-label\">Referencia</label><input className=\"inp\" value={form.address_reference || ''} onChange={(e) => setField('address_reference', e.target.value)} /></div>\n            </div>\n            <div className=\"rounded-2xl border border-[var(--border)] bg-card p-5 grid grid-cols-1 md:grid-cols-2 gap-3\">",
    "              <div><label className=\"inp-label\">Referencia</label><input className=\"inp\" value={form.address_reference || ''} onChange={(e) => setField('address_reference', e.target.value)} /></div>\n            </fieldset>\n            <div className=\"rounded-2xl border border-[var(--border)] bg-card p-5 grid grid-cols-1 md:grid-cols-2 gap-3\">",
)
replace_once(
    pets,
    "<button onClick={submit} disabled={saving} className=\"btn btn-primary flex-1 justify-center\">{saving ? 'Salvando...' : 'Salvar cadastro'}</button>",
    "<button onClick={submit} disabled={saving} className=\"btn btn-primary flex-1 justify-center\">{saving ? 'Salvando...' : addingPetForTutor ? 'Salvar novo pet' : 'Salvar cadastro'}</button>",
)
replace_once(
    pets,
    "function PetDrawer({ pet, subscription, onClose, onEdit, onAddPet, speciesIcon, serviceLabel, statusBadge }) {",
    "function PetDrawer({ pet, subscriptions = [], onClose, onEdit, onAddPet, speciesIcon, serviceLabel, statusBadge }) {",
)
replace_once(
    pets,
    "  const registrationBadge = getRegistrationBadge(pet)\n\n  return createPortal(",
    "  const registrationBadge = getRegistrationBadge(pet)\n  const packageSubscriptions = (subscriptions || []).filter((item) => ['active', 'paused'].includes(item.status))\n  const activePackageSubscriptions = packageSubscriptions.filter((item) => item.status === 'active')\n  const combinedUsageMap = new Map()\n  packageSubscriptions.forEach((item) => {\n    ;(item.usage_summary || []).forEach((usage) => {\n      const key = usage.service_type || usage.service_code || usage.label\n      if (!key) return\n      const current = combinedUsageMap.get(key) || { ...usage, used: 0, total: 0, remaining: 0 }\n      combinedUsageMap.set(key, {\n        ...current,\n        used: Number(current.used || 0) + Number(usage.used || 0),\n        total: Number(current.total || 0) + Number(usage.total || 0),\n        remaining: Number(current.remaining || 0) + Number(usage.remaining || 0),\n      })\n    })\n  })\n  const combinedUsage = [...combinedUsageMap.values()]\n  const nextBilling = activePackageSubscriptions.map((item) => item.next_billing_date).filter(Boolean).sort()[0] || '-'\n\n  return createPortal(",
)
replace_once(
    pets,
    "          <div className=\"rounded-2xl border border-[var(--border)] bg-card p-5 space-y-3\">\n            <div className=\"flex items-center justify-between gap-3\"><p className=\"text-xs uppercase tracking-widest text-muted font-bold\">Plano vinculado</p>{subscription && <span className={`badge ${getPlanTone(subscription.status)}`}>{PLAN_LABELS[subscription.status] || 'Plano'}</span>}</div>\n            {subscription ? (\n              <>\n                <div className=\"flex items-center justify-between text-sm\"><span className=\"text-muted\">Plano</span><span className=\"font-semibold text-text\">{subscription.subscription_plans?.name || '-'}</span></div>\n                <div className=\"flex items-center justify-between text-sm\"><span className=\"text-muted\">Proxima cobranca</span><span className=\"font-semibold text-text\">{subscription.next_billing_date || '-'}</span></div>\n                <div className=\"space-y-2 pt-2\">{(subscription.usage_summary || []).map((usage) => <div key={`${subscription.id}-${usage.service_type}`} className=\"rounded-xl border border-[var(--border)] bg-surface/70 px-4 py-3\"><div className=\"flex items-center justify-between gap-3 text-sm\"><span className=\"text-text\">{getServiceLabel(usage.service_type)}</span><span className=\"text-emerald-500 font-semibold\">{usage.remaining} restantes</span></div><p className=\"text-xs text-muted mt-1\">{usage.used}/{usage.total} usados neste ciclo</p></div>)}</div>\n              </>\n            ) : <div className=\"rounded-xl border border-dashed border-[var(--border)] px-4 py-5 text-sm text-muted\">Este cliente ainda nao tem plano ativo.</div>}\n          </div>",
    "          <div className=\"rounded-2xl border border-[var(--border)] bg-card p-5 space-y-3\">\n            <div className=\"flex items-center justify-between gap-3\"><p className=\"text-xs uppercase tracking-widest text-muted font-bold\">Pacotes vinculados</p>{packageSubscriptions.length > 0 && <span className={`badge ${activePackageSubscriptions.length ? 'badge-green' : 'badge-amber'}`}>{activePackageSubscriptions.length ? `${activePackageSubscriptions.length} ativo(s)` : 'Pausado'}</span>}</div>\n            {packageSubscriptions.length > 0 ? (\n              <>\n                <div className=\"flex items-start justify-between gap-4 text-sm\"><span className=\"text-muted\">Compras</span><span className=\"text-right font-semibold text-text\">{packageSubscriptions.map((item) => item.subscription_plans?.name || 'Pacote').join(' + ')}</span></div>\n                <div className=\"flex items-center justify-between text-sm\"><span className=\"text-muted\">Proxima cobranca</span><span className=\"font-semibold text-text\">{nextBilling}</span></div>\n                <div className=\"space-y-2 pt-2\">{combinedUsage.map((usage) => <div key={usage.service_type || usage.service_code || usage.label} className=\"rounded-xl border border-[var(--border)] bg-surface/70 px-4 py-3\"><div className=\"flex items-center justify-between gap-3 text-sm\"><span className=\"text-text\">{usage.label || getServiceLabel(usage.service_type)}</span><span className=\"text-emerald-500 font-semibold\">{usage.remaining} restantes</span></div><p className=\"text-xs text-muted mt-1\">{usage.used}/{usage.total} usados somando os pacotes</p></div>)}</div>\n              </>\n            ) : <div className=\"rounded-xl border border-dashed border-[var(--border)] px-4 py-5 text-sm text-muted\">Este pet ainda nao tem pacote ativo ou pausado.</div>}\n          </div>",
)
replace_once(
    pets,
    "  const latestSubscriptionByClient = useMemo(() => {",
    "  const subscriptionsByClient = useMemo(() => {\n    const map = new Map()\n    ;[...(subscriptions || [])].sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0)).forEach((item) => {\n      const rows = map.get(item.client_id) || []\n      rows.push(item)\n      map.set(item.client_id, rows)\n    })\n    return map\n  }, [subscriptions])\n\n  const latestSubscriptionByClient = useMemo(() => {",
)
replace_once(
    pets,
    "  const activePlanCount = useMemo(() => [...latestSubscriptionByClient.values()].filter((item) => item.status === 'active').length, [latestSubscriptionByClient])",
    "  const activePlanCount = useMemo(() => [...subscriptionsByClient.values()].filter((items) => items.some((item) => item.status === 'active')).length, [subscriptionsByClient])",
)
replace_once(
    pets,
    "      const subscription = latestSubscriptionByClient.get(pet.id)\n      const matchesText = Boolean(query) && matchesSearchTerms(search, [",
    "      const clientSubscriptions = subscriptionsByClient.get(pet.id) || []\n      const subscription = latestSubscriptionByClient.get(pet.id)\n      const matchesText = Boolean(query) && matchesSearchTerms(search, [",
)
replace_once(
    pets,
    "        subscription?.subscription_plans?.name,\n      ])",
    "        ...clientSubscriptions.map((item) => item.subscription_plans?.name),\n      ])",
)
replace_once(
    pets,
    "      const matchesPlan = !planFilter || subscription?.status === planFilter",
    "      const matchesPlan = !planFilter || clientSubscriptions.some((item) => item.status === planFilter)",
)
replace_once(
    pets,
    "  }, [latestSubscriptionByClient, pets, planFilter, search, speciesFilter])",
    "  }, [latestSubscriptionByClient, pets, planFilter, search, speciesFilter, subscriptionsByClient])",
)
replace_once(
    pets,
    "                  <div className=\"mt-4 flex items-center justify-end gap-2\">\n                    <button onClick={() => setModalPet(pet)} className=\"btn btn-secondary btn-sm\">Editar</button>",
    "                  <div className=\"mt-4 flex flex-wrap items-center justify-end gap-2\">\n                    <button onClick={() => openAddPetForTutor(pet)} className=\"btn btn-primary btn-sm\"><Plus size={13}/> Adicionar pet</button>\n                    <button onClick={() => setModalPet(pet)} className=\"btn btn-secondary btn-sm\">Editar</button>",
)
replace_once(
    pets,
    "<div className=\"flex justify-end gap-2\"><button onClick={(e) => { e.stopPropagation(); setModalPet(pet) }} className=\"btn btn-secondary btn-sm\">Editar</button>",
    "<div className=\"flex justify-end gap-2\"><button onClick={(e) => { e.stopPropagation(); openAddPetForTutor(pet) }} className=\"btn btn-primary btn-sm\"><Plus size={13}/> Adicionar pet</button><button onClick={(e) => { e.stopPropagation(); setModalPet(pet) }} className=\"btn btn-secondary btn-sm\">Editar</button>",
)
replace_once(
    pets,
    "{drawerPet && <PetDrawer pet={drawerPet} subscription={latestSubscriptionByClient.get(drawerPet.id)}",
    "{drawerPet && <PetDrawer pet={drawerPet} subscriptions={subscriptionsByClient.get(drawerPet.id) || []}",
)

replace_once(
    agenda,
    "function ApptModal({ appt, onClose, onCreate, onUpdate, onReceipt, onRefreshSubscriptions, pets, services = SERVICES, subscriptions = [], staff = [], serviceDurations, onSearchClients, appointments = [], slotCapacity = MANUAL_SLOT_CAPACITY }) {",
    "function ApptModal({ appt, onClose, onCreate, onUpdate, onReceipt, onRefreshSubscriptions, onManagePets, pets, services = SERVICES, subscriptions = [], staff = [], serviceDurations, onSearchClients, appointments = [], slotCapacity = MANUAL_SLOT_CAPACITY }) {",
)
replace_once(
    agenda,
    "  const selectedPet = useMemo(() => (\n    (selectedClient?.id === form.pet_id ? selectedClient : null)\n    || (pets || []).find((pet) => pet.id === form.pet_id)\n    || (appt?.pets?.id === form.pet_id ? appt.pets : null)\n  ), [selectedClient, pets, form.pet_id, appt?.pets])",
    "  const selectedPet = useMemo(() => (\n    (selectedClient?.id === form.pet_id ? selectedClient : null)\n    || (pets || []).find((pet) => pet.id === form.pet_id)\n    || (appt?.pets?.id === form.pet_id ? appt.pets : null)\n  ), [selectedClient, pets, form.pet_id, appt?.pets])\n  const selectedTutorPets = useMemo(() => {\n    if (!form.pet_id) return []\n    const unique = new Map()\n    ;[...(pets || []), ...remotePets, selectedClient].filter(Boolean).forEach((pet) => unique.set(pet.id, pet))\n    const group = groupPetsByTutor([...unique.values()]).find((item) => item.pets.some((pet) => pet.id === form.pet_id))\n    return group?.pets || []\n  }, [pets, remotePets, selectedClient, form.pet_id])",
)
replace_once(
    agenda,
    "              <label className=\"inp-label flex items-center gap-2\"><Plus size={14}/> Selecionar cliente e pet</label>",
    "              <div className=\"flex flex-wrap items-center justify-between gap-2\">\n                <label className=\"inp-label mb-0 flex items-center gap-2\"><Plus size={14}/> Selecionar cliente e pet</label>\n                {onManagePets && <button type=\"button\" onClick={onManagePets} className=\"btn btn-ghost btn-sm\"><PawPrint size={13}/> Gerenciar clientes e pets</button>}\n              </div>",
)
replace_once(
    agenda,
    "                      {[selectedPet.pet_name, selectedPet.breed || selectedPet.species, selectedPet.phone].filter(Boolean).join(' - ') || 'Cadastro sem pet informado'}",
    "                      {selectedTutorPets.length > 1\n                        ? `Pet selecionado: ${selectedPet.pet_name || 'sem nome'} · ${selectedTutorPets.length} pets no cadastro`\n                        : [selectedPet.pet_name, selectedPet.breed || selectedPet.species, selectedPet.phone].filter(Boolean).join(' - ') || 'Cadastro sem pet informado'}",
)
replace_once(
    agenda,
    "              )}\n              {serviceOptions.length === 0 ? (",
    "              )}\n              {serviceGroup === 'banho_tosa' && selectedPet && activeSubscriptions.length === 0 && (\n                <div className=\"mb-3 rounded-xl border border-[var(--border2)] bg-white/[0.03] px-4 py-3 text-xs text-muted\">\n                  <strong className=\"text-text\">{selectedPet.pet_name || 'Este pet'}</strong> não possui pacote ativo. Os serviços selecionados serão cobrados como atendimento avulso.\n                </div>\n              )}\n              {serviceOptions.length === 0 ? (",
)
replace_once(
    agenda,
    "        <button onClick={() => setModal({ serviceGroup: activeAgendaTab })} className=\"btn btn-primary\">\n          <Plus size={16}/> Novo Agendamento\n        </button>",
    "        <div className=\"flex flex-wrap gap-2\">\n          <button type=\"button\" onClick={() => setPage?.('pets')} className=\"btn btn-secondary\"><PawPrint size={15}/> Clientes & Pets</button>\n          <button onClick={() => setModal({ serviceGroup: activeAgendaTab })} className=\"btn btn-primary\">\n            <Plus size={16}/> Novo Agendamento\n          </button>\n        </div>",
)
replace_once(
    agenda,
    "          onRefreshSubscriptions={() => loadSubscriptions().then((items) => setSubscriptions(items || []))}\n          onReceipt={setReceipt}",
    "          onRefreshSubscriptions={() => loadSubscriptions().then((items) => setSubscriptions(items || []))}\n          onManagePets={() => { setModal(null); setPage?.('pets') }}\n          onReceipt={setReceipt}",
)

replace_once(
    plans,
    "function ClientPicker({ clients, selectedId, onSelect }) {",
    "function ClientPicker({ clients, selectedId, onSelect, onManagePets }) {",
)
replace_once(
    plans,
    "      <label className=\"inp-label\">Pet que receberá o pacote</label>",
    "      <div className=\"flex flex-wrap items-center justify-between gap-2\">\n        <label className=\"inp-label mb-0\">Pet que receberá o pacote</label>\n        {onManagePets && <button type=\"button\" onClick={onManagePets} className=\"btn btn-ghost btn-sm\"><PawPrint size={13}/> Gerenciar clientes e pets</button>}\n      </div>\n      <p className=\"mb-2 mt-1 text-xs text-muted\">Cada venda fica vinculada ao pet escolhido, mesmo quando o tutor possui vários pets.</p>",
)
replace_once(
    plans,
    "function SubscriptionModal({ plans, clients, catalogServices, onClose, onSave }) {",
    "function SubscriptionModal({ plans, clients, catalogServices, onClose, onSave, onManagePets }) {",
)
replace_once(
    plans,
    "          <ClientPicker clients={clients} selectedId={form.client_id} onSelect={(clientId) => setForm((current) => ({ ...current, client_id: clientId }))}/>",
    "          <ClientPicker clients={clients} selectedId={form.client_id} onSelect={(clientId) => setForm((current) => ({ ...current, client_id: clientId }))} onManagePets={onManagePets}/>",
)
replace_once(
    plans,
    "          <button type=\"button\" onClick={() => setSubscriptionModal(true)} className=\"btn btn-secondary\"><Repeat2 size={15}/> Nova assinatura</button>\n          <button type=\"button\" onClick={() => setPlanModal({})} className=\"btn btn-primary\"><Plus size={15}/> Novo pacote</button>",
    "          <button type=\"button\" onClick={() => setPage?.('pets')} className=\"btn btn-secondary\"><PawPrint size={15}/> Clientes & Pets</button>\n          <button type=\"button\" onClick={() => setSubscriptionModal(true)} className=\"btn btn-secondary\"><Repeat2 size={15}/> Vender pacote</button>\n          <button type=\"button\" onClick={() => setPlanModal({})} className=\"btn btn-primary\"><Plus size={15}/> Novo pacote</button>",
)
replace_once(
    plans,
    "{subscriptionModal && <SubscriptionModal plans={plans.filter((plan) => plan.active)} clients={clients} catalogServices={catalogServices} onClose={() => setSubscriptionModal(false)} onSave={handleSaveSubscription}/>} ",
    "{subscriptionModal && <SubscriptionModal plans={plans.filter((plan) => plan.active)} clients={clients} catalogServices={catalogServices} onClose={() => setSubscriptionModal(false)} onSave={handleSaveSubscription} onManagePets={() => { setSubscriptionModal(false); setPage?.('pets') }}/>} ",
)

replace_once(
    test_file,
    "  assert.match(agenda, /groupPetsByTutor/)\n  assert.match(agenda, /Escolha o pet para este agendamento/)\n  assert.match(plans, /Escolha qual pet receberá o pacote/)\n  assert.match(pets, /Adicionar pet/)\n  assert.match(migration, /reserve_petshop_client_subscription_benefit/)",
    "  assert.match(agenda, /groupPetsByTutor/)\n  assert.match(agenda, /Escolha o pet para este agendamento/)\n  assert.match(agenda, /Gerenciar clientes e pets/)\n  assert.match(plans, /Escolha qual pet receberá o pacote/)\n  assert.match(plans, /Cada venda fica vinculada ao pet escolhido/)\n  assert.match(pets, /openAddPetForTutor\\(pet\\)/)\n  assert.match(pets, /Pacotes vinculados/)\n  assert.match(migration, /reserve_petshop_client_subscription_benefit/)",
)

print('Revisão visual multi-pet aplicada com sucesso.')
