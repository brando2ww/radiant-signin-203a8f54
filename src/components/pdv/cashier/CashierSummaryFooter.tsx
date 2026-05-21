import { Banknote, CreditCard, Smartphone, TrendingDown, TrendingUp, Wallet, Ticket, Receipt, Globe, UserCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";

interface CashierSummaryFooterProps {
  // Gaveta
  openingBalance: number;
  netCash: number;          // Σ valor das vendas em dinheiro
  totalReinforcements: number;
  totalWithdrawals: number;
  drawerBalance: number;    // saldo esperado da gaveta agora
  // Vendas por forma (informativo)
  totalCash: number;        // bruto recebido em dinheiro
  totalCredit: number;
  totalDebit: number;
  totalPix: number;
  totalVoucher: number;
  totalOnlineDelivery: number;
  totalFiado: number;
  totalSales: number;
  isOpen: boolean;
}

interface SummaryRowProps {
  icon: typeof Wallet;
  label: string;
  value: number;
  prefix?: "+" | "-" | "";
  emphasis?: boolean;
  tone?: "neutral" | "positive" | "negative";
}

function SummaryRow({ icon: Icon, label, value, prefix = "", emphasis, tone = "neutral" }: SummaryRowProps) {
  const toneClass =
    tone === "positive" ? "text-emerald-600"
    : tone === "negative" ? "text-destructive"
    : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className={`text-xs ${emphasis ? "font-semibold text-foreground" : "text-muted-foreground"} truncate`}>
          {label}
        </span>
      </div>
      <span className={`tabular-nums ${emphasis ? "text-sm font-bold" : "text-xs font-medium"} ${toneClass}`}>
        {prefix && value > 0 ? prefix : ""}
        {formatBRL(value)}
      </span>
    </div>
  );
}

export function CashierSummaryFooter({
  openingBalance,
  netCash,
  totalReinforcements,
  totalWithdrawals,
  drawerBalance,
  totalCash,
  totalCredit,
  totalDebit,
  totalPix,
  totalVoucher,
  totalOnlineDelivery,
  totalSales,
  isOpen,
}: CashierSummaryFooterProps) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {/* Bloco 1 — Gaveta (dinheiro físico) */}
      <Card className={`border-2 ${isOpen ? "border-primary/40" : "border-muted"}`}>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2 pb-2 border-b">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Gaveta (dinheiro físico)</h3>
            </div>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              o que deve estar na gaveta
            </span>
          </div>
          <div className="space-y-0.5">
            <SummaryRow icon={Wallet} label="Abertura" value={openingBalance} />
            <SummaryRow icon={Banknote} label="Dinheiro de vendas" value={netCash} prefix="+" tone="positive" />
            <SummaryRow icon={TrendingUp} label="Reforços" value={totalReinforcements} prefix="+" tone="positive" />
            <SummaryRow icon={TrendingDown} label="Sangrias" value={totalWithdrawals} prefix="-" tone="negative" />
          </div>
          <div className="mt-2 pt-2 border-t">
            <SummaryRow
              icon={Wallet}
              label="Saldo Atual da Gaveta"
              value={drawerBalance}
              emphasis
            />
          </div>
        </CardContent>
      </Card>

      {/* Bloco 2 — Vendas por forma (informativo) */}
      <Card className="border bg-muted/20">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2 pb-2 border-b">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Vendas por forma de pagamento</h3>
            </div>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              informativo (conferência no fechamento)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <SummaryRow icon={Banknote} label="Dinheiro (bruto)" value={totalCash} />
            <SummaryRow icon={CreditCard} label="Crédito" value={totalCredit} />
            <SummaryRow icon={CreditCard} label="Débito" value={totalDebit} />
            <SummaryRow icon={Smartphone} label="PIX" value={totalPix} />
            <SummaryRow icon={Ticket} label="Vale-refeição" value={totalVoucher} />
            <SummaryRow icon={Globe} label="Online (Delivery)" value={totalOnlineDelivery} />
          </div>
          <div className="mt-2 pt-2 border-t">
            <SummaryRow
              icon={Receipt}
              label="Total Vendas"
              value={totalSales}
              emphasis
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
