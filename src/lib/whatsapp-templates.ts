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
 *
 * O `status` daqui é MANUAL: nem o Z-PRO nem a nossa integração expõem o status
 * real do modelo na Meta (a coleção do Z-PRO tem 38 rotas e nenhuma consulta
 * modelo). Aprovação confirmada pelo usuário no Gerenciador da Meta em
 * 26/08/2026. Enquanto a leitura não vier da Graph API, este campo é uma
 * declaração humana, não um fato verificado pelo sistema.
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
  // Renomeado em 01/09/2026: ao trocar o número de disparo, os modelos foram
  // recadastrados na Meta com nomes novos. O nome é o que viaja no payload —
  // usar o antigo devolve "(#132001) Template name does not exist".
  // ATENÇÃO: cadastrado na Meta COM cabeçalho de imagem. O envio precisa mandar
  // o componente de header, senão a Meta recusa com 132012. Ver
  // supabase/functions/_shared/whatsapp/template-spec.ts (headerImageUrl).
  name: "solicitar_cotacao",
  language: "pt_BR",
  category: "UTILITY",
  status: "aprovado",
  body:
    "Olá, *{{1}}*! Você acabou de receber um pedido de cotação de orçamento.\n\n" +
    "Aqui é o *{{2}}*, portador do CNPJ *{{3}}*, da cidade de {{4}}.\n\n" +
    "Solicitamos, por gentileza, o retorno da cotação até {{5}}.\n\n" +
    "*Número de itens a ser cotado: {{6}}*\n\n" +
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
  // Substitui `cotacao_fornecedor_escolhido` (08/09/2026). O nome NÃO segue o
  // padrão dos outros porque quem cadastra na Meta é o usuário, e o que vale é
  // o nome que está lá: submetido como `confirmacao_cotacao_2`. Nome divergente
  // devolve "(#132001) Template name does not exist in the translation".
  // A lista de itens saiu
  // do corpo: parâmetro da Meta não aceita quebra de linha, então o pedido
  // chegava como uma linha corrida de vírgulas, e pedido grande ainda corria o
  // risco de estourar o limite de ~1024 caracteres e derrubar a mensagem.
  // Agora a relação inteira vive na página /pedido/:token, aberta pelo botão —
  // que também é onde o fornecedor confirma o aceite. O botão de resposta rápida
  // do modelo antigo não fazia nada: nenhum webhook lia a resposta.
  name: "confirmacao_cotacao_2",
  language: "pt_BR",
  category: "UTILITY",
  // Aprovado na Meta, verificado em 10/09/2026 pela própria API: enviar o
  // modelo com 1 variável devolveu 132000 ("number of parameters"), e não
  // 132001 ("name does not exist"). Com as 8 variáveis e o botão, o erro passou
  // a ser 131008, referente à variável que foi deixada vazia de propósito — ou
  // seja, nome, idioma, contagem e botão validaram.
  status: "aprovado",
  body:
    "*Olá, {{1}}! Fechamos este pedido com você.* 🎉\n\n" +
    "Aqui é o *{{2}}*, CNPJ {{3}}. Sua proposta na cotação {{4}} foi a escolhida.\n\n" +
    "📦 Itens: {{5}}\n" +
    "💰 Valor total: {{6}}\n" +
    "🚚 Entrega até: {{7}}\n" +
    "💳 Pagamento: {{8}}\n\n" +
    "No botão abaixo está a lista completa, item por item, com quantidade e preço " +
    "unitário. Confira e confirme: é a confirmação que nos avisa que a entrega " +
    "está programada.",
  vars: [
    "Fornecedor",
    "Estabelecimento",
    "CNPJ",
    "Nº/referência da cotação",
    "Quantidade de itens",
    "Valor total",
    "Data de entrega",
    "Pagamento",
  ],
  button: {
    kind: "url",
    text: "Ver pedido e confirmar",
    urlBase: "https://pdv.velaraia.app/l/pedido/",
  },
};

/**
 * Lista de itens para caber num parâmetro de modelo.
 *
 * A Meta recusa quebra de linha dentro de parâmetro, então a lista sai em UMA
 * linha, separada por vírgula — não dá para imitar o pedido impresso.
 *
 * O corte existe porque o limite é ~1024 caracteres por parâmetro e estourar
 * derruba a mensagem inteira. Nos 303 pedidos já enviados o maior deu 956, mas
 * um pedido atípico não pode quebrar o envio: melhor avisar que há mais itens e
 * deixar o resto para a lista completa que vai depois da confirmação.
 */
export function listaDeItensParaParametro(
  itens: { quantity: number; unit?: string | null; ingredientName: string }[],
  limite = 900,
): string {
  const partes = itens.map(
    (i) => `${i.quantity}${i.unit ? ` ${i.unit}` : ""} ${i.ingredientName}`.trim(),
  );

  let texto = partes.join(", ");
  if (texto.length <= limite) return texto;

  const cabem: string[] = [];
  let tamanho = 0;
  for (const p of partes) {
    if (tamanho + p.length + 2 > limite - 30) break;
    cabem.push(p);
    tamanho += p.length + 2;
  }
  const restantes = partes.length - cabem.length;
  return `${cabem.join(", ")} e mais ${restantes} ${restantes === 1 ? "item" : "itens"}`;
}

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
