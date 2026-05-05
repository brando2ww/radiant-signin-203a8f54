import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, RefreshCcw } from "lucide-react";
import { fetchAllNeighborhoods } from "@/hooks/use-ibge-lookup";

interface NeighborhoodSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uf: string;
  city: string;
  existingNeighborhoods?: string[];
  onConfirm: (selected: string[]) => void;
}

export function NeighborhoodSelectorModal({
  open,
  onOpenChange,
  uf,
  city,
  existingNeighborhoods = [],
  onConfirm,
}: NeighborhoodSelectorModalProps) {
  const [allNeighborhoods, setAllNeighborhoods] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDeepRunning, setIsDeepRunning] = useState(false);
  const [hasDeepRun, setHasDeepRun] = useState(false);
  const runIdRef = useRef(0);

  useEffect(() => {
    if (!open || !uf || !city) return;

    const myRun = ++runIdRef.current;
    setIsLoading(true);
    setFilter("");
    setHasDeepRun(false);
    setAllNeighborhoods([]);
    setSelected(new Set(existingNeighborhoods));

    fetchAllNeighborhoods(uf, city, {
      onProgress: (list) => {
        if (runIdRef.current !== myRun) return;
        setAllNeighborhoods(list);
        // Mantém pré-seleção: bairros novos descobertos + existentes
        setSelected((prev) => {
          const next = new Set(prev);
          list.forEach((n) => next.add(n));
          existingNeighborhoods.forEach((n) => next.add(n));
          return next;
        });
      },
    }).then((list) => {
      if (runIdRef.current !== myRun) return;
      setAllNeighborhoods(list);
      setIsLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, uf, city]);

  const filtered = allNeighborhoods.filter((n) =>
    n.toLowerCase().includes(filter.toLowerCase()),
  );

  const toggleNeighborhood = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(allNeighborhoods));
  const deselectAll = () => setSelected(new Set());

  const runDeepSearch = async () => {
    if (isDeepRunning) return;
    const myRun = runIdRef.current;
    setIsDeepRunning(true);
    await fetchAllNeighborhoods(uf, city, {
      deep: true,
      seed: allNeighborhoods,
      onProgress: (list) => {
        if (runIdRef.current !== myRun) return;
        setAllNeighborhoods(list);
        setSelected((prev) => {
          const next = new Set(prev);
          list.forEach((n) => next.add(n));
          return next;
        });
      },
    });
    if (runIdRef.current === myRun) {
      setIsDeepRunning(false);
      setHasDeepRun(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Selecionar Bairros — {city}/{uf}</DialogTitle>
          <DialogDescription>
            Marque os bairros que você deseja atender
          </DialogDescription>
        </DialogHeader>

        {isLoading && allNeighborhoods.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Buscando bairros... 0 encontrados
            </p>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar bairros..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={selectAll}>
                Selecionar todos
              </Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>
                Desmarcar todos
              </Button>
              {!isLoading && !hasDeepRun && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runDeepSearch}
                  disabled={isDeepRunning}
                  className="ml-auto"
                >
                  {isDeepRunning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <RefreshCcw className="h-3.5 w-3.5 mr-1" />
                  )}
                  Buscar mais bairros
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto border rounded-md divide-y max-h-[40vh]">
              {filtered.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {isLoading ? "Buscando..." : "Nenhum bairro encontrado."}
                </div>
              ) : (
                filtered.map((name) => (
                  <label
                    key={name}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={selected.has(name)}
                      onCheckedChange={() => toggleNeighborhood(name)}
                    />
                    <span className="text-sm">{name}</span>
                  </label>
                ))
              )}
            </div>

            <p className="text-xs text-muted-foreground flex items-center gap-2">
              {(isLoading || isDeepRunning) && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              {isLoading
                ? `Buscando bairros... ${allNeighborhoods.length} encontrados`
                : isDeepRunning
                  ? `Varredura ampliada... ${allNeighborhoods.length} encontrados`
                  : hasDeepRun
                    ? `Varredura completa: ${allNeighborhoods.length} bairros`
                    : `${allNeighborhoods.length} bairros encontrados (IBGE + ViaCEP) · Selecionados: ${selected.size}`}
            </p>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onConfirm([...selected]);
              onOpenChange(false);
            }}
            disabled={isLoading && allNeighborhoods.length === 0}
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
