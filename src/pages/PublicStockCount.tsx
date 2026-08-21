import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  ArrowLeft, ArrowRight, Check, CloudOff, Loader2, List, PackageCheck, RefreshCw, ScanLine,
} from "lucide-react";
import { BarcodeScanner } from "@/components/stock-count/BarcodeScanner";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NumericKeypad, parseQtd } from "@/components/stock-count/NumericKeypad";
import {
  abrirContagem, salvarItem, pingContagem, traduzErro,
  type CounterItem, type CounterSession,
} from "@/hooks/use-stock-count";
import {
  clearSession, dequeue, enqueue, loadQueue, loadSession, saveSession,
} from "@/lib/stock-count-offline";

/** Quantidade grande demais para ser real é confirmada antes de entrar. */
const ABSURDO = 100_000;

export default function PublicStockCount() {
  const { token = "" } = useParams<{ token: string }>();

  const [sessao, setSessao] = useState<CounterSession | null>(null);
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState("");

  const [indice, setIndice] = useState(0);
  const [caixas, setCaixas] = useState("");
  const [solto, setSolto] = useState("");
  const [campoAtivo, setCampoAtivo] = useState<"caixas" | "solto">("solto");
  const [listaAberta, setListaAberta] = useState(false);
  const [leitorAberto, setLeitorAberto] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine);

  // Reabrir o link volta de onde parou: quem perdeu o celular no meio da
  // contagem não recomeça.
  useEffect(() => {
    const guardada = loadSession(token);
    if (guardada) {
      setSessao(guardada);
      setPendentes(loadQueue(guardada.session_token).length);
    }
  }, [token]);

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

  const itens = sessao?.items ?? [];
  const item: CounterItem | undefined = itens[indice];
  const contados = useMemo(() => itens.filter((i) => i.counted_qty != null).length, [itens]);

  // ---- Fila offline -------------------------------------------------------
  const enviarFila = useCallback(async () => {
    if (!sessao) return;
    const fila = loadQueue(sessao.session_token);
    if (fila.length === 0) return;
    for (const p of fila) {
      try {
        await salvarItem({
          sessionToken: sessao.session_token,
          itemId: p.itemId,
          packs: p.packs,
          loose: p.loose,
          qty: p.qty,
        });
        dequeue(sessao.session_token, p.itemId);
      } catch {
        break; // Ainda sem rede: a próxima tentativa continua daqui.
      }
    }
    setPendentes(loadQueue(sessao.session_token).length);
  }, [sessao]);

  useEffect(() => {
    if (!sessao || !online) return;
    void enviarFila();
    const t = setInterval(() => void enviarFila(), 15_000);
    return () => clearInterval(t);
  }, [sessao, online, enviarFila]);

  useEffect(() => {
    if (!sessao) return;
    const t = setInterval(() => void pingContagem(sessao.session_token), 60_000);
    return () => clearInterval(t);
  }, [sessao]);

  // ---- Entrar -------------------------------------------------------------
  const entrar = async () => {
    if (!senha) return;
    setEntrando(true);
    setErro("");
    try {
      const s = await abrirContagem(token, senha, nome || undefined);
      setSessao(s);
      saveSession(token, s);
      const primeiroNaoContado = s.items.findIndex((i) => i.counted_qty == null);
      setIndice(primeiroNaoContado >= 0 ? primeiroNaoContado : 0);
    } catch (e: any) {
      setErro(e?.message || traduzErro());
    } finally {
      setEntrando(false);
    }
  };

  // ---- Contar -------------------------------------------------------------
  const preencherCampos = useCallback((it?: CounterItem) => {
    setCaixas(it?.counted_packs != null ? String(it.counted_packs).replace(".", ",") : "");
    setSolto(it?.counted_loose != null ? String(it.counted_loose).replace(".", ",") : "");
    setCampoAtivo(it?.pack_size ? "caixas" : "solto");
  }, []);

  useEffect(() => { preencherCampos(item); }, [indice, item, preencherCampos]);

  const totalDigitado = useMemo(() => {
    const c = parseQtd(caixas) ?? 0;
    const s = parseQtd(solto) ?? 0;
    return c * (item?.pack_size ?? 0) + s;
  }, [caixas, solto, item]);

  const registrar = async (valor: { packs: number | null; loose: number | null }) => {
    if (!sessao || !item) return;
    const total = (valor.packs ?? 0) * (item.pack_size ?? 0) + (valor.loose ?? 0);

    if (total > ABSURDO) {
      const ok = window.confirm(
        `${total.toLocaleString("pt-BR")} ${item.unit} é um número muito alto. Confirma?`,
      );
      if (!ok) return;
    }

    // Grava no aparelho primeiro. O servidor é a segunda etapa, e pode falhar.
    enqueue(sessao.session_token, {
      itemId: item.id,
      packs: valor.packs,
      loose: valor.loose,
      qty: null,
      at: Date.now(),
    });
    setPendentes(loadQueue(sessao.session_token).length);

    // Reflete na tela imediatamente — a lista é a memória do operador.
    setSessao((s) =>
      s
        ? {
            ...s,
            items: s.items.map((i) =>
              i.id === item.id
                ? { ...i, counted_qty: total, counted_packs: valor.packs, counted_loose: valor.loose }
                : i,
            ),
          }
        : s,
    );

    void enviarFila();
    proximo();
  };

  // O leitor pula direto para o item, que é o ganho real: some a busca por
  // nome no meio do corredor.
  const irParaCodigo = (codigo: string) => {
    const limpo = codigo.replace(/\D/g, "");
    const idx = itens.findIndex((i) => {
      const e = (i.ean ?? "").replace(/\D/g, "");
      return e !== "" && (e === limpo || e.endsWith(limpo) || limpo.endsWith(e));
    });
    if (idx < 0) {
      toast.error("Nenhum insumo desta contagem tem esse código.");
      return;
    }
    setIndice(idx);
  };

  const proximo = () => {
    const restante = itens.findIndex((i, idx) => idx > indice && i.counted_qty == null);
    setIndice(restante >= 0 ? restante : Math.min(indice + 1, itens.length - 1));
  };

  // ---- Tela de entrada ----------------------------------------------------
  if (!sessao) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-6 shadow-sm">
          <div className="space-y-1 text-center">
            <PackageCheck className="mx-auto h-9 w-9 text-primary" />
            <h1 className="text-xl font-bold">Contagem de estoque</h1>
            <p className="text-sm text-muted-foreground">
              Digite a senha que o gestor passou para começar.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              inputMode="numeric"
              autoFocus
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && entrar()}
              className="h-12 text-center text-lg tracking-widest"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nome">Seu nome</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Para o gestor saber quem contou"
              className="h-12"
            />
          </div>

          {erro && <p className="text-center text-sm font-medium text-destructive">{erro}</p>}

          <Button className="h-12 w-full text-base" disabled={!senha || entrando} onClick={entrar}>
            {entrando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Começar a contar
          </Button>
        </div>
      </div>
    );
  }

  // ---- Fim ----------------------------------------------------------------
  const faltando = itens.filter((i) => i.counted_qty == null);
  if (!item || (faltando.length === 0 && indice >= itens.length - 1 && itens[indice]?.counted_qty != null)) {
    // continua abaixo; a tela de fim aparece pelo botão "Concluir"
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* Cabeçalho fixo: progresso e estado da rede sempre à vista. */}
      <header className="sticky top-0 z-10 border-b bg-card px-4 py-3">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{sessao.label}</p>
            <p className="text-xs text-muted-foreground">
              {contados} de {itens.length} contados
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!online && (
              <Badge variant="secondary" className="gap-1">
                <CloudOff className="h-3 w-3" /> sem sinal
              </Badge>
            )}
            {pendentes > 0 && (
              <Badge variant="outline" className="gap-1">
                <RefreshCw className="h-3 w-3" /> {pendentes}
              </Badge>
            )}
            <Button size="icon" variant="ghost" onClick={() => setLeitorAberto(true)} aria-label="Ler código de barras">
              <ScanLine className="h-5 w-5" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setListaAberta(true)} aria-label="Ver lista">
              <List className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <Progress value={(contados / Math.max(1, itens.length)) * 100} className="mx-auto mt-2 h-1.5 max-w-md" />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
        {item && (
          <>
            <div className="rounded-xl border bg-card p-4">
              {item.sector && (
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.sector}</p>
              )}
              <h2 className="text-2xl font-bold leading-tight">{item.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Contar em <span className="font-medium text-foreground">{item.unit}</span>
                {item.pack_size ? (
                  <> · embalagem de {item.pack_size.toLocaleString("pt-BR")} {item.unit}</>
                ) : null}
              </p>
              {item.expected_qty != null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Sistema: {item.expected_qty.toLocaleString("pt-BR")} {item.unit}
                </p>
              )}
            </div>

            {/* Caixas + solto: é como a pessoa realmente conta. A conta fica
                com o servidor, ela nunca multiplica nada. */}
            <div className={cn("grid gap-3", item.pack_size ? "grid-cols-2" : "grid-cols-1")}>
              {item.pack_size ? (
                <button
                  type="button"
                  onClick={() => setCampoAtivo("caixas")}
                  className={cn(
                    "rounded-lg border p-3 text-left",
                    campoAtivo === "caixas" ? "border-primary bg-primary/5" : "bg-card",
                  )}
                >
                  <span className="text-xs text-muted-foreground">Embalagens fechadas</span>
                  <p className="text-2xl font-bold tabular-nums">{caixas || "0"}</p>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setCampoAtivo("solto")}
                className={cn(
                  "rounded-lg border p-3 text-left",
                  campoAtivo === "solto" ? "border-primary bg-primary/5" : "bg-card",
                )}
              >
                <span className="text-xs text-muted-foreground">
                  {item.pack_size ? `Solto (${item.unit})` : `Quantidade (${item.unit})`}
                </span>
                <p className="text-2xl font-bold tabular-nums">{solto || "0"}</p>
              </button>
            </div>

            {item.pack_size ? (
              <p className="text-center text-sm text-muted-foreground">
                Total: <span className="font-semibold text-foreground tabular-nums">
                  {totalDigitado.toLocaleString("pt-BR")} {item.unit}
                </span>
              </p>
            ) : null}

            <NumericKeypad
              value={campoAtivo === "caixas" ? caixas : solto}
              onChange={campoAtivo === "caixas" ? setCaixas : setSolto}
            />

            <div className="grid grid-cols-2 gap-3">
              {/* Zerado é a resposta mais comum de um inventário e a mais
                  chata de digitar. Um toque resolve. */}
              <Button
                variant="outline"
                className="h-12"
                onClick={() => registrar({ packs: null, loose: 0 })}
              >
                Zerado
              </Button>
              <Button
                className="h-12"
                disabled={caixas === "" && solto === ""}
                onClick={() =>
                  registrar({ packs: parseQtd(caixas), loose: parseQtd(solto) })
                }
              >
                <Check className="mr-2 h-4 w-4" /> Confirmar
              </Button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={indice === 0}
                onClick={() => setIndice((i) => Math.max(0, i - 1))}
              >
                <ArrowLeft className="mr-1 h-4 w-4" /> Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                {indice + 1} / {itens.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={indice >= itens.length - 1}
                onClick={() => setIndice((i) => Math.min(itens.length - 1, i + 1))}
              >
                Pular <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {/* O que falta, dito antes de o operador ir embora. */}
        {faltando.length > 0 && contados > 0 && (
          <button
            type="button"
            onClick={() => setListaAberta(true)}
            className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground"
          >
            Faltam <span className="font-semibold text-foreground">{faltando.length}</span> itens ·
            toque para ver quais
          </button>
        )}
        {faltando.length === 0 && (
          <div className="rounded-lg border border-primary bg-primary/5 p-4 text-center">
            <PackageCheck className="mx-auto h-6 w-6 text-primary" />
            <p className="mt-1 font-semibold">Tudo contado!</p>
            <p className="text-sm text-muted-foreground">
              {pendentes > 0
                ? `${pendentes} item(ns) ainda subindo. Deixe a tela aberta até zerar.`
                : "Pode fechar a tela. O gestor já está vendo."}
            </p>
          </div>
        )}
      </main>

      <BarcodeScanner open={leitorAberto} onOpenChange={setLeitorAberto} onDetect={irParaCodigo} />

      {/* Lista para pular direto a um item */}
      <Dialog open={listaAberta} onOpenChange={setListaAberta}>
        <DialogContent className="p-0 sm:max-w-md">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>Itens da contagem</DialogTitle>
          </DialogHeader>
          <Command>
            <CommandInput placeholder="Buscar insumo..." className="h-11" />
            <CommandList className="max-h-[60vh]">
              <CommandEmpty>Nenhum item com esse nome.</CommandEmpty>
              <CommandGroup>
                {itens.map((i, idx) => (
                  <CommandItem
                    key={i.id}
                    value={`${i.name} ${i.sector ?? ""}`}
                    onSelect={() => { setIndice(idx); setListaAberta(false); }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        i.counted_qty != null ? "opacity-100 text-primary" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{i.name}</span>
                    <span className="ml-auto pl-2 text-xs text-muted-foreground">
                      {i.counted_qty != null
                        ? `${i.counted_qty.toLocaleString("pt-BR")} ${i.unit}`
                        : i.sector ?? ""}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  );
}
