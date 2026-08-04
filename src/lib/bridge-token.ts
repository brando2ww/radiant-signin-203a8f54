import { supabase } from "@/integrations/supabase/client";

/**
 * Token local da Print Bridge.
 *
 * A partir da versão 2.0 a ponte exige `X-Bridge-Token` em /test-print e
 * /reprint. Antes ela respondia a qualquer origem (`Access-Control-Allow-Origin: *`
 * com Private Network Access ligado), ou seja: qualquer página aberta no
 * navegador do caixa conseguia disparar cupom na cozinha.
 *
 * O token é publicado pela própria ponte no heartbeat e só é legível por quem
 * está autenticado no estabelecimento (RLS de pdv_print_bridge_status).
 */
let cache: { token: string | null; at: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function getBridgeToken(): Promise<string | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.token;

  try {
    const { data, error } = await (supabase as any)
      .from("pdv_print_bridge_status")
      .select("panel_token, last_seen_at")
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // Banco ainda sem a tabela (migration não aplicada) ou nenhuma ponte 2.x
    // reportando: seguimos sem token. A ponte 1.x não exige nada.
    if (error) throw error;
    cache = { token: data?.panel_token ?? null, at: Date.now() };
  } catch {
    cache = { token: null, at: Date.now() };
  }
  return cache.token;
}

/** Cabeçalhos para chamar a ponte local. */
export async function bridgeHeaders(): Promise<Record<string, string>> {
  const token = await getBridgeToken();
  return token
    ? { "Content-Type": "application/json", "X-Bridge-Token": token }
    : { "Content-Type": "application/json" };
}
