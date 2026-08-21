import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClipboardList, Download, FileSpreadsheet, Link2, Lock, PackageCheck, Plus, Users } from "lucide-react";
import { exportStockCountPdf, exportStockCountXlsx } from "@/lib/stock-count/export";
import { useBusinessSettings } from "@/hooks/use-business-settings";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NewStockCountDialog } from "@/components/pdv/stock-count/NewStockCountDialog";
import { StockCountLinksDialog } from "@/components/pdv/stock-count/StockCountLinksDialog";
import {
  useStockCounts, useStockCountItems, useStockCountSessions,
  useCloseStockCount, useApplyStockCount, useStockCountHistory,
} from "@/hooks/use-stock-count";

const STATUS: Record<string, { rotulo: string; variante: "default" | "secondary" | "outline" }> = {
  aberta: { rotulo: "Em contagem", variante: "default" },
  fechada: { rotulo: "Fechada · revisar", variante: "outline" },
  aplicada: { rotulo: "Aplicada", variante: "secondary" },
  cancelada: { rotulo: "Cancelada", variante: "secondary" },
};

export default function StockCounts() {
  const { data: contagens = [], isLoading } = useStockCounts();
  const [novaAberta, setNovaAberta] = useState(false);
  const [selecionada, setSelecionada] = useState<string | undefined>();
  const [confirmarAplicar, setConfirmarAplicar] = useState(false);
  const [linksAbertos, setLinksAbertos] = useState(false);

  const contagem = contagens.find((c) => c.id === selecionada) ?? contagens[0];
  const { data: itens = [] } = useStockCountItems(contagem?.id);
  const { data: sessoes = [] } = useStockCountSessions(contagem?.id);
  const fechar = useCloseStockCount();
  const aplicar = useApplyStockCount();
  const { data: historico = [] } = useStockCountHistory();
  const { settings: negocio } = useBusinessSettings();
  const nomeNegocio = negocio?.business_name ?? "Velara";

  const resumo = useMemo(() => {
    const contados = itens.filter((i) => i.counted_qty != null);
    const divergentes = contados.filter(
      (i) => Math.abs((i.counted_qty ?? 0) - i.expected_qty) > 0.0001,
    );
    const sobra = divergentes
      .filter((i) => (i.counted_qty ?? 0) > i.expected_qty)
      .reduce((s, i) => s + ((i.counted_qty ?? 0) - i.expected_qty) * i.unit_cost, 0);
    const falta = divergentes
      .filter((i) => (i.counted_qty ?? 0) < i.expected_qty)
      .reduce((s, i) => s + (i.expected_qty - (i.counted_qty ?? 0)) * i.unit_cost, 0);
    return {
      total: itens.length,
      contados: contados.length,
      divergentes: divergentes.length,
      sobra,
      falta,
      liquido: sobra - falta,
    };
  }, [itens]);

  // Divergência ordenada por dinheiro, não por quantidade: 200 g de trufa
  // importa mais que 20 kg de batata.
  const divergencias = useMemo(
    () =>
      itens
        .filter((i) => i.counted_qty != null && Math.abs((i.counted_qty ?? 0) - i.expected_qty) > 0.0001)
        .map((i) => {
          const delta = (i.counted_qty ?? 0) - i.expected_qty;
          return { ...i, delta, valor: delta * i.unit_cost };
        })
        .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)),
    [itens],
  );

  const ativos = sessoes.filter(
    (s: any) => Date.now() - new Date(s.last_seen_at).getTime() < 5 * 60 * 1000,
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Contagem de Estoque</h1>
          <p className="mt-1 text-muted-foreground">
            Gere um link por setor, acompanhe em tempo real e revise antes de ajustar
          </p>
        </div>
        <Button onClick={() => setNovaAberta(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nova contagem
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : contagens.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p>Nenhuma contagem ainda.</p>
            <p className="text-sm">Abra a primeira e envie o link para quem vai contar.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {contagens.slice(0, 8).map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={contagem?.id === c.id ? "default" : "outline"}
                onClick={() => setSelecionada(c.id)}
              >
                {c.name}
              </Button>
            ))}
          </div>

          {contagem && (
            <>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {contagem.name}
                      <Badge variant={STATUS[contagem.status]?.variante ?? "secondary"}>
                        {STATUS[contagem.status]?.rotulo ?? contagem.status}
                      </Badge>
                      {contagem.blind && (
                        <Badge variant="outline" className="gap-1">
                          <Lock className="h-3 w-3" /> cega
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Aberta em {format(new Date(contagem.opened_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      {ativos.length > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-foreground">
                          <Users className="h-3 w-3" /> {ativos.length} contando agora
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/* Pegar o link depois de aberta: a senha não volta, mas o
                        link sim — e sem isso o gestor teria que abrir outra
                        contagem só para reenviar. */}
                    <Button variant="outline" size="sm" onClick={() => setLinksAbertos(true)}>
                      <Link2 className="mr-2 h-4 w-4" /> Links
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resumo.contados === 0}
                      onClick={() => exportStockCountXlsx({ businessName: nomeNegocio, count: contagem, items: itens })}
                    >
                      <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resumo.contados === 0}
                      onClick={() => void exportStockCountPdf({ businessName: nomeNegocio, count: contagem, items: itens })}
                    >
                      <Download className="mr-2 h-4 w-4" /> PDF
                    </Button>
                    {contagem.status === "aberta" && (
                      <Button variant="outline" onClick={() => fechar.mutate(contagem.id)}>
                        Fechar contagem
                      </Button>
                    )}
                    {contagem.status === "fechada" && (
                      <Button onClick={() => setConfirmarAplicar(true)}>
                        <PackageCheck className="mr-2 h-4 w-4" /> Aplicar ajustes
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-muted-foreground">Progresso</span>
                      <span className="font-medium">
                        {resumo.contados} de {resumo.total}
                      </span>
                    </div>
                    <Progress value={(resumo.contados / Math.max(1, resumo.total)) * 100} className="h-2" />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4">
                    {[
                      { r: "Divergências", v: String(resumo.divergentes), cor: "" },
                      { r: "Sobra", v: formatBRL(resumo.sobra), cor: "text-success" },
                      { r: "Falta", v: formatBRL(resumo.falta), cor: "text-destructive" },
                      {
                        r: "Impacto líquido",
                        v: formatBRL(resumo.liquido),
                        cor: resumo.liquido >= 0 ? "text-success" : "text-destructive",
                      },
                    ].map((t) => (
                      <div key={t.r} className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">{t.r}</p>
                        <p className={cn("text-xl font-bold tabular-nums", t.cor)}>{t.v}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Divergências</CardTitle>
                  <CardDescription>
                    Ordenadas pelo impacto em reais · é onde o dinheiro está, não onde a quantidade é maior
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {divergencias.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {resumo.contados === 0
                        ? "Ninguém contou ainda."
                        : "Tudo que foi contado bate com o sistema."}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Insumo</TableHead>
                            <TableHead>Setor</TableHead>
                            <TableHead className="text-right">Sistema</TableHead>
                            <TableHead className="text-right">Contado</TableHead>
                            <TableHead className="text-right">Diferença</TableHead>
                            <TableHead className="text-right">Impacto</TableHead>
                            <TableHead>Quem contou</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {divergencias.map((d) => (
                            <TableRow key={d.id}>
                              <TableCell className="font-medium">{d.ingredient_name}</TableCell>
                              <TableCell className="text-muted-foreground">{d.sector ?? "—"}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {d.expected_qty.toLocaleString("pt-BR")} {d.unit}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {(d.counted_qty ?? 0).toLocaleString("pt-BR")} {d.unit}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "text-right font-medium tabular-nums",
                                  d.delta > 0 ? "text-success" : "text-destructive",
                                )}
                              >
                                {d.delta > 0 ? "+" : ""}
                                {d.delta.toLocaleString("pt-BR")}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "text-right font-semibold tabular-nums",
                                  d.valor > 0 ? "text-success" : "text-destructive",
                                )}
                              >
                                {formatBRL(d.valor)}
                              </TableCell>
                              <TableCell className="text-muted-foreground">{d.counted_by ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      {historico.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Acuracidade ao longo do tempo</CardTitle>
            <CardDescription>
              Taxa de acerto entre os itens contados · a cobertura aparece à parte, para
              contagem parcial não ser punida duas vezes
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contagem</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Cobertura</TableHead>
                  <TableHead className="text-right">Acuracidade</TableHead>
                  <TableHead className="text-right">Divergência</TableHead>
                  <TableHead className="text-right">Impacto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historico.map((h) => {
                  const cobertura = h.total > 0 ? h.contados / h.total : 0;
                  const acuracidade = h.contados > 0 ? h.exatos / h.contados : 0;
                  return (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium">{h.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(h.opened_at), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(cobertura * 100).toFixed(0)}%
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({h.contados}/{h.total})
                        </span>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-semibold tabular-nums",
                          acuracidade >= 0.95 ? "text-success" : acuracidade >= 0.85 ? "" : "text-destructive",
                        )}
                      >
                        {h.contados > 0 ? `${(acuracidade * 100).toFixed(0)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL(Number(h.divergencia_absoluta))}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          Number(h.impacto) >= 0 ? "text-success" : "text-destructive",
                        )}
                      >
                        {formatBRL(Number(h.impacto))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <NewStockCountDialog open={novaAberta} onOpenChange={setNovaAberta} />

      <StockCountLinksDialog
        open={linksAbertos}
        onOpenChange={setLinksAbertos}
        countId={contagem?.id}
      />

      <AlertDialog open={confirmarAplicar} onOpenChange={setConfirmarAplicar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar os ajustes no estoque?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {resumo.divergentes} insumo(s) vão ter o saldo corrigido para o valor contado,
                  com impacto de <strong>{formatBRL(resumo.liquido)}</strong>.
                </p>
                <p>
                  Os {resumo.total - resumo.contados} itens não contados não serão tocados.
                </p>
                <p>Cada correção vira um movimento de estoque do tipo ajuste, com rastro.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => contagem && aplicar.mutate(contagem.id)}>
              Aplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
