import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Loader2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatBRL } from "@/lib/format";
import {
  COBRANCA_TIPO_LABEL,
  useGerarCobranca,
  type CobrancaLinha,
  type CobrancaResultado,
  type CobrancaTipo,
} from "@/hooks/use-vendas-cobrancas";
import { mensagemDeErro } from "@/hooks/use-vendas-financeiro";
import { copiar, dataBR } from "@/components/vendas/financeiro/fin-utils";

const TIPOS: { valor: CobrancaTipo; detalhe: string }[] = [
  { valor: "BOLETO", detalhe: "Boleto bancário. O cliente paga no banco ou pelo app." },
  { valor: "PIX", detalhe: "QR Code e PIX copia e cola. Cai na hora." },
  { valor: "CREDIT_CARD", detalhe: "Link para pagar com cartão de crédito." },
  { valor: "UNDEFINED", detalhe: "Link do Asaas em que o cliente escolhe boleto, PIX ou cartão." },
];

function tipoSugerido(linhas: CobrancaLinha[]): CobrancaTipo {
  const formas = new Set(linhas.map((l) => l.payment_method));
  if (formas.size !== 1) return "UNDEFINED";
  const f = [...formas][0];
  if (f === "boleto") return "BOLETO";
  if (f === "pix") return "PIX";
  if (f === "cartao") return "CREDIT_CARD";
  return "UNDEFINED";
}

export function nomeCliente(l: Pick<CobrancaLinha, "pdv_customers">) {
  const c = l.pdv_customers;
  return c?.trade_name || c?.name || c?.company_name || "Sem cliente";
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  linhas: CobrancaLinha[];
  onConcluido?: () => void;
}

/** Escolher a forma (boleto, PIX, cartão ou o cliente escolhe), gerar no Asaas e mostrar o resultado de cada parcela. */
export function GerarCobrancaDialog({ open, onOpenChange, linhas, onConcluido }: Props) {
  const gerar = useGerarCobranca();
  const [tipo, setTipo] = useState<CobrancaTipo>("UNDEFINED");
  const [resultados, setResultados] = useState<CobrancaResultado[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Guarda as parcelas do envio: a lista da tela muda quando a consulta é refeita.
  const [enviadas, setEnviadas] = useState<CobrancaLinha[]>([]);

  useEffect(() => {
    if (open) {
      setTipo(tipoSugerido(linhas));
      setResultados(null);
      setErro(null);
      setEnviadas(linhas);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const total = useMemo(() => enviadas.reduce((s, l) => s + Number(l.amount || 0), 0), [enviadas]);
  const semDocumento = useMemo(
    () => [...new Set(enviadas.filter((l) => !l.pdv_customers?.cnpj && !l.pdv_customers?.cpf).map((l) => nomeCliente(l)))],
    [enviadas],
  );
  const semCliente = enviadas.some((l) => !l.customer_id);
  const porId = useMemo(() => new Map(enviadas.map((l) => [l.id, l])), [enviadas]);

  const confirmar = async () => {
    setErro(null);
    try {
      const r = await gerar.mutateAsync({ transaction_ids: enviadas.map((l) => l.id), billing_type: tipo });
      const lista = r?.results ?? [];
      setResultados(lista);
      const ok = lista.filter((x) => x.ok).length;
      if (ok === lista.length && ok > 0) toast.success(ok === 1 ? "Cobrança gerada" : `${ok} cobranças geradas`);
      else if (ok > 0) toast.warning(`${ok} de ${lista.length} cobranças geradas`);
      else toast.error("Nenhuma cobrança foi gerada");
      onConcluido?.();
    } catch (e) {
      setErro(mensagemDeErro(e, "Não consegui gerar a cobrança."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !gerar.isPending && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{resultados ? "Resultado" : "Gerar cobrança"}</DialogTitle>
          <DialogDescription>
            {enviadas.length} {enviadas.length === 1 ? "parcela" : "parcelas"} · {formatBRL(total)}
          </DialogDescription>
        </DialogHeader>

        {!resultados ? (
          <div className="space-y-4">
            <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as CobrancaTipo)} className="gap-2">
              {TIPOS.map((t) => (
                <label
                  key={t.valor}
                  htmlFor={`tipo-${t.valor}`}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <RadioGroupItem id={`tipo-${t.valor}`} value={t.valor} className="mt-0.5" />
                  <span>
                    <span className="font-medium">{COBRANCA_TIPO_LABEL[t.valor]}</span>
                    <span className="block text-xs text-muted-foreground">{t.detalhe}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>

            {(semDocumento.length > 0 || semCliente) && (
              <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  {semCliente && <p>Há parcela sem cliente: o Asaas não cobra sem saber de quem.</p>}
                  {semDocumento.length > 0 && (
                    <p className="break-words">
                      O Asaas pede CPF ou CNPJ do cliente. Sem documento: {semDocumento.join(", ")}.
                    </p>
                  )}
                </div>
              </div>
            )}

            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
              {enviadas.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {nomeCliente(l)} <span className="text-muted-foreground">· {dataBR(l.due_date)}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{formatBRL(l.amount)}</span>
                </li>
              ))}
            </ul>

            {erro && (
              <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="break-words">{erro}</p>
              </div>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {resultados.length === 0 && (
              <li className="text-sm text-muted-foreground">O serviço de cobrança não devolveu nenhum resultado.</li>
            )}
            {resultados.map((r) => {
              const l = porId.get(r.transaction_id);
              const link = r.charge_url || r.bank_slip_url;
              return (
                <li key={r.transaction_id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-start gap-2">
                    {r.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {l ? nomeCliente(l) : "Parcela"}{" "}
                        {l && <span className="font-normal text-muted-foreground">· {formatBRL(l.amount)}</span>}
                      </p>
                      {r.ok && r.already_charged && (
                        <p className="mt-1 text-xs text-muted-foreground">Já tinha cobrança no Asaas: estes são os dados dela.</p>
                      )}
                      {r.ok ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {link && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => copiar(link, "Link copiado")}>
                                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar link
                              </Button>
                              <Button size="sm" variant="outline" asChild>
                                <a href={link} target="_blank" rel="noreferrer">
                                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Abrir
                                </a>
                              </Button>
                            </>
                          )}
                          {r.pix_payload && (
                            <Button size="sm" variant="outline" onClick={() => copiar(r.pix_payload!, "PIX copia e cola copiado")}>
                              <Copy className="mr-1.5 h-3.5 w-3.5" /> PIX copia e cola
                            </Button>
                          )}
                        </div>
                      ) : (
                        <p className="mt-1 break-words text-destructive">{r.error || "Não foi possível gerar."}</p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter className="gap-2">
          {!resultados ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={gerar.isPending}>
                Cancelar
              </Button>
              <Button onClick={confirmar} disabled={gerar.isPending || enviadas.length === 0}>
                {gerar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gerar {enviadas.length === 1 ? "cobrança" : `${enviadas.length} cobranças`}
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
