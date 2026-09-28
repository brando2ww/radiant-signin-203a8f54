/**
 * Motor de apuração da jornada.
 *
 * Função pura de propósito: recebe marcações, escala e perfil, devolve totais.
 * Não fala com banco, não conhece tela, e por isso pode ser conferido com
 * teste de mesa contra o que o contador calcularia à mão · que é o único jeito
 * de ganhar confiança nesse tipo de conta.
 *
 * Regras implementadas, com a base de cada uma:
 *
 *  · Tolerância do art. 58 §1º da CLT e Súmula 366: até 5 minutos por extremo
 *    e 10 no dia não são jornada. Passou de 10 no dia, conta TUDO, inclusive os
 *    primeiros minutos (é tudo-ou-nada, não franquia).
 *  · Hora noturna reduzida de 52min30s e adicional noturno do art. 73, com
 *    prorrogação quando a jornada entra pela madrugada (Súmula 60, II).
 *  · Hora extra por FAIXA, vinda do perfil. O piso da CLT é 50% para tudo; a
 *    convenção do setor costuma escalonar (50% nas duas primeiras, 75% acima).
 *  · Domingo e feriado com percentual próprio.
 *  · Intervalo: se o previsto não foi cumprido, o que faltou é indenizado como
 *    extra (art. 71 §4º).
 *
 * O que NÃO está aqui de propósito: dinheiro. O módulo entrega horas e
 * rubricas; quem transforma em salário é o contador.
 */

export interface Marcacao {
  marcado_em: string;
  desconsiderada?: boolean;
}

export interface DiaEscala {
  dia_semana: number;
  entrada: string | null;
  saida: string | null;
  intervalo_min: number;
  is_dsr: boolean;
}

export interface FaixaExtra {
  ate_horas?: number;
  pct: number;
}

export interface PerfilJornada {
  faixas_extra: FaixaExtra[];
  pct_domingo_feriado: number;
  pct_noturno: number;
  noturno_inicio: string;
  noturno_fim: string;
  noturno_hora_reduzida: boolean;
  noturno_prorrogacao: boolean;
  intrajornada_min_min: number;
  tolerancia_extremo_min: number;
  tolerancia_dia_min: number;
}

export interface EntradaApuracao {
  dia: string;
  marcacoes: Marcacao[];
  escala: DiaEscala | null;
  perfil: PerfilJornada;
  ehFeriado: boolean;
}

export interface ResultadoDia {
  dia: string;
  trabalhadoMin: number;
  previstoMin: number;
  intervaloMin: number;
  intervaloDevidoMin: number;
  extrasPorFaixa: { pct: number; minutos: number }[];
  noturnasMin: number;
  noturnasReduzidasMin: number;
  atrasoMin: number;
  faltaMin: number;
  /** Intervalo que faltou para completar o previsto (art. 71 §4º). */
  intervaloSuprimidoMin: number;
  ehDsr: boolean;
  ehFeriado: boolean;
  marcacoesImpares: boolean;
  semMarcacao: boolean;
}

const MIN = 60_000;

const minutosEntre = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / MIN));

