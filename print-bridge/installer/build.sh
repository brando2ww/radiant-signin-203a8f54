#!/usr/bin/env bash
# Compila o instalador Windows a partir do macOS/Linux, via Docker (Wine + Inno
# Setup). Nao precisa de maquina Windows.
#
#   ./build.sh
#
# Saida: print-bridge/dist-installer/VelaraPrintBridgeSetup-<versao>.exe
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"

echo "→ Montando payload..."
rm -rf payload && mkdir -p payload

# O .exe do servico: compila se nao existir ou se qualquer fonte for mais nova.
# Olhar so o server.js nao serve mais — desde a 2.0 a logica vive em lib/, e um
# instalador embrulhando binario velho e exatamente o problema que estamos
# tentando extinguir.
BRIDGE_EXE="../dist/velara-print-bridge.exe"
FONTE_NOVA=""
if [[ -f "$BRIDGE_EXE" ]]; then
  FONTE_NOVA=$(find ../server.js ../package.json ../panel.html ../lib -newer "$BRIDGE_EXE" -type f 2>/dev/null | head -1)
fi
if [[ ! -f "$BRIDGE_EXE" || -n "$FONTE_NOVA" ]]; then
  echo "→ Fonte mudou (${FONTE_NOVA:-primeira compilacao}), recompilando o binario..."
  (cd .. && npm run build:win)
fi
cp "$BRIDGE_EXE" payload/

# NSSM embutido: o .bat baixava de nssm.cc na hora da instalacao, o que
# quebrava em rede de restaurante com internet ruim ou firewall.
if [[ ! -f vendor/nssm.exe ]]; then
  echo "→ Baixando NSSM (uma vez, fica versionado em vendor/)..."
  mkdir -p vendor
  curl -sL -o /tmp/nssm.zip https://nssm.cc/release/nssm-2.24.zip
  unzip -o -q /tmp/nssm.zip -d /tmp/nssm-x
  cp /tmp/nssm-x/nssm-2.24/win64/nssm.exe vendor/nssm.exe
fi
cp vendor/nssm.exe payload/

# Icone da bandeja (Go, cross-compilado do macOS para Windows).
TRAY_EXE="../tray/velara-tray.exe"
if [[ ! -f "$TRAY_EXE" || "../tray/main.go" -nt "$TRAY_EXE" ]]; then
  echo "→ Compilando o icone da bandeja..."
  (cd ../tray && GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
    go build -ldflags "-H windowsgui -s -w" -o velara-tray.exe .)
fi
cp "$TRAY_EXE" payload/

# A chave anon e publica (ja vai no bundle do navegador), mas nao fica
# hardcoded no repositorio: sai do .env do projeto na hora do build.
ANON=$(grep VITE_SUPABASE_PUBLISHABLE_KEY "$ROOT/.env" | cut -d'"' -f2)
if [[ -z "$ANON" ]]; then
  echo "✗ Nao achei VITE_SUPABASE_PUBLISHABLE_KEY em $ROOT/.env" >&2
  exit 1
fi

# Uma versao so, a do package.json. O .exe compilado tem de concordar com ela:
# um instalador que diz 2.0.0 embrulhando um binario 1.5.0 e como o cliente
# ficava — rodando algo que ninguem sabia identificar.
VERSAO=$(node -p "require('$ROOT/print-bridge/package.json').version")
VERSAO_EXE=$("$BRIDGE_EXE" --version 2>/dev/null || echo "")
if [[ -n "$VERSAO_EXE" && "$VERSAO_EXE" != "$VERSAO" ]]; then
  echo "✗ O .exe informa versao $VERSAO_EXE, mas o package.json diz $VERSAO" >&2
  exit 1
fi
echo "→ Versao: $VERSAO"

mkdir -p ../dist-installer

echo "→ Compilando com Inno Setup (Docker)..."
rm -rf output && mkdir -p output

# O container termina a compilacao mas nao encerra: o wineserver fica de pe
# segurando o PID 1. Entao roda destacado, espera o .exe aparecer e mata.
# Sem --rm de proposito: com ele o container some no instante em que sai, e o
# docker logs seguinte falha com "No such container" — perdendo justamente a
# mensagem que diz se compilou. Removemos a mao no fim.
OK=0
for TENTATIVA in 1 2 3; do
  rm -rf output && mkdir -p output
  CONTAINER="velara-iss-build-$$-$TENTATIVA"
  LOGFILE="/tmp/$CONTAINER.log"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

  # Anexado (nao -d): em modo destacado o Wine perde o stdout e morre com
  # "wine client error: write: Bad file descriptor". Rodamos em segundo plano
  # do shell, com a saida num arquivo, para poder vigiar e matar se travar.
  : > "$LOGFILE"
  docker run --name "$CONTAINER" -v "$PWD:/work" -w /work \
    amake/innosetup:latest "/dSupabaseAnonKey=$ANON" "/dAppVersion=$VERSAO" VelaraPrintBridge.iss \
    > "$LOGFILE" 2>&1 &
  DOCKER_PID=$!

  # Espera o compilador ANUNCIAR sucesso. Medir o tamanho do .exe nao serve: o
  # Inno escreve em etapas e uma pausa no meio parece um arquivo pronto — foi
  # assim que saiu um instalador de 950 KB, sem o payload dentro.
  for _ in $(seq 1 300); do
    if grep -q "Successful compile" "$LOGFILE" 2>/dev/null; then OK=1; break; fi
    if grep -qE "Compile aborted|wine client error" "$LOGFILE" 2>/dev/null; then break; fi
    kill -0 "$DOCKER_PID" 2>/dev/null || break
    sleep 2
  done

  LOG=$(cat "$LOGFILE" 2>/dev/null || true)
  kill "$DOCKER_PID" 2>/dev/null || true
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

  [[ "$OK" == "1" ]] && break
  # O Wine falha de forma intermitente ("Bad file descriptor") na compressao.
  echo "⚠ Tentativa $TENTATIVA falhou, repetindo..." >&2
  tail -3 <<<"$LOG" >&2
done

if [[ "$OK" != "1" ]]; then
  echo "✗ A compilacao falhou nas 3 tentativas:" >&2
  tail -30 <<<"$LOG" >&2
  exit 1
fi

mv output/*.exe ../dist-installer/
rm -rf output payload

echo
echo "✓ Instalador gerado:"
ls -lh ../dist-installer/*.exe
