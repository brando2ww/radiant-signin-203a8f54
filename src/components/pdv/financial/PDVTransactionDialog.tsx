import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { pdvFinancialTransactionSchema, type PDVFinancialTransactionFormData } from "@/lib/validations/pdv-financial-transaction";
import { usePDVCostCenters } from "@/hooks/use-pdv-cost-centers";
import { usePDVChartOfAccounts } from "@/hooks/use-pdv-chart-of-accounts";
import { usePDVBankAccounts } from "@/hooks/use-pdv-bank-accounts";
import { usePDVSuppliers } from "@/hooks/use-pdv-suppliers";
import { usePDVCustomers } from "@/hooks/use-pdv-customers";
import { CurrencyInput } from "@/components/ui/currency-input";
import type { PDVFinancialTransaction } from "@/hooks/use-pdv-financial-transactions";

interface PDVTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: PDVFinancialTransaction;
  onSubmit: (data: any) => Promise<void>;
}

export function PDVTransactionDialog({ open, onOpenChange, transaction, onSubmit }: PDVTransactionDialogProps) {
  const { costCenters } = usePDVCostCenters();
  const { accounts } = usePDVChartOfAccounts();
  const { bankAccounts } = usePDVBankAccounts();
  const { suppliers } = usePDVSuppliers();
  const { customers } = usePDVCustomers();

  const getDefaults = (t?: PDVFinancialTransaction): PDVFinancialTransactionFormData =>
    t
      ? {
          transaction_type: t.transaction_type,
          description: t.description,
          amount: t.amount,
          due_date: new Date(t.due_date),
          payment_date: t.payment_date ? new Date(t.payment_date) : undefined,
          status: t.status,
          chart_account_id: t.chart_account_id || undefined,
          cost_center_id: t.cost_center_id || undefined,
          bank_account_id: t.bank_account_id || undefined,
          supplier_id: t.supplier_id || undefined,
          customer_id: t.customer_id || undefined,
          payment_method: t.payment_method || undefined,
          document_number: t.document_number || undefined,
          notes: t.notes || undefined,
        }
      : {
          transaction_type: 'payable',
          status: 'pending',
          amount: 0,
          description: '',
          due_date: new Date(),
        };

  const form = useForm<PDVFinancialTransactionFormData>({
    resolver: zodResolver(pdvFinancialTransactionSchema),
    defaultValues: getDefaults(transaction),
  });

  useEffect(() => {
    if (open) form.reset(getDefaults(transaction));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction?.id]);

  const transactionType = form.watch('transaction_type');
  const status = form.watch('status');
  const paymentDate = form.watch('payment_date');

  // Auto-update status when payment_date is set
  useEffect(() => {
    if (paymentDate && status === 'pending') {
      form.setValue('status', 'paid');
    }
  }, [paymentDate, status, form]);

  const handleSubmit = async (data: PDVFinancialTransactionFormData) => {
    try {
      await onSubmit(transaction ? { id: transaction.id, ...data } : data);
      onOpenChange(false);
      form.reset(getDefaults());
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao salvar lançamento');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {transaction ? 'Editar Lançamento' : 'Novo Lançamento Financeiro'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="transaction_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Lançamento</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="payable" id="payable" />
                        <label htmlFor="payable" className="text-sm font-medium text-destructive cursor-pointer">
                          Conta a Pagar
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="receivable" id="receivable" />
                        <label htmlFor="receivable" className="text-sm font-medium text-success cursor-pointer">
                          Conta a Receber
                        </label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Pagamento de fornecedor" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor *</FormLabel>
                    <FormControl>
                      <CurrencyInput
                        value={field.value?.toString() || ""}
                        onChange={(value) => field.onChange(parseFloat(value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Vencimento *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                          >
                            {field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          locale={ptBR}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pending">Pendente</SelectItem>
                        <SelectItem value="paid">Pago</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                        <SelectItem value="overdue">Vencido</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {(status === 'paid' || paymentDate) && (
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="payment_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de Pagamento</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                            >
                              {field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value || undefined}
                            onSelect={field.onChange}
                            locale={ptBR}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="payment_method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Método de Pagamento</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="dinheiro">Dinheiro</SelectItem>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="credito">Cartão de Crédito</SelectItem>
                          <SelectItem value="debito">Cartão de Débito</SelectItem>
                          <SelectItem value="boleto">Boleto</SelectItem>
                          <SelectItem value="transferencia">Transferência</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="chart_account_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conta Contábil</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.code} - {acc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cost_center_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Centro de Custo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {costCenters.map((cc) => (
                          <SelectItem key={cc.id} value={cc.id}>
                            {cc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="bank_account_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conta Bancária</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {bankAccounts.map((ba) => (
                          <SelectItem key={ba.id} value={ba.id}>
                            {ba.name} - {ba.bank_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {transactionType === 'payable' ? (
                <FormField
                  control={form.control}
                  name="supplier_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fornecedor</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {suppliers.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.company_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="customer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customers.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="document_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número do Documento</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: NF 12345" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Informações adicionais..."
                      {...field}
                      value={field.value || ''}
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                {transaction ? 'Salvar' : 'Criar'} Lançamento
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}