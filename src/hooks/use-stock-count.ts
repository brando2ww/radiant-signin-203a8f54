/**
 * Contagem de estoque.
 *
 * Dois lados no mesmo arquivo porque são o mesmo domínio:
 *  - o gestor (autenticado) abre a contagem, acompanha e aplica os ajustes;
 *  - o operador (sem login) entra pelo link com senha e conta.
 *
 * O lado do operador nunca toca as tabelas: tudo passa por funções
 * SECURITY DEFINER, que é o que permite o acesso anônimo sem abrir o estoque
 * inteiro para a internet.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { toast } from "sonner";

const rpc = supabase.rpc.bind(supabase) as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface StockCount {
  id: string;
  name: string;
  status: "aberta" | "fechada" | "aplicada" | "cancelada";
  blind: boolean;
  sectors: string[] | null;
  opened_at: string;
  closed_at: string | null;
  applied_at: string | null;
}

export interface StockCountItem {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  sector: string | null;
  category: string | null;
  expected_qty: number;
  unit_cost: number;
  pack_size: number | null;
  counted_qty: number | null;
  counted_by: string | null;
  counted_at: string | null;
}

/** Item como o operador recebe: sem custo, e sem o esperado na contagem cega. */
export interface CounterItem {
  id: string;
  name: string;
  unit: string;
  sector: string | null;
  category: string | null;
  pack_size: number | null;
  counted_qty: number | null;
  counted_packs: number | null;
  counted_loose: number | null;
  counted_by: string | null;
  expected_qty: number | null;
}

export interface CounterSession {
  session_token: string;
  count_name: string;
  label: string;
  blind: boolean;
  expires_at: string;
  items: CounterItem[];
}

export interface NewCountLink {
  label: string;
  password: string;
  sectors?: string[] | null;
}

// ---------------------------------------------------------------------------
// Gestor
// ---------------------------------------------------------------------------

export function useStockCounts() {
  const { visibleUserId: ownerId } = useEstablishmentId();
  return useQuery({
    queryKey: ["stock-counts", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pdv_stock_counts")
        .select("*")
        .eq("user_id", ownerId!)
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as StockCount[];
    },
  });
}

/**
 * Itens de uma contagem, com atualização em tempo real.
 *
 * É o que faz o gestor ver a contagem acontecendo sem recarregar — e é o que
 * permite perceber, no meio, que alguém está contando o setor errado.
 */
export function useStockCountItems(countId?: string) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["stock-count-items", countId],
    enabled: !!countId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pdv_stock_count_items")
        .select("*")
        .eq("count_id", countId!)
        .order("sector", { nullsFirst: false })
        .order("ingredient_name");
      if (error) throw error;
      return (data ?? []) as unknown as StockCountItem[];
    },
  });

  useEffect(() => {
    if (!countId) return;
    const canal = supabase
      .channel(`stock-count-${countId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pdv_stock_count_items",
          filter: `count_id=eq.${countId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["stock-count-items", countId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [countId, qc]);

  return query;
}

/** Quem contou nos últimos minutos. Presença, não histórico. */
export function useStockCountSessions(countId?: string) {
  return useQuery({
    queryKey: ["stock-count-sessions", countId],
    enabled: !!countId,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pdv_stock_count_sessions")
        .select("id, counter_name, started_at, last_seen_at")
        .eq("count_id", countId!)
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateStockCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      name: string;
      links: NewCountLink[];
      sectors?: string[] | null;
      categories?: string[] | null;
      blind?: boolean;
      expiresHours?: number;
    }) => {
      const { data, error } = await rpc("pdv_stock_count_create", {
        _name: v.name,
        _links: v.links,
        _sectors: v.sectors ?? null,
        _categories: v.categories ?? null,
        _blind: v.blind ?? true,
        _expires_hours: v.expiresHours ?? 24,
      });
      if (error) throw error;
      return data as unknown as {
        count_id: string;
        items: number;
        links: Array<{ label: string; token: string }>;
      };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["stock-counts"] });
      toast.success(`Contagem aberta com ${r.items} insumos.`);
    },
    onError: (e: any) => toast.error(traduzErro(e?.message)),
  });
}

export function useApplyStockCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (countId: string) => {
      const { data, error } = await rpc("pdv_stock_count_apply", { _count_id: countId });
      if (error) throw error;
      return data as unknown as { ajustes: number; impacto_valor: number };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["stock-counts"] });
      qc.invalidateQueries({ queryKey: ["stock-count-items"] });
      qc.invalidateQueries({ queryKey: ["pdv-ingredients"] });
      toast.success(`${r.ajustes} ajuste(s) aplicado(s) no estoque.`);
    },
    onError: (e: any) => toast.error(traduzErro(e?.message)),
  });
}

export function useCloseStockCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (countId: string) => {
      const { error } = await supabase
        .from("pdv_stock_counts")
        .update({ status: "fechada", closed_at: new Date().toISOString() })
        .eq("id", countId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-counts"] });
      toast.success("Contagem fechada. Revise as divergências antes de aplicar.");
    },
    onError: () => toast.error("Não foi possível fechar a contagem."),
  });
}

// ---------------------------------------------------------------------------
// Operador (sem login)
// ---------------------------------------------------------------------------

export async function abrirContagem(
  token: string,
  password: string,
  counterName?: string,
): Promise<CounterSession> {
  const { data, error } = await rpc("pdv_stock_count_open", {
    _token: token,
    _password: password,
    _counter_name: counterName ?? null,
  });
  if (error) throw new Error(traduzErro(error.message));
  return data as unknown as CounterSession;
}

export async function salvarItem(args: {
  sessionToken: string;
  itemId: string;
  packs?: number | null;
  loose?: number | null;
  qty?: number | null;
  notes?: string | null;
}): Promise<number> {
  const { data, error } = await rpc("pdv_stock_count_save", {
    _session_token: args.sessionToken,
    _item_id: args.itemId,
    _packs: args.packs ?? null,
    _loose: args.loose ?? null,
    _qty: args.qty ?? null,
    _notes: args.notes ?? null,
  });
  if (error) throw new Error(traduzErro(error.message));
  return (data as any)?.counted_qty ?? 0;
}

export async function pingContagem(sessionToken: string): Promise<void> {
  await rpc("pdv_stock_count_ping", { _session_token: sessionToken });
}

/** Códigos das funções em português de quem está com a prancheta na mão. */
export function traduzErro(msg?: string): string {
  const m = String(msg ?? "");
  if (m.includes("invalid_credentials")) return "Link ou senha incorretos.";
  if (m.includes("too_many_attempts")) return "Muitas tentativas. Aguarde 5 minutos.";
  if (m.includes("link_expired")) return "Este link expirou. Peça um novo ao gestor.";
  if (m.includes("count_closed")) return "Esta contagem já foi encerrada.";
  if (m.includes("invalid_session")) return "Sua sessão expirou. Entre no link de novo.";
  if (m.includes("negative_quantity")) return "A quantidade não pode ser negativa.";
  if (m.includes("no_ingredients_in_scope")) return "Nenhum insumo se encaixa nesse filtro.";
  if (m.includes("password_required")) return "Defina uma senha para cada link.";
  if (m.includes("already_applied")) return "Os ajustes desta contagem já foram aplicados.";
  return "Não foi possível concluir. Tente de novo.";
}
