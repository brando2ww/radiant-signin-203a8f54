import { useMemo, useState } from "react";
import { Check, ImageOff, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/format";
import { useProdutosParaProposta, type ProdutoParaProposta } from "@/hooks/use-vendas-propostas";
import { formatarQtd } from "./calculos";

export const precoDoProduto = (p: Pick<ProdutoParaProposta, "price_b2b" | "price_balcao">) =>
  Number(p.price_b2b ?? p.price_balcao ?? 0);

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Catálogo B2B para montar a proposta: busca por nome, código ou EAN; adiciona vários de uma vez. */
export function ProdutoPicker({
  open,
  onOpenChange,
  onAdicionar,
  quantidadesNaProposta,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdicionar: (p: ProdutoParaProposta) => void;
  /** product_id → quantidade já na proposta (mostra o selo "na proposta"). */
  quantidadesNaProposta: Map<string, number>;
}) {
  const { data: produtos = [], isLoading } = useProdutosParaProposta();
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const q = semAcento(busca.trim());
    if (!q) return produtos;
    return produtos.filter((p) =>
      semAcento([p.name, p.sku, p.ean, p.category].filter(Boolean).join(" ")).includes(q),
    );
  }, [produtos, busca]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-3 p-0 sm:max-w-2xl">
        <DialogHeader className="px-4 pt-4 sm:px-6">
          <DialogTitle>Adicionar produtos</DialogTitle>
        </DialogHeader>
        <div className="px-4 sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, código ou EAN"
              className="pl-9"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-y">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtrados.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              {produtos.length === 0
                ? "Nenhum produto liberado para a força de vendas. Libere em Produtos (venda B2B)."
                : "Nenhum produto encontrado."}
            </p>
          ) : (
            <ul className="divide-y">
              {filtrados.map((p) => {
                const naProposta = quantidadesNaProposta.get(p.id);
                const unidade = p.sales_unit || "un";
                const dicas = [
                  p.sku ? `Cód. ${p.sku}` : "",
                  p.min_qty ? `mín. ${formatarQtd(Number(p.min_qty))} ${unidade}` : "",
                  p.pack_qty && Number(p.pack_qty) > 1 ? `múltiplos de ${formatarQtd(Number(p.pack_qty))}` : "",
                ].filter(Boolean);
                return (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <ImageOff className="h-5 w-5 text-muted-foreground/60" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium leading-tight">{p.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{formatBRL(precoDoProduto(p))}</span> / {unidade}
                        {p.price_b2b == null && p.price_balcao != null ? " (preço de balcão)" : ""}
                      </p>
                      {dicas.length > 0 && (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{dicas.join(" · ")}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={naProposta ? "secondary" : "outline"}
                      className="shrink-0"
                      onClick={() => onAdicionar(p)}
                      aria-label={`Adicionar ${p.name}`}
                    >
                      {naProposta ? (
                        <>
                          <Check className="mr-1 h-3.5 w-3.5" /> {formatarQtd(naProposta)}
                        </>
                      ) : (
                        <>
                          <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
                        </>
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <DialogFooter className="px-4 pb-4 sm:px-6">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
