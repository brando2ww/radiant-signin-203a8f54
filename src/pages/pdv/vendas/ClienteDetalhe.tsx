import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  FilePlus2,
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClienteDialog } from "@/components/vendas/clientes/ClienteDialog";
import { documentoCliente, enderecoCliente, linkWhatsApp, soDigitos } from "@/components/vendas/clientes/cliente-utils";
import { useVendasCliente, useVendasRepresentantesLista } from "@/hooks/use-vendas-clientes";
import { useVendasClienteHistorico, type ClienteRecebivel } from "@/hooks/use-vendas-clientes-detalhe";
import { formatBRL } from "@/lib/format";
import {
  AGENDA_TIPO_LABEL,
  PEDIDO_STATUS_LABEL,
  PROPOSTA_STATUS_LABEL,
  type PedidoStatus,
  type PropostaStatus,
} from "@/lib/vendas/types";

const dataCurta = (v: string | null | undefined) => (v ? format(parseISO(v), "dd/MM/yyyy") : "·");

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const COR_PROPOSTA: Record<PropostaStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  converted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  expired: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  cancelled: "bg-muted text-muted-foreground line-through",
};
const COR_PEDIDO: Record<PedidoStatus, string> = {
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  invoiced: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  cancelled: "bg-muted text-muted-foreground line-through",
};

