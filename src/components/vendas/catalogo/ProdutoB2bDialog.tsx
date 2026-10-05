import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, ImagePlus, Loader2, Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProductImageUpload } from "@/hooks/use-product-image-upload";
import { useAtualizarProdutoB2b, useCriarProdutoB2b, type ProdutoB2bGravar } from "@/hooks/use-vendas-catalogo-gestao";
import { formatBRL } from "@/lib/format";
import type { VendasProduto } from "@/lib/vendas/types";
import { UNIDADES_SUGERIDAS } from "./catalogo-utils";

const MAX_GALERIA = 10;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  produto: VendasProduto | null;
  categorias: string[];
  /** Só o dono grava produtos (regra do banco); os demais veem em modo leitura. */
  podeEditar: boolean;
};

type Form = {
  name: string;
  category: string;
  description: string;
  b2b_enabled: boolean;
  price_b2b: string;
  price_balcao: string;
  sku: string;
  sales_unit: string;
  min_qty: string;
  pack_qty: string;
};

const formInicial = (p: VendasProduto | null): Form => ({
  name: p?.name ?? "",
  category: p?.category ?? "",
  description: p?.description ?? "",
  b2b_enabled: p ? p.b2b_enabled : true,
  price_b2b: p?.price_b2b != null ? String(p.price_b2b) : "",
  price_balcao: p?.price_balcao != null ? String(p.price_balcao) : "",
  sku: p?.sku ?? "",
  sales_unit: p?.sales_unit ?? "",
  min_qty: qtdParaCampo(p?.min_qty),
  pack_qty: qtdParaCampo(p?.pack_qty),
});

/** 2.5 → "2,5" (sem separador de milhar, para o campo). */
function qtdParaCampo(v: number | null | undefined): string {
  return v == null ? "" : String(Number(v)).replace(".", ",");
}

/** "2,5" ou "2.5" → 2.5; "1.000,5" → 1000.5; vazio → null; inválido → NaN. */
function lerQtd(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
}

