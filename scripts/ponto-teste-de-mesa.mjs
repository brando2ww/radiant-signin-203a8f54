/**
 * Teste de mesa do motor de apuração do ponto.
 *
 * O projeto não tem suíte de testes, e este cálculo é o lugar onde um erro
 * silencioso vira salário errado. Então ele tem a sua: cada caso aqui é uma
 * conta que um contador faria à mão.
 *
 * Rodar:  npm run ponto:mesa
 */
import { apurarDia, totalizar, minutosNoturnos, formatarHora, hhmm } from "../src/lib/ponto/calculo.ts";

const PISO = {
  faixas_extra: [{ pct: 50 }],
  pct_domingo_feriado: 100,
  pct_noturno: 20,
  noturno_inicio: "22:00",
  noturno_fim: "05:00",
  noturno_hora_reduzida: true,
  noturno_prorrogacao: true,
  intrajornada_min_min: 60,
  tolerancia_extremo_min: 5,
  tolerancia_dia_min: 10,
};

const CCT_SETOR = { ...PISO, faixas_extra: [{ ate_horas: 2, pct: 50 }, { pct: 75 }] };

const escala = (entrada, saida, intervalo = 60, dsr = false) => ({
  dia_semana: 1, entrada, saida, intervalo_min: intervalo, is_dsr: dsr,
});

const m = (dia, ...horas) => horas.map((h) => ({ marcado_em: `${dia}T${h}:00` }));

