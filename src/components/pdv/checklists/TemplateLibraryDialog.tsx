import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useChecklists, SECTOR_LABELS, type ChecklistSector } from "@/hooks/use-checklists";
import { Loader2, CheckSquare, Hash, Thermometer, Camera, Type, Star, ListChecks, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LocalItem } from "@/pages/pdv/ChecklistEditor";

const TYPE_ICONS: Record<string, React.ElementType> = {
  checkbox: CheckSquare,
  number: Hash,
  temperature: Thermometer,
  photo: Camera,
  text: Type,
  stars: Star,
  multiple_choice: ListChecks,
};

const BUILTIN_TEMPLATES = [
  {
    name: "Abertura Cozinha",
    sector: "cozinha" as const,
    description: "Checklist padrão de abertura da cozinha",
    items: [
      { title: "Verificar validade dos insumos", item_type: "checkbox" as const, is_critical: true },
      { title: "Temperatura da câmara fria", item_type: "temperature" as const, min_value: -18, max_value: -12, is_critical: true },
      { title: "Temperatura do balcão refrigerado", item_type: "temperature" as const, min_value: 0, max_value: 5, is_critical: true },
      { title: "Limpeza das bancadas", item_type: "checkbox" as const },
      { title: "Higienização das mãos (foto)", item_type: "photo" as const, requires_photo: true },
      { title: "Equipamentos funcionando", item_type: "checkbox" as const },
      { title: "Organização do mise en place", item_type: "checkbox" as const },
    ],
  },
  {
    name: "Fechamento Cozinha",
    sector: "cozinha" as const,
    description: "Checklist padrão de fechamento da cozinha",
    items: [
      { title: "Limpeza geral do chão", item_type: "checkbox" as const },
      { title: "Equipamentos desligados", item_type: "checkbox" as const, is_critical: true },
      { title: "Gás desligado", item_type: "checkbox" as const, is_critical: true },
      { title: "Lixo retirado", item_type: "checkbox" as const },
      { title: "Temperatura câmara fria (final)", item_type: "temperature" as const, min_value: -18, max_value: -12, is_critical: true },
      { title: "Foto da cozinha limpa", item_type: "photo" as const, requires_photo: true },
    ],
  },
  {
    name: "Abertura Salão",
    sector: "salao" as const,
    description: "Checklist de abertura do salão",
    items: [
      { title: "Mesas organizadas e limpas", item_type: "checkbox" as const },
      { title: "Cardápios em todas as mesas", item_type: "checkbox" as const },
      { title: "Ar condicionado ligado", item_type: "checkbox" as const },
      { title: "Iluminação conferida", item_type: "checkbox" as const },
      { title: "Banheiros limpos (foto)", item_type: "photo" as const, requires_photo: true },
      { title: "Avaliação geral do ambiente", item_type: "stars" as const },
    ],
  },
  {
    name: "Fechamento Salão",
    sector: "salao" as const,
    description: "Checklist de fechamento do salão",
    items: [
      { title: "Mesas limpas e alinhadas", item_type: "checkbox" as const },
      { title: "Chão varrido e lavado", item_type: "checkbox" as const },
      { title: "Ar condicionado desligado", item_type: "checkbox" as const, is_critical: true },
      { title: "Luzes apagadas", item_type: "checkbox" as const, is_critical: true },
      { title: "Banheiros conferidos (foto)", item_type: "photo" as const, requires_photo: true },
      { title: "Portas trancadas", item_type: "checkbox" as const, is_critical: true },
    ],
  },
  {
    name: "Abertura Caixa",
    sector: "caixa" as const,
    description: "Checklist de abertura do caixa",
    items: [
      { title: "Fundo de troco conferido", item_type: "number" as const },
      { title: "Máquina de cartão funcionando", item_type: "checkbox" as const, is_critical: true },
      { title: "Impressora fiscal funcionando", item_type: "checkbox" as const, is_critical: true },
      { title: "Sistema PDV operacional", item_type: "checkbox" as const, is_critical: true },
      { title: "Bobina de papel verificada", item_type: "checkbox" as const },
    ],
  },
  {
    name: "Fechamento Caixa",
    sector: "caixa" as const,
    description: "Checklist de fechamento do caixa",
    items: [
      { title: "Sangria realizada", item_type: "checkbox" as const, is_critical: true },
      { title: "Valor em caixa conferido", item_type: "number" as const, is_critical: true },
      { title: "Diferença de caixa (R$)", item_type: "number" as const },
      { title: "Relatório Z impresso", item_type: "checkbox" as const },
      { title: "Foto do caixa fechado", item_type: "photo" as const, requires_photo: true },
    ],
  },
  {
    name: "Abertura Bar",
    sector: "bar" as const,
    description: "Checklist de abertura do bar",
    items: [
      { title: "Estoque de bebidas conferido", item_type: "checkbox" as const },
      { title: "Gelo suficiente", item_type: "checkbox" as const },
      { title: "Copos e taças limpos", item_type: "checkbox" as const },
      { title: "Temperatura do refrigerador", item_type: "temperature" as const, min_value: 0, max_value: 5 },
      { title: "Guarnições preparadas (limão, etc)", item_type: "checkbox" as const },
    ],
  },
  {
    name: "Fechamento Bar",
    sector: "bar" as const,
    description: "Checklist de fechamento do bar",
    items: [
      { title: "Bebidas guardadas", item_type: "checkbox" as const },
      { title: "Bancada limpa", item_type: "checkbox" as const },
      { title: "Refrigeradores conferidos", item_type: "checkbox" as const, is_critical: true },
      { title: "Lixo retirado", item_type: "checkbox" as const },
      { title: "Foto do bar limpo", item_type: "photo" as const, requires_photo: true },
    ],
  },
  {
    name: "Recebimento de Mercadorias",
    sector: "estoque" as const,
    description: "Checklist de conferência no recebimento",
    items: [
      { title: "Nota fiscal conferida", item_type: "checkbox" as const, is_critical: true },
      { title: "Quantidade conferida", item_type: "checkbox" as const, is_critical: true },
      { title: "Temperatura dos refrigerados", item_type: "temperature" as const, min_value: 0, max_value: 5, is_critical: true },
      { title: "Validade verificada", item_type: "checkbox" as const, is_critical: true },
      { title: "Condição da embalagem", item_type: "stars" as const },
      { title: "Foto da entrega", item_type: "photo" as const, requires_photo: true },
      { title: "Observações", item_type: "text" as const },
    ],
  },
  {
    name: "Controle de Validade",
    sector: "estoque" as const,
    description: "Verificação periódica de validades no estoque",
    items: [
      { title: "Câmara fria conferida", item_type: "checkbox" as const, is_critical: true },
      { title: "Refrigerador conferido", item_type: "checkbox" as const, is_critical: true },
      { title: "Estoque seco conferido", item_type: "checkbox" as const },
      { title: "Produtos próximos ao vencimento", item_type: "text" as const },
      { title: "Produtos descartados", item_type: "text" as const },
      { title: "Foto dos produtos vencidos", item_type: "photo" as const, requires_photo: true },
    ],
  },
  {
    name: "Higienização",
    sector: "cozinha" as const,
    description: "Checklist de higienização completa",
    items: [
      { title: "Bancadas higienizadas", item_type: "checkbox" as const },
      { title: "Equipamentos limpos", item_type: "checkbox" as const },
      { title: "Piso lavado", item_type: "checkbox" as const },
      { title: "Ralos limpos", item_type: "checkbox" as const },
      { title: "Lixeiras higienizadas", item_type: "checkbox" as const },
      { title: "Foto geral (antes)", item_type: "photo" as const, requires_photo: true },
      { title: "Foto geral (depois)", item_type: "photo" as const, requires_photo: true },
      { title: "Avaliação da limpeza", item_type: "stars" as const },
    ],
  },
  {
    name: "Fechamento Gerência",
    sector: "gerencia" as const,
    description: "Checklist de fechamento gerencial do dia",
    items: [
      { title: "Caixa fechado e conferido", item_type: "checkbox" as const, is_critical: true },
      { title: "Diferença de caixa (R$)", item_type: "number" as const },
      { title: "Faltas de funcionários registradas", item_type: "checkbox" as const },
      { title: "Reclamações do dia anotadas", item_type: "text" as const },
      { title: "Avaliação geral do dia", item_type: "stars" as const },
    ],
  },
  {
    name: "Onboarding de Colaborador",
    sector: "gerencia" as const,
    description: "Checklist para integração de novos colaboradores",
    items: [
      { title: "Documentação entregue", item_type: "checkbox" as const, is_critical: true },
      { title: "Uniforme entregue", item_type: "checkbox" as const },
      { title: "Tour pelo estabelecimento", item_type: "checkbox" as const },
      { title: "Apresentação à equipe", item_type: "checkbox" as const },
      { title: "Treinamento de segurança", item_type: "checkbox" as const, is_critical: true },
      { title: "Assinatura do contrato", item_type: "checkbox" as const, is_critical: true },
      { title: "Foto do crachá", item_type: "photo" as const, requires_photo: true },
      { title: "Observações do gestor", item_type: "text" as const },
    ],
  },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadItems?: (items: LocalItem[]) => void;
  editorMode?: boolean;
}

