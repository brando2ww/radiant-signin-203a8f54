import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticate user from JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Get user from auth token
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { quotationId, suppliers, itemIds, generateOnly } = await req.json()

    if (!suppliers || !Array.isArray(suppliers) || suppliers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Lista de fornecedores é obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!quotationId) {
      return new Response(
        JSON.stringify({ error: 'quotationId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const appOrigin = (Deno.env.get('PUBLIC_APP_ORIGIN') ?? 'https://pdv.velaraia.app').replace(/\/$/, '')

    // Garante um link público (token) por (cotação + fornecedor) e devolve a URL.
    async function ensureLinkUrl(supplierId: string): Promise<string | null> {
      const { data: existing } = await supabase
        .from('pdv_quotation_supplier_links')
        .select('token')
        .eq('quotation_request_id', quotationId)
        .eq('supplier_id', supplierId)
        .maybeSingle()
      let token = existing?.token as string | undefined
      if (!token) {
        const { data: created, error: cErr } = await supabase
          .from('pdv_quotation_supplier_links')
          .insert({ user_id: user.id, quotation_request_id: quotationId, supplier_id: supplierId })
          .select('token')
          .single()
        if (cErr) { console.error('link create error:', cErr.message); return null }
        token = created?.token
      }
      // /l/cotacao/ passa pelo og-cotacao (preview rico no WhatsApp) e redireciona
      // o fornecedor para o formulário. Mantém o domínio bonito pdv.velaraia.app.
      return token ? `${appOrigin}/l/cotacao/${token}` : null
    }

    const links: { supplierId: string; name?: string; url: string }[] = []

    // Modo "só gerar links" (copiar/QR no painel), sem enviar WhatsApp.
    if (generateOnly) {
      for (const supplier of suppliers) {
        const url = await ensureLinkUrl(supplier.supplierId)
        if (url) links.push({ supplierId: supplier.supplierId, name: supplier.name, url })
      }
      return new Response(
        JSON.stringify({ success: true, sent: 0, errors: [], total: suppliers.length, links }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find user's connected WhatsApp instance
    const { data: connection, error: connError } = await supabase
      .from('whatsapp_connections')
      .select('instance_name, connection_status')
      .eq('user_id', user.id)
      .eq('connection_status', 'open')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (connError || !connection) {
      return new Response(
        JSON.stringify({
          error: 'Nenhuma conexão WhatsApp ativa encontrada. Conecte o WhatsApp nas configurações antes de enviar cotações.',
          code: 'NO_WHATSAPP_CONNECTION'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')


    if (!evolutionApiUrl || !evolutionApiKey) {
      console.error("Evolution não configurado");
      return new Response(
        JSON.stringify({ error: "WhatsApp não está configurado no servidor. Solicite ativação ao suporte.", code: "evolution_not_configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!evolutionApiUrl || !evolutionApiKey) {
      return new Response(
        JSON.stringify({ error: 'Configuração da Evolution API não encontrada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const instanceName = connection.instance_name
    const sent: string[] = []
    const errors: { supplierId: string; phone: string; error: string }[] = []

    // Send message to each supplier
    for (const supplier of suppliers) {
      const { supplierId, phone, message } = supplier

      if (!phone) {
        errors.push({ supplierId, phone: phone || '', error: 'Telefone ausente' })
        continue
      }

      // Gera/pega o link público do fornecedor para esta cotação.
      const url = await ensureLinkUrl(supplierId)
      if (!url) {
        errors.push({ supplierId, phone, error: 'Falha ao gerar link do orçamento' })
        continue
      }
      links.push({ supplierId, name: supplier.name, url })

      // A mensagem passa a apontar para o formulário (não pede mais preços no texto).
      const baseMessage = (message && String(message).trim())
        ? String(message).trim()
        : 'Olá! Segue nossa solicitação de cotação.'
      const fullMessage = `${baseMessage}\n\n👉 *Preencha seu orçamento aqui:*\n${url}`

      // Format phone: digits only + ensure Brazil country code (55)
      let formattedPhone = phone.replace(/\D/g, '')
      if (!formattedPhone.startsWith('55') && formattedPhone.length >= 10) {
        formattedPhone = '55' + formattedPhone
      }

      try {
        const response = await fetch(
          `${evolutionApiUrl}/message/sendText/${instanceName}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': evolutionApiKey,
            },
            body: JSON.stringify({
              number: formattedPhone,
              text: fullMessage,
            }),
          }
        )

        const responseText = await response.text()

        if (!response.ok) {
          console.error(`Error sending to ${formattedPhone}:`, responseText)
          errors.push({ supplierId, phone: formattedPhone, error: `API error: ${response.status}` })
        } else {
          console.log(`Message sent to ${formattedPhone}`)
          sent.push(supplierId)
        }
      } catch (err) {
        console.error(`Exception sending to ${formattedPhone}:`, err)
        errors.push({ supplierId, phone: formattedPhone, error: String(err) })
      }
    }

    // Marca sent_at nos vínculos enviados (link) e nos itens (compat).
    if (sent.length > 0) {
      await supabase
        .from('pdv_quotation_supplier_links')
        .update({ sent_at: new Date().toISOString() })
        .eq('quotation_request_id', quotationId)
        .in('supplier_id', sent)

      if (itemIds && itemIds.length > 0) {
        const { error: updateError } = await supabase
          .from('pdv_quotation_item_suppliers')
          .update({ sent_at: new Date().toISOString() })
          .in('quotation_item_id', itemIds)
          .in('supplier_id', sent)
        if (updateError) console.error('Error updating sent_at:', updateError)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: sent.length,
        errors,
        total: suppliers.length,
        links,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-quotation-whatsapp:', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
