import { useState, useMemo, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { MessageCircle, Check, Loader2, Copy, Link2 } from "lucide-react";
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
import { TEMPLATE_COTACAO, achatarParametro } from "@/lib/whatsapp-templates";
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
          supplier:pdv_suppliers(id, name, phone, whatsapp)
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

        const supplier = itemSupplier.supplier as { id: string; name: string; phone: string | null; whatsapp: string | null };
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
    if (open) { setLinks([]); setQrFor(null); }
  }, [open]);

  /**
   * Valores do modelo `cotacao_fornecedor` para um fornecedor.
   *
   * A MESMA função alimenta o preview na tela e o payload do envio. Se fossem
   * duas, uma acabaria desatualizada e o lojista veria uma mensagem diferente
   * da que o fornecedor recebe — que é o defeito que este preview existe para
   * não ter.
   */
  const valoresCotacao = useCallback(
    (alvo: SupplierWithItems): string[] => {
      const endereco = pdvSettings?.nfe_endereco_fiscal;
      const cidade = [endereco?.cidade, endereco?.uf].filter(Boolean).join(" - ");
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
      if (data?.errors?.length > 0) {
        toast.warning(`${data.errors.length} envio(s) falharam. Use o link/QR abaixo para enviar manualmente.`);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <WhatsAppIcon className="h-5 w-5 text-green-600" />
            Enviar Cotação via WhatsApp
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Cada fornecedor recebe um <strong>link</strong> para preencher os preços num
            formulário. Nada de responder por mensagem.
          </p>
        </DialogHeader>

        {/* Área rolável única: cabeçalho e rodapé ficam fixos, o miolo desce. */}
        <div className="space-y-4 flex-1 min-h-0 overflow-y-auto -mr-2 pr-2">
          {suppliersWithItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum fornecedor vinculado aos ingredientes desta cotação.</p>
              <p className="text-sm mt-2">
                Vincule fornecedores aos ingredientes no cadastro de estoque.
              </p>
            </div>
          ) : (
            <>
              {hasSavedSuppliers && (
                <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                  Mostrando apenas os fornecedores selecionados durante a criação da cotação.
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {selectedSuppliers.size} de {suppliersWithItems.length} selecionado(s)
                </span>
                <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                  {selectedSuppliers.size === suppliersWithItems.length
                    ? "Desmarcar Todos"
                    : "Selecionar Todos"}
                </Button>
              </div>

              <div className="space-y-2">
                  {suppliersWithItems.map((supplier) => {
                    const isSelected = selectedSuppliers.has(supplier.id);
                    const hasPhone = !!supplier.phone;

                    return (
                      <div
                        key={supplier.id}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          isSelected ? "border-primary bg-primary/5" : ""
                        } ${!hasPhone ? "opacity-50" : ""}`}
                        onClick={() => hasPhone && handleToggleSupplier(supplier.id)}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={isSelected}
                            disabled={!hasPhone}
                            onCheckedChange={() =>
                              hasPhone && handleToggleSupplier(supplier.id)
                            }
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{supplier.name}</span>
                              {!hasPhone && (
                                <Badge variant="secondary" className="text-xs">
                                  Sem WhatsApp
                                </Badge>
                              )}
                            </div>
                            {hasPhone && (
                              <span className="text-sm text-muted-foreground">
                                {supplier.phone}
                              </span>
                            )}
                          </div>
                          {isSelected && <Check className="h-4 w-4 text-primary" />}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {supplier.items.map((item, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {item.ingredientName}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {canalOficial && previewCotacao && (
                <div className="rounded-lg border p-3">
                  <TemplatePreview
                    template={TEMPLATE_COTACAO}
                    valores={previewCotacao.valores}
                    variavelDoBotao={previewCotacao.token}
                  />
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Exemplo com <strong>{previewCotacao.fornecedor.name}</strong>. Cada
                    fornecedor recebe a mesma mensagem, com o próprio nome, a própria
                    contagem de itens e o próprio link.
                  </p>
                </div>
              )}

              {links.length > 0 && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Link2 className="h-4 w-4 text-primary" />
                    Links dos fornecedores
                  </div>
                  {links.map((l) => (
                    <div key={l.supplierId} className="rounded-md bg-muted/50 p-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium flex-1 truncate">{l.name || "Fornecedor"}</span>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copyLink(l.url)}>
                          <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => setQrFor(qrFor === l.supplierId ? null : l.supplierId)}
                        >
                          QR
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground break-all">{l.url}</p>
                      {qrFor === l.supplierId && (
                        <div className="flex justify-center py-2 bg-white rounded">
                          <QRCodeSVG value={l.url} size={160} level="H" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending || isGenerating}>
            Fechar
          </Button>
          <Button
            variant="outline"
            onClick={handleGenerateLinks}
            disabled={selectedSuppliers.size === 0 || isGenerating || isSending}
          >
            {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
            Gerar links
          </Button>
          <Button
            onClick={handleSend}
            disabled={selectedSuppliers.size === 0 || isSending}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <WhatsAppIcon className="h-4 w-4 mr-2" />
                Enviar link ({selectedSuppliers.size})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
