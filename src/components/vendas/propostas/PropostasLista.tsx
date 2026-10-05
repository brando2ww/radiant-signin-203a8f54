import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, FileText, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import type { PropostaStatus } from "@/lib/vendas/types";
import { useRepresentantesDaEmpresa, useVendasPropostas, type PropostaLinha } from "@/hooks/use-vendas-propostas";
import { dataBR, nomeCliente, num, statusEfetivo } from "./calculos";
import { PropostaStatusBadge } from "./PropostaStatusBadge";
import { baseDoModo, type ModoVendas } from "./PropostaEditor";
import { useRepContextOptional } from "@/components/vendas/rep/RepContext";

type Filtro = "todas" | "draft" | "sent" | "aprovadas" | "rejected" | "expired" | "cancelled";

const FILTROS: { k: Filtro; rotulo: string; status: PropostaStatus[] }[] = [
  { k: "todas", rotulo: "Todas", status: [] },
  { k: "draft", rotulo: "Rascunho", status: ["draft"] },
  { k: "sent", rotulo: "Enviada", status: ["sent"] },
  { k: "aprovadas", rotulo: "Aprovada / virou pedido", status: ["approved", "converted"] },
  { k: "rejected", rotulo: "Recusada", status: ["rejected"] },
  { k: "expired", rotulo: "Vencida", status: ["expired"] },
  { k: "cancelled", rotulo: "Cancelada", status: ["cancelled"] },
];

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function Indicador({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: string; detalhe?: string; destaque?: string }) {
  return (
    <Card className="p-3 sm:p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={cn("mt-0.5 text-lg font-bold tabular-nums sm:text-xl", destaque)}>{valor}</p>
      {detalhe && <p className="text-[11px] text-muted-foreground">{detalhe}</p>}
    </Card>
  );
}

