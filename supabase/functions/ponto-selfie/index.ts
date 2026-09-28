// ponto-selfie — recebe a foto da batida, guarda no bucket privado e registra
// a marcação numa chamada só.
//
// Por que uma edge function e não upload direto do navegador: o colaborador é
// anônimo (entra por link com senha, não tem login), e abrir o Storage para
// anon seria repetir o erro do bucket checklist-evidence, onde qualquer um com
// a URL lê a evidência. Aqui a chave de serviço mora no servidor e o bucket
// fica fechado.
//
// A ordem importa: grava a foto, depois registra a marcação com o caminho.
// Como a marcação é append-only, não existe "anexar a foto depois".
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const { session_token, quiosque_token, pin, imagem, latitude, longitude, accuracy_m, hora_dispositivo } = corpo ?? {};
  if (!session_token && !quiosque_token) return json({ error: "sessao_ausente" }, 400);

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let selfiePath: string | null = null;
  let selfieHash: string | null = null;

  if (typeof imagem === "string" && imagem.length > 100) {
    try {
      const base64 = imagem.replace(/^data:image\/\w+;base64,/, "");
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

      // 2 MB é bem mais do que uma selfie comprimida precisa; acima disso é
      // engano ou abuso.
      if (bytes.byteLength > 2_000_000) return json({ error: "imagem_grande" }, 413);

      const digest = await crypto.subtle.digest("SHA-256", bytes);
      selfieHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");

      const agora = new Date();
      const pasta = `${agora.getUTCFullYear()}/${String(agora.getUTCMonth() + 1).padStart(2, "0")}`;
      selfiePath = `${pasta}/${crypto.randomUUID()}.jpg`;

      const { error } = await supa.storage.from("ponto-selfies").upload(selfiePath, bytes, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (error) {
        // Foto é prova, não é permissão: se o upload falhar, a batida continua.
        console.error("[ponto-selfie] upload:", error.message);
        selfiePath = null;
        selfieHash = null;
      }
    } catch (e) {
      console.error("[ponto-selfie] imagem:", e);
      selfiePath = null;
      selfieHash = null;
    }
  }

  const { data, error } = quiosque_token
    ? await supa.rpc("ponto_bater_quiosque", {
        _quiosque_token: quiosque_token,
        _pin: pin,
        _latitude: latitude ?? null,
        _longitude: longitude ?? null,
        _accuracy_m: accuracy_m ?? null,
        _selfie_path: selfiePath,
        _selfie_sha256: selfieHash,
      })
    : await supa.rpc("ponto_bater", {
        _session_token: session_token,
        _latitude: latitude ?? null,
        _longitude: longitude ?? null,
        _accuracy_m: accuracy_m ?? null,
        _hora_dispositivo: hora_dispositivo ?? null,
        _coletor: quiosque_token ? "tablet" : "celular",
        _origem_offline: false,
        _marcado_em_offline: null,
        _selfie_path: selfiePath,
        _selfie_sha256: selfieHash,
      });

  if (error) {
    console.error("[ponto-selfie] rpc:", error.message);
    return json({ error: "falha_ao_registrar" }, 500);
  }
  return json(data);
});
