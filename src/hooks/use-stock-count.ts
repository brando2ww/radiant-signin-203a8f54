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
  /** Código de barras congelado na abertura, para o leitor casar sem consultar insumos. */
  ean: string | null;
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

export interface StockCountLink {
  id: string;
  label: string;
  token: string;
  sectors: string[] | null;
  expires_at: string;
  locked_until: string | null;
}

/** Links de uma contagem, para reenviar sem ter que abrir outra. */
export function useStockCountLinks(countId?: string) {
  return useQuery({
    queryKey: ["stock-count-links", countId],
    enabled: !!countId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pdv_stock_count_links")
        // password_hash de fora, sempre: a coluna existe mas não tem por que
        // trafegar até o navegador.
        .select("id, label, token, sectors, expires_at, locked_until")
        .eq("count_id", countId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as StockCountLink[];
    },
  });
}

/**
 * Nova senha para um link existente.
 *
 * O hash não é reversível — de propósito. Sem isto, perder a senha custava a
 * contagem inteira: o gestor teria que abrir outra e descartar o que já tinha
 * sido contado.
 */
export function useResetStockCountLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { linkId: string; password: string; expiresHours?: number }) => {
      const { data, error } = await rpc("pdv_stock_count_reset_link", {
        _link_id: v.linkId,
        _password: v.password,
        _expires_hours: v.expiresHours ?? 24,
      });
      if (error) throw error;
      return data as unknown as { token: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-count-links"] });
      toast.success("Senha trocada. O link continua o mesmo.");
    },
    onError: (e: any) => toast.error(traduzErro(e?.message)),
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

/**
 * Liga e desliga a contagem cega numa contagem já aberta.
 *
 * A cega existe porque quem vê o saldo do sistema tende a confirmá-lo em vez
 * de contar. Mas há casos em que ver ajuda — conferência dirigida, insumo de
 * unidade confusa — e obrigar a recriar a contagem só para trocar isso custaria
 * o que já foi contado.
 *
 * Quem já está com o link aberto precisa recarregar: a lista foi entregue ao
 * aparelho no momento da entrada.
 */
/**
 * Exclui uma contagem.
 *
 * Contagem já aplicada não é excluída: os saldos foram corrigidos e os
 * movimentos de ajuste guardam só o NOME da contagem, não uma referência.
 * Apagá-la deixaria o ajuste no estoque sem nada que o explique. A função do
 * banco recusa, e a tela oferece cancelar no lugar.
 */
export function useDeleteStockCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (countId: string) => {
      const { data, error } = await rpc("pdv_stock_count_delete", { _count_id: countId });
      if (error) throw error;
      return data as unknown as { deleted: boolean; counted_items: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-counts"] });
      qc.invalidateQueries({ queryKey: ["stock-count-history"] });
      toast.success("Contagem excluída.");
    },
    onError: (e: any) => toast.error(traduzErro(e?.message)),
  });
}

/** Cancela sem apagar: preserva o rastro de uma contagem já aplicada. */
export function useCancelStockCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (countId: string) => {
      const { error } = await supabase
        .from("pdv_stock_counts")
        .update({ status: "cancelada" })
        .eq("id", countId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-counts"] });
      toast.success("Contagem cancelada.");
    },
    onError: () => toast.error("Não foi possível cancelar a contagem."),
  });
}

export function useToggleBlind() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { countId: string; blind: boolean }) => {
      const { error } = await supabase
        .from("pdv_stock_counts")
        .update({ blind: v.blind })
        .eq("id", v.countId);
      if (error) throw error;
      return v.blind;
    },
    onSuccess: (blind) => {
      qc.invalidateQueries({ queryKey: ["stock-counts"] });
      toast.success(
        blind
          ? "Contagem cega ligada. O operador deixa de ver o estoque."
          : "Estoque do sistema visível. Quem já está contando precisa recarregar o link.",
      );
    },
    onError: () => toast.error("Não foi possível trocar o modo da contagem."),
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

export interface StockCountHistoryRow {
  id: string;
  name: string;
  status: string;
  opened_at: string;
  total: number;
  contados: number;
  exatos: number;
  impacto: number;
  divergencia_absoluta: number;
}

/**
 * Acuracidade entre contagens.
 *
 * A taxa é sobre os itens CONTADOS, não sobre o total: medir sobre o total
 * puniria a contagem parcial duas vezes — uma por não ter contado, outra por
 * "errar" o que nem tentou. A cobertura aparece à parte.
 */
export function useStockCountHistory(limit = 12) {
  const { visibleUserId: ownerId } = useEstablishmentId();
  return useQuery({
    queryKey: ["stock-count-history", ownerId, limit],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await rpc("pdv_stock_count_history", { _limit: limit });
      if (error) throw error;
      return (data as unknown as StockCountHistoryRow[]) ?? [];
    },
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

  // Falha de credencial volta como dado, não como exceção: levantar abortaria a
  // transação e desfaria o incremento do contador de tentativas.
  const r = data as any;
  if (r?.error) throw new Error(traduzErro(r.error));
  return r as CounterSession;
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

/**
 * Códigos das funções em português de quem está com a prancheta na mão.
 *
 * O caso genérico registra o erro cru no console. Sem isso, uma falha
 * inesperada — foi o que aconteceu com o pgcrypto fora do search_path — vira
 * "Não foi possível concluir" e não sobra rastro nenhum para diagnosticar.
 */
export function traduzErro(msg?: string): string {
  const m = String(msg ?? "");
  if (m.includes("invalid_credentials")) return "Link ou senha incorretos.";
  if (m.includes("too_many_attempts")) return "Muitas tentativas. Aguarde 5 minutos.";
  if (m.includes("link_expired")) return "Este link expirou. Peça um novo ao gestor.";
  if (m.includes("count_closed")) return "Esta contagem já foi encerrada.";
  if (m.includes("invalid_session")) return "Sua sessão expirou. Entre no link de novo.";
  if (m.includes("negative_quantity")) return "A quantidade não pode ser negativa.";
  if (m.includes("count_already_applied"))
    return "Esta contagem já ajustou o estoque e não pode ser excluída. Cancele em vez disso.";
  if (m.includes("count_not_found")) return "Contagem não encontrada.";
  // Token que não é uuid: o link foi colado com sujeira junto (a senha, um
  // ponto final). Dizer isso é mais útil que "tente de novo".
  if (m.includes("invalid input syntax") || m.includes("uuid"))
    return "O link parece incompleto ou colado junto com outro texto. Abra usando só o endereço.";
  if (m.includes("link_not_found")) return "Este link não existe mais.";
  if (m.includes("no_ingredients_in_scope")) return "Nenhum insumo se encaixa nesse filtro.";
  if (m.includes("password_required")) return "Defina uma senha para cada link.";
  if (m.includes("already_applied")) return "Os ajustes desta contagem já foram aplicados.";
  if (m) console.error("[contagem] erro não traduzido:", m);
  return "Não foi possível concluir. Tente de novo.";
}
