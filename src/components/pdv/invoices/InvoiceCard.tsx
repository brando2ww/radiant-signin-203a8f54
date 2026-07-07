import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PDVInvoice } from "@/hooks/use-pdv-invoices";
import { FileText, MoreVertical, Trash2, Eye, Package } from "lucide-react";
import { format } from "date-fns";
import { formatCNPJ } from "@/lib/invoice/validators";
import { formatCurrency } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deferMenuAction } from "@/lib/ui/defer-menu-action";

interface InvoiceCardProps {
  invoice: PDVInvoice;
  onView: (invoice: PDVInvoice) => void;
  onDelete: (invoice: PDVInvoice) => void;
}

export function InvoiceCard({ invoice, onView, onDelete }: InvoiceCardProps) {
  const getStatusBadge = () => {
    const variants: Record<string, { label: string; variant: any }> = {
      pending: { label: 'Pendente', variant: 'secondary' },
      reviewed: { label: 'Revisada', variant: 'outline' },
      imported: { label: 'Importada', variant: 'default' },
      error: { label: 'Erro', variant: 'destructive' },
    };

    const status = variants[invoice.status] || variants.pending;
    return <Badge variant={status.variant}>{status.label}</Badge>;
  };

  const isAutoImported = invoice.source === 'sefaz_auto';
  const isMde = invoice.source === 'mde';
  const productsReady = ((invoice as any).mde_raw_payload?.nfe_completa === true);
  // Status de download dos produtos (só para notas recebidas via MDe).
  const productsBadge = !isMde || invoice.status === 'imported' ? null : productsReady ? (
    <Badge variant="outline" className="text-xs border-emerald-500/50 text-emerald-600">
      Produtos disponíveis
    </Badge>
  ) : (
    <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-600">
      Aguardando SEFAZ
    </Badge>
  );

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="p-2 bg-primary/10 rounded-lg">
            <FileText className="h-5 w-5 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-semibold truncate">NF-e {invoice.invoice_number}</h3>
              {getStatusBadge()}
              {isAutoImported && (
                <Badge variant="outline" className="text-xs border-blue-500/50 text-blue-600">
                  Automática
                </Badge>
              )}
              {isMde && (
                <Badge variant="outline" className="text-xs border-blue-500/50 text-blue-600">
                  Recebida
                </Badge>
              )}
              {productsBadge}
            </div>

            <p className="text-sm text-muted-foreground mb-2">
              {invoice.supplier_name}
            </p>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div>
                <span className="font-medium">CNPJ:</span> {formatCNPJ(String(invoice.supplier_cnpj || ''))}
              </div>
              <div>
                <span className="font-medium">Emissão:</span>{' '}
                {format(new Date(invoice.emission_date), 'dd/MM/yyyy')}
              </div>
              <div className="col-span-2">
                <span className="font-medium">Série:</span> {invoice.series || 'N/A'}
              </div>
            </div>

            <div className="mt-3 pt-3 border-t flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground">Total</span>
                <p className="text-lg font-semibold">
                  {formatCurrency(invoice.total_invoice)}
                </p>
              </div>
              {invoice.status === 'pending' && (
                <Button size="sm" variant="outline" onClick={() => onView(invoice)}>
                  <Package className="h-4 w-4 mr-1" />
                  Cadastrar Insumos
                </Button>
              )}
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => deferMenuAction(() => onView(invoice))}>
              <Eye className="h-4 w-4 mr-2" />
              Visualizar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => deferMenuAction(() => onDelete(invoice))}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
