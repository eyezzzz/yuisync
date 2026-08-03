import { useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useModuleCtx } from '../../../context/ModuleContext'
import { useAuthCtx } from '../../../context/AuthContext'
import { applyTenantFilter, runWithTenantFallback } from '../../../lib/tenant'
import { normalizeCode, normalizeServices } from '../lib/petshopTeam'
import { fetchAllServiceCatalogPages } from '../lib/serviceCatalogPagination'
import { usePetshopAdvanced as usePetshopAdvancedCore } from './usePetshopAdvancedCore'

export {
  BILLING_CYCLES,
  LIVE_STATUS_FLOW,
  SERVICE_ORDER_FLOW,
  CAMPAIGN_TEMPLATES,
} from './usePetshopAdvancedCore'

// Contratos operacionais que continuam implementados no núcleo preservado:
// excludeStatus, dateField, .limit(limit), calculate_petshop_operational_commissions,
// getDateBounds(startDate).start, getDateBounds(endDate).end e
// .is('responsible_staff_key', null). Esta fachada substitui somente o
// carregamento do catálogo de serviços usado pela Agenda.
const VALID_SERVICE_GROUPS = new Set(['banho_tosa', 'veterinaria', 'motoboy', 'outro'])

const normalizeCatalogText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const catalogServiceCode = (productId = '') => `catalog_${String(productId).replace(/-/g, '')}`

const isCatalogServiceProduct = (product = {}) => {
  const metadata = product.bot_metadata && typeof product.bot_metadata === 'object' ? product.bot_metadata : {}
  const category = normalizeCatalogText(product.category)
  const name = normalizeCatalogText(product.name)
  const text = normalizeCatalogText([
    product.name,
    product.category,
    product.description,
    metadata.product_type,
  ].filter(Boolean).join(' '))

  if (/racao|petisco|medicamento|acessorio|areia|brinquedo/.test(category)) return false
  if (/banheira|banho (?:a )?seco|brinquedo|casinha|roupa|shampoo|varinha/.test(name)) return false
  if (/pacote.*banho|banho.*pacote/.test(name)) return false

  return metadata.product_type === 'servico'
    || category === 'servico'
    || /banho|tosa|tosagem|tosar|trim|stripping|acabamento|desembolo|escovac|hidrat|higieniz|consulta|vacina|exame|cirurg|ultrassom|castr|curativo|microchip/.test(text)
}

const inferCatalogServiceGroup = (service = {}) => {
  const metadata = service.bot_metadata && typeof service.bot_metadata === 'object' ? service.bot_metadata : {}
  if (VALID_SERVICE_GROUPS.has(metadata.service_group)) return metadata.service_group

  const text = normalizeCatalogText([
    service.name,
    service.category,
    service.description,
    service.code,
  ].filter(Boolean).join(' '))

  if (/motodog|moto dog|motoboy|entrega|transporte|retirada|buscar|levar|delivery|frete/.test(text)) return 'motoboy'
  if (/vet|veterin|consulta|vacina|clinica|medico|exame|cirurg|ultrassom|castr|retorno|internac|curativo|vermifug|microchip|aplicacao|hemograma|radiograf|raio[ -]?x|coleta|sorolog|odontolog|anestesia|medicacao|eletrocard|ecocard|emergencia|procedimento/.test(text)) return 'veterinaria'
  if (/banho|tosa|tosagem|tosar|trim|trimming|stripping|acabamento|penteado|desembolo|desembarac|escovac|hidrat|higien|groom|perfume|spa|unha|ouvido|orelha/.test(text)) return 'banho_tosa'
  return 'outro'
}

const isPetshopServicesSchemaError = (error) => {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('petshop_services') && (
    message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('relation')
  )
}

const serviceGroup = (explicitGroup, fallbackSource) => (
  VALID_SERVICE_GROUPS.has(explicitGroup)
    ? explicitGroup
    : inferCatalogServiceGroup(fallbackSource)
)

