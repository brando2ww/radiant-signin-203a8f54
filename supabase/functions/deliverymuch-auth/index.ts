// DeliveryMuch · conexão da loja (por tenant)
//
// Ações: connect · select_company · status · test_connection · disconnect
//
// O que NÃO está aqui de propósito: toggle_online e set_delivery_time. As rotas
// dessas operações vêm na coleção Postman que a DeliveryMuch envia junto com as
// credenciais, e essa coleção ainda não chegou. A versão anterior deste arquivo
// chutava caminhos `/v2/...` que respondem 404 na API real. Enquanto a
// documentação não chega, as ações devolvem `route_pending_docs` e o front
// desabilita os botões, em vez de fingir que funcionam.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import {
  DmError,
  dmApi,
  dmCors,
  dmExtractCompanies,
  dmJson,
  dmLog,
  dmPasswordGrant,
  dmRequireUser,
  dmSaveTokens,
  dmTenantEnv,
  dmValidToken,
  serviceClient,
} from "../_shared/deliverymuch.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: dmCors });
  }

  const supabase = serviceClient();
  let userId: string | null = null;

  try {
    const user = await dmRequireUser(supabase, req);
    userId = user.id;

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;
    const env = await dmTenantEnv(supabase, user.id);

    switch (action) {
      // ── connect ───────────────────────────────────────────────────────────
      case "connect": {
        const username = String(body.username ?? "").trim();
        const password = String(body.password ?? "");
        if (!username || !password) {
          throw new DmError("Informe usuário e senha da loja.", "missing_credentials", 400);
        }

        const token = await dmPasswordGrant(env, username, password);
        const companies = dmExtractCompanies(token.access_token);

        if (companies.length === 0) {
          await dmLog(supabase, user.id, "connect", "error", {
            message: "Login aceito mas nenhuma loja veio nas claims do token.",
          });
          throw new DmError(
            "Login aceito, mas nenhuma loja está vinculada a este usuário na DeliveryMuch. Confirme o cadastro com o representante local.",
            "no_companies",
            400,
          );
        }

        await dmSaveTokens(supabase, user.id, username, token);

        // Um login pode administrar várias unidades. Só vincula sozinho quando
        // não há ambiguidade; com mais de uma, o operador escolhe na tela.
        const single = companies.length === 1 ? companies[0] : null;

        const { data: updated, error } = await supabase
          .from("pdv_settings")
          .update({
            deliverymuch_username: username,
            deliverymuch_companies: companies,
            deliverymuch_company_uuid: single,
            deliverymuch_enabled: single !== null,
            deliverymuch_connected_at: new Date().toISOString(),
            deliverymuch_last_error: null,
            deliverymuch_last_error_at: null,
          })
          .eq("user_id", user.id)
          .select("user_id");
        if (error) throw error;

        // update sem linha afetada retornaria "sucesso" com nada salvo
        if (!updated || updated.length === 0) {
          throw new DmError(
            "Este estabelecimento ainda não tem configurações de PDV criadas.",
            "settings_missing",
            400,
          );
        }

        await dmLog(supabase, user.id, "connect", "ok", {
          message: `Conectado como ${username} · ${companies.length} loja(s)`,
          details: { companies },
        });

        return dmJson({
          success: true,
          companies,
          company_uuid: single,
          needs_company_selection: single === null,
          scope: token.scope ?? null,
        });
      }

      // ── select_company ────────────────────────────────────────────────────
      case "select_company": {
        const companyUuid = String(body.company_uuid ?? "");
        const { data: settings } = await supabase
          .from("pdv_settings")
          .select("deliverymuch_companies")
          .eq("user_id", user.id)
          .maybeSingle();

        const available = (settings?.deliverymuch_companies ?? []) as string[];
        if (!available.includes(companyUuid)) {
          throw new DmError("Esta loja não pertence ao login conectado.", "invalid_company", 400);
        }

        const { error } = await supabase
          .from("pdv_settings")
          .update({ deliverymuch_company_uuid: companyUuid, deliverymuch_enabled: true })
          .eq("user_id", user.id);
        if (error) throw error;

        await dmLog(supabase, user.id, "select_company", "ok", { details: { companyUuid } });
        return dmJson({ success: true, company_uuid: companyUuid });
      }

      // ── status ────────────────────────────────────────────────────────────
      // Saúde da conexão sem jamais devolver o token para o browser.
      case "status": {
        const { data: cred } = await supabase
          .from("deliverymuch_credentials")
          .select("username, token_expires_at, scope, refresh_token")
          .eq("user_id", user.id)
          .maybeSingle();

        return dmJson({
          connected: Boolean(cred?.username),
          username: cred?.username ?? null,
          token_expires_at: cred?.token_expires_at ?? null,
          can_auto_renew: Boolean(cred?.refresh_token),
          scope: cred?.scope ?? null,
          env,
        });
      }

      // ── test_connection ───────────────────────────────────────────────────
      case "test_connection": {
        const accessToken = await dmValidToken(supabase, user.id, env);

        const companyUuid = await requireCompany(supabase, user.id);

        const { status, body: apiBody } = await dmApi(accessToken, env, `/companies/${companyUuid}`);
        const ok = status >= 200 && status < 300;

        await supabase
          .from("pdv_settings")
          .update({
            deliverymuch_last_sync_at: new Date().toISOString(),
            ...(ok
              ? { deliverymuch_last_error: null, deliverymuch_last_error_at: null }
              : {
                deliverymuch_last_error: `API respondeu ${status}`,
                deliverymuch_last_error_at: new Date().toISOString(),
              }),
          })
          .eq("user_id", user.id);

        await dmLog(supabase, user.id, "test_connection", ok ? "ok" : "error", {
          httpStatus: status,
          message: ok ? "Autenticação válida e API respondeu." : `API respondeu ${status}`,
          details: apiBody,
        });

        return dmJson({
          success: ok,
          auth_ok: true, // chegar aqui já significa que o token é válido
          api_status: status,
          api_response: apiBody,
        });
      }

      // ── disconnect ────────────────────────────────────────────────────────
      case "disconnect": {
        await supabase.from("deliverymuch_credentials").delete().eq("user_id", user.id);

        const { error } = await supabase
          .from("pdv_settings")
          .update({
            deliverymuch_enabled: false,
            deliverymuch_username: null,
            deliverymuch_company_uuid: null,
            deliverymuch_companies: [],
            deliverymuch_connected_at: null,
            deliverymuch_last_error: null,
            deliverymuch_last_error_at: null,
          })
          .eq("user_id", user.id);
        if (error) throw error;

        await dmLog(supabase, user.id, "disconnect", "ok");
        return dmJson({ success: true });
      }

      // ── company_info ──────────────────────────────────────────────────────
      // GET /companies/{uuid} traz nome, endereço, is_online, tempos e, no
      // delivery_forms, os meios de pagamento e os cartões aceitos POR LOJA.
      case "company_info": {
        const accessToken = await dmValidToken(supabase, user.id, env);
        const companyUuid = await requireCompany(supabase, user.id);

        const { status, body: info } = await dmApi(accessToken, env, `/companies/${companyUuid}`);
        if (status < 200 || status >= 300) {
          await dmLog(supabase, user.id, "company_info", "error", { httpStatus: status, details: info });
          throw new DmError(`A DeliveryMuch respondeu ${status} ao buscar os dados da loja.`, "api_error", 502, info);
        }

        await supabase
          .from("pdv_settings")
          .update({ deliverymuch_last_sync_at: new Date().toISOString() })
          .eq("user_id", user.id);

        return dmJson({ success: true, company: info });
      }

      // ── toggle_online ─────────────────────────────────────────────────────
      // PATCH /companies/{uuid}/online | /offline · responde 204 sem corpo.
      case "toggle_online": {
        const online = Boolean(body.online);
        const accessToken = await dmValidToken(supabase, user.id, env);
        const companyUuid = await requireCompany(supabase, user.id);

        const { status, body: apiBody } = await dmApi(
          accessToken,
          env,
          `/companies/${companyUuid}/${online ? "online" : "offline"}`,
          { method: "PATCH" },
        );

        if (status < 200 || status >= 300) {
          await dmLog(supabase, user.id, "toggle_online", "error", { httpStatus: status, details: apiBody });
          throw new DmError(
            `Não foi possível ${online ? "abrir" : "fechar"} a loja: a DeliveryMuch respondeu ${status}.`,
            "api_error",
            502,
            apiBody,
          );
        }

        await dmLog(supabase, user.id, "toggle_online", "ok", {
          httpStatus: status,
          message: online ? "Loja aberta na plataforma" : "Loja fechada na plataforma",
        });

        // a plataforma leva alguns instantes para refletir a mudança
        return dmJson({ success: true, online, propagation_delay: true });
      }

      // ── set_delivery_time ─────────────────────────────────────────────────
      // PATCH /companies/{uuid} com delivery_time e/ou pickup_time.
      case "set_delivery_time": {
        const deliveryMin = Number(body.delivery_min);
        const pickupMin = Number(body.pickup_min);

        const patch: Record<string, number> = {};
        if (Number.isInteger(deliveryMin) && deliveryMin > 0) patch.delivery_time = deliveryMin;
        if (Number.isInteger(pickupMin) && pickupMin > 0) patch.pickup_time = pickupMin;

        if (Object.keys(patch).length === 0) {
          throw new DmError("Informe ao menos um tempo válido, em minutos inteiros.", "invalid_params", 400);
        }

        const accessToken = await dmValidToken(supabase, user.id, env);
        const companyUuid = await requireCompany(supabase, user.id);

        const { status, body: apiBody } = await dmApi(accessToken, env, `/companies/${companyUuid}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });

        if (status < 200 || status >= 300) {
          await dmLog(supabase, user.id, "set_delivery_time", "error", { httpStatus: status, details: apiBody });
          throw new DmError(
            `Não foi possível atualizar os tempos: a DeliveryMuch respondeu ${status}.`,
            "api_error",
            502,
            apiBody,
          );
        }

        // só espelha localmente depois que a plataforma aceitou
        await supabase
          .from("pdv_settings")
          .update({
            ...(patch.delivery_time ? { deliverymuch_delivery_time_min: patch.delivery_time } : {}),
            ...(patch.pickup_time ? { deliverymuch_pickup_time_min: patch.pickup_time } : {}),
          })
          .eq("user_id", user.id);

        await dmLog(supabase, user.id, "set_delivery_time", "ok", {
          httpStatus: status,
          message: `Tempos atualizados${patch.delivery_time ? ` · entrega ${patch.delivery_time} min` : ""}${
            patch.pickup_time ? ` · retirada ${patch.pickup_time} min` : ""
          }`,
        });

        return dmJson({ success: true, ...patch, propagation_delay: true });
      }

      default:
        throw new DmError(`Ação desconhecida: ${action}`, "unknown_action", 400);
    }
  } catch (err) {
    const isDm = err instanceof DmError;
    const message = err instanceof Error ? err.message : String(err);

    if (userId && !isDm) {
      await dmLog(supabase, userId, "unhandled", "error", { message }).catch(() => {});
    }
    if (!isDm) console.error("deliverymuch-auth error:", err);

    return dmJson(
      { error: message, code: isDm ? err.code : "internal_error" },
      isDm ? err.httpStatus : 500,
    );
  }
});

/** Toda rota de restaurante exige o UUID da loja vinculada a este tenant. */
async function requireCompany(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase
    .from("pdv_settings")
    .select("deliverymuch_company_uuid")
    .eq("user_id", userId)
    .maybeSingle();

  const companyUuid = data?.deliverymuch_company_uuid;
  if (!companyUuid) {
    throw new DmError("Selecione a loja antes de executar esta ação.", "no_company_selected", 400);
  }
  return companyUuid;
}
