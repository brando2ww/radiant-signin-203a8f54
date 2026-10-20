import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePDVProducts } from "@/hooks/use-pdv-products";
import { formatBRL } from "@/lib/format";
import { imagemNoTamanho } from "@/lib/imagem";

export default function GarcomItemDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { products, isLoading } = usePDVProducts();

  const product = products.find((p) => p.id === id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-muted-foreground">Produto não encontrado</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Voltar
        </Button>
      </div>
    );
  }

  const prices = [
    { label: "Salão", value: product.price_salon },
    ...(product.price_balcao ? [{ label: "Balcão", value: product.price_balcao }] : []),
    ...(product.price_delivery ? [{ label: "Delivery", value: product.price_delivery }] : []),
  ];

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-40 bg-background border-b">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center h-10 w-10 rounded-full hover:bg-accent active:scale-95 transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold truncate">{product.name}</h1>
        </div>
      </div>

      {product.image_url ? (
        <img
          src={imagemNoTamanho(product.image_url, 900)}
          alt={product.name}
          className="w-full h-56 object-cover"
        />
      ) : (
        <div className="w-full h-56 bg-muted flex items-center justify-center text-muted-foreground">
          Sem imagem
        </div>
      )}

      <div className="px-4 py-4 space-y-4">
        <div>
          <h2 className="text-lg font-bold">{product.name}</h2>
          <p className="text-sm text-muted-foreground">{product.category}</p>
        </div>

        {product.description && (
          <p className="text-sm text-muted-foreground">{product.description}</p>
        )}

        <div className="flex flex-wrap gap-3">
          {prices.map((p) => (
            <div key={p.label} className="rounded-lg border bg-card px-4 py-2">
              <p className="text-xs text-muted-foreground">{p.label}</p>
              <p className="text-base font-bold text-primary">
                {formatBRL(p.value)}
              </p>
            </div>
          ))}
        </div>

        {product.preparation_time > 0 && (
          <p className="text-xs text-muted-foreground">
            Tempo de preparo: {product.preparation_time} min
          </p>
        )}
        {product.serves > 1 && (
          <p className="text-xs text-muted-foreground">
            Serve {product.serves} pessoas
          </p>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 border-t bg-background">
        <div className="px-4 pt-3 pb-[calc(6rem+env(safe-area-inset-bottom))]">
          <Button
            className="w-full h-12 text-base gap-2"
            onClick={() => {
              // Navigate back to itens list; user can add from comanda flow
              navigate("/garcom/comandas");
            }}
          >
            <Plus className="h-5 w-5" />
            Adicionar em Comanda
          </Button>
        </div>
      </div>
    </div>
  );
}
