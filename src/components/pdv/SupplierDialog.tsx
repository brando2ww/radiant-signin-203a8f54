import { useCallback, useEffect, useState } from "react";

/**
 * Remove resíduos do Radix Dialog/Sheet que podem travar a página
 * caso algum overlay/scroll-lock não seja limpo no fechamento.
 * Só atua se não houver outro dialog/sheet aberto na tela.
 */
function cleanupRadixResiduals() {
  if (typeof document === "undefined") return;
  const hasOpenDialog = document.querySelector(
    '[role="dialog"][data-state="open"], [data-radix-portal] [data-state="open"]'
  );
  if (hasOpenDialog) return;

  const body = document.body;
  if (body.style.pointerEvents === "none") body.style.pointerEvents = "";
  if (body.style.overflow === "hidden") body.style.overflow = "";
  body.removeAttribute("data-scroll-locked");

  // Remove overlays órfãos já fechados que possam estar interceptando cliques
  document
    .querySelectorAll('[data-state="closed"][data-radix-dialog-overlay]')
    .forEach((el) => el.remove());
}
import { useForm } from "react-hook-form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocumentInput } from "@/components/ui/document-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { CEPInput } from "@/components/ui/cep-input";
import { PDVSupplier } from "@/hooks/use-pdv-suppliers";
import { useCEPLookup } from "@/hooks/use-cep-lookup";
import { Loader2, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { SUPPLIER_CATEGORIES } from "@/components/pdv/SupplierFilters";

interface SupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: PDVSupplier | null;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}

