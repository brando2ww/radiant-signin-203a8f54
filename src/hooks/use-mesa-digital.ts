import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

/**
 * Mesa Digital: pedido pelo QR code da mesa.
 *
 * O cliente da mesa é anônimo e só fala com o banco pelas funções mesa_*
 * (token do QR + token da sessão). Preço, sub-itens da cozinha e validação
 * das etapas são do servidor. Ver docs/modulo-mesa/PLANO.md.
 */

const rpc = (fn: string, args: Record<string, unknown>) => (supabase as any).rpc(fn, args);

// ── tipos do que o servidor devolve ─────────────────────────────────────────

export interface MesaRestaurante {
  nome: string;
  logo_url: string | null;
  capa_url: string | null;
  cor: string | null;
  cor2: string | null;
}

export interface MesaAbertura {
  error?: string;
  restaurante: MesaRestaurante;
  mensagem: string | null;
  tipo: "mesa" | "geral";
  mesa: { id: string; numero: string } | null;
  mesas: { id: string; numero: string }[] | null;
  caixa_aberto: boolean;
  taxa_servico: number | null;
}

export interface MesaGrupo {
  id: string;
  nome: string;
  tipo: "single" | "multiple";
  obrigatorio: boolean;
  min: number;
  max: number;
  quantidade?: boolean; // etapa que aceita repetir o mesmo item
  itens: { id: string; nome: string; foto?: string | null; preco?: number }[];
}

export interface MesaProduto {
  id: string;
  nome: string;
  descricao: string | null;
  foto: string | null;
  preco: number;
  serve: number | null;
  etapas: MesaGrupo[];
  opcoes: MesaGrupo[];
}

export interface MesaCardapio {
  error?: string;
  categorias: { nome: string; produtos: MesaProduto[] }[];
}

export interface MesaItemConta {
  id: string;
  nome: string;
  quantidade: number;
  preco: number;
  subtotal: number;
  obs: string | null;
  enviado: boolean;
  pelo_qr: boolean;
  hora: string;
  subitens: string[];
}

export interface MesaEstado {
  error?: string;
  status: "ativa" | "conta_pedida" | "encerrada";
  nome: string;
  mesa: string;
  comanda_status: string;
  comanda_numero?: string;
  itens: MesaItemConta[];
  subtotal: number;
  taxa_servico: number;
  total: number;
  chamado_aberto: boolean;
  conta_pedida: boolean;
}

/** Uma comanda aberta na mesa, para quem lê o QR escolher onde entrar (20/10/2026). */
export interface MesaComanda {
  id: string;
  numero: string;
  /** Nome curto de quem abriu ("Felipe", "Ana S."); vazio quando a comanda foi aberta sem nome. */
  nome: string | null;
  itens: number;
  total: number;
  /** Já pediu a conta: aparece na lista, mas não dá para entrar. */
  fechando: boolean;
}

export interface MesaComandas {
  error?: string;
  mesa: { id: string; numero: string };
  comandas: MesaComanda[];
}

/** O que vai para mesa_pedir: só ids e quantidades. Nome e preço são do servidor. */
export interface MesaItemPedido {
  product_id: string;
  quantity: number;
  notes?: string;
  selected_options: { optionId: string; items: { itemId: string }[] }[];
}

// ── chamadas do cliente (anônimo) ───────────────────────────────────────────

export async function mesaAbrir(token: string): Promise<MesaAbertura> {
  const { data, error } = await rpc("mesa_abrir", { p_token: token });
  if (error) throw error;
  return data as MesaAbertura;
}

export async function mesaCardapio(token: string): Promise<MesaCardapio> {
  const { data, error } = await rpc("mesa_cardapio", { p_token: token });
  if (error) throw error;
  return data as MesaCardapio;
}

/** As comandas abertas da mesa (a do QR ou, no QR geral, a escolhida). */
export async function mesaComandas(token: string, mesaId: string | null): Promise<MesaComandas> {
  const { data, error } = await rpc("mesa_comandas", { p_token: token, p_table_id: mesaId });
  if (error) throw error;
  return data as MesaComandas;
}

/**
 * Entra na mesa. `escolha`: entrar numa comanda da lista (`comandaId`) ou abrir uma comanda nova (`nova`); sem
 * escolha, o servidor faz o de antes (primeira comanda aberta da mesa).
 */
