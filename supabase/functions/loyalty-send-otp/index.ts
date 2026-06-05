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
    const { slug, phone } = await req.json();
    if (!slug || !phone) {
      return new Response(JSON.stringify({ error: 'slug e phone obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return new Response(JSON.stringify({ error: 'Telefone inválido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Resolver tenant
    const { data: ownerId } = await supabase.rpc('resolve_business_slug', { _slug: slug });
    if (!ownerId) {
      return new Response(JSON.stringify({ error: 'Estabelecimento não encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get/create customer
    const { data: existing } = await supabase
      .from('delivery_customers')
      .select('id')
      .eq('user_id', ownerId)
      .eq('phone', cleanPhone)
      .maybeSingle();

    let customerId = existing?.id;
    if (!customerId) {
      const { data: created, error: createErr } = await supabase
        .from('delivery_customers')
        .insert({ user_id: ownerId, phone: cleanPhone, name: 'Cliente' })
        .select('id')
        .single();
      if (createErr) throw createErr;
      customerId = created.id;
    }

    // Rate-limit: 1 código por 60s
    const { data: recent } = await supabase
      .from('delivery_customer_otp_sessions')
      .select('last_sent_at')
      .eq('user_id', ownerId)
      .eq('phone', cleanPhone)
      .order('last_sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent?.last_sent_at) {
      const diff = Date.now() - new Date(recent.last_sent_at).getTime();
      if (diff < 60_000) {
        return new Response(
          JSON.stringify({ error: `Aguarde ${Math.ceil((60_000 - diff) / 1000)}s para reenviar` }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await sha256Hex(`${ownerId}:${cleanPhone}:${code}`);
    const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabase.from('delivery_customer_otp_sessions').insert({
      user_id: ownerId,
      customer_id: customerId,
      phone: cleanPhone,
      code_hash: codeHash,
      code_expires_at: codeExpiresAt,
    });

    // Buscar conexão WhatsApp do restaurante
    const { data: conn } = await supabase
      .from('whatsapp_connections')
      .select('instance_name')
      .eq('user_id', ownerId)
      .eq('connection_status', 'open')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instance = conn?.instance_name;

    if (evolutionUrl && evolutionKey && instance) {
      const messageText = `Seu código de acesso aos pontos de fidelidade: *${code}*\n\nVálido por 10 minutos. Se não foi você, ignore esta mensagem.`;
      const resp = await fetch(`${evolutionUrl}/message/sendText/${instance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
        body: JSON.stringify({ number: cleanPhone, text: messageText }),
      });
      if (!resp.ok) {
        console.error('Falha ao enviar WhatsApp:', await resp.text());
      }
    } else {
      console.warn('WhatsApp não configurado para tenant', ownerId, '— código:', code);
    }

    return new Response(
      JSON.stringify({ success: true, expiresAt: codeExpiresAt, sent_via: instance ? 'whatsapp' : 'none' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('loyalty-send-otp error:', err);
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
