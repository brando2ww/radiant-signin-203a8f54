import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ClipboardX } from "lucide-react";
import { DateRangeFilter, defaultRange, type RangeValue } from "./report/DateRangeFilter";
import { MetricsCards } from "./report/MetricsCards";
import { EvolutionChart } from "./report/EvolutionChart";
import { SectorBreakdown } from "./report/SectorBreakdown";
import { TeamRanking } from "./report/TeamRanking";
import { TopFailingChecklists } from "./report/TopFailingChecklists";
import { AlertsPanel } from "./report/AlertsPanel";
import {
  SECTOR_LABEL,
  SHIFT_LABEL,
  useOperationalReport,
  type Sector,
  type Shift,
} from "@/hooks/use-operational-report";

interface Props {
  onNavigate?: (section: string) => void;
}

const ALL_SECTORS: Sector[] = ["cozinha", "salao", "caixa", "bar", "estoque", "gerencia"];
const ALL_SHIFTS: Shift[] = ["manha", "tarde", "noite"];
const TARGET = 85;

export function OperationalReport({ onNavigate }: Props) {
  const [range, setRange] = useState<RangeValue>(defaultRange());
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  const filters = useMemo(
    () => ({
      from: range.from,
      to: range.to,
      compareFrom: range.comparison?.from || null,
      compareTo: range.comparison?.to || null,
      sectors,
      shifts,
    }),
    [range, sectors, shifts]
  );

  const { data, isLoading } = useOperationalReport(filters);

  const clearAll = () => {
    setRange(defaultRange());
    setSectors([]);
    setShifts([]);
  };

  const sectorsLabel = sectors.length === 0
    ? "Todos os setores"
    : sectors.length === 1
    ? SECTOR_LABEL[sectors[0]]
    : `${sectors.length} setores`;

  const shiftsLabel = shifts.length === 0
    ? "Todos os turnos"
    : shifts.length === 1
    ? SHIFT_LABEL[shifts[0]]
    : `${shifts.length} turnos`;

  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <div className="sticky top-0 z-10 -mx-4 md:-mx-6 px-4 md:px-6 py-2 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter value={range} onChange={setRange} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 font-normal">
                {sectorsLabel}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {ALL_SECTORS.map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={sectors.includes(s)}
                  onCheckedChange={(c) =>
                    setSectors((prev) => (c ? [...prev, s] : prev.filter((x) => x !== s)))
                  }
                >
                  {SECTOR_LABEL[s]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 font-normal">
                {shiftsLabel}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {ALL_SHIFTS.map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={shifts.includes(s)}
                  onCheckedChange={(c) =>
                    setShifts((prev) => (c ? [...prev, s] : prev.filter((x) => x !== s)))
                  }
                >
                  {SHIFT_LABEL[s]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {(sectors.length > 0 || shifts.length > 0) && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-72" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      ) : data.isEmpty ? (
        <div className="border border-dashed border-border rounded-lg py-16 flex flex-col items-center justify-center text-center">
          <ClipboardX className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-base font-semibold">Sem dados no período selecionado</h3>
          <p className="text-sm text-muted-foreground mt-1">Ajuste os filtros ou aguarde execuções.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={clearAll}>
            Limpar filtros
          </Button>
        </div>
      ) : (
        <>
          <MetricsCards metrics={data.metrics} />
          <EvolutionChart data={data.evolution} target={TARGET} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <SectorBreakdown
              rows={data.bySector}
              selected={sectors.length === 1 ? sectors[0] : null}
              onPick={(s) =>
                setSectors((prev) =>
                  prev.length === 1 && prev[0] === s ? [] : [s]
                )
              }
            />
            <TeamRanking
              rows={data.teamRanking}
              onPick={() => onNavigate?.("equipe")}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <TopFailingChecklists rows={data.topFailing} />
            <AlertsPanel byType={data.alerts.byType} recent={data.alerts.recent} />
          </div>
        </>
      )}
    </div>
  );
}
