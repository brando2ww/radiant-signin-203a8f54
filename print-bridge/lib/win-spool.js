"use strict";

// Tudo que conversa com o spooler do Windows, e SEMPRE de forma assíncrona.
//
// Na 1.5.0 isto era spawnSync: cada impressão USB congelava o processo inteiro
// por até 30s. Durante esse tempo o painel não respondia, o heartbeat do
// WebSocket não era processado (o Realtime morria calado) e a fila de TODAS as
// outras impressoras parava junto. A serialização por impressora virava
// serialização global — e é a explicação mais provável dos jobs que ficavam
// `pending` com attempts=0 e nenhuma mensagem de erro.
//
// Duas mudanças estruturais além do async:
//  · o script vai para um arquivo .ps1 e é chamado com -File, em vez de ser
//    concatenado em -Command. O C# do P/Invoke sozinho já deixava a linha de
//    comando perto do limite de 32 KB do CreateProcess, e o escape de aspas
//    era frágil.
//  · a sondagem de estado e a listagem de impressoras viraram UMA chamada só
//    (eram duas, de 12s e 8s, a cada 60 segundos).

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const { config } = require("./config");
const { log } = require("./log");

const isWindows = process.platform === "win32";

// `Send` devolve o ID do job no spooler (retorno do StartDocPrinter). É esse ID
// que permite esperar o job SAIR da fila antes de dar a impressão por boa. Sem
// isso, "sucesso" significa apenas "o spooler aceitou os bytes" — com a
// impressora pausada ou desligada o cupom nunca sai e o banco registra
// `printed`. Foi assim que 11 comandas do La Vecchia "imprimiram" sem sair
// papel nenhum (31/07/2026).
const PS_RAWPRINT_TYPE = `
using System; using System.Runtime.InteropServices;
public class VelaraRawPrint {
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Ansi)]
  public struct DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv",SetLastError=true)] static extern bool OpenPrinter(string n,out IntPtr h,IntPtr d);
  [DllImport("winspool.drv",SetLastError=true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)] static extern int StartDocPrinter(IntPtr h,int l,ref DOCINFO i);
  [DllImport("winspool.drv",SetLastError=true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)] static extern bool WritePrinter(IntPtr h,byte[] b,int n,out int w);
  public static int Send(string p,byte[] b){
    IntPtr h; if(!OpenPrinter(p,out h,IntPtr.Zero)) throw new Exception("Impressora nao encontrada no Windows: "+p);
    try {
      var d=new DOCINFO{pDocName="Velara",pDataType="RAW"};
      int jobId=StartDocPrinter(h,1,ref d);
      if(jobId==0) throw new Exception("O spooler recusou o documento (StartDocPrinter=0, erro "+Marshal.GetLastWin32Error()+")");
      if(!StartPagePrinter(h)) throw new Exception("StartPagePrinter falhou (erro "+Marshal.GetLastWin32Error()+")");
      int w; if(!WritePrinter(h,b,b.Length,out w)) throw new Exception("WritePrinter falhou (erro "+Marshal.GetLastWin32Error()+")");
      if(w!=b.Length) throw new Exception("Envio truncado: "+w+" de "+b.Length+" bytes");
      EndPagePrinter(h); EndDocPrinter(h);
      return jobId;
    } finally { ClosePrinter(h); }
  }
}
`;

