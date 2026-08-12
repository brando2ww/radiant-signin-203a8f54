import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreVertical, Eye, FileDown, RefreshCw, Send, Ban, Copy, FileText, Printer } from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import { toast } from "sonner";
import { FiscalCouponStatusBadge } from "./FiscalCouponStatusBadge";
import { dispatchDanfePrintJob } from "@/lib/danfe-print";
import type { FiscalCoupon } from "@/hooks/use-fiscal-coupons";

interface Props {
  coupons: FiscalCoupon[];
  isLoading?: boolean;
  onView: (c: FiscalCoupon) => void;
  onCancel: (c: FiscalCoupon) => void;
  onCheckStatus: (c: FiscalCoupon) => void;
  onResend: (c: FiscalCoupon) => void;
}

export function FiscalCouponsTable({ coupons, isLoading, onView, onCancel, onCheckStatus, onResend }: Props) {
  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nº / Série</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Pagamento</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Ambiente</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
          )}
          {!isLoading && coupons.length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum cupom encontrado no período.</TableCell></TableRow>
          )}
          {coupons.map((c) => {
            const elapsed = c.data_autorizacao ? differenceInMinutes(new Date(), new Date(c.data_autorizacao)) : null;
            const canCancel = c.status === "autorizada" && elapsed !== null && elapsed <= 30;
            const canResend = c.status === "rejeitada";
            return (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  {c.numero ?? "—"} <span className="text-muted-foreground">/ {c.serie ?? "—"}</span>
                </TableCell>
                <TableCell className="text-sm">
                  {format(new Date(c.data_emissao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </TableCell>
                <TableCell className="text-sm">
                  {c.customer_name || c.customer_cpf || <span className="text-muted-foreground">Consumidor</span>}
                </TableCell>
                <TableCell className="text-sm capitalize">{c.forma_pagamento?.replace(/_/g, " ") || "-"}</TableCell>
                <TableCell className="text-right font-medium">{formatBRL(c.valor_total)}</TableCell>
                <TableCell><FiscalCouponStatusBadge status={c.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground capitalize">{c.ambiente}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost"><MoreVertical className="w-4 h-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onView(c)}>
                        <Eye className="w-4 h-4 mr-2" /> Ver detalhes
                      </DropdownMenuItem>
                      {c.danfe_pdf_url && (
                        <DropdownMenuItem onClick={() => window.open(c.danfe_pdf_url!, "_blank")}>
                          <FileDown className="w-4 h-4 mr-2" /> Baixar DANFE (PDF)
                        </DropdownMenuItem>
                      )}
                      {c.xml_url && (
                        <DropdownMenuItem onClick={() => window.open(c.xml_url!, "_blank")}>
                          <FileText className="w-4 h-4 mr-2" /> Baixar XML
                        </DropdownMenuItem>
                      )}
                      {c.chave_acesso && (
                        <DropdownMenuItem onClick={() => {
                          navigator.clipboard.writeText(c.chave_acesso!);
                          toast.success("Chave copiada");
                        }}>
                          <Copy className="w-4 h-4 mr-2" /> Copiar chave de acesso
                        </DropdownMenuItem>
                      )}
                      {c.status === "autorizada" && (
                        <DropdownMenuItem onClick={async () => {
                          try {
                            const r = await dispatchDanfePrintJob(c.id, { reimpressao: true });
                            toast[r.jobs > 0 ? "success" : "info"](
                              r.jobs > 0
                                ? "Cupom enviado para a impressora do caixa"
                                : `Não foi possível imprimir: ${r.reason}`,
                            );
                          } catch (e: any) {
                            toast.error(e.message || "Falha ao enviar para a impressora");
                          }
                        }}>
                          <Printer className="w-4 h-4 mr-2" /> Reimprimir no caixa
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onCheckStatus(c)}>
                        <RefreshCw className="w-4 h-4 mr-2" /> Consultar status
                      </DropdownMenuItem>
                      {canResend && (
                        <DropdownMenuItem onClick={() => onResend(c)}>
                          <Send className="w-4 h-4 mr-2" /> Reenviar à Receita
                        </DropdownMenuItem>
                      )}
                      {canCancel && (
                        <DropdownMenuItem className="text-destructive" onClick={() => onCancel(c)}>
                          <Ban className="w-4 h-4 mr-2" /> Cancelar cupom
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
