#!/usr/bin/env node
// Wizard interativo para criar o arquivo .env do Print Bridge
const readline = require("readline");
const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(__dirname, ".env");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

async function main() {
  console.log("\n=== Velara Print Bridge — Configuração ===\n");

  // Carrega valores atuais do .env se existir
  let current = {};
  if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, "utf8").split("\n");
    for (const line of lines) {
      const [k, ...rest] = line.split("=");
      if (k && rest.length) current[k.trim()] = rest.join("=").trim();
    }
    console.log("Configuração existente encontrada. Pressione Enter para manter os valores atuais.\n");
  }

  const def = (key, fallback = "") =>
    current[key] ? ` [${current[key]}]` : fallback ? ` [${fallback}]` : "";

  const supabaseUrl = (await ask(`URL do Supabase${def("SUPABASE_URL", "https://frbziqazwhymwsrtneoy.supabase.co")}: `)).trim()
    || current["SUPABASE_URL"] || "https://frbziqazwhymwsrtneoy.supabase.co";

  const supabaseKey = (await ask(`Chave anon do Supabase${def("SUPABASE_ANON_KEY")}: `)).trim()
    || current["SUPABASE_ANON_KEY"] || "";

  if (!supabaseKey) {
    console.error("\n✗ Chave anon do Supabase é obrigatória. Configure em Supabase → Settings → API.");
    rl.close();
    process.exit(1);
  }

  const establishment = (await ask(`Nome do estabelecimento${def("ESTABLISHMENT_NAME", "Meu Restaurante")}: `)).trim()
    || current["ESTABLISHMENT_NAME"] || "Meu Restaurante";

  const tenantId = (await ask(`UUID do tenant (deixe vazio para modo único)${def("TENANT_USER_ID")}: `)).trim()
    || current["TENANT_USER_ID"] || "";

  const port = (await ask(`Porta HTTP local${def("BRIDGE_HTTP_PORT", "7777")}: `)).trim()
    || current["BRIDGE_HTTP_PORT"] || "7777";

  rl.close();

  const lines = [
    `SUPABASE_URL=${supabaseUrl}`,
    `SUPABASE_ANON_KEY=${supabaseKey}`,
    `ESTABLISHMENT_NAME=${establishment}`,
    tenantId ? `TENANT_USER_ID=${tenantId}` : "",
    `BRIDGE_HTTP_PORT=${port}`,
  ].filter(Boolean).join("\n");

  fs.writeFileSync(ENV_PATH, lines + "\n", "utf8");

  console.log(`\n✓ .env salvo em: ${ENV_PATH}`);
  console.log("\nPróximos passos:");
  console.log("  • Iniciar agora:      node server.js");
  console.log("  • Instalar serviço:   execute install.bat como Administrador (Windows)");
  console.log("  • Verificar status:   http://localhost:" + port + "/health\n");
}

main().catch((err) => {
  console.error("Erro:", err.message);
  process.exit(1);
});
