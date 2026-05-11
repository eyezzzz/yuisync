function isColumnError(error, columnName) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes(columnName.toLowerCase()) && (
    message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('column')
  )
}

function buildNotes(orderSession) {
  return [
    'Pedido criado pelo bot WhatsApp.',
    orderSession.fulfillmentType ? `Recebimento: ${orderSession.fulfillmentType}` : null,
    orderSession.address?.raw ? `Endereco: ${orderSession.address.raw}` : null,
    orderSession.address?.reference ? `Referencia: ${orderSession.address.reference}` : null,
    orderSession.payment?.method === 'dinheiro'
      ? `Troco: ${orderSession.payment.changeNeeded ? `para R$ ${Number(orderSession.payment.changeFor || 0).toFixed(2)}` : 'nao precisa'}`
      : null,
    ...(orderSession.notes || []),
  ].filter(Boolean).join(' | ')
}

async function insertSaleWithFallback(supabase, payload) {
  let nextPayload = { ...payload }
  let response = await supabase
    .from('sales')
    .insert(nextPayload)
    .select('id, customer_name, customer_phone, total_price, payment_method, source, fulfillment_type, created_at')
    .single()

  if (response.error && isColumnError(response.error, 'fulfillment_type')) {
    nextPayload = {
      ...nextPayload,
      notes: [nextPayload.notes, nextPayload.fulfillment_type ? `Fluxo operacional: ${nextPayload.fulfillment_type}` : null].filter(Boolean).join(' | '),
    }
    delete nextPayload.fulfillment_type
    response = await supabase
      .from('sales')
      .insert(nextPayload)
      .select('id, customer_name, customer_phone, total_price, payment_method, source, created_at')
      .single()
  }

  if (response.error && isColumnError(response.error, 'tenant_id')) {
    delete nextPayload.tenant_id
    response = await supabase
      .from('sales')
      .insert(nextPayload)
      .select('id, customer_name, customer_phone, total_price, payment_method, source, created_at')
      .single()
  }

  if (response.error) {
    throw new Error(`Nao foi possivel salvar o pedido: ${response.error.message}`)
  }

  return response.data
}

async function insertSaleItemsWithFallback(supabase, tenantId, saleId, items) {
  let rows = items.map((item) => ({
    tenant_id: tenantId,
    sale_id: saleId,
    product_id: item.productId,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    subtotal: item.totalPrice,
    upsell: false,
  }))

  let response = await supabase.from('sale_items').insert(rows)

  if (response.error && isColumnError(response.error, 'tenant_id')) {
    rows = rows.map(({ tenant_id: _tenantId, ...item }) => item)
    response = await supabase.from('sale_items').insert(rows)
  }

  if (response.error) {
    throw new Error(`Nao foi possivel salvar os itens do pedido: ${response.error.message}`)
  }
}

export async function confirmOrder(supabase, chatSession, orderSession) {
  if (orderSession.confirmedSaleId) {
    return { saleId: orderSession.confirmedSaleId, duplicated: true }
  }

  const sale = await insertSaleWithFallback(supabase, {
    tenant_id: chatSession.tenant_id,
    module_id: chatSession.module_id,
    customer_name: orderSession.customerName || chatSession.customer_name || 'Cliente WhatsApp',
    customer_phone: orderSession.customerPhone || chatSession.customer_phone || null,
    payment_method: orderSession.payment.method || null,
    subtotal: orderSession.totals.subtotal,
    discount: 0,
    total_price: orderSession.totals.total,
    status: 'pendente',
    source: 'whatsapp',
    fulfillment_type: orderSession.fulfillmentType === 'entrega' ? 'entrega' : 'balcao',
    notes: buildNotes(orderSession),
  })

  await insertSaleItemsWithFallback(supabase, chatSession.tenant_id, sale.id, orderSession.items)

  await supabase
    .from('chat_sessions')
    .update({
      status: 'bot',
      intent: 'pedido_confirmado',
      last_message_at: new Date().toISOString(),
    })
    .eq('id', chatSession.id)

  return { saleId: sale.id, duplicated: false }
}

export async function saveSatisfactionScore(supabase, chatSession, rating) {
  const { error } = await supabase
    .from('chat_sessions')
    .update({
      csat_score: rating,
      status: 'closed',
      intent: 'satisfacao_coletada',
      closed_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    })
    .eq('id', chatSession.id)

  if (error) {
    throw new Error(`Nao foi possivel salvar a nota de satisfacao: ${error.message}`)
  }
}