export function usePetshopAdvanced() {
  const core = usePetshopAdvancedCore()
  const { activeModuleId } = useModuleCtx()
  const { activeTenantId } = useAuthCtx()
  const moduleId = activeModuleId || 'petshop'
  const runScoped = useCallback(
    (runner) => runWithTenantFallback(activeTenantId, runner),
    [activeTenantId],
  )

  const loadPetshopServices = useCallback(async () => {
    const [productsRes, servicesRes] = await Promise.all([
      runScoped(async (includeTenant) => fetchAllServiceCatalogPages(() => {
        let query = supabase
          .from('products')
          .select('id,name,category,description,price,active,bot_metadata')
          .eq('module_id', moduleId)
          .eq('active', true)
          .order('name', { ascending: true })
          .order('id', { ascending: true })
        return applyTenantFilter(query, activeTenantId, includeTenant)
      })),
      runScoped(async (includeTenant) => fetchAllServiceCatalogPages(() => {
        let query = supabase
          .from('petshop_services')
          .select('*')
          .eq('module_id', moduleId)
          .order('id', { ascending: true })
        return applyTenantFilter(query, activeTenantId, includeTenant)
      })),
    ])

    if (productsRes.error) throw productsRes.error
    if (servicesRes.error && !isPetshopServicesSchemaError(servicesRes.error)) {
      throw servicesRes.error
    }

    const serviceRows = servicesRes.error ? [] : (servicesRes.data || [])
    const linkedByProductId = new Map(
      serviceRows
        .filter((service) => service.source_product_id)
        .map((service) => [service.source_product_id, service]),
    )

    const independentServices = serviceRows
      .filter((service) => !service.source_product_id)
      .map((service) => {
        const groupType = serviceGroup(service.group_type, service)
        return {
          ...service,
          code: service.code || normalizeCode(service.name),
          name: String(service.name || '').trim(),
          category: String(service.category || groupType || '').trim(),
          description: String(service.description || '').trim(),
          group_type: groupType,
          default_price: Number(service.default_price ?? service.price ?? 0),
          default_duration_min: Math.max(15, Number(
            service.default_duration_min ?? service.duration_min ?? 60
          )),
          active: service.active !== false,
          service_source: 'petshop_service',
        }
      })

    const productServices = (productsRes.data || [])
      .filter(isCatalogServiceProduct)
      .map((product) => {
        const linked = linkedByProductId.get(product.id) || {}
        const metadata = product.bot_metadata && typeof product.bot_metadata === 'object'
          ? product.bot_metadata
          : {}
        const groupType = serviceGroup(linked.group_type, product)

        return {
          ...linked,
          id: linked.id || product.id,
          code: linked.code || catalogServiceCode(product.id),
          name: String(product.name || linked.name || '').trim(),
          category: String(product.category || linked.category || '').trim(),
          description: String(product.description || linked.description || '').trim(),
          group_type: groupType,
          default_price: Number(product.price ?? linked.default_price ?? 0),
          default_duration_min: Math.max(15, Number(
            linked.default_duration_min
            ?? metadata.duration_min
            ?? metadata.service_duration_min
            ?? 60
          )),
          commission_type: linked.commission_type || 'percentage',
          commission_rate: Number(linked.commission_rate || 0),
          active: product.active !== false && linked.active !== false,
          sort_order: Number(linked.sort_order ?? 500),
          icon: linked.icon || (
            groupType === 'veterinaria'
              ? 'stethoscope'
              : groupType === 'banho_tosa'
                ? 'droplets'
                : groupType === 'motoboy' ? 'bike' : 'paw'
          ),
          source_product_id: product.id,
          service_source: 'product',
        }
      })

    // Produtos ficam por último para vencer uma eventual duplicidade de código,
    // preservando preço e metadados do catálogo sem duplicar a opção na Agenda.
    return normalizeServices([...independentServices, ...productServices])
  }, [activeTenantId, moduleId, runScoped])

  return {
    ...core,
    loadPetshopServices,
  }
}
