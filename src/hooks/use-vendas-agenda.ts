/**
 * Força de vendas · agenda de compromissos (vendas_agenda).
 *
 * O banco decide quem vê o quê: a gestão (dono, gerente, financeiro) vê a agenda da empresa inteira e o representante
 * só a dele. Na inclusão feita por representante o banco preenche o representante e recusa cliente fora da carteira;
 * a troca de cliente e o vínculo com proposta passam pela mesma regra (20261005133000_vendas_agenda_vinculos.sql).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import type { AgendaTipo, PropostaStatus, VendasAgendaItem } from "@/lib/vendas/types";

export type AgendaCliente = {
  id: string;
  name: string;
  trade_name: string | null;
  company_name: string | null;
  cnpj: string | null;
  phone: string | null;
  whatsapp: string | null;
  cep: string | null;
  street: string | null;
  address_number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  representative_id: string | null;
};

export type AgendaCompromisso = VendasAgendaItem & {
  customer: Pick<AgendaCliente, "id" | "name" | "trade_name" | "company_name" | "city" | "state" | "phone" | "whatsapp"> | null;
  representante: { id: string; name: string } | null;
  proposta: { id: string; number: string; status: PropostaStatus; total: number } | null;
};

export type AgendaRepresentante = { id: string; name: string; is_active: boolean };
export type AgendaPropostaOpcao = { id: string; number: string; status: PropostaStatus; total: number; created_at: string };

/** "todos" (sem filtro), "sem" (compromissos sem representante) ou o id de um representante. */
export type FiltroRepresentante = string | null | undefined;

const SELECT_COMPROMISSO =
  "*, customer:pdv_customers(id, name, trade_name, company_name, city, state, phone, whatsapp), " +
  "representante:vendas_representantes(id, name), proposta:vendas_propostas(id, number, status, total)";

const SELECT_CLIENTE =
  "id, name, trade_name, company_name, cnpj, phone, whatsapp, cep, street, address_number, complement, district, city, state, representative_id";

const tabela = (nome: string) => supabase.from(nome as any) as any;

/** O PostgREST corta em 1000 linhas: busca em páginas até acabar. */
async function buscarTudo<T>(montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>) {
  const passo = 1000;
  const linhas: T[] = [];
  for (let de = 0; ; de += passo) {
    const { data, error } = await montar(de, de + passo - 1);
    if (error) throw error;
    const pagina = (data ?? []) as T[];
    linhas.push(...pagina);
    if (pagina.length < passo) break;
  }
  return linhas;
}

function aplicarFiltroRep(q: any, rep: FiltroRepresentante) {
  if (!rep || rep === "todos") return q;
  if (rep === "sem") return q.is("representative_id", null);
  return q.eq("representative_id", rep);
}

/** Mensagem legível para os erros que o banco devolve na agenda. */
export function mensagemErroAgenda(e: unknown): string {
  const err = e as { message?: string; code?: string } | null;
  const msg = err?.message ?? "";
  if (msg.includes("carteira") || msg.includes("não é sua")) return msg;
  if (msg.includes("row-level security") || err?.code === "42501") return "Sem permissão para gravar este compromisso.";
  if (msg.includes("ends_at")) return "O fim não pode ser antes do início.";
  return msg || "Não foi possível salvar.";
}

/** Compromissos com início dentro do período. */
export function useAgendaPeriodo(opts: { de: Date; ate: Date; representativeId?: FiltroRepresentante; enabled?: boolean }) {
  const { visibleUserId } = useEstablishmentId();
  const deIso = opts.de.toISOString();
  const ateIso = opts.ate.toISOString();
  return useQuery({
    queryKey: ["vendas-agenda", visibleUserId, "periodo", deIso, ateIso, opts.representativeId ?? "todos"],
    enabled: !!visibleUserId && opts.enabled !== false,
    // Ao trocar de mês/semana, mantém o período anterior na tela até o novo chegar.
    placeholderData: (anterior: AgendaCompromisso[] | undefined) => anterior,
    queryFn: () =>
      buscarTudo<AgendaCompromisso>((de, ate) =>
        aplicarFiltroRep(
          tabela("vendas_agenda")
            .select(SELECT_COMPROMISSO)
            .eq("user_id", visibleUserId)
            .gte("starts_at", deIso)
            .lte("starts_at", ateIso),
          opts.representativeId,
        )
          .order("starts_at", { ascending: true })
          .order("id", { ascending: true })
          .range(de, ate),
      ),
  });
}

/** Compromissos ainda agendados cujo horário já passou (até 200, os mais recentes primeiro). */
export function useAgendaAtrasados(opts: { representativeId?: FiltroRepresentante; enabled?: boolean } = {}) {
  const { visibleUserId } = useEstablishmentId();
  return useQuery({
    queryKey: ["vendas-agenda", visibleUserId, "atrasados", opts.representativeId ?? "todos"],
    enabled: !!visibleUserId && opts.enabled !== false,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await aplicarFiltroRep(
        tabela("vendas_agenda")
          .select(SELECT_COMPROMISSO)
          .eq("user_id", visibleUserId)
          .eq("status", "scheduled")
          .lt("starts_at", new Date().toISOString()),
        opts.representativeId,
      )
        .order("starts_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AgendaCompromisso[];
    },
  });
}

