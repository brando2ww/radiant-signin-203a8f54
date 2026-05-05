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
import { Label } from "@/components/ui/label";
import { Loader2, Search, Plus, RefreshCw, X } from "lucide-react";
import { CEPInput } from "@/components/ui/cep-input";
import { useCEPLookup } from "@/hooks/use-cep-lookup";
import {
  fetchAllNeighborhoods,
  readNeighborhoodsCache,
  clearNeighborhoodsCache,
} from "@/hooks/use-ibge-lookup";
import {
  getManualNeighborhoods,
  setManualNeighborhoods,
} from "@/hooks/use-cep-range-sweep";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const [singleCep, setSingleCep] = useState("");
  const { lookupCEP, isLoading: isLoadingSingle } = useCEPLookup();

  const [searching, setSearching] = useState(false);
  const [cacheTs, setCacheTs] = useState<number | null>(null);
  const [showStop, setShowStop] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const [manualName, setManualName] = useState("");

  function mergeNeighborhoods(incoming: string[], autoSelect = false) {
    setNeighborhoods((prev) => {
      const set = new Set(prev);
      incoming.forEach((n) => set.add(n));
      return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
    });
    if (autoSelect) {
      setSelected((prev) => {
        const next = new Set(prev);
        incoming.forEach((n) => next.add(n));
        return next;
      });
    }
  }

  const startSearch = async (force = false) => {
    if (!uf || !city) return;
    if (force) clearNeighborhoodsCache(uf, city);

    const cached = !force ? readNeighborhoodsCache(uf, city) : null;
    if (cached) {
      mergeNeighborhoods(cached.list);
      setCacheTs(cached.ts);
      return;
    }

    setCacheTs(null);
    setSearching(true);
    setShowStop(false);
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = window.setTimeout(() => setShowStop(true), 15000);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await fetchAllNeighborhoods(uf, city, {
        signal: controller.signal,
        onProgress: (list) => mergeNeighborhoods(list),
      });
      mergeNeighborhoods(result);
      if (!controller.signal.aborted) {
        setCacheTs(Date.now());
      }
    } finally {
      setSearching(false);
      setShowStop(false);
      if (stopTimerRef.current) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  // Inicialização
  useEffect(() => {
    if (!open) return;
    setFilter("");
    setSingleCep("");
    setManualName("");

    const initial = new Set<string>(existingNeighborhoods);
    const manual = uf && city ? getManualNeighborhoods(uf, city) : [];
    manual.forEach((m) => initial.add(m));

    setSelected(new Set(existingNeighborhoods));
    setNeighborhoods(
      Array.from(initial).sort((a, b) => a.localeCompare(b, "pt-BR")),
    );

    startSearch(false);

    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      if (stopTimerRef.current) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, uf, city]);

  const handleSingleCepLookup = async () => {
    const data = await lookupCEP(singleCep);
    if (data?.bairro) {
      mergeNeighborhoods([data.bairro.trim()], true);
      toast.success(`Bairro adicionado: ${data.bairro}`);
      setSingleCep("");
    } else if (data) {
      toast.warning("CEP encontrado, mas sem bairro associado.");
    }
  };

  const handleAddManual = () => {
    const name = manualName.trim();
    if (!name) return;
    mergeNeighborhoods([name], true);
    if (uf && city) {
      const current = getManualNeighborhoods(uf, city);
      setManualNeighborhoods(uf, city, [...current, name]);
    }
    toast.success(`Bairro adicionado: ${name}`);
    setManualName("");
  };

  const filtered = neighborhoods.filter((n) =>
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

  const selectAll = () => setSelected(new Set(neighborhoods));
  const deselectAll = () => setSelected(new Set());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Selecionar Bairros — {city}/{uf}
          </DialogTitle>
          <DialogDescription>
            Buscamos automaticamente todos os bairros da cidade. Você também pode
            adicionar manualmente ou por CEP.
          </DialogDescription>
        </DialogHeader>

        {/* Status da busca */}
        <div className="rounded-md border p-3 flex items-center gap-2 text-sm">
          {searching ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span className="flex-1">
                Buscando bairros... {neighborhoods.length} encontrados
              </span>
              {showStop && (
                <Button size="sm" variant="outline" onClick={handleStop}>
                  <X className="h-3 w-3 mr-1" /> Parar
                </Button>
              )}
            </>
          ) : (
            <>
              <span className="flex-1 text-muted-foreground">
                {cacheTs ? (
                  <>
                    Cache · atualizado há{" "}
                    {formatDistanceToNow(cacheTs, { locale: ptBR })} ·{" "}
                    {neighborhoods.length} bairros
                  </>
                ) : (
                  <>{neighborhoods.length} bairros disponíveis</>
                )}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => startSearch(true)}
                disabled={!uf || !city}
              >
                <RefreshCw className="h-3 w-3 mr-1" /> Atualizar
              </Button>
            </>
          )}
        </div>

        {/* Busca por CEP individual */}
        <div className="space-y-2 border rounded-md p-3">
          <Label className="text-sm flex items-center gap-2">
            <Search className="h-4 w-4" /> Buscar bairro por CEP
          </Label>
          <div className="flex gap-2">
            <CEPInput
              value={singleCep}
              onChange={setSingleCep}
              className="flex-1"
            />
            <Button
              onClick={handleSingleCepLookup}
              disabled={isLoadingSingle || singleCep.replace(/\D/g, "").length !== 8}
              size="sm"
            >
              {isLoadingSingle ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Buscar"
              )}
            </Button>
          </div>
        </div>

        {/* Bairro manual */}
        <div className="space-y-2 border rounded-md p-3">
          <Label className="text-sm flex items-center gap-2">
            <Plus className="h-4 w-4" /> Adicionar bairro manualmente
          </Label>
          <div className="flex gap-2">
            <Input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Nome do bairro"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddManual();
                }
              }}
              className="flex-1"
            />
            <Button onClick={handleAddManual} disabled={!manualName.trim()} size="sm">
              Adicionar
            </Button>
          </div>
        </div>

        {/* Lista */}
        <div className="space-y-2 flex flex-col min-h-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filtrar bairros..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={selectAll} disabled={!neighborhoods.length}>
              Selecionar todos
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAll} disabled={!selected.size}>
              Desmarcar todos
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              {selected.size}/{neighborhoods.length} selecionados
            </span>
          </div>

          <div className="overflow-y-auto border rounded-md divide-y max-h-[35vh] min-h-[120px]">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {neighborhoods.length === 0
                  ? "Nenhum bairro ainda."
                  : "Nenhum bairro corresponde ao filtro."}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onConfirm([...selected]);
              onOpenChange(false);
            }}
          >
            Confirmar ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
