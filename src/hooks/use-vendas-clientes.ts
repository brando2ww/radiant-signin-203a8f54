import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import type { VendasCliente, VendasRepresentante } from "@/lib/vendas/types";

/**
 * Força de vendas · clientes B2B (tabela pdv_customers com os campos de empresa).
 * O banco já recorta: o representante só enxerga e grava clientes da carteira dele; o cliente que ele cadastra entra na
 * carteira dele sozinho (gatilho vendas_cliente_novo). Dono e equipe veem todos.
 */

const PAGINA = 1000; // o PostgREST corta em 1000 linhas: busca em páginas para não perder cliente

async function buscarTodos(ownerId: string, incluirBalcao: boolean): Promise<VendasCliente[]> {
  const todos: VendasCliente[] = [];
  for (let de = 0; ; de += PAGINA) {
    let q = supabase
      .from("pdv_customers" as any)
      .select("*")
      .eq("user_id", ownerId)
      .order("name")
      .order("id")
      .range(de, de + PAGINA - 1);
    if (!incluirBalcao) q = q.eq("is_b2b", true);
    const { data, error } = await q;
    if (error) throw error;
    const linhas = (data ?? []) as unknown as VendasCliente[];
    todos.push(...linhas);
    if (linhas.length < PAGINA) break;
  }
  return todos.map(normalizarCliente);
}

export function normalizarCliente(c: any): VendasCliente {
  return {
    ...c,
    credit_limit: c.credit_limit == null ? null : Number(c.credit_limit),
    is_b2b: !!c.is_b2b,
  } as VendasCliente;
}

/** Lista de clientes do estabelecimento. Por padrão só os B2B; `incluirBalcao` traz também os do PDV. */
export function useVendasClientes(opts: { incluirBalcao?: boolean } = {}) {
  const { visibleUserId } = useEstablishmentId();
  const incluirBalcao = !!opts.incluirBalcao;
  const query = useQuery({
    queryKey: ["vendas-clientes", visibleUserId, incluirBalcao],
    queryFn: () => buscarTodos(visibleUserId!, incluirBalcao),
    enabled: !!visibleUserId,
  });
  return { ...query, clientes: query.data ?? [] };
}

export function useVendasCliente(id: string | undefined) {
  const { visibleUserId } = useEstablishmentId();
  const query = useQuery({
    queryKey: ["vendas-cliente", visibleUserId, id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pdv_customers" as any)
        .select("*")
        .eq("id", id!)
        .eq("user_id", visibleUserId!)
        .maybeSingle();
      if (error) throw error;
      return data ? normalizarCliente(data) : null;
    },
    enabled: !!visibleUserId && !!id,
  });
  return { ...query, cliente: query.data ?? null };
}

/** Representantes do estabelecimento (para os seletores da gestão). */
export function useVendasRepresentantesLista(opts: { somenteAtivos?: boolean } = {}) {
  const { visibleUserId } = useEstablishmentId();
  const somenteAtivos = opts.somenteAtivos ?? false;
  const query = useQuery({
    queryKey: ["vendas-representantes-lista", visibleUserId, somenteAtivos],
    queryFn: async () => {
      let q = supabase
        .from("vendas_representantes" as any)
        .select("*")
        .eq("user_id", visibleUserId!)
        .order("name");
      if (somenteAtivos) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as VendasRepresentante[];
    },
    enabled: !!visibleUserId,
  });
  return { ...query, representantes: query.data ?? [] };
}

export type ClienteGravar = Partial<Omit<VendasCliente, "id" | "user_id" | "created_at">>;

/** Cria ou atualiza o cliente e devolve a linha gravada. */
export function useSalvarVendasCliente() {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dados }: { id?: string | null; dados: ClienteGravar }) => {
      if (!visibleUserId) throw new Error("Estabelecimento não identificado.");
      if (id) {
        const { data, error } = await supabase
          .from("pdv_customers" as any)
          .update(dados as any)
          .eq("id", id)
          .select("*")
          .single();
        if (error) throw error;
        return normalizarCliente(data);
      }
      const { data, error } = await supabase
        .from("pdv_customers" as any)
        .insert({ ...dados, user_id: visibleUserId } as any)
        .select("*")
        .single();
      if (error) throw error;
      return normalizarCliente(data);
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["vendas-clientes"] });
      qc.invalidateQueries({ queryKey: ["vendas-cliente", visibleUserId, c.id] });
      qc.invalidateQueries({ queryKey: ["pdv-customers"] });
    },
  });
}

/** Troca o representante de vários clientes de uma vez (null = sem representante). */
export function useTrocarRepresentante() {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, representanteId }: { ids: string[]; representanteId: string | null }) => {
      if (!visibleUserId || ids.length === 0) return 0;
      let total = 0;
      for (let i = 0; i < ids.length; i += 200) {
        const lote = ids.slice(i, i + 200);
        const { data, error } = await supabase
          .from("pdv_customers" as any)
          .update({ representative_id: representanteId } as any)
          .eq("user_id", visibleUserId)
          .in("id", lote)
          .select("id");
        if (error) throw error;
        total += data?.length ?? 0;
      }
      return total;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendas-clientes"] });
      qc.invalidateQueries({ queryKey: ["vendas-cliente"] });
    },
  });
}

/**
 * Outro cliente do estabelecimento com o mesmo CNPJ/CPF (para não cadastrar duas vezes). Pergunta ao banco
 * (vendas_cliente_documento), que enxerga além da carteira do representante: `visivel: false` quando o cliente existe
 * mas é de outra carteira. Se a função não responder, cai na busca direta (que só vê o que a pessoa pode ver).
 */
export async function buscarClienteMesmoDocumento(
  ownerId: string,
  documento: string,
  ignorarId?: string | null,
): Promise<{ id?: string; name?: string; visivel: boolean } | null> {
  const digitos = documento.replace(/\D/g, "");
  if (digitos.length !== 11 && digitos.length !== 14) return null;
  const { data, error } = await supabase.rpc("vendas_cliente_documento" as any, {
    p_documento: digitos,
    p_ignorar: ignorarId ?? null,
  });
  if (!error) {
    const r = data as { existe?: boolean; visivel?: boolean; id?: string; name?: string } | null;
    return r?.existe ? { id: r.id, name: r.name, visivel: !!r.visivel } : null;
  }
  const campo = digitos.length === 14 ? "cnpj" : "cpf";
  const mascarado =
    campo === "cnpj"
      ? digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
      : digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  let q = supabase
    .from("pdv_customers" as any)
    .select("id, name")
    .eq("user_id", ownerId)
    .in(campo, [digitos, mascarado])
    .limit(1);
  if (ignorarId) q = q.neq("id", ignorarId);
  const { data: linhas } = await q;
  const linha = (linhas as any[] | null)?.[0];
  return linha ? { id: linha.id, name: linha.name, visivel: true } : null;
}
