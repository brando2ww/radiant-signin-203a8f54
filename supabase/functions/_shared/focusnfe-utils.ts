// Shared helpers for FocusNFE Edge Functions.

import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptSecret } from "./focusnfe-crypto.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function focusBaseUrl(ambiente: string) {
  return ambiente === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

export function basicAuth(token: string) {
  return `Basic ${btoa(token + ":")}`;
}

export function buildRef(userId: string, tipo: string) {
  return `${userId.replace(/-/g, "").slice(0, 8)}-${tipo}-${Date.now()}`;
}

export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function authedOwner(req: Request): Promise<
  { ownerId: string; userId: string } | Response
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const userId = data.claims.sub as string;
  const service = getServiceClient();
  const { data: ownerData } = await service.rpc("pdv_resolve_owner", {
    _user_id: userId,
  });
  return { ownerId: (ownerData as string) || userId, userId };
}

export async function getTenantToken(
  ownerId: string,
): Promise<{ token: string; ambiente: string; config: any } | { error: string }> {
  const service = getServiceClient();
  const { data: config } = await service
    .from("tenant_fiscal_config")
    .select("*")
    .eq("user_id", ownerId)
    .maybeSingle();
  if (!config) return { error: "Configuração fiscal não encontrada" };
  const ambiente = config.focusnfe_ambiente || "homologacao";
  const cifrado = ambiente === "producao"
    ? config.focusnfe_token_producao_cifrado
    : config.focusnfe_token_homologacao_cifrado;
  if (!cifrado) {
    return { error: "Empresa não cadastrada na FocusNFE. Ative a integração primeiro." };
  }
  const token = await decryptSecret(cifrado);
  return { token, ambiente, config };
}

// Dicionário mínimo de tradução de erros SEFAZ
const SEFAZ_TRANSLATIONS: Record<string, string> = {
  "204": "Duplicidade de NF-e",
  "215": "Falha no schema XML do lote",
  "228": "Data de emissão atrasada",
  "233": "Valor do ICMS difere do calculado",
  "239": "Número do documento fora da sequência",
  "297": "Assinatura difere do calculado",
  "301": "Uso denegado: irregularidade fiscal do emitente",
  "302": "Uso denegado: irregularidade fiscal do destinatário",
  "539": "Duplicidade de NF-e com chave de acesso já utilizada",
  "656": "Consumo indevido",
  "999": "Erro não catalogado",
};

export function translateSefazError(msg: string | null | undefined): string {
  if (!msg) return "Erro desconhecido";
  for (const [code, text] of Object.entries(SEFAZ_TRANSLATIONS)) {
    if (msg.includes(code)) return `${text} (${code})`;
  }
  return msg;
}
