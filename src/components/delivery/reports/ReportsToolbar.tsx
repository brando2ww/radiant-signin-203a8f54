import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { exportReportCSV, exportReportPDF, type ReportPayload } from "@/lib/reports-export";

interface Props {
  payload: ReportPayload;
  disabled?: boolean;
}

export const ReportsToolbar = ({ payload, disabled }: Props) => {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          {format(payload.startDate, "dd 'de' MMMM", { locale: ptBR })} —{" "}
          {format(payload.endDate, "dd 'de' MMMM, yyyy", { locale: ptBR })}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={disabled}>
            <Download className="h-4 w-4 mr-2" />
            Exportar relatório
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => exportReportPDF(payload)}>
            <FileText className="h-4 w-4 mr-2" />
            Exportar PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportReportCSV(payload)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Exportar CSV
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
