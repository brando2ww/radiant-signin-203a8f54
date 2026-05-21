import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, LayoutGrid, List, Search } from "lucide-react";
import { format, startOfMonth, subDays } from "date-fns";
import { useEvidenceOperators, useEvidenceChecklists, type EvidenceFilters as Filters } from "@/hooks/use-checklist-evidence";

const SECTORS = ["cozinha", "salao", "caixa", "bar", "estoque", "gerencia"];
const ITEM_TYPES = [
  { value: "checkbox", label: "Checkbox" },
  { value: "photo", label: "Foto" },
  { value: "temperature", label: "Temperatura" },
  { value: "number", label: "Número" },
  { value: "text", label: "Texto" },
  { value: "stars", label: "Estrelas" },
  { value: "multiple_choice", label: "Múltipla escolha" },
];
const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "pendente", label: "Pendente" },
  { value: "aprovado", label: "Aprovada" },
  { value: "reprovado", label: "Reprovada" },
];

const PRESETS = [
  { value: "all", label: "Todo período" },
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "month", label: "Este mês" },
  { value: "custom", label: "Personalizado" },
];

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

function detectPreset(from?: string, to?: string): string {
  if (!from && !to) return "all";
  const today = ymd(new Date());
  const yest = ymd(subDays(new Date(), 1));
  if (from === today && to === today) return "today";
  if (from === yest && to === yest) return "yesterday";
  if (to === today) {
    if (from === ymd(subDays(new Date(), 6))) return "7";
    if (from === ymd(subDays(new Date(), 29))) return "30";
    if (from === ymd(startOfMonth(new Date()))) return "month";
  }
  return "custom";
}

interface Props {
  filters: Filters;
  onFiltersChange: (f: Partial<Filters>) => void;
  viewMode: "grid" | "list";
  onViewModeChange: (m: "grid" | "list") => void;
  onExportZip: () => void;
  onExportCsv: () => void;
  exporting: boolean;
  hasData: boolean;
}

export function EvidenceFiltersBar({ filters, onFiltersChange, viewMode, onViewModeChange, onExportZip, onExportCsv, exporting, hasData }: Props) {
  const { data: operators } = useEvidenceOperators();
  const { data: checklists } = useEvidenceChecklists();

  const [searchInput, setSearchInput] = useState(filters.search || "");
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.search || "") !== searchInput) {
        onFiltersChange({ search: searchInput || undefined });
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const preset = detectPreset(filters.dateFrom, filters.dateTo);

  const applyPreset = (value: string) => {
    const today = new Date();
    switch (value) {
      case "all":
        onFiltersChange({ dateFrom: undefined, dateTo: undefined, date: undefined });
        break;
      case "today":
        onFiltersChange({ dateFrom: ymd(today), dateTo: ymd(today), date: undefined });
        break;
      case "yesterday": {
        const y = ymd(subDays(today, 1));
        onFiltersChange({ dateFrom: y, dateTo: y, date: undefined });
        break;
      }
      case "7":
        onFiltersChange({ dateFrom: ymd(subDays(today, 6)), dateTo: ymd(today), date: undefined });
        break;
      case "30":
        onFiltersChange({ dateFrom: ymd(subDays(today, 29)), dateTo: ymd(today), date: undefined });
        break;
      case "month":
        onFiltersChange({ dateFrom: ymd(startOfMonth(today)), dateTo: ymd(today), date: undefined });
        break;
      case "custom":
        // mantém os valores atuais; usuário ajusta os inputs
        break;
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Buscar foto, item, colaborador..."
          className="pl-7 w-56 h-9"
        />
      </div>

      <Select value={preset} onValueChange={applyPreset}>
        <SelectTrigger className="w-40"><SelectValue placeholder="Período" /></SelectTrigger>
        <SelectContent>
          {PRESETS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">De</span>
        <Input
          type="date"
          value={filters.dateFrom || ""}
          onChange={e => onFiltersChange({ dateFrom: e.target.value || undefined, date: undefined })}
          className="w-36 h-9"
        />
        <span className="text-xs text-muted-foreground">até</span>
        <Input
          type="date"
          value={filters.dateTo || ""}
          onChange={e => onFiltersChange({ dateTo: e.target.value || undefined, date: undefined })}
          className="w-36 h-9"
        />
      </div>

      <Select value={filters.sector || "all"} onValueChange={v => onFiltersChange({ sector: v === "all" ? undefined : v })}>
        <SelectTrigger className="w-32"><SelectValue placeholder="Setor" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos setores</SelectItem>
          {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.operatorId || "all"} onValueChange={v => onFiltersChange({ operatorId: v === "all" ? undefined : v })}>
        <SelectTrigger className="w-36"><SelectValue placeholder="Colaborador" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {(operators || []).map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.checklistId || "all"} onValueChange={v => onFiltersChange({ checklistId: v === "all" ? undefined : v })}>
        <SelectTrigger className="w-36"><SelectValue placeholder="Checklist" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {(checklists || []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.status || "all"} onValueChange={v => onFiltersChange({ status: v as any })}>
        <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.itemType || "all"} onValueChange={v => onFiltersChange({ itemType: v as any })}>
        <SelectTrigger className="w-36"><SelectValue placeholder="Tipo item" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos tipos</SelectItem>
          {ITEM_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1 ml-auto">
        <Button variant={viewMode === "grid" ? "default" : "outline"} size="icon" className="h-9 w-9" onClick={() => onViewModeChange("grid")}>
          <LayoutGrid className="h-4 w-4" />
        </Button>
        <Button variant={viewMode === "list" ? "default" : "outline"} size="icon" className="h-9 w-9" onClick={() => onViewModeChange("list")}>
          <List className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={exporting || !hasData}>
              <Download className="h-4 w-4 mr-1" />{exporting ? "Exportando..." : "Exportar"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={onExportZip}>Exportar ZIP (fotos)</DropdownMenuItem>
            <DropdownMenuItem onClick={onExportCsv}>Exportar CSV (metadados)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
