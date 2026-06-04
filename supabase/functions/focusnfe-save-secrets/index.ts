// focusnfe-save-secrets — cifra e grava senha do certificado + CSCs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@3";
import { authedOwner, corsHeaders, getServiceClient, json } from "../_shared/focusnfe-utils.ts";
import { encryptSecret } from "../_shared/focusnfe-crypto.ts";

const Body = z.object({
  senha_certificado: z.string().optional(),
  csc_producao: z.string().optional(),
  csc_homologacao: z.string().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await authedOwner(req);
    if (auth instanceof Response) return auth;
    const { ownerId } = auth;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const { senha_certificado, csc_producao, csc_homologacao } = parsed.data;

    const update: any = { user_id: ownerId };
    if (senha_certificado) update.certificado_senha_cifrada = await encryptSecret(senha_certificado);
    if (csc_producao) update.csc_nfce_producao_cifrado = await encryptSecret(csc_producao);
    if (csc_homologacao) update.csc_nfce_homologacao_cifrado = await encryptSecret(csc_homologacao);

    const service = getServiceClient();
    await service.from("tenant_fiscal_config").upsert(update, { onConflict: "user_id" });
    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
