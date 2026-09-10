/**
 * Modelo aprovado na Meta, pronto para envio.
 *
 * O Z-PRO expõe `POST /v2/api/external/{apiId}/template` e repassa o campo
 * `templateData` cru para a Meta. Ou seja: o que se monta aqui é o payload
 * oficial da Cloud API, e o mesmo objeto serve quando o provedor for `cloud`
 * direto, sem intermediário.
 *
 * Os textos dos modelos vivem no frontend (src/lib/whatsapp-templates.ts), que
 * é onde o lojista os vê antes de enviar. Aqui só entram nome, idioma e os
 * valores já achatados — para que a tela e o envio nunca contem histórias
 * diferentes.
 */

export interface TemplateSpec {
  name: string;
  language: string;
  /** Parâmetros do corpo, na ordem de {{1}}..{{n}}. */
  bodyParams: string[];
  /** Só para modelo com botão de URL dinâmica: o pedaço final do endereço. */
  urlButtonParam?: string;
  /**
   * Só para modelo cadastrado com CABEÇALHO DE IMAGEM na Meta.
   *
   * Não é enfeite: se o modelo tem header de imagem e o envio não manda o
   * componente, a Meta recusa com "(#132012) Parameter format does not match".
   * O erro fala em "parameter format" e não menciona cabeçalho, o que manda
   * quem depura procurar no lugar errado — foi o que aconteceu em 02/09/2026.
   */
  headerImageUrl?: string;
}

/** A Meta recusa o ENVIO quando um parâmetro traz quebra de linha, tabulação ou
 *  quatro espaços seguidos. Achatar aqui é a última barreira antes da API. */
export function achatarParametro(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

export interface TemplateProblema {
  posicao: number;
  motivo: "vazio" | "quebra_de_linha";
}

/**
 * Rótulo de cada variável, por modelo.
 *
 * Existe porque a mensagem de erro precisa dizer "falta a Cidade", e não
 * "falta a posição 4" — que não ajuda ninguém a resolver. A edge function não
 * enxerga o catálogo do frontend, então os rótulos são repetidos aqui.
 *
 * MANTER EM SINCRONIA com `vars` em src/lib/whatsapp-templates.ts.
 */
const ROTULOS_POR_MODELO: Record<string, string[]> = {
  solicitar_cotacao: [
    "Fornecedor", "Estabelecimento", "CNPJ", "Cidade",
    "Prazo de retorno", "Quantidade de itens", "Responsável",
  ],
  confirmacao_cotacao_2: [
    "Fornecedor", "Estabelecimento", "CNPJ", "Nº da cotação",
    "Quantidade de itens", "Valor total", "Data de entrega", "Pagamento",
  ],
};

/** Nome do campo para o operador; cai para a posição se o modelo for novo. */
export function rotuloDaVariavel(modelo: string, posicao: number): string {
  return ROTULOS_POR_MODELO[modelo]?.[posicao - 1] ?? `variável ${posicao}`;
}

/** Confere antes de gastar chamada: parâmetro vazio derruba a mensagem inteira. */
export function conferirTemplate(spec: TemplateSpec): TemplateProblema[] {
  const out: TemplateProblema[] = [];
  spec.bodyParams.forEach((v, i) => {
    if (!v || !v.trim()) out.push({ posicao: i + 1, motivo: "vazio" });
    else if (/[\n\r\t]|\s{4,}/.test(v)) out.push({ posicao: i + 1, motivo: "quebra_de_linha" });
  });
  return out;
}

/** Payload nativo da Cloud API. */
export function montarTemplateData(spec: TemplateSpec, to: string): Record<string, unknown> {
  const components: Record<string, unknown>[] = [];

  // O cabeçalho vem PRIMEIRO: a Meta valida os componentes na ordem do modelo.
  if (spec.headerImageUrl) {
    components.push({
      type: "header",
      parameters: [{ type: "image", image: { link: spec.headerImageUrl } }],
    });
  }

  if (spec.bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: spec.bodyParams.map((text) => ({ type: "text", text })),
    });
  }

  // index "0" é a POSIÇÃO do botão, não a da variável. Como só existe um botão
  // nos nossos modelos, é sempre zero.
  if (spec.urlButtonParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: spec.urlButtonParam }],
    });
  }

  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: spec.name,
      language: { code: spec.language },
      ...(components.length > 0 ? { components } : {}),
    },
  };
}