export function TemplateLibraryDialog({ open, onOpenChange, onLoadItems, editorMode }: Props) {
  const { createChecklist } = useChecklists();
  const [loading, setLoading] = useState<string | null>(null);
  const [sectorFilter, setSectorFilter] = useState<ChecklistSector | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = BUILTIN_TEMPLATES.filter((tpl) => {
    if (sectorFilter !== "all" && tpl.sector !== sectorFilter) return false;
    if (search && !tpl.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleUseTemplate = async (template: (typeof BUILTIN_TEMPLATES)[0]) => {
    const mappedItems: LocalItem[] = template.items.map((item, idx) => ({
      title: item.title,
      item_type: item.item_type,
      is_critical: (item as any).is_critical || false,
      is_required: true,
      requires_photo: (item as any).requires_photo || false,
      sort_order: idx,
      min_value: (item as any).min_value ?? null,
      max_value: (item as any).max_value ?? null,
      training_instruction: null,
      training_video_url: null,
      options: null,
    }));

    if (editorMode && onLoadItems) {
      onLoadItems(mappedItems);
      onOpenChange(false);
      return;
    }

    // Legacy mode: create checklist directly
    setLoading(template.name);
    try {
      const checklist = await createChecklist({
        name: template.name,
        sector: template.sector,
        description: template.description,
      });
      const { supabase } = await import("@/integrations/supabase/client");
      const items = template.items.map((item, idx) => ({
        checklist_id: checklist.id,
        title: item.title,
        item_type: item.item_type,
        is_critical: (item as any).is_critical || false,
        is_required: true,
        requires_photo: (item as any).requires_photo || false,
        sort_order: idx,
        min_value: (item as any).min_value ?? null,
        max_value: (item as any).max_value ?? null,
        options: (item as any).options ?? null,
      }));
      await supabase.from("checklist_items").insert(items);
      onOpenChange(false);
    } catch {
    } finally {
      setLoading(null);
    }
  };

  const uniqueTypes = (items: typeof BUILTIN_TEMPLATES[0]["items"]) => {
    const types = new Set(items.map((i) => i.item_type));
    return Array.from(types);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Templates Prontos</DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar template..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            <Button
              variant={sectorFilter === "all" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setSectorFilter("all")}
            >
              Todos
            </Button>
            {(Object.keys(SECTOR_LABELS) as ChecklistSector[]).map((s) => (
              <Button
                key={s}
                variant={sectorFilter === s ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setSectorFilter(s)}
              >
                {SECTOR_LABELS[s]}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((tpl) => (
            <Card key={tpl.name} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{tpl.name}</span>
                  <Badge variant="secondary">{SECTOR_LABELS[tpl.sector]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{tpl.description}</p>

                {/* Type icons */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{tpl.items.length} itens</span>
                  <div className="flex gap-1">
                    {uniqueTypes(tpl.items).map((t) => {
                      const Icon = TYPE_ICONS[t];
                      return Icon ? <Icon key={t} className="h-3.5 w-3.5 text-muted-foreground" /> : null;
                    })}
                  </div>
                </div>

                {/* Preview first 3 items */}
                <div className="space-y-1">
                  {tpl.items.slice(0, 3).map((item, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="text-muted-foreground/40">•</span>
                      <span className="truncate">{item.title}</span>
                    </div>
                  ))}
                  {tpl.items.length > 3 && (
                    <span className="text-[10px] text-muted-foreground/60">
                      +{tpl.items.length - 3} mais...
                    </span>
                  )}
                </div>

                <Button
                  size="sm"
                  className="w-full"
                  disabled={loading === tpl.name}
                  onClick={() => handleUseTemplate(tpl)}
                >
                  {loading === tpl.name ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {editorMode ? "Carregar no Editor" : "Usar Template"}
                </Button>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-2 text-center py-8">
              Nenhum template encontrado.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
