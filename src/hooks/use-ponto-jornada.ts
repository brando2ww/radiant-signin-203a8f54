/**
 * Apuração da jornada: escala, perfil de regras, tratamento e fechamento.
 *
 * O cálculo em si mora em src/lib/ponto/calculo.ts, que é função pura e tem
 * teste de mesa (npm run ponto:mesa). Aqui só buscamos os dados e chamamos.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { fetchAll } from "@/lib/reports/fetch-all";
import {
  apurarDia, totalizar, type DiaEscala, type PerfilJornada, type ResultadoDia,
} from "@/lib/ponto/calculo";

export interface Escala {
  id: string;
  colaborador_id: string;
  nome: string | null;
  regime: string;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  dias?: (DiaEscala & { id: string })[];
}

export interface Tratamento {
  id: string;
  colaborador_id: string;
  marcacao_id: string | null;
  dia_jornada: string;
  tipo: string;
  horario: string | null;
  minutos: number | null;
  motivo: string;
  status: string;
  solicitado_em: string;
}

const competenciaDe = (mes: string) => `${mes}-01`;

export function usePerfilJornada() {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["ponto-perfil", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ponto_perfis_jornada")
        .select("*")
        .eq("user_id", visibleUserId!)
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      if (data?.length) return data[0] as any;
      // Primeiro acesso: nasce com o piso da CLT.
      const { data: novo } = await supabase.rpc("ponto_garantir_perfil", { _owner: visibleUserId! });
      const { data: recem } = await supabase
        .from("ponto_perfis_jornada").select("*").eq("id", novo as any).maybeSingle();
      return recem as any;
    },
  });

  const salvar = useMutation({
    mutationFn: async (dados: any) => {
      const { error } = await supabase
        .from("ponto_perfis_jornada")
        .update(dados)
        .eq("id", dados.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto-perfil"] }),
  });

  return { perfil: query.data as PerfilJornada & { id: string; nome: string } | undefined, isLoading: query.isLoading, salvar };
}

export function useEscalas() {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["ponto-escalas", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ponto_escalas")
        .select("*, dias:ponto_escala_dias(*)")
        .eq("user_id", visibleUserId!)
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Escala[];
    },
  });

  const salvar = useMutation({
    mutationFn: async ({ escala, dias }: { escala: Partial<Escala>; dias: DiaEscala[] }) => {
      const payload = {
        user_id: visibleUserId,
        colaborador_id: escala.colaborador_id,
        nome: escala.nome ?? null,
        regime: escala.regime ?? "normal",
        vigencia_inicio: escala.vigencia_inicio,
        vigencia_fim: escala.vigencia_fim ?? null,
      };
      const { data, error } = escala.id
        ? await supabase.from("ponto_escalas").update(payload).eq("id", escala.id).select().single()
        : await supabase.from("ponto_escalas").insert(payload).select().single();
      if (error) throw error;

      await supabase.from("ponto_escala_dias").delete().eq("escala_id", (data as any).id);
      const linhas = dias.map((d) => ({ ...d, escala_id: (data as any).id }));
      if (linhas.length) {
        const { error: e2 } = await supabase.from("ponto_escala_dias").insert(linhas);
        if (e2) throw e2;
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto-escalas"] }),
  });

  return { escalas: query.data ?? [], isLoading: query.isLoading, salvar };
}

export function useTratamentos(competencia: string) {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["ponto-tratamentos", visibleUserId, competencia],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const inicio = competenciaDe(competencia);
      const fim = new Date(new Date(inicio).getFullYear(), new Date(inicio).getMonth() + 1, 0)
        .toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("ponto_tratamentos")
        .select("*")
        .eq("user_id", visibleUserId!)
        .gte("dia_jornada", inicio)
        .lte("dia_jornada", fim)
        .order("dia_jornada");
      if (error) throw error;
      return (data ?? []) as Tratamento[];
    },
  });

  const decidir = useMutation({
    mutationFn: async ({ id, status, motivo }: { id: string; status: "aprovado" | "recusado"; motivo?: string }) => {
      const { data: sessao } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("ponto_tratamentos")
        .update({
          status,
          decidido_por: sessao.user?.id ?? null,
          decidido_em: new Date().toISOString(),
          decisao_motivo: motivo ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto-tratamentos"] }),
  });

  const criar = useMutation({
    mutationFn: async (t: Partial<Tratamento> & { colaborador_id: string; dia_jornada: string; motivo: string; tipo: string }) => {
      const { data: sessao } = await supabase.auth.getUser();
      const { error } = await supabase.from("ponto_tratamentos").insert({
        ...t,
        user_id: visibleUserId,
        fonte_marc: t.tipo === "desconsideracao" ? "O" : "I",
        status: "aprovado", // criado pelo gestor já nasce valendo
        solicitado_por: sessao.user?.id ?? null,
        decidido_por: sessao.user?.id ?? null,
        decidido_em: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto-tratamentos"] }),
  });

  return { tratamentos: query.data ?? [], isLoading: query.isLoading, decidir, criar };
}

export interface ApuracaoColaborador {
  colaborador_id: string;
  nome: string;
  dias: ResultadoDia[];
  totais: { rubrica: string; minutos: number; dias: number }[];
}

/**
 * Apura o mês inteiro do estabelecimento.
 *
 * Lê marcações, tratamentos aprovados, escala vigente e feriados, e roda o
 * motor dia a dia. Nada é gravado aqui: o fechamento é um passo separado e
 * explícito, porque fechar o mês é decisão do gerente, não efeito colateral de
 * abrir uma tela.
 */