/** "08:30" no dia informado. Vira nulo quando a escala não define o horário. */
function horaNoDia(dia: string, hhmm: string | null): Date | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${dia}T00:00:00`);
  d.setHours(h, m ?? 0, 0, 0);
  return d;
}

/**
 * Minutos dentro da janela noturna, contando a virada da meia-noite.
 * A janela padrão é 22h às 5h, mas o perfil pode mudar por convenção.
 */
export function minutosNoturnos(inicio: Date, fim: Date, perfil: PerfilJornada): number {
  const [hi, mi] = perfil.noturno_inicio.split(":").map(Number);
  const [hf, mf] = perfil.noturno_fim.split(":").map(Number);
  let total = 0;

  // Varre minuto a minuto: é barato para uma jornada (no máximo ~1440 passos)
  // e elimina toda a aritmética de intervalos que cruzam a meia-noite, que é
  // onde esse cálculo costuma errar.
  for (let t = inicio.getTime(); t < fim.getTime(); t += MIN) {
    const d = new Date(t);
    const minutoDoDia = d.getHours() * 60 + d.getMinutes();
    const ini = hi * 60 + mi;
    const f = hf * 60 + mf;
    const dentro = ini < f ? minutoDoDia >= ini && minutoDoDia < f : minutoDoDia >= ini || minutoDoDia < f;
    if (dentro) total += 1;
  }
  return total;
}

/** Pares de entrada e saída. Marcação ímpar deixa o último par aberto. */
function pares(marcacoes: Marcacao[]): [Date, Date][] {
  const validas = marcacoes
    .filter((m) => !m.desconsiderada)
    .map((m) => new Date(m.marcado_em))
    .sort((a, b) => a.getTime() - b.getTime());

  const saida: [Date, Date][] = [];
  for (let i = 0; i + 1 < validas.length; i += 2) saida.push([validas[i], validas[i + 1]]);
  return saida;
}

export function apurarDia(e: EntradaApuracao): ResultadoDia {
  const { perfil, escala } = e;
  const blocos = pares(e.marcacoes);
  const validas = e.marcacoes.filter((m) => !m.desconsiderada);

  const trabalhadoBruto = blocos.reduce((s, [a, b]) => s + minutosEntre(a, b), 0);

  // Intervalo é o tempo ENTRE os blocos: saiu para o almoço e voltou.
  let intervaloMin = 0;
  for (let i = 0; i + 1 < blocos.length; i++) {
    intervaloMin += minutosEntre(blocos[i][1], blocos[i + 1][0]);
  }

  const previstoMin = (() => {
    if (!escala || escala.is_dsr) return 0;
    const ent = horaNoDia(e.dia, escala.entrada);
    const sai = horaNoDia(e.dia, escala.saida);
    if (!ent || !sai) return 0;
    // Jornada que vira a meia-noite: a saída cai no dia seguinte.
    const fim = sai.getTime() <= ent.getTime() ? new Date(sai.getTime() + 24 * 60 * MIN) : sai;
    return Math.max(0, minutosEntre(ent, fim) - (escala.intervalo_min ?? 0));
  })();

  // Tolerância tudo-ou-nada: passou de 10 minutos no dia, conta tudo.
  const diferenca = trabalhadoBruto - previstoMin;
  const dentroDaTolerancia =
    previstoMin > 0 && Math.abs(diferenca) <= perfil.tolerancia_dia_min;

  const excedente = dentroDaTolerancia ? 0 : Math.max(0, diferenca);
  const faltante = dentroDaTolerancia ? 0 : Math.max(0, -diferenca);

  // Intervalo não concedido por inteiro: o que faltou é indenizado como extra
  // (art. 71 §4º). Só vale quando a escala previa intervalo.
  const intervaloDevido = escala?.intervalo_min ?? 0;
  const intervaloFaltante =
    intervaloDevido > 0 && blocos.length > 1 ? Math.max(0, intervaloDevido - intervaloMin) : 0;

  // O intervalo suprimido NÃO entra nas faixas de hora extra. São coisas
  // diferentes: uma é excesso de jornada, a outra é indenização por descanso
  // não concedido. Somar as duas na mesma rubrica dá ao contador um número que
  // ele não sabe de onde saiu, e parece dupla contagem do mesmo tempo.
  const extraTotal = excedente;

  // Domingo e feriado têm percentual próprio e não entram nas faixas normais.
  const ehDomingo = new Date(`${e.dia}T12:00:00`).getDay() === 0;
  const ehEspecial = e.ehFeriado || (ehDomingo && (escala?.is_dsr ?? true));

  const extrasPorFaixa: { pct: number; minutos: number }[] = [];
  if (extraTotal > 0) {
    if (ehEspecial) {
      extrasPorFaixa.push({ pct: perfil.pct_domingo_feriado, minutos: extraTotal });
    } else {
      let restante = extraTotal;
      for (const faixa of perfil.faixas_extra) {
        if (restante <= 0) break;
        const teto = faixa.ate_horas != null ? faixa.ate_horas * 60 : restante;
        const usado = Math.min(restante, teto);
        const existente = extrasPorFaixa.find((x) => x.pct === faixa.pct);
        if (existente) existente.minutos += usado;
        else extrasPorFaixa.push({ pct: faixa.pct, minutos: usado });
        restante -= usado;
      }
      if (restante > 0) {
        const ultima = perfil.faixas_extra[perfil.faixas_extra.length - 1]?.pct ?? 50;
        const existente = extrasPorFaixa.find((x) => x.pct === ultima);
        if (existente) existente.minutos += restante;
        else extrasPorFaixa.push({ pct: ultima, minutos: restante });
      }
    }
  }

  const noturnasMin = blocos.reduce((s, [a, b]) => s + minutosNoturnos(a, b, perfil), 0);
  // Hora noturna vale 52min30s: 60 minutos de relógio valem 60 / 0,875.
  const noturnasReduzidasMin = perfil.noturno_hora_reduzida
    ? Math.round(noturnasMin / 0.875)
    : noturnasMin;

  // Atraso é chegar depois do previsto; falta é não completar a jornada.
  let atrasoMin = 0;
  if (escala && !escala.is_dsr && blocos.length > 0) {
    const previstaEntrada = horaNoDia(e.dia, escala.entrada);
    if (previstaEntrada) {
      const atraso = minutosEntre(previstaEntrada, blocos[0][0]);
      atrasoMin = atraso > perfil.tolerancia_extremo_min ? atraso : 0;
    }
  }

  return {
    dia: e.dia,
    trabalhadoMin: trabalhadoBruto,
    previstoMin,
    intervaloMin,
    intervaloDevidoMin: intervaloDevido,
    extrasPorFaixa,
    noturnasMin,
    noturnasReduzidasMin,
    atrasoMin,
    faltaMin: faltante,
    intervaloSuprimidoMin: intervaloFaltante,
    ehDsr: escala?.is_dsr ?? false,
    ehFeriado: e.ehFeriado,
    marcacoesImpares: validas.length % 2 === 1,
    semMarcacao: validas.length === 0 && !!previstoMin,
  };
}

export interface TotalRubrica {
  rubrica: string;
  minutos: number;
  dias: number;
}

/** Soma os dias do mês nas rubricas que o contador espera receber. */
export function totalizar(dias: ResultadoDia[]): TotalRubrica[] {
  const mapa = new Map<string, TotalRubrica>();
  const somar = (rubrica: string, minutos: number, dias_ = 0) => {
    const atual = mapa.get(rubrica) ?? { rubrica, minutos: 0, dias: 0 };
    atual.minutos += minutos;
    atual.dias += dias_;
    mapa.set(rubrica, atual);
  };

  for (const d of dias) {
    const extras = d.extrasPorFaixa.reduce((s, x) => s + x.minutos, 0);
    somar("horas_normais", Math.max(0, d.trabalhadoMin - extras));
    for (const f of d.extrasPorFaixa) somar(`extra_${f.pct}`, f.minutos);
    if (d.noturnasMin) {
      somar("noturnas", d.noturnasMin);
      somar("noturnas_reduzidas", d.noturnasReduzidasMin);
    }
    if (d.intervaloSuprimidoMin) somar("intervalo_suprimido", d.intervaloSuprimidoMin);
    if (d.atrasoMin) somar("atrasos", d.atrasoMin);
    if (d.faltaMin) somar("faltas_horas", d.faltaMin);
    if (d.semMarcacao) somar("faltas_dias", 0, 1);
    if (d.ehFeriado && d.trabalhadoMin > 0) somar("feriado_trabalhado", d.trabalhadoMin, 1);
    if (d.ehDsr && d.trabalhadoMin > 0) somar("dsr_trabalhado", d.trabalhadoMin, 1);
  }

  return [...mapa.values()].filter((t) => t.minutos !== 0 || t.dias !== 0);
}

/** Minutos no formato que cada sistema de folha espera. */
export function formatarHora(
  minutos: number,
  formato: "minutos" | "sexagesimal" | "decimal" | "decimal_implicito",
): string {
  const sinal = minutos < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutos));
  switch (formato) {
    case "minutos":
      return sinal + String(abs);
    case "sexagesimal": {
      // 2h30 vira 00230: três dígitos de hora, dois de minuto.
      const h = Math.floor(abs / 60);
      const m = abs % 60;
      return sinal + String(h).padStart(3, "0") + String(m).padStart(2, "0");
    }
    case "decimal":
      return sinal + (abs / 60).toFixed(2);
    case "decimal_implicito":
      // 8 inteiros e 6 decimais, sem separador: 2,5 h vira 00000002500000.
      return sinal + String(Math.round((abs / 60) * 1_000_000)).padStart(14, "0");
  }
}

export const hhmm = (minutos: number): string => {
  const sinal = minutos < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutos));
  return `${sinal}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
};
