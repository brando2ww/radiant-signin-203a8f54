// DeliveryMuch · cliente compartilhado (auth OAuth2 + chamadas à API + log)
//
// Tudo aqui foi verificado contra o sandbox real (api.devmuch.io) em 30/07/2026.
// Os pontos não óbvios estão comentados porque a versão anterior deste módulo
// errou exatamente neles.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

export type DmEnv = "dev" | "prod";

/** Namespace da claim customizada do Auth0 que carrega as lojas do login. */
const DM_CLAIMS_NS = "https://deliverymuch.com.br/user_claims";

/** Renova o token quando falta menos que isso para expirar. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

export class DmError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus = 400,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function dmUrls(env: DmEnv) {
  return env === "prod"
    ? { authUrl: "https://auth.deliverymuch.com.br/oauth/token", apiUrl: "https://api.deliverymuch.com.br" }
    : { authUrl: "https://devmuch-api.auth0.com/oauth/token", apiUrl: "https://api.devmuch.io" };
}

/**
 * Credenciais da APLICAÇÃO (Velara), não da loja. Dev e produção usam pares
 * diferentes, então cada ambiente tem seu secret.
 */
export function dmAppCredentials(env: DmEnv) {
  const prefix = env === "prod" ? "DELIVERYMUCH_PROD" : "DELIVERYMUCH_DEV";
  const clientId = Deno.env.get(`${prefix}_CLIENT_ID`) ?? Deno.env.get("DELIVERYMUCH_CLIENT_ID");
  const clientSecret = Deno.env.get(`${prefix}_CLIENT_SECRET`) ?? Deno.env.get("DELIVERYMUCH_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new DmError(
      `Credenciais da aplicação DeliveryMuch não configuradas para o ambiente "${env}".`,
      "app_credentials_missing",
      503,
    );
  }
  return { clientId, clientSecret };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const raw = token.split(".")[1];
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(raw.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return {};
  }
}

/**
 * As lojas vêm em `user_claims.companies`, que é um ARRAY: um mesmo login pode
 * administrar mais de uma unidade. Nunca use `sub` como fallback, ele é o id do
 * usuário no Auth0 e a API rejeita.
 */
export function dmExtractCompanies(accessToken: string): string[] {
  const claims = decodeJwtPayload(accessToken);
  const userClaims = claims[DM_CLAIMS_NS] as { companies?: unknown } | undefined;
  const companies = userClaims?.companies;
  if (!Array.isArray(companies)) return [];
  return companies.filter((c): c is string => typeof c === "string" && c.length > 0);
}

interface DmTokenResponse {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  expires_in?: number;
  token_type?: string;
}

async function requestToken(authUrl: string, body: URLSearchParams): Promise<DmTokenResponse> {
  const res = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    let description = text;
    try {
      description = JSON.parse(text).error_description ?? text;
    } catch { /* corpo não-JSON, usa o texto cru */ }
    throw new DmError(description, "auth_failed", res.status === 401 ? 401 : 400, { raw: text });
  }
  return JSON.parse(text) as DmTokenResponse;
}

/**
 * Resource Owner Password Grant.
 *
 * ATENÇÃO: não envie `audience`. O Auth0 deles responde 400 "invalid audience
 * specified for password grant exchange" quando o parâmetro é enviado, mesmo
 * com o valor que aparece no `aud` do token emitido. O client já tem audience
 * padrão configurada do lado deles.
 *
 * `scope=offline_access` é o que faz vir o refresh_token · sem ele a conexão
 * morre em 1 hora e a loja para de receber pedido sem ninguém perceber.
 */
export function dmPasswordGrant(env: DmEnv, username: string, password: string) {
  const { authUrl } = dmUrls(env);
  const { clientId, clientSecret } = dmAppCredentials(env);
  return requestToken(
    authUrl,
    new URLSearchParams({
      grant_type: "password",
      username,
      password,
      client_id: clientId,
      client_secret: clientSecret,
      scope: "offline_access",
    }),
  );
}

