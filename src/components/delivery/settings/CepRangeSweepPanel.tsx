import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Play, X, MapPin, Search } from "lucide-react";
import {
  detectCityCepPrefix,
  getCachedSweep,
  sweepCepRange,
  type SweepEntry,
} from "@/hooks/use-cep-range-sweep";
import { toast } from "sonner";

interface CepRangeSweepPanelProps {
  uf: string;
  city: string;
  /** CEPs já bloqueados, para marcar como duplicado */
  blockedCeps: Set<string>;
  /** Callback ao adicionar entries (já filtra duplicatas internamente) */
  onAddEntries: (entries: SweepEntry[]) => void;
}

export function CepRangeSweepPanel({
  uf,
  city,
  blockedCeps,
  onAddEntries,
}: CepRangeSweepPanelProps) {
  const [prefix, setPrefix] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [entries, setEntries] = useState<SweepEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!uf || !city) return;
    setDetecting(true);
    setEntries([]);
    setSelected(new Set());
    setFilter("");
    detectCityCepPrefix(uf, city)
      .then((res) => {
        if (res) {
          setPrefix(res.start);
          const cached = getCachedSweep(res.start);
          if (cached && cached.entries.length > 0) {
            setEntries(cached.entries);
          }
        }
      })
      .finally(() => setDetecting(false));

    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [uf, city]);

  const handleStart = async () => {
    const clean = prefix.replace(/\D/g, "").slice(0, 5);
    if (clean.length !== 5) {
      toast.error("Informe os 5 primeiros dígitos do CEP.");
      return;
    }

    const cached = getCachedSweep(clean);
    if (cached && cached.entries.length > 0) {
      setEntries(cached.entries);
      toast.success(`${cached.entries.length} CEPs carregados do cache.`);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setSweeping(true);
    setProgress({ done: 0, total: 1000 });
    setEntries([]);

    try {
      const result = await sweepCepRange(clean, {
        signal: controller.signal,
        onProgress: ({ done, total, entries: list }) => {
          setProgress({ done, total });
          setEntries(list);
        },
      });
      if (!result.cancelled) {
        toast.success(
          `Varredura concluída: ${result.entries.length} CEPs encontrados.`,
        );
      }
    } finally {
      setSweeping(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSweeping(false);
    toast.info("Varredura cancelada.");
  };

  const toggle = (cep: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cep)) next.delete(cep);
      else next.add(cep);
      return next;
    });
  };

  const filtered = entries.filter((e) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      e.cep.toLowerCase().includes(f) ||
      e.street.toLowerCase().includes(f) ||
      e.neighborhood.toLowerCase().includes(f)
    );
  });

  const selectableFiltered = filtered.filter((e) => !blockedCeps.has(e.cep));

  const selectAllFiltered = () =>
    setSelected(new Set(selectableFiltered.map((e) => e.cep)));
  const deselectAll = () => setSelected(new Set());

  const handleBlockSelected = () => {
    const toAdd = entries.filter(
      (e) => selected.has(e.cep) && !blockedCeps.has(e.cep),
    );
    if (toAdd.length === 0) {
      toast.info("Nenhum CEP novo para bloquear.");
      return;
    }
    onAddEntries(toAdd);
    toast.success(`${toAdd.length} CEPs bloqueados.`);
    setSelected(new Set());
  };

  const formatPrefixDisplay = (p: string) => {
    const clean = p.replace(/\D/g, "").slice(0, 5);
    if (clean.length <= 2) return clean;
    return `${clean.slice(0, 2)}${clean.length > 2 ? "." + clean.slice(2) : ""}`;
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2 border rounded-md p-3">
        <Label className="text-sm flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Faixa de CEP da cidade
        </Label>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              value={formatPrefixDisplay(prefix)}
              onChange={(e) =>
                setPrefix(e.target.value.replace(/\D/g, "").slice(0, 5))
              }
              placeholder={detecting ? "Detectando..." : "00.000"}
              disabled={sweeping || detecting}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Faixa: {prefix.padEnd(5, "_")}-000 até {prefix.padEnd(5, "_")}-999
            </p>
          </div>
          {sweeping ? (
            <Button onClick={handleCancel} variant="destructive" size="sm">
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
          ) : (
            <Button
              onClick={handleStart}
              disabled={detecting || prefix.replace(/\D/g, "").length !== 5}
              size="sm"
            >
              <Play className="h-4 w-4 mr-1" /> Varrer
            </Button>
          )}
        </div>
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
              {progress.done}/{progress.total} CEPs · {entries.length} encontrados
            </p>
          </div>
        )}
      </div>

      {entries.length > 0 && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filtrar por CEP, rua ou bairro..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={selectAllFiltered}>
              Selecionar visíveis
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={deselectAll}
              disabled={!selected.size}
            >
              Desmarcar
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              {selected.size} selecionados · {entries.length} no total
            </span>
          </div>

          <div className="border rounded-md divide-y max-h-[280px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Nenhum resultado para o filtro.
              </div>
            ) : (
              filtered.map((e) => {
                const blocked = blockedCeps.has(e.cep);
                return (
                  <label
                    key={e.cep}
                    className={`flex items-start gap-3 px-3 py-2 hover:bg-accent/50 cursor-pointer transition-colors ${
                      blocked ? "opacity-50" : ""
                    }`}
                  >
                    <Checkbox
                      checked={blocked || selected.has(e.cep)}
                      disabled={blocked}
                      onCheckedChange={() => toggle(e.cep)}
                      className="mt-0.5"
                    />
                    <div className="text-sm flex-1 min-w-0">
                      <div className="font-mono text-xs">{e.cep}</div>
                      <div className="truncate">
                        {e.street || <em className="text-muted-foreground">sem rua</em>}
                      </div>
                      {e.neighborhood && (
                        <div className="text-xs text-muted-foreground">
                          {e.neighborhood}
                        </div>
                      )}
                    </div>
                    {blocked && (
                      <span className="text-xs text-muted-foreground">bloqueado</span>
                    )}
                  </label>
                );
              })
            )}
          </div>

          <Button
            onClick={handleBlockSelected}
            disabled={selected.size === 0}
            className="w-full"
            size="sm"
          >
            Bloquear {selected.size > 0 ? `${selected.size} ` : ""}selecionados
          </Button>
        </>
      )}
    </div>
  );
}
