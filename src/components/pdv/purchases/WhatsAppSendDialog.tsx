import { useState, useMemo, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { MessageCircle, Check, Loader2, Copy, Link2, ChevronDown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { QuotationRequest } from "@/hooks/use-pdv-quotations";
import { usePDVIngredientSuppliers } from "@/hooks/use-pdv-ingredient-suppliers";
import { generateQuotationMessage } from "@/lib/whatsapp-message";
import { usePurchaseSettings } from "@/hooks/use-purchase-settings";
import { useBusinessSettings } from "@/hooks/use-business-settings";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { usePDVSettings } from "@/hooks/use-pdv-settings";
import { useWhatsAppConnection } from "@/hooks/use-whatsapp-connection";
import { TemplatePreview } from "@/components/pdv/whatsapp/TemplatePreview";
import { TEMPLATE_COTACAO, achatarParametro, conferirParametros } from "@/lib/whatsapp-templates";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

interface WhatsAppSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation: QuotationRequest;
}

interface SupplierWithItems {
  id: string;
  name: string;
  phone: string | null;
  items: Array<{
    ingredientId: string;
    ingredientName: string;
    quantity: number;
    unit: string;
  }>;
}

/** Número de contato do fornecedor: prioriza WhatsApp, cai para telefone. */
function supplierContactNumber(s: { whatsapp?: string | null; phone?: string | null }) {
  return (s.whatsapp && s.whatsapp.trim()) || (s.phone && s.phone.trim()) || "";
}

export function WhatsAppSendDialog({
  open,
  onOpenChange,
  quotation,
}: WhatsAppSendDialogProps) {
  const { ingredientSuppliers } = usePDVIngredientSuppliers();
  // Template escrito em Compras > Configurações e nome do estabelecimento:
  // é o que substitui o texto fixo que ia para o fornecedor.
  const { settings: purchaseSettings } = usePurchaseSettings();
  const { settings: businessSettings } = useBusinessSettings();
  // CNPJ e cidade vivem em pdv_settings (dados fiscais), não em business_settings.
  const { settings: pdvSettings } = usePDVSettings();
  const { connection } = useWhatsAppConnection();
  // No número oficial da Velara a Meta só aceita modelo aprovado: o texto
  // montado abaixo não é o que chega ao fornecedor.
  const canalOficial = connection?.provider === "sellgrid" || connection?.provider === "cloud";
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [links, setLinks] = useState<{ supplierId: string; name?: string; url: string }[]>([]);
  const [qrFor, setQrFor] = useState<string | null>(null);
  /** Lista de itens aberta por fornecedor. Fechada por padrão: seis chips por
   *  linha viravam uma parede que escondia o resto do diálogo. */
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  /** Resultado do último envio, por fornecedor — o que substitui o "deu certo?" */
  const [enviados, setEnviados] = useState<Set<string>>(new Set());
  const [erros, setErros] = useState<Record<string, string>>({});

  // Fetch saved suppliers for this quotation's items
  const { data: savedItemSuppliers = [] } = useQuery({
    queryKey: ["quotation-item-suppliers", quotation.id],
    queryFn: async () => {
      const itemIds = quotation.items?.map((i) => i.id) || [];
      if (itemIds.length === 0) return [];

      const { data, error } = await supabase
        .from("pdv_quotation_item_suppliers")
        .select(`
          id,
          quotation_item_id,
          supplier_id,
          sent_at,
          supplier:pdv_suppliers(id, name, phone, whatsapp, is_active)
        `)
        .in("quotation_item_id", itemIds);

      if (error) throw error;
      return data || [];
    },
    enabled: open && !!quotation.items?.length,
  });

  // Check if we have saved suppliers or should fallback to ingredient suppliers
  const hasSavedSuppliers = savedItemSuppliers.length > 0;

  // Get suppliers for each ingredient in the quotation
  const suppliersWithItems = useMemo(() => {
    const supplierMap = new Map<string, SupplierWithItems>();

    if (hasSavedSuppliers) {
      // Use saved suppliers from pdv_quotation_item_suppliers
      savedItemSuppliers.forEach((itemSupplier) => {
        const item = quotation.items?.find((i) => i.id === itemSupplier.quotation_item_id);
        if (!item || !itemSupplier.supplier) return;

        const supplier = itemSupplier.supplier as {
          id: string; name: string; phone: string | null; whatsapp: string | null; is_active?: boolean | null;
        };
        // Fornecedor desativado não entra na lista. O vínculo em
        // pdv_quotation_item_suppliers é histórico e continua existindo depois
        // da desativação — sem este filtro, quem foi desligado segue recebendo
        // cotação, que foi o que aconteceu com um fornecedor em 08/09/2026.
        if (supplier.is_active === false) return;
        const contact = supplierContactNumber(supplier);
        if (!contact) return;

        const existing = supplierMap.get(supplier.id);
        if (existing) {
          existing.items.push({
            ingredientId: item.ingredient_id,
            ingredientName: item.ingredient?.name || "",
            quantity: item.quantity_needed,
            unit: item.unit,
          });
        } else {
          supplierMap.set(supplier.id, {
            id: supplier.id,
            name: supplier.name,
            phone: contact,
            items: [
              {
                ingredientId: item.ingredient_id,
                ingredientName: item.ingredient?.name || "",
                quantity: item.quantity_needed,
                unit: item.unit,
              },
            ],
          });
        }
      });
    } else {
      // Fallback: use all ingredient suppliers (old behavior)
      quotation.items?.forEach((item) => {
        const linkedSuppliers = ingredientSuppliers.filter(
          (is) => is.ingredient_id === item.ingredient_id && supplierContactNumber(is.supplier ?? {})
        );

        linkedSuppliers.forEach((link) => {
          if (!link.supplier) return;

          const existing = supplierMap.get(link.supplier_id);
          if (existing) {
            existing.items.push({
              ingredientId: item.ingredient_id,
              ingredientName: item.ingredient?.name || "",
              quantity: item.quantity_needed,
              unit: item.unit,
            });
          } else {
            supplierMap.set(link.supplier_id, {
              id: link.supplier_id,
              name: link.supplier.name,
              phone: supplierContactNumber(link.supplier),
              items: [
                {
                  ingredientId: item.ingredient_id,
                  ingredientName: item.ingredient?.name || "",
                  quantity: item.quantity_needed,
                  unit: item.unit,
                },
              ],
            });
          }
        });
      });
    }

    return Array.from(supplierMap.values());
  }, [quotation.items, ingredientSuppliers, savedItemSuppliers, hasSavedSuppliers]);

  // Auto-select all suppliers when dialog opens (if we have saved suppliers)
  useEffect(() => {
    if (open && hasSavedSuppliers && suppliersWithItems.length > 0) {
      setSelectedSuppliers(new Set(suppliersWithItems.map((s) => s.id)));
    }
  }, [open, hasSavedSuppliers, suppliersWithItems]);

  // Limpa os links/QR ao reabrir o diálogo
  useEffect(() => {
    if (open) {
      setLinks([]); setQrFor(null); setExpandido(new Set());
      setEnviados(new Set()); setErros({});
    }
  }, [open]);

  /**
   * Valores do modelo `solicitar_cotacao` para um fornecedor.
   *
   * A MESMA função alimenta o preview na tela e o payload do envio. Se fossem
   * duas, uma acabaria desatualizada e o lojista veria uma mensagem diferente
   * da que o fornecedor recebe — que é o defeito que este preview existe para
   * não ter.
   */
  const valoresCotacao = useCallback(
    (alvo: SupplierWithItems): string[] => {
      // Cidade vem do cadastro GERAL primeiro; o endereço fiscal é só reserva.
      // Quem ainda não emite nota não tem endereço fiscal (ele exige
      // certificado digital), e isso bloqueava a cotação por WhatsApp inteira.
      const fiscal = pdvSettings?.nfe_endereco_fiscal as { cidade?: string; uf?: string } | null;
      const cidade = [
        (pdvSettings as any)?.business_city || fiscal?.cidade,
        (pdvSettings as any)?.business_state || fiscal?.uf,
      ]
        .filter(Boolean)
        .join(" - ");
      const nomeCasa = pdvSettings?.business_name || businessSettings?.business_name || "";
      const prazo = quotation.deadline ? parseISO(quotation.deadline) : null;
      const qtd = alvo.items.length;
      return [
        achatarParametro(alvo.name),
        achatarParametro(nomeCasa),
        achatarParametro(pdvSettings?.business_cnpj),
        achatarParametro(cidade),
        prazo ? format(prazo, "dd/MM/yyyy") : "",
        `${qtd} ${qtd === 1 ? "item" : "itens"}`,
        achatarParametro(nomeCasa ? `Setor de Compras do ${nomeCasa}` : ""),
      ];
    },
    [pdvSettings, businessSettings, quotation.deadline],
  );

  /**
   * Variáveis faltando nos fornecedores selecionados.
   *
   * A Meta recusa a mensagem INTEIRA quando um parâmetro chega vazio — não é um
   * campo em branco no texto, é o envio não sair. E o erro que volta é genérico,
   * então o lojista descobre pelo fornecedor que nunca respondeu.
   *
   * Como os valores vêm do cadastro do estabelecimento (cidade fiscal, CNPJ),
   * o problema é o MESMO para todos os fornecedores: basta conferir um.
   */
  const problemasModelo = useMemo(() => {
    if (!canalOficial) return [];
    const alvo =
      suppliersWithItems.find((s) => selectedSuppliers.has(s.id)) ?? suppliersWithItems[0];
    if (!alvo) return [];
    return conferirParametros(TEMPLATE_COTACAO, valoresCotacao(alvo));
  }, [canalOficial, suppliersWithItems, selectedSuppliers, valoresCotacao]);

  const previewCotacao = useMemo(() => {
    const alvo =
      suppliersWithItems.find((s) => selectedSuppliers.has(s.id)) ?? suppliersWithItems[0];
    if (!alvo) return null;
    return {
      fornecedor: alvo,
      valores: valoresCotacao(alvo),
      // O token só existe depois de gerar o link; antes disso o botão fica sem
      // destino visível, e é honesto mostrar assim.
      token: links.find((l) => l.supplierId === alvo.id)?.url.split("/").pop(),
    };
  }, [suppliersWithItems, selectedSuppliers, valoresCotacao, links]);

  const handleToggleSupplier = (supplierId: string) => {
    const newSelected = new Set(selectedSuppliers);
    if (newSelected.has(supplierId)) {
      newSelected.delete(supplierId);
    } else {
      newSelected.add(supplierId);
    }
    setSelectedSuppliers(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedSuppliers.size === suppliersWithItems.length) {
      setSelectedSuppliers(new Set());
    } else {
      setSelectedSuppliers(new Set(suppliersWithItems.map((s) => s.id)));
    }
  };

  const buildSuppliersPayload = (onlySelectedWithPhone: boolean) => {
    // deadline é uma coluna DATE ("yyyy-MM-dd"): new Date() a lê como UTC e
    // volta um dia em BRT. parseISO mantém a data no fuso local.
    const deadline = quotation.deadline ? parseISO(quotation.deadline) : new Date();
    const chosen = suppliersWithItems.filter(
      (s) => selectedSuppliers.has(s.id) && (onlySelectedWithPhone ? s.phone : true)
    );
    return chosen.map((supplier) => {
      // A mensagem é montada por fornecedor, a partir dos itens que ELE foi
      // convidado a cotar. Nunca a lista inteira da cotação.
      const message = generateQuotationMessage(
        supplier.items.map((item) => ({
          ingredientName: item.ingredientName,
          quantity: item.quantity,
          unit: item.unit,
        })),
        deadline,
        businessSettings?.business_name || undefined,
        quotation.request_number || undefined,
        {
          template: purchaseSettings?.defaultMessageTemplate,
          supplierName: supplier.name,
          quotationDate: quotation.created_at ? parseISO(quotation.created_at) : undefined,
        }
      );
      return {
        supplierId: supplier.id,
        name: supplier.name,
        phone: supplier.phone || "",
        message,
        // Usados só quando o envio sai pelo número oficial: ali a Meta exige
        // modelo aprovado e ignora o texto acima.
        templateParams: valoresCotacao(supplier),
      };
    });
  };

  const handleSend = async () => {
    const suppliersPayload = buildSuppliersPayload(true);
    // Selecionar só fornecedor sem WhatsApp mandava uma lista vazia para a edge
    // e voltava um 400 sem explicação. Aqui a saída é dizer o que fazer.
    if (suppliersPayload.length === 0) {
      toast.error(
        "Nenhum dos selecionados tem WhatsApp cadastrado. Use \"Só gerar os links\" para enviar por outro caminho.",
      );
      return;
    }
    const itemIds = quotation.items?.map((i) => i.id) || [];

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-quotation-whatsapp", {
        body: {
          quotationId: quotation.id,
          suppliers: suppliersPayload,
          itemIds,
        },
      });

      if (error) throw error;

      if (data?.code === "NO_WHATSAPP_CONNECTION") {
        toast.error("WhatsApp não conectado. Conecte nas configurações antes de enviar.");
        return;
      }

      if (data?.sent > 0) {
        toast.success(
          `${data.sent} link${data.sent > 1 ? "s" : ""} enviado${data.sent > 1 ? "s" : ""} por WhatsApp!`
        );
      }
      // A edge devolve `errors` com um item para cada fornecedor que NÃO saiu
      // (sem telefone, sem link, falha no envio). Enviado é o complemento —
      // não precisa de campo novo no contrato.
      const falhou = new Set(
        ((data?.errors ?? []) as { supplierId: string }[]).map((e) => e.supplierId),
      );
      setEnviados(new Set(suppliersPayload.map((s) => s.supplierId).filter((id) => !falhou.has(id))));

      if (data?.errors?.length > 0) {
        toast.warning(`${data.errors.length} envio(s) falharam. Use o link para enviar por outro caminho.`);
        setErros(
          Object.fromEntries(
            (data.errors as { supplierId: string; error: string }[]).map((e) => [e.supplierId, e.error]),
          ),
        );
      } else {
        setErros({});
      }
      // Mantém o diálogo aberto exibindo os links (copiar/QR).
      if (Array.isArray(data?.links)) setLinks(data.links);
    } catch (err: unknown) {
      console.error("Error sending quotation via WhatsApp:", err);
      const message = err && typeof err === "object" && "message" in err
        ? (err as { message: string }).message
        : "Erro ao enviar mensagens";
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  };

  const handleGenerateLinks = async () => {
    const suppliersPayload = buildSuppliersPayload(false);
    if (suppliersPayload.length === 0) {
      toast.error("Selecione ao menos um fornecedor.");
      return;
    }
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-quotation-whatsapp", {
        body: { quotationId: quotation.id, suppliers: suppliersPayload, generateOnly: true },
      });
      if (error) throw error;
      if (Array.isArray(data?.links)) {
        setLinks(data.links);
        toast.success("Links gerados. Copie ou mostre o QR ao fornecedor.");
      }
    } catch (err) {
      toast.error("Não foi possível gerar os links.");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  const totalItens = quotation.items?.length ?? 0;
  /** Dos selecionados, quantos de fato recebem por WhatsApp. É esse o número
   *  que o botão promete — prometer 3 e enviar 2 é o que gera desconfiança. */
  const selecionadosComWhats = suppliersWithItems.filter(
    (s) => selectedSuppliers.has(s.id) && s.phone,
  ).length;
  const jaEnviou = enviados.size > 0 || Object.keys(erros).length > 0;

  const alternarExpandido = (id: string) =>
    setExpandido((v) => {
      const n = new Set(v);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const linkDe = (id: string) => links.find((l) => l.supplierId === id)?.url;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col sm:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <WhatsAppIcon className="h-5 w-5 text-green-600" />
            Enviar cotação
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Cada fornecedor recebe um link para preencher os preços num formulário · ninguém
            precisa responder por mensagem.
          </p>
        </DialogHeader>

        {suppliersWithItems.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <MessageCircle className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p className="font-medium">Nenhum fornecedor vinculado aos itens desta cotação.</p>
            <p className="mt-2 text-sm">
              Vincule fornecedores aos insumos no cadastro de estoque e volte aqui.
            </p>
          </div>
        ) : (
          /* Duas colunas no desktop: a prévia da mensagem fica à vista enquanto
             se escolhe quem recebe. Antes ela vivia no fim de uma rolagem longa,
             e ninguém a via antes de clicar em enviar. */
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex min-h-0 flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <strong>{selectedSuppliers.size}</strong> de {suppliersWithItems.length}{" "}
                  fornecedor(es)
                  <span className="text-muted-foreground"> · {totalItens} itens na cotação</span>
                </div>
                <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                  {selectedSuppliers.size === suppliersWithItems.length
                    ? "Desmarcar todos"
                    : "Selecionar todos"}
                </Button>
              </div>

              {hasSavedSuppliers && (
                <p className="text-xs text-muted-foreground">
                  Só os fornecedores escolhidos na criação da cotação.
                </p>
              )}

              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
                {suppliersWithItems.map((supplier) => {
                  const marcado = selectedSuppliers.has(supplier.id);
                  const temWhats = !!supplier.phone;
                  const aberto = expandido.has(supplier.id);
                  const url = linkDe(supplier.id);
                  const erro = erros[supplier.id];
                  const enviado = enviados.has(supplier.id);

                  return (
                    <div
                      key={supplier.id}
                      className={cn(
                        "rounded-lg border transition-colors",
                        marcado ? "border-primary/50 bg-primary/5" : "hover:bg-muted/40",
                      )}
                    >
                      <div className="flex items-center gap-3 p-3">
                        <Checkbox
                          checked={marcado}
                          onCheckedChange={() => handleToggleSupplier(supplier.id)}
                          aria-label={`Selecionar ${supplier.name}`}
                        />
                        <button
                          type="button"
                          onClick={() => handleToggleSupplier(supplier.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{supplier.name}</span>
                            {enviado && (
                              <Badge className="gap-1 border-0 bg-emerald-100 text-[10px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                <Check className="h-3 w-3" /> enviado
                              </Badge>
                            )}
                            {erro && (
                              <Badge variant="destructive" className="text-[10px]">falhou</Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {temWhats ? supplier.phone : "sem WhatsApp · só por link"}
                          </span>
                          {erro && <p className="mt-0.5 text-xs text-destructive">{erro}</p>}
                        </button>

                        {/* Contagem no lugar da parede de chips. Quem quiser ver
                            os produtos abre; a maioria só quer saber quantos. */}
                        <button
                          type="button"
                          onClick={() => alternarExpandido(supplier.id)}
                          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                        >
                          {supplier.items.length} {supplier.items.length === 1 ? "item" : "itens"}
                          <ChevronDown
                            className={cn("h-3.5 w-3.5 transition-transform", aberto && "rotate-180")}
                          />
                        </button>
                      </div>

                      {aberto && (
                        <div className="flex flex-wrap gap-1 border-t px-3 py-2">
                          {supplier.items.map((item, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs font-normal">
                              {item.ingredientName}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {url && (
                        <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
                          <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                            {url}
                          </span>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copyLink(url)}>
                            <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => setQrFor(qrFor === supplier.id ? null : supplier.id)}
                          >
                            QR
                          </Button>
                          {qrFor === supplier.id && (
                            <div className="flex w-full justify-center rounded bg-white py-2">
                              <QRCodeSVG value={url} size={150} level="H" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Prévia: no desktop fica ao lado; no celular, depois da lista. */}
            <div className="min-h-0 overflow-y-auto lg:pl-1">
              {canalOficial && previewCotacao ? (
                <>
                  <TemplatePreview
                    template={TEMPLATE_COTACAO}
                    valores={previewCotacao.valores}
                    contato={previewCotacao.fornecedor.name}
                    variavelDoBotao={previewCotacao.token}
                  />
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    Exemplo com <strong>{previewCotacao.fornecedor.name}</strong>. Cada um recebe a
                    mesma mensagem, com o próprio nome, a própria contagem de itens e o próprio link.
                  </p>
                </>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  A prévia da mensagem aparece aqui quando o envio é feito pelo número oficial.
                </div>
              )}
            </div>
          </div>
        )}

        {suppliersWithItems.length > 0 && (
          <DialogFooter className="shrink-0 flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            {/* A ação secundária ganhou explicação: antes eram dois botões sem
                diferença aparente, e a pessoa escolhia no chute. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGenerateLinks}
              disabled={selectedSuppliers.size === 0 || isGenerating || isSending}
              className="text-muted-foreground"
            >
              {isGenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-2 h-4 w-4" />
              )}
              Só gerar os links
              <span className="ml-1.5 hidden text-xs opacity-70 sm:inline">
                para mandar por outro caminho
              </span>
            </Button>

            <div className="flex items-center gap-2">
              {problemasModelo.length > 0 && (
                <div className="mr-auto flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="min-w-0">
                    <p className="font-medium text-amber-900 dark:text-amber-200">
                      Falta preencher {problemasModelo.map((p) => p.rotulo).join(", ")}
                    </p>
                    <p className="text-amber-800/80 dark:text-amber-200/70">
                      O WhatsApp oficial recusa a mensagem inteira quando um campo do modelo vem
                      vazio. Cidade e CNPJ ficam em Configurações · Fiscal · Endereço fiscal.
                    </p>
                  </div>
                </div>
              )}

              {selecionadosComWhats < selectedSuppliers.size && (
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {selectedSuppliers.size - selecionadosComWhats} sem WhatsApp
                </span>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending || isGenerating}>
                {jaEnviou ? "Concluir" : "Cancelar"}
              </Button>
              <Button
                onClick={handleSend}
                disabled={selecionadosComWhats === 0 || isSending || problemasModelo.length > 0}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                {isSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <WhatsAppIcon className="mr-2 h-4 w-4" />
                    {jaEnviou ? "Enviar de novo" : `Enviar para ${selecionadosComWhats}`}
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
