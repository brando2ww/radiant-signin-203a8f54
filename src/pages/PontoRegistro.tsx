import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CloudOff, Clock, Loader2, MapPin, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  abrirPonto, baterComSelfie, baterPonto, minhasMarcacoes, traduzErroPonto,
  type ResultadoBatida, type SessaoPonto,
} from "@/hooks/use-ponto";
import { CameraSelfie } from "@/components/ponto/CameraSelfie";
import {
  enfileirar, idDoAparelho, lerFila, lerSessao, limparSessao, marcarTentativa,
  removerDaFila, salvarSessao, type BatidaPendente,
} from "@/lib/ponto-offline";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default function PontoRegistro() {
  const { token: tokenBruto = "" } = useParams<{ token: string }>();
  // O link chega colado do WhatsApp, com senha na linha de baixo ou ponto
  // final grudado. Extrair o uuid é mais barato que explicar o erro.
  const token = UUID_RE.exec(decodeURIComponent(tokenBruto))?.[0] ?? tokenBruto;

  const [sessao, setSessao] = useState<SessaoPonto | null>(() => lerSessao<SessaoPonto>(token));
  const [senha, setSenha] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState("");

  const [batendo, setBatendo] = useState(false);
  const [cameraAberta, setCameraAberta] = useState(false);
  const [ultima, setUltima] = useState<ResultadoBatida | null>(null);
  const [historico, setHistorico] = useState<{ nsr: number; marcado_em: string; dentro_raio: boolean | null }[]>([]);
  const [pendentes, setPendentes] = useState<BatidaPendente[]>([]);
  const [online, setOnline] = useState(() => navigator.onLine);

  // O relógio da tela é o do SERVIDOR. Guardamos a diferença medida na
  // abertura e somamos ao relógio local: assim o funcionário que adianta o
  // celular continua vendo a hora certa.
  const desvioRef = useRef(0);
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date(Date.now() + desvioRef.current)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (sessao) setPendentes(lerFila(sessao.session_token));
  }, [sessao]);

  const carregarHistorico = useCallback(async (sessionToken: string) => {
    try {
      const r = await minhasMarcacoes(sessionToken);
      desvioRef.current = new Date(r.hora_servidor).getTime() - Date.now();
      setHistorico(r.marcacoes as any);
    } catch {
      // Sem rede o histórico fica como está; a batida continua funcionando.
    }
  }, []);

  useEffect(() => {
    if (sessao) carregarHistorico(sessao.session_token);
  }, [sessao, carregarHistorico]);

  const entrar = async () => {
    setErro("");
    setEntrando(true);
    try {
      const s = await abrirPonto(token, senha, idDoAparelho());
      desvioRef.current = new Date(s.hora_servidor).getTime() - Date.now();
      salvarSessao(token, s);
      setSessao(s);
      setSenha("");
    } catch (e: any) {
      setErro(traduzErroPonto(e?.message));
    } finally {
      setEntrando(false);
    }
  };

  /** Posição com prazo curto: ninguém espera 30 segundos para bater ponto. */
  const posicao = (): Promise<GeolocationPosition | null> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(p),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
      );
    });

  const subirPendentes = useCallback(async (sessionToken: string) => {
    for (const b of lerFila(sessionToken)) {
      try {
        await baterPonto({
          sessionToken,
          latitude: b.latitude,
          longitude: b.longitude,
          accuracy: b.accuracy,
          offline: true,
          marcadoEmOffline: b.marcado_em,
        });
        removerDaFila(sessionToken, b.id);
      } catch {
        marcarTentativa(sessionToken, b.id);
        break;
      }
    }
    setPendentes(lerFila(sessionToken));
  }, []);

  useEffect(() => {
    if (online && sessao) subirPendentes(sessao.session_token);
  }, [online, sessao, subirPendentes]);

  /** Abre a câmera primeiro quando o restaurante exige foto. */
  const bater = async () => {
    if (!sessao) return;
    if (sessao.config?.exige_selfie && online) {
      setCameraAberta(true);
      return;
    }
    await registrar(null);
  };

  const registrar = async (imagem: string | null) => {
    if (!sessao) return;
    setBatendo(true);
    setErro("");
    const p = await posicao();
    const coords = {
      latitude: p?.coords.latitude ?? null,
      longitude: p?.coords.longitude ?? null,
      accuracy: p?.coords.accuracy ?? null,
    };

    try {
      const r = imagem
        ? await baterComSelfie({
            sessionToken: sessao.session_token,
            imagem,
            ...coords,
            horaDispositivo: new Date().toISOString(),
          })
        : await baterPonto({
            sessionToken: sessao.session_token,
            ...coords,
            horaDispositivo: new Date().toISOString(),
          });
      setUltima(r);
      await carregarHistorico(sessao.session_token);
    } catch (e: any) {
      if (e?.message === "batida_repetida" || e?.message === "sessao_expirada") {
        setErro(traduzErroPonto(e.message));
        if (e.message === "sessao_expirada") {
          limparSessao(token);
          setSessao(null);
        }
      } else {
        // Qualquer outra falha é tratada como falta de rede: a batida fica na
        // fila e sobe sozinha. É melhor uma batida atrasada que uma perdida.
        const pendente: BatidaPendente = {
          id: crypto.randomUUID(),
          marcado_em: new Date(Date.now() + desvioRef.current).toISOString(),
          ...coords,
          tentativas: 0,
        };
        enfileirar(sessao.session_token, pendente);
        setPendentes(lerFila(sessao.session_token));
      }
    } finally {
      setBatendo(false);
    }
  };

  // ── Entrada ─────────────────────────────────────────────────────────────
  if (!sessao) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted/30 px-6">
        <div className="text-center">
          <Clock className="mx-auto mb-3 h-10 w-10 text-primary" />
          <h1 className="text-xl font-semibold">Registro de ponto</h1>
          <p className="text-sm text-muted-foreground">Digite a senha que o gerente passou.</p>
        </div>
        <div className="w-full max-w-xs space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              inputMode="numeric"
              autoFocus
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && senha && entrar()}
            />
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <Button className="w-full" size="lg" disabled={!senha || entrando} onClick={entrar}>
            {entrando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Entrar
          </Button>
        </div>
      </div>
    );
  }

  // ── Bater ───────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <CameraSelfie
        aberto={cameraAberta}
        onCancelar={() => setCameraAberta(false)}
        onCapturar={(imagem) => {
          setCameraAberta(false);
          registrar(imagem);
        }}
      />
      <header className="flex items-center justify-between border-b bg-background px-5 py-3">
        <div>
          <p className="font-semibold leading-tight">{sessao.colaborador.nome}</p>
          {sessao.colaborador.cargo && (
            <p className="text-xs text-muted-foreground">{sessao.colaborador.cargo}</p>
          )}
        </div>
        {!online && (
          <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-600">
            <CloudOff className="h-3 w-3" /> sem rede
          </Badge>
        )}
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-8">
        <div className="text-center">
          <p className="font-mono text-6xl font-semibold tabular-nums tracking-tight">
            {agora.toLocaleTimeString("pt-BR", { hour12: false })}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">hora do servidor</p>
        </div>

        <Button size="lg" className="h-28 w-28 rounded-full text-base" disabled={batendo} onClick={bater}>
          {batendo ? <Loader2 className="h-7 w-7 animate-spin" /> : "Bater ponto"}
        </Button>

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {ultima && (
          <div className="w-full max-w-sm rounded-lg border bg-background p-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Ponto registrado às {hora(ultima.marcado_em)}</span>
            </div>
            <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <dt>Comprovante</dt>
                <dd className="font-mono">nº {ultima.nsr}</dd>
              </div>
              {ultima.dentro_raio === false && (
                <div className="flex items-center gap-1.5 text-amber-600">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>
                    Fora da área do restaurante
                    {ultima.distancia_m != null ? ` (${Math.round(ultima.distancia_m)} m)` : ""}. Registrado assim mesmo.
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt>Código</dt>
                <dd className="truncate font-mono">{ultima.hash.slice(0, 16)}…</dd>
              </div>
            </dl>
          </div>
        )}

        {pendentes.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/30">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {pendentes.length === 1
                ? "1 batida guardada, sobe sozinha quando a internet voltar."
                : `${pendentes.length} batidas guardadas, sobem sozinhas quando a internet voltar.`}
            </span>
          </div>
        )}
      </main>

      <footer className="border-t bg-background px-5 py-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Suas batidas nas últimas 48 horas
        </p>
        {historico.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma batida ainda.</p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-auto text-sm">
            {historico.map((m) => (
              <li key={m.nsr} className="flex items-center justify-between">
                <span className="tabular-nums">
                  {new Date(m.marcado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  {" · "}
                  {hora(m.marcado_em)}
                </span>
                <span className={cn("text-xs", m.dentro_raio === false ? "text-amber-600" : "text-muted-foreground")}>
                  nº {m.nsr}
                  {m.dentro_raio === false ? " · fora da área" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </footer>
    </div>
  );
}
