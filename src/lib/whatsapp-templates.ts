/**
 * Modelos aprovados (ou em aprovação) na Meta.
 *
 * Fonte única da verdade do que o fornecedor recebe quando o envio sai pelo
 * número OFICIAL. Fora da janela de 24h a Meta não aceita texto livre, então o
 * texto rico que o sistema monta hoje não vale: vale isto aqui, palavra por
 * palavra, do jeito que foi submetido.
 *
 * Manter em sincronia com o Gerenciador da Meta. Se alguém editar o modelo lá e
 * não editar aqui, a tela passa a mentir para o lojista — que é exatamente o
 * problema que este arquivo existe para evitar.
 */

export type TemplateStatus = "aprovado" | "em_aprovacao" | "rejeitado";

export interface TemplateButton {
  kind: "url" | "quick_reply";
  text: string;
  /** Só para `url`: prefixo fixo; a variável entra colada no fim. */
  urlBase?: string;
}

export interface WhatsAppTemplate {
  name: string;
  language: string;
  category: "UTILITY" | "AUTHENTICATION" | "MARKETING";
  status: TemplateStatus;
  /** Corpo com {{1}}..{{n}}, idêntico ao submetido. */
  body: string;
  /** Rótulo de cada variável, na ordem — o que a tela mostra ao lojista. */
  vars: string[];
  button?: TemplateButton;
}

export const TEMPLATE_COTACAO: WhatsAppTemplate = {
  name: "cotacao_fornecedor",
  language: "pt_BR",
  category: "UTILITY",
  status: "em_aprovacao",
  body:
    "Olá, {{1}}! Você acabou de receber um pedido de cotação de orçamento.\n\n" +
    "Aqui é o {{2}}, portador do CNPJ {{3}}, da cidade de {{4}}.\n\n" +
    "Solicitamos, por gentileza, o retorno da cotação até {{5}}.\n\n" +
    "Número de itens a ser cotado: {{6}}\n\n" +
    "Ficamos no aguardo. Cordialmente, {{7}}.\n\n" +
    "Toque no botão abaixo para informar seus preços.",
  vars: [
    "Fornecedor",
    "Estabelecimento",
    "CNPJ",
    "Cidade",
    "Prazo de retorno",
    "Quantidade de itens",
    "Responsável",
  ],
  button: {
    kind: "url",
    text: "Informar meus preços",
    urlBase: "https://pdv.velaraia.app/l/cotacao/",
  },
};

export const TEMPLATE_PEDIDO: WhatsAppTemplate = {
  name: "pedido_fornecedor",
  language: "pt_BR",
  category: "UTILITY",
  status: "em_aprovacao",
  body:
    "Olá, {{1}}! Sua proposta foi a escolhida.\n\n" +
    "Aqui é o {{2}}. Fechamos o pedido {{3}} com você.\n\n" +
    "Itens: {{4}}\n" +
    "Valor total: {{5}}\n" +
    "Prazo de entrega: {{6}}\n" +
    "Pagamento: {{7}}\n\n" +
    "Toque no botão abaixo para confirmar o pedido e receber a lista completa dos produtos.",
  vars: [
    "Fornecedor",
    "Estabelecimento",
    "Nº/referência do pedido",
    "Quantidade de itens",
    "Valor total",
    "Prazo de entrega",
    "Pagamento",
  ],
  button: { kind: "quick_reply", text: "Confirmar pedido" },
};

/** Valor que a Meta recusa dentro de um parâmetro. */
const PARAM_PROIBIDO = /[\n\r\t]|\s{4,}/;

/**
 * Achata o valor para caber num parâmetro.
 *
 * A Meta rejeita o ENVIO (não o modelo) quando um parâmetro traz quebra de
 * linha, tabulação ou quatro espaços seguidos. Uma assinatura digitada em duas
 * linhas em Compras > Configurações derruba a cotação inteira, e o erro que
 * volta é genérico. Melhor achatar aqui.
 */
export function achatarParametro(valor: string | number | null | undefined): string {
  return String(valor ?? "").replace(/\s+/g, " ").trim();
}

/** O que o destinatário vê, com os valores no lugar das variáveis. */
export function renderizarTemplate(t: WhatsAppTemplate, valores: string[]): string {
  return t.body.replace(/\{\{(\d+)\}\}/g, (original, n: string) => {
    const v = valores[Number(n) - 1];
    return v === undefined || v === "" ? original : v;
  });
}

export interface ProblemaParametro {
  indice: number;
  rotulo: string;
  motivo: "vazio" | "quebra_de_linha";
}

/**
 * Confere os parâmetros ANTES de gastar uma chamada à Meta.
 *
 * Parâmetro vazio é o erro mais comum e o mais silencioso: prazo de entrega e
 * forma de pagamento são opcionais no cadastro, e a mensagem simplesmente não
 * sai quando faltam.
 */
export function conferirParametros(
  t: WhatsAppTemplate,
  valores: string[],
): ProblemaParametro[] {
  const problemas: ProblemaParametro[] = [];
  t.vars.forEach((rotulo, i) => {
    const v = valores[i] ?? "";
    if (!v.trim()) problemas.push({ indice: i + 1, rotulo, motivo: "vazio" });
    else if (PARAM_PROIBIDO.test(v)) problemas.push({ indice: i + 1, rotulo, motivo: "quebra_de_linha" });
  });
  return problemas;
}

export function rotuloStatus(s: TemplateStatus): string {
  return s === "aprovado" ? "Aprovado na Meta"
    : s === "em_aprovacao" ? "Em aprovação na Meta"
    : "Reprovado na Meta";
}
