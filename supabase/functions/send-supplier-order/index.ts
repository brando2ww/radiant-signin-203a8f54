// send-supplier-order — envia o PEDIDO ao(s) fornecedor(es) vencedor(es) por WhatsApp.
// Autenticado (JWT do lojista). Recebe mensagens já montadas por fornecedor e as
// dispara pela mesma instância Evolution usada nas cotações. Marca a cotação como
// 'completed' ao final.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveTenantChannel, sendText, isChannelError } from '../_shared/whatsapp/index.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Usuário não autenticado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { quotationId, orders } = await req.json()
    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return new Response(JSON.stringify({ error: 'Lista de pedidos é obrigatória' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    const resolved = await resolveTenantChannel(supabase, user.id)
    if (isChannelError(resolved)) {
      return new Response(
        JSON.stringify({ error: resolved.error.errorMessage, code: resolved.error.errorCode }),
        { status: resolved.error.errorCode === 'no_connection' ? 400 : 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const channel = resolved

    const sent: string[] = []
    const errors: { supplierId: string; error: string }[] = []
    const createdOrders: string[] = []

    // Base para numerar os pedidos de compra (PC-YYYY-0001), como no app.
    const year = new Date().getFullYear()
    const { count: poCount } = await supabase
      .from('pdv_purchase_orders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', `${year}-01-01`)
    let nextPoNumber = (poCount || 0) + 1

    for (const order of orders) {
      const { supplierId, phone, message } = order
      if (!phone || !message) {
        errors.push({ supplierId, error: 'Telefone ou mensagem ausente' })
        continue
      }
      const outcome = await sendText(supabase, channel, String(phone), message, {
        purpose: 'supplier_order',
        supplierId,
      })
      const delivered = outcome.ok
      if (delivered) sent.push(supplierId)
      else errors.push({ supplierId, error: outcome.errorMessage ?? outcome.errorCode ?? 'Falha no envio' })

      // Registra o PEDIDO DE COMPRA (mesmo se o WhatsApp falhar: fica como 'draft').
      const items: any[] = Array.isArray(order.items) ? order.items : []
      if (items.length > 0) {
        const subtotal = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0)
        const orderNumber = `PC-${year}-${String(nextPoNumber).padStart(4, '0')}`
        nextPoNumber++
        const { data: po, error: poErr } = await supabase
          .from('pdv_purchase_orders')
          .insert({
            user_id: user.id,
            supplier_id: supplierId,
            quotation_request_id: quotationId ?? null,
            order_number: orderNumber,
            expected_delivery: order.expectedDelivery ?? null,
            payment_terms: order.paymentTerms ?? null,
            subtotal,
            total: subtotal,
            status: delivered ? 'sent' : 'draft',
            whatsapp_sent_at: delivered ? new Date().toISOString() : null,
            notes: `Gerado a partir da cotação${order.requestNumber ? ` ${order.requestNumber}` : ''}.`,
          })
          .select('id, order_number')
          .single()
        if (poErr) {
          console.error('purchase order insert error:', poErr.message)
        } else if (po) {
          createdOrders.push(po.order_number)
          const poItems = items.map((it: any) => ({
            purchase_order_id: po.id,
            ingredient_id: it.ingredient_id,
            quotation_response_id: it.quotation_response_id ?? null,
            quantity: Number(it.quantity) || 0,
            unit: it.unit,
            unit_price: Number(it.unit_price) || 0,
            total_price: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
          }))
          const { error: itErr } = await supabase.from('pdv_purchase_order_items').insert(poItems)
          if (itErr) console.error('purchase order items insert error:', itErr.message)
        }
      }
    }

    // Marca a cotação como finalizada quando algo foi enviado.
    if (quotationId && sent.length > 0) {
      await supabase
        .from('pdv_quotation_requests')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', quotationId)
        .eq('user_id', user.id)
    }

    return new Response(JSON.stringify({ success: true, sent: sent.length, errors, total: orders.length, orders: createdOrders }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('send-supplier-order error:', error)
    return new Response(JSON.stringify({ error: 'Erro interno do servidor' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
