import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Check } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import type { MesaGrupo, MesaItemPedido, MesaProduto } from "@/hooks/use-mesa-digital";

/** Item no carrinho do cliente: o pedido (ids) mais o que a tela mostra. */
export interface ItemCarrinho {
  chave: string;
  pedido: MesaItemPedido;
  nome: string;
  resumo: string;
  precoUnitario: number;
}

type Selecao = Record<string /* grupo */, Record<string /* item */, number>>;

const total = (sel?: Record<string, number>) => Object.values(sel ?? {}).reduce((s, n) => s + n, 0);

/** Mesma regra das telas do garçom e do servidor (mesa_validar_itens). */
function grupoValido(g: MesaGrupo, sel?: Record<string, number>) {
  const t = total(sel);
  if (g.max > 0 && t > g.max) return false;
  if (!g.obrigatorio) return true;
  return t >= (g.min || 1);
}

function ajuda(g: MesaGrupo) {
  const min = g.min || (g.obrigatorio ? 1 : 0);
  const max = g.max || 0;
  if (g.tipo === "single") return g.obrigatorio ? "Escolha 1" : "Escolha até 1";
  if (max > 0 && min > 0 && min === max) return `Escolha ${min}`;
  if (max > 0 && min > 0) return `Escolha de ${min} a ${max}`;
  if (max > 0) return `Escolha até ${max}`;
  if (min > 0) return `Escolha pelo menos ${min}`;
  return "Opcional";
}

interface Props {
  produto: MesaProduto | null;
  cor: string;
  onFechar: () => void;
  onAdicionar: (item: ItemCarrinho) => void;
}

