import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveGlobalChannel, sendText, isChannelError } from '../_shared/whatsapp/index.ts'

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

    // Canal da plataforma (número da Velara).
    const channel = resolveGlobalChannel()
    if (isChannelError(channel)) {
      return new Response(
        JSON.stringify({ error: channel.error.errorMessage, code: channel.error.errorCode }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // A checagem prévia "este número tem WhatsApp?" (POST /chat/whatsappNumbers)
    // saiu: é exclusiva do Evolution e não tem equivalente na API oficial. O
    // erro agora vem do próprio envio, que é o comportamento que vale nos dois
    // provedores.
    const messageText = `Olá! Aqui é a Velara, sua assistente financeira.

Seu código de verificação é: *${verificationCode}*

Use este código para verificar seu WhatsApp de forma segura.

Se você não solicitou este código, por favor ignore esta mensagem.

Atenciosamente,
Equipe Velara`

    const outcome = await sendText(supabase, channel, formattedPhone, messageText, {
      purpose: 'phone_verification',
      redactBody: true,
    })

    if (!outcome.ok) {
      console.error('Error sending WhatsApp message:', outcome.errorMessage)
      return new Response(
        JSON.stringify({
          error: outcome.errorCode === 'invalid_number'
            ? 'Número inválido. Verifique e tente novamente.'
            : 'Erro ao enviar mensagem no WhatsApp',
        }),
        { status: outcome.errorCode === 'invalid_number' ? 400 : 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
