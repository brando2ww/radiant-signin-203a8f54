// focusnfe-cancelar-nota
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@3";
import {
  authedOwner,
  basicAuth,
  corsHeaders,
  focusBaseUrl,
  getServiceClient,
  getTenantToken,
  json,
  translateSefazError,
} from "../_shared/focusnfe-utils.ts";

const Body = z.object({
  ref: z.string().min(1),
  tipo: z.enum(["nfe", "nfce", "nfse"]),
  justificativa: z.string().min(15, "Justificativa deve ter no mínimo 15 caracteres"),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await authedOwner(req);
    if (auth instanceof Response) return auth;
    const { ownerId } = auth;
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const { ref, tipo, justificativa } = parsed.data;

    const tk = await getTenantToken(ownerId);
    if ("error" in tk) return json({ error: tk.error }, 400);
    const { token, ambiente } = tk;

    const resp = await fetch(`${focusBaseUrl(ambiente)}/v2/${tipo}/${ref}`, {
      method: "DELETE",
      headers: { Authorization: basicAuth(token), "Content-Type": "application/json" },
      body: JSON.stringify({ justificativa }),
    });
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return json({ error: translateSefazError(data.mensagem || `HTTP ${resp.status}`) }, 400);
    }

    const service = getServiceClient();
    await service.from("notas_fiscais").update({
      status: "cancelada",
      cancelamento_justificativa: justificativa,
      cancelada_em: new Date().toISOString(),
      xml_cancelamento: data.caminho_xml_cancelamento || null,
      resposta_api: data,
    }).eq("user_id", ownerId).eq("referencia_focusnfe", ref);

    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
