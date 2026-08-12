import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn, formatCurrency } from "@/lib/utils";
import { EditableInvoiceData } from "@/types/invoice";
import { formatNFeKey } from "@/lib/invoice/validators";
import { CurrencyInput } from "@/components/ui/currency-input";

interface Step1InvoiceDataProps {
  data: EditableInvoiceData;
  onUpdate: (updates: Partial<EditableInvoiceData>) => void;
}

export function Step1InvoiceData({ data, onUpdate }: Step1InvoiceDataProps) {
  const handleTotalChange = (field: keyof EditableInvoiceData['totals'], value: string) => {
    onUpdate({
      totals: {
        ...data.totals,
        [field]: parseFloat(value) || 0,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Dados da Nota Fiscal</h3>
        <p className="text-sm text-muted-foreground">
          Revise e edite as informações básicas da nota fiscal.
        </p>
      </div>

      {/* Identificação */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="invoice-key">Chave de Acesso NFe</Label>
          {/* Veio de XML: a chave é a identidade da nota, não se edita.
              Lançamento manual (cupom, nota digitada): fica editável e pode
              ficar em branco — cupom fiscal muitas vezes nem tem. */}
          {data.invoiceKey ? (
            <p className="text-xs font-mono bg-muted p-2 rounded mt-1 break-all">
              {formatNFeKey(data.invoiceKey)}
            </p>
          ) : (
            <>
              <Input
                id="invoice-key"
                className="mt-1 font-mono text-xs"
                placeholder="44 dígitos (opcional)"
                inputMode="numeric"
                maxLength={44}
                value={data.invoiceKey}
                onChange={(e) => onUpdate({ invoiceKey: e.target.value.replace(/\D/g, "") })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Opcional no lançamento manual.
              </p>
            </>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="invoice-number">Número</Label>
            <Input
              id="invoice-number"
              value={data.invoiceNumber}
              onChange={(e) => onUpdate({ invoiceNumber: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="series">Série</Label>
            <Input
              id="series"
              value={data.series}
              onChange={(e) => onUpdate({ series: e.target.value })}
            />
          </div>

          <div>
            <Label>Tipo de Operação</Label>
            <div className="mt-2">
              <Badge variant={data.operationType === 'entrada' ? 'default' : 'secondary'}>
                {data.operationType === 'entrada' ? 'Entrada' : 'Saída'}
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Data de Emissão</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal mt-1",
                    !data.emissionDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {data.emissionDate ? format(data.emissionDate, "dd/MM/yyyy") : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={data.emissionDate}
                  onSelect={(date) => date && onUpdate({ emissionDate: date })}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Data de Entrada</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal mt-1",
                    !data.entryDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {data.entryDate ? format(data.entryDate, "dd/MM/yyyy") : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={data.entryDate}
                  onSelect={(date) => date && onUpdate({ entryDate: date })}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Valores */}
      <div className="space-y-4">
        <h4 className="font-medium">Valores Totais</h4>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="total-products">Total de Produtos</Label>
            <CurrencyInput
              id="total-products"
              value={data.totals.products.toString()}
              onChange={(value) => handleTotalChange('products', value)}
            />
          </div>

          <div>
            <Label htmlFor="total-tax">Total de Impostos</Label>
            <CurrencyInput
              id="total-tax"
              value={data.totals.tax.toString()}
              onChange={(value) => handleTotalChange('tax', value)}
            />
          </div>

          <div>
            <Label htmlFor="freight">Frete</Label>
            <CurrencyInput
              id="freight"
              value={data.totals.freight.toString()}
              onChange={(value) => handleTotalChange('freight', value)}
            />
          </div>

          <div>
            <Label htmlFor="insurance">Seguro</Label>
            <CurrencyInput
              id="insurance"
              value={data.totals.insurance.toString()}
              onChange={(value) => handleTotalChange('insurance', value)}
            />
          </div>

          <div>
            <Label htmlFor="other-expenses">Outras Despesas</Label>
            <CurrencyInput
              id="other-expenses"
              value={data.totals.otherExpenses.toString()}
              onChange={(value) => handleTotalChange('otherExpenses', value)}
            />
          </div>

          <div>
            <Label htmlFor="discount">Desconto</Label>
            <CurrencyInput
              id="discount"
              value={data.totals.discount.toString()}
              onChange={(value) => handleTotalChange('discount', value)}
            />
          </div>
        </div>

        <div className="bg-primary/10 p-4 rounded-lg">
          <div className="flex justify-between items-center">
            <Label className="text-base">Total da Nota</Label>
            <span className="text-2xl font-bold">
              {formatCurrency(data.totals.invoice)}
            </span>
          </div>
        </div>
      </div>

      {/* Observações */}
      <div>
        <Label htmlFor="notes">Observações Gerais</Label>
        <Textarea
          id="notes"
          placeholder="Adicione observações sobre esta importação..."
          value={data.notes || ''}
          onChange={(e) => onUpdate({ notes: e.target.value })}
          rows={3}
        />
      </div>
    </div>
  );
}