import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Scale } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FinancialStats } from "@/hooks/use-pdv-financial-transactions";

interface Props {
  stats: FinancialStats;
  isLoading?: boolean;
  /** Descrição do recorte em português, para o número não ficar sem contexto. */
  periodoLabel: string;
  lockedType?: "payable" | "receivable";
}

/**
 * Resumo do que está na tela, em linguagem de quem não é contador.
 *
 * Os números saem da mesma lista que a tabela mostra: filtrar muda os dois
 * juntos. A frase acima dos números existe porque "R$ 12.400" sozinho não diz
 * se é do mês, do fornecedor filtrado ou de tudo.
 */
export function LedgerSummary({ stats, isLoading, periodoLabel, lockedType }: Props) {
  const saldo = stats.expectedBalance;

  const tiles = [
    {
      chave: "pagar",
      rotulo: "Você tem a pagar",
      valor: stats.totalPayable,
      detalhe: `${stats.pendingPayableCount} ${stats.pendingPayableCount === 1 ? "conta em aberto" : "contas em aberto"}`,
      Icone: ArrowDownCircle,
      cor: "text-destructive",
      esconder: lockedType === "receivable",
    },
    {
      chave: "receber",
      rotulo: "Você tem a receber",
      valor: stats.totalReceivable,
      detalhe: `${stats.pendingReceivableCount} ${stats.pendingReceivableCount === 1 ? "conta em aberto" : "contas em aberto"}`,
      Icone: ArrowUpCircle,
      cor: "text-success",
      esconder: lockedType === "payable",
    },
    {
      chave: "vencido",
      rotulo: "Já venceu",
      valor: stats.totalOverdue,
      detalhe:
        stats.overdueCount === 0
          ? "nada atrasado"
          : `${stats.overdueCount} ${stats.overdueCount === 1 ? "conta atrasada" : "contas atrasadas"}`,
      Icone: AlertTriangle,
      cor: stats.totalOverdue > 0 ? "text-destructive" : "text-muted-foreground",
      destaque: stats.totalOverdue > 0,
      esconder: false,
    },
    {
      chave: "saldo",
      rotulo: saldo >= 0 ? "Sobra prevista" : "Falta prevista",
      valor: Math.abs(saldo),
      detalhe: "a receber menos a pagar",
      Icone: Scale,
      cor: saldo >= 0 ? "text-success" : "text-destructive",
      esconder: !!lockedType,
    },
  ].filter((t) => !t.esconder);

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{periodoLabel}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(({ chave, rotulo, valor, detalhe, Icone, cor, destaque }) => (
          <div
            key={chave}
            className={cn(
              "rounded-lg border bg-card p-4",
              destaque && "border-destructive/50 bg-destructive/5",
            )}
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icone className={cn("h-4 w-4", cor)} />
              {rotulo}
            </div>
            {isLoading ? (
              <Skeleton className="mt-2 h-7 w-28" />
            ) : (
              <p className={cn("mt-1 text-2xl font-bold tabular-nums", cor)}>{formatBRL(valor)}</p>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
