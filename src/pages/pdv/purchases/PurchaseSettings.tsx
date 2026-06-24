import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Save, Hash, Users, MessageSquare, ShieldCheck, Smartphone } from "lucide-react";
import { usePurchaseSettings, type PurchaseSettings as PurchaseSettingsType } from "@/hooks/use-purchase-settings";
import { WhatsAppConnectionCard } from "@/components/pdv/settings/WhatsAppConnectionCard";

const TEMPLATE_VARS = [
  { key: "{fornecedor_nome}", label: "Nome do fornecedor" },
  { key: "{cotacao_numero}", label: "Número da cotação" },
  { key: "{prazo_resposta}", label: "Prazo de resposta" },
  { key: "{estabelecimento_nome}", label: "Nome do estabelecimento" },
  { key: "{data_cotacao}", label: "Data da cotação" },
];

function SectionWrapper({ id, title, description, icon: Icon, children }: {
  id: string; title: string; description: string;
  icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <section id={`section-${id}`} className="scroll-mt-20 rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function PurchaseSettingsContent() {
  const { settings, isLoading, saveSettings, isSaving } = usePurchaseSettings();
  const [state, setState] = useState<Omit<PurchaseSettingsType, "id" | "userId">>(toState(settings));

  useEffect(() => {
    setState(toState(settings));
  }, [settings]);

  const patch = (partial: Partial<Omit<PurchaseSettingsType, "id" | "userId">>) => {
    setState((prev) => ({ ...prev, ...partial }));
  };

  const insertTemplateVar = (variable: string) => {
    patch({ defaultMessageTemplate: state.defaultMessageTemplate + variable });
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Configurações de Compras</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Defina o comportamento padrão do módulo de compras e cotações.
          </p>
        </div>
        <Button onClick={() => saveSettings(state)} disabled={isSaving} size="default" className="shrink-0">
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      {/* Grid 2 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── COLUNA ESQUERDA ── */}
        <div className="space-y-4">
          {/* Numeração */}
          <SectionWrapper id="numeracao" title="Numeração de Documentos"
            description="Prefixo e número de dígitos gerados automaticamente." icon={Hash}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Cotações</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={state.quotationPrefix}
                    onChange={(e) => patch({ quotationPrefix: e.target.value.toUpperCase().slice(0, 6) })}
                    className="w-24 font-mono uppercase"
                    maxLength={6}
                    placeholder="COT"
                  />
                  <span className="text-muted-foreground text-sm">-</span>
                  <Input
                    type="number" min={3} max={8}
                    value={state.quotationDigits}
                    onChange={(e) => patch({ quotationDigits: Math.min(8, Math.max(3, +e.target.value)) })}
                    className="w-20"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    → ex: {state.quotationPrefix}-2026-{"0".repeat(state.quotationDigits - 1)}1
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Pedidos de Compra</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={state.orderPrefix}
                    onChange={(e) => patch({ orderPrefix: e.target.value.toUpperCase().slice(0, 6) })}
                    className="w-24 font-mono uppercase"
                    maxLength={6}
                    placeholder="PC"
                  />
                  <span className="text-muted-foreground text-sm">-</span>
                  <Input
                    type="number" min={3} max={8}
                    value={state.orderDigits}
                    onChange={(e) => patch({ orderDigits: Math.min(8, Math.max(3, +e.target.value)) })}
                    className="w-20"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    → ex: {state.orderPrefix}-2026-{"0".repeat(state.orderDigits - 1)}1
                  </span>
                </div>
              </div>
            </div>
          </SectionWrapper>

          {/* Fluxo de cotação */}
          <SectionWrapper id="cotacao" title="Fluxo de Cotação"
            description="Regras para criação e aprovação de cotações." icon={Users}>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label>Mínimo de fornecedores por cotação</Label>
                  <p className="text-xs text-muted-foreground">
                    Exige respostas de ao menos N fornecedores antes de aprovar
                  </p>
                </div>
                <Input
                  type="number" min={1} max={10}
                  value={state.minSuppliers}
                  onChange={(e) => patch({ minSuppliers: Math.max(1, +e.target.value) })}
                  className="w-20"
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label>Prazo padrão de resposta</Label>
                  <p className="text-xs text-muted-foreground">
                    Dias que o fornecedor tem para responder
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min={1} max={30}
                    value={state.defaultDeadlineDays}
                    onChange={(e) => patch({ defaultDeadlineDays: Math.max(1, +e.target.value) })}
                    className="w-20"
                  />
                  <span className="text-xs text-muted-foreground">dias</span>
                </div>
              </div>
            </div>
          </SectionWrapper>

          {/* Aprovação */}
          <SectionWrapper id="aprovacao" title="Aprovação de Pedidos"
            description="Controle de alçada para envio de pedidos de compra." icon={ShieldCheck}>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label>Exigir aprovação gerencial antes de enviar pedido</Label>
                <p className="text-xs text-muted-foreground">
                  Pedidos ficam com status "aguardando aprovação" até que um gerente ou proprietário confirme
                </p>
              </div>
              <Switch
                checked={state.requireManagerApproval}
                onCheckedChange={(v) => patch({ requireManagerApproval: v })}
              />
            </div>
          </SectionWrapper>
        </div>

        {/* ── COLUNA DIREITA ── */}
        <div className="space-y-4">
          {/* Template de mensagem */}
          <SectionWrapper id="mensagem" title="Template de Mensagem"
            description="Mensagem padrão enviada aos fornecedores ao abrir uma cotação." icon={MessageSquare}>
            <div className="space-y-3">
              <Textarea
                value={state.defaultMessageTemplate}
                onChange={(e) => patch({ defaultMessageTemplate: e.target.value })}
                placeholder={`Olá, {fornecedor_nome}.\n\nTemos uma nova cotação disponível:\n\nCotação: {cotacao_numero}\nEstabelecimento: {estabelecimento_nome}\nPrazo de resposta: {prazo_resposta}\n\nObrigado.`}
                className="min-h-[140px] font-mono text-sm"
                maxLength={1000}
              />
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Clique para inserir variável:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARS.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertTemplateVar(v.key)}
                      title={v.label}
                    >
                      <Badge variant="secondary" className="cursor-pointer hover:bg-muted text-xs font-mono">
                        {v.key}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-right">
                {state.defaultMessageTemplate.length}/1000
              </p>
            </div>
          </SectionWrapper>

          {/* WhatsApp para cotações */}
          <SectionWrapper id="whatsapp" title="WhatsApp para Cotações"
            description="Configure o número usado para enviar cotações aos fornecedores." icon={Smartphone}>
            <div className="space-y-4">
              {/* Card de conexão existente */}
              <WhatsAppConnectionCard />

              {/* Switch ativar */}
              <div className="flex items-center justify-between gap-4 pt-3 border-t border-border">
                <div className="space-y-1">
                  <Label>Ativar envio de cotações por WhatsApp</Label>
                  <p className="text-xs text-muted-foreground">
                    Permite enviar cotações para fornecedores diretamente pelo sistema
                  </p>
                </div>
                <Switch
                  checked={state.whatsappEnabled}
                  onCheckedChange={(v) => patch({ whatsappEnabled: v })}
                />
              </div>

              {state.whatsappEnabled && (
                <div className="space-y-3 pl-4 border-l-2 border-muted">
                  <div className="space-y-1.5">
                    <Label>Preferência de envio</Label>
                    <Select
                      value={state.whatsappSendMode}
                      onValueChange={(v) => patch({ whatsappSendMode: v as PurchaseSettingsType["whatsappSendMode"] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp_only">Somente WhatsApp</SelectItem>
                        <SelectItem value="whatsapp_email">WhatsApp + E-mail</SelectItem>
                        <SelectItem value="manual">Manual (apenas visualizar)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {state.whatsappSendMode === "whatsapp_only" && "Cotações serão enviadas apenas via WhatsApp para os fornecedores."}
                      {state.whatsappSendMode === "whatsapp_email" && "Cotações serão enviadas por WhatsApp e também por e-mail, quando disponível."}
                      {state.whatsappSendMode === "manual" && "O sistema mostrará as informações, mas o envio fica a cargo do operador."}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm">Telefone para teste (opcional)</Label>
                    <Input
                      placeholder="+55 11 99999-0000"
                      value={state.whatsappTestPhone}
                      onChange={(e) => patch({ whatsappTestPhone: e.target.value })}
                      className="h-9"
                    />
                    <p className="text-xs text-muted-foreground">
                      Número para enviar uma mensagem de teste e confirmar que a integração está funcionando.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </SectionWrapper>
        </div>
      </div>
    </div>
  );
}

export default PurchaseSettingsContent;

function toState(s: PurchaseSettingsType): Omit<PurchaseSettingsType, "id" | "userId"> {
  const { id, userId, ...rest } = s;
  return rest;
}
