import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import StockPositionReport from "@/pages/pdv/reports/StockPositionReport";
import StockTurnoverReport from "@/pages/pdv/reports/StockTurnoverReport";
import CustomersReport from "@/pages/pdv/reports/CustomersReport";
import LoyaltyReport from "@/pages/pdv/reports/LoyaltyReport";
import FiscalInvoicesReport from "@/pages/pdv/reports/FiscalInvoicesReport";
import {
  BarChart3, CalendarRange, Package, Layers, Users, Ban, BadgePercent,
  ShoppingCart, FileBarChart, ArrowLeftRight, PieChart, PackageSearch, Receipt,
  Truck, MapPin, Clock, Filter, Star, ClipboardCheck, ClipboardList, Bike,
  Warehouse, TrendingUp, Target, FileText, UserCheck, UserMinus, Gift, Boxes,
} from "lucide-react";

/**
 * Todo relatório do sistema, num lugar só.
 *
 * Três consumidores leem daqui: o catálogo (`/pdv/relatorios-central`), as
 * rotas dos relatórios novos e o menu. Acrescentar relatório é acrescentar uma
 * linha nesta lista.
 *
 * DUAS FORMAS DE ENTRADA:
 *  - `href`    → o relatório já existe e mora em outro lugar. O card leva até
 *                lá, com a URL que as pessoas já conhecem. Nada é movido.
 *  - `element` → relatório novo, que nasce dentro do hub.
 *
 * `gatePath` é o caminho canônico do MÓDULO DONO, e é a única autoridade sobre
 * quem enxerga o quê. Julgar pela URL faria a DRE aparecer para um cliente que
 * não contratou o Financeiro.
 */

export type ReportGroup =
  | "Vendas"
  | "Financeiro"
  | "Compras"
  | "Delivery"
  | "Estoque"
  | "Fiscal"
  | "Clientes"
  | "Avaliações"
  | "Operacional";

/** Ordem em que os grupos aparecem no catálogo. */
export const GROUP_ORDER: ReportGroup[] = [
  "Vendas", "Financeiro", "Compras", "Estoque",
  "Delivery", "Clientes", "Fiscal", "Avaliações", "Operacional",
];

export interface ReportDef {
  slug: string;
  title: string;
  /** A PERGUNTA que o relatório responde. É o que faz o catálogo navegável. */
  description: string;
  icon: LucideIcon;
  group: ReportGroup;
  /** Caminho canônico do módulo dono — decide acesso, não a URL. */
  gatePath: string;
  /** Tela que já existe, em outro endereço. */
  href?: string;
  /** Relatório novo, montado em /pdv/relatorios-central/{slug}. */
  element?: ComponentType;
  /** Sinônimos para a busca do catálogo. */
  keywords?: string[];
  badge?: "novo";
}

export const REPORTS_BASE = "/pdv/relatorios-central";

export const reportHref = (r: ReportDef): string =>
  r.href ?? `${REPORTS_BASE}/${r.slug}`;

const VENDAS = "/pdv/relatorios";
const FINANCEIRO = "/pdv/financeiro";
const COMPRAS = "/pdv/compras";
const DELIVERY = "/pdv/delivery";
const ESTOQUE = "/pdv/estoque";
const FISCAL = "/pdv/notas-fiscais";
const CLIENTES = "/pdv/clientes";

