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

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Busca a instância conectada do usuário
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
          error: 'Nenhuma conexão WhatsApp ativa encontrada.',
          code: 'NO_WHATSAPP_CONNECTION'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const instanceName = connection.instance_name
    const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-transactions`

    console.log(`🔧 Registrando webhook para instância "${instanceName}": ${webhookUrl}`)

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

    const responseText = await webhookResponse.text()

    if (!webhookResponse.ok) {
      console.error(`❌ Falha ao registrar webhook para "${instanceName}": ${responseText}`)
      return new Response(
        JSON.stringify({
          error: `Falha ao registrar webhook na Evolution API: ${webhookResponse.status}`,
          details: responseText
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ Webhook registrado com sucesso para instância "${instanceName}"`)

    return new Response(
      JSON.stringify({
        success: true,
        instanceName,
        webhookUrl,
        message: `Webhook registrado com sucesso para a instância "${instanceName}"`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in register-whatsapp-webhook:', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
