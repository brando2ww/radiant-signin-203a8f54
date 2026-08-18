import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePDVCostCenters } from "@/hooks/use-pdv-cost-centers";
import { usePDVChartOfAccounts } from "@/hooks/use-pdv-chart-of-accounts";
import { usePDVSuppliers } from "@/hooks/use-pdv-suppliers";
import { usePDVCustomers } from "@/hooks/use-pdv-customers";
import type { TransactionFilters } from "@/hooks/use-pdv-financial-transactions";

interface Props {
  filters: TransactionFilters;
  onChange: (f: TransactionFilters) => void;
  /** O tipo travado não é filtro escolhido: não vira chip. */
  lockedType?: "payable" | "receivable";
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Em aberto",
  paid: "Pago",
  cancelled: "Cancelado",
  overdue: "Vencido",
};

const METODO_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro", pix: "PIX", credito: "Crédito",
  debito: "Débito", boleto: "Boleto", transferencia: "Transferência",
};

/**
 * O que está filtrado, escrito por extenso e removível numa clicada.
 *
 * Sem isto o usuário aplica um filtro, rola a página, esquece, e passa a ler
 * um número parcial como se fosse o total. O chip é a memória da tela.
 */
export function ActiveFilterChips({ filters, onChange, lockedType }: Props) {
  const { costCenters } = usePDVCostCenters();
  const { accounts } = usePDVChartOfAccounts();
  const { suppliers } = usePDVSuppliers();
  const { customers } = usePDVCustomers();

  const nome = (lista: any[], id?: string, campo = "name") =>
    lista.find((x) => x.id === id)?.[campo] ?? "—";

  const chips: Array<{ chave: keyof TransactionFilters; rotulo: string }> = [];

  if (filters.search) chips.push({ chave: "search", rotulo: `Busca: "${filters.search}"` });
  if (filters.transaction_type && filters.transaction_type !== "all" && !lockedType) {
    chips.push({
      chave: "transaction_type",
      rotulo: filters.transaction_type === "payable" ? "Só contas a pagar" : "Só contas a receber",
    });
  }
  if (filters.status?.length) {
    chips.push({
      chave: "status",
      rotulo: filters.status.map((s) => STATUS_LABEL[s] ?? s).join(", "),
    });
  }
  if (filters.overdue_only) chips.push({ chave: "overdue_only", rotulo: "Só vencidas" });
  if (filters.chart_account_id) {
    chips.push({ chave: "chart_account_id", rotulo: `Conta: ${nome(accounts, filters.chart_account_id)}` });
  }
  if (filters.cost_center_id) {
    chips.push({ chave: "cost_center_id", rotulo: `Centro de custo: ${nome(costCenters, filters.cost_center_id)}` });
  }
  if (filters.supplier_id) {
    chips.push({ chave: "supplier_id", rotulo: `Fornecedor: ${nome(suppliers, filters.supplier_id, "company_name")}` });
  }
  if (filters.customer_id) {
    chips.push({ chave: "customer_id", rotulo: `Cliente: ${nome(customers, filters.customer_id)}` });
  }
  if (filters.payment_method) {
    chips.push({
      chave: "payment_method",
      rotulo: `Pagamento: ${METODO_LABEL[filters.payment_method] ?? filters.payment_method}`,
    });
  }

  if (chips.length === 0) return null;

  const remover = (chave: keyof TransactionFilters) => {
    const novo = { ...filters };
    delete novo[chave];
    onChange(novo);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Filtrando por:</span>
      {chips.map((c) => (
        <button
          key={String(c.chave)}
          type="button"
          onClick={() => remover(c.chave)}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs hover:bg-muted"
        >
          {c.rotulo}
          <X className="h-3 w-3 opacity-60" />
        </button>
      ))}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 text-xs"
        onClick={() => onChange({})}
      >
        Limpar tudo
      </Button>
    </div>
  );
}
