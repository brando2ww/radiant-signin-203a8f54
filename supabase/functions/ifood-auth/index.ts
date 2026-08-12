// iFood · vinculação de loja ao tenant (modelo centralizado)
//
// Ações: available_merchants · link_merchant · unlink_merchant ·
//        select_merchant · status · test_connection
//
// No modelo centralizado não existe "conectar credencial": o token é da
// aplicação Velara e já enxerga todas as lojas vinculadas ao app no iFood. O
// que o lojista faz é autorizar a Velara no Portal do Parceiro; a partir daí a
// loja aparece em GET /merchant/v1.0/merchants.
//
// O trabalho desta function é o que o iFood NÃO faz por nós: dizer de qual
// tenant é cada loja. Sem esse de-para, o polling global entregaria pedido de
// um cliente na conta de outro.
//
// Substitui ifood-oauth, que pedia um "código de autorização" do fluxo
// distribuído · fluxo que a API recusa para este app ("Grant type not
// authorized for client", verificado em 07/08/2026).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import {
  IfoodError,
  ifApi,
  ifAppToken,
  ifClearError,
  ifCors,
  ifJson,
  ifLog,
  ifOk,
  ifRequireUser,
  ifSetError,
  serviceClient,
} from "../_shared/ifood.ts";

interface IfoodMerchant {
  id: string;
  name?: string;
  corporateName?: string;
}

/** Lojas que o app enxerga no iFood. É a lista bruta, de todos os clientes. */
async function fetchAppMerchants(accessToken: string): Promise<IfoodMerchant[]> {
  const { status, body } = await ifApi(accessToken, "/merchant/v1.0/merchants");
  if (!ifOk(status)) {
    throw new IfoodError(
      `O iFood respondeu ${status} ao listar as lojas do aplicativo.`,
      "merchants_failed",
      502,
      body,
    );
  }
  return Array.isArray(body) ? body as IfoodMerchant[] : [];
}

