import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ResponsivePageHeader } from "@/components/ui/responsive-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Search, FileBarChart } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";
import {
  REPORTS, groupsOf, matchesQuery, reportHref,
  type ReportDef, type ReportGroup,
} from "@/lib/reports/registry";
import { cn } from "@/lib/utils";

/** Cor do selo por grupo — o gestor reconhece o módulo antes de ler o nome. */
const GROUP_COLOR: Record<ReportGroup, string> = {
  Vendas: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Financeiro: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  Compras: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Estoque: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  Delivery: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  Clientes: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  Fiscal: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Avaliações: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  Operacional: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
};

function ReportCard({ report }: { report: ReportDef }) {
  const Icon = report.icon;
  return (
    <Link
      to={reportHref(report)}
      className="group relative flex flex-col rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Badge
        variant="secondary"
        className={cn("absolute right-4 top-4 border-0 text-[10px] font-medium", GROUP_COLOR[report.group])}
      >
        {report.group}
      </Badge>

      <div className="mb-3 flex items-center gap-3 pr-24">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
          <Icon className="h-5 w-5 text-foreground/70" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium leading-tight">{report.title}</p>
          {report.badge === "novo" && (
            <span className="text-[10px] font-medium uppercase tracking-wide text-primary">novo</span>
          )}
        </div>
      </div>

      <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{report.description}</p>

      <span className="mt-4 inline-flex items-center text-sm font-medium text-foreground/80 transition-colors group-hover:text-foreground">
        Abrir relatório
        <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

/**
 * Central de Relatórios.
 *
 * Uma porta só para tudo o que o sistema sabe responder. Cada card leva para a
 * tela onde o relatório já vive — nada foi movido de lugar, porque quem já usa
 * o sistema não deveria ter que reaprender onde as coisas estão.
 *
 * A lista é filtrada por `canAccess(gatePath)`, que cruza o papel do usuário
 * com os módulos que o cliente contratou. Um card que a pessoa não pode abrir
 * nunca aparece.
 */
export default function ReportsHub() {
  const { canAccess } = useUserRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const [busca, setBusca] = useState("");

  const grupoAtivo = (searchParams.get("grupo") as ReportGroup) || null;

  const disponiveis = useMemo(
    () => REPORTS.filter((r) => canAccess(r.gatePath)),
    [canAccess],
  );

  const filtrados = useMemo(
    () =>
      disponiveis
        .filter((r) => !grupoAtivo || r.group === grupoAtivo)
        .filter((r) => matchesQuery(r, busca)),
    [disponiveis, grupoAtivo, busca],
  );

  const gruposDisponiveis = groupsOf(disponiveis);
  const gruposVisiveis = groupsOf(filtrados);

  const selecionarGrupo = (g: ReportGroup | null) => {
    setSearchParams(g ? { grupo: g } : {}, { replace: true });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <ResponsivePageHeader
        title="Central de Relatórios"
        description="Tudo o que o sistema sabe responder sobre a sua operação, num lugar só"
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou pelo que você quer descobrir..."
            className="h-11 pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={grupoAtivo ? "ghost" : "secondary"}
            size="sm"
            onClick={() => selecionarGrupo(null)}
          >
            Todos
            <span className="ml-1.5 text-xs text-muted-foreground">{disponiveis.length}</span>
          </Button>
          {gruposDisponiveis.map((g) => (
            <Button
              key={g}
              variant={grupoAtivo === g ? "secondary" : "ghost"}
              size="sm"
              onClick={() => selecionarGrupo(grupoAtivo === g ? null : g)}
            >
              {g}
              <span className="ml-1.5 text-xs text-muted-foreground">
                {disponiveis.filter((r) => r.group === g).length}
              </span>
            </Button>
          ))}
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <FileBarChart className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium">Nenhum relatório com esse termo.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tente pela pergunta que você quer responder · "margem", "quem comprou", "fechamento".
          </p>
        </div>
      ) : (
        gruposVisiveis.map((g) => (
          <section key={g} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {g}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtrados
                .filter((r) => r.group === g)
                .map((r) => (
                  <ReportCard key={r.slug} report={r} />
                ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
