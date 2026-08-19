import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn, formatCurrency } from "@/lib/utils";
import { EditableInvoiceData, EditableFinancialData } from "@/types/invoice";
import { CurrencyInput } from "@/components/ui/currency-input";

interface Step3FinancialDataProps {
  data: EditableInvoiceData;
  onUpdate: (updates: Partial<EditableInvoiceData>) => void;
}

export function Step3FinancialData({ data, onUpdate }: Step3FinancialDataProps) {
  const handleFinancialChange = (field: keyof EditableFinancialData, value: any) => {
    onUpdate({
      financial: {
        ...data.financial,
        [field]: value,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Lançamento Financeiro</h3>
        <p className="text-sm text-muted-foreground">
          Configure o lançamento de contas a pagar relacionado a esta nota fiscal.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="financial-description">Descrição *</Label>
          <Input
            id="financial-description"
            value={data.financial.description}
            onChange={(e) => handleFinancialChange('description', e.target.value)}
            placeholder="Descrição do lançamento"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="financial-amount">Valor *</Label>
            <CurrencyInput
              id="financial-amount"
              value={data.financial.amount.toString()}
              onChange={(value) => handleFinancialChange('amount', parseFloat(value) || 0)}
            />
          </div>

          <div>
            <Label htmlFor="financial-installments">Parcelas</Label>
            <Input
              id="financial-installments"
              type="number"
              min="1"
              max="60"
              value={data.financial.installments}
              onChange={(e) => handleFinancialChange('installments', parseInt(e.target.value))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Data de Vencimento *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal mt-1",
                    !data.financial.due_date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {data.financial.due_date ? format(data.financial.due_date, "dd/MM/yyyy") : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={data.financial.due_date}
                  onSelect={(date) => date && handleFinancialChange('due_date', date)}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label htmlFor="financial-payment-method">Forma de Pagamento</Label>
            <Select
              value={data.financial.payment_method || ''}
              onValueChange={(value) => handleFinancialChange('payment_method', value)}
            >
              <SelectTrigger id="financial-payment-method" className="mt-1">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="transferencia">Transferência</SelectItem>
                <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Status do Pagamento</Label>
          <RadioGroup
            value={data.financial.status}
            onValueChange={(value: 'pending' | 'paid') => handleFinancialChange('status', value)}
            className="flex gap-4 mt-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="pending" id="status-pending" />
              <Label htmlFor="status-pending" className="font-normal cursor-pointer">
                Pendente
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="paid" id="status-paid" />
              <Label htmlFor="status-paid" className="font-normal cursor-pointer">
                Pago
              </Label>
            </div>
          </RadioGroup>
        </div>

        {data.financial.status === 'paid' && (
          <div>
            <Label>Data de Pagamento</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal mt-1",
                    !data.financial.payment_date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {data.financial.payment_date ? format(data.financial.payment_date, "dd/MM/yyyy") : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={data.financial.payment_date || undefined}
                  onSelect={(date) => handleFinancialChange('payment_date', date)}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        <div>
          <Label htmlFor="financial-notes">Observações</Label>
          <Textarea
            id="financial-notes"
            value={data.financial.notes || ''}
            onChange={(e) => handleFinancialChange('notes', e.target.value)}
            placeholder="Observações sobre o pagamento..."
            rows={3}
          />
        </div>

        {/* Quando a nota traz o grupo <cobr>, as parcelas não são inventadas:
            são as duplicatas que o fornecedor declarou. Mostrar isso evita que
            alguém "corrija" datas que já estão certas. */}
        {data.financial.duplicatas && data.financial.duplicatas.length > 0 ? (
          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium">Cobrança informada na nota</p>
            <p className="mb-3 text-xs text-muted-foreground">
              {data.financial.duplicatas.length === 1
                ? "A nota traz uma duplicata."
                : `A nota traz ${data.financial.duplicatas.length} duplicatas.`}{' '}
              As contas a pagar serão criadas com estes vencimentos.
            </p>
            <ul className="divide-y text-sm">
              {data.financial.duplicatas.map((d, i) => (
                <li key={`${d.numero}-${i}`} className="flex items-center justify-between py-1.5">
                  <span className="text-muted-foreground">
                    Parcela {i + 1}/{data.financial.duplicatas!.length}
                    <span className="ml-2 font-mono text-xs">nº {d.numero}</span>
                  </span>
                  <span className="flex items-center gap-4">
                    <span>{format(d.vencimento, "dd/MM/yyyy", { locale: ptBR })}</span>
                    <span className="w-24 text-right font-medium tabular-nums">
                      {formatCurrency(d.valor)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm font-semibold">
              <span>Total das duplicatas</span>
              <span className="tabular-nums">
                {formatCurrency(data.financial.duplicatas.reduce((s, d) => s + d.valor, 0))}
              </span>
            </div>
          </div>
        ) : data.financial.installments > 1 ? (
          <div className="bg-muted/50 p-4 rounded-lg">
            <p className="text-sm font-medium mb-2">Parcelamento</p>
            <p className="text-sm text-muted-foreground">
              A nota não informou cobrança. Serão criadas {data.financial.installments} parcelas de{' '}
              {formatCurrency(data.financial.amount / data.financial.installments)} cada, de mês em mês.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}