import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { usePDVBankAccounts } from "@/hooks/use-pdv-bank-accounts";
import type { PDVFinancialTransaction } from "@/hooks/use-pdv-financial-transactions";

interface MarkAsPaidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: PDVFinancialTransaction;
  onSubmit: (data: { id: string; payment_date: Date; payment_method?: string; bank_account_id?: string }) => Promise<void>;
}

export function MarkAsPaidDialog({ open, onOpenChange, transaction, onSubmit }: MarkAsPaidDialogProps) {
  const { bankAccounts } = usePDVBankAccounts();
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [bankAccountId, setBankAccountId] = useState<string>('');

  const handleSubmit = async () => {
    if (!transaction) return;
    
    await onSubmit({
      id: transaction.id,
      payment_date: paymentDate,
      payment_method: paymentMethod || undefined,
      bank_account_id: bankAccountId || undefined,
    });
    
    onOpenChange(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar como {transaction.transaction_type === 'payable' ? 'Pago' : 'Recebido'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">Descrição</p>
            <p className="text-sm text-muted-foreground">{transaction.description}</p>
          </div>

          <div>
            <p className="text-sm font-medium">Valor</p>
            <p className={`text-lg font-bold ${transaction.transaction_type === 'payable' ? 'text-destructive' : 'text-success'}`}>
              {formatCurrency(transaction.amount)}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Data de Pagamento</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full pl-3 text-left font-normal", !paymentDate && "text-muted-foreground")}
                >
                  {paymentDate ? format(paymentDate, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={paymentDate}
                  onSelect={(date) => date && setPaymentDate(date)}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Método de Pagamento</label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="credito">Cartão de Crédito</SelectItem>
                <SelectItem value="debito">Cartão de Débito</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="transferencia">Transferência</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Conta Bancária</label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((ba) => (
                  <SelectItem key={ba.id} value={ba.id}>
                    {ba.name} - {ba.bank_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>
              Confirmar {transaction.transaction_type === 'payable' ? 'Pagamento' : 'Recebimento'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
