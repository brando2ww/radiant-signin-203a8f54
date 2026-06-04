// _shared/evolution-config.ts — guard comum para edge functions que dependem
// das envs EVOLUTION_API_URL e EVOLUTION_API_KEY. Retorne o Response para o
// caller se a configuração estiver ausente.
export const evolutionCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function getEvolutionConfig():
  | { ok: true; url: string; key: string }
  | { ok: false; response: Response } {
  const url = Deno.env.get('EVOLUTION_API_URL');
  const key = Deno.env.get('EVOLUTION_API_KEY');
  if (!url || !key) {
    console.error('Evolution API não configurado (EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes)');
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: 'WhatsApp não está configurado no servidor. Solicite ativação ao suporte.',
          code: 'evolution_not_configured',
        }),
        {
          status: 503,
          headers: { ...evolutionCors, 'Content-Type': 'application/json' },
        },
      ),
    };
  }
  return { ok: true, url, key };
}
