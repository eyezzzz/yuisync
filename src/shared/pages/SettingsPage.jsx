import { useState, useEffect } from 'react'
import {
  Settings, Save, Store, Printer, MapPin, Phone, RefreshCw, AlertCircle, Check,
  FileText, Building2, Users2, Plus, Bot, Truck,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthCtx } from '../../context/AuthContext'
import { useModuleCtx } from '../../context/ModuleContext'
import { MODULES } from '../../config/modules'
import { buildTenantPayload, isTenantSchemaError, runWithTenantFallback } from '../../lib/tenant'
import { DEFAULT_PETBOT_PROMPT } from '../../../shared/petbotPrompt'

const DEFAULT_PET_TRANSPORT_OPTIONS = [
  { id: 'buscar_e_levar', label: 'Buscar e levar', fee: '20.00', maxWeightKg: '10', active: true },
  { id: 'somente_buscar', label: 'Somente buscar', fee: '15.00', maxWeightKg: '10', active: true },
  { id: 'somente_levar', label: 'Somente levar', fee: '15.00', maxWeightKg: '10', active: true },
]

const DEFAULT_MESSAGE_TEMPLATES = {
  appointment_summary: 'Ola [NOME], segue o resumo do seu agendamento\n\nPet: [PET]\nValor do agendamento: [VALOR]\nLocal: [LOJA]\nEndereco: [ENDERECO_LOJA]\nData: [DATA]\nHorario: [HORARIO]',
  registration_checklist: 'Assim que possivel envie: data de nascimento do tutor, CPF, CEP, numero da casa, ponto de referencia, nome e raca do pet para completar o cadastro conosco.',
  payment_proof_request: 'Por gentileza, envie o comprovante de pagamento para darmos baixa no sistema.',
  motodog_options: 'MotoDog: buscar e levar R$20, somente buscar R$15, somente levar R$15. Opcoes para pets ate 10kg.',
  monthly_plan: 'Nosso pacote mensal tem 4 banhos no mes, 1 por semana, pagamento antecipado e melhor horario reservado.',
  small_bath_service: 'Banho pequeno porte inclui banho, corte de unha, limpeza de ouvido e tosa higienica.',
}

const INITIAL_FORM = {
  store_name: '',
  store_address: '',
  store_neighborhood: '',
  store_city: '',
  store_phone: '',
  printer_width: '80',
  fiscal_id: '',
  fiscal_regime: 'simples_nacional',
  nfe_environment: 'homologacao',
  issue_series: '1',
  next_invoice_number: '1',
  emit_nfce: true,
  emit_nfe: false,
  emit_nfse: false,
  auto_issue_on_sale: true,
  sale_document_type: 'nfce',
  fiscal_provider: 'mock_local',
  provider_base_url: '',
  fiscal_notes: '',
  bot_prompt: DEFAULT_PETBOT_PROMPT,
  petbot_autonomy_mode: 'canary',
  petbot_autonomy_allowlist: '',
  delivery_fee: '10.00',
  pet_transport_fee: '20.00',
  pix_key: '',
  pix_holder_name: '',
  pet_transport_options: DEFAULT_PET_TRANSPORT_OPTIONS,
  message_templates: DEFAULT_MESSAGE_TEMPLATES,
  issuer_legal_name: '',
  issuer_trade_name: '',
  issuer_cnpj: '',
  issuer_ie: '',
  issuer_im: '',
  issuer_cnae: '',
  issuer_zip: '',
  issuer_state: '',
  issuer_city_code: '',
  issuer_street_number: '',
}

function isFiscalSchemaError(error) {
  const msg = String(error?.message || '').toLowerCase()
  if (!msg) return false
  return (
    msg.includes('tenant_fiscal_profiles')
    || msg.includes('fiscal_policy_versions')
  ) && (
    msg.includes('does not exist')
    || msg.includes('schema cache')
    || msg.includes('relation')
    || msg.includes('column')
  )
}

function isFeeSchemaError(error) {
  const msg = String(error?.message || '').toLowerCase()
  return (
    msg.includes('delivery_fee')
    || msg.includes('pet_transport_fee')
    || msg.includes('pix_key')
    || msg.includes('pix_holder_name')
    || msg.includes('message_templates')
    || msg.includes('pet_transport_options')
    || msg.includes('petbot_autonomy_mode')
    || msg.includes('petbot_autonomy_allowlist')
  ) && (
    msg.includes('schema cache')
    || msg.includes('column')
    || msg.includes('does not exist')
  )
}

function toBool(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return fallback
}

function normalizeTransportOptions(value) {
  const rows = Array.isArray(value) && value.length ? value : DEFAULT_PET_TRANSPORT_OPTIONS
  return rows.map((item, index) => ({
    id: item.id || DEFAULT_PET_TRANSPORT_OPTIONS[index]?.id || `opcao_${index + 1}`,
    label: item.label || DEFAULT_PET_TRANSPORT_OPTIONS[index]?.label || `Opcao ${index + 1}`,
    fee: String(item.fee ?? DEFAULT_PET_TRANSPORT_OPTIONS[index]?.fee ?? '0.00'),
    maxWeightKg: String(item.maxWeightKg ?? item.max_weight_kg ?? DEFAULT_PET_TRANSPORT_OPTIONS[index]?.maxWeightKg ?? '10'),
    active: item.active !== false,
  }))
}

