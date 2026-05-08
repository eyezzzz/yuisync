import { HttpError } from './http.js'
import { adminSupabase, createUserSupabase } from './supabase.js'
import { serverEnv } from './env.js'
import { logger } from './logger.js'

function isFiscalRuntimeMissingError(error) {
  const message = String(error?.message || '').toLowerCase()
  if (!message) return false
  return (
    message.includes('fiscal_documents')
    || message.includes('fiscal_status')
    || message.includes('queue_fiscal_document_for_sale')
    || message.includes('tenant_fiscal_profiles')
  ) && (
    message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('relation')
    || message.includes('function')
    || message.includes('column')
  )
}

function normalizeFocusStatus(rawStatus = '') {
  const status = String(rawStatus || '').toLowerCase()
  if (!status) return 'pending'

  if (status.includes('autorizado')) return 'authorized'
  if (status.includes('cancelado')) return 'cancelled'
  if (status.includes('rejeitado')) return 'rejected'
  if (status.includes('erro')) return 'failed'
  if (status.includes('process')) return 'processing'
  if (status.includes('pendente')) return 'pending'
  return 'pending'
}

function normalizeInvoiceFiscalStatus(documentStatus) {
  switch (documentStatus) {
    case 'authorized':
      return 'authorized'
    case 'rejected':
      return 'rejected'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

function toDigits(value = '') {
  return String(value || '').replace(/\D/g, '')
}

function normalizeRef(documentId) {
  return `yui_${String(documentId || '').replace(/-/g, '')}`
}

function buildBasicAuthToken(token) {
  return Buffer.from(`${token || ''}:`).toString('base64')
}

function pickFocusApiBase(environment) {
  return environment === 'producao'
    ? serverEnv.focusNfeProdBaseUrl
    : serverEnv.focusNfeHomologBaseUrl
}

function truncateText(value, max = 120) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`
}

function mapRegimeToFocusCode(regime) {
  const input = String(regime || '').toLowerCase()
  if (input.includes('simples')) return '1'
  if (input.includes('presumido')) return '3'
  if (input.includes('real')) return '3'
  return '1'
}

function buildFallbackFocusPayload({ sale, profile, invoice }) {
  const settings = profile?.settings || {}
  const issuer = settings?.issuer || {}
  const items = (sale?.sale_items || []).map((item, index) => {
    const qty = Number(item.quantity || 1) || 1
    const unit = Number(item.unit_price || 0)
    const subtotal = Number(item.subtotal || (unit * qty) || 0)
    const name = truncateText(item?.products?.name || `Item ${index + 1}`, 120)
    return {
      numero_item: index + 1,
      codigo_produto: item?.products?.id || String(index + 1),
      descricao: name || `Item ${index + 1}`,
      cfop: '5102',
      unidade_comercial: 'UN',
      quantidade_comercial: qty,
      valor_unitario_comercial: unit,
      ncm: '00000000',
      icms_origem: '0',
      icms_situacao_tributaria: '102',
      pis_situacao_tributaria: '49',
      cofins_situacao_tributaria: '49',
      valor_bruto: subtotal,
    }
  })

  const now = new Date().toISOString()
  return {
    natureza_operacao: 'Venda de mercadoria',
    data_emissao: now,
    tipo_documento: 1,
    finalidade_emissao: 1,
    consumidor_final: 1,
    presenca_comprador: 1,
    indicador_intermediador: 0,
    local_destino: 1,
    cnpj_emitente: toDigits(issuer.cnpj || ''),
    nome_emitente: issuer.legal_name || 'Empresa YuiSync',
    nome_fantasia_emitente: issuer.trade_name || issuer.legal_name || 'YuiSync',
    logradouro_emitente: issuer.street || settings.store_address || 'Endereco nao informado',
    numero_emitente: issuer.street_number || 'S/N',
    bairro_emitente: issuer.neighborhood || settings.store_neighborhood || 'Centro',
    municipio_emitente: settings.store_city || issuer.city || 'Cidade',
    uf_emitente: issuer.state || 'SP',
    cep_emitente: toDigits(issuer.zip || ''),
    inscricao_estadual_emitente: issuer.ie || null,
    regime_tributario_emitente: mapRegimeToFocusCode(profile?.fiscal_regime),
    modalidade_frete: 9,
    items: items.length > 0 ? items : [
      {
        numero_item: 1,
        codigo_produto: 'item-1',
        descricao: truncateText(sale?.notes || 'Venda YuiSync', 120),
        cfop: '5102',
        unidade_comercial: 'UN',
        quantidade_comercial: 1,
        valor_unitario_comercial: Number(invoice?.amount || sale?.total_price || 0),
        ncm: '00000000',
        icms_origem: '0',
        icms_situacao_tributaria: '102',
        pis_situacao_tributaria: '49',
        cofins_situacao_tributaria: '49',
        valor_bruto: Number(invoice?.amount || sale?.total_price || 0),
      },
    ],
  }
}

function resolveFocusPayload({ document, sale, profile, invoice }) {
  const payloadFromDoc = document?.payload?.focus_payload
  if (payloadFromDoc && typeof payloadFromDoc === 'object' && !Array.isArray(payloadFromDoc)) {
    return payloadFromDoc
  }

  const payloadFromSettings = profile?.settings?.focus_payload_template
  if (payloadFromSettings && typeof payloadFromSettings === 'object' && !Array.isArray(payloadFromSettings)) {
    return payloadFromSettings
  }

  return buildFallbackFocusPayload({ sale, profile, invoice })
}

async function querySaleBundle(userSupabase, saleId) {
  const { data, error } = await userSupabase
    .from('sales')
    .select(`
      id, module_id, tenant_id, status, customer_name, customer_phone, total_price, notes, created_at,
      sale_items (
        id, quantity, unit_price, subtotal,
        products ( id, name, category, barcode )
      )
    `)
    .eq('id', saleId)
    .maybeSingle()

  if (error) throw error
  return data
}

async function queryInvoiceBySale(userSupabase, moduleId, saleId) {
  const { data, error } = await userSupabase
    .from('invoices')
    .select('id, tenant_id, module_id, sale_id, status, amount, due_date, paid_at, invoice_nfe_url, fiscal_status, fiscal_document_id, updated_at')
    .eq('module_id', moduleId)
    .eq('sale_id', saleId)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

async function queryDocumentById(userSupabase, documentId) {
  if (!documentId) return null
  const { data, error } = await userSupabase
    .from('fiscal_documents')
    .select('id, tenant_id, module_id, sale_id, invoice_id, document_type, status, provider, environment, issue_series, issue_number, nfe_key, protocol_number, xml_url, pdf_url, payload, response, error_message, issued_at, created_at, updated_at')
    .eq('id', documentId)
    .maybeSingle()

  if (error) throw error
  return data
}

async function queryTenantProfile(userSupabase, tenantId, moduleId) {
  const { data, error } = await userSupabase
    .from('tenant_fiscal_profiles')
    .select('tenant_id, module_id, fiscal_regime, nfe_environment, issue_series, emit_nfce, emit_nfe, emit_nfse, settings')
    .eq('tenant_id', tenantId)
    .eq('module_id', moduleId)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

async function persistFocusResponse({ document, responsePayload, errorMessage = null }) {
  const mappedStatus = normalizeFocusStatus(responsePayload?.status)
  const protocol = responsePayload?.protocolo_sefaz || responsePayload?.protocolo || null
  const nfeKey = responsePayload?.chave_nfe || responsePayload?.chave || null
  const xmlPath = responsePayload?.caminho_xml_nota_fiscal || responsePayload?.caminho_xml || null
  const danfePath = responsePayload?.caminho_danfe || responsePayload?.caminho_pdf || null

  const { error: docError } = await adminSupabase
    .from('fiscal_documents')
    .update({
      status: mappedStatus,
      nfe_key: nfeKey,
      protocol_number: protocol,
      xml_url: xmlPath,
      pdf_url: danfePath,
      response: responsePayload || {},
      error_message: errorMessage || responsePayload?.mensagem_sefaz || responsePayload?.mensagem || null,
      issued_at: mappedStatus === 'authorized' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', document.id)

  if (docError) {
    throw new HttpError(500, `Falha ao persistir resposta fiscal: ${docError.message}`)
  }

  const invoiceFiscalStatus = normalizeInvoiceFiscalStatus(mappedStatus)
  const { error: invoiceError } = await adminSupabase
    .from('invoices')
    .update({
      fiscal_status: invoiceFiscalStatus,
      invoice_nfe_url: nfeKey || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', document.invoice_id)

  if (invoiceError) {
    throw new HttpError(500, `Falha ao atualizar invoice fiscal: ${invoiceError.message}`)
  }
}

/**
 * Fetch with timeout using AbortController.
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new HttpError(504, 'External fiscal API request timed out.')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function submitFocusDocument({ sale, invoice, document, profile }) {
  if (!serverEnv.focusNfeToken) {
    throw new HttpError(400, 'FOCUS_NFE_TOKEN nao configurado no servidor.')
  }

  const baseUrl = pickFocusApiBase(document.environment || profile?.nfe_environment)
  const documentType = String(document.document_type || 'nfce').toLowerCase()
  const ref = normalizeRef(document.id)
  const endpoint = `${String(baseUrl).replace(/\/$/, '')}/v2/${documentType}?ref=${encodeURIComponent(ref)}`
  const payload = resolveFocusPayload({ document, sale, profile, invoice })

  const { error: seedError } = await adminSupabase
    .from('fiscal_documents')
    .update({
      payload: {
        ...(document.payload || {}),
        focus_ref: ref,
        focus_last_request_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', document.id)

  if (seedError) {
    throw new HttpError(500, `Falha ao registrar envio fiscal: ${seedError.message}`)
  }

  logger.info('Submitting fiscal document to Focus NFe', {
    documentId: document.id,
    documentType,
    ref,
    environment: document.environment || profile?.nfe_environment,
  })

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${buildBasicAuthToken(serverEnv.focusNfeToken)}`,
    },
    body: JSON.stringify(payload),
  }, serverEnv.focusNfeTimeoutMs)

  const responseBody = await response.json().catch(() => ({}))
  if (!response.ok) {
    await persistFocusResponse({
      document,
      responsePayload: responseBody,
      errorMessage: responseBody?.mensagem || responseBody?.mensagem_sefaz || `HTTP ${response.status}`,
    })
    throw new HttpError(422, responseBody?.mensagem || responseBody?.mensagem_sefaz || `Falha Focus (${response.status}).`)
  }

  await persistFocusResponse({
    document,
    responsePayload: responseBody,
  })
}

