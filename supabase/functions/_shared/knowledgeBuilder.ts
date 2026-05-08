import { getAdminSupabase } from './supabaseClient.ts'

type BuildKnowledgeInput = {
  companyId: string
  userMessage: string
  limit?: number
}

type CompanyRow = {
  id: string
  tenant_id: string | null
}

type DocumentRow = {
  id: string
  title: string | null
  tags: string[] | null
  content_text: string | null
  created_at: string | null
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

function compactSnippet(value: string, max = 260): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (!clean) return 'Sem resumo textual cadastrado para este documento.'
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

function scoreDocument(doc: DocumentRow, terms: string[]): number {
  if (terms.length === 0) return 0

  const title = normalizeText(doc.title || '')
  const tags = normalizeText((doc.tags || []).join(' '))
  const content = normalizeText(doc.content_text || '')

  let score = 0
  for (const term of terms) {
    if (title.includes(term)) score += 6
    if (tags.includes(term)) score += 4
    if (content.includes(term)) score += 2
  }

  return score
}

function sortByDateDesc(a: DocumentRow, b: DocumentRow): number {
  const da = new Date(a.created_at || 0).getTime()
  const db = new Date(b.created_at || 0).getTime()
  return db - da
}

export async function buildKnowledgeRag(input: BuildKnowledgeInput): Promise<string> {
  const supabase = getAdminSupabase()

  const { data: companyData, error: companyError } = await supabase
    .from('companies')
    .select('id,tenant_id')
    .eq('id', input.companyId)
    .maybeSingle()

  if (companyError || !companyData) {
    return '### Base de conhecimento\n- Empresa sem base documental configurada.'
  }

  const company = companyData as CompanyRow

  let query = supabase
    .from('ai_training_documents')
    .select('id,title,tags,content_text,created_at')
    .eq('status', 'active')
    .eq('company_id', input.companyId)
    .order('created_at', { ascending: false })
    .limit(80)

  if (company.tenant_id) {
    query = query.eq('tenant_id', company.tenant_id)
  }

  const { data, error } = await query
  if (error) {
    const message = String(error.message || '').toLowerCase()
    if (message.includes('ai_training_documents') && message.includes('does not exist')) {
      return '### Base de conhecimento\n- Tabela de documentos ainda nao foi criada no banco.'
    }
    return '### Base de conhecimento\n- Nao foi possivel carregar os documentos de treino agora.'
  }

  const docs = (data || []) as DocumentRow[]
  if (docs.length === 0) {
    return '### Base de conhecimento\n- Nenhum documento ativo para este bot.'
  }

  const terms = tokenize(input.userMessage)
  const scored = docs
    .map((doc) => ({
      doc,
      score: scoreDocument(doc, terms),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return sortByDateDesc(a.doc, b.doc)
    })

  const maxItems = Math.max(1, Math.min(Number(input.limit || 3), 6))
  let selected = scored.filter((item) => item.score > 0).slice(0, maxItems).map((item) => item.doc)

  if (selected.length === 0) {
    selected = docs.sort(sortByDateDesc).slice(0, Math.min(2, maxItems))
  }

  const lines = selected.map((doc) => {
    const title = (doc.title || 'Documento sem titulo').trim()
    const tags = (doc.tags || []).filter(Boolean).join(', ')
    const snippet = compactSnippet(doc.content_text || '')
    const tagsLine = tags ? ` | tags: ${tags}` : ''
    return `- ${title}${tagsLine}\n  resumo: ${snippet}`
  })

  return ['### Base de conhecimento', ...lines].join('\n')
}
