import { getAdminSupabase } from './supabaseClient.ts'

type BuildBusinessInput = {
  companyId: string
  userMessage: string
}

type CompanyScope = {
  id: string
  tenant_id: string | null
  module_id: string
}

type ClientRow = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  details: Record<string, unknown> | null
}

type ProductRow = {
  id: string
  name: string | null
  category: string | null
  price: number | null
  stock_quantity: number | null
  active: boolean | null
}

function normalizeText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function tokenize(value: string): string[] {
  const terms = normalizeText(value)
    .split(/[^a-z0-9]+/g)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
  return [...new Set(terms)]
}

function isMissingColumn(errorMessage: string, columnName: string): boolean {
  const msg = normalizeText(errorMessage)
  return msg.includes('column') && msg.includes(normalizeText(columnName))
}

async function loadCompanyScope(companyId: string): Promise<CompanyScope | null> {
  const supabase = getAdminSupabase()

  const scoped = await supabase
    .from('companies')
    .select('id,tenant_id,module_id')
    .eq('id', companyId)
    .maybeSingle()

  if (!scoped.error && scoped.data) {
    return {
      id: scoped.data.id,
      tenant_id: scoped.data.tenant_id || null,
      module_id: scoped.data.module_id || 'petshop',
    }
  }

  if (scoped.error && isMissingColumn(scoped.error.message, 'module_id')) {
    const fallback = await supabase
      .from('companies')
      .select('id,tenant_id')
      .eq('id', companyId)
      .maybeSingle()

    if (!fallback.error && fallback.data) {
      return {
        id: fallback.data.id,
        tenant_id: fallback.data.tenant_id || null,
        module_id: 'petshop',
      }
    }
  }

  return null
}

function scoreClient(client: ClientRow, terms: string[]): number {
  if (terms.length === 0) return 0

  const detailsText = normalizeText(JSON.stringify(client.details || {}))
  const full = normalizeText([
    client.name || '',
    client.phone || '',
    client.email || '',
    detailsText,
  ].join(' '))

  let score = 0
  for (const term of terms) {
    if ((client.name || '').toLowerCase().includes(term)) score += 5
    if ((client.phone || '').toLowerCase().includes(term)) score += 3
    if ((client.email || '').toLowerCase().includes(term)) score += 2
    if (full.includes(term)) score += 1
  }
  return score
}

function scoreProduct(product: ProductRow, terms: string[]): number {
  if (terms.length === 0) return 0
  const full = normalizeText([product.name || '', product.category || ''].join(' '))

  let score = 0
  for (const term of terms) {
    if ((product.name || '').toLowerCase().includes(term)) score += 6
    if ((product.category || '').toLowerCase().includes(term)) score += 3
    if (full.includes(term)) score += 1
  }
  return score
}

async function loadClients(scope: CompanyScope): Promise<ClientRow[]> {
  const supabase = getAdminSupabase()

  let query = supabase
    .from('clients')
    .select('id,name,phone,email,details')
    .eq('module_id', scope.module_id)
    .limit(120)

  if (scope.tenant_id) {
    query = query.eq('tenant_id', scope.tenant_id)
  }

  const response = await query
  if (!response.error) return (response.data || []) as ClientRow[]

  if (scope.tenant_id && isMissingColumn(response.error.message, 'tenant_id')) {
    const retry = await supabase
      .from('clients')
      .select('id,name,phone,email,details')
      .eq('module_id', scope.module_id)
      .limit(120)

    if (!retry.error) return (retry.data || []) as ClientRow[]
  }

  return []
}

async function loadProducts(scope: CompanyScope): Promise<ProductRow[]> {
  const supabase = getAdminSupabase()

  let query = supabase
    .from('products')
    .select('id,name,category,price,stock_quantity,active')
    .eq('module_id', scope.module_id)
    .eq('active', true)
    .limit(200)

  if (scope.tenant_id) {
    query = query.eq('tenant_id', scope.tenant_id)
  }

  const response = await query
  if (!response.error) return (response.data || []) as ProductRow[]

  if (scope.tenant_id && isMissingColumn(response.error.message, 'tenant_id')) {
    const retry = await supabase
      .from('products')
      .select('id,name,category,price,stock_quantity,active')
      .eq('module_id', scope.module_id)
      .eq('active', true)
      .limit(200)

    if (!retry.error) return (retry.data || []) as ProductRow[]
  }

  return []
}

function formatClientLine(client: ClientRow): string {
  const petName = String((client.details || {}).pet_name || '').trim()
  const phone = client.phone ? ` | tel: ${client.phone}` : ''
  const pet = petName ? ` | pet: ${petName}` : ''
  return `- ${client.name || 'Cliente sem nome'}${pet}${phone}`
}

function formatProductLine(product: ProductRow): string {
  const stock = Number(product.stock_quantity || 0)
  const stockLabel = stock > 0 ? `${stock}` : 'SEM ESTOQUE'
  const price = Number(product.price || 0).toFixed(2)
  const category = product.category ? ` | cat: ${product.category}` : ''
  return `- ${product.name || 'Produto sem nome'}${category} | preco: R$ ${price} | estoque: ${stockLabel}`
}

export async function buildBusinessContextRag(input: BuildBusinessInput): Promise<string> {
  const scope = await loadCompanyScope(input.companyId)
  if (!scope) {
    return '### Contexto operacional\n- Empresa sem escopo de modulo configurado para clientes/estoque.'
  }

  const [clients, products] = await Promise.all([
    loadClients(scope),
    loadProducts(scope),
  ])

  const terms = tokenize(input.userMessage)

  const rankedClients = clients
    .map((client) => ({ client, score: scoreClient(client, terms) }))
    .sort((a, b) => b.score - a.score)

  const rankedProducts = products
    .map((product) => ({ product, score: scoreProduct(product, terms) }))
    .sort((a, b) => b.score - a.score)

  let selectedClients = rankedClients.filter((row) => row.score > 0).slice(0, 5).map((row) => row.client)
  let selectedProducts = rankedProducts.filter((row) => row.score > 0).slice(0, 8).map((row) => row.product)

  if (selectedClients.length === 0) {
    selectedClients = clients.slice(0, 3)
  }

  if (selectedProducts.length === 0) {
    selectedProducts = products
      .sort((a, b) => Number(b.stock_quantity || 0) - Number(a.stock_quantity || 0))
      .slice(0, 5)
  }

  const clientSection = selectedClients.length > 0
    ? ['Clientes relevantes:', ...selectedClients.map(formatClientLine)]
    : ['Clientes relevantes:', '- Nenhum cliente encontrado para este modulo/empresa.']

  const productSection = selectedProducts.length > 0
    ? ['Produtos e estoque relevantes:', ...selectedProducts.map(formatProductLine)]
    : ['Produtos e estoque relevantes:', '- Nenhum produto ativo encontrado para este modulo/empresa.']

  return [
    `### Contexto operacional (${scope.module_id})`,
    ...clientSection,
    '',
    ...productSection,
  ].join('\n')
}
