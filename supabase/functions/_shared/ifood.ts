// iFood · cliente compartilhado (autenticação centralizada + API + log)
//
// Espelha o desenho de _shared/deliverymuch.ts, a única integração de
// marketplace deste projeto que comprovadamente roda.
//
// MODELO CENTRALIZADO, confirmado contra a API real em 07/08/2026:
//   · POST /oauth/token com grantType=client_credentials → aceito
//   · POST /oauth/userCode → "Grant type not authorized for client"
// Ou seja, o token é da APLICAÇÃO e vale para todas as lojas vinculadas ao
// app, de todos os clientes. Não existe token por loja nem refresh token: o
// token é simplesmente pedido de novo quando expira.
//
// A implementação anterior (ifood-oauth, out/2025) errava em dois pontos que
// este módulo existe para não repetir:
//   1. Montava o corpo em snake_case. Provado contra a API: mandando
//      grant_type, o iFood responde "Invalid grant type null". Ele lê
//      grantType. A resposta também é camelCase (accessToken, expiresIn).
//   2. Guardava o token em pdv_settings, que tem RLS "auth.uid() = user_id"
//      para ALL sem recorte de coluna · o browser do cliente lia o próprio
//      token com a chave anon.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

/** Host único. Ao contrário da DeliveryMuch, o iFood não tem sandbox separado:
 *  a homologação roda contra lojas de teste na mesma API. */
export const IFOOD_API = "https://merchant-api.ifood.com.br";

/** Pede um token novo quando falta menos que isso para expirar. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/** Origem gravada em delivery_orders.source. */
export const IFOOD_SOURCE = "ifood";

export class IfoodError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus = 400,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/**
 * Credenciais da APLICAÇÃO (Velara). No modelo centralizado é o único par que
 * existe: as lojas não têm credencial própria, elas são vinculadas ao app.
 */
export function ifAppCredentials() {
  const clientId = Deno.env.get("IFOOD_CLIENT_ID");
  const clientSecret = Deno.env.get("IFOOD_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new IfoodError(
      "Credenciais da aplicação iFood não configuradas pelo administrador.",
      "app_credentials_missing",
      503,
    );
  }
  return { clientId, clientSecret };
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Autenticação · client_credentials
// ─────────────────────────────────────────────────────────────────────────────

interface IfoodTokenResponse {
  accessToken: string;
  expiresIn?: number;
  type?: string;
}

/**
 * Pede um token novo ao iFood.
 *
 * Todos os campos em camelCase. Foi exatamente aqui que a implementação
 * anterior errou, e o erro é silencioso do lado de quem chama: o iFood
 * responde 400 "Invalid grant type null" porque não enxerga grant_type.
 */
