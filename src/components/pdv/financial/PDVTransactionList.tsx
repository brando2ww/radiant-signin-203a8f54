import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, CheckCircle, Eye } from "lucide-react";
import { format, isPast, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { PDVFinancialTransaction } from "@/hooks/use-pdv-financial-transactions";
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
import { useState } from "react";

interface PDVTransactionListProps {
  transactions: any[];
  onEdit: (transaction: PDVFinancialTransaction) => void;
  onDelete: (id: string) => void;
  onMarkAsPaid: (transaction: PDVFinancialTransaction) => void;
}

export function PDVTransactionList({ transactions, onEdit, onDelete, onMarkAsPaid }: PDVTransactionListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getStatusBadge = (status: string, dueDate: string) => {
    if (status === 'paid') {
      return <Badge className="bg-success">Pago</Badge>;
    }
    if (status === 'cancelled') {
      return <Badge variant="secondary">Cancelado</Badge>;
    }
    if (status === 'pending' && isPast(parseISO(dueDate))) {
      return <Badge variant="destructive">Vencido</Badge>;
    }
    return <Badge variant="outline">Pendente</Badge>;
  };

  const isOverdue = (status: string, dueDate: string) => {
    return status === 'pending' && isPast(parseISO(dueDate));
  };

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Nenhum lançamento encontrado</p>
        <p className="text-sm mt-2">Clique em "Novo Lançamento" para começar</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vencimento</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Fornecedor/Cliente</TableHead>
              <TableHead>Centro de Custo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((transaction) => (
              <TableRow
                key={transaction.id}
                className={isOverdue(transaction.status, transaction.due_date) ? 'bg-destructive/5' : ''}
              >
                <TableCell>
                  {format(parseISO(transaction.due_date), "dd/MM/yyyy", { locale: ptBR })}
                </TableCell>
                <TableCell>
                  <Badge variant={transaction.transaction_type === 'payable' ? 'destructive' : 'default'}>
                    {transaction.transaction_type === 'payable' ? 'A Pagar' : 'A Receber'}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{transaction.description}</TableCell>
                <TableCell>
                  {transaction.pdv_suppliers?.company_name || transaction.pdv_customers?.name || '-'}
                </TableCell>
                <TableCell>
                  {transaction.pdv_cost_centers?.name || '-'}
                </TableCell>
                <TableCell className="text-right">
                  <span className={transaction.transaction_type === 'payable' ? 'text-destructive' : 'text-success'}>
                    {formatCurrency(transaction.amount)}
                  </span>
                </TableCell>
                <TableCell>
                  {getStatusBadge(transaction.status, transaction.due_date)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {transaction.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onMarkAsPaid(transaction)}
                        title="Marcar como pago"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onEdit(transaction)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    {transaction.status !== 'paid' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteId(transaction.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
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
                if (deleteId) {
                  onDelete(deleteId);
                  setDeleteId(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
