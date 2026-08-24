import { type ReactNode } from "react";
import { ReportDateFilter } from "./ReportDateFilter";
import { ReportPageHeader, type ExportKind } from "./ReportPageHeader";

interface Props {
  title: string;
  description?: string;
  onExport?: (kind: ExportKind) => void | Promise<void>;
  exportDisabled?: boolean;
  /** Período padrão. Omitir quando o relatório traz o próprio filtro em `filters`. */
  period?: {
    startDate: Date;
    endDate: Date;
    onChange: (start: Date, end: Date) => void;
    /** Controles extras dentro da barra de período (fornecedor, categoria...). */
    extra?: ReactNode;
  };
  /** Barra de filtros própria, no lugar da padrão. */
  filters?: ReactNode;
  children: ReactNode;
}

/**
 * Moldura de todo relatório dentro do catálogo.
 *
 * Existe para que os trinta e poucos relatórios do sistema tenham o mesmo topo,
 * o mesmo caminho de volta e o mesmo botão de exportar. Antes cada família
 * tinha o seu, e o gestor reaprendia a tela a cada módulo.
 */
export function ReportShell({
  title, description, onExport, exportDisabled, period, filters, children,
}: Props) {
  return (
    <div className="space-y-4">
      <ReportPageHeader
        title={title}
        description={description}
        onExport={onExport}
        exportDisabled={exportDisabled}
        backTo="/pdv/relatorios"
      />
      {filters}
      {period && (
        <ReportDateFilter
          startDate={period.startDate}
          endDate={period.endDate}
          onChange={period.onChange}
          extra={period.extra}
        />
      )}
      {children}
    </div>
  );
}

/** Rótulo de período no formato que vai para o cabeçalho do PDF. */
export function periodLabel(start: Date, end: Date): string {
  const f = (d: Date) => d.toLocaleDateString("pt-BR");
  return `${f(start)} a ${f(end)}`;
}
