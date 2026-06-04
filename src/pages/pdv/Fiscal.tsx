import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FileText, RefreshCw, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { useFiscalNotas, NotaFiscal, NotaTipo, NotaStatus } from "@/hooks/use-fiscal-notas";
import { useFiscalConfig } from "@/hooks/use-fiscal-config";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { NotaDetailDialog } from "@/components/pdv/fiscal/NotaDetailDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";

const STATUS_COLORS: Record<NotaStatus, string> = {
  autorizada: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  processando: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100",
  rejeitada: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  denegada: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  cancelada: "bg-muted text-muted-foreground",
  erro: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
};

function NotasTable({ tipo }: { tipo: NotaTipo }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<NotaStatus | "">("");
  const { notas, isLoading, refresh } = useFiscalNotas({
    tipo,
    status: statusFilter || undefined,
    search: search || undefined,
  });
  const [selected, setSelected] = useState<NotaFiscal | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          placeholder="Buscar por chave, número ou destinatário"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="border rounded-md px-3 py-2 bg-background text-sm"
        >
          <option value="">Todos os status</option>
          <option value="autorizada">Autorizadas</option>
          <option value="processando">Processando</option>
          <option value="rejeitada">Rejeitadas</option>
          <option value="cancelada">Canceladas</option>
          <option value="denegada">Denegadas</option>
          <option value="erro">Com erro</option>
        </select>
        <Button variant="outline" onClick={() => refresh()}>
          <RefreshCw className="h-4 w-4 mr-2" />Atualizar
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : notas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            Nenhuma {tipo.toUpperCase()} encontrada
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Nº / Série</TableHead>
                <TableHead>Destinatário</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notas.map((n) => (
                <TableRow key={n.id} className="cursor-pointer" onClick={() => setSelected(n)}>
                  <TableCell className="text-sm">
                    {n.emitida_em && format(new Date(n.emitida_em), "dd/MM HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell>{n.numero || "—"}{n.serie ? `/${n.serie}` : ""}</TableCell>
                  <TableCell className="max-w-[180px] truncate">{n.destinatario_nome || "Consumidor"}</TableCell>
                  <TableCell>{formatBRL(n.valor_total)}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[n.status]} variant="secondary">{n.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {n.caminho_danfe && (
                      <Button asChild size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                        <a href={n.caminho_danfe} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {selected && (
        <NotaDetailDialog nota={selected} open={!!selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

export default function Fiscal() {
  const { config } = useFiscalConfig();
  const ativa = !!config?.focusnfe_empresa_id;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="h-8 w-8" />Fiscal
        </h1>
        <p className="text-muted-foreground">Emissão e gestão de notas fiscais eletrônicas</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {ativa ? (
              <><CheckCircle2 className="h-5 w-5 text-green-600" />Integração ativa</>
            ) : (
              <><AlertCircle className="h-5 w-5 text-yellow-600" />Integração não configurada</>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {ativa ? (
            <>
              <div><strong>CNPJ:</strong> {config?.cnpj}</div>
              <div><strong>Ambiente:</strong> {config?.focusnfe_ambiente === "producao" ? "Produção" : "Homologação"}</div>
              {config?.certificado_valido_ate && (
                <div><strong>Certificado válido até:</strong> {format(new Date(config.certificado_valido_ate), "dd/MM/yyyy", { locale: ptBR })}</div>
              )}
              <div className="flex gap-2 pt-2">
                <Badge variant={config?.habilita_nfce ? "default" : "secondary"}>NFC-e {config?.habilita_nfce ? "ativa" : "inativa"}</Badge>
                <Badge variant={config?.habilita_nfe ? "default" : "secondary"}>NF-e {config?.habilita_nfe ? "ativa" : "inativa"}</Badge>
              </div>
            </>
          ) : (
            <div>
              <p className="text-muted-foreground mb-3">Configure os dados fiscais e o certificado A1 antes de emitir notas.</p>
              <Button asChild>
                <Link to="/pdv/configuracoes">Ir para Configurações Fiscais</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {ativa && (
        <Tabs defaultValue="nfce">
          <TabsList>
            <TabsTrigger value="nfce">NFC-e</TabsTrigger>
            <TabsTrigger value="nfe">NF-e</TabsTrigger>
            <TabsTrigger value="nfse">NFS-e</TabsTrigger>
          </TabsList>
          <TabsContent value="nfce" className="mt-4"><NotasTable tipo="nfce" /></TabsContent>
          <TabsContent value="nfe" className="mt-4"><NotasTable tipo="nfe" /></TabsContent>
          <TabsContent value="nfse" className="mt-4"><NotasTable tipo="nfse" /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