let passou = 0, falhou = 0;
function confere(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "OK  " : "ERRO"} ${nome}${ok ? "" : `\n     esperado ${JSON.stringify(esperado)}\n     obtido   ${JSON.stringify(obtido)}`}`);
  ok ? passou++ : falhou++;
}

// 1. Dia cheio, sem extra
let r = apurarDia({ dia: "2026-09-14", marcacoes: m("2026-09-14","08:00","12:00","13:00","17:00"), escala: escala("08:00","17:00"), perfil: PISO, ehFeriado: false });
confere("jornada exata de 8h não gera extra", [r.trabalhadoMin, r.extrasPorFaixa.length], [480, 0]);

// 2. Tolerância: 8 minutos a mais não contam
r = apurarDia({ dia: "2026-09-14", marcacoes: m("2026-09-14","08:00","12:00","13:00","17:08"), escala: escala("08:00","17:00"), perfil: PISO, ehFeriado: false });
confere("8 minutos ficam na tolerância", r.extrasPorFaixa.length, 0);

// 3. Tudo-ou-nada: 12 minutos contam INTEIROS
r = apurarDia({ dia: "2026-09-14", marcacoes: m("2026-09-14","08:00","12:00","13:00","17:12"), escala: escala("08:00","17:00"), perfil: PISO, ehFeriado: false });
confere("12 minutos contam os 12 (Súmula 366)", r.extrasPorFaixa, [{ pct: 50, minutos: 12 }]);

// 4. Faixas da convenção: 3h de extra viram 2h a 50% e 1h a 75%
r = apurarDia({ dia: "2026-09-14", marcacoes: m("2026-09-14","08:00","12:00","13:00","20:00"), escala: escala("08:00","17:00"), perfil: CCT_SETOR, ehFeriado: false });
confere("3h de extra: 2h a 50% e 1h a 75%", r.extrasPorFaixa, [{ pct: 50, minutos: 120 }, { pct: 75, minutos: 60 }]);

// 5. Jornada que vira a meia-noite, com noturno
r = apurarDia({ dia: "2026-09-14", marcacoes: [{ marcado_em: "2026-09-14T18:00:00" }, { marcado_em: "2026-09-15T02:00:00" }], escala: escala("18:00","02:00", 0), perfil: PISO, ehFeriado: false });
confere("18h às 02h: 8h trabalhadas", r.trabalhadoMin, 480);
confere("18h às 02h: 4h noturnas (22h-02h)", r.noturnasMin, 240);
confere("noturna reduzida: 240 min viram 274", r.noturnasReduzidasMin, 274);

// 6. Noturno puro 22h-06h
const nott = minutosNoturnos(new Date("2026-09-14T22:00:00"), new Date("2026-09-15T06:00:00"), PISO);
confere("22h às 06h dá 7h dentro da janela noturna", nott, 420);

// 7. Feriado trabalhado
r = apurarDia({ dia: "2026-09-07", marcacoes: m("2026-09-07","09:00","13:00"), escala: escala("09:00","13:00", 0, true), perfil: PISO, ehFeriado: true });
confere("feriado: tudo vira extra de 100%", r.extrasPorFaixa, [{ pct: 100, minutos: 240 }]);

// 8. Intervalo não concedido
r = apurarDia({ dia: "2026-09-14", marcacoes: m("2026-09-14","08:00","12:00","12:20","17:00"), escala: escala("08:00","17:00"), perfil: PISO, ehFeriado: false });
confere("intervalo de 20 min: 40 min de intervalo suprimido", r.intervaloSuprimidoMin, 40);
confere("intervalo suprimido não vira faixa de extra", r.extrasPorFaixa, [{ pct: 50, minutos: 40 }]);

// 9. Falta e marcação ímpar
r = apurarDia({ dia: "2026-09-14", marcacoes: [], escala: escala("08:00","17:00"), perfil: PISO, ehFeriado: false });
confere("dia sem marcação é falta de 480 min", [r.faltaMin, r.semMarcacao], [480, true]);
r = apurarDia({ dia: "2026-09-14", marcacoes: m("2026-09-14","08:00","12:00","13:00"), escala: escala("08:00","17:00"), perfil: PISO, ehFeriado: false });
confere("marcação ímpar é sinalizada", r.marcacoesImpares, true);

// 10. Atraso
r = apurarDia({ dia: "2026-09-14", marcacoes: m("2026-09-14","08:20","12:00","13:00","17:20"), escala: escala("08:00","17:00"), perfil: PISO, ehFeriado: false });
confere("chegou 20 min atrasado", r.atrasoMin, 20);

// 11. Marcação desconsiderada por tratamento
r = apurarDia({ dia: "2026-09-14", marcacoes: [...m("2026-09-14","08:00","12:00","13:00","17:00"), { marcado_em: "2026-09-14T17:01:00", desconsiderada: true }], escala: escala("08:00","17:00"), perfil: PISO, ehFeriado: false });
confere("batida desconsiderada sai da conta", [r.trabalhadoMin, r.marcacoesImpares], [480, false]);

// 12. Totalização do mês
const dias = [
  apurarDia({ dia: "2026-09-14", marcacoes: m("2026-09-14","08:00","12:00","13:00","18:00"), escala: escala("08:00","17:00"), perfil: CCT_SETOR, ehFeriado: false }),
  apurarDia({ dia: "2026-09-15", marcacoes: m("2026-09-15","08:00","12:00","13:00","17:00"), escala: escala("08:00","17:00"), perfil: CCT_SETOR, ehFeriado: false }),
];
const tot = totalizar(dias);
confere("mês: 1h de extra a 50%", tot.find((t) => t.rubrica === "extra_50")?.minutos, 60);
confere("mês: 16h normais (8h + 8h, extra fora)", tot.find((t) => t.rubrica === "horas_normais")?.minutos, 960);

// 13. Formatos de hora · o erro mais caro do módulo
confere("2h30 em minutos", formatarHora(150, "minutos"), "150");
confere("2h30 em sexagesimal", formatarHora(150, "sexagesimal"), "00230");
confere("2h30 em decimal", formatarHora(150, "decimal"), "2.50");
confere("2h30 em decimal implícito", formatarHora(150, "decimal_implicito"), "00000002500000");
confere("hhmm", hhmm(150), "02:30");

console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
