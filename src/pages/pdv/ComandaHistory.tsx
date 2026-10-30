import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ClosedComandaDialog } from "@/components/pdv/ClosedComandaDialog";
import { HISTORY_PAGE_SIZE, useComandaHistory } from "@/hooks/use-comanda-history";
import { historyTimestamp } from "@/lib/comanda-history";
import { formatBRL } from "@/lib/format";
import { QrCode } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";

export default function ComandaHistory() {
  const { canAccess } = useUserRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("comanda");
  const [search, setSearch] = useState("");
  const [querySearch, setQuerySearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => { setQuerySearch(search.trim()); setPage(0); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const { data, isLoading, isFetching, error, refetch, allowed } = useComandaHistory({ from, to, search: querySearch, page });
  const total = data?.total ?? 0;
  const selectComanda = (id: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (id) params.set("comanda", id); else params.delete("comanda");
    setSearchParams(params, { replace: true });
  };
  const invalidDates = !!(from && to && from > to);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><Button variant="ghost" size="sm" asChild className="mb-2"><Link to="/pdv/caixa"><ArrowLeft className="h-4 w-4 mr-1" />Voltar ao caixa</Link></Button>
          <h1 className="text-2xl font-bold">Histórico de comandas fechadas</h1>
          <p className="text-muted-foreground text-sm">Consulte mesa, cliente, consumo e pagamentos de atendimentos anteriores.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canAccess("/pdv/mesa-digital") && <Button asChild variant="outline"><Link to="/pdv/mesa-digital"><QrCode className="h-4 w-4 mr-2" />QR Code das mesas</Link></Button>}
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching || !allowed}><RefreshCw className="h-4 w-4 mr-2" />Atualizar</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1 flex-1 min-w-56"><Label htmlFor="history-search">Buscar comanda, cliente, telefone ou mesa</Label><div className="relative"><Search className="h-4 w-4 absolute top-3 left-3 text-muted-foreground" /><Input id="history-search" className="pl-9" placeholder="Ex.: Erica, 001, Mesa 06…" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div>
        <div className="space-y-1"><Label htmlFor="history-from">Fechadas de</Label><Input id="history-from" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(0); }} /></div>
        <div className="space-y-1"><Label htmlFor="history-to">Até</Label><Input id="history-to" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(0); }} /></div>
        {(search || from || to) && <Button variant="ghost" onClick={() => { setSearch(""); setQuerySearch(""); setFrom(""); setTo(""); setPage(0); }}>Limpar filtros</Button>}
      </div>
      {invalidDates && <p role="alert" className="text-destructive text-sm">A data inicial deve ser anterior ou igual à final.</p>}

      {isLoading ? <p className="py-12 text-center text-muted-foreground">Carregando histórico…</p> : !allowed ? <Alert variant="destructive"><AlertDescription>Seu perfil não tem permissão para visualizar o histórico.</AlertDescription></Alert> : error ? <Alert variant="destructive"><AlertDescription>Não foi possível carregar o histórico. <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button></AlertDescription></Alert> : !invalidDates && <>
        <div className="text-sm text-muted-foreground">{total} comanda{total !== 1 ? "s" : ""} fechada{total !== 1 ? "s" : ""}{!from && !to ? " · Todo o histórico" : " no período"}</div>
        {data?.comandas.length ? <div className="rounded-lg border overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50"><tr><th className="p-3 text-left">Fechamento</th><th className="p-3 text-left">Comanda / cliente</th><th className="p-3 text-left">Mesa / local</th><th className="p-3 text-right">Consumo</th><th className="p-3 text-right">Pagamento registrado</th><th className="p-3"><span className="sr-only">Detalhes</span></th></tr></thead>
          <tbody>{data.comandas.map((comanda) => <tr key={comanda.id} className="border-t hover:bg-muted/30">
            <td className="p-3 whitespace-nowrap">{historyTimestamp(comanda.fechada_em)}</td>
            <td className="p-3"><p className="font-medium">#{comanda.numero} · {comanda.cliente || "Sem identificação"}</p>{comanda.telefone && <p className="text-xs text-muted-foreground">{comanda.telefone}</p>}</td>
            <td className="p-3 whitespace-nowrap">{comanda.local}</td><td className="p-3 text-right whitespace-nowrap">{formatBRL(comanda.consumo)}</td>
            <td className="p-3 text-right whitespace-nowrap">{comanda.valor_pago !== null ? <><strong>{formatBRL(comanda.valor_pago)}</strong><p className="text-xs text-muted-foreground">{comanda.pagamento_escopo === "atendimento" ? "Do atendimento" : "Da comanda"}</p></> : <span className="text-muted-foreground">Sem vínculo preservado</span>}</td>
            <td className="p-3"><Button size="sm" variant="outline" onClick={() => selectComanda(comanda.id)}><Eye className="h-4 w-4 mr-1" />Ver detalhes</Button></td>
          </tr>)}</tbody>
        </table></div> : <p className="text-center text-muted-foreground py-12">Nenhuma comanda fechada encontrada. Tente ajustar a busca ou o período.</p>}
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Página {page + 1} de {Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE))}</span>
          <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0 || isFetching} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" />Anterior</Button><Button variant="outline" size="sm" disabled={(page + 1) * HISTORY_PAGE_SIZE >= total || isFetching} onClick={() => setPage((value) => value + 1)}>Próxima<ChevronRight className="h-4 w-4" /></Button></div>
        </div>
      </>}
      {allowed && <ClosedComandaDialog comandaId={selectedId} onOpenChange={(open) => { if (!open) selectComanda(null); }} onSelectComanda={selectComanda} />}
    </div>
  );
}