// Impressão + verificação de que o job saiu da fila. Três garantias, nessa
// ordem: pré-checagem de offline (não gera job preso), acompanhamento pelo ID
// até sumir da fila ou acender o bit PRINTED, e cancelamento do job no timeout
// (sem isso o retry empilharia 3 cópias no spooler e, quando alguém religasse
// a impressora, sairiam todas de uma vez).
const PS_PRINT_SCRIPT = `param(
  [Parameter(Mandatory=$true)][string]$Printer,
  [Parameter(Mandatory=$true)][string]$DataFile,
  [int]$TimeoutMs = 15000,
  [switch]$Verify
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${PS_RAWPRINT_TYPE}
'@ -Language CSharp

$bytes = [System.IO.File]::ReadAllBytes($DataFile)

function Get-VelaraJob($id) {
  Get-CimInstance Win32_PrintJob -ErrorAction Stop |
    Where-Object { $_.JobId -eq $id -and $_.Name.StartsWith($Printer + ',') } |
    Select-Object -First 1
}

try {
  if ($Verify) {
    $dev = $null
    try { $dev = Get-CimInstance Win32_Printer -ErrorAction Stop | Where-Object { $_.Name -eq $Printer } | Select-Object -First 1 } catch { $dev = $null }
    if ($dev -ne $null -and $dev.WorkOffline) {
      throw "Impressora '$Printer' esta OFFLINE no Windows (ligada? cabo/rede? modo 'Usar impressora offline' marcado?)"
    }
  }

  $jobId = [VelaraRawPrint]::Send($Printer, $bytes)

  if ($Verify) {
    $seen = $false
    $ok = $false
    $lastStatus = ''
    $start = Get-Date
    while ($true) {
      $elapsed = ((Get-Date) - $start).TotalMilliseconds
      $j = $null
      $canQuery = $true
      try { $j = Get-VelaraJob $jobId } catch { $canQuery = $false }
      if (-not $canQuery) { $ok = $true; break }
      if ($j -eq $null) {
        # Sumiu da fila = spooler entregou. Antes de ter sido visto uma vez,
        # so aceitamos depois de uma folga: job recem-criado pode ainda nao
        # ter aparecido no WMI.
        if ($seen -or $elapsed -gt 2000) { $ok = $true; break }
      } else {
        $seen = $true
        if (($j.StatusMask -band 0x80) -ne 0) { $ok = $true; break }
        $lastStatus = "$($j.JobStatus) / $($j.Status)"
      }
      if ($elapsed -ge $TimeoutMs) { break }
      Start-Sleep -Milliseconds 250
    }
    if (-not $ok) {
      try {
        $dead = Get-VelaraJob $jobId
        if ($dead -ne $null) { Remove-CimInstance -InputObject $dead -ErrorAction SilentlyContinue }
      } catch { }
      $detalhe = $lastStatus
      if ([string]::IsNullOrWhiteSpace($detalhe)) { $detalhe = 'sem resposta' }
      throw "O cupom entrou na fila da impressora '$Printer' mas nao imprimiu em $TimeoutMs ms (status: $detalhe). Job cancelado na fila. Verifique papel, energia e se a impressora esta pausada no Windows."
    }
  }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
exit 0
`;

// Estado real das impressoras + lista de nomes, numa passada só. Existir no
// sistema não basta: pausada, desligada ou sem papel continua listada — era por
// isso que o painel mostrava tudo verde enquanto o caixa não imprimia nada.
const PS_PROBE_SCRIPT = `$ErrorActionPreference = 'SilentlyContinue'
$jobs = @(Get-CimInstance Win32_PrintJob)
$lista = @(Get-CimInstance Win32_Printer | ForEach-Object {
  $nome = $_.Name
  [pscustomobject]@{
    name    = $nome
    offline = [bool]$_.WorkOffline
    status  = [int]$_.PrinterStatus
    erro    = [int]$_.DetectedErrorState
    pausada = (([int]$_.PrinterState -band 1) -ne 0)
    fila    = @($jobs | Where-Object { $_.Name.StartsWith($nome + ',') }).Count
  }
})
[pscustomobject]@{ printers = $lista } | ConvertTo-Json -Depth 4 -Compress
`;

