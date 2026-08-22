import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Copy, Loader2, MessageSquare, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePDVIngredients } from "@/hooks/use-pdv-ingredients";
import { useIngredientCategories } from "@/hooks/use-ingredient-categories";
import { useCreateStockCount, type NewCountLink } from "@/hooks/use-stock-count";
import { CategoryPickerDialog } from "./CategoryPickerDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHARE_ORIGIN = "https://pdv.velaraia.app";

const senhaSugerida = () => String(Math.floor(1000 + Math.random() * 9000));

/**
 * Abertura da contagem.
 *
 * O gestor escolhe os setores e cada um vira um link com senha própria — é o
 * que permite três pessoas contando ao mesmo tempo sem uma passar por cima da
 * outra, e é o que faz cada lista caber num turno.
 */
export function NewStockCountDialog({ open, onOpenChange }: Props) {
  const { ingredients } = usePDVIngredients();
  const { categories } = useIngredientCategories();
  const criar = useCreateStockCount();

  const [nome, setNome] = useState(() => `Contagem de ${new Date().toLocaleDateString("pt-BR")}`);
  const [blind, setBlind] = useState(true);
  const [horas, setHoras] = useState("24");
  const [links, setLinks] = useState<NewCountLink[]>([]);
  const [gerados, setGerados] = useState<Array<{ label: string; token: string }> | null>(null);
  const [seletorCategorias, setSeletorCategorias] = useState(false);

  // Setor é onde a coisa fica guardada; categoria é o que a coisa é. O gestor
  // divide o depósito pelos dois, e precisa ver o tamanho de cada lista antes
  // de entregar a alguém.
  const setores = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of ingredients ?? []) {
      const s = (i as any).sector || "Sem setor";
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [ingredients]);

  // A coluna `category` do insumo guarda o NOME quando veio do cadastro manual
  // e o ID quando veio de uma NF-e importada. As duas convenções convivem, e
  // assumir só uma fazia a lista aparecer vazia com 139 insumos categorizados.
  // Resolver para o nome é o denominador comum.
  const categoriasComItens = useMemo(() => {
    const porId = new Map((categories ?? []).map((c) => [c.id, c.name]));
    const contagem = new Map<string, number>();
    let semCategoria = 0;
    for (const i of ingredients ?? []) {
      const bruto = (i as any).category;
      if (!bruto) { semCategoria++; continue; }
      const nome = porId.get(bruto) ?? bruto;
      contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
    }
    const lista = Array.from(contagem.entries())
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return { lista, semCategoria };
  }, [ingredients, categories]);

  const adicionarSetor = (setor: string) => {
    if (links.some((l) => l.label === setor)) return;
    setLinks((v) => [
      ...v,
      { label: setor, password: senhaSugerida(), sectors: setor === "Sem setor" ? null : [setor] },
    ]);
  };

  // Recorte por nome: é o que o item da contagem guarda depois de resolvido.
  const adicionarCategorias = (nomes: string[], modo: "separados" | "juntos") => {
    if (nomes.length === 0) return;
    if (modo === "juntos") {
      // Um link para várias categorias: "essa pessoa conta essas três".
      const rotulo = nomes.length <= 2 ? nomes.join(" e ") : `${nomes.length} categorias`;
      setLinks((v) => [...v, { label: rotulo, password: senhaSugerida(), categories: nomes }]);
      return;
    }
    setLinks((v) => [
      ...v,
      ...nomes
        .filter((n) => !v.some((l) => l.label === n))
        .map((n) => ({ label: n, password: senhaSugerida(), categories: [n] })),
    ]);
  };

  const adicionarGeral = () => {
    if (links.some((l) => l.sectors == null && l.label === "Contagem geral")) return;
    setLinks((v) => [...v, { label: "Contagem geral", password: senhaSugerida(), sectors: null }]);
  };

  const confirmar = () => {
    if (links.length === 0) {
      toast.error("Adicione ao menos um link.");
      return;
    }
    criar.mutate(
      {
        name: nome,
        links,
        sectors: null,
        blind,
        expiresHours: Number(horas) || 24,
      },
      { onSuccess: (r) => setGerados(r.links) },
    );
  };

  const urlDoLink = (token: string) => `${SHARE_ORIGIN}/contagem/${token}`;

  const fechar = () => {
    setGerados(null);
    setLinks([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : fechar())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{gerados ? "Links da contagem" : "Nova contagem de estoque"}</DialogTitle>
        </DialogHeader>

        {gerados ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Envie cada link para quem vai contar aquele setor, junto com a senha.
              A senha não pode ser recuperada depois · anote agora.
              O botão de baixo monta a mensagem inteira, com o link numa linha só.
            </p>
            {gerados.map((g) => {
              const senha = links.find((l) => l.label === g.label)?.password ?? "";
              return (
                <div key={g.token} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium">{g.label}</span>
                    <Badge variant="secondary">senha {senha}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Input readOnly value={urlDoLink(g.token)} className="font-mono text-xs" />
                    {/* Só o endereço. Copiar link e senha juntos fazia o texto
                        virar parte da URL quando colado, e o token deixava de
                        ser um uuid válido. */}
                    <Button
                      size="icon"
                      variant="outline"
                      title="Copiar só o link"
                      onClick={() => {
                        navigator.clipboard.writeText(urlDoLink(g.token));
                        toast.success("Link copiado");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => {
                      // Mensagem pronta para mandar: o link fica isolado numa
                      // linha, longe da senha.
                      navigator.clipboard.writeText(
                        `Contagem de estoque · ${g.label}\n\n${urlDoLink(g.token)}\n\nSenha: ${senha}`,
                      );
                      toast.success("Mensagem copiada, pronta para enviar");
                    }}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" /> Copiar mensagem com a senha
                  </Button>
                </div>
              );
            })}
            <Button className="w-full" onClick={fechar}>Concluir</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da contagem</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <Label className="cursor-pointer">Contagem cega</Label>
                  <p className="text-[11px] text-muted-foreground">
                    O operador não vê o saldo do sistema
                  </p>
                </div>
                <Switch checked={blind} onCheckedChange={setBlind} />
              </div>
              <div className="space-y-2">
                <Label>Link expira em (horas)</Label>
                <Input type="number" min="1" value={horas} onChange={(e) => setHoras(e.target.value)} />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Quem vai contar o quê</Label>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Por setor <span className="font-normal">· onde fica guardado</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {setores.map(([s, qtd]) => (
                    <Button key={s} type="button" size="sm" variant="outline" onClick={() => adicionarSetor(s)}>
                      <Plus className="mr-1 h-3 w-3" /> {s}
                      <span className="ml-1 text-xs text-muted-foreground">({qtd})</span>
                    </Button>
                  ))}
                  {setores.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum insumo com setor cadastrado.</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Por categoria <span className="font-normal">· o que a coisa é</span>
                </p>
                {/* Vinte chips na tela não é escolha, é caça. O seletor traz
                    busca, marcação múltipla e a decisão de virar um link ou
                    vários. */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between font-normal"
                  disabled={categoriasComItens.lista.length === 0}
                  onClick={() => setSeletorCategorias(true)}
                >
                  <span className="flex items-center gap-2">
                    <Tags className="h-4 w-4 text-muted-foreground" />
                    {categoriasComItens.lista.length === 0
                      ? "Nenhuma categoria com insumo"
                      : "Escolher categorias"}
                  </span>
                  {categoriasComItens.lista.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {categoriasComItens.lista.length} disponíveis
                    </span>
                  )}
                </Button>
                {categoriasComItens.semCategoria > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {categoriasComItens.semCategoria} insumo(s) sem categoria · só entram no link geral.
                  </p>
                )}
              </div>

              <Button type="button" size="sm" variant="secondary" onClick={adicionarGeral}>
                <Plus className="mr-1 h-3 w-3" /> Um link para tudo
              </Button>
            </div>

            {links.length > 0 && (
              <div className="space-y-2 rounded-md border p-3">
                {links.map((l, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {l.label}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {l.categories?.length ? "categoria" : l.sectors?.length ? "setor" : "tudo"}
                      </span>
                    </span>
                    <div className="w-28">
                      <Input
                        value={l.password}
                        onChange={(e) =>
                          setLinks((v) => v.map((x, i) => (i === idx ? { ...x, password: e.target.value } : x)))
                        }
                        placeholder="senha"
                        className="h-9 text-center"
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setLinks((v) => v.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">
                  A senha vai guardada em hash · nem eu consigo lê-la depois.
                </p>
              </div>
            )}

            <Button className="w-full" disabled={criar.isPending} onClick={confirmar}>
              {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Abrir contagem e gerar links
            </Button>
          </div>
        )}
      </DialogContent>

      <CategoryPickerDialog
        open={seletorCategorias}
        onOpenChange={setSeletorCategorias}
        categorias={categoriasComItens.lista}
        jaEscolhidas={links.flatMap((l) => l.categories ?? [])}
        onConfirm={adicionarCategorias}
      />
    </Dialog>
  );
}
