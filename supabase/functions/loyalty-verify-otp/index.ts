import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { slug, phone, code } = await req.json();
    if (!slug || !phone || !code) {
      return new Response(JSON.stringify({ error: 'slug, phone e code obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanPhone = String(phone).replace(/\D/g, '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: ownerId } = await supabase.rpc('resolve_business_slug', { _slug: slug });
    if (!ownerId) {
      return new Response(JSON.stringify({ error: 'Estabelecimento não encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const codeHash = await sha256Hex(`${ownerId}:${cleanPhone}:${code}`);

    const { data: session } = await supabase
      .from('delivery_customer_otp_sessions')
      .select('*')
      .eq('user_id', ownerId)
      .eq('phone', cleanPhone)
      .eq('code_hash', codeHash)
      .is('verified_at', null)
      .gt('code_expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) {
      return new Response(JSON.stringify({ error: 'Código inválido ou expirado' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (session.attempts >= 5) {
      return new Response(JSON.stringify({ error: 'Muitas tentativas; solicite novo código' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Settings — TTL da sessão
    const { data: settings } = await supabase
      .from('delivery_loyalty_settings')
      .select('otp_session_minutes')
      .eq('user_id', ownerId)
      .maybeSingle();

    const ttlMinutes = settings?.otp_session_minutes ?? 30;
    const sessionToken = crypto.randomUUID();
    const sessionExpiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    await supabase
      .from('delivery_customer_otp_sessions')
      .update({
        verified_at: new Date().toISOString(),
        session_token: sessionToken,
        session_expires_at: sessionExpiresAt,
      })
      .eq('id', session.id);

    return new Response(
      JSON.stringify({
        success: true,
        session_token: sessionToken,
        session_expires_at: sessionExpiresAt,
        customer_id: session.customer_id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('loyalty-verify-otp error:', err);
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
