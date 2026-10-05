import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CatalogoGrid } from "@/components/vendas/catalogo/CatalogoGrid";
import { ProdutoDetalheSheet } from "@/components/vendas/rep/ProdutoDetalheSheet";
import { normalizeSearch } from "@/components/vendas/rep/rep-utils";
import { useVendasCatalogo } from "@/hooks/use-vendas-catalogo";
import { cn } from "@/lib/utils";
import type { VendasProduto } from "@/lib/vendas/types";

const TODAS = "__todas__";

/** Catálogo do representante: só os produtos liberados para a força de vendas, com busca, categorias e compartilhar. */
export default function RepCatalogo() {
  const { produtos, isLoading, isError, refetch } = useVendasCatalogo({ onlyB2b: true });
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState(TODAS);
  const [aberto, setAberto] = useState<VendasProduto | null>(null);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    produtos.forEach((p) => p.category?.trim() && set.add(p.category.trim()));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [produtos]);

  const filtrados = useMemo(() => {
    const t = normalizeSearch(busca);
    return produtos.filter((p) => {
      if (categoria !== TODAS && (p.category?.trim() ?? "") !== categoria) return false;
      if (!t) return true;
      return normalizeSearch([p.name, p.sku, p.ean, p.category, p.description].filter(Boolean).join(" ")).includes(t);
    });
  }, [produtos, busca, categoria]);

  return (
    <div className="space-y-4 px-4 py-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Catálogo</h1>
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Carregando..." : `${produtos.length} ${produtos.length === 1 ? "produto" : "produtos"} para vender`}
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou código"
          className="h-12 rounded-xl pl-10 pr-10 text-base"
          inputMode="search"
          enterKeyHint="search"
          aria-label="Buscar produto"
        />
        {busca && (
          <button
            type="button"
            onClick={() => setBusca("")}
            aria-label="Limpar busca"
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {categorias.length > 1 && (
        <div
          role="tablist"
          aria-label="Categorias"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {[TODAS, ...categorias].map((c) => {
            const ativo = categoria === c;
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={ativo}
                onClick={() => setCategoria(c)}
                className={cn(
                  "h-10 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors",
                  ativo ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                )}
              >
                {c === TODAS ? "Todas" : c}
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Não foi possível carregar o catálogo.{" "}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>
            Tentar de novo
          </button>
        </div>
      ) : produtos.length > 0 && filtrados.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum produto encontrado{busca ? ` para "${busca}"` : " nesta categoria"}.
        </p>
      ) : (
        <CatalogoGrid produtos={filtrados} onSelect={setAberto} selectLabel="Detalhes" compact />
      )}

      <ProdutoDetalheSheet produto={aberto} onOpenChange={(v) => !v && setAberto(null)} />
    </div>
  );
}
