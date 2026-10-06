import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronRight, Eye, EyeOff, Flame, GripVertical, Loader2, Pin, PinOff, Search, Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { usePDVProducts } from "@/hooks/use-pdv-products";
import {
  casaBusca, useWaiterMenuItems, useWaiterMenuSettings, useWaiterTopProducts,
} from "@/hooks/use-waiter-menu";
import { formatBRL } from "@/lib/format";

const JANELAS = [
  { valor: 7, rotulo: "últimos 7 dias" },
  { valor: 14, rotulo: "últimos 14 dias" },
  { valor: 30, rotulo: "últimos 30 dias" },
  { valor: 60, rotulo: "últimos 60 dias" },
  { valor: 90, rotulo: "últimos 90 dias" },
];

/**
 * Categoria na lista de ordenação.
 *
 * Abre ao toque e mostra os produtos dela, cada um com os mesmos botões de
 * fixar e esconder. Sem isso, esconder meia dúzia de itens de uma categoria
 * exigia buscar um por um no campo lá de baixo.
 */
function CategoriaArrastavel({
  categoria, oculta, produtos, prefs, vendas, aberta, onAbrir, onAlternar, onDefinir,
}: {
  categoria: string;
  oculta: boolean;
  produtos: any[];
  prefs: Map<string, { fixado: boolean; oculto: boolean }>;
  vendas: Map<string, number>;
  aberta: boolean;
  onAbrir: () => void;
  onAlternar: () => void;
  onDefinir: (m: any) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: categoria });

  const escondidos = produtos.filter((p) => prefs.get(p.id)?.oculto).length;
  const fixados = produtos.filter((p) => prefs.get(p.id)?.fixado).length;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-lg border bg-card ${isDragging ? "opacity-60" : ""} ${oculta ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-2 p-2.5">
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </button>

        <button type="button" onClick={onAbrir} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberta ? "rotate-90" : ""}`} />
          <span className="truncate text-sm font-medium">{categoria}</span>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          {fixados > 0 && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Pin className="h-3 w-3" />{fixados}
            </Badge>
          )}
          {escondidos > 0 && (
            <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
              <EyeOff className="h-3 w-3" />{escondidos}
            </Badge>
          )}
          <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{produtos.length}</span>
          <Button size="sm" variant="ghost" onClick={onAlternar} title={oculta ? "Mostrar categoria" : "Esconder categoria inteira"}>
            {oculta ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {aberta && (
        <div className="space-y-1.5 border-t bg-muted/30 p-2.5">
          {oculta && (
            <p className="pb-1 text-[11px] text-muted-foreground">
              A categoria inteira está escondida do garçom. O que você marcar aqui vale quando ela voltar.
            </p>
          )}
          {produtos.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">Nenhum produto ativo nesta categoria.</p>
          ) : (
            produtos.map((p) => (
              <LinhaProduto
                key={p.id}
                produto={p}
                pref={prefs.get(p.id)}
                vendas={vendas.get(p.id)}
                onDefinir={onDefinir}
                compacta
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function CardapioGarcom() {
  const { products, isLoading } = usePDVProducts();
  const { settings, salvar } = useWaiterMenuSettings();
  const { itens, definir } = useWaiterMenuItems();
  const { data: maisPedidos = [], isLoading: carregandoRanking } = useWaiterTopProducts(
    settings?.destaque_janela_dias ?? 30,
    settings?.destaque_quantidade ?? 20,
  );
  const [busca, setBusca] = useState("");
  const [categoriaAberta, setCategoriaAberta] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ativos = useMemo(() => (products ?? []).filter((p) => p.is_available), [products]);
  const prefPorProduto = useMemo(() => new Map(itens.map((i) => [i.product_id, i])), [itens]);

  const categorias = useMemo(() => {
    const presentes = [...new Set(ativos.map((p) => p.category))];
    const ordem = settings?.categorias_ordem ?? [];
    const ordenadas = ordem.filter((c) => presentes.includes(c));
    return [...ordenadas, ...presentes.filter((c) => !ordenadas.includes(c)).sort()];
  }, [ativos, settings]);

  const ocultas = new Set(settings?.categorias_ocultas ?? []);

  const vendasPorProduto = useMemo(
    () => new Map(maisPedidos.map((t) => [t.product_id, t.quantidade])),
    [maisPedidos],
  );

  const produtosPorCategoria = useMemo(() => {
    const mapa = new Map<string, typeof ativos>();
    for (const p of ativos) {
      const lista = mapa.get(p.category) ?? [];
      lista.push(p);
      mapa.set(p.category, lista);
    }
    // Dentro da categoria, o que mais vende aparece primeiro: é onde a mão do
    // dono costuma querer mexer.
    for (const [, lista] of mapa) {
      lista.sort((a, b) => {
        const va = vendasPorProduto.get(a.id) ?? -1;
        const vb = vendasPorProduto.get(b.id) ?? -1;
        if (va !== vb) return Number(vb) - Number(va);
        return a.name.localeCompare(b.name);
      });
    }
    return mapa;
  }, [ativos, vendasPorProduto]);

  const aoSoltar = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const de = categorias.indexOf(String(active.id));
    const para = categorias.indexOf(String(over.id));
    salvar.mutate({ categorias_ordem: arrayMove(categorias, de, para) });
  };

  const alternarCategoria = (c: string) => {
    const novo = ocultas.has(c)
      ? (settings?.categorias_ocultas ?? []).filter((x) => x !== c)
      : [...(settings?.categorias_ocultas ?? []), c];
    salvar.mutate({ categorias_ocultas: novo });
  };

  const fixados = useMemo(
    () => ativos.filter((p) => prefPorProduto.get(p.id)?.fixado),
    [ativos, prefPorProduto],
  );

  // O que o garçom vai ver quando abrir a tela, na ordem exata.
  const previa = useMemo(() => {
    const modo = settings?.destaque_modo ?? "misto";
    const doHistorico = maisPedidos
      .map((t) => ativos.find((p) => p.id === t.product_id))
      .filter(Boolean) as typeof ativos;
    if (modo === "manual") return fixados;
    if (modo === "historico") return doHistorico;
    const vistos = new Set(fixados.map((p) => p.id));
    return [...fixados, ...doHistorico.filter((p) => !vistos.has(p.id))];
  }, [settings, maisPedidos, ativos, fixados]);

  const resultadoBusca = useMemo(
    () => (busca.trim() ? ativos.filter((p) => casaBusca(p.name, busca)).slice(0, 40) : []),
    [ativos, busca],
  );


  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Cardápio do garçom</h1>
        <p className="text-sm text-muted-foreground">
          Como a lista de produtos aparece no celular de quem atende a mesa. Não mexe no catálogo:
          só muda a ordem e o que fica à vista.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Regras */}
        <Card className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs">O que abre a tela do garçom</Label>
            <Select
              value={settings?.destaque_modo ?? "misto"}
              onValueChange={(v: any) => salvar.mutate({ destaque_modo: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="misto">O que eu fixei, depois os mais pedidos</SelectItem>
                <SelectItem value="historico">Só os mais pedidos</SelectItem>
                <SelectItem value="manual">Só o que eu fixei</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Mais pedidos conta</Label>
            <Select
              value={String(settings?.destaque_janela_dias ?? 30)}
              onValueChange={(v) => salvar.mutate({ destaque_janela_dias: Number(v) as any })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {JANELAS.map((j) => (
                  <SelectItem key={j.valor} value={String(j.valor)}>{j.rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              7 dias acompanha a semana e muda rápido. 30 ou 90 dão uma lista mais estável.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Quantos itens em destaque: {settings?.destaque_quantidade ?? 20}</Label>
            <Input
              type="range" min={5} max={60} step={5}
              value={settings?.destaque_quantidade ?? 20}
              onChange={(e) => salvar.mutate({ destaque_quantidade: Number(e.target.value) })}
            />
          </div>

          <div className="rounded-md border p-3 text-xs text-muted-foreground">
            No Kōten, os <strong>15 itens mais pedidos</strong> são 69% de tudo que o salão lança.
            Por isso a tela abre por eles: na maior parte das vezes o garçom não precisa nem buscar.
          </div>
        </Card>

        {/* Categorias */}
        <Card className="p-4">
          <p className="mb-1 font-medium">Ordem das categorias</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Arraste para ordenar e <strong>toque no nome</strong> para abrir os produtos dela. O olho
            fechado esconde do app do garçom, sem tirar do catálogo.
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
            <SortableContext items={categorias} strategy={verticalListSortingStrategy}>
              <div className="max-h-[560px] space-y-1.5 overflow-auto pr-1">
                {categorias.map((c) => (
                  <CategoriaArrastavel
                    key={c}
                    categoria={c}
                    oculta={ocultas.has(c)}
                    produtos={produtosPorCategoria.get(c) ?? []}
                    prefs={prefPorProduto as any}
                    vendas={vendasPorProduto as any}
                    aberta={categoriaAberta === c}
                    onAbrir={() => setCategoriaAberta(categoriaAberta === c ? null : c)}
                    onAlternar={() => alternarCategoria(c)}
                    onDefinir={definir.mutate}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </Card>

        {/* Prévia */}
        <Card className="p-4">
          <p className="mb-1 flex items-center gap-2 font-medium">
            <Smartphone className="h-4 w-4" /> O que o garçom vê
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            Exatamente nesta ordem, ao abrir "adicionar item".
          </p>
          {carregandoRanking ? (
            <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
          ) : previa.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Ainda sem histórico de vendas. Fixe os carro-chefe abaixo para a tela abrir com eles.
            </p>
          ) : (
            <ol className="max-h-[420px] space-y-1 overflow-auto pr-1 text-sm">
              {previa.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2 rounded-md border p-2">
                  <span className="w-5 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  {prefPorProduto.get(p.id)?.fixado ? (
                    <Pin className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Flame className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {vendasPorProduto.has(p.id) && (
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {Math.round(Number(vendasPorProduto.get(p.id)))}x
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {/* Produtos */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">Destacar ou esconder um produto</p>
            <p className="text-xs text-muted-foreground">
              Fixar sobe para o topo mesmo sem histórico. Esconder tira da lista do garçom, e só dela.
            </p>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar produto..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
        ) : !busca.trim() ? (
          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Fixados</p>
            {fixados.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum produto fixado. Busque acima para fixar o carro-chefe da casa.
              </p>
            ) : (
              fixados.map((p) => (
                <LinhaProduto
                  key={p.id} produto={p} pref={prefPorProduto.get(p.id)}
                  vendas={vendasPorProduto.get(p.id)} onDefinir={definir.mutate}
                />
              ))
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {resultadoBusca.map((p) => (
              <LinhaProduto
                key={p.id} produto={p} pref={prefPorProduto.get(p.id)}
                vendas={vendasPorProduto.get(p.id)} onDefinir={definir.mutate}
              />
            ))}
            {resultadoBusca.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nada encontrado.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function LinhaProduto({
  produto, pref, vendas, onDefinir, compacta,
}: {
  produto: any;
  pref?: { fixado: boolean; oculto: boolean };
  vendas?: number;
  onDefinir: (m: any) => void;
  /** Dentro da categoria aberta, onde o nome dela já está no cabeçalho. */
  compacta?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border bg-background p-2 ${pref?.oculto ? "opacity-50" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{produto.name}</p>
        <p className="text-xs text-muted-foreground">
          {compacta ? formatBRL(produto.price_salon) : `${produto.category} · ${formatBRL(produto.price_salon)}`}
          {vendas != null && ` · ${Math.round(Number(vendas))} vendidos`}
        </p>
      </div>
      {vendas == null && !compacta && (
        <Badge variant="outline" className="text-[10px]">sem venda no período</Badge>
      )}
      <Button
        size="sm"
        variant={pref?.fixado ? "default" : "outline"}
        onClick={() => onDefinir({ product_id: produto.id, fixado: !pref?.fixado, oculto: pref?.oculto ?? false })}
      >
        {pref?.fixado ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onDefinir({ product_id: produto.id, oculto: !pref?.oculto, fixado: pref?.fixado ?? false })}
      >
        {pref?.oculto ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
}
