// focusnfe-cadastrar-empresa
// Cria ou atualiza a Empresa do tenant na FocusNFE usando o token MASTER da Velara.
// A resposta inclui token_producao e token_homologacao específicos da empresa,
// que são cifrados e salvos em tenant_fiscal_config.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@3";
import {
  authedOwner,
  basicAuth,
  corsHeaders,
  focusBaseUrl,
  getServiceClient,
  json,
} from "../_shared/focusnfe-utils.ts";
import { encryptSecret, decryptSecret } from "../_shared/focusnfe-crypto.ts";

const BodySchema = z.object({
  // Se o cliente já fez upload e gravou no banco, passamos só o sinal de "ativar".
  // Edge function lê config do banco e baixa certificado do storage.
  upload_certificate: z.boolean().default(false),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authedOwner(req);
    if (auth instanceof Response) return auth;
    const { ownerId } = auth;

    const master = Deno.env.get("FOCUSNFE_TOKEN");
    if (!master) return json({ error: "FOCUSNFE_TOKEN não configurado" }, 500);

    const service = getServiceClient();
    const { data: config, error: cfgErr } = await service
      .from("tenant_fiscal_config")
      .select("*")
      .eq("user_id", ownerId)
      .maybeSingle();

    if (cfgErr || !config) {
      return json({ error: "Preencha e salve seus dados fiscais antes de ativar" }, 400);
    }

    // Validação básica
    const required = ["razao_social", "cnpj", "logradouro", "numero", "bairro", "municipio", "uf", "cep"];
    const missing = required.filter((k) => !config[k]);
    if (missing.length) return json({ error: "Campos faltando", missing }, 400);

    // Baixa certificado
    let certBase64: string | null = null;
    let certSenha: string | null = null;
    if (config.certificado_pfx_path) {
      const { data: file, error: dlErr } = await service.storage
        .from("fiscal-certificates")
        .download(config.certificado_pfx_path);
      if (dlErr || !file) return json({ error: "Falha ao baixar certificado A1" }, 400);
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (const b of buf) bin += String.fromCharCode(b);
      certBase64 = btoa(bin);
      certSenha = await decryptSecret(config.certificado_senha_cifrada);
    }

    // CSC
    const cscProd = config.csc_nfce_producao_cifrado
      ? await decryptSecret(config.csc_nfce_producao_cifrado)
      : null;
    const cscHomol = config.csc_nfce_homologacao_cifrado
      ? await decryptSecret(config.csc_nfce_homologacao_cifrado)
      : null;

    const payload: any = {
      nome: config.razao_social,
      nome_fantasia: config.nome_fantasia || config.razao_social,
      cnpj: (config.cnpj || "").replace(/\D/g, ""),
      inscricao_estadual: config.inscricao_estadual || undefined,
      inscricao_municipal: config.inscricao_municipal || undefined,
      regime_tributario: config.regime_tributario || 1,
      logradouro: config.logradouro,
      numero: config.numero,
      complemento: config.complemento || undefined,
      bairro: config.bairro,
      municipio: config.municipio,
      uf: config.uf,
      cep: (config.cep || "").replace(/\D/g, ""),
      telefone: (config.telefone || "").replace(/\D/g, "") || undefined,
      email: config.email || undefined,
      habilita_nfce: !!config.habilita_nfce,
      habilita_nfe: !!config.habilita_nfe,
      habilita_nfse: !!config.habilita_nfse,
      discrimina_impostos: true,
      enviar_email_destinatario: true,
    };
    if (certBase64) {
      payload.arquivo_certificado_base64 = certBase64;
      payload.senha_certificado = certSenha;
    }
    if (cscProd) {
      payload.csc_nfce_producao = cscProd;
      payload.id_token_nfce_producao = config.id_token_nfce_producao || 1;
    }
    if (cscHomol) {
      payload.csc_nfce_homologacao = cscHomol;
      payload.id_token_nfce_homologacao = config.id_token_nfce_homologacao || 1;
    }

    // Cadastro vs atualização — FocusNFE sempre via produção
    const url = `${focusBaseUrl("producao")}/v2/empresas${config.focusnfe_empresa_id ? `/${config.focusnfe_empresa_id}` : ""}`;
    const method = config.focusnfe_empresa_id ? "PUT" : "POST";

    const resp = await fetch(url, {
      method,
      headers: {
        Authorization: basicAuth(master),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const msg = data?.mensagem || data?.message || `Erro Focus (${resp.status})`;
      await service.from("tenant_fiscal_config").update({
        last_test_at: new Date().toISOString(),
        last_test_status: "erro",
        last_test_message: msg,
      }).eq("user_id", ownerId);
      return json({ error: msg, detail: data }, 400);
    }

    const update: any = {
      focusnfe_empresa_id: data.id || config.focusnfe_empresa_id,
      cadastrada_em: new Date().toISOString(),
      last_test_at: new Date().toISOString(),
      last_test_status: "ok",
      last_test_message: "Empresa ativa na FocusNFE",
    };
    if (data.token_producao) {
      update.focusnfe_token_producao_cifrado = await encryptSecret(data.token_producao);
    }
    if (data.token_homologacao) {
      update.focusnfe_token_homologacao_cifrado = await encryptSecret(data.token_homologacao);
    }

    await service.from("tenant_fiscal_config").update(update).eq("user_id", ownerId);

    return json({ success: true, empresa_id: update.focusnfe_empresa_id });
  } catch (e) {
    console.error("cadastrar-empresa error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
