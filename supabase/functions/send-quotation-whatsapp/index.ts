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

    const { quotationId, suppliers, itemIds } = await req.json()

    if (!suppliers || !Array.isArray(suppliers) || suppliers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Lista de fornecedores é obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

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

      if (!phone || !message) {
        errors.push({ supplierId, phone: phone || '', error: 'Telefone ou mensagem ausente' })
        continue
      }

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
              text: message,
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

    // Update sent_at for successfully sent suppliers
    if (sent.length > 0 && itemIds && itemIds.length > 0) {
      const { error: updateError } = await supabase
        .from('pdv_quotation_item_suppliers')
        .update({ sent_at: new Date().toISOString() })
        .in('quotation_item_id', itemIds)
        .in('supplier_id', sent)

      if (updateError) {
        console.error('Error updating sent_at:', updateError)
      }
    }

    // Auto-registra o webhook da instância usada na Evolution API (suporte multi-loja)
    // Garante que respostas dos fornecedores cheguem corretamente ao whatsapp-transactions
    if (sent.length > 0) {
      try {
        const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-transactions`
        const webhookResponse = await fetch(
          `${evolutionApiUrl}/webhook/set/${instanceName}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': evolutionApiKey,
            },
            body: JSON.stringify({
              webhook: {
                url: webhookUrl,
                events: ['MESSAGES_UPSERT'],
                enabled: true,
                webhookByEvents: false,
              }
            }),
          }
        )
        if (webhookResponse.ok) {
          console.log(`✅ Webhook registrado para instância "${instanceName}": ${webhookUrl}`)
        } else {
          const errText = await webhookResponse.text()
          console.warn(`⚠️ Falha ao registrar webhook para "${instanceName}": ${errText}`)
        }
      } catch (webhookErr) {
        // Não bloqueia o fluxo principal se o registro do webhook falhar
        console.warn('⚠️ Erro ao registrar webhook (não crítico):', webhookErr)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: sent.length,
        errors,
        total: suppliers.length,
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