function situacaoRecebivel(r: ClienteRecebivel, hoje: string): { rotulo: string; cor: string } {
  if (r.status === "paid") return { rotulo: `Pago ${r.payment_date ? dataCurta(r.payment_date) : ""}`.trim(), cor: COR_PEDIDO.delivered };
  if (r.status === "cancelled") return { rotulo: "Cancelado", cor: COR_PEDIDO.cancelled };
  if (r.status === "overdue" || r.due_date < hoje) return { rotulo: "Vencido", cor: COR_PROPOSTA.rejected };
  return { rotulo: "Em aberto", cor: COR_PROPOSTA.sent };
}

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { cliente, isLoading } = useVendasCliente(id);
  const { historico, isLoading: carregandoHistorico } = useVendasClienteHistorico(id);
  const { representantes } = useVendasRepresentantesLista();
  const [editando, setEditando] = useState(false);

  const hoje = hojeISO();
  const rep = cliente?.representative_id ? representantes.find((r) => r.id === cliente.representative_id) : null;

  const resumo = useMemo(() => {
    const abertos = historico.recebiveis.filter((r) => r.status === "pending" || r.status === "overdue");
    const vencidos = abertos.filter((r) => r.status === "overdue" || r.due_date < hoje);
    const pedidosValidos = historico.pedidos.filter((p) => p.status !== "cancelled");
    const propostasAbertas = historico.propostas.filter((p) => ["draft", "sent", "approved"].includes(p.status));
    return {
      aberto: abertos.reduce((s, r) => s + r.amount, 0),
      vencido: vencidos.reduce((s, r) => s + r.amount, 0),
      qtdVencidos: vencidos.length,
      pedidos: pedidosValidos.length,
      totalPedidos: pedidosValidos.reduce((s, p) => s + p.total, 0),
      propostasAbertas: propostasAbertas.length,
      totalPropostasAbertas: propostasAbertas.reduce((s, p) => s + p.total, 0),
    };
  }, [historico, hoje]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/pdv/vendas/clientes">
            <ArrowLeft className="mr-1 h-4 w-4" /> Clientes
          </Link>
        </Button>
        <Card className="p-8 text-center text-sm text-muted-foreground">Cliente não encontrado.</Card>
      </div>
    );
  }

  const wpp = linkWhatsApp(cliente.whatsapp);
  const tel = soDigitos(cliente.phone || cliente.whatsapp);
  const documento = documentoCliente(cliente);
  const endereco = enderecoCliente(cliente);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/pdv/vendas/clientes">
          <ArrowLeft className="mr-1 h-4 w-4" /> Clientes
        </Link>
      </Button>

      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-words text-2xl font-semibold">{cliente.name}</h1>
            {cliente.person_type && <Badge variant="secondary">{cliente.person_type}</Badge>}
            {!cliente.is_b2b && <Badge variant="outline">Balcão</Badge>}
          </div>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {[cliente.company_name && cliente.company_name !== cliente.name ? cliente.company_name : null, documento]
              .filter(Boolean)
              .join(" · ") || "Sem documento cadastrado"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {wpp && (
            <Button variant="outline" size="sm" asChild>
              <a href={wpp} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp
              </a>
            </Button>
          )}
          {tel.length >= 10 && (
            <Button variant="outline" size="sm" asChild>
              <a href={`tel:+55${tel.length <= 11 ? tel : tel.slice(-11)}`}>
                <Phone className="mr-1.5 h-4 w-4" /> Ligar
              </a>
            </Button>
          )}
          {cliente.email && (
            <Button variant="outline" size="sm" asChild>
              <a href={`mailto:${cliente.email}`}>
                <Mail className="mr-1.5 h-4 w-4" /> E-mail
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
            <Pencil className="mr-1.5 h-4 w-4" /> Editar
          </Button>
          <Button size="sm" onClick={() => navigate(`/pdv/vendas/propostas/nova?cliente=${cliente.id}`)}>
            <FilePlus2 className="mr-1.5 h-4 w-4" /> Nova proposta
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Resumo titulo="A receber" valor={formatBRL(resumo.aberto)} />
        <Resumo
          titulo="Vencido"
          valor={formatBRL(resumo.vencido)}
          detalhe={resumo.qtdVencidos ? `${resumo.qtdVencidos} ${resumo.qtdVencidos === 1 ? "parcela" : "parcelas"}` : undefined}
          alerta={resumo.vencido > 0}
        />
        <Resumo
          titulo="Pedidos"
          valor={formatBRL(resumo.totalPedidos)}
          detalhe={`${resumo.pedidos} ${resumo.pedidos === 1 ? "pedido" : "pedidos"}`}
        />
        <Resumo
          titulo="Propostas abertas"
          valor={formatBRL(resumo.totalPropostasAbertas)}
          detalhe={`${resumo.propostasAbertas} ${resumo.propostasAbertas === 1 ? "proposta" : "propostas"}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Dados */}
        <div className="space-y-5">
          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">Dados</h2>
            <dl className="space-y-2.5 text-sm">
              {cliente.trade_name && <Linha rotulo="Nome fantasia" valor={cliente.trade_name} />}
              {cliente.company_name && <Linha rotulo="Razão social" valor={cliente.company_name} />}
              {documento && <Linha rotulo={cliente.cnpj ? "CNPJ" : "CPF"} valor={documento} />}
              {cliente.state_registration && <Linha rotulo="Inscrição estadual" valor={cliente.state_registration} />}
              <Linha rotulo="Contato" valor={cliente.contact_name} />
              <Linha rotulo="WhatsApp" valor={cliente.whatsapp} />
              {cliente.phone && <Linha rotulo="Telefone" valor={cliente.phone} />}
              <Linha rotulo="E-mail" valor={cliente.email} />
              <Linha rotulo="Endereço" valor={endereco} />
              <Linha rotulo="Condição de pagamento" valor={cliente.payment_terms} />
              <Linha rotulo="Limite de crédito" valor={cliente.credit_limit != null ? formatBRL(cliente.credit_limit) : null} />
              {cliente.notes && <Linha rotulo="Observações" valor={cliente.notes} preformatado />}
            </dl>
          </Card>

          <Card className="space-y-2 p-4">
            <h2 className="text-sm font-semibold">Representante</h2>
            {rep ? (
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {rep.name}
                    {!rep.is_active && <span className="ml-1 text-xs text-muted-foreground">(inativo)</span>}
                  </p>
                  {rep.phone && <p className="text-muted-foreground">{rep.phone}</p>}
                  {rep.email && <p className="break-all text-muted-foreground">{rep.email}</p>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Sem representante. A gestão atende este cliente direto.{" "}
                <button className="text-primary underline-offset-2 hover:underline" onClick={() => setEditando(true)}>
                  Definir
                </button>
              </p>
            )}
          </Card>
        </div>

        {/* Histórico */}
        <Card className="p-3 sm:p-4 lg:col-span-2 lg:self-start">
          <Tabs defaultValue="propostas">
            <TabsList className="grid h-auto w-full grid-cols-4">
              <Aba valor="propostas" rotulo="Propostas" qtd={historico.propostas.length} />
              <Aba valor="pedidos" rotulo="Pedidos" qtd={historico.pedidos.length} />
              <Aba valor="receber" rotulo="A receber" qtd={historico.recebiveis.length} />
              <Aba valor="agenda" rotulo="Agenda" qtd={historico.agenda.length} />
            </TabsList>

            {carregandoHistorico ? (
              <div className="flex justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <>
                <TabsContent value="propostas" className="mt-3">
                  {historico.propostas.length === 0 ? (
                    <Vazio texto="Nenhuma proposta para este cliente.">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/pdv/vendas/propostas/nova?cliente=${cliente.id}`)}>
                        <FilePlus2 className="mr-1.5 h-4 w-4" /> Nova proposta
                      </Button>
                    </Vazio>
                  ) : (
                    <ul className="divide-y">
                      {historico.propostas.map((p) => (
                        <ItemLista
                          key={p.id}
                          to={`/pdv/vendas/propostas/${p.id}`}
                          titulo={p.number}
                          sub={`Criada em ${dataCurta(p.created_at)}${p.valid_until ? ` · válida até ${dataCurta(p.valid_until)}` : ""}`}
                          valor={formatBRL(p.total)}
                          selo={<Selo cor={COR_PROPOSTA[p.status]}>{PROPOSTA_STATUS_LABEL[p.status] ?? p.status}</Selo>}
                        />
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="pedidos" className="mt-3">
                  {historico.pedidos.length === 0 ? (
                    <Vazio texto="Nenhum pedido para este cliente." />
                  ) : (
                    <ul className="divide-y">
                      {historico.pedidos.map((p) => (
                        <ItemLista
                          key={p.id}
                          to={`/pdv/vendas/pedidos/${p.id}`}
                          titulo={p.number}
                          sub={`Confirmado em ${dataCurta(p.confirmed_at ?? p.created_at)}${
                            p.installments > 1 ? ` · ${p.installments} parcelas` : ""
                          }`}
                          valor={formatBRL(p.total)}
                          selo={<Selo cor={COR_PEDIDO[p.status]}>{PEDIDO_STATUS_LABEL[p.status] ?? p.status}</Selo>}
                        />
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="receber" className="mt-3">
                  {historico.recebiveis.length === 0 ? (
                    <Vazio texto="Nada no contas a receber deste cliente." />
                  ) : (
                    <ul className="divide-y">
                      {historico.recebiveis.map((r) => {
                        const s = situacaoRecebivel(r, hoje);
                        return (
                          <ItemLista
                            key={r.id}
                            to={r.vendas_pedido_id ? `/pdv/vendas/pedidos/${r.vendas_pedido_id}` : undefined}
                            titulo={`Vence ${dataCurta(r.due_date)}`}
                            sub={r.description || r.document_number || "Lançamento"}
                            valor={formatBRL(r.amount)}
                            selo={<Selo cor={s.cor}>{s.rotulo}</Selo>}
                            extra={
                              r.charge_url && r.status !== "paid" && r.status !== "cancelled" ? (
                                <a
                                  href={r.charge_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                  Cobrança <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : null
                            }
                          />
                        );
                      })}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="agenda" className="mt-3">
                  {historico.agenda.length === 0 ? (
                    <Vazio texto="Nenhum compromisso marcado com este cliente." />
                  ) : (
                    <ul className="divide-y">
                      {historico.agenda.map((a) => (
                        <li key={a.id} className="flex items-start gap-3 py-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                            <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{a.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {AGENDA_TIPO_LABEL[a.kind] ?? a.kind} ·{" "}
                              {a.all_day
                                ? format(parseISO(a.starts_at), "EEE, dd/MM", { locale: ptBR })
                                : format(parseISO(a.starts_at), "EEE, dd/MM 'às' HH:mm", { locale: ptBR })}
                              {a.location ? ` · ${a.location}` : ""}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              </>
            )}
          </Tabs>
        </Card>
      </div>

      <ClienteDialog open={editando} onOpenChange={setEditando} cliente={cliente} mode="gestao" />
    </div>
  );
}

function Resumo({ titulo, valor, detalhe, alerta }: { titulo: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <Card className="p-3 sm:p-4">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={`mt-1 truncate text-lg font-semibold tabular-nums ${alerta ? "text-destructive" : ""}`}>{valor}</p>
      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
    </Card>
  );
}

function Linha({ rotulo, valor, preformatado }: { rotulo: string; valor: string | null | undefined; preformatado?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className={`break-words ${preformatado ? "whitespace-pre-line" : ""}`}>{valor || <span className="text-muted-foreground">·</span>}</dd>
    </div>
  );
}

function Aba({ valor, rotulo, qtd }: { valor: string; rotulo: string; qtd: number }) {
  return (
    <TabsTrigger value={valor} className="flex flex-col gap-0.5 px-1 py-1.5 text-xs sm:flex-row sm:gap-1.5 sm:text-sm">
      <span>{rotulo}</span>
      <span className="text-[11px] text-muted-foreground">{qtd}</span>
    </TabsTrigger>
  );
}

function Selo({ cor, children }: { cor: string; children: React.ReactNode }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${cor}`}>{children}</span>;
}

function Vazio({ texto, children }: { texto: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
      {texto}
      {children}
    </div>
  );
}

function ItemLista({
  to,
  titulo,
  sub,
  valor,
  selo,
  extra,
}: {
  to?: string;
  titulo: string;
  sub: string;
  valor: string;
  selo: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const conteudo = (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{titulo}</p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold tabular-nums">{valor}</span>
        {selo}
      </div>
    </div>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className="-mx-2 block rounded-md px-2 hover:bg-muted/60">
          {conteudo}
        </Link>
      ) : (
        conteudo
      )}
      {extra && <div className="-mt-1.5 pb-2.5">{extra}</div>}
    </li>
  );
}
