import { useMemo, useState } from "react";
import { MessageSquare, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuotationInbound } from "@/hooks/use-quotation-inbound";
import { usePDVQuotations } from "@/hooks/use-pdv-quotations";
import { QuotationResponseDialog } from "@/components/pdv/purchases/QuotationResponseDialog";
import { format } from "date-fns";

/**
 * Caixa de entrada de respostas dos fornecedores recebidas por WhatsApp.
 * As mensagens chegam via edge function whatsapp-transactions (Realtime).
 * "Usar resposta" abre o registro de resposta já com o fornecedor e o texto,
 * e marca a mensagem como confirmada ao salvar.
 *
 * Quando a edge não conseguiu vincular a mensagem a uma cotação (fornecedor
 * não estava em nenhuma cotação aberta), o operador escolhe a cotação aqui
 * mesmo, num seletor — em vez de o botão ficar travado.
 */
export function QuotationInbox() {
  const { messages, ignore, markConfirmed } = useQuotationInbound({ realtime: false });
  const { quotations } = usePDVQuotations();
  const [active, setActive] = useState<{ msgId: string; ids: string[]; supplierId: string | null; body: string; quotationId: string } | null>(null);
  // Cotação escolhida manualmente por mensagem sem vínculo automático
  const [picks, setPicks] = useState<Record<string, string>>({});

  const openQuotations = useMemo(
    () => quotations.filter((q) => q.status === "pending" || q.status === "in_progress"),
    [quotations],
  );

  const activeQuotation = active ? quotations.find((q) => q.id === active.quotationId) : undefined;

  // Estado vazio: card compacto para o acesso ficar sempre visível/descoberto.
  if (messages.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-3 flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          Respostas recebidas por WhatsApp aparecerão aqui automaticamente.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-primary/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-primary" />
            Respostas recebidas por WhatsApp
            <Badge className="ml-1">{messages.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {messages.map((m) => {
            // cotação efetiva = a vinculada automaticamente OU a escolhida no seletor
            const effectiveQid = m.quotation_request_id ?? picks[m.id] ?? "";
            return (
              <div key={m.id} className="flex items-start gap-3 rounded-md border p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium flex-wrap">
                    {m.supplier?.name || m.from_phone}
                    {m.request?.request_number ? (
                      <Badge variant="outline" className="text-xs">Cotação #{m.request.request_number}</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">sem cotação vinculada</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {m.received_at ? format(new Date(m.received_at), "dd/MM HH:mm") : ""}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words">{m.body}</p>

                  {/* Sem vínculo automático: escolher a cotação manualmente */}
                  {!m.quotation_request_id && (
                    <div className="mt-2 flex items-center gap-2">
                      {openQuotations.length > 0 ? (
                        <>
                          <span className="text-xs text-muted-foreground shrink-0">Vincular à cotação:</span>
                          <Select
                            value={picks[m.id] ?? ""}
                            onValueChange={(v) => setPicks((p) => ({ ...p, [m.id]: v }))}
                          >
                            <SelectTrigger className="h-8 text-xs w-56">
                              <SelectValue placeholder="Selecione uma cotação aberta…" />
                            </SelectTrigger>
                            <SelectContent>
                              {openQuotations.map((q) => (
                                <SelectItem key={q.id} value={q.id} className="text-xs">
                                  #{q.request_number}
                                  {q.status === "in_progress" ? " · em andamento" : " · pendente"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </>
                      ) : (
                        <span className="text-xs text-amber-600">
                          Nenhuma cotação aberta para vincular. Crie uma cotação primeiro.
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button
                    size="sm"
                    disabled={!effectiveQid}
                    title={effectiveQid ? "" : "Escolha a cotação para vincular esta resposta"}
                    onClick={() =>
                      setActive({
                        msgId: m.id,
                        ids: m.ids,
                        supplierId: m.supplier_id,
                        body: m.body || "",
                        quotationId: effectiveQid,
                      })
                    }
                  >
                    <Check className="h-3.5 w-3.5 mr-1" /> Usar resposta
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => ignore(m.ids)}>
                    <X className="h-3.5 w-3.5 mr-1" /> Ignorar
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {activeQuotation && active && (
        <QuotationResponseDialog
          open={!!active}
          onOpenChange={(o) => !o && setActive(null)}
          quotation={activeQuotation}
          presetSupplierId={active.supplierId || undefined}
          presetNotes={active.body}
          inboundMessageId={active.msgId}
          onSaved={() => {
            markConfirmed(active.ids);
            setActive(null);
          }}
        />
      )}
    </>
  );
}
