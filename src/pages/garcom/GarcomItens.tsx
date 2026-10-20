import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { GarcomHeader } from "@/components/garcom/GarcomHeader";
import { ProductCategoryNav } from "@/components/garcom/ProductCategoryNav";
import { usePDVProducts } from "@/hooks/use-pdv-products";
import { formatBRL } from "@/lib/format";
import { imagemNoTamanho } from "@/lib/imagem";

export default function GarcomItens() {
  const navigate = useNavigate();
  const { products, isLoading } = usePDVProducts();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  const categories = [...new Set(products.map((p) => p.category))].sort();

  const filtered = products.filter((p) => {
    if (!p.is_available) return false;
    if (selectedCategory && p.category !== selectedCategory) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="pb-24">
      <GarcomHeader title="Itens" />

      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <ProductCategoryNav
        categories={categories}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          Nenhum produto encontrado
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 py-2">
          {filtered.map((product) => (
            <button
              key={product.id}
              onClick={() => navigate(`/garcom/itens/${product.id}`)}
              className="flex flex-col rounded-xl border bg-card overflow-hidden text-left transition-shadow active:scale-[0.97] hover:shadow-md"
            >
              {product.image_url ? (
                <img
                  src={imagemNoTamanho(product.image_url, 480)}
                  loading="lazy"
                  decoding="async"
                  alt={product.name}
                  className="h-28 w-full object-cover"
                />
              ) : (
                <div className="h-28 w-full bg-muted flex items-center justify-center text-muted-foreground text-xs">
                  Sem imagem
                </div>
              )}
              <div className="p-3 space-y-1">
                <p className="text-sm font-semibold leading-tight line-clamp-2">
                  {product.name}
                </p>
                <p className="text-xs text-muted-foreground">{product.category}</p>
                <p className="text-sm font-bold text-primary">
                  {formatBRL(product.price_salon)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
