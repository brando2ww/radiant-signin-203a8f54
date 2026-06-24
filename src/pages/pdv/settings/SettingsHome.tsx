import { useMemo, useState } from "react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import {
  Building2, Store, Truck, LayoutDashboard, ShoppingCart,
  DollarSign, FileText, Plug, Shield, ChevronRight, Search,
  Clock, CreditCard, ChefHat, Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href: string;
  keywords: string[];
  items: string[];
}

interface SearchEntry {
  category: string;
  categoryIcon: LucideIcon;
  section: string;
  keywords: string[];
  href: string;
}

interface QuickAccess {
  label: string;
  icon: LucideIcon;
  href: string;
}

// ── Data ─────────────────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  {
    id: "geral",
    label: "Geral",
    description: "Dados do estabelecimento, CNPJ, horários de funcionamento",
    icon: Building2,
    href: "/pdv/configuracoes-gerais/geral",
    keywords: ["cnpj", "nome", "endereço", "horário", "telefone", "estabelecimento", "regime tributário"],
    items: ["Dados do estabelecimento", "CNPJ e regime tributário", "Horários de funcionamento"],
  },
  {
    id: "frente-caixa",
    label: "Frente de Caixa",
    description: "Operação, visual, pagamentos e notificações do PDV",
    icon: Store,
    href: "/pdv/configuracoes-gerais/frente-caixa",
    keywords: ["pedidos", "visual", "som", "gorjeta", "mesas", "impressão", "notificações"],
    items: ["Operação e pedidos", "Visual e tema", "Formas de pagamento", "Notificações e sons"],
  },
  {
    id: "delivery",
    label: "Delivery",
    description: "Horários, entrega, pagamento, notificações, app mobile e marketing",
    icon: Truck,
    href: "/pdv/configuracoes-gerais/delivery",
    keywords: ["horário", "entrega", "taxa", "marketing", "qrcode", "app", "raio"],
    items: ["Horários", "Entrega e zonas", "Pagamento", "Notificações", "App Mobile", "Marketing"],
  },
  {
    id: "administrador",
    label: "Administrador",
    description: "Usuários, produtos, clientes, plano e assinatura",
    icon: LayoutDashboard,
    href: "/pdv/configuracoes-gerais/administrador",
    keywords: ["usuários", "produtos", "estoque", "assinatura", "plano", "clientes", "franquia"],
    items: ["Usuários e acessos", "Produtos e estoque", "Clientes", "Plano e assinatura"],
  },
  {
    id: "compras",
    label: "Compras",
    description: "Numeração, fluxo de cotação, aprovação e WhatsApp",
    icon: ShoppingCart,
    href: "/pdv/configuracoes-gerais/compras",
    keywords: ["cotação", "fornecedor", "whatsapp", "aprovação", "numeração", "pedido"],
    items: ["Numeração de documentos", "Fluxo de cotação", "Aprovação", "Template WhatsApp"],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    description: "Regime contábil, padrões de lançamento e alertas de vencimento",
    icon: DollarSign,
    href: "/pdv/configuracoes-gerais/financeiro",
    keywords: ["regime", "competência", "caixa", "vencimento", "alerta", "banco", "lançamento"],
    items: ["Regime contábil", "Padrões de lançamento", "Alertas de vencimento"],
  },
  {
    id: "fiscal",
    label: "Fiscal",
    description: "FocusNFe, certificado digital, NFC-e, NF-e, CSC e habilitação",
    icon: FileText,
    href: "/pdv/configuracoes-gerais/fiscal",
    keywords: ["nfe", "nfce", "sefaz", "certificado", "xml", "foco", "nota fiscal", "csc"],
    items: ["Dados cadastrais fiscais", "Certificado digital A1", "NFC-e e CSC", "Habilitação SEFAZ"],
  },
  {
    id: "integracoes",
    label: "Integrações",
    description: "iFood, WhatsApp Business, maquininhas e demais integrações",
    icon: Plug,
    href: "/pdv/configuracoes-gerais/integracoes",
    keywords: ["ifood", "whatsapp", "stone", "pagseguro", "goomer", "api", "maquininha"],
    items: ["iFood", "WhatsApp Business", "Maquininhas", "NF Automática", "Delivery próprio"],
  },
  {
    id: "permissoes",
    label: "Permissões",
    description: "Matriz de permissões por perfil (Gerente, Caixa, Garçom)",
    icon: Shield,
    href: "/pdv/configuracoes-gerais/permissoes",
    keywords: ["gerente", "caixa", "garçom", "acesso", "roles", "perfil"],
    items: ["Perfil Gerente", "Perfil Caixa", "Perfil Garçom", "Ações restritas"],
  },
];

