import { ImageIcon, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import type { VendasProduto } from "@/lib/vendas/types";
import { formatarQtd, fotosProduto, precoVenda } from "./catalogo-utils";

export type CatalogoGridProps = {
  produtos: VendasProduto[];
  /** Quando informado, cada cartão ganha um botão (ex.: "Adicionar" na proposta) e fica clicável. */
  onSelect?: (p: VendasProduto) => void;
  selectLabel?: string;
  /** Cartões menores (celular do representante, seletor de itens). */
  compact?: boolean;
};

/** Vitrine do catálogo da Força de vendas: foto, nome, código, preço de representante, unidade e mínimo. */
export function CatalogoGrid({ produtos, onSelect, selectLabel = "Selecionar", compact = false }: CatalogoGridProps) {
  if (produtos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
        <ImageIcon className="h-6 w-6" />
        Nenhum produto no catálogo.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-3",
        compact ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
      )}
    >
      {produtos.map((p) => (
        <CartaoProduto key={p.id} produto={p} onSelect={onSelect} selectLabel={selectLabel} compact={compact} />
      ))}
    </div>
  );
}

function CartaoProduto({
  produto: p,
  onSelect,
  selectLabel,
  compact,
}: {
  produto: VendasProduto;
  onSelect?: (p: VendasProduto) => void;
  selectLabel: string;
  compact: boolean;
}) {
  const fotos = fotosProduto(p);
  const preco = precoVenda(p);
  const temPrecoRep = p.price_b2b != null;
  const unidade = p.sales_unit?.trim();
  const regras = [
    p.min_qty ? `mín. ${formatarQtd(p.min_qty)}${unidade ? ` ${unidade}` : ""}` : null,
    p.pack_qty ? `emb. c/ ${formatarQtd(p.pack_qty)}` : null,
  ].filter(Boolean);

  return (
    <Card
      className={cn(
        "flex min-w-0 flex-col overflow-hidden",
        onSelect && "cursor-pointer transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring",
      )}
      onClick={onSelect ? () => onSelect(p) : undefined}
    >
      <div className="relative aspect-square w-full bg-muted">
        {fotos[0] ? (
          <img src={fotos[0]} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageIcon className={compact ? "h-6 w-6" : "h-8 w-8"} />
            <span className="text-[11px]">Sem foto</span>
          </div>
        )}
        {fotos.length > 1 && (
          <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-medium shadow-sm">
            <Images className="h-3 w-3" /> {fotos.length}
          </span>
        )}
      </div>
      <div className={cn("flex flex-1 flex-col gap-1", compact ? "p-2" : "p-3")}>
        <p className={cn("line-clamp-2 font-medium leading-snug", compact ? "text-xs" : "text-sm")} title={p.name}>
          {p.name}
        </p>
        {p.sku && <p className="truncate font-mono text-[11px] text-muted-foreground">{p.sku}</p>}
        <div className="mt-auto pt-1">
          <p className={cn("font-semibold tabular-nums", compact ? "text-sm" : "text-base")}>
            {formatBRL(preco)}
            {unidade && <span className="text-xs font-normal text-muted-foreground"> / {unidade}</span>}
          </p>
          {!temPrecoRep && <p className="text-[10px] text-muted-foreground">preço de balcão</p>}
          {regras.length > 0 && <p className="truncate text-[11px] text-muted-foreground">{regras.join(" · ")}</p>}
        </div>
        {onSelect && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={cn("mt-1.5 w-full", compact && "h-7 text-xs")}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(p);
            }}
          >
            {selectLabel}
          </Button>
        )}
      </div>
    </Card>
  );
}
