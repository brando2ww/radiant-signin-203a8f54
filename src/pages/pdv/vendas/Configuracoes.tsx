import { useState } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Plug, PlugZap, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AMBIENTE_LABEL,
  mensagemDeErro,
  useConectarAsaas,
  useDesconectarAsaas,
  useVendasAsaas,
} from "@/hooks/use-vendas-financeiro";
import { documentoBR } from "@/components/vendas/financeiro/fin-utils";

type Ambiente = "production" | "sandbox";

/** Prefixo da chave do Asaas: `$aact_prod_` (produção) ou `$aact_hmlg_` (sandbox). */
function ambienteDaChave(chave: string): Ambiente | null {
  const c = chave.trim();
  if (c.startsWith("$aact_hmlg_")) return "sandbox";
  if (c.startsWith("$aact_prod_")) return "production";
  return null;
}

export default function Configuracoes() {
  const { asaas, conectado, isLoading } = useVendasAsaas();
  const conectar = useConectarAsaas();
  const desconectar = useDesconectarAsaas();

  const [editando, setEditando] = useState(false);
  const [chave, setChave] = useState("");
  const [ambiente, setAmbiente] = useState<Ambiente>("production");
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarSaida, setConfirmarSaida] = useState(false);

  const mostrarFormulario = !conectado || editando;
  const sugerido = ambienteDaChave(chave);
  const ambienteNaoBate = !!sugerido && sugerido !== ambiente;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const k = chave.trim();
    if (k.length < 20) {
      setErro("Cole a chave de API completa do Asaas. Ela começa com $aact_.");
      return;
    }
    try {
      const r = await conectar.mutateAsync({ api_key: k, environment: ambiente });
      if (!r?.ok) {
        setErro(r?.error || "O Asaas não aceitou a chave. Confira se ela está certa e se o ambiente é o mesmo da conta.");
        return;
      }
      setChave("");
      setEditando(false);
      toast.success(r.account?.name ? `Asaas conectado: ${r.account.name}` : "Asaas conectado");
      if (r.warning) toast.warning(r.warning, { duration: 12000 });
    } catch (err) {
      setErro(mensagemDeErro(err, "Não consegui conectar ao Asaas."));
    }
  };

  const sair = async () => {
    try {
      const r = await desconectar.mutateAsync();
      toast.success("Asaas desconectado. As cobranças já geradas continuam valendo no Asaas.");
      if (r?.warning) toast.warning(r.warning, { duration: 12000 });
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não consegui desconectar."));
    } finally {
      setConfirmarSaida(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Conexão com o Asaas da empresa para cobrar os clientes por boleto, PIX e cartão.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          <CardHeader className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <PlugZap className="h-5 w-5 text-primary" /> Asaas
              </CardTitle>
              {isLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <StatusBadge status={asaas?.status ?? "disconnected"} />
              )}
            </div>
            <CardDescription>
              Cada empresa usa a própria conta do Asaas: o dinheiro das cobranças cai direto nela.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : (
              <>
                {asaas && asaas.status !== "disconnected" && (
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <Info rotulo="Conta">
                      {asaas.account_name || "·"}
                      {asaas.account_document && (
                        <span className="block text-xs text-muted-foreground">{documentoBR(asaas.account_document)}</span>
                      )}
                    </Info>
                    <Info rotulo="Ambiente">{AMBIENTE_LABEL[asaas.environment] ?? asaas.environment}</Info>
                    <Info rotulo="Chave">
                      {asaas.key_hint ? <span className="font-mono">•••• {asaas.key_hint}</span> : "·"}
                    </Info>
                    <Info rotulo="Conectado em">
                      {asaas.connected_at
                        ? format(parseISO(asaas.connected_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                        : "·"}
                    </Info>
                  </dl>
                )}

                {asaas?.last_error && (
                  <Alert variant={asaas.status === "connected" ? "default" : "destructive"}>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{asaas.status === "connected" ? "Aviso do Asaas" : "Último erro do Asaas"}</AlertTitle>
                    <AlertDescription className="break-words">{asaas.last_error}</AlertDescription>
                  </Alert>
                )}

                {conectado && !editando && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => { setEditando(true); setErro(null); setAmbiente(asaas?.environment ?? "production"); }}>
                      <KeyRound className="mr-2 h-4 w-4" /> Trocar chave
                    </Button>
                    <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmarSaida(true)}>
                      <Plug className="mr-2 h-4 w-4" /> Desconectar
                    </Button>
                  </div>
                )}

                {mostrarFormulario && (
                  <form onSubmit={enviar} className="space-y-4 rounded-lg border bg-muted/30 p-4">
                    <div className="space-y-2">
                      <Label htmlFor="asaas-chave">Chave de API do Asaas</Label>
                      <Input
                        id="asaas-chave"
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="$aact_..."
                        value={chave}
                        onChange={(e) => {
                          setChave(e.target.value);
                          setErro(null);
                          const s = ambienteDaChave(e.target.value);
                          if (s) setAmbiente(s);
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        A chave fica guardada cifrada no servidor e não aparece de novo nesta tela.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Ambiente</Label>
                      <RadioGroup
                        value={ambiente}
                        onValueChange={(v) => setAmbiente(v as Ambiente)}
                        className="grid gap-2 sm:grid-cols-2"
                      >
                        {(["production", "sandbox"] as Ambiente[]).map((a) => (
                          <label
                            key={a}
                            htmlFor={`amb-${a}`}
                            className="flex cursor-pointer items-start gap-3 rounded-md border bg-background p-3 text-sm has-[:checked]:border-primary"
                          >
                            <RadioGroupItem id={`amb-${a}`} value={a} className="mt-0.5" />
                            <span>
                              <span className="font-medium">{AMBIENTE_LABEL[a]}</span>
                              <span className="block text-xs text-muted-foreground">
                                {a === "production" ? "Cobranças de verdade, com dinheiro de verdade." : "Conta de testes do Asaas, sem dinheiro de verdade."}
                              </span>
                            </span>
                          </label>
                        ))}
                      </RadioGroup>
                      {ambienteNaoBate && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Esta chave parece ser de {AMBIENTE_LABEL[sugerido!].toLowerCase()}. Confira o ambiente.
                        </p>
                      )}
                    </div>

                    {erro && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Não foi possível conectar</AlertTitle>
                        <AlertDescription className="break-words">{erro}</AlertDescription>
                      </Alert>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={conectar.isPending || !chave.trim()}>
                        {conectar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                        {conectado ? "Salvar nova chave" : "Conectar"}
                      </Button>
                      {editando && (
                        <Button type="button" variant="ghost" onClick={() => { setEditando(false); setChave(""); setErro(null); }}>
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </form>
                )}

                {conectado && !editando && (
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    Pronto para cobrar. Gere boleto, PIX ou link de cartão na tela de Cobranças. Quando o cliente paga, a
                    parcela é baixada sozinha e a comissão do representante nasce na hora.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Onde pegar a chave</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Entre na sua conta do Asaas.</li>
              <li>
                Abra <strong>Integrações</strong> e depois <strong>Chave de API</strong>.
              </li>
              <li>Gere uma chave nova, copie e cole aqui. O Asaas mostra a chave uma vez só.</li>
            </ol>
            <p className="text-muted-foreground">
              Para testar sem dinheiro de verdade, crie uma conta em sandbox.asaas.com e escolha o ambiente Sandbox.
            </p>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmarSaida} onOpenChange={setConfirmarSaida}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar o Asaas?</AlertDialogTitle>
            <AlertDialogDescription>
              O Velara deixa de gerar cobranças e de receber os avisos de pagamento. As cobranças já enviadas continuam
              valendo no Asaas, mas a baixa automática para até você conectar de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={desconectar.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); sair(); }}
              disabled={desconectar.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {desconectar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({ status }: { status: "connected" | "disconnected" | "error" }) {
  if (status === "connected")
    return <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Conectado</Badge>;
  if (status === "error") return <Badge variant="destructive">Com erro</Badge>;
  return <Badge variant="outline">Não conectado</Badge>;
}

function Info({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 break-words font-medium">{children}</dd>
    </div>
  );
}
