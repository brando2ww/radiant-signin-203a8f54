import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Check, Plus } from "lucide-react";
import { format } from "date-fns";
import { EditableInvoiceData } from "@/types/invoice";
import { formatNFeKey, formatCNPJ } from "@/lib/invoice/validators";
import { formatCurrency } from "@/lib/utils";

interface Step5FinalReviewProps {
  data: EditableInvoiceData;
}

export function Step5FinalReview({ data }: Step5FinalReviewProps) {
  const linkedCount = data.items.filter(i => i.linkAction.type === 'link').length;
  const createCount = data.items.filter(i => i.linkAction.type === 'create').length;
  const noneCount = data.items.filter(i => i.linkAction.type === 'none').length;

  const hasWarnings = noneCount > 0;

  const itemsSum = data.items.reduce(
    (sum, i) => sum + (Number(i.totalValue) || Number(i.quantity) * Number(i.unitValue) || 0),
    0,
  );
  const totalsWarning =
    data.totals.invoice <= 0 || Math.abs(itemsSum - Number(data.totals.products || 0)) > 0.01;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Revisão Final</h3>
        <p className="text-sm text-muted-foreground">
          Confira todos os dados antes de confirmar a importação.
        </p>
      </div>

      {hasWarnings && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Existem {noneCount} item(ns) sem vinculação. Volte ao passo "Produtos" e vincule
            cada item a um insumo do estoque ou marque-o para ser criado como novo. A importação
            só pode ser confirmada quando todos os itens tiverem destino.
          </AlertDescription>
        </Alert>
      )}

      <ScrollArea className="max-h-[500px] pr-4">
        <div className="space-y-6">
          {/* Dados da Nota */}
          <div className="space-y-3">
            <h4 className="font-semibold">Dados da Nota</h4>
            <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Chave NFe</Label>
                <p className="font-mono text-xs break-all">{formatNFeKey(data.invoiceKey)}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Número</Label>
                  <p>{data.invoiceNumber}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Série</Label>
                  <p>{data.series}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Badge variant={data.operationType === 'entrada' ? 'default' : 'secondary'} className="text-xs">
                    {data.operationType === 'entrada' ? 'Entrada' : 'Saída'}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Emissão</Label>
                  <p>{format(data.emissionDate, 'dd/MM/yyyy')}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Entrada</Label>
                  <p>{format(data.entryDate, 'dd/MM/yyyy')}</p>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Total da Nota</Label>
                <p className="text-lg font-semibold">{formatCurrency(data.totals.invoice)}</p>
                {/* Nota com total zerado grava contas a pagar de R$ 0 e some do
                    financeiro sem ninguém perceber. */}
                {totalsWarning && (
                  <p className="mt-1 text-xs text-amber-700">
                    {data.totals.invoice <= 0
                      ? "Total zerado. Volte ao passo Produtos e aplique a soma dos itens."
                      : `Diverge da soma dos itens (${formatCurrency(itemsSum)}).`}
                  </p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Fornecedor */}
          <div className="space-y-3">
            <h4 className="font-semibold">Fornecedor</h4>
            <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm">
              {data.supplier.mode === 'existing' ? (
                <Badge variant="outline" className="gap-1">
                  <Check className="h-3 w-3" /> Existente
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <Plus className="h-3 w-3" /> Será criado
                </Badge>
              )}
              {data.supplier.newData && (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground">Nome</Label>
                    <p className="font-medium">{data.supplier.newData.name}</p>
                  </div>
                  {data.supplier.newData.cnpj && (
                    <div>
                      <Label className="text-xs text-muted-foreground">CNPJ</Label>
                      <p>{formatCNPJ(data.supplier.newData.cnpj)}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <Separator />

          {/* Lançamento Financeiro */}
          <div className="space-y-3">
            <h4 className="font-semibold">Lançamento Financeiro</h4>
            <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Descrição</Label>
                <p>{data.financial.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Valor</Label>
                  <p className="font-semibold">{formatCurrency(data.financial.amount)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Vencimento</Label>
                  <p>{format(data.financial.due_date, 'dd/MM/yyyy')}</p>
                </div>
              </div>
              {data.financial.installments > 1 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Parcelamento</Label>
                  <p>
                    {data.financial.installments}x de{' '}
                    {formatCurrency(data.financial.amount / data.financial.installments)}
                  </p>
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Badge variant={data.financial.status === 'paid' ? 'default' : 'secondary'}>
                  {data.financial.status === 'paid' ? 'Pago' : 'Pendente'}
                </Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* Produtos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Produtos ({data.items.length})</h4>
              <div className="flex gap-2">
                {linkedCount > 0 && (
                  <Badge variant="outline" className="gap-1 border-green-500 text-green-700 text-xs">
                    <Check className="h-3 w-3" /> {linkedCount}
                  </Badge>
                )}
                {createCount > 0 && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Plus className="h-3 w-3" /> {createCount}
                  </Badge>
                )}
                {noneCount > 0 && (
                  <Badge variant="outline" className="gap-1 text-muted-foreground text-xs">
                    <AlertCircle className="h-3 w-3" /> {noneCount}
                  </Badge>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {data.items.map((item, index) => (
                <div key={index} className="bg-muted/50 p-3 rounded-lg">
                  <div className="flex items-start justify-between text-sm">
                    <div className="flex-1">
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} {item.unit} × {formatCurrency(item.unitValue)} ={' '}
                        {formatCurrency(item.totalValue)}
                      </p>
                    </div>
                    {item.linkAction.type === 'link' && (
                      <Badge variant="outline" className="gap-1 border-green-500 text-green-700 text-xs">
                        <Check className="h-3 w-3" /> Vinculado
                      </Badge>
                    )}
                    {item.linkAction.type === 'create' && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Plus className="h-3 w-3" /> Novo
                      </Badge>
                    )}
                    {item.linkAction.type === 'none' && (
                      <Badge variant="outline" className="text-muted-foreground text-xs">
                        Sem vinculação
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
