import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface ReportPageHeaderProps {
  title: string;
  description?: string;
  onExport?: () => void;
  exportDisabled?: boolean;
}

export function ReportPageHeader({ title, description, onExport, exportDisabled }: ReportPageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {onExport ? (
        <Button variant="outline" onClick={onExport} disabled={exportDisabled}>
          <Download className="h-4 w-4 mr-2" />
          Exportar Excel
        </Button>
      ) : null}
    </div>
  );
}