function normalizeTemplates(value) {
  return { ...DEFAULT_MESSAGE_TEMPLATES, ...(value && typeof value === 'object' ? value : {}) }
}

function serializeTransportOptions(rows = []) {
  return normalizeTransportOptions(rows).map((item) => ({
    id: item.id,
    label: item.label,
    fee: Number(item.fee || 0),
    maxWeightKg: Number(item.maxWeightKg || 0),
    active: Boolean(item.active),
  }))
}

export default function SettingsPage() {
  const auth = useAuthCtx()
  const { activeModule, activeModuleId } = useModuleCtx()
  const {
    tenants = [],
    activeTenantId,
    tenantLoading = false,
    tenantMode = 'database',
    tenantError = '',
    switchTenant,
    createTenant,
    tenantEnabledModules = [],
  } = auth

  const isGlobalAdmin = auth?.profile?.role === 'admin'
  const isModuleAdmin = (auth?.profile?.module_permissions || {})[activeModuleId]?.startsWith('admin_')
  const canEdit = isGlobalAdmin || isModuleAdmin
  const isTestTenant = Boolean(activeTenantId && activeTenantId === import.meta.env.VITE_TEST_TENANT_ID)

  const [form, setForm] = useState(INITIAL_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [selectedModId, setSelectedModId] = useState(null)
  const [systemView, setSystemView] = useState('home') // home | modules | tenants
  const [newTenantName, setNewTenantName] = useState('')
  const [tenantSaving, setTenantSaving] = useState(false)
  const [petSettingsTab, setPetSettingsTab] = useState('geral') // geral | fiscal

  const effectiveModId = activeModuleId === 'system' ? selectedModId : activeModuleId
  const isPet = effectiveModId === 'petshop'

  useEffect(() => {
    if (activeModuleId !== 'system') {
      setSystemView('home')
      setSelectedModId(null)
    }
  }, [activeModuleId])

  useEffect(() => {
    setPetSettingsTab('geral')
  }, [effectiveModId, activeTenantId])

  useEffect(() => {
    if (!effectiveModId) {
      setLoading(false)
      return
    }
    loadSettings()
  }, [effectiveModId, activeTenantId])

  async function loadSettings() {
    if (!effectiveModId) return
    setLoading(true)

    try {
      const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        let query = supabase
          .from('settings')
          .select('*')
          .eq('module_id', effectiveModId)
          .limit(1)
          .maybeSingle()

        if (includeTenant && activeTenantId) {
          query = query.eq('tenant_id', activeTenantId)
        }

        return query
      })

      if (response.error && !isTenantSchemaError(response.error)) {
        throw response.error
      }

      const data = response.data
      let nextForm = {
        ...INITIAL_FORM,
      }

      if (data) {
        nextForm = {
          ...nextForm,
          store_name: data.store_name || '',
          store_address: data.store_address || '',
          store_neighborhood: data.store_neighborhood || '',
          store_city: data.store_city || '',
          store_phone: data.store_phone || '',
          printer_width: data.printer_width === '58' ? '58' : '80',
          fiscal_id: data.fiscal_id || '',
          bot_prompt: data.bot_prompt || DEFAULT_PETBOT_PROMPT,
          petbot_autonomy_mode: ['assist', 'canary', 'enabled'].includes(data.petbot_autonomy_mode) ? data.petbot_autonomy_mode : 'canary',
          petbot_autonomy_allowlist: Array.isArray(data.petbot_autonomy_allowlist) ? data.petbot_autonomy_allowlist.join(', ') : '',
          delivery_fee: data.delivery_fee != null ? String(data.delivery_fee) : '10.00',
          pet_transport_fee: data.pet_transport_fee != null ? String(data.pet_transport_fee) : '20.00',
          pix_key: data.pix_key || '',
          pix_holder_name: data.pix_holder_name || '',
          pet_transport_options: normalizeTransportOptions(data.pet_transport_options),
          message_templates: normalizeTemplates(data.message_templates),
        }
      }

      if (effectiveModId === 'petshop') {
        const fiscalResponse = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
          let query = supabase
            .from('tenant_fiscal_profiles')
            .select('fiscal_regime, nfe_environment, issue_series, next_invoice_number, emit_nfce, emit_nfe, emit_nfse, settings')
            .eq('module_id', effectiveModId)
            .limit(1)
            .maybeSingle()

          if (includeTenant && activeTenantId) {
            query = query.eq('tenant_id', activeTenantId)
          }

          return query
        })

        if (fiscalResponse.error && !isFiscalSchemaError(fiscalResponse.error) && !isTenantSchemaError(fiscalResponse.error)) {
          throw fiscalResponse.error
        }

        const fiscalData = fiscalResponse.data || null
        const fiscalSettings = fiscalData?.settings || {}
        const issuer = fiscalSettings?.issuer || {}

        if (fiscalData) {
          nextForm = {
            ...nextForm,
            fiscal_regime: fiscalData.fiscal_regime || 'simples_nacional',
            nfe_environment: fiscalData.nfe_environment || 'homologacao',
            issue_series: fiscalData.issue_series ? String(fiscalData.issue_series) : '1',
            next_invoice_number: fiscalData.next_invoice_number ? String(fiscalData.next_invoice_number) : '1',
            emit_nfce: toBool(fiscalData.emit_nfce, true),
            emit_nfe: toBool(fiscalData.emit_nfe, false),
            emit_nfse: toBool(fiscalData.emit_nfse, false),
            auto_issue_on_sale: toBool(fiscalSettings.auto_issue_on_sale, true),
            sale_document_type: fiscalSettings.sale_document_type || 'nfce',
            fiscal_provider: fiscalSettings.provider || 'mock_local',
            provider_base_url: fiscalSettings.provider_base_url || '',
            fiscal_notes: fiscalSettings.fiscal_notes || '',
            issuer_legal_name: issuer.legal_name || '',
            issuer_trade_name: issuer.trade_name || '',
            issuer_cnpj: issuer.cnpj || nextForm.fiscal_id || '',
            issuer_ie: issuer.ie || '',
            issuer_im: issuer.im || '',
            issuer_cnae: issuer.cnae || '',
            issuer_zip: issuer.zip || '',
            issuer_state: issuer.state || '',
            issuer_city_code: issuer.city_code || '',
            issuer_street_number: issuer.street_number || '',
          }
        } else {
          nextForm = {
            ...nextForm,
            issuer_legal_name: nextForm.store_name || '',
            issuer_cnpj: nextForm.fiscal_id || '',
          }
        }
      }

      setForm(nextForm)
    } catch (error) {
      console.error(error)
      setForm(INITIAL_FORM)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!canEdit || !effectiveModId) return
    if (effectiveModId === 'petshop' && form.fiscal_provider === 'mock_local' && !isTestTenant) {
      setMsg({ type: 'error', text: 'Mock Local e permitido somente no tenant de testes configurado.' })
      return
    }
    setSaving(true)
    setMsg({ type: '', text: '' })

    try {
      const upsertResponse = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        const row = buildTenantPayload({
          module_id: effectiveModId,
          ...form,
          pet_transport_options: serializeTransportOptions(form.pet_transport_options),
          message_templates: normalizeTemplates(form.message_templates),
          petbot_autonomy_allowlist: String(form.petbot_autonomy_allowlist || '').split(/[,\n]/).map((value) => value.trim()).filter(Boolean),
          updated_at: new Date().toISOString(),
        }, activeTenantId, includeTenant)

        const conflict = includeTenant ? 'tenant_id,module_id' : 'module_id'
        const firstTry = await supabase.from('settings').upsert(row, { onConflict: conflict })
        if (firstTry.error && isFeeSchemaError(firstTry.error)) {
          const fallbackRow = { ...row }
          delete fallbackRow.delivery_fee
          delete fallbackRow.pet_transport_fee
          delete fallbackRow.pix_key
          delete fallbackRow.pix_holder_name
          delete fallbackRow.message_templates
          delete fallbackRow.pet_transport_options
          delete fallbackRow.petbot_autonomy_mode
          delete fallbackRow.petbot_autonomy_allowlist
          return supabase.from('settings').upsert(fallbackRow, { onConflict: conflict })
        }
        return firstTry
      })

      if (upsertResponse.error) {
        throw upsertResponse.error
      }

      if (effectiveModId === 'petshop') {
        const safeNextInvoice = Math.max(1, Number(form.next_invoice_number || 1))
        const fiscalPayloadBase = {
          module_id: effectiveModId,
          fiscal_regime: form.fiscal_regime || 'simples_nacional',
          nfe_environment: form.nfe_environment || 'homologacao',
          issue_series: form.issue_series || '1',
          next_invoice_number: safeNextInvoice,
          emit_nfce: Boolean(form.emit_nfce),
          emit_nfe: Boolean(form.emit_nfe),
          emit_nfse: Boolean(form.emit_nfse),
          settings: {
            auto_issue_on_sale: Boolean(form.auto_issue_on_sale),
            sale_document_type: form.sale_document_type || 'nfce',
            provider: form.fiscal_provider || 'mock_local',
            provider_base_url: (form.provider_base_url || '').trim() || null,
            fiscal_notes: (form.fiscal_notes || '').trim() || null,
            issuer: {
              legal_name: (form.issuer_legal_name || '').trim() || null,
              trade_name: (form.issuer_trade_name || '').trim() || null,
              cnpj: (form.issuer_cnpj || form.fiscal_id || '').trim() || null,
              ie: (form.issuer_ie || '').trim() || null,
              im: (form.issuer_im || '').trim() || null,
              cnae: (form.issuer_cnae || '').trim() || null,
              zip: (form.issuer_zip || '').trim() || null,
              state: (form.issuer_state || '').trim().toUpperCase() || null,
              city_code: (form.issuer_city_code || '').trim() || null,
              street_number: (form.issuer_street_number || '').trim() || null,
            },
          },
          updated_by: auth?.profile?.id || null,
          updated_at: new Date().toISOString(),
        }

        const fiscalResponse = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
          const row = buildTenantPayload(fiscalPayloadBase, activeTenantId, includeTenant)
          const conflict = includeTenant ? 'tenant_id,module_id' : 'module_id'
          return supabase
            .from('tenant_fiscal_profiles')
            .upsert(row, { onConflict: conflict })
            .select('tenant_id, module_id')
            .single()
        })

        if (fiscalResponse.error && !isFiscalSchemaError(fiscalResponse.error) && !isTenantSchemaError(fiscalResponse.error)) {
          throw fiscalResponse.error
        }
      }

      await auth.refreshSettings(effectiveModId)
      setMsg({ type: 'success', text: 'Configuracoes salvas com sucesso.' })
    } catch (error) {
      setMsg({ type: 'error', text: error instanceof Error ? error.message : 'Erro ao salvar configuracoes.' })
    } finally {
      setSaving(false)
    }
  }

  function updateTransportOption(index, key, value) {
    setForm((prev) => ({
      ...prev,
      pet_transport_options: normalizeTransportOptions(prev.pet_transport_options).map((item, itemIndex) => (
        itemIndex === index ? { ...item, [key]: value } : item
      )),
    }))
  }

  function updateTemplate(key, value) {
    setForm((prev) => ({
      ...prev,
      message_templates: {
        ...normalizeTemplates(prev.message_templates),
        [key]: value,
      },
    }))
  }

  async function handleCreateTenant() {
    if (!isGlobalAdmin) return
    const cleanName = (newTenantName || '').trim()
    if (!cleanName) {
      setMsg({ type: 'error', text: 'Informe o nome da instancia.' })
      return
    }

    setTenantSaving(true)
    try {
      await createTenant(cleanName)
      setNewTenantName('')
      setMsg({ type: 'success', text: 'Instancia criada e selecionada com sucesso.' })
    } catch (error) {
      setMsg({ type: 'error', text: error instanceof Error ? error.message : 'Falha ao criar instancia.' })
    } finally {
      setTenantSaving(false)
    }
  }

  async function handleSwitchTenant(tenantId) {
    try {
      await switchTenant(tenantId)
      setMsg({ type: 'success', text: 'Instancia ativa atualizada.' })
    } catch (error) {
      setMsg({ type: 'error', text: error instanceof Error ? error.message : 'Falha ao trocar instancia.' })
    }
  }

  if (loading) {
    return (
      <div className="page flex items-center justify-center py-20 text-muted">
        <RefreshCw size={18} className="animate-spin mr-2 text-[var(--primary)]" />
        Carregando...
      </div>
    )
  }

  const showSystemHub = activeModuleId === 'system' && !selectedModId
  const showPetSettingsTabs = !showSystemHub && effectiveModId === 'petshop'
  const showGeneralSettings = !showPetSettingsTabs || petSettingsTab === 'geral'
  const showFiscalSettings = showPetSettingsTabs && petSettingsTab === 'fiscal'
  const tenantScopedModules = tenantEnabledModules.length > 0 ? tenantEnabledModules : ['petshop']
  const visibleSystemModules = Object.values(MODULES).filter((moduleItem) => (
    moduleItem.id !== 'system' && tenantScopedModules.includes(moduleItem.id)
  ))

  return (
    <div className="page animate-fade-up max-w-5xl mx-auto pb-20">
      <div className="page-header mb-8">
        <div className="flex items-center gap-4">
          {activeModuleId === 'system' && (selectedModId || systemView !== 'home') && (
            <button
              onClick={() => {
                setSelectedModId(null)
                setSystemView('home')
              }}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-muted border border-white/5 transition-all"
            >
              <RefreshCw size={20} />
            </button>
          )}
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Settings size={22} className={activeModule.theme.textPrimary} />
              {activeModuleId === 'system'
                ? selectedModId
                  ? `Configurando ${MODULES[selectedModId]?.shortName}`
                  : systemView === 'tenants'
                    ? 'Instancias de Cliente'
                    : systemView === 'modules'
                      ? 'Modulos da Plataforma'
                      : 'Central de Configuracoes'
                : isPet
                  ? 'Configuracoes da Loja'
                  : 'Configuracoes'}
            </h1>
            <p className="page-sub">
              {activeModuleId === 'system' && !selectedModId
                ? systemView === 'tenants'
                  ? 'Troque manualmente a instancia ativa e cadastre novos clientes.'
                  : systemView === 'modules'
                    ? 'Escolha um modulo para gerenciar identidade visual e dados.'
                    : 'Escolha se voce quer gerenciar modulos ou trocar instancias.'
                : `Ajuste as preferencias do modulo ${selectedModId ? MODULES[selectedModId]?.name : activeModule.name}`}
            </p>
          </div>
        </div>

        {canEdit && (activeModuleId !== 'system' || selectedModId) && (
          <button onClick={handleSave} disabled={saving} className="btn btn-primary gap-2 h-fit">
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar alteracoes
          </button>
        )}
      </div>

      {showSystemHub ? (
        <>
          {systemView === 'home' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button
                onClick={() => setSystemView('modules')}
                className="group relative bg-card border border-white/5 rounded-[28px] p-8 text-left transition-all hover:translate-y-[-4px] hover:border-white/20 active:scale-[0.98]"
              >
                <div className="w-14 h-14 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center mb-6">
                  <Building2 size={28} />
                </div>
                <h3 className="text-xl font-display font-bold text-text mb-2">Configurar Modulos</h3>
                <p className="text-sm text-muted">Dados de loja, impressao, telefone e endereco por modulo.</p>
              </button>

              <button
                onClick={() => setSystemView('tenants')}
                className="group relative bg-card border border-white/5 rounded-[28px] p-8 text-left transition-all hover:translate-y-[-4px] hover:border-white/20 active:scale-[0.98]"
              >
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-6">
                  <Users2 size={28} />
                </div>
                <h3 className="text-xl font-display font-bold text-text mb-2">Instancias de Cliente</h3>
                <p className="text-sm text-muted">Troca manual da instancia ativa (Cliente 1, Cliente 2...) para operacao e suporte.</p>
              </button>
            </div>
          )}

          {systemView === 'modules' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {visibleSystemModules.map((moduleItem) => {
                const Icon = moduleItem.icon
                return (
                  <button
                    key={moduleItem.id}
                    onClick={() => setSelectedModId(moduleItem.id)}
                    className="group relative bg-card border border-white/5 rounded-[28px] p-8 text-left transition-all hover:translate-y-[-4px] hover:border-white/20 active:scale-[0.98]"
                  >
                    <div className={`w-14 h-14 rounded-2xl ${moduleItem.theme.primaryBg} text-gray-900 flex items-center justify-center mb-6`}>
                      <Icon size={28} />
                    </div>
                    <h3 className="text-xl font-display font-bold text-text mb-2">{moduleItem.name}</h3>
                    <p className="text-sm text-muted">Gerenciar configuracoes do modulo.</p>
                  </button>
                )
              })}
              {visibleSystemModules.length === 0 && (
                <div className="md:col-span-2 bg-card border border-white/5 rounded-[28px] p-8 text-sm text-muted">
                  Nenhum modulo habilitado para esta instancia. Libere o modulo no cadastro de usuarios para ele aparecer aqui.
                </div>
              )}
            </div>
          )}

          {systemView === 'tenants' && (
            <div className="space-y-6">
              <div className="bg-card border border-white/5 rounded-3xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-bold text-text">Instancia ativa</p>
                    <p className="text-xs text-muted">
                      Modo: {tenantMode === 'database' ? 'Banco de dados' : 'Local (fallback)'}
                    </p>
                  </div>
                  {tenantLoading && (
                    <span className="text-xs text-muted flex items-center gap-2">
                      <RefreshCw size={12} className="animate-spin" />
                      Carregando instancias...
                    </span>
                  )}
                </div>

                {tenantError && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    {tenantError}
                  </div>
                )}

                <div className="space-y-2">
                  {(tenants || []).map((tenant) => {
                    const selected = tenant.id === activeTenantId
                    return (
                      <div key={tenant.id} className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-text truncate">{tenant.name}</p>
                          <p className="text-[11px] text-muted truncate">{tenant.slug || tenant.id}</p>
                        </div>
                        {selected ? (
                          <span className="badge badge-green">Ativa</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSwitchTenant(tenant.id)}
                            className="btn btn-secondary btn-sm"
                          >
                            Ativar
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {(!tenants || tenants.length === 0) && (
                    <div className="text-sm text-muted py-4">Nenhuma instancia encontrada.</div>
                  )}
                </div>
              </div>

              {isGlobalAdmin && (
                <div className="bg-card border border-white/5 rounded-3xl p-6 space-y-3">
                  <p className="text-sm font-bold text-text">Criar nova instancia</p>
                  <div className="flex items-center gap-2">
                    <input
                      className="inp flex-1"
                      placeholder="Ex: Petshop Vida Animal"
                      value={newTenantName}
                      onChange={(event) => setNewTenantName(event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleCreateTenant}
                      disabled={tenantSaving}
                      className="btn btn-primary gap-2"
                    >
                      {tenantSaving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                      Criar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-8">
          {!canEdit && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex gap-3">
              <AlertCircle size={18} className="text-red-400" />
              <p className="text-sm text-text font-medium">Apenas administradores podem alterar estas configuracoes.</p>
            </div>
          )}

          {showPetSettingsTabs && (
            <div className="inline-flex bg-white/5 border border-white/10 rounded-2xl p-1 gap-1">
              <button
                type="button"
                onClick={() => setPetSettingsTab('geral')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  petSettingsTab === 'geral'
                    ? 'bg-primary text-gray-950 shadow-lg'
                    : 'text-muted hover:text-text'
                }`}
              >
                Geral
              </button>
              <button
                type="button"
                onClick={() => setPetSettingsTab('fiscal')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  petSettingsTab === 'fiscal'
                    ? 'bg-primary text-gray-950 shadow-lg'
                    : 'text-muted hover:text-text'
                }`}
              >
                Fiscal
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className={showGeneralSettings ? 'space-y-4' : 'hidden'}>
              <h3 className="text-xs font-black text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                <Store size={14} /> Identificacao do modulo
              </h3>
              <div className="bg-card border border-white/5 rounded-3xl p-8 space-y-6 shadow-sm">
                <div>
                  <label className="inp-label">{isPet ? 'Nome da Loja' : 'Razao Social / Nome'}</label>
                  <input
                    className="inp"
                    placeholder={isPet ? 'Ex: PetShop QuatroPatas' : 'Ex: Empresa YuiSync'}
                    disabled={!canEdit}
                    value={form.store_name}
                    onChange={(event) => setForm((prev) => ({ ...prev, store_name: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="inp-label">{isPet ? 'CNPJ (opcional)' : 'CNPJ / CPF'}</label>
                  <input
                    className="inp"
                    placeholder="00.000.000/0001-00"
                    disabled={!canEdit}
                    value={form.fiscal_id}
                    onChange={(event) => setForm((prev) => ({ ...prev, fiscal_id: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="inp-label">Telefone de contato</label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      className="inp pl-9"
                      placeholder="(00) 00000-0000"
                      disabled={!canEdit}
                      value={form.store_phone}
                      onChange={(event) => setForm((prev) => ({ ...prev, store_phone: event.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className={showGeneralSettings ? 'space-y-4' : 'hidden'}>
              <h3 className="text-xs font-black text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                {isPet ? <Printer size={14} /> : <FileText size={14} />} {isPet ? 'Impressao termica' : 'Preferencias visuais'}
              </h3>
              <div className="bg-card border border-white/5 rounded-3xl p-8 space-y-6 shadow-sm">
                {isPet ? (
                  <div>
                    <label className="inp-label">Largura da bobina</label>
                    <div className="grid grid-cols-2 gap-3">
                      {['80', '58'].map((width) => (
                        <button
                          key={width}
                          onClick={() => canEdit && setForm((prev) => ({ ...prev, printer_width: width }))}
                          className={`px-4 py-4 rounded-2xl border text-sm font-bold transition-all ${
                            form.printer_width === width
                              ? `${activeModule.theme.primaryBg} border-transparent text-gray-950 shadow-lg`
                              : 'bg-white/5 border-white/5 text-muted hover:bg-white/10'
                          }`}
                        >
                          {width}mm
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-white/[0.03] border border-dashed border-white/10 rounded-2xl text-center">
                    <p className="text-sm text-muted italic">Este modulo usa exportacao PDF (A4) para documentos.</p>
                  </div>
                )}
              </div>
            </div>

            <div className={showGeneralSettings ? 'col-span-1 md:col-span-2 space-y-4' : 'hidden'}>
              <h3 className="text-xs font-black text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                <Bot size={14} /> Prompt do bot
              </h3>
              <div className="bg-card border border-white/5 rounded-3xl p-8 shadow-sm">
                <label className="inp-label">Prompt ativo deste tenant</label>
                <textarea
                  className="inp min-h-[180px] resize-y"
                  placeholder="Prompt ativo do PetBot para este tenant..."
                  disabled={!canEdit}
                  value={form.bot_prompt}
                  onChange={(event) => setForm((prev) => ({ ...prev, bot_prompt: event.target.value }))}
                />
                <p className="text-xs text-muted mt-3">
                  Este e o prompt ativo do PetBot para este tenant. Edite apenas ajustes pontuais; o bot continua usando dados reais do banco para loja, estoque, agenda e historico.
                </p>
              </div>
              <div className="bg-card border border-white/5 rounded-3xl p-8 shadow-sm space-y-4">
                <div>
                  <label className="inp-label">Autonomia do PetBot</label>
                  <select
                    className="inp"
                    disabled={!canEdit}
                    value={form.petbot_autonomy_mode}
                    onChange={(event) => setForm((prev) => ({ ...prev, petbot_autonomy_mode: event.target.value }))}
                  >
                    <option value="assist">Somente assistido — equipe conclui todos os pedidos</option>
                    <option value="canary">Canario — somente contatos autorizados concluem automaticamente</option>
                    <option value="enabled">Autonomo — pedidos permitidos pelo guardiao sao concluidos</option>
                  </select>
                </div>
                {form.petbot_autonomy_mode === 'canary' && (
                  <div>
                    <label className="inp-label">Contatos autorizados no canario</label>
                    <textarea
                      className="inp min-h-[84px] resize-y"
                      disabled={!canEdit}
                      value={form.petbot_autonomy_allowlist}
                      placeholder="(32) 99999-9999, (32) 98888-8888"
                      onChange={(event) => setForm((prev) => ({ ...prev, petbot_autonomy_allowlist: event.target.value }))}
                    />
                    <p className="mt-2 text-xs text-muted">Separe telefones por virgula ou linha. Fora desta lista, o bot coleta o pedido e chama a equipe antes de concluir.</p>
                  </div>
                )}
              </div>
            </div>

            <div className={showGeneralSettings ? 'space-y-4' : 'hidden'}>
              <h3 className="text-xs font-black text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                <Truck size={14} /> Entrega
              </h3>
              <div className="bg-card border border-white/5 rounded-3xl p-8 space-y-6 shadow-sm">
                <div>
                  <label className="inp-label">Taxa de entrega padrao</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="inp"
                    placeholder="10.00"
                    disabled={!canEdit}
                    value={form.delivery_fee}
                    onChange={(event) => setForm((prev) => ({ ...prev, delivery_fee: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="inp-label">Transporte do pet</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="inp"
                    placeholder="20.00"
                    disabled={!canEdit}
                    value={form.pet_transport_fee}
                    onChange={(event) => setForm((prev) => ({ ...prev, pet_transport_fee: event.target.value }))}
                  />
                  <p className="text-xs text-muted mt-2">Fallback legado. O PetBot prioriza as opcoes MotoDog abaixo.</p>
                </div>
                <div className="space-y-3">
                  <label className="inp-label">Opcoes MotoDog</label>
                  {normalizeTransportOptions(form.pet_transport_options).map((option, index) => (
                    <div key={option.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_120px_120px_90px] gap-3 rounded-2xl border border-[var(--border)] bg-surface/60 p-3">
                      <input className="inp" disabled={!canEdit} value={option.label} onChange={(event) => updateTransportOption(index, 'label', event.target.value)} />
                      <input className="inp" type="number" min="0" step="0.01" disabled={!canEdit} value={option.fee} onChange={(event) => updateTransportOption(index, 'fee', event.target.value)} />
                      <input className="inp" type="number" min="0" step="0.1" disabled={!canEdit} value={option.maxWeightKg} onChange={(event) => updateTransportOption(index, 'maxWeightKg', event.target.value)} />
                      <label className="flex items-center gap-2 text-sm text-muted">
                        <input type="checkbox" disabled={!canEdit} checked={option.active} onChange={(event) => updateTransportOption(index, 'active', event.target.checked)} />
                        Ativo
                      </label>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="inp-label">Chave Pix</label>
                    <input className="inp" disabled={!canEdit} value={form.pix_key} onChange={(event) => setForm((prev) => ({ ...prev, pix_key: event.target.value }))} />
                  </div>
                  <div>
                    <label className="inp-label">Titular Pix</label>
                    <input className="inp" disabled={!canEdit} value={form.pix_holder_name} onChange={(event) => setForm((prev) => ({ ...prev, pix_holder_name: event.target.value }))} />
                  </div>
                </div>
              </div>
            </div>

            <div className={showGeneralSettings ? 'col-span-1 md:col-span-2 space-y-4' : 'hidden'}>
              <h3 className="text-xs font-black text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                <FileText size={14} /> Mensagens padrao
              </h3>
              <div className="bg-card border border-white/5 rounded-3xl p-8 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-5">
                {Object.entries(normalizeTemplates(form.message_templates)).map(([key, value]) => (
                  <div key={key} className="space-y-2">
                    <label className="inp-label">{key.replaceAll('_', ' ')}</label>
                    <textarea
                      className="inp min-h-[110px] resize-y"
                      disabled={!canEdit}
                      value={value}
                      onChange={(event) => updateTemplate(key, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className={showGeneralSettings ? 'col-span-1 md:col-span-2 space-y-4' : 'hidden'}>
              <h3 className="text-xs font-black text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                <MapPin size={14} /> Localizacao
              </h3>
              <div className="bg-card border border-white/5 rounded-3xl p-8 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2">
                    <label className="inp-label">Endereco</label>
                    <input
                      className="inp"
                      placeholder="Rua, numero"
                      disabled={!canEdit}
                      value={form.store_address}
                      onChange={(event) => setForm((prev) => ({ ...prev, store_address: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="inp-label">Bairro</label>
                    <input
                      className="inp"
                      placeholder="Bairro"
                      disabled={!canEdit}
                      value={form.store_neighborhood}
                      onChange={(event) => setForm((prev) => ({ ...prev, store_neighborhood: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="inp-label">Cidade</label>
                    <input
                      className="inp"
                      placeholder="Cidade"
                      disabled={!canEdit}
                      value={form.store_city}
                      onChange={(event) => setForm((prev) => ({ ...prev, store_city: event.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>

            {showFiscalSettings && (
              <div className="col-span-1 md:col-span-2 space-y-4">
                <h3 className="text-xs font-black text-emerald-500 uppercase tracking-[0.2em] flex items-center gap-2">
                  <FileText size={14} /> Emissao fiscal automatica
                </h3>
                <div className="bg-card border border-emerald-500/20 rounded-3xl p-8 shadow-sm space-y-7">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="inp-label">Ambiente fiscal</label>
                      <select
                        className="inp"
                        disabled={!canEdit}
                        value={form.nfe_environment}
                        onChange={(event) => setForm((prev) => ({ ...prev, nfe_environment: event.target.value }))}
                      >
                        <option value="homologacao">Homologacao</option>
                        <option value="producao">Producao</option>
                      </select>
                    </div>
                    <div>
                      <label className="inp-label">Regime tributario</label>
                      <select
                        className="inp"
                        disabled={!canEdit}
                        value={form.fiscal_regime}
                        onChange={(event) => setForm((prev) => ({ ...prev, fiscal_regime: event.target.value }))}
                      >
                        <option value="simples_nacional">Simples Nacional</option>
                        <option value="lucro_presumido">Lucro Presumido</option>
                        <option value="lucro_real">Lucro Real</option>
                      </select>
                    </div>
                    <div>
                      <label className="inp-label">Provedor fiscal</label>
                      <select
                        className="inp"
                        disabled={!canEdit}
                        value={form.fiscal_provider}
                        onChange={(event) => setForm((prev) => ({ ...prev, fiscal_provider: event.target.value }))}
                      >
                        <option value="mock_local" disabled={!isTestTenant}>Mock Local (somente tenant de teste)</option>
                        <option value="focus_nfe">Focus NFe</option>
                        <option value="nfe_io">NFE.io</option>
                        <option value="plugnotas">PlugNotas</option>
                      </select>
                      {!isTestTenant && form.fiscal_provider === 'mock_local' && (
                        <p className="mt-2 text-xs text-red-400">Selecione um provedor fiscal real antes de salvar este tenant.</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="inp-label">Serie</label>
                      <input
                        className="inp"
                        disabled={!canEdit}
                        value={form.issue_series}
                        onChange={(event) => setForm((prev) => ({ ...prev, issue_series: event.target.value }))}
                        placeholder="1"
                      />
                    </div>
                    <div>
                      <label className="inp-label">Proximo numero</label>
                      <input
                        type="number"
                        min="1"
                        className="inp"
                        disabled={!canEdit}
                        value={form.next_invoice_number}
                        onChange={(event) => setForm((prev) => ({ ...prev, next_invoice_number: event.target.value }))}
                        placeholder="1"
                      />
                    </div>
                    <div>
                      <label className="inp-label">Documento padrao na venda</label>
                      <select
                        className="inp"
                        disabled={!canEdit}
                        value={form.sale_document_type}
                        onChange={(event) => setForm((prev) => ({ ...prev, sale_document_type: event.target.value }))}
                      >
                        <option value="nfce">NFC-e</option>
                        <option value="nfe">NF-e</option>
                        <option value="nfse">NFS-e</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <div>
                        <p className="text-sm font-bold text-text">Emitir automaticamente ao concluir venda</p>
                        <p className="text-xs text-muted">Quando ativo, o PDV ja gera documento fiscal automaticamente.</p>
                      </div>
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={Boolean(form.auto_issue_on_sale)}
                        onChange={(event) => setForm((prev) => ({ ...prev, auto_issue_on_sale: event.target.checked }))}
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <div>
                        <p className="text-sm font-bold text-text">Tipos habilitados</p>
                        <p className="text-xs text-muted">Marque os documentos que sua empresa emite.</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-text">
                        <label className="flex items-center gap-1">
                          <input type="checkbox" disabled={!canEdit} checked={Boolean(form.emit_nfce)} onChange={(event) => setForm((prev) => ({ ...prev, emit_nfce: event.target.checked }))} />
                          NFC-e
                        </label>
                        <label className="flex items-center gap-1">
                          <input type="checkbox" disabled={!canEdit} checked={Boolean(form.emit_nfe)} onChange={(event) => setForm((prev) => ({ ...prev, emit_nfe: event.target.checked }))} />
                          NF-e
                        </label>
                        <label className="flex items-center gap-1">
                          <input type="checkbox" disabled={!canEdit} checked={Boolean(form.emit_nfse)} onChange={(event) => setForm((prev) => ({ ...prev, emit_nfse: event.target.checked }))} />
                          NFS-e
                        </label>
                      </div>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="inp-label">URL base do provedor (opcional)</label>
                      <input
                        className="inp"
                        disabled={!canEdit || !isGlobalAdmin}
                        placeholder="https://api.provedor-fiscal.com"
                        value={form.provider_base_url}
                        onChange={(event) => setForm((prev) => ({ ...prev, provider_base_url: event.target.value }))}
                      />
                      {!isGlobalAdmin && (
                        <p className="text-[11px] text-muted mt-2">
                          Campo reservado ao Admin Global.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="inp-label">Observacoes fiscais</label>
                      <input
                        className="inp"
                        disabled={!canEdit}
                        placeholder="Ex: emissao em contingencia no sabado"
                        value={form.fiscal_notes}
                        onChange={(event) => setForm((prev) => ({ ...prev, fiscal_notes: event.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-xs font-black text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                      <Building2 size={14} /> Dados do emissor
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="inp-label">Razao social</label>
                        <input
                          className="inp"
                          disabled={!canEdit}
                          placeholder="Empresa emissora LTDA"
                          value={form.issuer_legal_name}
                          onChange={(event) => setForm((prev) => ({ ...prev, issuer_legal_name: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="inp-label">Nome fantasia</label>
                        <input
                          className="inp"
                          disabled={!canEdit}
                          placeholder="PetShop Yui"
                          value={form.issuer_trade_name}
                          onChange={(event) => setForm((prev) => ({ ...prev, issuer_trade_name: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="inp-label">CNPJ emissor</label>
                        <input
                          className="inp"
                          disabled={!canEdit}
                          placeholder="00.000.000/0001-00"
                          value={form.issuer_cnpj}
                          onChange={(event) => setForm((prev) => ({ ...prev, issuer_cnpj: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="inp-label">Inscricao estadual</label>
                        <input
                          className="inp"
                          disabled={!canEdit}
                          placeholder="IE"
                          value={form.issuer_ie}
                          onChange={(event) => setForm((prev) => ({ ...prev, issuer_ie: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="inp-label">Inscricao municipal</label>
                        <input
                          className="inp"
                          disabled={!canEdit}
                          placeholder="IM"
                          value={form.issuer_im}
                          onChange={(event) => setForm((prev) => ({ ...prev, issuer_im: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="inp-label">CNAE principal</label>
                        <input
                          className="inp"
                          disabled={!canEdit}
                          placeholder="9609-2/08"
                          value={form.issuer_cnae}
                          onChange={(event) => setForm((prev) => ({ ...prev, issuer_cnae: event.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div>
                        <label className="inp-label">CEP</label>
                        <input
                          className="inp"
                          disabled={!canEdit}
                          placeholder="00000-000"
                          value={form.issuer_zip}
                          onChange={(event) => setForm((prev) => ({ ...prev, issuer_zip: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="inp-label">UF</label>
                        <input
                          className="inp"
                          disabled={!canEdit}
                          placeholder="SP"
                          value={form.issuer_state}
                          onChange={(event) => setForm((prev) => ({ ...prev, issuer_state: event.target.value.toUpperCase() }))}
                        />
                      </div>
                      <div>
                        <label className="inp-label">Codigo IBGE cidade</label>
                        <input
                          className="inp"
                          disabled={!canEdit}
                          placeholder="3550308"
                          value={form.issuer_city_code}
                          onChange={(event) => setForm((prev) => ({ ...prev, issuer_city_code: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="inp-label">Numero endereco fiscal</label>
                        <input
                          className="inp"
                          disabled={!canEdit}
                          placeholder="123"
                          value={form.issuer_street_number}
                          onChange={(event) => setForm((prev) => ({ ...prev, issuer_street_number: event.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {msg.text && (
        <div
          className={`mt-8 p-5 rounded-2xl border text-xs font-black uppercase tracking-widest flex items-center gap-4 ${
            msg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.type === 'success' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
            {msg.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          </div>
          {msg.text}
        </div>
      )}
    </div>
  )
}