export function dmRefreshGrant(env: DmEnv, refreshToken: string) {
  const { authUrl } = dmUrls(env);
  const { clientId, clientSecret } = dmAppCredentials(env);
  return requestToken(
    authUrl,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  );
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function dmLog(
  supabase: SupabaseClient,
  userId: string,
  action: string,
  status: "ok" | "error",
  extra: { httpStatus?: number; message?: string; details?: unknown } = {},
) {
  await supabase.from("deliverymuch_sync_log").insert({
    user_id: userId,
    action,
    status,
    http_status: extra.httpStatus ?? null,
    message: extra.message ? String(extra.message).slice(0, 2000) : null,
    details: extra.details ?? null,
  });
}

export interface DmStoredCredentials {
  username: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scope: string | null;
}

export async function dmSaveTokens(
  supabase: SupabaseClient,
  userId: string,
  username: string,
  token: DmTokenResponse,
) {
  // expires_in real do sandbox é 3600, não 86400. Sempre usar o que veio.
  const expiresAt = new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString();

  const { error } = await supabase.from("deliverymuch_credentials").upsert({
    user_id: userId,
    username,
    access_token: token.access_token,
    // no refresh_token grant a resposta pode não repetir o refresh_token
    ...(token.refresh_token ? { refresh_token: token.refresh_token } : {}),
    token_expires_at: expiresAt,
    scope: token.scope ?? null,
    claims: decodeJwtPayload(token.access_token),
  }, { onConflict: "user_id" });

  if (error) throw error;
  return expiresAt;
}

/**
 * Devolve um access_token válido, renovando pelo refresh_token quando necessário.
 * Se não há como renovar, lança `reauth_required` · a loja precisa logar de novo.
 */
export async function dmValidToken(
  supabase: SupabaseClient,
  userId: string,
  env: DmEnv,
): Promise<string> {
  const { data: cred } = await supabase
    .from("deliverymuch_credentials")
    .select("username, access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!cred?.access_token) {
    throw new DmError("Integração DeliveryMuch não conectada.", "not_connected", 400);
  }

  const expiresAt = cred.token_expires_at ? Date.parse(cred.token_expires_at) : 0;
  if (expiresAt - Date.now() > REFRESH_SKEW_MS) return cred.access_token;

  if (!cred.refresh_token) {
    throw new DmError(
      "A sessão com a DeliveryMuch expirou. Conecte a loja novamente.",
      "reauth_required",
      401,
    );
  }

  try {
    const token = await dmRefreshGrant(env, cred.refresh_token);
    await dmSaveTokens(supabase, userId, cred.username, token);
    await dmLog(supabase, userId, "refresh_token", "ok");
    return token.access_token;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await dmLog(supabase, userId, "refresh_token", "error", { message });
    await supabase
      .from("pdv_settings")
      .update({ deliverymuch_last_error: `Falha ao renovar sessão: ${message}`, deliverymuch_last_error_at: new Date().toISOString() })
      .eq("user_id", userId);
    throw new DmError(
      "Não foi possível renovar a sessão com a DeliveryMuch. Conecte a loja novamente.",
      "reauth_required",
      401,
    );
  }
}

export async function dmApi(
  accessToken: string,
  env: DmEnv,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const { apiUrl } = dmUrls(env);
  const res = await fetch(`${apiUrl}${path}`, {
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

export const dmCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function dmJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...dmCors, "Content-Type": "application/json" },
  });
}

/** Resolve o usuário autenticado a partir do JWT do Supabase. */
export async function dmRequireUser(supabase: SupabaseClient, req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new DmError("No authorization header", "unauthorized", 401);

  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !user) throw new DmError("Unauthorized", "unauthorized", 401);
  return user;
}

export async function dmTenantEnv(supabase: SupabaseClient, userId: string): Promise<DmEnv> {
  const { data } = await supabase
    .from("pdv_settings")
    .select("deliverymuch_env")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.deliverymuch_env === "prod" ? "prod" : "dev") as DmEnv;
}