export async function issueFiscalForSale(accessToken, saleId) {
  const userSupabase = createUserSupabase(accessToken)
  const sale = await querySaleBundle(userSupabase, saleId)

  if (!sale) {
    throw new HttpError(404, 'Venda nao encontrada para emissao fiscal.')
  }

  if (sale.module_id !== 'petshop') {
    throw new HttpError(400, 'Emissao fiscal automatica disponivel apenas para o modulo petshop.')
  }

  if (sale.status !== 'concluido') {
    throw new HttpError(400, 'Somente vendas concluidas podem emitir documento fiscal.')
  }

  try {
    const queueResponse = await userSupabase.rpc('queue_fiscal_document_for_sale', { p_sale_id: sale.id })
    if (queueResponse.error) throw queueResponse.error
  } catch (error) {
    if (isFiscalRuntimeMissingError(error)) {
      return {
        status: 'runtime_missing',
        reason: 'Runtime fiscal nao habilitado no banco.',
      }
    }
    throw new HttpError(500, error.message || 'Falha ao enfileirar emissao fiscal.')
  }

  let invoice = null
  let document = null
  let profile = null

  try {
    invoice = await queryInvoiceBySale(userSupabase, sale.module_id, sale.id)
    document = await queryDocumentById(userSupabase, invoice?.fiscal_document_id)
    profile = await queryTenantProfile(userSupabase, sale.tenant_id, sale.module_id)
  } catch (error) {
    if (isFiscalRuntimeMissingError(error)) {
      return {
        status: 'runtime_missing',
        reason: 'Runtime fiscal nao habilitado no banco.',
      }
    }
    throw new HttpError(500, error.message || 'Falha ao carregar estado fiscal da venda.')
  }

  if (!invoice) {
    return {
      status: 'ok',
      sale,
      invoice: null,
      document: null,
    }
  }

  if (!document) {
    return {
      status: 'ok',
      sale,
      invoice,
      document: null,
    }
  }

  const isFocus = String(document.provider || '').toLowerCase() === 'focus_nfe'
  const isPending = ['pending', 'processing'].includes(String(document.status || '').toLowerCase())

  if (isFocus && isPending) {
    await submitFocusDocument({
      sale,
      invoice,
      document,
      profile,
    })

    invoice = await queryInvoiceBySale(userSupabase, sale.module_id, sale.id)
    document = await queryDocumentById(userSupabase, invoice?.fiscal_document_id)
  }

  return {
    status: 'ok',
    sale,
    invoice,
    document,
  }
}

