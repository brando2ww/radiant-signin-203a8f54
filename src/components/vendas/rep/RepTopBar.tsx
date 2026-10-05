import { Link } from "react-router-dom";
import { Eye } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRepContext } from "./RepContext";
import { RepBrandMark } from "./RepBrandMark";
import { firstName, initials } from "./rep-utils";

const ALL = "__todos__";

/** Barra do topo: marca da empresa à esquerda, representante à direita (abre o menu "Mais"). */
export function RepTopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { brand, rep, isPreview, previewReps, setPreviewRepId, repId } = useRepContext();
  const repName = rep?.name || (isPreview ? "Todos" : "");

  return (
    <header
      className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex h-14 items-center gap-3 px-4">
        <RepBrandMark brand={brand} className="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{brand.name || "Força de vendas"}</p>
          <p className="truncate text-xs text-muted-foreground">Força de vendas</p>
        </div>
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Abrir menu"
          className="flex h-11 min-w-11 max-w-[45%] items-center gap-2 rounded-full border bg-muted/40 pl-1 pr-3 transition-colors hover:bg-muted active:scale-[0.98]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials(repName)}
          </span>
          <span className="truncate text-sm font-medium">{firstName(repName)}</span>
        </button>
      </div>

      {isPreview && (
        <div className="flex items-center gap-2 border-t bg-amber-50 px-4 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <Eye className="h-3.5 w-3.5 shrink-0" />
          <span className="shrink-0 font-medium">Prévia como</span>
          <Select value={repId ?? ALL} onValueChange={(v) => setPreviewRepId(v === ALL ? null : v)}>
            <SelectTrigger className="h-8 min-w-0 flex-1 border-amber-200 bg-white/70 text-xs dark:border-amber-900 dark:bg-transparent">
              <SelectValue placeholder="Escolha o representante" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os representantes</SelectItem>
              {previewReps.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                  {!r.is_active ? " (inativo)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link to="/pdv/vendas" className="shrink-0 font-semibold underline underline-offset-2">
            Sair da prévia
          </Link>
        </div>
      )}
    </header>
  );
}
