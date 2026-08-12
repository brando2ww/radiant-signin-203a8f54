import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Card de indicador dos relatórios de compras.
 * `hint` carrega o contexto que impede leitura errada (denominador, contagem,
 * comparação com o período anterior).
 */
export function PurchaseKpi({
  label,
  value,
  hint,
  loading,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  loading?: boolean;
  tone?: "default" | "up" | "down" | "warn";
}) {
  const toneClass =
    tone === "up" ? "text-destructive"
    : tone === "down" ? "text-emerald-600"
    : tone === "warn" ? "text-amber-600"
    : "";

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-7 w-24" />
        ) : (
          <p className={`text-xl font-semibold ${toneClass}`}>{value}</p>
        )}
        {hint && !loading ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
