import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Plus, Receipt, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";

interface Comanda {
  id: string;
  comanda_number: string;
  customer_name?: string | null;
  person_number?: number | null;
  subtotal: number;
  created_at: string;
  status: string;
}

interface TableComandasSectionProps {
  comandas: Comanda[];
  onCreateComanda: () => void;
  onViewComanda: (comanda: Comanda) => void;
  isCreating?: boolean;
}

export function TableComandasSection({
  comandas,
  onCreateComanda,
  onViewComanda,
  isCreating,
}: TableComandasSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4" />
          <span className="font-medium text-sm">Comandas</span>
        </div>
        <Button size="sm" variant="outline" onClick={onCreateComanda} disabled={isCreating}>
          <Plus className="h-3 w-3 mr-1" />
          Nova
        </Button>
      </div>

      {comandas.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-2">
          Nenhuma comanda ainda. Toque em <strong>Nova</strong> para lançar os itens da mesa.
        </p>
      ) : (
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {comandas.map((comanda) => (
            <div
              key={comanda.id}
              className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
              onClick={() => onViewComanda(comanda)}
            >
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {comanda.customer_name || `Pessoa ${comanda.person_number || "?"}`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(comanda.created_at), {
                      locale: ptBR,
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </div>
              <span className="font-semibold text-sm">
                {formatBRL(comanda.subtotal)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
