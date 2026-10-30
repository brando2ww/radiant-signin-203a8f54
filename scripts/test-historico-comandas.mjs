import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const dir = mkdtempSync(join(tmpdir(), "velara-historico-test-"));
let started = false;
try {
  execFileSync("initdb", ["-D", join(dir, "db"), "--auth=trust", "--no-locale", "--encoding=UTF8"], { stdio: "pipe" });
  execFileSync("pg_ctl", ["-D", join(dir, "db"), "-l", join(dir, "postgres.log"), "-o", `-F -k '${dir}' -p 55437 -c listen_addresses=''`, "-w", "start"], { stdio: "pipe" });
  started = true;
  execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-f", "supabase/tests/historico_comandas.sql"], { stdio: "inherit", env: { ...process.env, PGHOST: dir, PGPORT: "55437", PGDATABASE: "postgres", PGUSER: userInfo().username } });
  const script = join(dir, "summary.cjs");
  await build({ stdin: { contents: `
    import assert from 'node:assert/strict';
    import { historyPaymentSummary, historyTimestamp } from './src/lib/comanda-history';
    const detail = {pagamentos_atendimento:[{valor:100},{valor:55}],movimentos_comanda:[{valor:100}]};
    assert.equal(historyPaymentSummary(detail).total,155);
    assert.equal(historyPaymentSummary(detail).scope,'atendimento');
    assert.equal(historyPaymentSummary({...detail,pagamentos_atendimento:[]}).total,100);
    assert.equal(historyPaymentSummary({...detail,pagamentos_atendimento:[],movimentos_comanda:[]}).total,null);
    assert.ok(historyTimestamp('2026-10-28T01:00:00Z').includes('27/10/2026'));
    console.log('OK: resumo distingue cobrança compartilhada, não duplica movimentos, não inventa pagamento ausente e usa horário do Brasil.');
  `, resolveDir: process.cwd(), loader: "ts" }, outfile: script, bundle: true, platform: "node", format: "cjs", logLevel: "error" });
  execFileSync(process.execPath, [script], { stdio: "inherit" });
} finally {
  if (started) execFileSync("pg_ctl", ["-D", join(dir, "db"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(dir, { recursive: true, force: true });
}
