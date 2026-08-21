import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePDVIngredients } from "@/hooks/use-pdv-ingredients";
import { useCreateStockCount, type NewCountLink } from "@/hooks/use-stock-count";

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
  const criar = useCreateStockCount();

  const [nome, setNome] = useState(() => `Contagem de ${new Date().toLocaleDateString("pt-BR")}`);
  const [blind, setBlind] = useState(true);
  const [horas, setHoras] = useState("24");
  const [links, setLinks] = useState<NewCountLink[]>([]);
  const [gerados, setGerados] = useState<Array<{ label: string; token: string }> | null>(null);

  // Setores existentes no cadastro de insumos, com quantos itens cada um tem —
  // o gestor precisa saber o tamanho da lista antes de entregar a alguém.
  const setores = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of ingredients ?? []) {
      const s = (i as any).sector || "Sem setor";
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [ingredients]);

  const adicionarSetor = (setor: string) => {
    if (links.some((l) => l.label === setor)) return;
    setLinks((v) => [
      ...v,
      { label: setor, password: senhaSugerida(), sectors: setor === "Sem setor" ? null : [setor] },
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
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${urlDoLink(g.token)}\nSenha: ${senha}`,
                        );
                        toast.success("Link e senha copiados");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
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

            <div className="space-y-2">
              <Label>Quem vai contar o quê</Label>
              <div className="flex flex-wrap gap-2">
                {setores.map(([s, qtd]) => (
                  <Button key={s} type="button" size="sm" variant="outline" onClick={() => adicionarSetor(s)}>
                    <Plus className="mr-1 h-3 w-3" /> {s}
                    <span className="ml-1 text-xs text-muted-foreground">({qtd})</span>
                  </Button>
                ))}
                <Button type="button" size="sm" variant="secondary" onClick={adicionarGeral}>
                  <Plus className="mr-1 h-3 w-3" /> Um link para tudo
                </Button>
              </div>
              {setores.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum insumo com setor cadastrado. Use "Um link para tudo".
                </p>
              )}
            </div>

            {links.length > 0 && (
              <div className="space-y-2 rounded-md border p-3">
                {links.map((l, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.label}</span>
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
    </Dialog>
  );
}
