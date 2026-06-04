// whatsapp-check-config — informa se as envs do Evolution API estão presentes,
// para que a UI possa exibir alerta antes de tentar conectar.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get('EVOLUTION_API_URL');
  const key = Deno.env.get('EVOLUTION_API_KEY');
  const configured = !!(url && key);

  return new Response(JSON.stringify({ configured }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
