import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { CheckCircle, Edit, ExternalLink, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import type { PDVFinancialTransaction } from "@/hooks/use-pdv-financial-transactions";
import { temCobrancaAtiva } from "@/hooks/use-vendas-financeiro";
import { SituacaoCobrancaBadge } from "./SituacaoCobrancaBadge";
import { dataBR } from "./fin-utils";

/** Lançamento do financeiro com as colunas da Força de vendas (o select do hook traz `*`). */
export type ReceberLinha = PDVFinancialTransaction & {
  vendas_pedido_id?: string | null;
  asaas_payment_id?: string | null;
  asaas_status?: string | null;
  charge_url?: string | null;
  bank_slip_url?: string | null;
  pdv_customers?: { name: string } | null;
  pdv_cost_centers?: { name: string } | null;
};

function vencida(t: ReceberLinha) {
  const hoje = format(new Date(), "yyyy-MM-dd");
  return t.status === "overdue" || (t.status === "pending" && t.due_date < hoje);
}

function Situacao({ t }: { t: ReceberLinha }) {
  if (t.status === "paid") return <Badge className="bg-success">Recebido</Badge>;
  if (t.status === "cancelled") return <Badge variant="secondary">Cancelado</Badge>;
  if (vencida(t)) return <Badge variant="destructive">Vencido</Badge>;
  return <Badge variant="outline">Pendente</Badge>;
}

function Cobranca({ t }: { t: ReceberLinha }) {
  const link = t.charge_url || t.bank_slip_url;
  const aberta = t.status === "pending" || t.status === "overdue";
  if (!t.asaas_payment_id && !link) {
    if (t.vendas_pedido_id && aberta)
      return (
        <Link to="/pdv/vendas/cobrancas" className="text-xs font-medium text-primary underline underline-offset-2">
          Gerar cobrança
        </Link>
      );
    return <span className="text-xs text-muted-foreground">·</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <SituacaoCobrancaBadge status={t.asaas_status} />
      {link && (
        <a href={link} target="_blank" rel="noreferrer" title="Abrir a cobrança" className="text-muted-foreground hover:text-primary">
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </span>
  );
}

function Pedido({ t }: { t: ReceberLinha }) {
  if (!t.vendas_pedido_id) return null;
  return (
    <Link to={`/pdv/vendas/pedidos/${t.vendas_pedido_id}`} className="text-xs font-medium text-primary underline-offset-2 hover:underline">
      Ver pedido
    </Link>
  );
}

interface Props {
  transactions: ReceberLinha[];
  onEdit: (t: PDVFinancialTransaction) => void;
  onDelete: (id: string) => void;
  onMarkAsPaid: (t: PDVFinancialTransaction) => void;
}

/** Lista do contas a receber com o pedido de origem e a situação da cobrança no Asaas. */
export function ReceberTable({ transactions, onEdit, onDelete, onMarkAsPaid }: Props) {
  const [excluir, setExcluir] = useState<string | null>(null);
  const [avisoAsaas, setAvisoAsaas] = useState<ReceberLinha | null>(null);

  const receber = (t: ReceberLinha) => {
    // Baixa manual com cobrança aberta no Asaas: o cliente ainda consegue pagar o link e pagar duas vezes.
    if (temCobrancaAtiva(t)) setAvisoAsaas(t);
    else onMarkAsPaid(t);
  };

  if (transactions.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <p>Nenhuma conta a receber encontrada</p>
        <p className="mt-2 text-sm">As parcelas dos pedidos da Força de vendas aparecem aqui sozinhas.</p>
      </div>
    );
  }

  const acoes = (t: ReceberLinha) => (
    <div className="flex justify-end gap-1">
      {(t.status === "pending" || t.status === "overdue") && (
        <Button size="sm" variant="ghost" onClick={() => receber(t)} title="Marcar como recebido">
          <CheckCircle className="h-4 w-4" />
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => onEdit(t)} title="Editar">
        <Edit className="h-4 w-4" />
      </Button>
      {t.status !== "paid" && !temCobrancaAtiva(t) && (
        <Button size="sm" variant="ghost" onClick={() => setExcluir(t.id)} title="Excluir">
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  return (
    <>
      <div className="hidden rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vencimento</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Cobrança</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) => (
              <TableRow key={t.id} className={vencida(t) ? "bg-destructive/5" : ""}>
                <TableCell className="whitespace-nowrap">{dataBR(t.due_date)}</TableCell>
                <TableCell className="max-w-[18rem]">
                  <p className="truncate font-medium">{t.description}</p>
                  <Pedido t={t} />
                </TableCell>
                <TableCell className="max-w-[14rem] truncate">{t.pdv_customers?.name || "·"}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <span className="text-success">{formatBRL(t.amount)}</span>
                </TableCell>
                <TableCell><Situacao t={t} /></TableCell>
                <TableCell><Cobranca t={t} /></TableCell>
                <TableCell className="text-right">{acoes(t)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 md:hidden">
        {transactions.map((t) => (
          <Card key={t.id} className={cn("p-3", vencida(t) && "border-destructive/40")}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{t.pdv_customers?.name || t.description}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
                <Pedido t={t} />
              </div>
              <p className="shrink-0 font-semibold tabular-nums text-success">{formatBRL(t.amount)}</p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className={cn(vencida(t) && "font-medium text-destructive")}>Vence {dataBR(t.due_date)}</span>
              <Situacao t={t} />
              <Cobranca t={t} />
            </div>
            <div className="mt-1">{acoes(t)}</div>
          </Card>
        ))}
      </div>

      <AlertDialog open={!!excluir} onOpenChange={(v) => !v && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (excluir) onDelete(excluir);
                setExcluir(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!avisoAsaas} onOpenChange={(v) => !v && setAvisoAsaas(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Esta parcela tem cobrança aberta no Asaas</AlertDialogTitle>
            <AlertDialogDescription>
              Se o cliente pagou por fora, cancele também a cobrança em Cobranças, para ele não pagar duas vezes pelo
              link. Quando o pagamento é feito pelo Asaas, a baixa acontece sozinha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (avisoAsaas) onMarkAsPaid(avisoAsaas);
                setAvisoAsaas(null);
              }}
            >
              Dar baixa mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
