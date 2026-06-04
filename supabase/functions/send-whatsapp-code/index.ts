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
    const { phoneNumber, userId } = await req.json()

    if (!phoneNumber || !userId) {
      return new Response(
        JSON.stringify({ error: 'phoneNumber e userId são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Format phone number (remove non-digits)
    const formattedPhone = phoneNumber.replace(/\D/g, '')

    // Generate 6-digit code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()

    // Set expiration to 10 minutes from now
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Delete any existing unverified codes for this user/phone
    await supabase
      .from('whatsapp_verifications')
      .delete()
      .eq('user_id', userId)
      .eq('phone_number', formattedPhone)
      .eq('is_verified', false)

    // Save verification code to database
    const { error: insertError } = await supabase
      .from('whatsapp_verifications')
      .insert({
        user_id: userId,
        phone_number: formattedPhone,
        verification_code: verificationCode,
        expires_at: expiresAt,
      })

    if (insertError) {
      console.error('Error saving verification code:', insertError)
      return new Response(
        JSON.stringify({ error: 'Erro ao salvar código de verificação' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get Evolution API credentials
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
        JSON.stringify({ error: 'Configuração da Evolution API não encontrada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar se o número é um WhatsApp válido antes de enviar
    const checkResponse = await fetch(
      `${evolutionApiUrl}/chat/whatsappNumbers/${evolutionInstanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
        body: JSON.stringify({
          numbers: [formattedPhone],
        }),
      }
    )

    if (!checkResponse.ok) {
      console.error('Error checking WhatsApp number:', await checkResponse.text())
      return new Response(
        JSON.stringify({ error: 'Erro ao verificar número do WhatsApp' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const checkResult = await checkResponse.json()
    console.log('WhatsApp check result:', JSON.stringify(checkResult))

    // Verifica se o número existe no WhatsApp
    const numberInfo = checkResult[0]
    if (!numberInfo?.exists) {
      console.log(`Number ${formattedPhone} is not registered on WhatsApp`)
      return new Response(
        JSON.stringify({ error: 'Este número não está cadastrado no WhatsApp. Verifique o número e tente novamente.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Number ${formattedPhone} verified on WhatsApp, proceeding to send message...`)

    // Send WhatsApp message via Evolution API
    const messageText = `Olá! Aqui é a Velara, sua assistente financeira.

Seu código de verificação é: *${verificationCode}*

Use este código para verificar seu WhatsApp de forma segura.

Se você não solicitou este código, por favor ignore esta mensagem.

Atenciosamente,
Equipe Velara`

    const sendMessageResponse = await fetch(
      `${evolutionApiUrl}/message/sendText/${evolutionInstanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
        body: JSON.stringify({
          number: numberInfo.jid,
          text: messageText,
        }),
      }
    )

    if (!sendMessageResponse.ok) {
      const errorText = await sendMessageResponse.text()
      console.error('Error sending WhatsApp message:', errorText)
      return new Response(
        JSON.stringify({ error: 'Erro ao enviar mensagem no WhatsApp' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Verification code ${verificationCode} sent to ${formattedPhone}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Código enviado com sucesso',
        expiresAt 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-whatsapp-code:', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
