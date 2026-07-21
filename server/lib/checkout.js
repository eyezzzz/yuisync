import { createUserSupabase } from './supabase.js'
import { HttpError } from './http.js'
import { requireAuthenticatedProfile } from './auth.js'

function cleanText(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function normalizePayload(body) {
  const items = Array.isArray(body.items)
    ? body.items.slice(0, 100).map((item) => ({
        product_id: cleanText(item?.productId || item?.product_id, 50),
        quantity: Number(item?.quantity || 0),
        upsell: item?.upsell === true,
      }))
    : []
  const paymentSplits = Array.isArray(body.paymentSplits || body.payment_splits)
    ? (body.paymentSplits || body.payment_splits).slice(0, 10).map((item, index) => ({
        method: cleanText(item?.method, 20),
        amount: Number(item?.amount || 0),
        position: index + 1,
      }))
    : []

  if (!items.length || items.some((item) => !item.product_id || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    throw new HttpError(400, 'Carrinho contem itens invalidos.')
  }

  const idempotencyKey = cleanText(body.idempotencyKey || body.idempotency_key, 128)
  if (!idempotencyKey) throw new HttpError(400, 'Chave de idempotencia obrigatoria.')

  return {
    tenant_id: cleanText(body.tenantId || body.tenant_id, 50),
    module_id: cleanText(body.moduleId || body.module_id, 30) || 'petshop',
    client_id: cleanText(body.clientId || body.client_id, 50) || null,
    customer_name: cleanText(body.customerName || body.customer_name, 120) || 'Balcao',
    customer_phone: cleanText(body.customerPhone || body.customer_phone, 30) || null,
    payment_method: cleanText(body.paymentMethod || body.payment_method, 20),
    payment_splits: paymentSplits,
    discount: Math.max(0, Number(body.discount || 0)),
    source: cleanText(body.source, 30) || 'pdv',
    fulfillment_type: cleanText(body.fulfillmentType || body.fulfillment_type, 30) || 'balcao',
    notes: cleanText(body.notes, 1000) || null,
    idempotency_key: idempotencyKey,
    items,
  }
}

function mapTransactionError(error) {
  const message = String(error?.message || 'Falha ao concluir venda.')
  const normalized = message.toLowerCase()
  const status = normalized.includes('estoque') || normalized.includes('desconto') || normalized.includes('pagamento')
    ? 409
    : normalized.includes('tenant') || normalized.includes('permissao')
      ? 403
      : 400
  return new HttpError(status, message)
}

export async function executeCheckout(accessToken, body) {
  await requireAuthenticatedProfile(accessToken)
  const payload = normalizePayload(body || {})
  const userSupabase = createUserSupabase(accessToken)

  const transaction = await userSupabase.rpc('create_pdv_checkout_transaction', { p_payload: payload })
  if (transaction.error) throw mapTransactionError(transaction.error)

  const saleId = transaction.data?.sale_id
  let saleResponse = await userSupabase
    .from('sales')
    .select('id,tenant_id,module_id,client_id,customer_name,customer_phone,payment_method,subtotal,discount,delivery_fee,total_price,status,source,fulfillment_type,notes,created_at')
    .eq('id', saleId)
    .eq('tenant_id', payload.tenant_id)
    .single()

  if (saleResponse.error && String(saleResponse.error.message || '').toLowerCase().includes('delivery_fee')) {
    saleResponse = await userSupabase
      .from('sales')
      .select('id,tenant_id,module_id,client_id,customer_name,customer_phone,payment_method,subtotal,discount,total_price,status,source,fulfillment_type,notes,created_at')
      .eq('id', saleId)
      .eq('tenant_id', payload.tenant_id)
      .single()
    if (saleResponse.data) saleResponse.data.delivery_fee = Number(transaction.data?.delivery_fee || 0)
  }
  if (saleResponse.error) throw new HttpError(500, 'Venda concluida, mas nao foi possivel recarregar o comprovante.')

  let fiscal = { status: 'queued' }
  const queue = await userSupabase.rpc('queue_fiscal_document_for_sale', { p_sale_id: saleId })
  if (queue.error) {
    fiscal = { status: 'queue_failed', message: queue.error.message }
    await userSupabase.rpc('record_fiscal_queue_failure', {
      p_sale_id: saleId,
      p_error_message: queue.error.message,
    })
  }

  return { sale: saleResponse.data, transaction: transaction.data, fiscal }
}
