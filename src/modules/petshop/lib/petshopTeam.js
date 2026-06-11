import {
  Bike,
  Briefcase,
  Droplets,
  PawPrint,
  Scissors,
  ShieldCheck,
  ShoppingCart,
  Stethoscope,
  Syringe,
  User,
} from 'lucide-react'

export const STAFF_TYPE_OPTIONS = [
  { value: 'funcionario', label: 'Funcionario', description: 'Operacao geral' },
  { value: 'banho_tosa', label: 'Banho/Tosa', description: 'Profissional de banho, tosa e acabamento' },
  { value: 'veterinaria', label: 'Veterinaria', description: 'Atendimento clinico e vacinas' },
  { value: 'motodog', label: 'Motoboy', description: 'Transporte e entregas' },
  { value: 'vendedor_caixa', label: 'Vendedor/Caixa', description: 'PDV e vendas de balcao' },
  { value: 'gerente', label: 'Gerente', description: 'Gestao operacional' },
]

export const DEFAULT_PETSHOP_SERVICES = [
  { code: 'banho', name: 'Banho', group_type: 'banho_tosa', default_price: 60, default_duration_min: 60, commission_type: 'percentage', commission_rate: 5, active: true, sort_order: 10, icon: 'droplets' },
  { code: 'tosa', name: 'Tosa', group_type: 'banho_tosa', default_price: 80, default_duration_min: 60, commission_type: 'percentage', commission_rate: 10, active: true, sort_order: 20, icon: 'scissors' },
  { code: 'banho_e_tosa', name: 'Banho e Tosa', group_type: 'banho_tosa', default_price: 120, default_duration_min: 90, commission_type: 'percentage', commission_rate: 10, active: true, sort_order: 30, icon: 'scissors' },
  { code: 'escovacao', name: 'Escovacao', group_type: 'banho_tosa', default_price: 40, default_duration_min: 45, commission_type: 'percentage', commission_rate: 7, active: true, sort_order: 40, icon: 'paw' },
  { code: 'consulta', name: 'Consulta Veterinaria', group_type: 'veterinaria', default_price: 120, default_duration_min: 40, commission_type: 'percentage', commission_rate: 0, active: true, sort_order: 50, icon: 'stethoscope' },
  { code: 'veterinario', name: 'Veterinario', group_type: 'veterinaria', default_price: 150, default_duration_min: 40, commission_type: 'percentage', commission_rate: 0, active: true, sort_order: 60, icon: 'stethoscope' },
  { code: 'vacina', name: 'Vacina', group_type: 'veterinaria', default_price: 90, default_duration_min: 30, commission_type: 'percentage', commission_rate: 0, active: true, sort_order: 70, icon: 'syringe' },
  { code: 'motoboy', name: 'Motoboy/Transporte', group_type: 'motoboy', default_price: 20, default_duration_min: 30, commission_type: 'fixed', commission_rate: 5, active: true, sort_order: 80, icon: 'bike' },
  { code: 'outro', name: 'Outro', group_type: 'outro', default_price: 0, default_duration_min: 60, commission_type: 'percentage', commission_rate: 0, active: true, sort_order: 999, icon: 'paw' },
]

export const SERVICE_GROUPS = [
  { id: 'banho_tosa', label: 'Banho/Tosa', icon: Scissors },
  { id: 'veterinaria', label: 'Veterinaria', icon: Stethoscope },
  { id: 'motoboy', label: 'Motoboy', icon: Bike },
  { id: 'outro', label: 'Outros', icon: PawPrint },
]

export const COMMISSION_SCOPES = [
  { value: 'all', label: 'Tudo' },
  { value: 'service', label: 'Servico especifico' },
  { value: 'services', label: 'Servicos gerais' },
  { value: 'sale', label: 'Venda geral' },
  { value: 'category', label: 'Categoria de produto' },
  { value: 'product', label: 'Produto especifico' },
  { value: 'motoboy', label: 'Motoboy/transporte' },
]

const ICONS = {
  bike: Bike,
  briefcase: Briefcase,
  droplets: Droplets,
  paw: PawPrint,
  scissors: Scissors,
  shield: ShieldCheck,
  shopping: ShoppingCart,
  stethoscope: Stethoscope,
  syringe: Syringe,
  user: User,
}

export function normalizeCode(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function normalizeService(row = {}) {
  const code = normalizeCode(row.code || row.service_type || row.name)
  const fallback = DEFAULT_PETSHOP_SERVICES.find((item) => item.code === code)
  return {
    id: row.id || code,
    code,
    name: row.name || fallback?.name || code || 'Servico',
    group_type: row.group_type || fallback?.group_type || getServiceGroupFromCode(code),
    default_price: Number(row.default_price ?? row.price ?? fallback?.default_price ?? 0),
    default_duration_min: Number(row.default_duration_min ?? row.duration_min ?? fallback?.default_duration_min ?? 60),
    commission_type: row.commission_type || fallback?.commission_type || 'percentage',
    commission_rate: Number(row.commission_rate ?? fallback?.commission_rate ?? 0),
    active: row.active !== false,
    sort_order: Number(row.sort_order ?? fallback?.sort_order ?? 999),
    icon: row.icon || fallback?.icon || 'paw',
  }
}

export function normalizeServices(rows = []) {
  const source = rows?.length ? rows : DEFAULT_PETSHOP_SERVICES
  const byCode = new Map()
  source.map(normalizeService).forEach((service) => byCode.set(service.code, service))
  return [...byCode.values()].sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name))
}

export function activeServices(rows = []) {
  return normalizeServices(rows).filter((service) => service.active)
}

export function getServiceGroupFromCode(type = '') {
  const service = normalizeCode(type)
  if (/vet|consulta|vacina|clinica|medico/.test(service)) return 'veterinaria'
  if (/moto|entrega|transporte|retirada|busca/.test(service)) return 'motoboy'
  if (!service || service === 'outro') return 'outro'
  return 'banho_tosa'
}

export function serviceOptionsForGroup(services = [], group = 'banho_tosa') {
  const options = activeServices(services)
  return options.filter((service) => service.group_type === group || service.code === 'outro')
}

export function findService(services = [], code = '') {
  const normalized = normalizeCode(code)
  return normalizeServices(services).find((service) => service.code === normalized) || normalizeService({ code: normalized || 'outro' })
}

export function serviceLabel(services = [], code = '') {
  return findService(services, code).name
}

export function serviceIcon(serviceOrIcon) {
  const key = typeof serviceOrIcon === 'string' ? serviceOrIcon : serviceOrIcon?.icon
  return ICONS[key] || PawPrint
}

export function staffTypeLabel(value) {
  return STAFF_TYPE_OPTIONS.find((item) => item.value === value)?.label || 'Funcionario'
}

export function commissionScopeLabel(value) {
  return COMMISSION_SCOPES.find((item) => item.value === value)?.label || value || 'Tudo'
}
