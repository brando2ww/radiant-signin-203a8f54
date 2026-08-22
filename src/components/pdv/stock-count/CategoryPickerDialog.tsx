import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CategoriaOpcao {
  nome: string;
  qtd: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categorias: CategoriaOpcao[];
  /** Categorias que já viraram link — aparecem marcadas e desabilitadas. */
  jaEscolhidas: string[];
  /** Um link por categoria, ou um link só cobrindo todas as marcadas. */
  onConfirm: (nomes: string[], modo: "separados" | "juntos") => void;
}

/**
 * Escolha de categorias para a contagem.
 *
 * Uma parede de vinte chips não é escolha, é caça. Aqui a pessoa busca, marca o
 * que quer e decide de uma vez se aquilo vira vários links ou um só — que é a
 * pergunta real: "cada um conta a sua categoria" ou "essa pessoa conta essas
 * três".
 */
export function CategoryPickerDialog({
  open, onOpenChange, categorias, jaEscolhidas, onConfirm,
}: Props) {
  const [busca, setBusca] = useState("");
  const [marcadas, setMarcadas] = useState<string[]>([]);

  useEffect(() => {
    if (open) { setBusca(""); setMarcadas([]); }
  }, [open]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return categorias;
    // Sem acento, porque ninguém digita "Latícinios" com o acento certo às
    // pressas.
    const semAcento = (t: string) =>
      t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    return categorias.filter((c) => semAcento(c.nome).includes(semAcento(q)));
  }, [categorias, busca]);

  const alternar = (nome: string) =>
    setMarcadas((v) => (v.includes(nome) ? v.filter((x) => x !== nome) : [...v, nome]));

  const totalItens = marcadas.reduce(
    (s, n) => s + (categorias.find((c) => c.nome === n)?.qtd ?? 0),
    0,
  );

  const disponiveis = filtradas.filter((c) => !jaEscolhidas.includes(c.nome));
  const todasMarcadas = disponiveis.length > 0 && disponiveis.every((c) => marcadas.includes(c.nome));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Escolher categorias</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar categoria..."
            className="h-11 pl-9"
          />
        </div>

        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span>{filtradas.length} categoria(s)</span>
          <button
            type="button"
            className="font-medium text-foreground hover:underline disabled:opacity-40"
            disabled={disponiveis.length === 0}
            onClick={() =>
              setMarcadas(todasMarcadas ? [] : disponiveis.map((c) => c.nome))
            }
          >
            {todasMarcadas ? "Desmarcar todas" : "Marcar todas"}
          </button>
        </div>

        <div className="max-h-[45vh] space-y-1 overflow-y-auto overscroll-contain py-1 pr-1">
            {filtradas.map((c) => {
              const usada = jaEscolhidas.includes(c.nome);
              const marcada = marcadas.includes(c.nome);
              return (
                <button
                  key={c.nome}
                  type="button"
                  disabled={usada}
                  onClick={() => alternar(c.nome)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                    usada && "opacity-50",
                    marcada ? "border-primary bg-primary/5" : "hover:bg-muted/60",
                  )}
                >
                  <Checkbox checked={marcada || usada} disabled={usada} className="pointer-events-none" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.nome}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {usada ? "já adicionada" : `${c.qtd} ${c.qtd === 1 ? "insumo" : "insumos"}`}
                  </span>
                </button>
              );
            })}
            {filtradas.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma categoria com esse nome.
              </p>
            )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {marcadas.length > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              {marcadas.length} marcada(s) · {totalItens} insumos no total
            </p>
          )}
          <div className="grid w-full gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              disabled={marcadas.length === 0}
              onClick={() => { onConfirm(marcadas, "juntos"); onOpenChange(false); }}
            >
              Um link com todas
            </Button>
            <Button
              disabled={marcadas.length === 0}
              onClick={() => { onConfirm(marcadas, "separados"); onOpenChange(false); }}
            >
              Um link por categoria
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
