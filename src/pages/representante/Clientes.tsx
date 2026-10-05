import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin, MessageCircle, Phone, Search, UserPlus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ClienteDialog } from "@/components/vendas/clientes/ClienteDialog";
import { useRepContext } from "@/components/vendas/rep/RepContext";
import { initials, normalizeSearch, onlyDigits, telHref, whatsappHref } from "@/components/vendas/rep/rep-utils";
import { useRepClientes, type RepClienteLista } from "@/hooks/use-vendas-rep-clientes";
import { cn } from "@/lib/utils";

const nomeDe = (c: RepClienteLista) => c.trade_name?.trim() || c.name;

/** Carteira do representante: busca, ligar e WhatsApp a um toque. */
export default function RepClientes() {
  const { ownerId, repId, rep, isPreview } = useRepContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);
  const { data: clientes = [], isLoading, isError, refetch } = useRepClientes(ownerId, repId);

  const filtrados = useMemo(() => {
    const t = normalizeSearch(busca);
    if (!t) return clientes;
    const dig = onlyDigits(busca);
    return clientes.filter((c) => {
      const texto = normalizeSearch(
        [c.name, c.trade_name, c.company_name, c.contact_name, c.city, c.district, c.email].filter(Boolean).join(" "),
      );
      if (texto.includes(t)) return true;
      if (dig.length >= 3) {
        return [c.cnpj, c.cpf, c.phone, c.whatsapp].some((v) => onlyDigits(v).includes(dig));
      }
      return false;
    });
  }, [clientes, busca]);

  return (
    <div className="space-y-4 px-4 py-5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{isPreview && !rep ? "Clientes" : "Meus clientes"}</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Carregando..."
              : `${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"}${isPreview && !rep ? " B2B" : " na carteira"}`}
          </p>
        </div>
        <Button onClick={() => setNovo(true)} className="h-11 shrink-0 rounded-full px-4">
          <UserPlus className="mr-1.5 h-4 w-4" />
          Novo
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, cidade ou CNPJ"
          className="h-12 rounded-xl pl-10 pr-10 text-base"
          inputMode="search"
          enterKeyHint="search"
          aria-label="Buscar cliente"
        />
        {busca && (
          <button
            type="button"
            onClick={() => setBusca("")}
            aria-label="Limpar busca"
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Não foi possível carregar os clientes.{" "}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>
            Tentar de novo
          </button>
        </div>
      ) : clientes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Users className="h-7 w-7 text-muted-foreground" />
          </span>
          <p className="font-medium">Sua carteira ainda está vazia</p>
          <p className="text-sm text-muted-foreground">Cadastre o primeiro cliente para montar propostas para ele.</p>
          <Button onClick={() => setNovo(true)} className="mt-1 h-11 rounded-full px-5">
            <UserPlus className="mr-1.5 h-4 w-4" />
            Cadastrar cliente
          </Button>
        </div>
      ) : filtrados.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nenhum cliente encontrado para "{busca}".</p>
      ) : (
        <ul className="space-y-2.5">
          {filtrados.map((c) => (
            <ClienteCard key={c.id} c={c} />
          ))}
        </ul>
      )}

      <ClienteDialog
        open={novo}
        onOpenChange={setNovo}
        mode={isPreview ? "gestao" : "representante"}
        onSaved={(c) => {
          qc.invalidateQueries({ queryKey: ["vendas-rep-clientes"] });
          if (c?.id) navigate(`/representante/clientes/${c.id}`);
        }}
      />
    </div>
  );
}

function ClienteCard({ c }: { c: RepClienteLista }) {
  const nome = nomeDe(c);
  const cidade = [c.city, c.state].filter(Boolean).join("/");
  const tel = telHref(c.phone || c.whatsapp);
  const zap = whatsappHref(c.whatsapp || c.phone);
  const sub = c.company_name && c.company_name.trim() !== nome ? c.company_name : c.contact_name;

  return (
    <li className="flex items-center gap-2 rounded-2xl border bg-card pr-2 shadow-sm">
      <Link
        to={`/representante/clientes/${c.id}`}
        className="flex min-h-[76px] min-w-0 flex-1 items-center gap-3 rounded-l-2xl py-3 pl-3 transition-colors hover:bg-muted/40 active:bg-muted"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {initials(nome)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{nome}</span>
          {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
          {cidade && (
            <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{cidade}</span>
            </span>
          )}
        </span>
      </Link>
      <ContatoBotao href={tel} label={`Ligar para ${nome}`} className="text-foreground">
        <Phone className="h-5 w-5" />
      </ContatoBotao>
      <ContatoBotao href={zap} label={`WhatsApp de ${nome}`} external className="text-emerald-600 dark:text-emerald-400">
        <MessageCircle className="h-5 w-5" />
      </ContatoBotao>
    </li>
  );
}

function ContatoBotao({
  href,
  label,
  external,
  className,
  children,
}: {
  href: string | null;
  label: string;
  external?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const base = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-background transition-colors";
  if (!href) {
    return (
      <span aria-label={`${label} (sem número)`} title="Sem número cadastrado" className={cn(base, "opacity-30")}>
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(base, "hover:bg-muted active:scale-95", className)}
    >
      {children}
    </a>
  );
}
