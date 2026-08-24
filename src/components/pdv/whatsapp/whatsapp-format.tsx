import { Fragment, type ReactNode } from "react";

/**
 * Converte a marcação do WhatsApp em nós React.
 *
 * O fornecedor não vê `*Koten*`, vê **Koten**. Mostrar o asterisco cru na
 * prévia faz o lojista tentar "consertar" um texto que já está certo — foi o
 * que aconteceu com a caixa monoespaçada que isto substitui.
 */

interface Regra {
  re: RegExp;
  envolver: (filhos: ReactNode, chave: string) => ReactNode;
}

// Ordem importa: a monoespaçada vem primeiro porque dentro dela nada mais é
// formatado, igual ao WhatsApp de verdade.
const REGRAS: Regra[] = [
  {
    re: /```([\s\S]+?)```/,
    envolver: (f, k) => (
      <code key={k} className="whitespace-pre-wrap rounded bg-black/5 px-1 font-mono text-[0.9em] dark:bg-white/10">
        {f}
      </code>
    ),
  },
  {
    re: /`([^`\n]+)`/,
    envolver: (f, k) => (
      <code key={k} className="rounded bg-black/5 px-1 font-mono text-[0.9em] dark:bg-white/10">
        {f}
      </code>
    ),
  },
  { re: /\*([^*\n]+)\*/, envolver: (f, k) => <strong key={k} className="font-semibold">{f}</strong> },
  { re: /_([^_\n]+)_/, envolver: (f, k) => <em key={k}>{f}</em> },
  { re: /~([^~\n]+)~/, envolver: (f, k) => <s key={k}>{f}</s> },
];

const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Último nível: só texto e links. */
function comLinks(texto: string, prefixo: string): ReactNode[] {
  const partes = texto.split(URL_RE);
  return partes.map((p, i) =>
    // `test` com regex global guarda lastIndex e alterna resultado entre
    // chamadas. Como o split já isola a URL num pedaço inteiro, basta o começo.
    /^https?:\/\//.test(p) ? (
      <span key={`${prefixo}-l${i}`} className="break-all text-[#027eb5] underline dark:text-sky-300">
        {p}
      </span>
    ) : (
      <Fragment key={`${prefixo}-t${i}`}>{p}</Fragment>
    ),
  );
}

/**
 * Aplica as regras da mais externa para a mais interna. Cada recursão trabalha
 * numa fatia estritamente menor, então termina sempre.
 */
export function formatarWhatsApp(texto: string, prefixo = "w", desde = 0): ReactNode[] {
  for (let i = desde; i < REGRAS.length; i++) {
    const { re, envolver } = REGRAS[i];
    const m = texto.match(re);
    if (!m || m.index === undefined) continue;

    const antes = texto.slice(0, m.index);
    const depois = texto.slice(m.index + m[0].length);

    return [
      ...formatarWhatsApp(antes, `${prefixo}a${i}`, i),
      envolver(formatarWhatsApp(m[1], `${prefixo}m${i}`, i + 1), `${prefixo}w${i}`),
      ...formatarWhatsApp(depois, `${prefixo}d${i}`, i),
    ];
  }
  return comLinks(texto, prefixo);
}
