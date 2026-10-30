import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useClosedComandaDetail } from "@/hooks/use-comanda-history";
import { formatBRL } from "@/lib/format";
import { historyPaymentSummary, historyTimestamp } from "@/lib/comanda-history";
import { paymentMethodLabel } from "@/lib/financial/payment-method-keys";
import { formatTableLabel } from "@/utils/formatTableNumber";
import { whatsappCustomerUrl } from "@/lib/customer-consumption";
import { Printer } from "lucide-react";
import { printClosedComandaReceipt } from "@/lib/print-comanda-history";

export function ClosedComandaDialog({ comandaId, onOpenChange, onSelectComanda }: {
  comandaId: string | null; onOpenChange: (open: boolean) => void; onSelectComanda: (id: string) => void;
}) {
  const { data, isLoading, error, refetch } = useClosedComandaDetail(comandaId, !!comandaId);
  const payment = data ? historyPaymentSummary(data) : null;
  const attendance = data?.atendimento;
  const location = attendance ? attendance.balcao ? "Balcão" : attendance.mesa ? formatTableLabel(attendance.mesa) : "Mesa não identificada" : "Balcão / avulsa";
  const whatsapp = whatsappCustomerUrl(data?.comanda.telefone);
  return (
    <Dialog open={!!comandaId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Comanda fechada {data ? `#${data.comanda.numero}` : ""}</DialogTitle>
          <DialogDescription>Consumo e cobrança registrados no atendimento.</DialogDescription>
        </DialogHeader>
        {isLoading && <p className="py-8 text-center">Carregando comanda…</p>}
        {error && <Alert variant="destructive"><AlertDescription>
          Não foi possível consultar esta comanda. <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
        </AlertDescription></Alert>}
        {data && payment && <div className="space-y-5">
          <Button variant="outline" onClick={() => printClosedComandaReceipt(data)}><Printer className="h-4 w-4 mr-2" />Reimprimir comanda</Button>
          <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
            <div className="flex flex-wrap gap-2 items-center"><strong>{location}</strong><Badge variant="secondary">Fechada</Badge>{attendance && <span>Atendimento {attendance.numero}</span>}</div>
            <p className="font-medium">{data.comanda.cliente || "Cliente não identificado"}</p>
            {data.comanda.telefone && <p>{whatsapp ? <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="underline">{data.comanda.telefone} · WhatsApp</a> : data.comanda.telefone}</p>}
            <p>Abertura: {historyTimestamp(data.comanda.aberta_em)}</p>
            <p>Fechamento: {historyTimestamp(data.comanda.fechada_em)}</p>
          </div>

          <section className="space-y-2">
            <h3 className="font-semibold">Itens consumidos</h3>
            {data.itens.length === 0 ? <p className="text-sm text-muted-foreground">Não há itens preservados nesta comanda.</p> : <div className="overflow-x-auto border rounded-lg"><table className="w-full text-sm">
              <thead className="bg-muted/50"><tr><th className="p-2 text-left">Produto</th><th className="p-2 text-right">Qtd.</th><th className="p-2 text-right whitespace-nowrap">Unitário</th><th className="p-2 text-right">Subtotal</th></tr></thead>
              <tbody>{data.itens.map((item) => <tr key={item.id} className="border-t">
                <td className={`p-2 ${item.complemento ? "pl-5 text-muted-foreground" : "font-medium"}`}>{item.complemento && "↳ "}{item.produto}{item.observacoes && <p className="font-normal text-xs text-muted-foreground">{item.observacoes}</p>}</td>
                <td className="p-2 text-right">{item.quantidade}</td><td className="p-2 text-right whitespace-nowrap">{formatBRL(item.preco_unitario)}</td><td className="p-2 text-right whitespace-nowrap">{item.complemento ? "Incluído" : formatBRL(item.subtotal)}</td>
              </tr>)}</tbody>
            </table></div>}
            <div className="flex justify-between font-semibold"><span>Consumo desta comanda</span><span>{formatBRL(data.comanda.consumo)}</span></div>
            {data.comanda.observacoes && <p className="text-sm text-muted-foreground">Observações: {data.comanda.observacoes}</p>}
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">Cobrança registrada {payment.scope === "atendimento" ? "no atendimento" : "na comanda"}</h3>
            {payment.scope === "atendimento" && <p className="text-sm text-muted-foreground">Estes pagamentos abrangem o atendimento {attendance?.numero}, que pode reunir várias comandas e pagamentos parciais.</p>}
            {payment.payments.length === 0 ? <p className="text-sm text-muted-foreground">Não há pagamento vinculado preservado neste registro antigo. O consumo acima não confirma quanto foi recebido.</p> : <div className="space-y-2">
              {payment.payments.map((row) => <div key={row.id} className="border rounded-lg p-3 flex justify-between gap-3 text-sm">
                <div><p className="font-medium">{paymentMethodLabel(row.forma)}</p><p className="text-xs text-muted-foreground">{historyTimestamp(row.data)}</p>
                  {Number(row.recebido) > 0 && <p className="text-xs text-muted-foreground">Entregue em dinheiro: {formatBRL(row.recebido!)} · Troco: {formatBRL(row.troco || 0)}</p>}
                  {row.motivo_desconto && <p className="text-xs text-muted-foreground">{row.motivo_desconto}</p>}
                </div><strong className="whitespace-nowrap">{formatBRL(row.valor)}</strong>
              </div>)}
              <div className="flex justify-between font-semibold"><span>Total dos pagamentos {payment.scope === "atendimento" ? "do atendimento" : "da comanda"}</span><span>{formatBRL(payment.total!)}</span></div>
            </div>}
            {Number(attendance?.desconto) > 0 && <p className="text-sm">Desconto registrado no atendimento: {formatBRL(attendance!.desconto!)}</p>}
            {Number(attendance?.taxa_servico_paga || attendance?.taxa_servico) > 0 && <p className="text-sm">Taxa de serviço registrada no atendimento: {formatBRL(attendance!.taxa_servico_paga || attendance!.taxa_servico!)}</p>}
            {data.cashback_usado > 0 && <p className="text-sm">Cashback usado nesta comanda: {formatBRL(data.cashback_usado)}</p>}
          </section>

          {data.comandas_atendimento.length > 1 && <section className="space-y-2"><h3 className="font-semibold">Comandas deste atendimento</h3>
            {data.comandas_atendimento.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-2 text-sm">
              <span>#{row.numero} · {row.cliente || "Sem nome"} · {row.status === "fechada" ? "Fechada" : row.status === "cancelada" ? "Cancelada" : "Em aberto"}</span>
              <span>{formatBRL(row.consumo)} {row.status === "fechada" && row.id !== comandaId && <Button size="sm" variant="ghost" onClick={() => onSelectComanda(row.id)}>Ver comanda</Button>}</span>
            </div>)}
          </section>}

          {data.cancelados.length > 0 && <section className="space-y-2"><h3 className="font-semibold">Itens cancelados</h3>{data.cancelados.map((item) => <div key={item.id} className="text-sm border rounded p-2 text-muted-foreground">
            <p>{item.quantidade}× {item.produto} · {formatBRL(item.subtotal)}</p><p>{historyTimestamp(item.data)} · {item.motivo || "Sem motivo registrado"}</p>
          </div>)}<p className="text-xs text-muted-foreground">Os itens cancelados não entram no consumo exibido acima.</p></section>}
        </div>}
      </DialogContent>
    </Dialog>
  );
}
