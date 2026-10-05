import { useMemo, useState } from "react";
import { ImageIcon, LayoutGrid, List, Loader2, Package, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CatalogoGrid } from "@/components/vendas/catalogo/CatalogoGrid";
import { ProdutoB2bDialog } from "@/components/vendas/catalogo/ProdutoB2bDialog";
import { formatarQtd, fotosProduto } from "@/components/vendas/catalogo/catalogo-utils";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useVendasCatalogo } from "@/hooks/use-vendas-catalogo";
import { useAtualizarProdutoB2b } from "@/hooks/use-vendas-catalogo-gestao";
import { formatBRL } from "@/lib/format";
import type { VendasProduto } from "@/lib/vendas/types";

const TODAS = "__todas__";
const POR_PAGINA = 200;

const normalizar = (v: string | null | undefined) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export default function Produtos() {
  const { user } = useAuth();
  const { visibleUserId } = useEstablishmentId();
  const podeEditar = !!user?.id && user.id === visibleUserId;
  const { produtos, isLoading } = useVendasCatalogo();
  const atualizar = useAtualizarProdutoB2b();

  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState(TODAS);
  const [situacao, setSituacao] = useState<"todos" | "no" | "fora">("todos");
  const [visao, setVisao] = useState<"lista" | "vitrine">("lista");
  const [limite, setLimite] = useState(POR_PAGINA);
  const [dialogo, setDialogo] = useState<{ aberto: boolean; produto: VendasProduto | null }>({ aberto: false, produto: null });
  const [alternando, setAlternando] = useState<string | null>(null);

  const categorias = useMemo(
    () => Array.from(new Set(produtos.map((p) => p.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [produtos],
  );
  const noCatalogo = useMemo(() => produtos.filter((p) => p.b2b_enabled).length, [produtos]);

  const filtrados = useMemo(() => {
    const q = normalizar(busca.trim());
    return produtos.filter((p) => {
      if (categoria !== TODAS && p.category !== categoria) return false;
      if (situacao === "no" && !p.b2b_enabled) return false;
      if (situacao === "fora" && p.b2b_enabled) return false;
      if (!q) return true;
      return normalizar([p.name, p.sku, p.ean, p.category, p.description].filter(Boolean).join(" ")).includes(q);
    });
  }, [produtos, busca, categoria, situacao]);

  const visiveis = filtrados.slice(0, limite);

  const alternarCatalogo = async (p: VendasProduto, ligar: boolean) => {
    setAlternando(p.id);
    try {
      await atualizar.mutateAsync({ id: p.id, dados: { b2b_enabled: ligar } });
      toast.success(ligar ? `${p.name} entrou no catálogo do representante.` : `${p.name} saiu do catálogo do representante.`);
    } catch (e: any) {
      toast.error("Não foi possível alterar. " + (e?.message ?? ""));
    } finally {
      setAlternando(null);
    }
  };

  const abrir = (produto: VendasProduto | null) => setDialogo({ aberto: true, produto });

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            O catálogo que o representante leva: foto, preço de representante e regras de venda.
          </p>
        </div>
        {podeEditar && (
          <Button onClick={() => abrir(null)} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Novo produto
          </Button>
        )}
      </div>

      {!podeEditar && (
        <Alert>
          <AlertDescription>Só o dono do estabelecimento altera produtos. Aqui você vê o catálogo em modo leitura.</AlertDescription>
        </Alert>
      )}

      <Card className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_200px_230px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setLimite(POR_PAGINA);
              }}
              placeholder="Buscar por nome, código, EAN..."
              className="pl-9"
            />
          </div>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger aria-label="Categoria">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas as categorias</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={situacao} onValueChange={(v) => setSituacao(v as typeof situacao)}>
            <SelectTrigger aria-label="Catálogo do representante">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os produtos</SelectItem>
              <SelectItem value="no">No catálogo do representante</SelectItem>
              <SelectItem value="fora">Fora do catálogo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Carregando..."
              : `${filtrados.length} ${filtrados.length === 1 ? "produto" : "produtos"} · ${noCatalogo} no catálogo do representante`}
          </p>
          <ToggleGroup type="single" value={visao} onValueChange={(v) => v && setVisao(v as typeof visao)} size="sm">
            <ToggleGroupItem value="lista" aria-label="Lista">
              <List className="mr-1.5 h-4 w-4" /> Lista
            </ToggleGroupItem>
            <ToggleGroupItem value="vitrine" aria-label="Vitrine">
              <LayoutGrid className="mr-1.5 h-4 w-4" /> Vitrine
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </Card>

      {isLoading ? (
        <Card className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </Card>
      ) : produtos.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-4 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Package className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Nenhum produto cadastrado</p>
            <p className="text-sm text-muted-foreground">Cadastre o primeiro com foto e preço de representante.</p>
          </div>
          {podeEditar && (
            <Button onClick={() => abrir(null)}>
              <Plus className="mr-2 h-4 w-4" /> Cadastrar produto
            </Button>
          )}
        </Card>
      ) : filtrados.length === 0 ? (
        <Card className="py-12 text-center text-sm text-muted-foreground">Nenhum produto com estes filtros.</Card>
      ) : visao === "vitrine" ? (
        <CatalogoGrid produtos={visiveis} onSelect={(p) => abrir(p)} selectLabel={podeEditar ? "Editar" : "Ver"} />
      ) : (
        <>
          {/* Computador */}
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14" />
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Balcão</TableHead>
                  <TableHead className="text-right">Representante</TableHead>
                  <TableHead>Venda</TableHead>
                  <TableHead className="text-center">No catálogo</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => abrir(p)}>
                    <TableCell>
                      <Miniatura produto={p} />
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{[p.sku, p.category].filter(Boolean).join(" · ")}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatBRL(p.price_balcao)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {p.price_b2b != null ? formatBRL(p.price_b2b) : <span className="text-xs font-normal text-muted-foreground">usa o de balcão</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      <RegrasVenda produto={p} />
                    </TableCell>
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={p.b2b_enabled}
                        onCheckedChange={(v) => alternarCatalogo(p, v)}
                        disabled={!podeEditar || alternando === p.id}
                        aria-label={`No catálogo do representante: ${p.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Celular */}
          <div className="space-y-2 md:hidden">
            {visiveis.map((p) => (
              <Card key={p.id} className="flex cursor-pointer items-center gap-3 p-3" onClick={() => abrir(p)}>
                <Miniatura produto={p} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{[p.sku, p.category].filter(Boolean).join(" · ")}</p>
                  <p className="text-sm tabular-nums">
                    <span className="font-semibold">{formatBRL(p.price_b2b ?? p.price_balcao)}</span>
                    {p.sales_unit && <span className="text-xs text-muted-foreground"> / {p.sales_unit}</span>}
                  </p>
                </div>
                <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                  <Switch
                    checked={p.b2b_enabled}
                    onCheckedChange={(v) => alternarCatalogo(p, v)}
                    disabled={!podeEditar || alternando === p.id}
                    aria-label={`No catálogo do representante: ${p.name}`}
                  />
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {!isLoading && filtrados.length > visiveis.length && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setLimite((l) => l + POR_PAGINA)}>
            Mostrar mais ({filtrados.length - visiveis.length} restantes)
          </Button>
        </div>
      )}

      <ProdutoB2bDialog
        open={dialogo.aberto}
        onOpenChange={(v) => setDialogo((d) => ({ ...d, aberto: v }))}
        produto={dialogo.produto}
        categorias={categorias}
        podeEditar={podeEditar}
      />
    </div>
  );
}

function Miniatura({ produto }: { produto: VendasProduto }) {
  const foto = fotosProduto(produto)[0];
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
      {foto ? (
        <img src={foto} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
}

function RegrasVenda({ produto: p }: { produto: VendasProduto }) {
  const partes = [
    p.sales_unit ? `por ${p.sales_unit}` : null,
    p.min_qty ? `mín. ${formatarQtd(p.min_qty)}` : null,
    p.pack_qty ? `emb. c/ ${formatarQtd(p.pack_qty)}` : null,
  ].filter(Boolean);
  return partes.length ? <span>{partes.join(" · ")}</span> : <span className="text-muted-foreground">·</span>;
}
