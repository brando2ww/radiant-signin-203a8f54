import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { userId } = await req.json()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Find verified WhatsApp number for user
    const { data: verification, error: verificationError } = await supabase
      .from('whatsapp_verifications')
      .select('phone_number')
      .eq('user_id', userId)
      .eq('is_verified', true)
      .order('verified_at', { ascending: false })
      .limit(1)
      .single()

    if (verificationError || !verification) {
      console.error('No verified WhatsApp found:', verificationError)
      return new Response(
        JSON.stringify({ error: 'Nenhum WhatsApp verificado encontrado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const phoneNumber = verification.phone_number

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Delete any existing unused codes for this user
    await supabase
      .from('two_factor_codes')
      .delete()
      .eq('user_id', userId)
      .is('used_at', null)

    // Insert new 2FA code
    const { error: insertError } = await supabase
      .from('two_factor_codes')
      .insert({
        user_id: userId,
        code,
        expires_at: expiresAt.toISOString(),
      })

    if (insertError) {
      console.error('Error inserting 2FA code:', insertError)
      return new Response(
        JSON.stringify({ error: 'Erro ao gerar código 2FA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send via Evolution API
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')

    if (!evolutionApiUrl || !evolutionApiKey) {
      console.error("Evolution não configurado");
      return new Response(
        JSON.stringify({ error: "WhatsApp não está configurado no servidor. Solicite ativação ao suporte.", code: "evolution_not_configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const evolutionInstanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME')

    if (!evolutionApiUrl || !evolutionApiKey || !evolutionInstanceName) {
      console.error('Evolution API credentials not configured')
      return new Response(
        JSON.stringify({ error: 'Serviço de mensagens não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const message = `🔐 *Código de Verificação 2FA*

Seu código de autenticação é: *${code}*

⚠️ Este código expira em 10 minutos.
🚫 Não compartilhe com ninguém.

_Velara - Sua plataforma financeira_`

    const sendMessageUrl = `${evolutionApiUrl}/message/sendText/${evolutionInstanceName}`
    
    const messageResponse = await fetch(sendMessageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({
        number: `55${phoneNumber}`,
        text: message,
      }),
    })

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text()
      console.error('Error sending WhatsApp message:', errorText)
      return new Response(
        JSON.stringify({ error: 'Erro ao enviar código via WhatsApp' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`2FA code sent to ${phoneNumber} for user ${userId}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Código 2FA enviado',
        expiresAt: expiresAt.toISOString(),
        phoneLastDigits: phoneNumber.slice(-4),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-2fa-code:', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
