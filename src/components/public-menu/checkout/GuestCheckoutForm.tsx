import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DeliveryCustomer } from "@/hooks/use-delivery-customers";
import { guestCheckoutSchema } from "@/lib/validations/customer-auth";

interface GuestCheckoutFormProps {
  onConfirm: (customer: DeliveryCustomer) => void;
  onBack: () => void;
}

const formatPhone = (value: string) => {
  const n = value.replace(/\D/g, "").slice(0, 11);
  if (n.length <= 10) {
    return n.replace(/^(\d{0,2})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) =>
      [a && `(${a}`, a && a.length === 2 ? ") " : "", b, c && `-${c}`].filter(Boolean).join(""),
    );
  }
  return n.replace(/^(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3");
};

export const GuestCheckoutForm = ({ onConfirm, onBack }: GuestCheckoutFormProps) => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [document, setDocument] = useState("");
  const [documentType, setDocumentType] = useState<"CPF" | "CNPJ">("CPF");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = guestCheckoutSchema.safeParse({
      name,
      phone,
      document,
      document_type: documentType,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const cleanPhone = phone.replace(/\D/g, "");
      const cleanDoc = document.replace(/\D/g, "") || null;

      const { data: existing } = await supabase
        .from("delivery_customers")
        .select("*")
        .eq("phone", cleanPhone)
        .maybeSingle();

      let customer: DeliveryCustomer;
      if (existing) {
        const { data, error } = await supabase
          .from("delivery_customers")
          .update({
            name,
            cpf: cleanDoc,
            document_type: documentType,
          } as any)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        customer = data as DeliveryCustomer;
      } else {
        const { data, error } = await supabase
          .from("delivery_customers")
          .insert({
            name,
            phone: cleanPhone,
            cpf: cleanDoc,
            document_type: documentType,
          } as any)
          .select()
          .single();
        if (error) throw error;
        customer = data as DeliveryCustomer;
      }
      onConfirm(customer);
    } catch (err: any) {
      toast.error("Erro ao salvar dados: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="g-name">Nome *</Label>
        <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="g-phone">Telefone *</Label>
        <Input
          id="g-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          placeholder="(00) 00000-0000"
          maxLength={15}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="g-doc">Documento</Label>
          <Input id="g-doc" value={document} onChange={(e) => setDocument(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select value={documentType} onValueChange={(v) => setDocumentType(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CPF">CPF</SelectItem>
              <SelectItem value="CNPJ">CNPJ</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={loading}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <Button type="submit" className="flex-1" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Confirmar
        </Button>
      </div>
    </form>
  );
};