export function PropostasLista({ mode }: { mode: ModoVendas }) {
  const navigate = useNavigate();
  const base = baseDoModo(mode);
  const { data: todas = [], isLoading } = useVendasPropostas();
  // Dono pré-visualizando o app do representante: só as do representante escolhido.
  const repCtx = useRepContextOptional();
  const filtrarRep = mode === "representante" && repCtx?.isPreview && repCtx.repId ? repCtx.repId : null;
  const propostas = useMemo(
    () => (filtrarRep ? todas.filter((p) => p.representative_id === filtrarRep) : todas),
    [todas, filtrarRep],
  );
  const { data: reps = [] } = useRepresentantesDaEmpresa(mode === "gestao");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");
  const [rep, setRep] = useState<string>("todos");

  const linhas = useMemo(
    () => propostas.map((p) => ({ ...p, efetivo: statusEfetivo(p) })),
    [propostas],
  );

  // Busca e representante valem para os indicadores; a situação só filtra a lista.
  const base1 = useMemo(() => {
    const q = semAcento(busca.trim());
    return linhas.filter((p) => {
      if (mode === "gestao" && rep !== "todos") {
        if (rep === "nenhum" ? p.representative_id : p.representative_id !== rep) return false;
      }
      if (!q) return true;
      const alvo = semAcento(
        [p.number, p.customer?.name, p.customer?.trade_name, p.customer?.company_name, p.customer?.city].filter(Boolean).join(" "),
      );
      return alvo.includes(q);
    });
  }, [linhas, busca, rep, mode]);

  const contagem = useMemo(() => {
    const m = new Map<Filtro, number>();
    for (const f of FILTROS) m.set(f.k, f.k === "todas" ? base1.length : base1.filter((p) => f.status.includes(p.efetivo)).length);
    return m;
  }, [base1]);

  const visiveis = useMemo(() => {
    const f = FILTROS.find((x) => x.k === filtro)!;
    return f.k === "todas" ? base1 : base1.filter((p) => f.status.includes(p.efetivo));
  }, [base1, filtro]);

  const ind = useMemo(() => {
    const soma = (arr: typeof base1) => arr.reduce((s, p) => s + num(p.total), 0);
    const abertas = base1.filter((p) => p.efetivo === "draft" || p.efetivo === "sent");
    const aprovadas = base1.filter((p) => p.efetivo === "approved" || p.efetivo === "converted");
    const perdidas = base1.filter((p) => p.efetivo === "rejected" || p.efetivo === "expired");
    const decididas = aprovadas.length + perdidas.length;
    return {
      abertas: abertas.length,
      abertasValor: soma(abertas),
      aprovadas: aprovadas.length,
      aprovadasValor: soma(aprovadas),
      perdidas: perdidas.length,
      conversao: decididas > 0 ? Math.round((aprovadas.length / decididas) * 100) : null,
    };
  }, [base1]);

  const totalVisivel = visiveis.reduce((s, p) => s + num(p.total), 0);
  const abrir = (p: PropostaLinha) => navigate(`${base}/propostas/${p.id}`);
  const largo = mode === "gestao";

  return (
    <div className={cn("mx-auto w-full space-y-4 px-4 py-4 sm:py-6", largo ? "max-w-7xl lg:px-6" : "max-w-3xl")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={cn("font-bold tracking-tight", largo ? "text-3xl" : "text-2xl")}>
            {mode === "gestao" ? "Propostas" : "Minhas propostas"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Orçamentos com a marca da empresa, enviados por link. Aprovada, vira pedido.
          </p>
        </div>
        <Button asChild className={cn(!largo && "w-full")}>
          <Link to={`${base}/propostas/nova`}>
            <Plus className="mr-2 h-4 w-4" /> Nova proposta
          </Link>
        </Button>
      </div>

      <div className={cn("grid grid-cols-2 gap-3", largo && "lg:grid-cols-4")}>
        <Indicador rotulo="Em aberto" valor={formatBRL(ind.abertasValor)} detalhe={`${ind.abertas} ${ind.abertas === 1 ? "proposta" : "propostas"}`} />
        <Indicador
          rotulo="Aprovadas"
          valor={formatBRL(ind.aprovadasValor)}
          detalhe={`${ind.aprovadas} ${ind.aprovadas === 1 ? "proposta" : "propostas"}`}
          destaque="text-emerald-700 dark:text-emerald-400"
        />
        <Indicador rotulo="Recusadas ou vencidas" valor={String(ind.perdidas)} />
        <Indicador
          rotulo="Conversão"
          valor={ind.conversao === null ? "·" : `${ind.conversao}%`}
          detalhe="aprovadas entre as decididas"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por número ou cliente" className="pl-9" />
        </div>
        {mode === "gestao" && (
          <Select value={rep} onValueChange={setRep}>
            <SelectTrigger className="sm:w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os representantes</SelectItem>
              <SelectItem value="nenhum">Venda direta</SelectItem>
              {reps.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* No computador as situações quebram linha; no celular da gestão, rolam de lado. No app do representante
          (coluna de celular mesmo no computador) sempre quebram linha. */}
      <div className={cn(largo && "-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0")}>
        <div className={cn("flex gap-1.5", largo ? "w-max sm:w-auto sm:flex-wrap" : "flex-wrap")}>
          {FILTROS.map((f) => (
            <button
              key={f.k}
              type="button"
              onClick={() => setFiltro(f.k)}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filtro === f.k ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {f.rotulo}
              <span className={cn("ml-1.5 tabular-nums", filtro === f.k ? "opacity-80" : "text-muted-foreground")}>
                {contagem.get(f.k) ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visiveis.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
          <FileText className="mb-3 h-8 w-8 text-muted-foreground/60" />
          <p className="font-medium">{propostas.length === 0 ? "Nenhuma proposta ainda" : "Nada com esse filtro"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {propostas.length === 0 ? "Monte a primeira com os produtos do catálogo e mande o link ao cliente." : "Troque a situação ou a busca."}
          </p>
        </Card>
      ) : (
        <>
          {/* Tabela no computador (gestão) */}
          {largo && (
            <Card className="hidden overflow-hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Representante</TableHead>
                    <TableHead>Criada</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((p) => (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => abrir(p)}>
                      <TableCell className="font-mono text-xs font-medium">{p.number}</TableCell>
                      <TableCell>
                        <p className="font-medium leading-tight">{nomeCliente(p.customer)}</p>
                        {p.customer?.city && <p className="text-xs text-muted-foreground">{p.customer.city}</p>}
                      </TableCell>
                      <TableCell className="text-sm">{p.rep?.name ?? <span className="text-muted-foreground">Venda direta</span>}</TableCell>
                      <TableCell className="text-sm">{dataBR(p.created_at)}</TableCell>
                      <TableCell className="text-sm">{p.valid_until ? dataBR(p.valid_until) : "·"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <PropostaStatusBadge status={p.efetivo} />
                          {p.viewed_at && p.efetivo === "sent" && (
                            <Eye className="h-3.5 w-3.5 text-blue-600" aria-label="Visto pelo cliente" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatBRL(p.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm">
                      {visiveis.length} {visiveis.length === 1 ? "proposta" : "propostas"}
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{formatBRL(totalVisivel)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </Card>
          )}

          {/* Cartões (celular e app do representante) */}
          <div className={cn("space-y-2", largo && "md:hidden")}>
            {visiveis.map((p) => (
              <Link key={p.id} to={`${base}/propostas/${p.id}`} className="block">
                <Card className="p-3 transition-colors hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium leading-tight">{nomeCliente(p.customer)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <span className="font-mono">{p.number}</span> · {dataBR(p.created_at)}
                        {mode === "gestao" && p.rep?.name ? ` · ${p.rep.name}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">{formatBRL(p.total)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <PropostaStatusBadge status={p.efetivo} />
                    {p.efetivo === "sent" && (
                      <span className={cn("inline-flex items-center gap-1", p.viewed_at && "text-blue-600")}>
                        <Eye className="h-3.5 w-3.5" /> {p.viewed_at ? "visto" : "não aberto"}
                      </span>
                    )}
                    {p.valid_until && (p.efetivo === "sent" || p.efetivo === "draft") && <span>válida até {dataBR(p.valid_until)}</span>}
                  </div>
                </Card>
              </Link>
            ))}
            <p className="px-1 pt-1 text-xs text-muted-foreground">
              {visiveis.length} {visiveis.length === 1 ? "proposta" : "propostas"} · {formatBRL(totalVisivel)}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