export const REPORTS: ReportDef[] = [
  // ------------------------------------------------------------------ Vendas
  {
    slug: "vendas-visao-geral",
    title: "Visão Geral",
    description: "Quanto entrou no período, por qual meio de pagamento e em que horário do dia.",
    icon: BarChart3, group: "Vendas",
    gatePath: VENDAS, href: `${VENDAS}?tab=overview`,
    keywords: ["faturamento", "receita", "ticket médio", "resumo"],
  },
  {
    slug: "vendas-mensal",
    title: "Mensal e comparativo anual",
    description: "Como este mês se compara com o anterior e com o mesmo mês do ano passado.",
    icon: CalendarRange, group: "Vendas",
    gatePath: VENDAS, href: `${VENDAS}?tab=monthly`,
    keywords: ["yoy", "ano a ano", "sazonalidade", "mês"],
  },
  {
    slug: "vendas-produtos",
    title: "Análise de Produtos",
    description: "Quais pratos puxam o faturamento, quais dão margem e quais só ocupam cardápio.",
    icon: Package, group: "Vendas",
    gatePath: VENDAS, href: `${VENDAS}?tab=sales-by-product`,
    keywords: ["mais vendidos", "curva", "margem", "prato"],
  },
  {
    slug: "vendas-categorias",
    title: "Vendas por Categoria",
    description: "Qual categoria sustenta o faturamento e qual está encolhendo.",
    icon: Layers, group: "Vendas",
    gatePath: VENDAS, href: `${VENDAS}?tab=category`,
    keywords: ["grupo", "seção do cardápio"],
  },
  {
    slug: "vendas-usuario",
    title: "Vendas por Usuário",
    description: "Quanto cada operador vendeu e o que passou pela mão de cada um no caixa.",
    icon: Users, group: "Vendas",
    gatePath: VENDAS, href: `${VENDAS}?tab=user`,
    keywords: ["operador", "caixa", "garçom", "equipe"],
  },
  {
    slug: "vendas-cancelamentos",
    title: "Cancelamentos",
    description: "O que foi cancelado, por quem e quanto isso custou no período.",
    icon: Ban, group: "Vendas",
    gatePath: VENDAS, href: `${VENDAS}?tab=cancellations`,
    keywords: ["estorno", "cancelado", "perda"],
  },
  {
    slug: "vendas-descontos",
    title: "Descontos e Cupons",
    description: "Quanto foi dado de desconto, em que cupons e se eles trouxeram venda nova.",
    icon: BadgePercent, group: "Vendas",
    gatePath: VENDAS, href: `${VENDAS}?tab=discounts`,
    keywords: ["cupom", "promoção", "abatimento"],
  },

  // -------------------------------------------------------------- Financeiro
  {
    slug: "dre",
    title: "DRE",
    description: "O resultado do período linha a linha: o que entrou, o que saiu e o que sobrou.",
    icon: FileBarChart, group: "Financeiro",
    gatePath: `${FINANCEIRO}/dre`, href: `${FINANCEIRO}/dre`,
    keywords: ["resultado", "lucro", "prejuízo", "demonstrativo", "contador"],
  },
  {
    slug: "fluxo-caixa",
    title: "Fluxo de Caixa",
    description: "Quando o dinheiro entra e quando sai — e se a conta fecha no meio do mês.",
    icon: ArrowLeftRight, group: "Financeiro",
    gatePath: `${FINANCEIRO}/fluxo-caixa`, href: `${FINANCEIRO}/fluxo-caixa`,
    keywords: ["caixa", "previsão", "saldo", "a pagar", "a receber"],
  },
  {
    slug: "cmv-produtos",
    title: "CMV por Produto",
    description: "Quanto custa fazer cada prato e qual margem ele deixa de verdade.",
    icon: PackageSearch, group: "Financeiro",
    gatePath: `${FINANCEIRO}/cmv-produtos`, href: `${FINANCEIRO}/cmv-produtos`,
    keywords: ["custo", "ficha técnica", "margem", "food cost"],
  },
  {
    slug: "cmv-geral",
    title: "CMV Geral",
    description: "Qual fatia do faturamento vai embora em insumo, mês a mês.",
    icon: PieChart, group: "Financeiro",
    gatePath: `${FINANCEIRO}/cmv-geral`, href: `${FINANCEIRO}/cmv-geral`,
    keywords: ["custo da mercadoria", "percentual", "insumo"],
  },
  {
    slug: "demonstrativo-caixa",
    title: "Demonstrativo de Caixa",
    description: "Abertura, sangria, suprimento e fechamento de cada turno, com as diferenças.",
    icon: Receipt, group: "Financeiro",
    gatePath: `${FINANCEIRO}/demonstrativo-caixa`, href: `${FINANCEIRO}/demonstrativo-caixa`,
    keywords: ["fechamento", "sangria", "quebra de caixa", "turno"],
  },

  // ----------------------------------------------------------------- Compras
  {
    slug: "compras-completo",
    title: "Compras e Fornecedores",
    description: "Quanto foi comprado de quem, a variação de preço por insumo e onde se pagou a mais.",
    icon: ShoppingCart, group: "Compras",
    gatePath: `${COMPRAS}/relatorios`, href: `${COMPRAS}/relatorios`,
    keywords: ["fornecedor", "cotação", "preço", "economia", "pedido"],
  },
  {
    slug: "compras-resumo",
    title: "Compras no Período",
    description: "O total comprado dentro da visão de vendas, para cruzar entrada e saída.",
    icon: Boxes, group: "Compras",
    gatePath: VENDAS, href: `${VENDAS}?tab=purchases`,
    keywords: ["entrada", "nota", "insumo"],
  },

  // ---------------------------------------------------------------- Delivery
  {
    slug: "delivery-completo",
    title: "Relatórios de Delivery",
    description: "Pedidos, receita, produtos, horários de pico, bairros, cancelados e funil de compra.",
    icon: Truck, group: "Delivery",
    gatePath: `${DELIVERY}/relatorios`, href: `${DELIVERY}/relatorios`,
    keywords: ["ifood", "entrega", "online", "pico", "bairro", "funil"],
  },
  {
    slug: "delivery-entregadores",
    title: "Entregadores",
    description: "Quantas entregas cada um fez, em quanto tempo e quanto tem a receber.",
    icon: Bike, group: "Delivery",
    gatePath: `${DELIVERY}/entregadores`, href: `${DELIVERY}/entregadores`,
    keywords: ["motoboy", "corrida", "taxa", "repasse"],
  },

  // ----------------------------------------------------------------- Estoque
  {
    slug: "estoque-posicao",
    title: "Posição de Estoque",
    description: "Quanto dinheiro está parado na prateleira e o que está prestes a faltar.",
    icon: Warehouse, group: "Estoque",
    gatePath: ESTOQUE, element: StockPositionReport, badge: "novo",
    keywords: ["saldo", "valor em estoque", "mínimo", "ruptura", "parado"],
  },
  {
    slug: "estoque-giro",
    title: "Giro e Curva ABC",
    description: "Quais insumos consomem o seu dinheiro, quais giram e quais estão dormindo.",
    icon: TrendingUp, group: "Estoque",
    gatePath: ESTOQUE, element: StockTurnoverReport, badge: "novo",
    keywords: ["abc", "consumo", "cobertura", "giro", "curva"],
  },
  {
    slug: "estoque-contagens",
    title: "Contagens de Estoque",
    description: "O resultado de cada inventário: o que bateu, o que faltou e quanto isso vale.",
    icon: ClipboardList, group: "Estoque",
    gatePath: "/pdv/contagem-estoque", href: "/pdv/contagem-estoque",
    keywords: ["inventário", "conferência", "divergência", "quebra"],
  },

  // ---------------------------------------------------------------- Clientes
  {
    slug: "clientes-recorrencia",
    title: "Clientes e Recorrência",
    description: "Quem volta, quanto gasta e quem parou de aparecer — com o valor que já deixou na casa.",
    icon: UserCheck, group: "Clientes",
    gatePath: CLIENTES, element: CustomersReport, badge: "novo",
    keywords: ["recorrência", "inativo", "sumiu", "ticket", "base"],
  },
  {
    slug: "clientes-fidelidade",
    title: "Fidelidade",
    description: "Quanto o programa de pontos moveu e quanto ele custou de desconto de verdade.",
    icon: Gift, group: "Clientes",
    gatePath: `${DELIVERY}/fidelidade`, element: LoyaltyReport, badge: "novo",
    keywords: ["pontos", "resgate", "prêmio", "cashback"],
  },

  // ------------------------------------------------------------------ Fiscal
  {
    slug: "fiscal-notas-recebidas",
    title: "Notas Fiscais Recebidas",
    description: "O que os fornecedores emitiram contra o seu CNPJ e o que ainda não virou entrada.",
    icon: FileText, group: "Fiscal",
    gatePath: FISCAL, element: FiscalInvoicesReport, badge: "novo",
    keywords: ["nf-e", "xml", "manifestação", "imposto", "entrada", "sefaz"],
  },

  // ------------------------------------------------------------- Avaliações
  {
    slug: "avaliacoes",
    title: "Avaliações e NPS",
    description: "Como o cliente avalia a casa, por dia, semana, mês e por pergunta.",
    icon: Star, group: "Avaliações",
    gatePath: "/pdv/avaliacoes", href: "/pdv/avaliacoes",
    keywords: ["nps", "satisfação", "pesquisa", "nota"],
  },

  // ------------------------------------------------------------- Operacional
  {
    slug: "operacional-tarefas",
    title: "Operacional de Tarefas",
    description: "Quais checklists a equipe cumpre, quais falham e quem está segurando a operação.",
    icon: ClipboardCheck, group: "Operacional",
    gatePath: "/pdv/tarefas", href: "/pdv/tarefas",
    keywords: ["checklist", "equipe", "ranking", "setor"],
  },
];

/** Grupos presentes numa lista, na ordem canônica. */
export function groupsOf(reports: ReportDef[]): ReportGroup[] {
  const set = new Set(reports.map((r) => r.group));
  return GROUP_ORDER.filter((g) => set.has(g));
}

/** Busca sem acento, por título, descrição e sinônimos. */
export function matchesQuery(r: ReportDef, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const semAcento = (t: string) =>
    t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const alvo = semAcento([r.title, r.description, r.group, ...(r.keywords ?? [])].join(" "));
  return semAcento(q).split(/\s+/).every((termo) => alvo.includes(termo));
}
