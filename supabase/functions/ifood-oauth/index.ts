import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get('IFOOD_CLIENT_ID');
    const clientSecret = Deno.env.get('IFOOD_CLIENT_SECRET');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'No authorization header' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const { action, code } = body;

    if (action === 'disconnect') {
      const { error: updateError } = await supabase
        .from('pdv_settings')
        .update({
          ifood_enabled: false,
          ifood_access_token: null,
          ifood_refresh_token: null,
          ifood_token_expires_at: null,
        })
        .eq('user_id', user.id);
      if (updateError) throw updateError;

      await supabase.from('pdv_ifood_sync_logs').insert({
        user_id: user.id,
        sync_type: 'oauth_disconnection',
        status: 'success',
      });

      return json({ success: true });
    }

    // As demais ações exigem as credenciais do app iFood (gerenciadas pelo admin)
    if (!clientId || !clientSecret) {
      return json(
        { error: 'Integração iFood não configurada pelo administrador', code: 'ifood_not_configured' },
        503,
      );
    }

    if (action === 'exchange_code') {
      const tokenResponse = await fetch('https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        console.error('iFood token exchange error:', errorData);
        return json({ error: `Failed to exchange code: ${errorData}` }, 400);
      }

      const tokenData = await tokenResponse.json();

      const merchantResponse = await fetch('https://merchant-api.ifood.com.br/merchant/v1.0/merchants', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
      });
      const merchantData = await merchantResponse.json();
      const merchantId = merchantData[0]?.id || null;

      const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

      const { error: updateError } = await supabase
        .from('pdv_settings')
        .update({
          ifood_merchant_id: merchantId,
          ifood_access_token: tokenData.access_token,
          ifood_refresh_token: tokenData.refresh_token,
          ifood_token_expires_at: expiresAt,
          ifood_enabled: true,
        })
        .eq('user_id', user.id);
      if (updateError) throw updateError;

      await supabase.from('pdv_ifood_sync_logs').insert({
        user_id: user.id,
        sync_type: 'oauth_connection',
        status: 'success',
        details: { merchant_id: merchantId },
      });

      return json({ success: true, merchantId });
    }

    if (action === 'refresh_token') {
      const { data: settings } = await supabase
        .from('pdv_settings')
        .select('ifood_refresh_token')
        .eq('user_id', user.id)
        .single();
      if (!settings?.ifood_refresh_token) return json({ error: 'No refresh token available' }, 400);

      const tokenResponse = await fetch('https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: settings.ifood_refresh_token,
        }),
      });
      if (!tokenResponse.ok) return json({ error: 'Failed to refresh token' }, 400);

      const tokenData = await tokenResponse.json();
      const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

      const { error: updateError } = await supabase
        .from('pdv_settings')
        .update({
          ifood_access_token: tokenData.access_token,
          ifood_refresh_token: tokenData.refresh_token,
          ifood_token_expires_at: expiresAt,
        })
        .eq('user_id', user.id);
      if (updateError) throw updateError;

      return json({ success: true });
    }

    return json({ error: 'Invalid action' }, 400);
  } catch (error) {
    console.error('Error in ifood-oauth:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: errorMessage }, 500);
  }
});