const QUICK_ACCESS: QuickAccess[] = [
  { label: "Dados do estabelecimento", icon: Building2,    href: "/pdv/configuracoes-gerais/geral" },
  { label: "Horários",                  icon: Clock,       href: "/pdv/configuracoes-gerais/geral" },
  { label: "Fiscal / SEFAZ",            icon: FileText,    href: "/pdv/configuracoes-gerais/fiscal" },
  { label: "Integrações",               icon: Plug,        href: "/pdv/configuracoes-gerais/integracoes" },
  { label: "Permissões",                icon: Shield,      href: "/pdv/configuracoes-gerais/permissoes" },
  { label: "Pagamentos PDV",            icon: CreditCard,  href: "/pdv/configuracoes-gerais/frente-caixa?section=pagamentos" },
  { label: "Centros de Produção",       icon: ChefHat,     href: "/pdv/centros-producao" },
  { label: "Delivery",                  icon: Truck,       href: "/pdv/configuracoes-gerais/delivery" },
];

const SEARCH_INDEX: SearchEntry[] = [
  { category: "Geral", categoryIcon: Building2, section: "Dados do Estabelecimento", keywords: ["cnpj", "nome", "endereço", "telefone", "estabelecimento", "razão social"], href: "/pdv/configuracoes-gerais/geral" },
  { category: "Geral", categoryIcon: Building2, section: "CNPJ e Regime Tributário", keywords: ["cnpj", "regime", "simples nacional", "lucro presumido", "lucro real"], href: "/pdv/configuracoes-gerais/geral" },
  { category: "Geral", categoryIcon: Building2, section: "Horários de Funcionamento", keywords: ["horário", "abertura", "fechamento", "turno", "funcionamento", "semana"], href: "/pdv/configuracoes-gerais/geral" },
  { category: "Frente de Caixa", categoryIcon: Store, section: "Operação e Pedidos", keywords: ["pedidos", "mesas", "gorjeta", "tempo preparo", "impressão cozinha", "identificação"], href: "/pdv/configuracoes-gerais/frente-caixa?section=operacao" },
  { category: "Frente de Caixa", categoryIcon: Store, section: "Visual e Tema", keywords: ["tema", "cores", "modo escuro", "dark mode", "density", "compacto"], href: "/pdv/configuracoes-gerais/frente-caixa?section=visual" },
  { category: "Frente de Caixa", categoryIcon: Store, section: "Formas de Pagamento", keywords: ["pagamento", "pix", "cartão", "dinheiro", "crédito", "débito", "taxa serviço"], href: "/pdv/configuracoes-gerais/frente-caixa?section=pagamentos" },
  { category: "Frente de Caixa", categoryIcon: Store, section: "Notificações e Sons", keywords: ["som", "notificação", "alerta", "áudio", "novo pedido", "pedido pronto"], href: "/pdv/configuracoes-gerais/frente-caixa?section=notificacoes" },
  { category: "Delivery", categoryIcon: Truck, section: "Horários de Entrega", keywords: ["horário", "entrega", "delivery", "funcionamento"], href: "/pdv/configuracoes-gerais/delivery?section=hours" },
  { category: "Delivery", categoryIcon: Truck, section: "Área de Entrega", keywords: ["taxa entrega", "raio", "cep", "bairro", "zona", "cobertura"], href: "/pdv/configuracoes-gerais/delivery?section=delivery" },
  { category: "Delivery", categoryIcon: Truck, section: "Pagamento Delivery", keywords: ["pix", "cartão delivery", "dinheiro delivery", "formas pagamento"], href: "/pdv/configuracoes-gerais/delivery?section=payment" },
  { category: "Delivery", categoryIcon: Truck, section: "App Mobile e QR Code", keywords: ["app", "qrcode", "cardápio online", "link público", "mobile"], href: "/pdv/configuracoes-gerais/delivery?section=app" },
  { category: "Delivery", categoryIcon: Truck, section: "Marketing Delivery", keywords: ["meta pixel", "google analytics", "gtm", "pixel", "rastreamento"], href: "/pdv/configuracoes-gerais/delivery?section=marketing" },
  { category: "Fiscal", categoryIcon: FileText, section: "Dados Cadastrais Fiscais", keywords: ["cnpj", "razão social", "dados fiscais", "foco nfe", "focusnfe", "sefaz"], href: "/pdv/configuracoes-gerais/fiscal" },
  { category: "Fiscal", categoryIcon: FileText, section: "Certificado Digital A1", keywords: ["certificado", "a1", "pfx", "senha certificado", "digital"], href: "/pdv/configuracoes-gerais/fiscal" },
  { category: "Fiscal", categoryIcon: FileText, section: "NFC-e e CSC", keywords: ["nfce", "csc", "nota fiscal cupom", "cupom fiscal", "nfc"], href: "/pdv/configuracoes-gerais/fiscal" },
  { category: "Fiscal", categoryIcon: FileText, section: "Habilitação SEFAZ", keywords: ["nfe", "sefaz", "habilitação", "ambiente", "homologação", "produção", "xml"], href: "/pdv/configuracoes-gerais/fiscal" },
  { category: "Integrações", categoryIcon: Plug, section: "iFood", keywords: ["ifood", "i food", "pedido online", "marketplace", "conectar ifood"], href: "/pdv/configuracoes-gerais/integracoes" },
  { category: "Integrações", categoryIcon: Plug, section: "WhatsApp Business", keywords: ["whatsapp", "wa", "mensagem", "notificação whatsapp", "waba"], href: "/pdv/configuracoes-gerais/integracoes" },
  { category: "Integrações", categoryIcon: Plug, section: "Maquininhas", keywords: ["stone", "pagseguro", "getnet", "rede", "maquininha", "cartão", "terminal"], href: "/pdv/configuracoes-gerais/integracoes" },
  { category: "Integrações", categoryIcon: Plug, section: "NF Automática", keywords: ["nota fiscal automática", "emissão automática", "nfe auto", "nf automatica"], href: "/pdv/configuracoes-gerais/integracoes" },
  { category: "Compras", categoryIcon: ShoppingCart, section: "Numeração de Documentos", keywords: ["número", "prefixo", "cotação número", "pedido compra número"], href: "/pdv/configuracoes-gerais/compras" },
  { category: "Compras", categoryIcon: ShoppingCart, section: "Fluxo de Cotação", keywords: ["cotação", "fluxo", "aprovação cotação", "fornecedor"], href: "/pdv/configuracoes-gerais/compras" },
  { category: "Compras", categoryIcon: ShoppingCart, section: "Template WhatsApp Compras", keywords: ["whatsapp", "fornecedor mensagem", "template", "mensagem compra"], href: "/pdv/configuracoes-gerais/compras" },
  { category: "Financeiro", categoryIcon: DollarSign, section: "Regime Contábil", keywords: ["regime", "competência", "caixa", "contabilidade", "contábil"], href: "/pdv/configuracoes-gerais/financeiro" },
  { category: "Financeiro", categoryIcon: DollarSign, section: "Alertas de Vencimento", keywords: ["vencimento", "alerta", "boleto", "conta pagar", "prazo"], href: "/pdv/configuracoes-gerais/financeiro" },
  { category: "Permissões", categoryIcon: Shield, section: "Matriz de Permissões", keywords: ["gerente", "caixa", "garçom", "acesso", "role", "perfil", "usuário", "permissão"], href: "/pdv/configuracoes-gerais/permissoes" },
  { category: "Administrador", categoryIcon: LayoutDashboard, section: "Usuários", keywords: ["usuário", "funcionário", "senha", "login", "acesso usuário"], href: "/pdv/usuarios" },
  { category: "Administrador", categoryIcon: LayoutDashboard, section: "Centros de Produção / Impressoras", keywords: ["impressora", "centro produção", "cozinha", "tcp", "serial", "balcão", "produção"], href: "/pdv/centros-producao" },
  { category: "Administrador", categoryIcon: LayoutDashboard, section: "Plano e Assinatura", keywords: ["plano", "assinatura", "pagamento", "mensalidade", "upgrade"], href: "/pdv/configuracoes-gerais/administrador" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function CategoryCard({ cat, onClick }: { cat: Category; onClick: () => void }) {
  const Icon = cat.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col gap-3 p-5 rounded-xl border bg-card text-left transition-all",
        "hover:bg-accent hover:border-accent-foreground/20 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
      </div>

      <div className="space-y-1">
        <p className="font-semibold text-sm leading-tight">{cat.label}</p>
        <p className="text-xs text-muted-foreground leading-snug">{cat.description}</p>
      </div>

      <ul className="space-y-1">
        {cat.items.slice(0, 5).map((item) => (
          <li key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </button>
  );
}

function SearchResults({ results, query, onNavigate }: {
  results: SearchEntry[];
  query: string;
  onNavigate: (href: string) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Search className="h-8 w-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">Nenhuma configuração encontrada</p>
        <p className="text-xs mt-1">
          Nenhum resultado para "<strong>{query}</strong>"
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground mb-3">
        {results.length} resultado{results.length !== 1 ? "s" : ""} para "{query}"
      </p>
      {results.map((entry, i) => {
        const Icon = entry.categoryIcon;
        return (
          <button
            key={i}
            onClick={() => onNavigate(entry.href)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
              "hover:bg-accent border border-transparent hover:border-border"
            )}
          >
            <div className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs text-muted-foreground">{entry.category}</span>
              <span className="text-muted-foreground text-xs"> › </span>
              <span className="text-sm font-medium">{entry.section}</span>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SettingsHome() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const legacyTab = searchParams.get("tab");

  // Deep search: matches category cards AND indexed sections
  const searchResults = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return null;
    return SEARCH_INDEX.filter((entry) => {
      const haystack = [entry.category, entry.section, ...entry.keywords].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [query]);

  const filteredCategories = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return CATEGORIES;
    return CATEGORIES.filter((c) => {
      const haystack = [c.label, c.description, ...c.keywords].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [query]);

  if (legacyTab) {
    return <Navigate to={`/pdv/configuracoes-gerais/${legacyTab}`} replace />;
  }

  const isSearching = query.trim().length > 0;

  return (
    <div className="p-4 md:p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie módulos, integrações, dados fiscais, permissões e operação do sistema.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-10 h-11 text-sm"
          placeholder="Buscar por iFood, SEFAZ, CNPJ, impressora, horários, permissões..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Search results */}
      {isSearching && (
        <SearchResults
          results={searchResults ?? []}
          query={query}
          onNavigate={navigate}
        />
      )}

      {/* Quick access — only when not searching */}
      {!isSearching && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Acesso rápido</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {QUICK_ACCESS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => navigate(item.href)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-card text-left text-xs font-medium transition-colors",
                    "hover:bg-accent hover:border-accent-foreground/20"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Categories — show when not searching (full list) or when searching and categories match */}
      {!isSearching ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Categorias</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CATEGORIES.map((cat) => (
              <CategoryCard
                key={cat.id}
                cat={cat}
                onClick={() => navigate(cat.href)}
              />
            ))}
          </div>
        </div>
      ) : filteredCategories.length > 0 && (searchResults?.length ?? 0) === 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Categorias correspondentes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCategories.map((cat) => (
              <CategoryCard
                key={cat.id}
                cat={cat}
                onClick={() => navigate(cat.href)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