export async function mesaEntrar(
  token: string,
  mesaId: string | null,
  nome: string,
  celular: string,
  escolha?: { comandaId?: string; nova?: boolean },
): Promise<{ error?: string; sessao?: string; nome?: string; mesa?: string }> {
  const { data, error } = await rpc("mesa_entrar", {
    p_token: token,
    p_table_id: mesaId,
    p_nome: nome,
    p_celular: celular,
    p_user_agent: navigator.userAgent,
    ...(escolha?.comandaId ? { p_comanda_id: escolha.comandaId } : {}),
    ...(escolha?.nova ? { p_nova: true } : {}),
  });
  if (error) throw error;
  return data;
}

export async function mesaEstado(sessao: string): Promise<MesaEstado> {
  const { data, error } = await rpc("mesa_estado", { p_sessao: sessao });
  if (error) throw error;
  return data as MesaEstado;
}

export async function mesaPedir(
  sessao: string,
  itens: MesaItemPedido[],
  chave: string,
): Promise<{ ok?: boolean; error?: string; detalhe?: string | null; total?: number }> {
  const { data, error } = await rpc("mesa_pedir", { p_sessao: sessao, p_itens: itens, p_chave: chave });
  if (error) throw error;
  return data;
}

export async function mesaChamar(sessao: string): Promise<{ ok?: boolean; error?: string }> {
  const { data, error } = await rpc("mesa_chamar", { p_sessao: sessao });
  if (error) throw error;
  return data;
}

export async function mesaFecharConta(sessao: string): Promise<MesaEstado> {
  const { data, error } = await rpc("mesa_fechar_conta", { p_sessao: sessao });
  if (error) throw error;
  return data as MesaEstado;
}

/** Mensagem para o cliente, a partir do código que o servidor devolve. */
export function traduzErroMesa(codigo?: string, detalhe?: string | null): string {
  switch (codigo) {
    case "qr_invalido":
      return "Este QR code não é válido. Peça ajuda ao garçom.";
    case "qr_desativado":
      return "Este QR code foi desativado. Peça ajuda ao garçom.";
    case "modulo_inativo":
      return "O pedido pelo QR code não está disponível neste restaurante.";
    case "caixa_fechado":
      return "No momento os pedidos são feitos com o garçom.";
    case "nome_invalido":
      return "Informe seu nome.";
    case "celular_invalido":
      return "Informe um celular válido, com DDD.";
    case "mesa_invalida":
      return "Escolha a sua mesa.";
    case "conta_em_fechamento":
      return "A conta desta mesa já está sendo fechada. Chame o garçom.";
    case "comanda_fechando":
      return "Essa comanda já pediu a conta. Escolha outra ou abra uma comanda nova.";
    case "comanda_invalida":
      return "Essa comanda não está mais aberta. Escolha outra ou abra uma comanda nova.";
    case "muitas_tentativas":
      return "Muitas tentativas em pouco tempo. Aguarde um instante.";
    case "sessao_invalida":
    case "sessao_encerrada":
      return "Sua mesa foi encerrada. Leia o QR code de novo para começar.";
    case "conta_pedida":
      return "A conta já foi pedida. Para pedir mais, chame o garçom.";
    case "pedido_vazio":
      return "O pedido está vazio.";
    case "pedido_grande_demais":
      return "Pedido grande demais. Envie em partes.";
    case "quantidade_invalida":
      return "Quantidade inválida.";
    case "produto_indisponivel":
      return "Um dos produtos não está mais disponível. Atualize o cardápio.";
    case "escolha_invalida":
      return detalhe ? `Revise as escolhas de "${detalhe}".` : "Revise as escolhas do pedido.";
    case "escolha_indisponivel":
      return detalhe ? `Uma opção de "${detalhe}" acabou. Escolha outra.` : "Uma opção acabou. Escolha outra.";
    case "muitos_pedidos":
      return "Muitos pedidos em pouco tempo. Chame o garçom.";
    case "sem_itens":
      return "Ainda não há nada pedido nesta mesa.";
    default:
      return "Não foi possível concluir. Tente de novo ou chame o garçom.";
  }
}

