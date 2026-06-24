import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, FileText, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNfeMde, useMdeLastQuery } from "@/hooks/use-nfe-mde";
import { useNfeMdeConsultar } from "@/hooks/use-nfe-mde-consultar";

const MDE_STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "secondary" },
  ciencia: { label: "Ciência emitida", variant: "outline" },
  confirmado: { label: "Confirmado", variant: "default" },
  desconhecido: { label: "Desconhecido", variant: "destructive" },
  nao_realizado: { label: "Não realizado", variant: "destructive" },
};

function MdeStatusBadge({ status }: { status?: string | null }) {
  const cfg = status ? MDE_STATUS_LABELS[status] ?? { label: status, variant: "secondary" as const } : { label: "–", variant: "secondary" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function formatDate(iso?: string | null) {
  if (!iso) return "–";
  try {
    return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return iso;
  }
}

function formatMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCnpj(cnpj: string) {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export default function NfeImport() {
  const { invoices, isLoading } = useNfeMde();
  const { config } = useMdeLastQuery();
  const consultar = useNfeMdeConsultar();
  const [filterStatus, setFilterStatus] = useState<string>("todos");

  const filtered =
    filterStatus === "todos"
      ? invoices
      : invoices.filter((n) => n.mde_status === filterStatus);

  const hasConfig = !!config?.cnpj;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Importação de NF-e</h1>
          <p className="text-sm text-muted-foreground mt-1">
            NF-es emitidas contra o CNPJ do estabelecimento via Focus NFe MDe
          </p>
        </div>
        <Button
          onClick={() => consultar.mutate()}
          disabled={consultar.isPending || !hasConfig}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${consultar.isPending ? "animate-spin" : ""}`} />
          {consultar.isPending ? "Consultando..." : "Consultar agora"}
        </Button>
      </div>

      {/* Status da integração */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              CNPJ monitorado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasConfig ? (
              <span className="font-mono text-sm">{formatCnpj(config.cnpj!)}</span>
            ) : (
              <span className="text-muted-foreground text-sm">Não configurado</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Última consulta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-sm">
              {config?.last_mde_query_at
                ? format(parseISO(config.last_mde_query_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                : "Nunca"}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              NF-es encontradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">{invoices.length}</span>
          </CardContent>
        </Card>
      </div>

      {!hasConfig && (
        <div className="flex items-start gap-3 rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Configure o CNPJ e o token da Focus NFe em <strong>Configurações → Fiscal</strong> para habilitar a consulta automática de NF-es recebidas.
          </span>
        </div>
      )}

      {/* Filtros rápidos */}
      <div className="flex gap-2 flex-wrap">
        {["todos", "pendente", "ciencia", "confirmado", "desconhecido"].map((s) => (
          <Button
            key={s}
            variant={filterStatus === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus(s)}
          >
            {s === "todos" ? "Todos" : (MDE_STATUS_LABELS[s]?.label ?? s)}
          </Button>
        ))}
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status MDe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {hasConfig
                      ? "Nenhuma NF-e encontrada. Clique em \"Consultar agora\" para buscar."
                      : "Configure a integração fiscal para começar."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((nfe) => (
                  <TableRow key={nfe.id}>
                    <TableCell className="max-w-[200px] truncate font-medium" title={nfe.supplier_name}>
                      {nfe.supplier_name || "–"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatCnpj(nfe.supplier_cnpj)}
                    </TableCell>
                    <TableCell>{nfe.invoice_number}</TableCell>
                    <TableCell>{formatDate(nfe.emission_date)}</TableCell>
                    <TableCell className="text-right">{formatMoney(nfe.total_invoice)}</TableCell>
                    <TableCell>
                      <MdeStatusBadge status={nfe.mde_status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