export function useApuracao(competencia: string) {
  const { visibleUserId } = useEstablishmentId();

  return useQuery({
    queryKey: ["ponto-apuracao", visibleUserId, competencia],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<ApuracaoColaborador[]> => {
      const inicio = competenciaDe(competencia);
      const ultimoDia = new Date(new Date(inicio).getFullYear(), new Date(inicio).getMonth() + 1, 0);
      const fim = ultimoDia.toISOString().slice(0, 10);

      const [colaboradores, marcacoes, tratamentos, escalas, feriados, perfis] = await Promise.all([
        supabase.from("ponto_colaboradores").select("*").eq("user_id", visibleUserId!),
        fetchAll<any>((de, ate) =>
          supabase.from("ponto_marcacoes").select("*")
            .eq("user_id", visibleUserId!)
            .gte("marcado_em", `${inicio}T00:00:00`)
            .lte("marcado_em", `${fim}T23:59:59.999`)
            .order("marcado_em").order("id").range(de, ate)),
        supabase.from("ponto_tratamentos").select("*")
          .eq("user_id", visibleUserId!).eq("status", "aprovado")
          .gte("dia_jornada", inicio).lte("dia_jornada", fim),
        supabase.from("ponto_escalas").select("*, dias:ponto_escala_dias(*)")
          .eq("user_id", visibleUserId!).lte("vigencia_inicio", fim),
        supabase.from("ponto_feriados").select("data").lte("data", fim).gte("data", inicio),
        supabase.from("ponto_perfis_jornada").select("*")
          .eq("user_id", visibleUserId!).order("vigencia_inicio", { ascending: false }),
      ]);

      const perfil = (perfis.data?.[0] ?? {
        faixas_extra: [{ pct: 50 }], pct_domingo_feriado: 100, pct_noturno: 20,
        noturno_inicio: "22:00", noturno_fim: "05:00", noturno_hora_reduzida: true,
        noturno_prorrogacao: true, intrajornada_min_min: 60,
        tolerancia_extremo_min: 5, tolerancia_dia_min: 10,
      }) as PerfilJornada;

      const diasFeriado = new Set((feriados.data ?? []).map((f: any) => f.data));
      const desconsideradas = new Set(
        (tratamentos.data ?? []).filter((t: any) => t.tipo === "desconsideracao").map((t: any) => t.marcacao_id),
      );

      const saida: ApuracaoColaborador[] = [];

      for (const c of colaboradores.data ?? []) {
        // Escala vigente na competência, a mais recente que já começou.
        const escala = (escalas.data ?? [])
          .filter((e: any) => e.colaborador_id === c.id && (!e.vigencia_fim || e.vigencia_fim >= inicio))
          .sort((a: any, b: any) => b.vigencia_inicio.localeCompare(a.vigencia_inicio))[0];

        const resultados: ResultadoDia[] = [];
        for (let d = 1; d <= ultimoDia.getDate(); d++) {
          const dia = `${competencia}-${String(d).padStart(2, "0")}`;
          const doDia = (marcacoes ?? [])
            .filter((m: any) => m.colaborador_id === c.id && m.marcado_em.slice(0, 10) === dia)
            .map((m: any) => ({ marcado_em: m.marcado_em, desconsiderada: desconsideradas.has(m.id) }));

          // Inclusão manual aprovada entra como marcação, com a fonte marcada.
          const incluidas = (tratamentos.data ?? [])
            .filter((t: any) => t.colaborador_id === c.id && t.dia_jornada === dia && t.tipo === "inclusao" && t.horario)
            .map((t: any) => ({ marcado_em: t.horario }));

          const diaSemana = new Date(`${dia}T12:00:00`).getDay();
          const escalaDoDia = (escala?.dias ?? []).find((x: any) => x.dia_semana === diaSemana) ?? null;

          // Dia sem marcação e sem escala não vira linha: seria ruído.
          if (!doDia.length && !incluidas.length && !escalaDoDia) continue;

          resultados.push(
            apurarDia({
              dia,
              marcacoes: [...doDia, ...incluidas],
              escala: escalaDoDia as any,
              perfil,
              ehFeriado: diasFeriado.has(dia),
            }),
          );
        }

        if (resultados.length) {
          saida.push({
            colaborador_id: c.id,
            nome: c.nome,
            dias: resultados,
            totais: totalizar(resultados),
          });
        }
      }

      return saida;
    },
  });
}

