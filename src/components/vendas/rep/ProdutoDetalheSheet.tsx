import { useEffect, useRef, useState } from "react";
import { Copy, ImageIcon, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatarQtd, fotosProduto, precoVenda } from "@/components/vendas/catalogo/catalogo-utils";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { VendasProduto } from "@/lib/vendas/types";
import { useRepContext } from "./RepContext";
import { SHEET_CLOSE_GRANDE, whatsappShareHref } from "./rep-utils";

/** Texto do produto para mandar ao cliente pelo WhatsApp (nome, preço, regras e link da foto). */
export function textoCompartilharProduto(p: VendasProduto, assinatura?: string): string {
  const unidade = p.sales_unit?.trim();
  const preco = `${formatBRL(precoVenda(p))}${unidade ? ` / ${unidade}` : ""}`;
  const regras = [
    p.min_qty ? `Pedido mínimo: ${formatarQtd(p.min_qty)}${unidade ? ` ${unidade}` : ""}` : null,
    p.pack_qty ? `Embalagem com ${formatarQtd(p.pack_qty)}` : null,
  ].filter(Boolean);
  const foto = fotosProduto(p)[0];
  const descricao = p.description?.trim();
  const linhas = [
    `*${p.name}*`,
    p.sku ? `Código: ${p.sku}` : null,
    `Preço: *${preco}*`,
    regras.length ? regras.join(" · ") : null,
    descricao ? `\n${descricao.length > 300 ? `${descricao.slice(0, 297)}...` : descricao}` : null,
    foto ? `\nFoto: ${foto}` : null,
    assinatura ? `\n${assinatura}` : null,
  ];
  return linhas.filter(Boolean).join("\n");
}

/** Ficha do produto no celular: fotos, preço, regras de venda, descrição e compartilhar. */
export function ProdutoDetalheSheet({
  produto,
  onOpenChange,
}: {
  produto: VendasProduto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { brand, rep } = useRepContext();
  const [foto, setFoto] = useState(0);
  const trilho = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFoto(0);
    trilho.current?.scrollTo({ left: 0 });
  }, [produto?.id]);

  const p = produto;
  const fotos = p ? fotosProduto(p) : [];
  const unidade = p?.sales_unit?.trim();
  const assinatura = [rep?.name, brand.name].filter(Boolean).join(" · ");
  const texto = p ? textoCompartilharProduto(p, assinatura) : "";

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Texto copiado.");
    } catch {
      toast.error("Não foi possível copiar neste aparelho.");
    }
  };

  const irPara = (i: number) => {
    const el = trilho.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <Sheet open={!!p} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn("mx-auto flex max-h-[92dvh] max-w-[440px] flex-col gap-0 overflow-hidden rounded-t-2xl p-0", SHEET_CLOSE_GRANDE)}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {p && (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* Fotos */}
              <div className="relative bg-muted">
                {fotos.length === 0 ? (
                  <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-xs">Sem foto</span>
                  </div>
                ) : (
                  <div
                    ref={trilho}
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      setFoto(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
                    }}
                    className="flex aspect-square w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {fotos.map((url, i) => (
                      <img
                        key={url}
                        src={url}
                        alt={`${p.name} · foto ${i + 1}`}
                        loading={i === 0 ? "eager" : "lazy"}
                        className="h-full w-full shrink-0 snap-center object-contain"
                      />
                    ))}
                  </div>
                )}
                {fotos.length > 1 && (
                  <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
                    {fotos.map((url, i) => (
                      <button
                        key={url}
                        type="button"
                        aria-label={`Ver foto ${i + 1}`}
                        onClick={() => irPara(i)}
                        className={cn(
                          "h-2 rounded-full transition-all",
                          i === foto ? "w-5 bg-primary" : "w-2 bg-background/80 shadow",
                        )}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4 px-5 pb-4 pt-4">
                <SheetHeader className="space-y-1 text-left">
                  <SheetTitle className="text-lg leading-snug">{p.name}</SheetTitle>
                  <SheetDescription className="flex flex-wrap gap-x-2 text-xs">
                    {p.sku && <span className="font-mono">{p.sku}</span>}
                    {p.category && <span>{p.category}</span>}
                    {p.ean && <span>EAN {p.ean}</span>}
                  </SheetDescription>
                </SheetHeader>

                <div className="rounded-2xl bg-muted/60 p-4">
                  <p className="text-2xl font-bold tabular-nums">
                    {formatBRL(precoVenda(p))}
                    {unidade && <span className="text-sm font-normal text-muted-foreground"> / {unidade}</span>}
                  </p>
                  {p.price_b2b == null && <p className="text-xs text-muted-foreground">preço de balcão</p>}
                  {(p.min_qty || p.pack_qty) && (
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      {p.min_qty ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">Pedido mínimo</dt>
                          <dd className="font-medium">
                            {formatarQtd(p.min_qty)}
                            {unidade ? ` ${unidade}` : ""}
                          </dd>
                        </div>
                      ) : null}
                      {p.pack_qty ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">Embalagem</dt>
                          <dd className="font-medium">com {formatarQtd(p.pack_qty)}</dd>
                        </div>
                      ) : null}
                    </dl>
                  )}
                </div>

                {p.description?.trim() ? (
                  <div>
                    <h3 className="mb-1 text-sm font-semibold">Descrição</h3>
                    <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{p.description}</p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex gap-2 border-t bg-background px-4 py-3">
              <Button variant="outline" className="h-12 w-12 shrink-0 rounded-xl p-0" onClick={copiar} aria-label="Copiar texto">
                <Copy className="h-5 w-5" />
              </Button>
              <Button asChild className="h-12 flex-1 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
                <a href={whatsappShareHref(texto)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  Compartilhar
                </a>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
