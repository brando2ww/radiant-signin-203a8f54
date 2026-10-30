// Usa um PostgreSQL descartável, sem conexão TCP e sem tocar em bancos existentes.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const testDir = mkdtempSync(join(tmpdir(), "velara-clientes-test-"));
const dbDir = join(testDir, "db");
const pgEnv = { ...process.env, PGHOST: testDir, PGPORT: "55439", PGDATABASE: "postgres", PGUSER: userInfo().username };
let started = false;
try {
  execFileSync("initdb", ["-D", dbDir, "--auth=trust", "--no-locale", "--encoding=UTF8"], { stdio: "pipe" });
  execFileSync("pg_ctl", ["-D", dbDir, "-l", join(testDir, "postgres.log"), "-o", `-F -k '${testDir}' -p 55439 -c listen_addresses=''`, "-w", "start"], { stdio: "pipe" });
  started = true;
  execFileSync("psql", ["--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-f", "supabase/tests/clientes_comandas_cashback.sql"], {
    stdio: "inherit",
    env: pgEnv,
  });

  // Duas conexões reais disputando o mesmo telefone (não apenas chamadas sequenciais).
  await Promise.all(["A", "B"].map((name) => new Promise((resolve, reject) => {
    const child = spawn("psql", ["--no-psqlrc", "-v", "ON_ERROR_STOP=1"], { env: pgEnv });
    let errors = "";
    child.stdout.resume();
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(errors)));
    child.stdin.end(`begin;
      insert into pdv_comandas(user_id, customer_name, customer_phone)
      values ('00000000-0000-0000-0000-000000000001', 'Concorrente ${name}', '54999990007');
      select pg_sleep(0.2); commit;`);
  })));
  const concurrentCount = execFileSync("psql", ["--no-psqlrc", "-At", "-c", "select count(*) from pdv_customers where user_id = '00000000-0000-0000-0000-000000000001' and phone = '54999990007'"], { env: pgEnv, encoding: "utf8" }).trim();
  if (concurrentCount !== "1") throw new Error(`Concorrência criou ${concurrentCount} cadastros para o mesmo telefone`);
  console.log("OK: duas comandas simultâneas geram um único cadastro por telefone na loja.");

  const uiTest = join(testDir, "badge.cjs");
  await build({
    stdin: {
      contents: `
        import assert from 'node:assert/strict';
        import { renderToStaticMarkup } from 'react-dom/server';
        import { CustomerCashbackBadge } from './src/components/pdv/CustomerCashbackBadge';
        const positive = renderToStaticMarkup(<CustomerCashbackBadge balance={27.5} />);
        assert.match(positive, /Cashback ativo:/);
        assert.match(positive, /27,50/);
        for (const balance of [0, -1, NaN]) {
          assert.equal(renderToStaticMarkup(<CustomerCashbackBadge balance={balance} />), '');
        }
        console.log('OK: badge mostra o saldo positivo em reais e omite saldo zerado.');
      `,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    outfile: uiTest, bundle: true, platform: "node", format: "cjs", jsx: "automatic", logLevel: "error",
  });
  execFileSync(process.execPath, [uiTest], { stdio: "inherit" });
} catch (error) {
  if (!started) {
    try { console.error(readFileSync(join(testDir, "postgres.log"), "utf8")); } catch { /* initdb pode não existir */ }
  }
  throw error;
} finally {
  if (started) execFileSync("pg_ctl", ["-D", dbDir, "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(testDir, { recursive: true, force: true });
}