export function useFechamento(competencia: string) {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["ponto-fechamento", visibleUserId, competencia],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ponto_fechamentos")
        .select("*")
        .eq("user_id", visibleUserId!)
        .eq("competencia", competenciaDe(competencia))
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const fechar = useMutation({
    mutationFn: async (apuracao: ApuracaoColaborador[]) => {
      const { data: sessao } = await supabase.auth.getUser();
      const { data: fech, error } = await supabase
        .from("ponto_fechamentos")
        .upsert({
          user_id: visibleUserId,
          competencia: competenciaDe(competencia),
          status: "fechado",
          fechado_por: sessao.user?.id ?? null,
          fechado_em: new Date().toISOString(),
        }, { onConflict: "user_id,competencia" })
        .select().single();
      if (error) throw error;

      await supabase.from("ponto_totais").delete().eq("fechamento_id", (fech as any).id);
      const linhas = apuracao.flatMap((a) =>
        a.totais.map((t) => ({
          fechamento_id: (fech as any).id,
          colaborador_id: a.colaborador_id,
          rubrica: t.rubrica,
          minutos: t.minutos,
          dias: t.dias,
        })),
      );
      if (linhas.length) {
        const { error: e2 } = await supabase.from("ponto_totais").insert(linhas);
        if (e2) throw e2;
      }
      return fech;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ponto-fechamento"] });
      qc.invalidateQueries({ queryKey: ["ponto-totais"] });
    },
  });

  const reabrir = useMutation({
    mutationFn: async (motivo: string) => {
      const { data: sessao } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("ponto_fechamentos")
        .update({
          status: "aberto",
          reaberto_por: sessao.user?.id ?? null,
          reaberto_em: new Date().toISOString(),
          reabertura_motivo: motivo,
        })
        .eq("user_id", visibleUserId!)
        .eq("competencia", competenciaDe(competencia));
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto-fechamento"] }),
  });

  return { fechamento: query.data, isLoading: query.isLoading, fechar, reabrir };
}
