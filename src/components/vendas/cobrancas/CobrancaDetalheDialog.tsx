import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Ban, Copy, ExternalLink, FileText, Loader2, Mail, MessageCircle, RefreshCw, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
import { formatBRL } from "@/lib/format";
import {
  estaVencida,
  useAtualizarCobrancas,
  useCancelarCobranca,
  useEnviarCobranca,
  type CobrancaLinha,
} from "@/hooks/use-vendas-cobrancas";
import { mensagemDeErro, temCobrancaAtiva } from "@/hooks/use-vendas-financeiro";
import { SituacaoCobrancaBadge } from "@/components/vendas/financeiro/SituacaoCobrancaBadge";
import { copiar, dataBR, documentoBR, linkWhatsApp, telefoneWhatsApp } from "@/components/vendas/financeiro/fin-utils";
import { nomeCliente } from "./GerarCobrancaDialog";

interface Props {
  linha: CobrancaLinha | null;
  nomeEmpresa?: string;
  onOpenChange: (v: boolean) => void;
}

/** Mensagem de cobrança para o WhatsApp (o link do Asaas já traz boleto, PIX ou cartão). */
export function mensagemCobranca(l: CobrancaLinha, nomeEmpresa?: string) {
  const contato = l.pdv_customers?.contact_name?.split(" ")[0];
  const link = l.charge_url || l.bank_slip_url;
  const partes = [
    `Olá${contato ? `, ${contato}` : ""}!${nomeEmpresa ? ` Aqui é da ${nomeEmpresa}.` : ""}`,
    `Segue a cobrança de ${l.description}, no valor de ${formatBRL(l.amount)}, com vencimento em ${dataBR(l.due_date)}.`,
  ];
  if (link) partes.push(`Para pagar: ${link}`);
  else if (l.pix_payload) partes.push(`PIX copia e cola:\n${l.pix_payload}`);
  return partes.join("\n\n");
}

export function CobrancaDetalheDialog({ linha, nomeEmpresa, onOpenChange }: Props) {
  const cancelar = useCancelarCobranca();
  const atualizar = useAtualizarCobrancas();
  const enviar = useEnviarCobranca();
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);

  const l = linha;
  const cli = l?.pdv_customers;
  const fone = telefoneWhatsApp(cli?.whatsapp, cli?.phone);
  const ativa = l ? temCobrancaAtiva(l) : false;
  const podeCancelar = !!l && ativa && l.status !== "paid";

  const doAtualizar = async () => {
    if (!l) return;
    try {
      await atualizar.mutateAsync([l.id]);
      toast.success("Situação atualizada com o Asaas");
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não consegui atualizar."));
    }
  };

  const doCancelar = async () => {
    if (!l) return;
    try {
      await cancelar.mutateAsync(l.id);
      toast.success("Cobrança cancelada no Asaas. A parcela continua em aberto no contas a receber.");
      setConfirmarCancelamento(false);
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não consegui cancelar."));
    }
  };

  const doEnviar = async (channel: "whatsapp" | "email") => {
    if (!l) return;
    try {
      await enviar.mutateAsync({ id: l.id, channel });
      toast.success(channel === "email" ? "Cobrança enviada por e-mail" : "Cobrança enviada pelo WhatsApp");
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não consegui enviar."));
    }
  };

  return (
    <>
      <Dialog open={!!l} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {l && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6">{nomeCliente(l)}</DialogTitle>
                <DialogDescription className="break-words">
                  {l.description}
                  {cli?.cnpj || cli?.cpf ? ` · ${documentoBR(cli?.cnpj || cli?.cpf)}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3 rounded-md border p-3 text-sm sm:grid-cols-[1fr_1fr_auto]">
                <div>
                  <p className="text-xs text-muted-foreground">Valor</p>
                  <p className="font-semibold tabular-nums">{formatBRL(l.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vencimento</p>
                  <p className={estaVencida(l) ? "font-medium text-destructive" : "font-medium"}>{dataBR(l.due_date)}</p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-xs text-muted-foreground">Cobrança</p>
                  <SituacaoCobrancaBadge status={l.asaas_status} />
                </div>
                {l.vendas_pedido_id && (
                  <div className="col-span-2 sm:col-span-3">
                    <Link to={`/pdv/vendas/pedidos/${l.vendas_pedido_id}`} className="text-sm font-medium text-primary underline underline-offset-2">
                      Ver pedido {l.document_number || ""}
                    </Link>
                  </div>
                )}
              </div>

              {!l.asaas_payment_id && !l.charge_url && !l.bank_slip_url && !l.pix_payload ? (
                <p className="text-sm text-muted-foreground">Esta parcela ainda não tem cobrança gerada no Asaas.</p>
              ) : (
                <div className="space-y-3">
                  {l.charge_url && (
                    <LinhaLink rotulo="Link de pagamento" url={l.charge_url} icone={<ExternalLink className="h-3.5 w-3.5" />} />
                  )}
                  {l.bank_slip_url && (
                    <LinhaLink rotulo="Boleto (PDF)" url={l.bank_slip_url} icone={<FileText className="h-3.5 w-3.5" />} />
                  )}
                  {l.pix_payload && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">PIX copia e cola</p>
                      <Textarea readOnly value={l.pix_payload} className="h-20 resize-none font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                      <Button size="sm" variant="outline" onClick={() => copiar(l.pix_payload!, "PIX copia e cola copiado")}>
                        <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar PIX
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {(l.charge_url || l.bank_slip_url || l.pix_payload) && l.status !== "paid" && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Mandar para o cliente</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <a href={linkWhatsApp(fone, mensagemCobranca(l, nomeEmpresa))} target="_blank" rel="noreferrer">
                          <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Abrir no WhatsApp
                        </a>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => doEnviar("whatsapp")} disabled={enviar.isPending || !fone}>
                        {enviar.isPending && enviar.variables?.channel === "whatsapp" ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Enviar pelo WhatsApp do Velara
                      </Button>
                      {cli?.email && (
                        <Button size="sm" variant="outline" onClick={() => doEnviar("email")} disabled={enviar.isPending}>
                          {enviar.isPending && enviar.variables?.channel === "email" ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Mail className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Enviar por e-mail
                        </Button>
                      )}
                    </div>
                    {!fone && <p className="text-xs text-muted-foreground">O cliente não tem WhatsApp cadastrado.</p>}
                  </div>
                </>
              )}

              {l.asaas_payment_id && (
                <>
                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={doAtualizar} disabled={atualizar.isPending}>
                      {atualizar.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                      Atualizar situação
                    </Button>
                    {podeCancelar && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmarCancelamento(true)}
                      >
                        <Ban className="mr-1.5 h-3.5 w-3.5" /> Cancelar cobrança
                      </Button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarCancelamento} onOpenChange={setConfirmarCancelamento}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar a cobrança no Asaas?</AlertDialogTitle>
            <AlertDialogDescription>
              O link, o boleto e o PIX deixam de valer. A parcela continua em aberto no contas a receber, e você pode
              gerar uma cobrança nova depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelar.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); doCancelar(); }}
              disabled={cancelar.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancelar cobrança
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function LinhaLink({ rotulo, url, icone }: { rotulo: string; url: string; icone: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <div className="flex min-w-0 items-center gap-2">
        <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-2 py-1.5 text-xs text-primary hover:underline">
          {url}
        </a>
        <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => copiar(url, "Link copiado")} title="Copiar">
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" asChild title="Abrir">
          <a href={url} target="_blank" rel="noreferrer">{icone}</a>
        </Button>
      </div>
    </div>
  );
}
