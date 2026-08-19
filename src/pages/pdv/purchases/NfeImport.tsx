import { useEffect, useState } from "react";
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
import { RefreshCw, FileText, AlertCircle, CheckCircle2, Clock, PlusCircle, PackagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseNFeXML, type ParsedInvoice } from "@/lib/invoice/xml-parser";
import { NfeEntryDialog } from "@/components/pdv/purchases/NfeEntryDialog";
import { QuickPurchaseDialog } from "@/components/pdv/purchases/QuickPurchaseDialog";
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

  // Dar entrada a partir da nota do MDe: baixa o XML completo na Focus, parseia
  // e abre o mesmo assistente do upload manual. É ele que faz a entrada de
  // estoque, cria as contas a pagar e grava a nota.
  const [entradaNfe, setEntradaNfe] = useState<ParsedInvoice | null>(null);
  const [entradaAberta, setEntradaAberta] = useState(false);
  const [baixandoChave, setBaixandoChave] = useState<string | null>(null);

  const darEntrada = async (chave: string) => {
    setBaixandoChave(chave);
    try {
      const { data, error } = await supabase.functions.invoke("focusnfe-nfe-xml", {
        body: { chave },
      });
      if (error) throw error;
      if (!data?.complete || !data.xml) {
        // Antes da manifestação a SEFAZ devolve só o resumo. A função já emite
        // a ciência e força uma nova distribuição; quando mesmo assim não vem,
        // o caminho é sincronizar e tentar de novo — e o aviso oferece isso em
        // vez de mandar o operador adivinhar.
        toast.info(
          data?.message || "O XML completo ainda não está disponível nesta nota.",
          {
            duration: 10000,
            action: {
              label: "Sincronizar e tentar",
              onClick: async () => {
                await consultar.mutateAsync();
                darEntrada(chave);
              },
            },
          },
        );
        return;
      }
      setEntradaNfe(await parseNFeXML(data.xml));
      setEntradaAberta(true);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível baixar o XML desta nota.");
    } finally {
      setBaixandoChave(null);
    }
  };
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  // Compra avulsa (mercado, atacado, feira): assistente próprio de 3 passos, e
  // não o de importação de nota — sem documento fiscal para conferir, o que
  // importa é entrar no estoque rápido.
  const [manualOpen, setManualOpen] = useState(false);

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
        <div className="flex flex-wrap gap-2">
          {/* Nem toda entrada vem pelo MDe: cupom fiscal, nota de produtor e
              compra em atacado costumam chegar em papel. */}
          <Button variant="outline" className="gap-2" onClick={() => setManualOpen(true)}>
            <PlusCircle className="h-4 w-4" />
            Compra avulsa
          </Button>
          <Button
            onClick={() => consultar.mutate()}
            disabled={consultar.isPending || !hasConfig}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${consultar.isPending ? "animate-spin" : ""}`} />
            {consultar.isPending ? "Consultando..." : "Consultar agora"}
          </Button>
        </div>
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
                <TableHead className="text-right">Entrada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
                    <TableCell className="text-right">
                      {/* Três estados, e não um botão que sempre parece
                          disponível: só dá para dar entrada quando o SEFAZ
                          liberou o documento completo. Esconder isso é o que
                          fazia o operador clicar em círculo. */}
                      {(nfe as any).mde_nfe_completa ? (
                        <Button
                          size="sm"
                          disabled={baixandoChave === nfe.invoice_key}
                          onClick={() => darEntrada(nfe.invoice_key)}
                        >
                          {baixandoChave === nfe.invoice_key ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <PackagePlus className="mr-2 h-4 w-4" />
                          )}
                          Dar entrada
                        </Button>
                      ) : nfe.mde_status === "ciencia" ? (
                        <span className="text-xs text-muted-foreground" title="A ciência já foi registrada. O SEFAZ libera o XML completo numa distribuição posterior.">
                          Ciência emitida · aguardando o SEFAZ
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={baixandoChave === nfe.invoice_key}
                          onClick={() => darEntrada(nfe.invoice_key)}
                          title="Emite a Ciência da Operação, que é o que autoriza o SEFAZ a liberar o XML completo."
                        >
                          {baixandoChave === nfe.invoice_key ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Emitir ciência
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <NfeEntryDialog
        open={entradaAberta}
        onOpenChange={(o) => {
          setEntradaAberta(o);
          if (!o) setEntradaNfe(null);
        }}
        nfe={entradaNfe}
      />

      <QuickPurchaseDialog open={manualOpen} onOpenChange={setManualOpen} />
    </div>
  );
}