// ── sessão guardada no aparelho do cliente ──────────────────────────────────

const chaveSessao = (token: string) => `velara-mesa:${token}`;

export function lerSessaoMesa(token: string): string | null {
  try {
    return localStorage.getItem(chaveSessao(token));
  } catch {
    return null;
  }
}
export function salvarSessaoMesa(token: string, sessao: string) {
  try {
    localStorage.setItem(chaveSessao(token), sessao);
  } catch {
    /* navegador sem armazenamento: a sessão vale só enquanto a página está aberta */
  }
}
export function limparSessaoMesa(token: string) {
  try {
    localStorage.removeItem(chaveSessao(token));
  } catch {
    /* nada a fazer */
  }
}

// ── equipe (logada) ─────────────────────────────────────────────────────────

export interface MesaConfig {
  user_id: string;
  tipo_qr: "por_mesa" | "geral";
  mensagem_boas_vindas: string | null;
  mostrar_taxa_servico: boolean;
  sessao_horas: number;
}

export interface MesaQr {
  id: string;
  tipo: "mesa" | "geral";
  table_id: string | null;
  token: string;
  ativo: boolean;
  criado_em: string;
}

export interface MesaChamado {
  id: string;
  table_id: string;
  tipo: "garcom" | "conta";
  status: "aberto" | "atendido";
  criado_em: string;
  mesa?: string;
  nome?: string | null;
}

export const urlDoQr = (token: string) => `${window.location.origin}/m/${token}`;

export function useMesaConfig() {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["mesa-config", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<MesaConfig | null> => {
      const { data, error } = await (supabase as any)
        .from("mesa_config")
        .select("*")
        .eq("user_id", visibleUserId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const salvar = useMutation({
    mutationFn: async (dados: Partial<MesaConfig>) => {
      const { error } = await (supabase as any)
        .from("mesa_config")
        .upsert({ user_id: visibleUserId, ...dados, atualizado_em: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mesa-config"] }),
  });
  return { config: query.data, isLoading: query.isLoading, salvar };
}

export function useMesaQrCodes() {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["mesa-qr-codes", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<MesaQr[]> => {
      const { data, error } = await (supabase as any)
        .from("mesa_qr_codes")
        .select("id, tipo, table_id, token, ativo, criado_em")
        .eq("user_id", visibleUserId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const gerar = useMutation({
    mutationFn: async (tableId: string | null) => {
      const { data, error } = await rpc("mesa_gerar_qr", { p_table_id: tableId });
      if (error) throw error;
      return data as MesaQr;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mesa-qr-codes"] }),
  });
  const definirAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await rpc("mesa_definir_qr_ativo", { p_qr_id: id, p_ativo: ativo });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mesa-qr-codes"] }),
  });
  return { qrs: query.data ?? [], isLoading: query.isLoading, gerar, definirAtivo };
}

/** Chamados abertos (chamar garçom, pedir conta), ao vivo. */
export function useMesaChamados(ativo: boolean) {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();
  const queryKey = ["mesa-chamados", visibleUserId];

  const query = useQuery({
    queryKey,
    enabled: ativo && !!visibleUserId,
    refetchInterval: 30_000, // rede de segurança se o realtime cair
    queryFn: async (): Promise<MesaChamado[]> => {
      const { data, error } = await (supabase as any)
        .from("mesa_chamados")
        .select("id, table_id, tipo, status, criado_em, mesa:pdv_tables(table_number), sessao:mesa_sessoes(nome)")
        .eq("user_id", visibleUserId)
        .eq("status", "aberto")
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        id: c.id,
        table_id: c.table_id,
        tipo: c.tipo,
        status: c.status,
        criado_em: c.criado_em,
        mesa: c.mesa?.table_number,
        nome: c.sessao?.nome ?? null,
      }));
    },
  });

  useEffect(() => {
    if (!ativo || !visibleUserId) return;
    const canal = supabase
      .channel(`mesa-chamados-${visibleUserId}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "mesa_chamados", filter: `user_id=eq.${visibleUserId}` },
        () => qc.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, visibleUserId]);

  const atender = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await rpc("mesa_atender_chamado", { p_chamado_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { chamados: query.data ?? [], atender };
}