/** Próximos compromissos agendados, de hoje em diante. */
export function useProximosCompromissos(opts: { limit?: number; representativeId?: string | null } = {}) {
  const { visibleUserId } = useEstablishmentId();
  const limite = opts.limit ?? 5;
  return useQuery({
    queryKey: ["vendas-agenda", visibleUserId, "proximos", limite, opts.representativeId ?? "todos"],
    enabled: !!visibleUserId,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      let q = tabela("vendas_agenda")
        .select(SELECT_COMPROMISSO)
        .eq("user_id", visibleUserId)
        .eq("status", "scheduled")
        .gte("starts_at", startOfDay(new Date()).toISOString());
      if (opts.representativeId) q = q.eq("representative_id", opts.representativeId);
      const { data, error } = await q.order("starts_at", { ascending: true }).limit(limite);
      if (error) throw error;
      return (data ?? []) as AgendaCompromisso[];
    },
  });
}

/** Clientes que quem está logado enxerga (o representante, só os da carteira: quem filtra é o banco). */
export function useAgendaClientes(enabled = true) {
  const { visibleUserId } = useEstablishmentId();
  return useQuery({
    queryKey: ["vendas-agenda", visibleUserId, "clientes"],
    enabled: !!visibleUserId && enabled,
    staleTime: 60 * 1000,
    queryFn: () =>
      buscarTudo<AgendaCliente>((de, ate) =>
        tabela("pdv_customers")
          .select(SELECT_CLIENTE)
          .eq("user_id", visibleUserId)
          .order("name", { ascending: true })
          .order("id", { ascending: true })
          .range(de, ate),
      ),
  });
}

export function useAgendaRepresentantes(enabled = true) {
  const { visibleUserId } = useEstablishmentId();
  return useQuery({
    queryKey: ["vendas-agenda", visibleUserId, "representantes"],
    enabled: !!visibleUserId && enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await tabela("vendas_representantes")
        .select("id, name, is_active")
        .eq("user_id", visibleUserId)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgendaRepresentante[];
    },
  });
}

/** Propostas de um cliente, para ligar ao compromisso (o representante só vê as dele). */
export function useAgendaPropostasDoCliente(customerId: string | null | undefined) {
  const { visibleUserId } = useEstablishmentId();
  return useQuery({
    queryKey: ["vendas-agenda", visibleUserId, "propostas-cliente", customerId],
    enabled: !!visibleUserId && !!customerId,
    queryFn: async () => {
      const { data, error } = await tabela("vendas_propostas")
        .select("id, number, status, total, created_at")
        .eq("user_id", visibleUserId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AgendaPropostaOpcao[];
    },
  });
}

/** Cadastro de representante de quem está logado (null para dono, gerente e financeiro). */
export function useRepresentanteLogado() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["vendas-agenda", "rep-logado", user?.id],
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await tabela("vendas_representantes")
        .select("id, name, is_active")
        .eq("rep_user_id", user!.id)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AgendaRepresentante | null;
    },
  });
}

export type AgendaGravar = {
  id?: string;
  kind: AgendaTipo;
  title: string;
  customer_id: string | null;
  proposta_id: string | null;
  representative_id?: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  notes: string | null;
};

export function useAgendaMutacoes() {
  const qc = useQueryClient();
  const { visibleUserId } = useEstablishmentId();
  const invalidar = () => qc.invalidateQueries({ queryKey: ["vendas-agenda"] });

  const atualizar = async (id: string, campos: Record<string, unknown>) => {
    const { data, error } = await tabela("vendas_agenda").update(campos).eq("id", id).select("id");
    if (error) throw error;
    // Linha que a política esconde não dá erro: só não muda nada.
    if (!data?.length) throw new Error("Sem permissão para alterar este compromisso.");
  };

  const salvar = useMutation({
    mutationFn: async (v: AgendaGravar) => {
      const { id, ...campos } = v;
      // No modo representante o campo não vai: o banco preenche com o representante logado.
      if (campos.representative_id === undefined) delete campos.representative_id;
      if (id) {
        await atualizar(id, campos);
        return id;
      }
      const { data, error } = await tabela("vendas_agenda")
        .insert({ ...campos, user_id: visibleUserId })
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: invalidar,
  });

  const concluir = useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: string | null }) => atualizar(id, { status: "done", outcome }),
    onSuccess: invalidar,
  });

  const cancelar = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string | null }) => atualizar(id, { status: "cancelled", outcome: motivo }),
    onSuccess: invalidar,
  });

  const reabrir = useMutation({
    mutationFn: (id: string) => atualizar(id, { status: "scheduled", outcome: null }),
    onSuccess: invalidar,
  });

  const reagendar = useMutation({
    mutationFn: ({ id, starts_at, ends_at, all_day }: { id: string; starts_at: string; ends_at: string | null; all_day: boolean }) =>
      atualizar(id, { starts_at, ends_at, all_day, status: "scheduled" }),
    onSuccess: invalidar,
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await tabela("vendas_agenda").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Sem permissão para excluir este compromisso.");
    },
    onSuccess: invalidar,
  });

  return { salvar, concluir, cancelar, reabrir, reagendar, excluir };
}
