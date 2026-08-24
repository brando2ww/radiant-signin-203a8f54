import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export type ExportKind = "pdf" | "xlsx";

interface ReportPageHeaderProps {
  title: string;
  description?: string;
  /** Recebe o formato escolhido. Pode ser assíncrono — o botão espera. */
  onExport?: (kind: ExportKind) => void | Promise<void>;
  exportDisabled?: boolean;
  /** Volta para o catálogo. Ligado por padrão nos relatórios do hub. */
  backTo?: string;
}

/**
 * Cabeçalho comum dos relatórios.
 *
 * O botão de exportar era fixo em Excel. Agora oferece os dois formatos porque
 * quem manda para o contador quer planilha e quem leva para a reunião quer
 * papel — e antes só o segundo caso ficava sem resposta.
 */
export function ReportPageHeader({
  title, description, onExport, exportDisabled, backTo,
}: ReportPageHeaderProps) {
  const [exporting, setExporting] = useState<ExportKind | null>(null);

  const run = async (kind: ExportKind) => {
    if (!onExport) return;
    setExporting(kind);
    try {
      await onExport(kind);
    } catch (e) {
      console.error("[relatório] falha ao exportar", e);
      toast.error("Não foi possível gerar o arquivo.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {backTo && (
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 h-7 px-2 text-muted-foreground">
            <Link to={backTo}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Relatórios
            </Link>
          </Button>
        )}
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>

      {onExport ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={exportDisabled || exporting !== null}>
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Exportar
              <ChevronDown className="ml-2 h-4 w-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => run("pdf")}>
              <FileText className="mr-2 h-4 w-4" /> PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => run("xlsx")}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
