/**
 * Exportação do fechamento para o sistema de folha do contador.
 *
 * Não existe layout padrão no Brasil: cada sistema tem o seu, e o código do
 * evento é do escritório de contabilidade, não nosso. Por isso aqui não há um
 * exportador por concorrente, e sim um motor com presets.
 *
 * Os dois presets têm leiaute público, conferido campo a campo:
 *
 *  · ALTERDATA DP · posição fixa, 128 posições, faltas em MINUTOS.
 *  · SAGE GESTÃO CONTÁBIL / IOB · 55 posições com pipe, hora SEXAGESIMAL
 *    (duas horas e meia é 00230).
 *
 * O formato da hora é o defeito mais caro deste módulo: trocado, paga salário
 * errado e nenhum arquivo acusa erro. Por isso ele é campo do layout e a tela
 * mostra o mesmo valor nos quatro formatos antes de gerar.
 */
import { formatarHora } from "./calculo";

export type FormatoHora = "minutos" | "sexagesimal" | "decimal" | "decimal_implicito";

export interface LinhaExportacao {
  matricula: string;
  rubrica: string;
  codigoEvento: string;
  minutos: number;
  dias: number;
}

export interface OpcoesExportacao {
  preset: "alterdata" | "sage_iob" | "csv";
  formatoHora: FormatoHora;
  codigoEmpresa?: string;
  competencia: string; // "2026-09"
}

const num = (v: string | number, tamanho: number) =>
  String(v).replace(/\D/g, "").slice(0, tamanho).padStart(tamanho, "0");

const texto = (v: string, tamanho: number) => (v ?? "").slice(0, tamanho).padEnd(tamanho, " ");

/** DDMMAA do primeiro e do último dia da competência. */
function referencias(competencia: string): [string, string] {
  const [ano, mes] = competencia.split("-").map(Number);
  const ultimo = new Date(ano, mes, 0).getDate();
  const dd = (d: number) => String(d).padStart(2, "0") + String(mes).padStart(2, "0") + String(ano).slice(2);
  return [dd(1), dd(ultimo)];
}

function linhaAlterdata(l: LinhaExportacao, seq: number, o: OpcoesExportacao): string {
  const [ref1, ref2] = referencias(o.competencia);
  const valor = l.dias > 0 ? l.dias : Number(formatarHora(l.minutos, o.formatoHora));
  return (
    num(seq, 6) +                           // 001-006 sequencial
    num(o.codigoEmpresa ?? 0, 5) +          // 007-011 empresa
    ref1 + ref2 +                           // 012-023 referências
    num(0, 6) +                             // 024-029 faltas em minutos
    num(0, 6) +                             // 030-035 horas trabalhadas
    num(0, 2) +                             // 036-037 dias úteis
    num(l.codigoEvento, 3) +                // 038-040 evento
    num(Math.round(valor * 100), 14) +      // 041-054 valor com 2 decimais
    num(l.matricula, 6) +                   // 055-060 funcionário
    "0"                                     // 061 processo
  );
}

function linhaSage(l: LinhaExportacao, o: OpcoesExportacao): string {
  const horas = formatarHora(l.minutos, "sexagesimal");
  return [
    num(l.matricula, 5),
    num(l.codigoEvento, 3),
    horas.padStart(5, "0"),
    num(0, 11),
    texto("", 20),
    num(l.codigoEvento, 5),
  ].join("|");
}

export function gerarArquivo(linhas: LinhaExportacao[], o: OpcoesExportacao): string {
  switch (o.preset) {
    case "alterdata":
      return linhas.map((l, i) => linhaAlterdata(l, i + 1, o)).join("\r\n") + "\r\n";
    case "sage_iob":
      return linhas.map((l) => linhaSage(l, o)).join("\r\n") + "\r\n";
    case "csv":
      return (
        ["matricula;evento;rubrica;quantidade"].concat(
          linhas.map((l) =>
            [l.matricula, l.codigoEvento, l.rubrica, l.dias > 0 ? l.dias : formatarHora(l.minutos, o.formatoHora)].join(";"),
          ),
        ).join("\r\n") + "\r\n"
      );
  }
}

/** O mesmo valor nos quatro formatos, para o contador conferir antes. */
export function previaDosFormatos(minutos: number) {
  return [
    { formato: "minutos" as const, rotulo: "Minutos", valor: formatarHora(minutos, "minutos") },
    { formato: "sexagesimal" as const, rotulo: "Sexagesimal (HHHMM)", valor: formatarHora(minutos, "sexagesimal") },
    { formato: "decimal" as const, rotulo: "Decimal", valor: formatarHora(minutos, "decimal") },
    { formato: "decimal_implicito" as const, rotulo: "Decimal implícito", valor: formatarHora(minutos, "decimal_implicito") },
  ];
}
