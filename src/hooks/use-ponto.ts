/**
 * Módulo de Ponto · acesso a dados.
 *
 * Duas portas separadas de propósito:
 *
 *  - O GESTOR fala com as tabelas pelo PostgREST, sob RLS. Ele é usuário
 *    autenticado e enxerga o estabelecimento inteiro.
 *  - O COLABORADOR não fala com tabela nenhuma. Tudo passa por RPC com token
 *    de sessão, porque a RLS deste projeto separa estabelecimento e não
 *    pessoa, e jornada é dado pessoal.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { fetchAll } from "@/lib/reports/fetch-all";

export interface PontoColaborador {
  id: string;
  user_id: string;
  nome: string;
  cpf: string | null;
  cargo: string | null;
  admissao: string | null;
  demissao: string | null;
  tipo_contrato: string;
  ativo: boolean;
  criado_em: string;
}

export interface PontoLocal {
  id: string;
  nome: string;
  latitude: number | null;
  longitude: number | null;
  raio_m: number;
  ativo: boolean;
}

export interface PontoMarcacao {
  id: string;
  colaborador_id: string;
  nsr: number;
  marcado_em: string;
  dentro_raio: boolean | null;
  distancia_m: number | null;
  origem_offline: boolean;
  coletor: string;
  selfie_path: string | null;
  registro_sha256: string;
}

/** Erros das RPCs traduzidos para quem está com o celular na mão. */
export function traduzErroPonto(codigo?: string): string {
  switch (codigo) {
    case "invalid_credentials": return "Link ou senha incorretos.";
    case "too_many_attempts": return "Muitas tentativas. Espere 5 minutos e tente de novo.";
    case "acesso_revogado": return "Este acesso foi desativado. Fale com o gerente.";
    case "colaborador_inativo": return "Seu cadastro está inativo. Fale com o gerente.";
    case "modulo_inativo": return "O ponto não está ativo neste restaurante.";
    case "sessao_expirada": return "Sua sessão expirou. Entre de novo.";
    case "batida_repetida": return "Você acabou de bater. Espere um minuto.";
    default: return "Não foi possível concluir. Tente de novo.";
  }
}

// ── Gestor ────────────────────────────────────────────────────────────────