export async function ifClientCredentialsGrant(): Promise<IfoodTokenResponse> {
  const { clientId, clientSecret } = ifAppCredentials();

  const res = await fetch(`${IFOOD_API}/authentication/v1.0/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grantType: "client_credentials",
      clientId,
      clientSecret,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    let description = text;
    let code = "auth_failed";
    try {
      const parsed = JSON.parse(text);
      description = parsed.error?.message ?? parsed.message ?? text;
      // 403 "No permissions granted to client" = o app existe mas nenhum
      // módulo foi liberado ainda. É passo de portal, não de código, e a
      // mensagem precisa dizer isso para ninguém sair caçando bug.
      if (/no permissions granted/i.test(description)) {
        code = "no_module_access";
        description =
          "O aplicativo iFood não tem módulos liberados. Solicite acesso aos módulos no Portal do Desenvolvedor.";
      }
    } catch { /* corpo não-JSON, usa o texto cru */ }
    throw new IfoodError(description, code, res.status === 401 ? 401 : 400, { raw: text });
  }

  return JSON.parse(text) as IfoodTokenResponse;
}

/**
 * Devolve um accessToken válido da aplicação, do cache quando possível.
 *
 * O token é um só para a plataforma inteira, então ele vive numa linha única
 * em ifood_app_token. Sem cache, cada tenant do sweep pediria um token novo e
 * a gente bateria em rate limit por conta própria.
 */
export async function ifAppToken(supabase: SupabaseClient): Promise<string> {
  const { data: row } = await supabase
    .from("ifood_app_token")
    .select("access_token, token_expires_at")
    .eq("id", true)
    .maybeSingle();

  const expiresAt = row?.token_expires_at ? Date.parse(row.token_expires_at) : 0;
  if (row?.access_token && expiresAt - Date.now() > REFRESH_SKEW_MS) {
    return row.access_token;
  }

  const token = await ifClientCredentialsGrant();
  const newExpiry = new Date(Date.now() + (token.expiresIn ?? 3600) * 1000).toISOString();

  const { error } = await supabase.from("ifood_app_token").upsert({
    id: true,
    access_token: token.accessToken,
    token_expires_at: newExpiry,
    last_error: null,
    last_error_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw error;

  return token.accessToken;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chamadas à API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nunca lança por status: devolve `{ status, body }` para quem chama decidir.
 *
 * Isso importa mais no iFood do que na DeliveryMuch: quase todo endpoint de
 * ação do módulo Order responde **202 Accepted**, não 200. A ação foi aceita,
 * não aplicada · a confirmação verdadeira chega no próximo evento do polling.
 * Um `if (status === 200)` reprovaria a homologação inteira.
 */
export async function ifApi(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${IFOOD_API}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch { /* mantém o texto cru */ }

  return { status: res.status, body };
}

/** 2xx amplo. Ver o comentário de ifApi sobre o 202. */
export function ifOk(status: number): boolean {
  return status >= 200 && status < 300;
}

// ─────────────────────────────────────────────────────────────────────────────
// Log e erro visível na tela
// ─────────────────────────────────────────────────────────────────────────────

export async function ifLog(
  supabase: SupabaseClient,
  userId: string | null,
  action: string,
  status: "ok" | "error",
  extra: { httpStatus?: number; message?: string; details?: unknown } = {},
) {
  await supabase.from("pdv_ifood_sync_logs").insert({
    user_id: userId,
    sync_type: action,
    status,
    http_status: extra.httpStatus ?? null,
    error_message: extra.message ? String(extra.message).slice(0, 2000) : null,
    details: extra.details ?? null,
  });
}

export async function ifSetError(supabase: SupabaseClient, userId: string, message: string) {
  await supabase
    .from("pdv_settings")
    .update({ ifood_last_error: message.slice(0, 2000), ifood_last_error_at: new Date().toISOString() })
    .eq("user_id", userId);
}

export async function ifClearError(supabase: SupabaseClient, userId: string) {
  await supabase
    .from("pdv_settings")
    .update({ ifood_last_error: null, ifood_last_error_at: null })
    .eq("user_id", userId);
}

/** Erro de plataforma (não de uma loja): falha de token, de polling. */
export async function ifSetAppError(supabase: SupabaseClient, message: string) {
  await supabase.from("ifood_app_token").upsert({
    id: true,
    last_error: message.slice(0, 2000),
    last_error_at: new Date().toISOString(),
  }, { onConflict: "id" });
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────────────────────

export const ifCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function ifJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...ifCors, "Content-Type": "application/json" },
  });
}

/** Resolve o usuário autenticado a partir do JWT do Supabase. */
export async function ifRequireUser(supabase: SupabaseClient, req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new IfoodError("No authorization header", "unauthorized", 401);

  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !user) throw new IfoodError("Unauthorized", "unauthorized", 401);
  return user;
}

/**
 * Leitura tolerante de caminho aninhado, com fallback entre nomes alternativos.
 * A DeliveryMuch tem o mesmo helper (deliverymuch-orders.ts:61) e ele existe
 * pelo mesmo motivo: mapeamento escrito contra documentação, sem payload real,
 * erra. Aqui serve para casos como `scheduled` vs `schedule`.
 */
export function pick(obj: unknown, paths: string[], fallback: unknown = null): unknown {
  for (const path of paths) {
    let cur: unknown = obj;
    let ok = true;
    for (const part of path.split(".")) {
      if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[part];
      } else {
        ok = false;
        break;
      }
    }
    if (ok && cur !== undefined && cur !== null) return cur;
  }
  return fallback;
}
