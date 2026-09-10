import { cn } from "@/lib/utils";
import { isMarketplace, SOURCE_LABEL, type OrderSource } from "@/lib/marketplace-orders";

/**
 * Selo de origem do pedido.
 *
 * Existe porque a tela de delivery é agnóstica de origem: o mesmo card serve
 * para pedido próprio, iFood e DeliveryMuch. Sem o selo, o operador não sabe a
 * quem responder nem por que o botão "pronto" some em pedido de entrega — e a
 * homologação do iFood exige que a origem apareça na tela.
 *
 * Pedido próprio não recebe selo: o normal não precisa de rótulo, e poluir
 * todo card tiraria a força do que é exceção.
 */
const STYLES: Record<string, string> = {
  // vermelho da marca iFood
  ifood: "bg-[#EA1D2C] text-white border-transparent",
  deliverymuch: "bg-[#0B2B5B] text-white border-transparent",
};

interface OrderSourceBadgeProps {
  source: string | null | undefined;
  className?: string;
  /** Compacto para cabeçalho de card; padrão é o tamanho de leitura. */
  size?: "sm" | "md";
}

export function OrderSourceBadge({ source, className, size = "sm" }: OrderSourceBadgeProps) {
  if (!isMarketplace(source)) return null;

  const key = (source ?? "own") as OrderSource;
  const label = SOURCE_LABEL[key] ?? source;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border font-semibold leading-none tracking-tight",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
        STYLES[key] ?? "bg-muted text-foreground",
        className,
      )}
      title={`Pedido recebido pelo ${label}`}
    >
      {label}
    </span>
  );
}
