import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  FilePlus2,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Pencil,
  Phone,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClienteDialog } from "@/components/vendas/clientes/ClienteDialog";
import { documentoCliente, enderecoCliente, formatarTelefone } from "@/components/vendas/clientes/cliente-utils";
import { AgendarVisitaDialog } from "@/components/vendas/rep/AgendarVisitaDialog";
import { useRepContext } from "@/components/vendas/rep/RepContext";
import { PedidoStatusBadge, PropostaStatusBadge } from "@/components/vendas/rep/RepStatusBadge";
import { initials, telHref, whatsappHref } from "@/components/vendas/rep/rep-utils";
import { useRepCliente, useRepClienteHistorico } from "@/hooks/use-vendas-rep-clientes";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AGENDA_TIPO_LABEL } from "@/lib/vendas/types";

const LIMITE = 5;

/** Ficha do cliente no celular: contato a um toque, propostas, pedidos, próximas visitas e dados cadastrais. */
export default function RepClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { ownerId, repId, isPreview } = useRepContext();
  const { data: cliente, isLoading, isError, refetch } = useRepCliente(ownerId, id);
  const { data: hist, isLoading: carregandoHist } = useRepClienteHistorico(ownerId, repId, id);
  const [editar, setEditar] = useState(false);
  const [visita, setVisita] = useState(false);
  const [todasPropostas, setTodasPropostas] = useState(false);
  const [todosPedidos, setTodosPedidos] = useState(false);

  const voltar = (
    <div className="flex items-center justify-between gap-2 px-2 pt-3">
      <Button variant="ghost" className="h-11 gap-1 px-3" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/representante/clientes"))}>
        <ArrowLeft className="h-5 w-5" />
        Clientes
      </Button>
      {cliente && (
        <Button variant="ghost" className="h-11 gap-1.5 px-3" onClick={() => setEditar(true)}>
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div>
        {voltar}
        <div className="space-y-4 px-4 py-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError || !cliente) {
    return (
      <div>
        {voltar}
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <UserX className="h-7 w-7 text-muted-foreground" />
          </span>
          <p className="font-medium">{isError ? "Não foi possível abrir o cliente" : "Cliente não encontrado"}</p>
          <p className="text-sm text-muted-foreground">
            {isError ? "Confira a internet e tente de novo." : "Ele pode ter saído da sua carteira."}
          </p>
          {isError ? (
            <Button className="h-11" onClick={() => refetch()}>
              Tentar de novo
            </Button>
          ) : (
            <Button asChild className="h-11">
              <Link to="/representante/clientes">Ver meus clientes</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  const nome = cliente.trade_name?.trim() || cliente.name;
  const doc = documentoCliente(cliente);
  const endereco = enderecoCliente(cliente);
  const cidade = [cliente.city, cliente.state].filter(Boolean).join("/");
  const tel = telHref(cliente.phone || cliente.whatsapp);
  const zap = whatsappHref(cliente.whatsapp || cliente.phone);
  const mapa = endereco
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [cliente.street, cliente.address_number, cliente.district, cliente.city, cliente.state].filter(Boolean).join(", "),
      )}`
    : null;
  const enderecoVisita = [
    [cliente.street, cliente.address_number].filter(Boolean).join(", "),
    cliente.district,
    cidade,
  ]
    .filter(Boolean)
    .join(" · ");

  const propostas = hist?.propostas ?? [];
  const pedidos = hist?.pedidos ?? [];
  const visitas = hist?.visitas ?? [];

  return (
    <div className="pb-4">
      {voltar}

      {/* Cabeçalho do cliente */}
      <section className="flex items-start gap-3 px-4 pb-4 pt-1">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
          {initials(nome)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-xl font-semibold leading-tight">{nome}</h1>
          {cliente.company_name && cliente.company_name.trim() !== nome && (
            <p className="mt-0.5 break-words text-sm text-muted-foreground">{cliente.company_name}</p>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {doc && <span>{doc}</span>}
            {cidade && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {cidade}
              </span>
            )}
          </p>
        </div>
      </section>

      {/* Contato */}
      <section aria-label="Contato" className="grid grid-cols-4 gap-2 px-4">
        <ContatoTile href={tel} icon={Phone} label="Ligar" />
        <ContatoTile href={zap} icon={MessageCircle} label="WhatsApp" external tone="text-emerald-600 dark:text-emerald-400" />
        <ContatoTile href={cliente.email ? `mailto:${cliente.email}` : null} icon={Mail} label="E-mail" />
        <ContatoTile href={mapa} icon={Navigation} label="Mapa" external />
      </section>

      {/* Ações */}
      <section className="grid grid-cols-2 gap-3 px-4 pt-4">
        <Button className="h-12 rounded-xl" onClick={() => navigate(`/representante/propostas/nova?cliente=${cliente.id}`)}>
          <FilePlus2 className="mr-2 h-5 w-5" />
          Nova proposta
        </Button>
        <Button variant="outline" className="h-12 rounded-xl" onClick={() => setVisita(true)}>
          <CalendarPlus className="mr-2 h-5 w-5" />
          Agendar visita
        </Button>
      </section>

      {/* Próximas visitas */}
      <Secao titulo="Próximas visitas">
        {carregandoHist ? (
          <Skeleton className="h-16 rounded-2xl" />
        ) : visitas.length === 0 ? (
          <Vazio>Nenhum compromisso marcado com este cliente.</Vazio>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {visitas.map((v) => {
              const inicio = new Date(v.starts_at);
              return (
                <li key={v.id}>
                  <Link to="/representante/agenda" className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted">
                    <span className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-primary/10 py-1 text-primary">
                      <span className="text-[10px] font-medium uppercase leading-none">{format(inicio, "MMM", { locale: ptBR })}</span>
                      <span className="text-lg font-bold leading-tight">{format(inicio, "dd")}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{v.title}</span>
                      <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <CalendarClock className="h-3 w-3 shrink-0" />
                        {AGENDA_TIPO_LABEL[v.kind] ?? v.kind} ·{" "}
                        {v.all_day ? "dia todo" : format(inicio, "EEEE, HH:mm", { locale: ptBR })}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Secao>

      {/* Propostas */}
      <Secao titulo="Propostas" contagem={propostas.length}>
        {carregandoHist ? (
          <Skeleton className="h-16 rounded-2xl" />
        ) : propostas.length === 0 ? (
          <Vazio>Nenhuma proposta para este cliente ainda.</Vazio>
        ) : (
          <>
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
              {(todasPropostas ? propostas : propostas.slice(0, LIMITE)).map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/representante/propostas/${p.id}`}
                    className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.number}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {format(new Date(p.created_at), "dd/MM/yyyy")}
                        {p.valid_until ? ` · válida até ${format(new Date(`${p.valid_until}T12:00:00`), "dd/MM")}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold">{formatBRL(p.total)}</span>
                      <PropostaStatusBadge status={p.status} />
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
            {propostas.length > LIMITE && (
              <VerMais aberto={todasPropostas} onClick={() => setTodasPropostas((v) => !v)} total={propostas.length} />
            )}
          </>
        )}
      </Secao>

      {/* Pedidos */}
      <Secao titulo="Pedidos" contagem={pedidos.length}>
        {carregandoHist ? (
          <Skeleton className="h-16 rounded-2xl" />
        ) : pedidos.length === 0 ? (
          <Vazio>Nenhum pedido fechado com este cliente.</Vazio>
        ) : (
          <>
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
              {(todosPedidos ? pedidos : pedidos.slice(0, LIMITE)).map((o) => {
                const conteudo = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{o.number}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {format(new Date(o.confirmed_at), "dd/MM/yyyy")}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold">{formatBRL(o.total)}</span>
                      <PedidoStatusBadge status={o.status} />
                    </span>
                  </>
                );
                const cls = "flex min-h-14 items-center gap-3 px-4 py-3";
                return (
                  <li key={o.id}>
                    {/* Não há rota própria de pedido no app: o detalhe abre em /representante/pedidos?id=. */}
                    <Link to={`/representante/pedidos?id=${o.id}`} className={cn(cls, "hover:bg-muted/50 active:bg-muted")}>
                      {conteudo}
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            {pedidos.length > LIMITE && (
              <VerMais aberto={todosPedidos} onClick={() => setTodosPedidos((v) => !v)} total={pedidos.length} />
            )}
          </>
        )}
      </Secao>

      {/* Dados */}
      <Secao titulo="Dados do cliente">
        <dl className="divide-y overflow-hidden rounded-2xl border bg-card text-sm">
          <Dado rotulo="Razão social" valor={cliente.company_name} />
          <Dado rotulo={cliente.person_type === "PF" ? "CPF" : "CNPJ"} valor={doc} />
          <Dado rotulo="Inscrição estadual" valor={cliente.state_registration} />
          <Dado rotulo="Contato" valor={cliente.contact_name} />
          <Dado rotulo="WhatsApp" valor={cliente.whatsapp ? formatarTelefone(cliente.whatsapp) : null} />
          <Dado rotulo="Telefone" valor={cliente.phone ? formatarTelefone(cliente.phone) : null} />
          <Dado rotulo="E-mail" valor={cliente.email} quebra />
          <Dado rotulo="Endereço" valor={endereco} quebra />
          <Dado rotulo="Condição de pagamento" valor={cliente.payment_terms} />
          <Dado rotulo="Limite de crédito" valor={cliente.credit_limit != null ? formatBRL(cliente.credit_limit) : null} />
          <Dado rotulo="Observações" valor={cliente.notes} quebra />
        </dl>
      </Secao>

      <ClienteDialog
        open={editar}
        onOpenChange={setEditar}
        cliente={cliente}
        mode={isPreview ? "gestao" : "representante"}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["vendas-rep-cliente"] });
          qc.invalidateQueries({ queryKey: ["vendas-rep-clientes"] });
        }}
      />
      <AgendarVisitaDialog
        open={visita}
        onOpenChange={setVisita}
        customerId={cliente.id}
        customerName={nome}
        endereco={enderecoVisita}
      />
    </div>
  );
}

function Secao({ titulo, contagem, children }: { titulo: string; contagem?: number; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5 px-4 pt-6">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        {titulo}
        {!!contagem && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{contagem}</span>
        )}
      </h2>
      {children}
    </section>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">{children}</p>;
}

function VerMais({ aberto, onClick, total }: { aberto: boolean; onClick: () => void; total: number }) {
  return (
    <button type="button" onClick={onClick} className="h-11 w-full rounded-xl text-sm font-medium text-primary hover:bg-muted">
      {aberto ? "Mostrar menos" : `Ver todos (${total})`}
    </button>
  );
}

function Dado({ rotulo, valor, quebra }: { rotulo: string; valor: string | null | undefined; quebra?: boolean }) {
  if (!valor || !String(valor).trim()) return null;
  return (
    <div className="flex gap-3 px-4 py-3">
      <dt className="w-32 shrink-0 text-muted-foreground">{rotulo}</dt>
      <dd className={cn("min-w-0 flex-1 text-right font-medium", quebra ? "break-words" : "truncate")}>{valor}</dd>
    </div>
  );
}

function ContatoTile({
  href,
  icon: Icon,
  label,
  external,
  tone,
}: {
  href: string | null;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  external?: boolean;
  tone?: string;
}) {
  const cls = "flex min-h-[4.25rem] flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card px-1 text-xs font-medium";
  if (!href) {
    return (
      <span className={cn(cls, "opacity-40")} title="Não cadastrado">
        <Icon className="h-5 w-5" />
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(cls, "transition-colors hover:bg-muted/50 active:scale-[0.98]")}
    >
      <Icon className={cn("h-5 w-5", tone)} />
      {label}
    </a>
  );
}