/** Foto de celular tem 4000 px e 6 MB: reduz para 1600 px em JPEG antes de subir. */
async function reduzirImagem(arquivo: Blob, max = 1600): Promise<File> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = erro;
      i.src = url;
    });
    const escala = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    if (!blob) throw new Error("toBlob");
    return new File([blob], "produto.jpg", { type: "image/jpeg" });
  } catch {
    return new File([arquivo], "produto.jpg", { type: arquivo.type || "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Edição do produto para a Força de vendas: preço de representante, regras de venda, descrição e fotos. */
export function ProdutoB2bDialog({ open, onOpenChange, produto, categorias, podeEditar }: Props) {
  const atualizar = useAtualizarProdutoB2b();
  const criar = useCriarProdutoB2b();
  const { uploadImage } = useProductImageUpload();
  const [form, setForm] = useState<Form>(() => formInicial(produto));
  const [imagem, setImagem] = useState<string | null>(produto?.image_url ?? null);
  const [galeria, setGaleria] = useState<string[]>(produto?.gallery ?? []);
  const [enviando, setEnviando] = useState(0);
  const [recorte, setRecorte] = useState<string | null>(null);
  const [erros, setErros] = useState<Partial<Record<keyof Form, string>>>({});
  const inputPrincipal = useRef<HTMLInputElement>(null);
  const inputGaleria = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(formInicial(produto));
      setImagem(produto?.image_url ?? null);
      setGaleria((produto?.gallery ?? []).filter((g) => g !== produto?.image_url));
      setErros({});
    }
  }, [open, produto]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (erros[k]) setErros((e) => ({ ...e, [k]: undefined }));
  };

  const subir = async (arquivo: Blob): Promise<string | null> => {
    setEnviando((n) => n + 1);
    try {
      const reduzido = await reduzirImagem(arquivo);
      return await uploadImage(reduzido);
    } finally {
      setEnviando((n) => n - 1);
    }
  };

  const escolherPrincipal = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Escolha um arquivo de imagem.");
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => setRecorte(leitor.result as string);
    leitor.readAsDataURL(f);
  };

  const adicionarGaleria = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    if (arquivos.length === 0) return;
    const vagas = MAX_GALERIA - galeria.length;
    if (vagas <= 0) {
      toast.error(`No máximo ${MAX_GALERIA} fotos extras.`);
      return;
    }
    if (arquivos.length > vagas) toast.warning(`Só cabem mais ${vagas} fotos: as demais ficaram de fora.`);
    for (const f of arquivos.slice(0, vagas)) {
      const url = await subir(f);
      if (url) {
        if (!imagem) setImagem(url);
        else setGaleria((g) => [...g, url]);
      }
    }
  };

  const tornarPrincipal = (url: string) => {
    setGaleria((g) => {
      const resto = g.filter((x) => x !== url);
      return imagem ? [imagem, ...resto] : resto;
    });
    setImagem(url);
  };

  const removerPrincipal = () => {
    // A primeira foto extra sobe para principal (as fotos ficam no armazenamento: propostas antigas podem usá-las).
    setImagem(galeria[0] ?? null);
    setGaleria(galeria.slice(1));
  };

  const validar = () => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (form.name.trim().length < 2) e.name = "Informe o nome do produto.";
    if (!form.category.trim()) e.category = "Informe a categoria.";
    const min = lerQtd(form.min_qty);
    if (min != null && !(min > 0)) e.min_qty = "Use um número maior que zero.";
    const emb = lerQtd(form.pack_qty);
    if (emb != null && !(emb > 0)) e.pack_qty = "Use um número maior que zero.";
    if (!produto && form.price_b2b === "" && form.price_balcao === "") e.price_balcao = "Informe ao menos um preço.";
    return e;
  };

  const gravar = async () => {
    const e = validar();
    setErros(e);
    if (Object.keys(e).length > 0) {
      toast.error("Confira os campos destacados.");
      return;
    }
    const precoB2b = form.price_b2b === "" ? null : Number(form.price_b2b);
    const dados: ProdutoB2bGravar = {
      name: form.name.trim(),
      category: form.category.trim(),
      description: form.description.trim() || null,
      b2b_enabled: form.b2b_enabled,
      price_b2b: precoB2b,
      sku: form.sku.trim() || null,
      sales_unit: form.sales_unit.trim() || null,
      min_qty: lerQtd(form.min_qty),
      pack_qty: lerQtd(form.pack_qty),
      image_url: imagem,
      gallery: galeria.filter((g) => g !== imagem),
    };
    try {
      if (produto) {
        await atualizar.mutateAsync({ id: produto.id, dados });
        toast.success("Produto atualizado.");
      } else {
        const balcao = form.price_balcao === "" ? (precoB2b ?? 0) : Number(form.price_balcao);
        await criar.mutateAsync({ dados: dados as ProdutoB2bGravar & { name: string; category: string }, precoBalcao: balcao });
        toast.success("Produto cadastrado.");
      }
      onOpenChange(false);
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (err?.code === "42501" || /row-level security/i.test(msg)) {
        toast.error("Só o dono do estabelecimento altera produtos.");
      } else {
        toast.error("Não foi possível salvar o produto. " + msg);
      }
    }
  };

  const ocupado = atualizar.isPending || criar.isPending;
  const bloqueado = !podeEditar;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !ocupado && onOpenChange(v)}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{produto ? "Produto no catálogo" : "Novo produto"}</DialogTitle>
            <DialogDescription>
              {bloqueado
                ? "Só o dono do estabelecimento altera produtos."
                : "Preço de representante, regras de venda e fotos que aparecem para o representante e na proposta."}
            </DialogDescription>
          </DialogHeader>

          <form
            className="grid grid-cols-1 gap-6 md:grid-cols-[220px_minmax(0,1fr)]"
            onSubmit={(ev) => {
              ev.preventDefault();
              gravar();
            }}
          >
            {/* Fotos */}
            <div className="space-y-3">
              <div className="relative mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-lg border bg-muted">
                {imagem ? (
                  <img src={imagem} alt="Foto principal" className="h-full w-full object-cover" />
                ) : (
                  <button
                    type="button"
                    disabled={bloqueado}
                    onClick={() => inputPrincipal.current?.click()}
                    className="flex h-full w-full flex-col items-center justify-center gap-1 text-sm text-muted-foreground"
                  >
                    <ImagePlus className="h-8 w-8" />
                    Foto principal
                  </button>
                )}
                {enviando > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                )}
              </div>
              {!bloqueado && (
                <div className="flex justify-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => inputPrincipal.current?.click()}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" /> {imagem ? "Trocar" : "Enviar"}
                  </Button>
                  {imagem && (
                    <Button type="button" size="sm" variant="ghost" onClick={removerPrincipal} aria-label="Remover foto principal">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}
              <input ref={inputPrincipal} type="file" accept="image/*" className="hidden" onChange={escolherPrincipal} />

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Mais fotos ({galeria.length}/{MAX_GALERIA})</Label>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {galeria.map((g) => (
                    <div key={g} className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
                      <img src={g} alt="" className="h-full w-full object-cover" />
                      {!bloqueado && (
                        <div className="absolute inset-0 flex items-center justify-center gap-0.5 bg-black/40 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                          <button
                            type="button"
                            title="Usar como principal"
                            className="rounded p-1 text-white hover:bg-white/20"
                            onClick={() => tornarPrincipal(g)}
                          >
                            <Star className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Remover"
                            className="rounded p-1 text-white hover:bg-white/20"
                            onClick={() => setGaleria((lista) => lista.filter((x) => x !== g))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!bloqueado && galeria.length < MAX_GALERIA && (
                    <button
                      type="button"
                      onClick={() => inputGaleria.current?.click()}
                      className="flex aspect-square items-center justify-center rounded-md border border-dashed text-muted-foreground hover:bg-muted"
                      title="Adicionar fotos"
                      aria-label="Adicionar fotos"
                    >
                      <ImagePlus className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <input ref={inputGaleria} type="file" accept="image/*" multiple className="hidden" onChange={adicionarGaleria} />
              </div>
            </div>

            {/* Dados */}
            <fieldset disabled={bloqueado} className="min-w-0 space-y-4">
              <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div>
                  <Label htmlFor="prod-b2b" className="text-sm">
                    No catálogo do representante
                  </Label>
                  <p className="text-xs text-muted-foreground">Aparece no celular do representante e nas propostas.</p>
                </div>
                <Switch id="prod-b2b" checked={form.b2b_enabled} onCheckedChange={(v) => set("b2b_enabled", v)} disabled={bloqueado} />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo label="Nome *" erro={erros.name} className="sm:col-span-2">
                  <Input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={160} />
                </Campo>
                <Campo label="Categoria *" erro={erros.category}>
                  <Input value={form.category} onChange={(e) => set("category", e.target.value)} list="vendas-categorias" />
                  <datalist id="vendas-categorias">
                    {categorias.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </Campo>
                <Campo label="Código (SKU)">
                  <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} maxLength={60} className="font-mono" />
                </Campo>
                <Campo label="Preço de representante" dica="Vazio: vale o preço de balcão.">
                  <CurrencyInput value={form.price_b2b} onChange={(v) => set("price_b2b", v)} disabled={bloqueado} />
                </Campo>
                {produto ? (
                  <Campo label="Preço de balcão" dica="Muda na edição completa do produto.">
                    <Input value={formatBRL(produto.price_balcao)} readOnly disabled />
                  </Campo>
                ) : (
                  <Campo label="Preço de balcão" erro={erros.price_balcao} dica="Vazio: igual ao de representante.">
                    <CurrencyInput value={form.price_balcao} onChange={(v) => set("price_balcao", v)} />
                  </Campo>
                )}
                <Campo label="Unidade de venda" dica="Ex.: cx, fardo, kg, un.">
                  <Input value={form.sales_unit} onChange={(e) => set("sales_unit", e.target.value)} list="vendas-unidades" maxLength={20} />
                  <datalist id="vendas-unidades">
                    {UNIDADES_SUGERIDAS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </Campo>
                <Campo label="Quantidade mínima" erro={erros.min_qty}>
                  <Input value={form.min_qty} onChange={(e) => set("min_qty", e.target.value)} inputMode="decimal" placeholder="Sem mínimo" />
                </Campo>
                <Campo label="Unidades por embalagem" erro={erros.pack_qty} dica="Ex.: caixa com 12.">
                  <Input value={form.pack_qty} onChange={(e) => set("pack_qty", e.target.value)} inputMode="decimal" />
                </Campo>
                <Campo label="Descrição" className="sm:col-span-2" dica="Aparece no catálogo e na proposta.">
                  <Textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
                </Campo>
              </div>
            </fieldset>

            <DialogFooter className="gap-2 md:col-span-2 sm:justify-between">
              {produto ? (
                <Button type="button" variant="link" asChild className="h-auto justify-start px-0">
                  <Link to={`/pdv/produtos?editar=${produto.id}`}>
                    Edição completa (fiscal, estoque) <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : (
                <span />
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={ocupado}>
                  {bloqueado ? "Fechar" : "Cancelar"}
                </Button>
                {!bloqueado && (
                  <Button type="submit" disabled={ocupado || enviando > 0}>
                    {(ocupado || enviando > 0) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar
                  </Button>
                )}
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {recorte && (
        <ImageCropDialog
          open={!!recorte}
          onOpenChange={(v) => !v && setRecorte(null)}
          imageSrc={recorte}
          aspectRatio={1}
          title="Recortar foto do produto"
          onCropComplete={async (blob) => {
            const url = await subir(blob);
            if (url) setImagem(url);
          }}
        />
      )}
    </>
  );
}

function Campo({
  label,
  erro,
  dica,
  className,
  children,
}: {
  label: string;
  erro?: string;
  dica?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`min-w-0 space-y-1.5 ${className ?? ""}`}>
      <Label className="text-sm">{label}</Label>
      {children}
      {erro ? (
        <p className="text-xs text-destructive">{erro}</p>
      ) : dica ? (
        <p className="text-xs text-muted-foreground">{dica}</p>
      ) : null}
    </div>
  );
}