export function usePontoColaboradores() {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["ponto-colaboradores", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async () =>
      (await fetchAll<PontoColaborador>((de, ate) =>
        supabase
          .from("ponto_colaboradores")
          .select("*")
          .eq("user_id", visibleUserId!)
          .order("nome")
          .order("id")
          .range(de, ate),
      )) as PontoColaborador[],
  });

  const salvar = useMutation({
    mutationFn: async (dados: Partial<PontoColaborador> & { nome: string }) => {
      const payload = { ...dados, user_id: visibleUserId };
      const { data, error } = dados.id
        ? await supabase.from("ponto_colaboradores").update(payload).eq("id", dados.id).select().single()
        : await supabase.from("ponto_colaboradores").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto-colaboradores"] }),
  });

  /**
   * Desligar é DATA, nunca exclusão: apagar colaborador apagaria a prova da
   * jornada dele, que é justamente o que o sistema existe para guardar.
   */
  const desligar = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: string }) => {
      const { error } = await supabase
        .from("ponto_colaboradores")
        .update({ demissao: data, ativo: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto-colaboradores"] }),
  });

  const definirPin = useMutation({
    mutationFn: async ({ id, pin }: { id: string; pin: string }) => {
      const { error } = await supabase.rpc("ponto_definir_pin", { _colaborador_id: id, _pin: pin });
      if (error) throw error;
    },
  });

  const definirSenha = useMutation({
    mutationFn: async ({ id, senha }: { id: string; senha: string }) => {
      const { data, error } = await supabase.rpc("ponto_definir_acesso", {
        _colaborador_id: id,
        _password: senha,
      });
      if (error) throw error;
      return data as { token: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto-acessos"] }),
  });

  return { colaboradores: query.data ?? [], isLoading: query.isLoading, salvar, desligar, definirSenha, definirPin };
}

/** Tablets do salão. O link fica aberto na tela, então é token longo. */
export function usePontoQuiosques() {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["ponto-quiosques", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ponto_quiosques").select("*").eq("user_id", visibleUserId!).order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; token: string; ativo: boolean }[];
    },
  });

  const criar = useMutation({
    mutationFn: async (nome: string) => {
      const { data, error } = await supabase
        .from("ponto_quiosques").insert({ user_id: visibleUserId, nome }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto-quiosques"] }),
  });

  return { quiosques: query.data ?? [], criar };
}

/** URL assinada da selfie, válida por poucos minutos. */
export async function urlDaSelfie(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("ponto-selfies").createSignedUrl(path, 300);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export function usePontoLocais() {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["ponto-locais", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ponto_locais")
        .select("*")
        .eq("user_id", visibleUserId!)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as PontoLocal[];
    },
  });

  const salvar = useMutation({
    mutationFn: async (dados: Partial<PontoLocal> & { nome: string }) => {
      const payload = { ...dados, user_id: visibleUserId };
      const { error } = dados.id
        ? await supabase.from("ponto_locais").update(payload).eq("id", dados.id)
        : await supabase.from("ponto_locais").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto-locais"] }),
  });

  return { locais: query.data ?? [], isLoading: query.isLoading, salvar };
}

/** As batidas de um dia, para o painel do gestor. */
export function usePontoDoDia(dia: string) {
  const { visibleUserId } = useEstablishmentId();

  return useQuery({
    queryKey: ["ponto-dia", visibleUserId, dia],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const inicio = new Date(`${dia}T00:00:00`).toISOString();
      const fim = new Date(`${dia}T23:59:59.999`).toISOString();
      return (await fetchAll<PontoMarcacao>((de, ate) =>
        supabase
          .from("ponto_marcacoes")
          .select("*")
          .eq("user_id", visibleUserId!)
          .gte("marcado_em", inicio)
          .lte("marcado_em", fim)
          .order("marcado_em", { ascending: false })
          .order("id")
          .range(de, ate),
      )) as PontoMarcacao[];
    },
    refetchInterval: 60_000,
  });
}

// ── Colaborador (sem login) ───────────────────────────────────────────────

export interface SessaoPonto {
  session_token: string;
  colaborador: { id: string; nome: string; cargo: string | null };
  hora_servidor: string;
  aparelho_novo: boolean;
  config: { exige_selfie: boolean; raio_padrao_m: number } | null;
}

export async function abrirPonto(token: string, senha: string, fingerprint: string) {
  const { data, error } = await supabase.rpc("ponto_abrir", {
    _token: token,
    _password: senha,
    _fingerprint: fingerprint,
  });
  if (error) throw error;
  const r = data as any;
  if (r?.error) throw new Error(r.error);
  return r as SessaoPonto;
}

export interface ResultadoBatida {
  id: string;
  nsr: number;
  marcado_em: string;
  dentro_raio: boolean | null;
  distancia_m: number | null;
  hash: string;
  colaborador: string;
}

export async function baterPonto(params: {
  sessionToken: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  horaDispositivo?: string | null;
  coletor?: "celular" | "tablet" | "painel";
  offline?: boolean;
  marcadoEmOffline?: string | null;
}) {
  const { data, error } = await supabase.rpc("ponto_bater", {
    _session_token: params.sessionToken,
    _latitude: params.latitude ?? null,
    _longitude: params.longitude ?? null,
    _accuracy_m: params.accuracy ?? null,
    _hora_dispositivo: params.horaDispositivo ?? null,
    _coletor: params.coletor ?? "celular",
    _origem_offline: params.offline ?? false,
    _marcado_em_offline: params.marcadoEmOffline ?? null,
  });
  if (error) throw error;
  const r = data as any;
  if (r?.error) throw new Error(r.error);
  return r as ResultadoBatida;
}

/**
 * Batida COM selfie: passa pela edge function, que guarda a foto no bucket
 * privado e registra a marcação na mesma chamada. O navegador do colaborador
 * nunca fala com o Storage, porque ele é anônimo.
 */
export async function baterComSelfie(params: {
  sessionToken?: string;
  quiosqueToken?: string;
  pin?: string;
  imagem: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  horaDispositivo?: string | null;
}) {
  const { data, error } = await supabase.functions.invoke("ponto-selfie", {
    body: {
      session_token: params.sessionToken ?? null,
      quiosque_token: params.quiosqueToken ?? null,
      pin: params.pin ?? null,
      imagem: params.imagem,
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
      accuracy_m: params.accuracy ?? null,
      hora_dispositivo: params.horaDispositivo ?? null,
    },
  });
  if (error) throw error;
  const r = data as any;
  if (r?.error) throw new Error(r.error);
  return r as ResultadoBatida & { com_selfie?: boolean; colaborador_nome?: string };
}

export async function minhasMarcacoes(sessionToken: string) {
  const { data, error } = await supabase.rpc("ponto_minhas_marcacoes", {
    _session_token: sessionToken,
  });
  if (error) throw error;
  const r = data as any;
  if (r?.error) throw new Error(r.error);
  return r as { hora_servidor: string; marcacoes: PontoMarcacao[] };
}
