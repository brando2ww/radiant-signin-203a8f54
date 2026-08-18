import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { DatePickerDialog } from "@/components/ui/date-picker-dialog";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { parseISO } from "date-fns";
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

/** Grupo de quem não tem conta-pai, para a lista não ficar com contas soltas. */
const TIPO_CONTA: Record<string, string> = {
  revenue: "Receitas",
  expense: "Despesas",
  cost: "Custos",
  asset: "Ativo",
  liability: "Passivo",
};

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
          due_date: parseISO(t.due_date),
          competence_date: t.competence_date ? parseISO(t.competence_date) : undefined,
          payment_date: t.payment_date ? parseISO(t.payment_date) : undefined,
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

  // O plano de contas é hierárquico e padronizado. Só as folhas são lançáveis;
  // as contas-pai viram cabeçalho de grupo, que é como o financeiro procura.
  const opcoesConta = useMemo<SearchSelectOption[]>(() => {
    const porId = new Map(accounts.map((a) => [a.id, a]));
    const temFilho = new Set(accounts.filter((a) => a.parent_id).map((a) => a.parent_id as string));
    return accounts
      .filter((a) => !temFilho.has(a.id))
      .map((a) => ({
        value: a.id,
        label: `${a.code} · ${a.name}`,
        group: a.parent_id
          ? porId.get(a.parent_id)?.name ?? TIPO_CONTA[a.account_type] ?? "Outras"
          : TIPO_CONTA[a.account_type] ?? "Outras",
      }));
  }, [accounts]);

  const opcoesCentro = useMemo<SearchSelectOption[]>(
    () => costCenters.map((cc) => ({ value: cc.id, label: cc.name })),
    [costCenters],
  );

  const opcoesBanco = useMemo<SearchSelectOption[]>(
    () => bankAccounts.map((ba) => ({ value: ba.id, label: ba.name, hint: ba.bank_name || undefined })),
    [bankAccounts],
  );

  const opcoesFornecedor = useMemo<SearchSelectOption[]>(
    () => suppliers.map((s) => ({ value: s.id, label: s.company_name || s.name })),
    [suppliers],
  );

  const opcoesCliente = useMemo<SearchSelectOption[]>(
    () => customers.map((c) => ({ value: c.id, label: c.name, hint: c.phone || undefined })),
    [customers],
  );

  const handleSubmit = async (data: PDVFinancialTransactionFormData) => {
    try {
      await onSubmit(transaction ? { id: transaction.id, ...data } : data);
      onOpenChange(false);
      form.reset(getDefaults());
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao salvar lançamento');
    }
  };

  const ehPagar = transactionType === 'payable';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {transaction ? 'Editar Lançamento' : 'Novo Lançamento Financeiro'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
            {/* Pagar ou receber muda o resto do formulário; é a primeira
                decisão e por isso vem como botão, não como radio miúdo. */}
            <FormField
              control={form.control}
              name="transaction_type"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { v: 'payable', rotulo: 'Conta a Pagar', Icone: ArrowDownCircle, cor: 'text-destructive', borda: 'border-destructive bg-destructive/5' },
                      { v: 'receivable', rotulo: 'Conta a Receber', Icone: ArrowUpCircle, cor: 'text-success', borda: 'border-success bg-success/10' },
                    ] as const).map(({ v, rotulo, Icone, cor, borda }) => {
                      const ativo = field.value === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => field.onChange(v)}
                          className={cn(
                            "flex items-center justify-center gap-2 rounded-md border py-2 text-sm font-medium transition-colors",
                            ativo ? borda : "hover:bg-muted/50",
                          )}
                        >
                          <Icone className={cn("h-4 w-4", ativo ? cor : "text-muted-foreground")} />
                          {rotulo}
                        </button>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="space-y-1.5 sm:col-span-2">
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
                  <FormItem className="space-y-1.5">
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

            <div className="grid gap-3 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel>Vencimento *</FormLabel>
                    <DatePickerDialog
                      value={field.value}
                      onChange={field.onChange}
                      title="Data de vencimento"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="competence_date"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel>Competência</FormLabel>
                    <DatePickerDialog
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Mesmo que vencimento"
                      title="Data de competência"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
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

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="chart_account_id"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel>Conta Contábil</FormLabel>
                    <SearchSelect
                      options={opcoesConta}
                      value={field.value}
                      onChange={field.onChange}
                      title="Plano de contas"
                      searchPlaceholder="Buscar por código ou nome..."
                      emptyText="Nenhuma conta encontrada."
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cost_center_id"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel>Centro de Custo</FormLabel>
                    <SearchSelect
                      options={opcoesCentro}
                      value={field.value}
                      onChange={field.onChange}
                      title="Centros de custo"
                      searchPlaceholder="Buscar centro de custo..."
                      emptyText="Nenhum centro de custo cadastrado."
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="bank_account_id"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel>Conta Bancária</FormLabel>
                    <SearchSelect
                      options={opcoesBanco}
                      value={field.value}
                      onChange={field.onChange}
                      title="Contas bancárias"
                      searchPlaceholder="Buscar conta..."
                      emptyText="Nenhuma conta bancária cadastrada."
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              {ehPagar ? (
                <FormField
                  control={form.control}
                  name="supplier_id"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel>Fornecedor</FormLabel>
                      <SearchSelect
                        options={opcoesFornecedor}
                        value={field.value}
                        onChange={field.onChange}
                        title="Fornecedores"
                        searchPlaceholder="Buscar fornecedor..."
                        emptyText="Nenhum fornecedor encontrado."
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="customer_id"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel>Cliente</FormLabel>
                      <SearchSelect
                        options={opcoesCliente}
                        value={field.value}
                        onChange={field.onChange}
                        title="Clientes"
                        searchPlaceholder="Buscar cliente..."
                        emptyText="Nenhum cliente encontrado."
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {(status === 'paid' || paymentDate) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="payment_date"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel>Data de Pagamento</FormLabel>
                      <DatePickerDialog
                        value={field.value}
                        onChange={field.onChange}
                        title="Data de pagamento"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="payment_method"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
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

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="document_number"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
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
                  <FormItem className="space-y-1.5">
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Informações adicionais..."
                        {...field}
                        value={field.value || ''}
                        rows={2}
                        className="resize-none"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
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