export function ProdutoMesaSheet({ produto, cor, onFechar, onAdicionar }: Props) {
  const [sel, setSel] = useState<Selecao>({});
  const [qtd, setQtd] = useState(1);
  const [obs, setObs] = useState("");

  useEffect(() => {
    setSel({});
    setQtd(1);
    setObs("");
  }, [produto?.id]);

  const grupos = useMemo(
    () => [
      ...(produto?.etapas ?? []).map((g) => ({ g, etapa: true })),
      ...(produto?.opcoes ?? []).map((g) => ({ g, etapa: false })),
    ],
    [produto],
  );

  const alternar = (g: MesaGrupo, itemId: string, etapa: boolean) => {
    setSel((prev) => {
      const atual = { ...(prev[g.id] ?? {}) };
      const marcado = (atual[itemId] ?? 0) > 0;
      if (g.tipo === "single") {
        if (marcado) return g.obrigatorio ? prev : { ...prev, [g.id]: {} };
        return { ...prev, [g.id]: { [itemId]: 1 } };
      }
      if (marcado && !(etapa && g.quantidade)) {
        delete atual[itemId];
        return { ...prev, [g.id]: atual };
      }
      if (g.max > 0 && total(atual) >= g.max) return prev;
      atual[itemId] = (atual[itemId] ?? 0) + 1;
      return { ...prev, [g.id]: atual };
    });
  };

  const diminuir = (g: MesaGrupo, itemId: string) => {
    setSel((prev) => {
      const atual = { ...(prev[g.id] ?? {}) };
      const n = (atual[itemId] ?? 0) - 1;
      if (n <= 0) delete atual[itemId];
      else atual[itemId] = n;
      return { ...prev, [g.id]: atual };
    });
  };

  if (!produto) return null;

  const extra = (produto.opcoes ?? []).reduce(
    (s, g) => s + g.itens.reduce((t, i) => t + (sel[g.id]?.[i.id] ?? 0) * (i.preco ?? 0), 0),
    0,
  );
  const unitario = produto.preco + extra;
  const valido = grupos.every(({ g }) => grupoValido(g, sel[g.id]));

  const adicionar = () => {
    const selected_options = grupos
      .filter(({ g }) => total(sel[g.id]) > 0)
      .map(({ g }) => ({
        optionId: g.id,
        // item repetido vai repetido: é assim que o servidor conta a quantidade
        items: g.itens.flatMap((i) =>
          Array.from({ length: sel[g.id]?.[i.id] ?? 0 }, () => ({ itemId: i.id })),
        ),
      }));
    const resumo = grupos
      .filter(({ g }) => total(sel[g.id]) > 0)
      .map(({ g }) =>
        g.itens
          .filter((i) => (sel[g.id]?.[i.id] ?? 0) > 0)
          .map((i) => ((sel[g.id]?.[i.id] ?? 0) > 1 ? `${sel[g.id]?.[i.id]}x ${i.nome}` : i.nome))
          .join(", "),
      )
      .concat(obs.trim() ? [`Obs: ${obs.trim()}`] : [])
      .join(" · ");
    onAdicionar({
      chave: crypto.randomUUID(),
      pedido: { product_id: produto.id, quantity: qtd, notes: obs.trim() || undefined, selected_options },
      nome: produto.nome,
      resumo,
      precoUnitario: unitario,
    });
  };

  return (
    <Sheet open={!!produto} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent side="bottom" className="flex max-h-[92vh] flex-col gap-0 rounded-t-2xl p-0">
        {produto.foto && (
          <img src={produto.foto} alt="" className="h-48 w-full shrink-0 rounded-t-2xl object-cover" />
        )}
        <SheetHeader className="shrink-0 px-5 pt-4 text-left">
          <SheetTitle className="text-lg">{produto.nome}</SheetTitle>
          {produto.descricao && <p className="text-sm text-muted-foreground">{produto.descricao}</p>}
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {grupos.map(({ g, etapa }) => {
            const t = total(sel[g.id]);
            const ok = grupoValido(g, sel[g.id]);
            return (
              <section key={g.id}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{g.nome}</h3>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      g.obrigatorio && !ok ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {g.obrigatorio && !ok ? "Obrigatório · " : ""}
                    {ajuda(g)}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {g.itens.map((i) => {
                    const n = sel[g.id]?.[i.id] ?? 0;
                    const cheio = g.max > 0 && t >= g.max && n === 0 && g.tipo !== "single";
                    return (
                      <div
                        key={i.id}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                          n > 0 && "border-transparent ring-2",
                          cheio && "opacity-50",
                        )}
                        style={n > 0 ? ({ "--tw-ring-color": cor } as React.CSSProperties) : undefined}
                      >
                        <button
                          type="button"
                          disabled={cheio}
                          onClick={() => alternar(g, i.id, etapa)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center border",
                              g.tipo === "single" ? "rounded-full" : "rounded",
                            )}
                            style={n > 0 ? { background: cor, borderColor: cor } : undefined}
                          >
                            {n > 0 && <Check className="h-3.5 w-3.5 text-white" />}
                          </span>
                          <span className="min-w-0 flex-1 text-sm">{i.nome}</span>
                          {!etapa && (i.preco ?? 0) > 0 && (
                            <span className="text-sm text-muted-foreground">{produto.preco > 0 ? "+ " : ""}{formatBRL(i.preco ?? 0)}</span>
                          )}
                        </button>
                        {etapa && g.quantidade && n > 0 && (
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => diminuir(g, i.id)} className="rounded-full border p-1">
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-4 text-center text-sm font-medium">{n}</span>
                            <button
                              type="button"
                              onClick={() => alternar(g, i.id, etapa)}
                              disabled={g.max > 0 && t >= g.max}
                              className="rounded-full border p-1 disabled:opacity-40"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section>
            <h3 className="mb-2 font-semibold">Alguma observação?</h3>
            <Textarea
              value={obs}
              onChange={(e) => setObs(e.target.value.slice(0, 140))}
              placeholder="Ex.: sem cebola"
              rows={2}
            />
          </section>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3 rounded-full border px-2 py-1">
            <button type="button" onClick={() => setQtd((q) => Math.max(1, q - 1))} className="p-1">
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-5 text-center font-semibold">{qtd}</span>
            <button type="button" onClick={() => setQtd((q) => Math.min(20, q + 1))} className="p-1">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <Button
            className="h-12 flex-1 rounded-full text-base text-white"
            style={{ background: cor }}
            disabled={!valido}
            onClick={adicionar}
          >
            Adicionar · {formatBRL(unitario * qtd)}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