/** Grava garantindo que a linha exista: tenant novo pode não ter settings. */
async function saveSettings(supabase: SupabaseClient, userId: string, patch: Record<string, unknown>) {
  const { error } = await supabase
    .from("pdv_settings")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: ifCors });
  }

  const supabase = serviceClient();
  let userId: string | null = null;

  try {
    const user = await ifRequireUser(supabase, req);
    userId = user.id;

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    switch (action) {
      // ── available_merchants ───────────────────────────────────────────────
      // Lojas que o app enxerga e que ainda não pertencem a nenhum tenant,
      // mais as que já são desta conta. Loja de outro cliente não aparece:
      // seria vazamento de dado entre tenants.
      case "available_merchants": {
        const accessToken = await ifAppToken(supabase);
        const all = await fetchAppMerchants(accessToken);

        const { data: linked } = await supabase
          .from("ifood_merchants")
          .select("merchant_id, user_id");

        const owner = new Map((linked ?? []).map((m) => [m.merchant_id, m.user_id]));

        const available = all
          .filter((m) => !owner.has(m.id) || owner.get(m.id) === user.id)
          .map((m) => ({
            id: m.id,
            name: m.name ?? m.corporateName ?? m.id,
            linked: owner.get(m.id) === user.id,
          }));

        await ifLog(supabase, user.id, "available_merchants", "ok", {
          details: { visiveis: all.length, disponiveis: available.length },
        });

        return ifJson({ merchants: available, totalNoApp: all.length });
      }

      // ── link_merchant ─────────────────────────────────────────────────────
      case "link_merchant": {
        const merchantId = String(body.merchantId ?? "").trim();
        if (!merchantId) throw new IfoodError("Escolha uma loja.", "missing_merchant", 400);

        const accessToken = await ifAppToken(supabase);
        const all = await fetchAppMerchants(accessToken);
        const found = all.find((m) => m.id === merchantId);
        if (!found) {
          throw new IfoodError(
            "Essa loja não está vinculada ao aplicativo no iFood. Autorize a Velara no Portal do Parceiro primeiro.",
            "merchant_not_authorized",
            400,
          );
        }

        // A PK em merchant_id é o que impede duas contas reivindicarem a mesma
        // loja. Se já é de outro tenant, o insert falha e é isso mesmo.
        const name = found.name ?? found.corporateName ?? found.id;
        const { error: linkErr } = await supabase.from("ifood_merchants").insert({
          merchant_id: merchantId,
          user_id: user.id,
          name,
          corporate_name: found.corporateName ?? null,
        });

        if (linkErr) {
          if (linkErr.code === "23505") {
            const { data: current } = await supabase
              .from("ifood_merchants")
              .select("user_id")
              .eq("merchant_id", merchantId)
              .maybeSingle();
            if (current?.user_id !== user.id) {
              throw new IfoodError(
                "Essa loja já está vinculada a outra conta do Velara.",
                "merchant_taken",
                409,
              );
            }
          } else {
            throw linkErr;
          }
        }

        await saveSettings(supabase, user.id, {
          ifood_enabled: true,
          ifood_merchant_id: merchantId,
          ifood_merchant_name: name,
          ifood_connected_at: new Date().toISOString(),
        });
        await ifClearError(supabase, user.id);
        await ifLog(supabase, user.id, "link_merchant", "ok", { details: { merchantId } });

        return ifJson({ success: true, merchant: { id: merchantId, name } });
      }

      // ── unlink_merchant ───────────────────────────────────────────────────
      case "unlink_merchant": {
        const merchantId = String(body.merchantId ?? "").trim();
        if (!merchantId) throw new IfoodError("Informe a loja.", "missing_merchant", 400);

        await supabase
          .from("ifood_merchants")
          .delete()
          .eq("merchant_id", merchantId)
          .eq("user_id", user.id);

        const { data: rest } = await supabase
          .from("ifood_merchants")
          .select("merchant_id, name")
          .eq("user_id", user.id);

        // Sem nenhuma loja sobrando, a integração deixa de estar ativa.
        const next = rest?.[0] ?? null;
        await saveSettings(supabase, user.id, {
          ifood_enabled: Boolean(next),
          ifood_merchant_id: next?.merchant_id ?? null,
          ifood_merchant_name: next?.name ?? null,
          ...(next ? {} : { ifood_connected_at: null }),
        });

        await ifLog(supabase, user.id, "unlink_merchant", "ok", { details: { merchantId } });
        return ifJson({ success: true, remaining: rest?.length ?? 0 });
      }

      // ── select_merchant ───────────────────────────────────────────────────
      // Qual das lojas do tenant é a "em foco" nas telas.
      case "select_merchant": {
        const merchantId = String(body.merchantId ?? "").trim();
        const { data: mine } = await supabase
          .from("ifood_merchants")
          .select("merchant_id, name")
          .eq("merchant_id", merchantId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!mine) {
          throw new IfoodError("Essa loja não é desta conta.", "merchant_not_found", 400);
        }

        await saveSettings(supabase, user.id, {
          ifood_merchant_id: mine.merchant_id,
          ifood_merchant_name: mine.name,
        });
        return ifJson({ success: true, merchant: mine });
      }

      // ── status ────────────────────────────────────────────────────────────
      // Alimenta o painel de saúde. Não lança quando desvinculado: "sem loja"
      // é um estado legítimo, não um erro.
      case "status": {
        const { data: settings } = await supabase
          .from("pdv_settings")
          .select(
            "ifood_enabled, ifood_paused, ifood_merchant_id, ifood_merchant_name, " +
              "ifood_connected_at, ifood_last_sync_at, ifood_last_error, ifood_last_error_at, " +
              "ifood_shadow_mode, ifood_auto_accept, ifood_require_open_cashier, " +
              "ifood_default_production_center_id, ifood_alert_minutes",
          )
          .eq("user_id", user.id)
          .maybeSingle();

        const { data: merchants } = await supabase
          .from("ifood_merchants")
          .select("merchant_id, name, is_active, linked_at, last_status, last_status_at")
          .eq("user_id", user.id)
          .order("linked_at");

        // Saúde da plataforma: se o polling global parou, TODAS as lojas caem
        // no iFood, então isso precisa aparecer na tela de cada tenant.
        const { data: app } = await supabase
          .from("ifood_app_token")
          .select("last_poll_at, last_error, last_error_at")
          .eq("id", true)
          .maybeSingle();

        const { data: logs } = await supabase
          .from("pdv_ifood_sync_logs")
          .select("sync_type, status, http_status, error_message, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);

        return ifJson({
          connected: Boolean(settings?.ifood_enabled && (merchants?.length ?? 0) > 0),
          settings: settings ?? null,
          merchants: merchants ?? [],
          platform: app ?? null,
          logs: logs ?? [],
        });
      }

      // ── test_connection ───────────────────────────────────────────────────
      case "test_connection": {
        const accessToken = await ifAppToken(supabase);

        const { data: settings } = await supabase
          .from("pdv_settings")
          .select("ifood_merchant_id")
          .eq("user_id", user.id)
          .maybeSingle();

        const merchantId = settings?.ifood_merchant_id;
        if (!merchantId) {
          throw new IfoodError("Vincule uma loja antes de testar.", "no_merchant", 400);
        }

        // O status da loja é o que o operador quer saber quando reclama que
        // "parou de entrar pedido": muitas vezes ela está fechada no iFood.
        const { status, body: storeStatus } = await ifApi(
          accessToken,
          `/merchant/v1.0/merchants/${merchantId}/status`,
        );

        await ifLog(supabase, user.id, "test_connection", ifOk(status) ? "ok" : "error", {
          httpStatus: status,
          details: storeStatus,
        });

        if (!ifOk(status)) {
          await ifSetError(supabase, user.id, `Teste de conexão: o iFood respondeu ${status}.`);
          return ifJson({ success: false, httpStatus: status, details: storeStatus });
        }

        await supabase
          .from("ifood_merchants")
          .update({ last_status: storeStatus, last_status_at: new Date().toISOString() })
          .eq("merchant_id", merchantId);
        await ifClearError(supabase, user.id);

        return ifJson({ success: true, httpStatus: status, storeStatus });
      }

      default:
        throw new IfoodError(`Ação inválida: ${action}`, "invalid_action", 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ifood-auth]", message, err);

    if (userId) {
      await ifLog(supabase, userId, "error", "error", { message }).catch(() => {});
    }

    if (err instanceof IfoodError) {
      return ifJson({ error: err.message, code: err.code, details: err.details }, err.httpStatus);
    }
    return ifJson({ error: message, code: "unexpected" }, 500);
  }
});