function parseFocusWebhookBody(body) {
  if (!body || typeof body !== 'object') return null
  return body
}

function extractFocusRef(payload) {
  return payload?.ref || payload?.referencia || payload?.reference || null
}

async function findDocumentByFocusRef(ref) {
  if (!ref) return null

  const { data, error } = await adminSupabase
    .from('fiscal_documents')
    .select('id, invoice_id, payload')
    .contains('payload', { focus_ref: ref })
    .limit(1)
    .maybeSingle()

  if (!error && data) return data

  if (String(ref).startsWith('yui_')) {
    const raw = String(ref).slice(4)
    if (raw.length === 32) {
      const uuid = `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
      const byId = await adminSupabase
        .from('fiscal_documents')
        .select('id, invoice_id, payload')
        .eq('id', uuid)
        .maybeSingle()
      if (!byId.error && byId.data) return byId.data
    }
  }

  return null
}

export async function handleFocusWebhook(body, queryToken) {
  // Always require webhook token — never allow open access
  if (!serverEnv.focusNfeWebhookToken) {
    logger.error('Fiscal webhook called but FOCUS_NFE_WEBHOOK_TOKEN is not configured.')
    throw new HttpError(503, 'Fiscal webhook not configured.')
  }

  if (queryToken !== serverEnv.focusNfeWebhookToken) {
    logger.warn('Fiscal webhook called with invalid token.', { providedToken: queryToken ? '***' : '(empty)' })
    throw new HttpError(403, 'Webhook token invalido.')
  }

  const payload = parseFocusWebhookBody(body)
  if (!payload) {
    throw new HttpError(400, 'Payload de webhook invalido.')
  }

  const ref = extractFocusRef(payload)
  if (!ref) {
    return { ok: true, ignored: true, reason: 'ref ausente' }
  }

  const document = await findDocumentByFocusRef(ref)
  if (!document) {
    return { ok: true, ignored: true, reason: 'documento nao encontrado' }
  }

  await persistFocusResponse({
    document,
    responsePayload: payload,
  })

  logger.info('Fiscal webhook processed', { documentId: document.id, ref })

  return { ok: true, documentId: document.id }
}
