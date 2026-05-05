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
import { Loader2, Search, Play, X, MapPin, Plus, AlertTriangle } from "lucide-react";
import { CEPInput } from "@/components/ui/cep-input";
import { useCEPLookup } from "@/hooks/use-cep-lookup";
import {
  detectCityCepPrefix,
  getCachedSweep,
  sweepCepRange,
  getManualNeighborhoods,
  setManualNeighborhoods,
} from "@/hooks/use-cep-range-sweep";
import { toast } from "sonner";

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

  // CEP individual
  const [singleCep, setSingleCep] = useState("");
  const { lookupCEP, isLoading: isLoadingSingle } = useCEPLookup();

  // Faixa de CEP
  const [prefixStart, setPrefixStart] = useState("");
  const [prefixEnd, setPrefixEnd] = useState("");
  const [detectingPrefix, setDetectingPrefix] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [sweptOnce, setSweptOnce] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Bairro manual
  const [manualName, setManualName] = useState("");

  // Inicialização ao abrir
  useEffect(() => {
    if (!open) return;
    setFilter("");
    setSingleCep("");
    setManualName("");
    setSweptOnce(false);

    const initial = new Set<string>(existingNeighborhoods);
    const manual = uf && city ? getManualNeighborhoods(uf, city) : [];
    manual.forEach((m) => initial.add(m));

    setSelected(new Set(existingNeighborhoods));
    setNeighborhoods(
      Array.from(initial).sort((a, b) => a.localeCompare(b, "pt-BR")),
    );
    setProgress({ done: 0, total: 0 });

    if (uf && city) {
      setDetectingPrefix(true);
      detectCityCepPrefix(uf, city)
        .then((res) => {
          if (res) {
            setPrefixStart(res.start);
            setPrefixEnd(res.end);
            const cached = getCachedSweep(res.start);
            if (cached && cached.neighborhoods.length > 0) {
              mergeNeighborhoods(cached.neighborhoods, false);
            }
          }
        })
        .finally(() => setDetectingPrefix(false));
    }

    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, uf, city]);

  function mergeNeighborhoods(incoming: string[], autoSelect = true) {
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

  const handleSingleCepLookup = async () => {
    const data = await lookupCEP(singleCep);
    if (data?.bairro) {
      mergeNeighborhoods([data.bairro.trim()]);
      toast.success(`Bairro adicionado: ${data.bairro}`);
      setSingleCep("");
    } else if (data) {
      toast.warning("CEP encontrado, mas sem bairro associado.");
    }
  };

  const handleAddManual = () => {
    const name = manualName.trim();
    if (!name) return;
    mergeNeighborhoods([name]);
    if (uf && city) {
      const current = getManualNeighborhoods(uf, city);
      setManualNeighborhoods(uf, city, [...current, name]);
    }
    toast.success(`Bairro adicionado: ${name}`);
    setManualName("");
  };

  const handleStartSweep = async () => {
    const cleanStart = prefixStart.replace(/\D/g, "").slice(0, 5);
    const cleanEnd = (prefixEnd || prefixStart).replace(/\D/g, "").slice(0, 5);
    if (cleanStart.length !== 5 || cleanEnd.length !== 5) {
      toast.error("Informe os 5 dígitos de início e fim.");
      return;
    }
    const startN = parseInt(cleanStart, 10);
    const endN = parseInt(cleanEnd, 10);
    if (endN < startN) {
      toast.error("Fim deve ser maior ou igual ao início.");
      return;
    }
    if (endN - startN > 9) {
      toast.error("Faixa muito larga (máx. 10 prefixos).");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setSweeping(true);
    setProgress({ done: 0, total: (endN - startN + 1) * 1000 });

    try {
      const result = await sweepCepRange(cleanStart, cleanEnd, {
        signal: controller.signal,
        onProgress: ({ done, total, neighborhoods: list }) => {
          setProgress({ done, total });
          mergeNeighborhoods(list, false);
        },
      });
      if (!result.cancelled) {
        toast.success(
          `Varredura concluída: ${result.neighborhoods.length} bairros encontrados.`,
        );
        setSweptOnce(true);
      }
    } finally {
      setSweeping(false);
      abortRef.current = null;
    }
  };

  const handleCancelSweep = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSweeping(false);
    toast.info("Varredura cancelada.");
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

  const formatPrefixDisplay = (p: string) => {
    const clean = p.replace(/\D/g, "").slice(0, 5);
    if (clean.length <= 2) return clean;
    return `${clean.slice(0, 2)}${clean.length > 2 ? "." + clean.slice(2) : ""}`;
  };

  const showGeneralCepWarning =
    sweptOnce && !sweeping && neighborhoods.length <= 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Selecionar Bairros — {city}/{uf}
          </DialogTitle>
          <DialogDescription>
            Adicione bairros buscando por CEP, varrendo a faixa ou inserindo manualmente.
          </DialogDescription>
        </DialogHeader>

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

        {/* Varredura por faixa */}
        <div className="space-y-2 border rounded-md p-3">
          <Label className="text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Varrer faixa de CEP da cidade
          </Label>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">De</Label>
              <Input
                value={formatPrefixDisplay(prefixStart)}
                onChange={(e) =>
                  setPrefixStart(e.target.value.replace(/\D/g, "").slice(0, 5))
                }
                placeholder={detectingPrefix ? "..." : "00.000"}
                disabled={sweeping || detectingPrefix}
                className="font-mono"
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Até</Label>
              <Input
                value={formatPrefixDisplay(prefixEnd)}
                onChange={(e) =>
                  setPrefixEnd(e.target.value.replace(/\D/g, "").slice(0, 5))
                }
                placeholder={detectingPrefix ? "..." : "00.000"}
                disabled={sweeping || detectingPrefix}
                className="font-mono"
              />
            </div>
            {sweeping ? (
              <Button onClick={handleCancelSweep} variant="destructive" size="sm">
                <X className="h-4 w-4 mr-1" /> Cancelar
              </Button>
            ) : (
              <Button
                onClick={handleStartSweep}
                disabled={
                  detectingPrefix || prefixStart.replace(/\D/g, "").length !== 5
                }
                size="sm"
              >
                <Play className="h-4 w-4 mr-1" /> Varrer
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Faixa: {prefixStart.padEnd(5, "_")}-000 até{" "}
            {(prefixEnd || prefixStart).padEnd(5, "_")}-999
          </p>
          {sweeping && (
            <div className="space-y-1">
              <div className="h-1.5 bg-muted rounded overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {progress.done}/{progress.total} CEPs · {neighborhoods.length} bairros
              </p>
            </div>
          )}
        </div>

        {showGeneralCepWarning && (
          <div className="border border-border rounded-md p-3 bg-muted/50 flex gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              Esta cidade usa CEP geral — o ViaCEP não devolve a lista oficial de
              bairros. Adicione-os manualmente abaixo.
            </div>
          </div>
        )}

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

        {/* Lista de bairros */}
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
                  ? "Nenhum bairro ainda. Use a busca por CEP acima."
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