let scriptDir = null;
function ensureScripts() {
  if (scriptDir) return scriptDir;
  // Os scripts precisam existir em disco para o -File. Dentro do .exe do pkg o
  // __dirname é virtual e o PowerShell não enxerga, então materializamos em
  // temp uma vez por processo.
  const dir = path.join(os.tmpdir(), `velara-ps-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "print.ps1"), PS_PRINT_SCRIPT, "utf8");
  fs.writeFileSync(path.join(dir, "probe.ps1"), PS_PROBE_SCRIPT, "utf8");
  scriptDir = dir;
  return dir;
}

function runPowerShell(scriptFile, args, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    let onAbort = null;
    const child = execFile(
      "powershell",
      ["-NonInteractive", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptFile, ...args],
      { timeout: timeoutMs, encoding: "utf8", windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (onAbort) signal?.removeEventListener?.("abort", onAbort);
        if (err) {
          // O timeout do execFile mata o filho, mas só depois do SIGTERM; num
          // PowerShell travado isso pode não bastar.
          if (err.killed || err.signal) {
            try { child.kill("SIGKILL"); } catch (_) {}
          }
          const msg = (stderr || stdout || err.message || "").trim();
          return reject(new Error(msg.slice(0, 300) || String(err.message)));
        }
        resolve({ stdout, stderr });
      },
    );

    if (signal) {
      onAbort = () => {
        try { child.kill("SIGKILL"); } catch (_) {}
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

// ─── Modo simulado (tools/) ──────────────────────────────────────────────
// Permite exercitar todo o encanamento do caminho Windows no macOS: timeout,
// abort, breaker, serialização. Não valida o PowerShell — isso só o CI em
// windows-latest faz. O desfecho é escolhido pelo nome da impressora.
async function fakeRawPrint(printerName, buffer, opts) {
  const nome = String(printerName).toUpperCase();
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  if (nome.includes("TRAVA")) {
    // Nunca resolve: é o que o timeout de job tem de cortar.
    await new Promise(() => {});
  }
  if (nome.includes("LENTA")) await espera(3000);
  if (nome.includes("OFFLINE")) throw new Error(`Impressora '${printerName}' esta OFFLINE no Windows`);
  if (nome.includes("PRESA")) throw new Error(`O cupom entrou na fila da impressora '${printerName}' mas nao imprimiu em ${opts.timeoutMs} ms. Job cancelado na fila.`);
  if (nome.includes("SUMIDA")) throw new Error(`Impressora nao encontrada no Windows: ${printerName}`);
  await espera(50);
  log(`[simulado] ${buffer.length} bytes → impressora Windows "${printerName}"`);
}

/**
 * Envia bytes RAW para uma impressora registrada no Windows e só retorna
 * quando o spooler confirma que o documento saiu da fila.
 */
async function rawPrint(printerName, buffer, { signal } = {}) {
  const opts = { timeoutMs: config.spoolTimeoutMs, verify: config.spoolVerify };
  if (config.fakeWindows) return fakeRawPrint(printerName, buffer, opts);
  if (!isWindows) throw new Error("impressora por nome do Windows só funciona no Windows");

  const dir = ensureScripts();
  const tmpFile = path.join(
    os.tmpdir(),
    `vp_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.bin`,
  );
  await fs.promises.writeFile(tmpFile, buffer);
  try {
    const args = [
      "-Printer", printerName,
      "-DataFile", tmpFile,
      "-TimeoutMs", String(opts.timeoutMs),
    ];
    if (opts.verify) args.push("-Verify");
    // Margem sobre o timeout interno: o Add-Type compila C# na primeira volta e
    // isso sozinho pode levar alguns segundos numa máquina de caixa.
    await runPowerShell(path.join(dir, "print.ps1"), args, opts.timeoutMs + 15000, signal);
  } finally {
    fs.promises.unlink(tmpFile).catch(() => {});
  }
}

// DetectedErrorState: 5 = sem papel, 9 = atolada, 10 = offline.
// PrinterStatus: 7 = offline, 6 = parou de imprimir.
const MOTIVOS = {
  4: "papel acabando",
  5: "SEM PAPEL",
  6: "toner baixo",
  7: "sem toner",
  8: "tampa aberta",
  9: "papel ATOLADO",
  10: "offline",
  11: "precisa de manutenção",
  12: "bandeja cheia",
};

/**
 * Estado de todas as impressoras do Windows numa chamada.
 * @returns {Promise<{byName: Map<string, {name, queued, problems}>, names: string[]}>}
 */
async function probePrinters() {
  const vazio = { byName: new Map(), names: [] };
  if (config.fakeWindows) return vazio;
  if (!isWindows) return vazio;

  let out;
  try {
    out = await runPowerShell(path.join(ensureScripts(), "probe.ps1"), [], 12000);
  } catch (_) {
    return vazio;
  }
  let parsed;
  try {
    parsed = JSON.parse(String(out.stdout || "").trim());
  } catch (_) {
    return vazio;
  }

  const lista = Array.isArray(parsed?.printers)
    ? parsed.printers
    : parsed?.printers
      ? [parsed.printers]
      : [];

  const byName = new Map();
  const names = [];
  lista.forEach((p) => {
    if (!p || !p.name) return;
    names.push(p.name);
    const problemas = [];
    if (p.offline) problemas.push("offline no Windows");
    if (p.pausada) problemas.push("PAUSADA");
    if (p.status === 7) problemas.push("offline");
    if (p.status === 6) problemas.push("parou de imprimir");
    if (p.erro && p.erro !== 3 && MOTIVOS[p.erro]) problemas.push(MOTIVOS[p.erro]);
    byName.set(String(p.name).toLowerCase(), {
      name: p.name,
      queued: Number(p.fila) || 0,
      problems: [...new Set(problemas)],
    });
  });
  return { byName, names };
}

// Detectar portas COM abre 30 handles em sequência. Na 1.5.0 isso era síncrono
// e rodava a cada 60s junto da sondagem; agora é sob demanda, em paralelo, e
// com cache — só o /list-printers precisa disso.
let comCache = { at: 0, ports: [] };
async function listComPorts() {
  if (!isWindows) return [];
  if (Date.now() - comCache.at < 5 * 60 * 1000) return comCache.ports;

  const checks = Array.from({ length: 30 }, (_, i) => `COM${i + 1}`);
  const found = await Promise.all(
    checks.map(async (port) => {
      let handle;
      try {
        handle = await fs.promises.open(`\\\\.\\${port}`, fs.constants.O_RDWR | fs.constants.O_NONBLOCK);
        return port;
      } catch (_) {
        return null;
      } finally {
        await handle?.close().catch(() => {});
      }
    }),
  );
  comCache = { at: Date.now(), ports: found.filter(Boolean) };
  return comCache.ports;
}

async function listAvailablePrinters() {
  const [com_ports, probe] = await Promise.all([listComPorts(), probePrinters()]);
  return { com_ports, windows_printers: probe.names };
}

module.exports = { rawPrint, probePrinters, listAvailablePrinters, isWindows };
