// focusnfe-carta-correcao — emite CC-e para NF-e autorizada
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
  correcao: z.string().min(15, "Correção deve ter ao menos 15 caracteres").max(1000),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await authedOwner(req);
    if (auth instanceof Response) return auth;
    const { ownerId } = auth;
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const { ref, correcao } = parsed.data;

    const tk = await getTenantToken(ownerId);
    if ("error" in tk) return json({ error: tk.error }, 400);
    const { token, ambiente } = tk;

    const service = getServiceClient();
    const { data: nota } = await service
      .from("notas_fiscais")
      .select("id, tipo, status")
      .eq("user_id", ownerId)
      .eq("referencia_focusnfe", ref)
      .maybeSingle();

    if (!nota) return json({ error: "Nota não encontrada" }, 404);
    if (nota.tipo !== "nfe") return json({ error: "CC-e disponível apenas para NF-e" }, 400);
    if (nota.status !== "autorizada") return json({ error: "Nota não está autorizada" }, 400);

    const { count } = await service
      .from("notas_fiscais_cartas_correcao")
      .select("id", { count: "exact", head: true })
      .eq("nota_id", nota.id);
    const sequencia = (count || 0) + 1;

    const resp = await fetch(
      `${focusBaseUrl(ambiente)}/v2/nfe/${ref}/carta_correcao`,
      {
        method: "POST",
        headers: { Authorization: basicAuth(token), "Content-Type": "application/json" },
        body: JSON.stringify({ correcao }),
      },
    );
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return json(
        { error: translateSefazError(data.mensagem || `HTTP ${resp.status}`) },
        400,
      );
    }

    await service.from("notas_fiscais_cartas_correcao").insert({
      nota_id: nota.id,
      sequencia,
      correcao,
      protocolo: data.protocolo,
      status: data.status || "registrada",
      xml_url: data.caminho_xml_carta_correcao
        ? `https://api.focusnfe.com.br${data.caminho_xml_carta_correcao}`
        : null,
    });

    return json({ success: true, sequencia, protocolo: data.protocolo });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