export function SupplierDialog({
  open,
  onOpenChange,
  supplier,
  onSubmit,
  isSubmitting,
}: SupplierDialogProps) {
  const { register, handleSubmit, reset, watch, setValue } = useForm({
    defaultValues: {
      name: "",
      company_name: "",
      document_type: "cnpj",
      cnpj: "",
      cpf: "",
      state_registration: "",
      municipal_registration: "",
      contact_name: "",
      phone: "",
      whatsapp: "",
      email: "",
      zip_code: "",
      address: "",
      city: "",
      state: "",
      neighborhood: "",
      address_complement: "",
      ibge_code: "",
      is_billing_address: false,
      notes: "",
      commercial_notes: "",
      financial_notes: "",
      payment_terms: "",
      delivery_time: "",
      delivery_time_unit: "days",
      credit_limit: "",
      preferred_payment_method: "",
      category: "",
      is_active: true,
    },
  });

  const { lookupCEP, isLoading: isLoadingCEP } = useCEPLookup();
  const [documentType, setDocumentType] = useState<"cnpj" | "cpf">("cnpj");
  
  const isActive = watch("is_active");
  const isBillingAddress = watch("is_billing_address");
  const zipCode = watch("zip_code");
  const cnpjValue = watch("cnpj");
  const cpfValue = watch("cpf");

  useEffect(() => {
    if (supplier) {
      const hasDocument = supplier.cnpj || supplier.cpf;
      const docType = supplier.cnpj ? "cnpj" : "cpf";
      setDocumentType(docType);
      
      reset({
        name: supplier.name,
        company_name: supplier.company_name || "",
        document_type: docType,
        cnpj: supplier.cnpj || "",
        cpf: supplier.cpf || "",
        state_registration: supplier.state_registration || "",
        municipal_registration: supplier.municipal_registration || "",
        contact_name: supplier.contact_name || "",
        phone: supplier.phone || "",
        whatsapp: supplier.whatsapp || "",
        email: supplier.email || "",
        zip_code: supplier.zip_code || "",
        address: supplier.address || "",
        city: supplier.city || "",
        state: supplier.state || "",
        neighborhood: supplier.neighborhood || "",
        address_complement: supplier.address_complement || "",
        ibge_code: supplier.ibge_code || "",
        is_billing_address: supplier.is_billing_address || false,
        notes: supplier.notes || "",
        commercial_notes: supplier.commercial_notes || "",
        financial_notes: supplier.financial_notes || "",
        payment_terms: supplier.payment_terms || "",
        delivery_time: supplier.delivery_time?.toString() || "",
        delivery_time_unit: supplier.delivery_time_unit || "days",
        credit_limit: supplier.credit_limit?.toString() || "",
        preferred_payment_method: supplier.preferred_payment_method || "",
        category: supplier.category || "",
        is_active: supplier.is_active,
      });
    } else {
      reset({
        name: "",
        company_name: "",
        document_type: "cnpj",
        cnpj: "",
        cpf: "",
        state_registration: "",
        municipal_registration: "",
        contact_name: "",
        phone: "",
        whatsapp: "",
        email: "",
        zip_code: "",
        address: "",
        city: "",
        state: "",
        neighborhood: "",
        address_complement: "",
        ibge_code: "",
        is_billing_address: false,
        notes: "",
        commercial_notes: "",
        financial_notes: "",
        payment_terms: "",
        delivery_time: "",
        delivery_time_unit: "days",
        credit_limit: "",
        preferred_payment_method: "",
        category: "",
        is_active: true,
      });
      setDocumentType("cnpj");
    }
  }, [supplier, reset, open]);

  const handleCEPLookup = async () => {
    if (!zipCode) return;
    
    const data = await lookupCEP(zipCode);
    if (data) {
      setValue("address", data.logradouro);
      setValue("neighborhood", data.bairro);
      setValue("city", data.localidade);
      setValue("state", data.uf);
      setValue("ibge_code", data.ibge);
    }
  };

  const handleFormSubmit = (data: any) => {
    const formData = {
      ...data,
      cnpj: documentType === "cnpj" ? data.cnpj : null,
      cpf: documentType === "cpf" ? data.cpf : null,
      category: data.category || null,
      delivery_time: data.delivery_time ? parseInt(data.delivery_time) : null,
      credit_limit: data.credit_limit ? parseFloat(data.credit_limit) : null,
    };
    delete formData.document_type;
    onSubmit(formData);
  };

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Roda após a animação de fechamento do Sheet (~300ms)
    setTimeout(cleanupRadixResiduals, 350);
  }, [onOpenChange]);

  // Cleanup defensivo no unmount
  useEffect(() => {
    return () => {
      setTimeout(cleanupRadixResiduals, 0);
    };
  }, []);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          handleClose();
        } else {
          onOpenChange(o);
        }
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl p-0 flex flex-col gap-0"
      >
        <SheetHeader className="px-6 py-4 border-b shrink-0 space-y-1 text-left">
          <SheetTitle>
            {supplier ? "Editar Fornecedor" : "Novo Fornecedor"}
          </SheetTitle>
          <SheetDescription>
            {supplier
              ? "Atualize as informações do fornecedor"
              : "Cadastre um novo fornecedor"}
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="flex-1 overflow-y-auto px-6 py-4">
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="general">Dados Gerais</TabsTrigger>
              <TabsTrigger value="address">Endereço</TabsTrigger>
              <TabsTrigger value="commercial">Comercial</TabsTrigger>
              <TabsTrigger value="notes">Observação</TabsTrigger>
              <TabsTrigger value="financial">Financeiro</TabsTrigger>
              <TabsTrigger value="contacts">Contatos</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="name">Nome Fantasia *</Label>
                  <Input
                    id="name"
                    {...register("name", { required: true })}
                    placeholder="Nome do fornecedor"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="company_name">Razão Social</Label>
                  <Input
                    id="company_name"
                    {...register("company_name")}
                    placeholder="Razão social da empresa"
                  />
                </div>

                <div className="col-span-2">
                  <Label>Documento</Label>
                  <RadioGroup
                    value={documentType}
                    onValueChange={(value) => setDocumentType(value as "cnpj" | "cpf")}
                    className="flex gap-4 mt-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="cnpj" id="cnpj-radio" />
                      <Label htmlFor="cnpj-radio">CNPJ</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="cpf" id="cpf-radio" />
                      <Label htmlFor="cpf-radio">CPF</Label>
                    </div>
                  </RadioGroup>
                </div>

                {documentType === "cnpj" ? (
                  <div>
                    <Label htmlFor="cnpj">CNPJ</Label>
                    <DocumentInput
                      documentType="cnpj"
                      value={cnpjValue}
                      onChange={(value) => setValue("cnpj", value)}
                    />
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="cpf">CPF</Label>
                    <DocumentInput
                      documentType="cpf"
                      value={cpfValue}
                      onChange={(value) => setValue("cpf", value)}
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="state_registration">IE - Inscrição Estadual</Label>
                  <Input
                    id="state_registration"
                    {...register("state_registration")}
                    placeholder="000.000.000.000"
                  />
                </div>

                <div>
                  <Label htmlFor="municipal_registration">IM - Inscrição Municipal</Label>
                  <Input
                    id="municipal_registration"
                    {...register("municipal_registration")}
                    placeholder="000000"
                  />
                </div>

                <div>
                  <Label htmlFor="contact_name">Nome do Contato</Label>
                  <Input
                    id="contact_name"
                    {...register("contact_name")}
                    placeholder="Nome do responsável"
                  />
                </div>

                <div>
                  <Label htmlFor="phone">Telefone</Label>
                  <PhoneInput
                    value={watch("phone")}
                    onChange={(value) => setValue("phone", value)}
                  />
                </div>

                <div>
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                  <PhoneInput
                    value={watch("whatsapp")}
                    onChange={(value) => setValue("whatsapp", value)}
                  />
                </div>

                <div>
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    {...register("email")}
                    placeholder="contato@fornecedor.com"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="category">Categoria</Label>
                  <Select
                    value={watch("category") || "none"}
                    onValueChange={(value) =>
                      setValue("category", value === "none" ? "" : value)
                    }
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Selecione a categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {SUPPLIER_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2 flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={isActive}
                    onCheckedChange={(checked) => setValue("is_active", checked)}
                  />
                  <Label htmlFor="is_active">Fornecedor ativo</Label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="address" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="zip_code">CEP *</Label>
                  <div className="flex gap-2">
                    <CEPInput
                      value={zipCode}
                      onChange={(value) => setValue("zip_code", value)}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleCEPLookup}
                      disabled={isLoadingCEP || !zipCode}
                    >
                      {isLoadingCEP ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="neighborhood">Bairro</Label>
                  <Input
                    id="neighborhood"
                    {...register("neighborhood")}
                    placeholder="Bairro"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Input
                    id="address"
                    {...register("address")}
                    placeholder="Rua, Avenida"
                  />
                </div>

                <div>
                  <Label htmlFor="address_complement">Complemento</Label>
                  <Input
                    id="address_complement"
                    {...register("address_complement")}
                    placeholder="Apto, Bloco, Sala"
                  />
                </div>

                <div>
                  <Label htmlFor="city">Cidade</Label>
                  <Input id="city" {...register("city")} placeholder="Cidade" />
                </div>

                <div>
                  <Label htmlFor="state">Estado</Label>
                  <Input id="state" {...register("state")} placeholder="UF" maxLength={2} />
                </div>

                <div>
                  <Label htmlFor="ibge_code">Código IBGE</Label>
                  <Input
                    id="ibge_code"
                    {...register("ibge_code")}
                    placeholder="0000000"
                    readOnly
                    className="bg-muted"
                  />
                </div>

                <div className="col-span-2 flex items-center space-x-2">
                  <Checkbox
                    id="is_billing_address"
                    checked={isBillingAddress}
                    onCheckedChange={(checked) => setValue("is_billing_address", checked as boolean)}
                  />
                  <Label htmlFor="is_billing_address">Endereço de cobrança</Label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="commercial" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="commercial_notes">Observações Comerciais</Label>
                  <Textarea
                    id="commercial_notes"
                    {...register("commercial_notes")}
                    placeholder="Condições especiais, histórico de negociações..."
                    rows={4}
                  />
                </div>

                <div>
                  <Label htmlFor="payment_terms">Condições de Pagamento</Label>
                  <Select
                    value={watch("payment_terms")}
                    onValueChange={(value) => setValue("payment_terms", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="a_vista">À vista</SelectItem>
                      <SelectItem value="7_dias">7 dias</SelectItem>
                      <SelectItem value="14_dias">14 dias</SelectItem>
                      <SelectItem value="21_dias">21 dias</SelectItem>
                      <SelectItem value="30_dias">30 dias</SelectItem>
                      <SelectItem value="45_dias">45 dias</SelectItem>
                      <SelectItem value="60_dias">60 dias</SelectItem>
                      <SelectItem value="90_dias">90 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="delivery_time">Prazo de Entrega</Label>
                  <div className="flex gap-2">
                    <Input
                      id="delivery_time"
                      type="number"
                      {...register("delivery_time")}
                      placeholder="0"
                      className="flex-1"
                    />
                    <Select
                      value={watch("delivery_time_unit")}
                      onValueChange={(value) => setValue("delivery_time_unit", value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hours">Horas</SelectItem>
                        <SelectItem value="days">Dias</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="notes" className="space-y-4 mt-4">
              <div>
                <Label htmlFor="notes">Observações Gerais</Label>
                <Textarea
                  id="notes"
                  {...register("notes")}
                  placeholder="Informações adicionais sobre o fornecedor..."
                  rows={8}
                />
              </div>
            </TabsContent>

            <TabsContent value="financial" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="financial_notes">Observações Financeiras</Label>
                  <Textarea
                    id="financial_notes"
                    {...register("financial_notes")}
                    placeholder="Informações sobre crédito, pendências, etc..."
                    rows={4}
                  />
                </div>

                <div>
                  <Label htmlFor="credit_limit">Limite de Crédito</Label>
                  <CurrencyInput
                    value={watch("credit_limit")}
                    onChange={(v) => setValue("credit_limit", v)}
                  />
                </div>

                <div>
                  <Label htmlFor="preferred_payment_method">Forma de Pagamento Preferencial</Label>
                  <Select
                    value={watch("preferred_payment_method")}
                    onValueChange={(value) => setValue("preferred_payment_method", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="cartao">Cartão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="contacts" className="space-y-4 mt-4">
              <div className="text-center py-8 text-muted-foreground">
                <p>Funcionalidade de contatos adicionais em breve</p>
                <p className="text-sm mt-2">
                  Por enquanto, utilize os campos de contato na aba "Dados Gerais"
                </p>
              </div>
            </TabsContent>
          </Tabs>
          </div>

          <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2 bg-background">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Salvando..."
                : supplier
                ? "Salvar"
                : "Criar"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
